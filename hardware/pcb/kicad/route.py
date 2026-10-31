"""Route lumi.kicad_pcb with Freerouting (2.x, headless), then pour ground,
stitch the pours together with vias and fill the zones.

KiCad 7's Python can export a Specctra DSN but can only import a Specctra
session from the GUI, so this reads Freerouting's .ses file itself and adds
the tracks and vias.

Usage: python3 route.py <project-dir> <freerouting-2.x.jar> [passes] [attempts]
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_board import X0, Y0, W, H, mm, rect_poly  # noqa: E402


def parse_sexpr(text):
    tokens = re.findall(r'\(|\)|"[^"]*"|[^\s()]+', text)
    stack = [[]]
    for t in tokens:
        if t == "(":
            stack.append([])
        elif t == ")":
            done = stack.pop()
            stack[-1].append(done)
        else:
            stack[-1].append(t.strip('"'))
    return stack[0][0]


def find(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def import_ses(board, ses_path):
    ses = parse_sexpr(open(ses_path).read())
    routes = find(ses, "routes")[0]
    res = find(routes, "resolution")[0]
    assert res[1] == "um", res
    scale = 1.0 / float(res[2]) / 1000.0  # session units -> mm

    def p(x, y):
        return pcbnew.VECTOR2I(mm(float(x) * scale), mm(-float(y) * scale))

    vias = {}
    for ps in find(find(routes, "library_out")[0], "padstack") if find(routes, "library_out") else []:
        m = re.search(r"_(\d+):(\d+)_um", ps[1])
        if m:
            vias[ps[1]] = (int(m.group(1)) / 1000.0, int(m.group(2)) / 1000.0)

    layers = {"F.Cu": pcbnew.F_Cu, "B.Cu": pcbnew.B_Cu}
    n_tracks = n_vias = 0
    for net in find(find(routes, "network_out")[0], "net"):
        ni = board.FindNet(net[1])
        assert ni is not None, net[1]
        for wire in find(net, "wire"):
            path = find(wire, "path")[0]
            layer, width, coords = path[1], float(path[2]) * scale, path[3:]
            pts = [p(coords[i], coords[i + 1]) for i in range(0, len(coords), 2)]
            for a, b in zip(pts, pts[1:]):
                t = pcbnew.PCB_TRACK(board)
                t.SetStart(a)
                t.SetEnd(b)
                t.SetWidth(mm(width))
                t.SetLayer(layers[layer])
                t.SetNet(ni)
                board.Add(t)
                n_tracks += 1
        for via in find(net, "via"):
            dia, drill = vias.get(via[1], (0.6, 0.3))
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(p(via[2], via[3]))
            v.SetWidth(mm(dia))
            v.SetDrill(mm(drill))
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNet(ni)
            board.Add(v)
            n_vias += 1
    return n_tracks, n_vias


def add_ground_pours(board):
    gnd = board.FindNet("GND")
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        z = pcbnew.ZONE(board)
        z.SetLayer(layer)
        z.SetNet(gnd)
        z.SetZoneName(f"GND-{board.GetLayerName(layer)}")
        z.SetLocalClearance(mm(0.25))
        z.SetMinThickness(mm(0.2))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)  # reflowed by the factory
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
        z.Outline().AddOutline(rect_poly(X0, Y0, X0 + W, Y0 + H))
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def freeroute(proj, jar, timeout=150):
    """Run Freerouting headless. Returns the session file, or None if this
    run got stuck or failed. Runs differ: a good one finishes this board in
    well under a minute, a bad one circles for ever, so the caller retries."""
    ses = os.path.join(proj, "lumi.ses")
    if os.path.exists(ses):
        os.remove(ses)
    with open(os.path.join(proj, "freerouting.log"), "w") as log:
        # The route optimiser drops segments now and then (the session file
        # then lacks tracks Freerouting reports as routed), so it's off.
        proc = subprocess.Popen(["java", "-jar", jar, "-de", "lumi.dsn", "-do", "lumi.ses",
                                 "--gui.enabled=false", "--router.optimizer.enabled=false"],
                                cwd=proj, stdout=log, stderr=subprocess.STDOUT)
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            return None
    return ses if os.path.exists(ses) else None


def stitch_ground(board, proj, pitch=1.8, keep_clear=0.3):
    """Ground vias on a grid wherever they fit, so the front and back pours
    join up instead of leaving islands. Each candidate that breaks a design
    rule is dropped (KiCad's own DRC decides)."""
    from gen_board import KEEPOUT

    gnd = board.FindNet("GND")
    blocked = [KEEPOUT]
    for fp in board.GetFootprints():
        if fp.GetReference() == "U1":
            continue  # vias under the module body are fine (tented)
        layer = pcbnew.B_CrtYd if fp.IsFlipped() else pcbnew.F_CrtYd
        bb = fp.GetCourtyard(layer).BBox()
        blocked.append((pcbnew.ToMM(bb.GetX()), pcbnew.ToMM(bb.GetY()),
                        pcbnew.ToMM(bb.GetRight()), pcbnew.ToMM(bb.GetBottom())))
    added = []
    y = Y0 + 1.0
    while y < Y0 + H - 0.9:
        x = X0 + 1.0
        while x < X0 + W - 0.9:
            if not any(a - keep_clear <= x <= c + keep_clear and b - keep_clear <= y <= d + keep_clear
                       for a, b, c, d in blocked):
                v = pcbnew.PCB_VIA(board)
                v.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
                v.SetWidth(mm(0.6))
                v.SetDrill(mm(0.3))
                v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                v.SetNet(gnd)
                board.Add(v)
                added.append(v)
            x += pitch
        y += pitch
    # KiCad 10's Python can't run the check outside its app, so it's done by
    # kicad-cli on a saved copy, next to the project file that holds the rules.
    tmp = tempfile.mkdtemp(dir=proj)
    shutil.copy(os.path.join(proj, "lumi.kicad_pro"), tmp)
    copy = os.path.join(tmp, "lumi.kicad_pcb")
    report = os.path.join(tmp, "stitch-drc.rpt")
    for _ in range(4):
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        pcbnew.SaveBoard(copy, board, True)
        subprocess.run(["kicad-cli", "pcb", "drc", "--severity-all", "--format", "report",
                        "--output", report, copy], check=True, stdout=subprocess.DEVNULL)
        bad = set()
        for m in re.finditer(r"@\(([\d.]+) mm, ([\d.]+) mm\): Via \[GND\]", open(report).read()):
            bad.add((round(float(m.group(1)), 2), round(float(m.group(2)), 2)))
        drop = [v for v in added
                if (round(pcbnew.ToMM(v.GetPosition().x), 2), round(pcbnew.ToMM(v.GetPosition().y), 2)) in bad]
        if not drop:
            break
        for v in drop:
            board.Remove(v)
            added.remove(v)
    shutil.rmtree(tmp)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    return len(added)


def run_drc(pcb, report):
    """kicad-cli's DRC with zones refilled and saved; returns the report text."""
    subprocess.run(["kicad-cli", "pcb", "drc", "--severity-all", "--refill-zones", "--save-board",
                    "--format", "report", "--output", report, pcb],
                   check=True, stdout=subprocess.DEVNULL)
    with open(report) as fh:
        return fh.read()


def unconnected(text):
    return int(re.search(r"\*\* Found (\d+) unconnected pads", text).group(1))


def tidy_copper(pcb):
    """Remove signal vias the DRC flags (dead ends, or too close to something)
    and dead-end tracks, wherever every connection survives without them.
    This edits the saved file and lets kicad-cli judge each trial, because
    KiCad 10's Python loses its types after a save and reload. Returns how
    many items went."""
    report = pcb + ".rpt"
    removed = 0
    for _ in range(12):
        drc = run_drc(pcb, report)
        with open(pcb) as fh:
            text = fh.read()
        vias = {m[:2] for m in re.findall(r"@\(([\d.]+) mm, ([\d.]+) mm\): Via \[([^\]]+)\]", drc)
                if m[2] != "GND"}
        stubs = set()
        for block in re.findall(r"\[track_dangling\].*?(?=\n\[|\n\n)", drc, flags=re.S):
            stubs |= {m[:2] for m in re.findall(r"@\(([\d.]+) mm, ([\d.]+) mm\): Track \[([^\]]+)\]", block)
                      if m[2] != "GND"}
        changed = False
        for pattern, spots, key in ((r"\t\(via\n.*?\n\t\)\n", vias, "at"),
                                    (r"\t\(segment\n.*?\n\t\)\n", stubs, "start")):
            for x, y in sorted(spots):
                want = (float(x), float(y))
                for m in re.finditer(pattern, text, flags=re.S):
                    found = re.search(rf"\({key} ([-\d.]+) ([-\d.]+)\)", m.group(0))
                    if found and (round(float(found.group(1)), 4), round(float(found.group(2)), 4)) == want:
                        trial = text[:m.start()] + text[m.end():]
                        with open(pcb, "w") as fh:
                            fh.write(trial)
                        if unconnected(run_drc(pcb, report)) == 0:
                            with open(pcb) as fh:
                                text = fh.read()
                            removed += 1
                            changed = True
                        else:
                            with open(pcb, "w") as fh:
                                fh.write(text)
                        break
        if not changed:
            break
    os.remove(report)
    return removed


def remove_stubs(board):
    """Drop track ends and vias that lead nowhere (left over when a route
    was finished in a later round). Ground is skipped: its vias connect
    through the pours."""
    removed = 0
    # Freerouting sometimes writes a segment twice (out and back), which
    # would hide a spur from the dead-end test below.
    seen = set()
    for t in list(board.GetTracks()):
        if t.GetClass() == "PCB_VIA":
            continue
        a, b = (t.GetStart().x, t.GetStart().y), (t.GetEnd().x, t.GetEnd().y)
        key = (t.GetNetCode(), t.GetLayer(), min(a, b), max(a, b))
        if a == b or key in seen:
            board.Remove(t)
            removed += 1
        else:
            seen.add(key)
    while True:
        items = [t for t in board.GetTracks() if t.GetNetname() != "GND"]
        ends = {}
        for t in items:
            pts = [t.GetPosition()] if t.GetClass() == "PCB_VIA" else [t.GetStart(), t.GetEnd()]
            for p in pts:
                ends.setdefault((t.GetNetCode(), p.x, p.y), []).append(t)

        def on_pad(net, p, layer):
            return any(pad.GetNetCode() == net and pad.IsOnLayer(layer) and pad.HitTest(p)
                       for pad in board.GetPads())

        dead = []
        for t in items:
            net = t.GetNetCode()
            if t.GetClass() == "PCB_VIA":
                p = t.GetPosition()
                layers = {o.GetLayer() for o in ends[(net, p.x, p.y)] if o is not t}
                for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
                    if on_pad(net, p, layer):
                        layers.add(layer)
                if len(layers) < 2:
                    dead.append(t)
                continue
            for p in (t.GetStart(), t.GetEnd()):
                others = [o for o in ends[(net, p.x, p.y)] if o is not t and
                          (o.GetClass() == "PCB_VIA" or o.GetLayer() == t.GetLayer())]
                if not others and not on_pad(net, p, t.GetLayer()):
                    dead.append(t)
                    break
        if not dead:
            return removed
        for t in dead:
            board.Remove(t)
        removed += len(dead)


def route_once(proj, jar, pcb):
    """One Freerouting run on the DSN in `proj`. Returns (board, unrouted)
    or None. The board is loaded fresh: the session holds every track."""
    ses = freeroute(proj, jar)
    if ses is None:
        return None
    board = pcbnew.LoadBoard(pcb)
    tracks, vias = import_ses(board, ses)
    board.BuildConnectivity()
    left = board.GetConnectivity().GetUnconnectedCount(True)
    print(f"  {tracks} track segments, {vias} vias, {left} unrouted")
    return board, left


def main(proj, jar, rounds="8"):
    pcb = os.path.join(proj, "lumi.kicad_pcb")
    dsn = os.path.join(proj, "lumi.dsn")
    unrouted = pcbnew.LoadBoard(pcb)
    # Each round starts from the unrouted board, since Freerouting's runs
    # differ a lot; keep the best.
    best = None
    for i in range(int(rounds)):
        print(f"round {i + 1}:")
        assert pcbnew.ExportSpecctraDSN(unrouted, dsn)
        result = route_once(proj, jar, pcb)
        if result is None:
            print("  Freerouting got stuck; trying again")
            continue
        if best is None or result[1] < best[1]:
            best = result
        if best[1] == 0:
            break
    if best is None:
        raise SystemExit("Freerouting never finished; see freerouting.log")
    # A few connections left: hand the best board back to finish them.
    if best[1]:
        print("finishing the best round:")
        assert pcbnew.ExportSpecctraDSN(best[0], dsn)
        result = route_once(proj, jar, pcb)
        if result is not None and result[1] < best[1]:
            best = result
    board, left = best
    stubs = remove_stubs(board)
    add_ground_pours(board)
    stitched = stitch_ground(board, proj)
    pcbnew.SaveBoard(pcb, board, True)
    tidied = tidy_copper(pcb)
    left = unconnected(run_drc(pcb, pcb + ".rpt"))
    os.remove(pcb + ".rpt")
    print(f"removed {stubs} dead-end stubs and {tidied} flagged items, "
          f"added {stitched} ground-stitching vias, {left} unrouted")
    for f in (dsn, os.path.join(proj, "lumi.ses")):
        if os.path.exists(f):
            os.remove(f)
    if left:
        raise SystemExit(f"{left} connections left unrouted")


if __name__ == "__main__":
    main(*sys.argv[1:])
