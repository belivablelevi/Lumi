"""Export what the case has to fit around, for modelling it in Blender
(or any 3D tool): the board, every part's box and height, the screen glass
and its cable, the battery, the USB-C and switch openings, and the antenna
keep-out. Writes:

  <out>/lumi_pcb_v1_refs.json  boxes and outlines; read by lumi_refs.py
  <out>/lumi_pcb_v1_refs.obj   the same boxes, for File > Import > OBJ
  <out>/lumi_pcb_v1_refs.mtl   colours for the OBJ

Axes (Blender's): millimetres; X to the right seen from the front, Z up
toward the keyring, -Y toward the viewer. The board's centre is X = Z = 0
and its front face is Y = 0, so the screen glass sits at negative Y and
the parts and battery at positive Y. Front view (numpad 1) shows the face.

Usage: python3 case_refs.py <project-dir> <out-dir>
"""

import json
import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402
from fab import HEIGHTS  # noqa: E402
from gen_board import H, KEEPOUT, W, X0, Y0  # noqa: E402

CX, CY = X0 + W / 2, Y0 + H / 2
PCB_T = 1.0

# Plug-in OLED, BuyDisplay ER-OLED0.96-1 (outline from the listing; the
# active-area position and cable size are typical values: VERIFY against
# the panel's drawing).
GLASS = (26.70, 19.26, 1.45)
ACTIVE = (21.74, 10.86)
ACTIVE_UP = 1.0      # active area's centre above the glass centre (approx.)
FPC_W = 12.0         # cable width (approx.)
FPC_BEND = 0.8       # bend radius around the board's bottom edge (approx.)
BATTERY = (30.2, 30.2, 5.4)  # 503030 pouch with swelling allowance
CLEAR = 0.3          # gap between the tallest part and the battery

# Today's printed case (hardware/enclosure/lumi_case.scad), for comparison.
CASE_OUTER = (35.0, 37.0, 7.0)   # width, height, corner radius
CASE_WALL = 1.4

KIND = {
    "U1": "module", "U2": "chip", "U3": "chip", "U4": "chip", "D1": "chip",
    "J1": "connector", "J2": "connector", "SW1": "switch",
}


def bx(x, y):
    """Board coordinates (mm, KiCad, y down) -> Blender X, Z."""
    return x - CX, CY - y


def box(name, kind, x1, x2, y1, y2, z1, z2, note=""):
    lo = [min(x1, x2), min(y1, y2), min(z1, z2)]
    hi = [max(x1, x2), max(y1, y2), max(z1, z2)]
    out = {"name": name, "kind": kind, "min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    if note:
        out["note"] = note
    return out


def footprint_extent(fp):
    """Body outline (fab layer) plus pads, in board coordinates."""
    fab = pcbnew.B_Fab if fp.IsFlipped() else pcbnew.F_Fab
    bb = None
    for item in list(fp.GraphicalItems()) + list(fp.Pads()):
        if item.GetClass() == "PAD" or (item.GetLayer() == fab and item.GetClass() != "FP_TEXT"):
            b = item.GetBoundingBox()
            if bb is None:
                bb = b
            else:
                bb.Merge(b)
    return [pcbnew.ToMM(v) for v in (bb.GetX(), bb.GetY(), bb.GetRight(), bb.GetBottom())]


def rounded_rect(w, h, r, n=8):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append([round(cx + r * math.cos(a), 3), round(cz + r * math.sin(a), 3)])
    return pts


def outside_rounded_rect(x, z, w, h, r):
    """Is point (x, z) outside a rounded rectangle centred on the origin?"""
    dx, dz = abs(x) - (w / 2 - r), abs(z) - (h / 2 - r)
    if dx <= 0 or dz <= 0:
        return abs(x) > w / 2 or abs(z) > h / 2
    return math.hypot(dx, dz) > r


def main(proj, out):
    os.makedirs(out, exist_ok=True)
    board = pcbnew.LoadBoard(os.path.join(proj, "lumi.kicad_pcb"))
    by_ref = {p.ref: p for p in design.PARTS}
    items = [box("PCB", "board", -W / 2, W / 2, 0, PCB_T, -H / 2, H / 2,
                 f"{W:g} x {H:g} mm, {PCB_T:g} mm thick, 2 layers")]

    tallest = 0.0
    centres = {}
    for fp in sorted(board.GetFootprints(), key=lambda f: f.GetReference()):
        ref = fp.GetReference()
        part = by_ref[ref]
        x1, y1, x2, y2 = footprint_extent(fp)
        (ax1, az1), (ax2, az2) = bx(x1, y1), bx(x2, y2)
        h = HEIGHTS[part.footprint]
        if fp.IsFlipped():
            ylo, yhi = PCB_T, PCB_T + max(h, 0.05)
            tallest = max(tallest, h)
        else:
            ylo, yhi = -max(h, 0.05), 0
        kind = KIND.get(ref, "test pad" if ref.startswith("TP") else
                        "battery pad" if ref.startswith("BT") else "passive")
        items.append(box(f"{ref} {part.value}", kind, ax1, ax2, ylo, yhi, az1, az2,
                         part.note))
        centres[ref] = bx(pcbnew.ToMM(fp.GetPosition().x), pcbnew.ToMM(fp.GetPosition().y))

    # Screen glass on the front, its active area, and the cable wrapping
    # round the bottom edge to J2 on the back.
    gw, gh, gt = GLASS
    items.append(box("OLED glass", "screen", -gw / 2, gw / 2, -gt, 0, -gh / 2, gh / 2,
                     "BuyDisplay ER-OLED0.96-1, 26.70 x 19.26 x 1.45 mm"))
    aw, ah = ACTIVE
    items.append(box("OLED active area (approx.)", "screen-active", -aw / 2, aw / 2, -gt - 0.01, -gt,
                     ACTIVE_UP - ah / 2, ACTIVE_UP + ah / 2,
                     "Where the pixels are; size 21.74 x 10.86 mm, position VERIFY"))
    j2 = [i for i in items if i["name"].startswith("J2 ")][0]
    zb = -H / 2
    items += [
        box("OLED cable, front run", "screen-cable", -FPC_W / 2, FPC_W / 2, -0.3, 0, zb, -gh / 2,
            "Approximate: check the panel drawing"),
        box("OLED cable, bend", "screen-cable", -FPC_W / 2, FPC_W / 2, -0.3, PCB_T + 0.3,
            zb - FPC_BEND - 0.3, zb, "Leave room for the bend below the board"),
        box("OLED cable, back run", "screen-cable", -FPC_W / 2, FPC_W / 2, PCB_T, PCB_T + 0.3,
            zb - FPC_BEND, j2["min"][2], ""),
    ]

    # Battery behind the parts.
    bw, bh, bt = BATTERY
    y0 = PCB_T + tallest + CLEAR
    items.append(box("Battery 503030", "battery", -bw / 2, bw / 2, y0, y0 + bt, -bh / 2, bh / 2,
                     "Protected LiPo pouch; wires to BT1 (+) and BT2 (-) at the top left, seen from the front"))

    # Openings and clearances in the case.
    ux, uz = centres["J1"]
    usb_mid = PCB_T + HEIGHTS[design.J1.footprint] / 2
    left = -W / 2
    items += [
        box("USB-C opening", "opening", left - 2.5, left + 0.2, usb_mid - 1.8, usb_mid + 1.8, uz - 4.7, uz + 4.7,
            "Receptacle mouth is flush with the board edge"),
        box("USB-C plug clearance", "clearance", left - 14.5, left - 2.5, usb_mid - 3.3, usb_mid + 3.3,
            uz - 6.3, uz + 6.3, "Typical plug overmould 12.4 x 6.5 mm"),
    ]
    sx, sz = centres["SW1"]
    right = W / 2
    items.append(box("Switch lever slot", "opening", right - 0.6, right + 2.5, PCB_T, PCB_T + 1.6,
                     sz - 2.4, sz + 2.4, "Lever pokes ~1 mm past the board edge and slides 1.5 mm each way"))

    # Antenna: nothing metal here, on either side of the board, nor above it.
    kx1, kz1 = bx(KEEPOUT[0], KEEPOUT[1])
    kx2, kz2 = bx(KEEPOUT[2], KEEPOUT[3])
    items.append(box("Antenna keep-out", "keepout", kx1, kx2 + 3, -6, 14, kz2, kz1 + 5,
                     "No metal, battery, screws or magnets; the case wall here must be plain plastic"))

    # Checks against today's case shape and the plan's depth.
    warnings = []
    ow, oh, orad = CASE_OUTER
    iw, ih, irad = ow - 2 * CASE_WALL, oh - 2 * CASE_WALL, orad - CASE_WALL
    corners = {"PCB corner": (W / 2, H / 2)}
    u1 = [i for i in items if i["name"].startswith("U1 ")][0]
    corners["module corner"] = (max(abs(u1["min"][0]), abs(u1["max"][0])), u1["max"][2])
    for name, (x, z) in corners.items():
        if outside_rounded_rect(x, z, iw, ih, irad):
            warnings.append(f"The {name} doesn't fit inside today's case corners "
                            f"(inside {iw:g} x {ih:g} mm, {irad:g} mm radius). Use a smaller corner "
                            f"radius (about 4 mm outside) or round the board's corners.")
    batt = [i for i in items if i["kind"] == "battery"][0]
    if batt["max"][2] > kz2:
        warnings.append(f"The battery reaches {batt['max'][2] - kz2:.1f} mm into the antenna zone; "
                        "expect some loss of range. A shorter cell, or a taller case with the battery "
                        "below the antenna, avoids it.")
    depth = 2 * CASE_WALL + gt + PCB_T + tallest + CLEAR + bt + 0.4
    if depth > 12.5:
        warnings.append(f"Inside stack is about {depth:.1f} mm deep with walls, not the plan's 12.5 mm.")

    doc = {
        "about": "Lumi PCB v1 (DRAFT) reference geometry for designing its case. Generated by "
                 "hardware/pcb/kicad/case_refs.py from the KiCad board; don't edit by hand.",
        "units": "mm",
        "axes": "X right (seen from the front), Z up toward the keyring, -Y toward the viewer. "
                "Origin: board centre, board front face at Y = 0.",
        "boxes": items,
        "outlines": {
            "today's case, outside": rounded_rect(ow, oh, orad),
            "today's case, inside": rounded_rect(iw, ih, irad),
        },
        "stack_depth_mm": round(depth, 2),
        "warnings": warnings,
    }
    with open(os.path.join(out, "lumi_pcb_v1_refs.json"), "w") as fh:
        json.dump(doc, fh, indent=1)
    write_obj(doc, out)
    print(f"wrote {out}/lumi_pcb_v1_refs.json and .obj: {len(items)} boxes, {len(warnings)} warnings")
    for w in warnings:
        print("  !", w)


COLOURS = {
    "board": (0.10, 0.35, 0.18), "module": (0.75, 0.75, 0.78), "chip": (0.12, 0.12, 0.12),
    "connector": (0.85, 0.85, 0.85), "switch": (0.25, 0.25, 0.25), "passive": (0.55, 0.42, 0.30),
    "test pad": (0.85, 0.70, 0.25), "battery pad": (0.85, 0.70, 0.25), "screen": (0.05, 0.05, 0.08),
    "screen-active": (0.20, 0.85, 0.95), "screen-cable": (0.90, 0.55, 0.10),
    "battery": (0.30, 0.45, 0.80), "opening": (1.00, 0.50, 0.00), "clearance": (1.00, 0.80, 0.30),
    "keepout": (1.00, 0.10, 0.10),
}


def write_obj(doc, out):
    """OBJ is Y-up: OBJ (x, y, z) = Blender (X, Z, -Y). Blender's importer
    turns it back. Values are millimetres: set the scene's unit scale to
    0.001 (lumi_refs.py does) or scale the import by 0.001."""
    lines = ["# Lumi PCB v1 case references (mm). See lumi_pcb_v1_refs.json.", "mtllib lumi_pcb_v1_refs.mtl"]
    v = 0
    for b in doc["boxes"]:
        (x1, y1, z1), (x2, y2, z2) = b["min"], b["max"]
        lines.append(f"o {b['name'].replace(' ', '_')}")
        lines.append(f"usemtl {b['kind'].replace(' ', '_')}")
        for x in (x1, x2):
            for y in (y1, y2):
                for z in (z1, z2):
                    lines.append(f"v {x:g} {z:g} {-y:g}")
        f = [(1, 2, 4, 3), (5, 7, 8, 6), (1, 5, 6, 2), (3, 4, 8, 7), (1, 3, 7, 5), (2, 6, 8, 4)]
        for a, b_, c, d in f:
            lines.append(f"f {v + a} {v + b_} {v + c} {v + d}")
        v += 8
    for name, pts in doc["outlines"].items():
        lines.append(f"o {name.replace(' ', '_').replace(',', '').replace(chr(39), '')}")
        for x, z in pts:
            lines.append(f"v {x:g} {z:g} 0")
        n = len(pts)
        lines.append("l " + " ".join(str(v + i + 1) for i in range(n)) + f" {v + 1}")
        v += n
    with open(os.path.join(out, "lumi_pcb_v1_refs.obj"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    mtl = []
    for kind, (r, g, b) in COLOURS.items():
        mtl += [f"newmtl {kind.replace(' ', '_')}", f"Kd {r} {g} {b}",
                "d 0.35" if kind in ("keepout", "opening", "clearance") else "d 1", ""]
    with open(os.path.join(out, "lumi_pcb_v1_refs.mtl"), "w") as fh:
        fh.write("\n".join(mtl))


if __name__ == "__main__":
    main(*sys.argv[1:])
