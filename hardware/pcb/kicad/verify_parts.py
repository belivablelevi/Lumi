"""Double-check every part with an LCSC number against the factory's own data.

For each part in design.py it fetches the footprint and symbol JLCPCB
assembles from (LCSC's, via EasyEDA's component API) and JLCPCB's parts
library entry, and compares them with ours:

  value      for resistors and capacitors, the value in JLCPCB's description
             must be the value in design.py (a wrong LCSC number is easy to
             miss and nothing else would catch it)
  footprint  every pad's centre and size. The two pad patterns are lined up
             (all four rotations, mirrored or not, then the average offset
             taken out); pads more than 0.1 mm apart, missing pads, missing
             peg holes or a pattern that only fits mirrored are FIXes. Smaller
             differences (pad sizes, 0.05-0.1 mm, the rotation and origin
             offset JLCPCB's placement preview may show) are notes.
  pins       our pin names (design.py) against the symbol's, where the
             symbol names its pins
  stock      JLCPCB's stock, Basic or Extended (each Extended part type adds a
             loading fee per order) and the price for one

Writes fab/parts-check.txt. Needs the network and KiCad's Python (pcbnew).
build.sh doesn't run it, because the parts library changes over time.

Usage: python verify_parts.py [out-file]
"""

import itertools
import json
import math
import os
import re
import sys
import tempfile
import time
import urllib.request

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402
from gen_board import FP_DIRS, stock_footprints  # noqa: E402

UNIT = 0.254          # EasyEDA's unit (10 mil) in mm
NOTE_TOL = 0.05       # pad centres further apart than this get a note
FIX_TOL = 0.10        # ... and further than this, a fix
SIZE_TOL = 0.15
LOW_STOCK = 100
UA = {"User-Agent": "Mozilla/5.0 (Lumi PCB parts check)"}
JLC_SEARCH = "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList"

# Footprint differences a person has looked at and accepted, by LCSC number.
# They're reported as notes with the reason, not as FIXes.
REVIEWED = {
    "C110926": "KiCad's LGA-12 pads sit 0.11 mm further under the part than LCSC's. Both "
               "patterns are the same size and both overlap the LIS2DH12's 2 x 2 mm lands, so "
               "either solders; KiCad's stays inside the package outline.",
    "C165948": "Measured from the peg holes, KiCad's HRO footprint has the shell slots within "
               "0.03 mm of LCSC's; its signal pads are centred 0.18 mm further out and 0.15 mm "
               "longer (1.45 vs 1.3 mm), so they still cover the leads. Its peg holes are "
               "0.65 mm, LCSC's 0.6 mm.",
}


def fetch_json(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(3):
        try:
            # EasyEDA refuses a GET that claims a JSON body, so only POSTs say so.
            headers = {**UA, "Content-Type": "application/json"} if data else UA
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(30 * (attempt + 1))


CACHE = os.path.join(tempfile.gettempdir(), "lumi-parts-check")


def lcsc_component(code):
    """LCSC's footprint and symbol. Cached for a day: EasyEDA's API refuses
    (403) for a while when it's asked too often."""
    path = os.path.join(CACHE, code + ".json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 86400:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    time.sleep(3)
    result = fetch_json(f"https://easyeda.com/api/products/{code}/components?version=6.4.19.5")["result"]
    os.makedirs(CACHE, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(result, fh)
    return result


def jlc_part(code):
    found = fetch_json(JLC_SEARCH, {"keyword": code, "currentPage": 1, "pageSize": 5})
    for c in found["data"]["componentPageInfo"]["list"] or []:
        if c.get("componentCode") == code:
            return c
    return None


# ---------------------------------------------------------------- values

SCALE = {"p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3, "M": 1e6}


def parse_value(text):
    """'4.7k' / '390kΩ' / '2.2uF' / '100nF' -> number, or None."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*([pnuµmkKM]?)\s*(?:Ω|ohm|F)?", text)
    return float(m.group(1)) * SCALE[m.group(2)] if m else None


def described_value(describe, unit):
    m = re.search(r"(\d+(?:\.\d+)?)\s*([pnuµmkKM]?)" + ("Ω" if unit == "ohm" else "F"), describe)
    return float(m.group(1)) * SCALE[m.group(2)] if m else None


# ---------------------------------------------------------------- pads

def their_pads(comp):
    """LCSC footprint -> (pads, holes, origin). Pads are (number, x, y, w, h) in
    mm with y down; holes are (x, y, diameter)."""
    data = comp["packageDetail"]["dataStr"]
    ox, oy = float(data["head"]["x"]), float(data["head"]["y"])
    pads, holes = [], []
    for shape in data["shape"]:
        f = shape.split("~")
        if f[0] == "PAD":
            # Polygon pads carry their outline; for other shapes the points
            # field holds something else (an oval's slot), so use the size.
            pts = [float(v) for v in f[10].split()] if f[1] == "POLYGON" and f[10].strip() else []
            if len(pts) >= 4:
                w, h = max(pts[0::2]) - min(pts[0::2]), max(pts[1::2]) - min(pts[1::2])
            else:
                w, h = float(f[4]), float(f[5])
                if f[11] and round(float(f[11])) % 180 == 90:
                    w, h = h, w
            pads.append((f[8], (float(f[2]) - ox) * UNIT, (float(f[3]) - oy) * UNIT, w * UNIT, h * UNIT))
        elif f[0] == "HOLE":
            holes.append(((float(f[1]) - ox) * UNIT, (float(f[2]) - oy) * UNIT, 2 * float(f[3]) * UNIT))
    return pads, holes


def our_pads(footprint):
    lib, name = footprint.split(":")
    fp = pcbnew.FootprintLoad(os.path.join(FP_DIRS.get(lib, stock_footprints()), lib + ".pretty"), name)
    if fp is None:
        raise SystemExit(f"footprint not found: {footprint}")
    pads, holes = [], []
    for p in fp.Pads():
        x, y = pcbnew.ToMM(p.GetPosition().x), pcbnew.ToMM(p.GetPosition().y)
        if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
            holes.append((x, y, pcbnew.ToMM(p.GetDrillSize().x)))
            continue
        bb = p.GetBoundingBox()
        pads.append((p.GetNumber(), x, y, pcbnew.ToMM(bb.GetWidth()), pcbnew.ToMM(bb.GetHeight())))
    return pads, holes


def transform(x, y, rot, mirror):
    if mirror:
        x = -x
    a = math.radians(rot)
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


def match(ours, theirs):
    """Pair each of our pads with the nearest of theirs (same frame)."""
    pairs = []
    for pad in ours:
        near = min(theirs, key=lambda q: math.hypot(q[1] - pad[1], q[2] - pad[2]))
        pairs.append((pad, near))
    return pairs


def compare_footprints(ours, theirs):
    """Lines their pads up on ours. Returns (fixes, notes, summary)."""
    (op, oh), (tp, th) = ours, theirs
    best = None
    for rot, mirror in itertools.product((0, 90, 180, 270), (False, True)):
        t = []
        for n, x, y, w, h in tp:
            tx, ty = transform(x, y, rot, mirror)
            if rot % 180:
                w, h = h, w
            t.append((n, tx, ty, w, h))
        # Take out the average offset (their origin may sit elsewhere), twice:
        # the first pass pairs pads roughly, the second refines.
        dx = dy = 0.0
        for _ in range(3):
            shifted = [(n, x - dx, y - dy, w, h) for n, x, y, w, h in t]
            pairs = match(op, shifted)
            dx += sum(q[1] - p[1] for p, q in pairs) / len(pairs)
            dy += sum(q[2] - p[2] for p, q in pairs) / len(pairs)
        shifted = [(n, x - dx, y - dy, w, h) for n, x, y, w, h in t]
        pairs = match(op, shifted)
        worst = max(math.hypot(q[1] - p[1], q[2] - p[2]) for p, q in pairs)
        unused = [q for q in shifted if all(q is not p[1] for p in pairs)]
        score = (len(unused), round(worst, 3))
        if best is None or score < best["score"]:
            best = {"score": score, "rot": rot, "mirror": mirror, "pairs": pairs, "unused": unused,
                    "worst": worst, "shift": (-dx, -dy),
                    "holes": [(transform(x, y, rot, mirror), d) for x, y, d in th], "dxy": (dx, dy)}
    fixes, notes = [], []
    if best["mirror"]:
        fixes.append("matches LCSC's footprint only when mirrored: check which side is pin 1")
    for pad, near in best["pairs"]:
        d = math.hypot(near[1] - pad[1], near[2] - pad[2])
        name = pad[0] or "(mount)"
        if d > FIX_TOL:
            fixes.append(f"pad {name} is {d:.2f} mm from LCSC's pad {near[0]}")
        elif d > NOTE_TOL:
            notes.append(f"pad {name} is {d:.2f} mm from LCSC's (a slightly different land pattern)")
        if abs(pad[3] - near[3]) > SIZE_TOL or abs(pad[4] - near[4]) > SIZE_TOL:
            notes.append(f"pad {name} is {pad[3]:.2f} x {pad[4]:.2f} mm, LCSC's {near[3]:.2f} x {near[4]:.2f}")
    for q in best["unused"]:
        fixes.append(f"LCSC has a pad {q[0]} that ours lacks")
    def same(a, b):
        if a.isdigit() and b.isdigit():
            return a == b
        return a in b or b in a

    pairs = [(str(p[0]), str(q[0])) for p, q in best["pairs"] if p[0] and q[0]]
    numeric = [(int(a), int(b)) for a, b in pairs if a.isdigit() and b.isdigit()]
    numbering = [(a, b) for a, b in pairs if not same(a, b)]
    if numeric and any(a != b for a, b in numeric):
        n = max(a for a, _ in numeric)
        if all(a + b == n + 1 for a, b in numeric):
            notes.append(f"pads numbered from the other end (our 1 = LCSC's {n}); the pads "
                         "themselves line up, which is what the factory places by")
            numbering = [(a, b) for a, b in numbering if not (a.isdigit() and b.isdigit())]
    named = [(a, b) for a, b in numbering if not (a.isdigit() and b.isdigit())]
    if named:
        notes.append("mounting/shield pads named differently (ours->LCSC): "
                     + ", ".join(f"{a}->{b}" for a, b in named[:6]))
        numbering = [x for x in numbering if x not in named]
    if numbering:
        fixes.append("pad numbers differ (ours->LCSC): " + ", ".join(f"{a}->{b}" for a, b in numbering[:10]))
    dx, dy = best["dxy"]
    for (hx, hy), dia in best["holes"]:
        hx, hy = hx - dx, hy - dy
        if not any(math.hypot(x - hx, y - hy) <= FIX_TOL for x, y, _ in oh):
            fixes.append(f"LCSC has a {dia:.2f} mm hole at ({hx:.2f}, {hy:.2f}) that ours lacks")
    if len(oh) > len(best["holes"]):
        notes.append(f"ours has {len(oh)} holes, LCSC's {len(best['holes'])}")
    sx, sy = best["shift"]
    summary = (f"{len(best['pairs'])} pads line up (worst {best['worst']:.3f} mm) with LCSC's turned "
               f"{best['rot']} degrees{', mirrored' if best['mirror'] else ''}")
    if best["rot"]:
        notes.append(f"LCSC's footprint is turned {best['rot']} degrees from ours: JLCPCB's placement "
                     "preview may show this part turned; turn it back to match the silkscreen")
    if math.hypot(sx, sy) > 0.05:
        notes.append(f"origins {math.hypot(sx, sy):.2f} mm apart: JLCPCB's preview may show the part "
                     "shifted by that much; nudge it onto its pads")
    return fixes, notes, summary


# ---------------------------------------------------------------- pins

def their_pin_names(comp):
    names = {}
    for shape in comp["dataStr"]["shape"]:
        if shape.startswith("P~"):
            seg = shape.split("^^")
            num = seg[0].split("~")[3]
            names[num] = seg[3].split("~")[4] if len(seg) > 3 else ""
    return names


def norm(s):
    return "".join(c for c in s.upper() if c.isalnum())


def compare_pins(part, theirs):
    """None if LCSC's symbol has no pin names, else a list of mismatches."""
    if not part.names or all(not norm(n) or norm(n) == norm(k) or norm(n).isdigit()
                             for k, n in theirs.items()):
        return None
    bad = []
    for pad, ours in part.names.items():
        tn = theirs.get(pad)
        if tn is None:
            continue
        a, b = norm(ours), norm(tn)
        alts = {norm(x) for x in re.split(r"[/\\]", tn)} | {b}
        alts |= {norm(x) for x in re.split(r"[/\\]", ours)}
        if not (a in alts or b in alts or (a and b and (a in b or b in a))
                or {a, b} <= {"GND", "VSS", "EP", "EPAD"} or a == "NC" == b):
            bad.append(f"pin {pad}: ours {ours}, LCSC's {tn}")
    return bad


# ---------------------------------------------------------------- report

def main(out=None):
    out = out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "fab", "parts-check.txt")
    groups = {}
    for p in design.PARTS:
        if p.lcsc:
            groups.setdefault((p.lcsc, p.footprint, p.value), []).append(p)
    lines = [f"Lumi PCB parts check, {time.strftime('%Y-%m-%d')}",
             "Generated by hardware/pcb/kicad/verify_parts.py against JLCPCB's parts library and "
             "LCSC's footprints. FIX = must change before ordering; note = worth knowing.", ""]
    fixes_total, extended = 0, []
    for (code, footprint, value), parts in groups.items():
        refs = ",".join(p.ref for p in parts)
        part = parts[0]
        comp = lcsc_component(code)
        jlc = jlc_part(code)
        fixes, notes = [], []
        lines.append(f"{refs}  {value}  {code}  ({footprint})")
        if jlc is None:
            fixes.append("not in JLCPCB's parts library")
        else:
            kind = {"base": "Basic", "expand": "Extended"}.get(jlc.get("componentLibraryType"),
                                                                jlc.get("componentLibraryType"))
            prices = jlc.get("componentPrices") or []
            lines.append(f"  {jlc.get('componentModelEn')}: {kind}, JLCPCB stock {jlc.get('stockCount')}"
                         + (f", ${prices[0]['productPrice']:.4f} each" if prices else ""))
            lines.append(f"  {(jlc.get('describe') or '').replace(' ROHS', '')}")
            if kind == "Extended":
                extended.append(part.ref if len(parts) == 1 else refs)
            if (jlc.get("stockCount") or 0) < LOW_STOCK:
                fixes.append(f"only {jlc.get('stockCount')} in stock at JLCPCB")
            if part.ref[0] in "RC" and part.footprint in (design.R0402, design.C0402, design.C0603):
                want = parse_value(value)
                got = described_value(jlc.get("describe") or "", "ohm" if part.ref[0] == "R" else "F")
                if got is None or abs(got - want) > want * 1e-6:
                    fixes.append(f"value: design.py says {value}, this part number is "
                                 f"{jlc.get('describe', '').split(' ')[1] if part.ref[0] == 'R' else got}")
                else:
                    lines.append(f"  value {value} matches")
        f_fixes, f_notes, summary = compare_footprints(our_pads(footprint), their_pads(comp))
        lines.append(f"  footprint: {summary}")
        if f_fixes and code in REVIEWED:
            notes.append(f"reviewed: {REVIEWED[code]} ({len(f_fixes)} pad differences)")
        else:
            fixes += f_fixes
        notes += f_notes
        bad = compare_pins(part, their_pin_names(comp))
        if bad is None:
            lines.append("  pins: LCSC's symbol has numbers only")
        elif not bad:
            lines.append("  pins: names match LCSC's symbol")
        else:
            fixes += bad
        lines += [f"  FIX {x}" for x in fixes] + [f"  note: {x}" for x in dict.fromkeys(notes)]
        fixes_total += len(fixes)
        lines.append("")
    lines.append(f"Extended part types ({len(extended)}, each adds JLCPCB's loading fee per order): "
                 + "; ".join(extended))
    lines.append(f"{fixes_total} thing(s) to FIX." if fixes_total else "Nothing to fix.")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print("wrote", out)
    return 1 if fixes_total else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
