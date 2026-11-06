"""Build lumi.kicad_pcb from design.py: outline, parts, nets, keep-outs.

Routing is done afterwards by route.py (Freerouting), then zones are filled.

Coordinates are millimetres in KiCad's view (looking at the FRONT of the
board, y down). The board is 31 x 33 mm with its top-left corner at
(100, 100). Every part sits on the BACK; the front is flat for the screen
glass and carries only copper, test pads and silkscreen.

Usage: python3 gen_board.py <out-dir>
"""

import json
import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FP_DIRS = {"lumi": HERE}  # library name -> folder holding <name>.pretty

X0, Y0, W, H = 100.0, 100.0, 31.0, 33.0

# Rounded board corners, so the board fits inside the case's 6 mm corners
# (4.6 mm on the inside, 0.6 mm from the board all round).
CORNER_R = 4.0

# The module (ESP32-C3-MINI-1, 13.2 x 16.6 mm) sits at the top right seen from
# the front, away from the metal split ring at the top centre. Its top edge is
# the board's top edge and its right edge is 2.2 mm in, so its square corner
# still fits the case's rounded corner. The 5.4 mm antenna strip at the top of
# the module has no board under it: Espressif's layout guide recommends
# cutting the base board away there.
U1_AT = (122.2, 111.0)                 # footprint origin (the pad pattern's centre)
ANTENNA_BOTTOM = U1_AT[1] - 5.6        # 105.4: where the antenna meets the shield can
NOTCH = (U1_AT[0] - 6.6, Y0, X0 + W, ANTENNA_BOTTOM)

# ref -> (x, y, orientation, side). Orientation is KiCad's value for the
# footprint *after* it has been flipped to the back: 180 keeps the part
# mirrored left-to-right only (antenna stays at the top), 0 mirrors it
# top-to-bottom.
PLACE = {
    # Module: antenna at the keyring (top) edge.
    "U1": (*U1_AT, 180, "B"),
    # Right of the module, beside the pins they serve: the 3.3 V capacitors
    # next to the 3V3 pin (pin 3, y 108.6), the GPIO2 strap next to IO2
    # (pin 5, y 110.2), and the enable RC next to EN (pin 8, y 112.6).
    "C5": (129.9, 106.7, 90, "B"),
    "C6": (129.9, 108.7, 90, "B"),
    "R12": (129.9, 110.7, 90, "B"),
    "R11": (129.9, 112.7, 90, "B"),
    "C8": (129.9, 114.7, 90, "B"),
    # USB-C, opening on the left edge (seen from the front).
    "J1": (103.7, 113.2, 90, "B"),
    # Between the USB-C and the module: CC resistors and the ESD part, on the
    # short path from the socket to the module's D-/D+ pins (left side).
    "R2": (109.6, 111.3, 90, "B"),
    "R1": (109.6, 114.6, 90, "B"),
    "D1": (112.9, 113.8, 90, "B"),
    # Top left, clear of the antenna: battery pads, charger, USB sense.
    "BT1": (104.9, 101.7, 0, "B"),
    "BT2": (107.6, 101.7, 0, "B"),
    "U3": (111.2, 102.3, 0, "B"),
    "C1": (109.6, 105.4, 90, "B"),
    "C2": (110.9, 105.4, 90, "B"),
    "R3": (112.2, 105.4, 90, "B"),
    "R7": (102.6, 106.9, 0, "B"),
    "R8": (105.0, 106.9, 0, "B"),
    # Left strip under the USB-C: the 3.3 V regulator and battery divider.
    "U4": (102.8, 121.2, 90, "B"),
    "C3": (101.6, 124.3, 90, "B"),
    "C4": (103.4, 124.3, 90, "B"),
    "R5": (101.6, 126.6, 90, "B"),
    "R6": (103.4, 126.6, 90, "B"),
    "C9": (102.5, 128.6, 0, "B"),
    # Strip between the module and the ZIF.
    "R13": (110.1, 121.1, 0, "B"),
    "R9": (113.0, 121.1, 0, "B"),
    "U2": (115.6, 122.5, 0, "B"),
    "C7": (118.0, 121.1, 0, "B"),
    "C13": (120.5, 121.1, 0, "B"),
    # Screen parts sit above the J2 pins they serve: panel pin N is at
    # x = 108.25 + (N - 1) * 0.5.
    "C11": (107.3, 123.9, 0, "B"),
    "C10": (109.3, 123.9, 0, "B"),
    "C15": (111.3, 123.9, 0, "B"),
    "C14": (113.3, 123.9, 0, "B"),
    "R10": (117.9, 123.9, 0, "B"),
    "R15": (119.8, 123.9, 0, "B"),
    "C12": (122.3, 123.9, 0, "B"),
    # Screen ZIF, opening toward the bottom edge where the panel's cable
    # wraps around from the front.
    "J2": (115.5, 128.6, 180, "B"),
    # Slide switch, lever out of the right edge.
    "SW1": (128.65, 121.45, 270, "B"),
    # Front test pads along the bottom, below the screen glass and either
    # side of the screen cable.
    "TP1": (102.4, 130.0, 0, "F"),
    "TP2": (104.4, 130.0, 0, "F"),
    "TP3": (106.4, 130.0, 0, "F"),
    "TP4": (124.6, 130.0, 0, "F"),
    "TP5": (126.6, 130.0, 0, "F"),
    "TP6": (128.6, 130.0, 0, "F"),
    "TP7": (125.6, 132.1, 0, "F"),
}

# Test pad labels, as (x, y) offsets from the pad.
TP_LABEL = {**{f"TP{i}": (0, 1.07) for i in range(1, 7)}, "TP7": (1.9, 0)}

# Antenna keep-out: no copper on either layer beside or above the antenna,
# for the module's width plus 2 mm on the board side.
KEEPOUT = (NOTCH[0] - 2.0, Y0, X0 + W, ANTENNA_BOTTOM)

NETCLASSES = {
    "Default": {"track_width": 0.15, "clearance": 0.13, "via_diameter": 0.6, "via_drill": 0.3},
    "Power": {"track_width": 0.3, "clearance": 0.13, "via_diameter": 0.6, "via_drill": 0.3},
}


def mm(v):
    return pcbnew.FromMM(v)


def pt(x, y):
    return pcbnew.VECTOR2I(mm(x), mm(y))


def outline_path():
    """The board edge as straight runs and corner arcs, clockwise from the top
    left (KiCad's y points down): [("line", a, b) | ("arc", start, mid, end)]."""
    nx, _, _, ny = NOTCH
    r = CORNER_R
    x1, y1, x2, y2 = X0, Y0, X0 + W, Y0 + H
    s = r * (1 - math.sqrt(0.5))  # how far an arc's midpoint is in from the corner
    return [
        ("arc", (x1, y1 + r), (x1 + s, y1 + s), (x1 + r, y1)),
        ("line", (x1 + r, y1), (nx, y1)),
        ("line", (nx, y1), (nx, ny)),
        ("line", (nx, ny), (x2, ny)),
        ("line", (x2, ny), (x2, y2 - r)),
        ("arc", (x2, y2 - r), (x2 - s, y2 - s), (x2 - r, y2)),
        ("line", (x2 - r, y2), (x1 + r, y2)),
        ("arc", (x1 + r, y2), (x1 + s, y2 - s), (x1, y2 - r)),
        ("line", (x1, y2 - r), (x1, y1 + r)),
    ]


def add_outline(board):
    for item in outline_path():
        seg = pcbnew.PCB_SHAPE(board)
        if item[0] == "line":
            seg.SetShape(pcbnew.SHAPE_T_SEGMENT)
            seg.SetStart(pt(*item[1]))
            seg.SetEnd(pt(*item[2]))
        else:
            seg.SetShape(pcbnew.SHAPE_T_ARC)
            seg.SetArcGeometry(pt(*item[1]), pt(*item[2]), pt(*item[3]))
        seg.SetLayer(pcbnew.Edge_Cuts)
        seg.SetWidth(mm(0.1))
        board.Add(seg)


def rect_poly(x1, y1, x2, y2):
    chain = pcbnew.SHAPE_LINE_CHAIN()
    for x, y in [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]:
        chain.Append(mm(x), mm(y))
    chain.SetClosed(True)
    return chain


def poly(points):
    chain = pcbnew.SHAPE_LINE_CHAIN()
    for x, y in points:
        chain.Append(mm(x), mm(y))
    chain.SetClosed(True)
    return chain


def rule_area(board, name, box, pads=True):
    """A no-tracks, no-vias area: `box` is (x1, y1, x2, y2) or a list of points."""
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetZoneName(name)
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(layers)
    z.SetDoNotAllowZoneFills(False)
    z.SetDoNotAllowTracks(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowPads(not pads)
    z.SetDoNotAllowFootprints(False)
    z.Outline().AddOutline(rect_poly(*box) if len(box) == 4 and not isinstance(box[0], tuple) else poly(box))
    board.Add(z)


def add_edge_keepouts(board, d=0.35):
    """Strips along the edges so the autorouter (which doesn't know KiCad's
    copper-to-edge rule) keeps tracks and vias 0.35 mm from the edge. Each
    rounded corner gets the band between the edge and an arc d inside it."""
    x1, y1, x2, y2 = X0, Y0, X0 + W, Y0 + H
    nx, _, _, ny = NOTCH
    r = CORNER_R
    boxes = [(x1 + r, y1, nx, y1 + d), (x1 + r, y2 - d, x2 - r, y2),
             (x1, y1 + r, x1 + d, y2 - r), (x2 - d, ny, x2, y2 - r),
             (nx - d, y1, nx, ny + d), (nx, ny, x2, ny + d)]
    # (corner, arc centre, start angle): the band runs 90 degrees from there.
    for (cx0, cy0), (ccx, ccy), a0 in (((x1, y1), (x1 + r, y1 + r), 180),
                                       ((x2, y2), (x2 - r, y2 - r), 0),
                                       ((x1, y2), (x1 + r, y2 - r), 90)):
        inner = [(ccx + (r - d) * math.cos(math.radians(a0 + 90 * i / 12)),
                  ccy + (r - d) * math.sin(math.radians(a0 + 90 * i / 12))) for i in range(13)]
        boxes.append(inner + [(cx0, cy0)])
    for i, box in enumerate(boxes):
        rule_area(board, f"edge-{i}", box)


def add_keepout(board):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetZoneName("antenna-keepout")
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(layers)
    z.SetDoNotAllowZoneFills(True)
    z.SetDoNotAllowTracks(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowPads(True)
    z.SetDoNotAllowFootprints(False)
    z.Outline().AddOutline(rect_poly(*KEEPOUT))
    board.Add(z)


def add_text(board, text, x, y, layer, size=0.8, mirror=False):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(text)
    t.SetPosition(pt(x, y))
    t.SetLayer(layer)
    t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
    t.SetTextThickness(mm(size * 0.15))
    t.SetMirrored(mirror)
    board.Add(t)


def stock_footprints():
    """KiCad's own footprint folder, next to kicad-cli's install."""
    env = os.environ.get("KICAD10_FOOTPRINT_DIR")
    if env:
        return env
    for base in (os.path.join(os.environ.get("ProgramFiles", ""), "KiCad", "10.0", "share", "kicad"),
                 "/usr/share/kicad"):
        path = os.path.join(base, "footprints")
        if os.path.isdir(path):
            return path
    raise SystemExit("KiCad's footprints not found; set KICAD10_FOOTPRINT_DIR")


def place_parts(board):
    netinfo = {}
    for name in design.nets():
        n = pcbnew.NETINFO_ITEM(board, name)
        board.Add(n)
        netinfo[name] = n

    for part in design.PARTS:
        lib, name = part.footprint.split(":")
        fp = pcbnew.FootprintLoad(os.path.join(FP_DIRS.get(lib, stock_footprints()), lib + ".pretty"), name)
        if fp is None:
            raise SystemExit(f"footprint not found: {part.footprint}")
        fp.SetFPIDAsString(part.footprint)
        fp.SetReference(part.ref)
        fp.SetValue(part.value)
        if part.lcsc:
            fp.SetField("LCSC", part.lcsc)
            fp.GetField("LCSC").SetVisible(False)  # data for the BOM, not silkscreen
        if not part.bom:
            fp.SetAttributes(fp.GetAttributes() | pcbnew.FP_EXCLUDE_FROM_BOM
                             | pcbnew.FP_EXCLUDE_FROM_POS_FILES)
        board.Add(fp)
        x, y, rot, side = PLACE[part.ref]
        pos = pt(x, y)
        fp.SetPosition(pos)
        if side == "B":
            fp.Flip(pos, pcbnew.FLIP_DIRECTION_LEFT_RIGHT)
        fp.SetOrientationDegrees(rot)
        if part.ref == "U1":
            # The library footprint has 0.2 mm thermal vias in the ground
            # pad. A 2-layer JLCPCB board's standard minimum is 0.3 mm, and
            # the C3 runs cool, so drop them; the router adds ground vias.
            for pad in list(fp.Pads()):
                if pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH and pad.GetDrillSize().x < mm(0.3):
                    fp.Remove(pad)
        for pad in fp.Pads():
            net = part.pins.get(pad.GetNumber())
            if net:
                pad.SetNet(netinfo[net])
        # Keep reference text small; the board is tiny.
        ref = fp.Reference()
        ref.SetTextSize(pcbnew.VECTOR2I(mm(0.6), mm(0.6)))
        ref.SetTextThickness(mm(0.1))
        fp.Value().SetVisible(False)
        if part in design.TESTPOINTS:
            ref.SetVisible(False)  # labelled with the net name instead
    missing = set(PLACE) - {p.ref for p in design.PARTS}
    assert not missing, f"placement for unknown parts: {missing}"


def write_project(path):
    classes = []
    for name, c in NETCLASSES.items():
        classes.append({
            "name": name, "clearance": c["clearance"], "track_width": c["track_width"],
            "via_diameter": c["via_diameter"], "via_drill": c["via_drill"],
            "microvia_diameter": 0.3, "microvia_drill": 0.1,
            "diff_pair_width": 0.2, "diff_pair_gap": 0.25, "wire_width": 6,
            "bus_width": 12, "line_style": 0, "pcb_color": "rgba(0, 0, 0, 0.000)",
            "schematic_color": "rgba(0, 0, 0, 0.000)",
        })
    proj = {
        "board": {
            "design_settings": {
                "defaults": {"board_outline_line_width": 0.1, "copper_line_width": 0.2},
                "rules": {
                    "min_clearance": 0.127, "min_track_width": 0.127,
                    "min_via_diameter": 0.5, "min_via_annular_width": 0.1,
                    "min_through_hole_diameter": 0.3, "min_hole_clearance": 0.25,
                    "min_hole_to_hole": 0.25, "min_copper_edge_clearance": 0.3,
                    "min_silk_clearance": 0.0, "min_text_height": 0.6,
                    "min_text_thickness": 0.08, "solder_mask_clearance": 0.0,
                    "solder_mask_min_width": 0.0, "use_height_for_length_calcs": True,
                    "allow_blind_buried_vias": False, "allow_microvias": False,
                },
                "rule_severities": {
                    # Silkscreen nits are checked by the factory's DFM preview.
                    "silk_overlap": "ignore", "silk_over_copper": "ignore",
                    "silk_edge_clearance": "ignore", "text_height": "warning",
                    "lib_footprint_issues": "ignore", "lib_footprint_mismatch": "ignore",
                },
                "track_widths": [0.0, 0.15, 0.3], "via_dimensions": [],
            },
        },
        "meta": {"filename": "lumi.kicad_pro", "version": 1},
        "net_settings": {
            "classes": classes,
            "meta": {"version": 3},
            "netclass_patterns": [{"netclass": "Power", "pattern": n}
                                  for n in sorted(design.POWER_NETS)],
        },
        "pcbnew": {"page_layout_descr_file": ""},
        "sheets": [], "text_variables": {},
    }
    with open(path, "w") as f:
        json.dump(proj, f, indent=2)


def main(out):
    os.makedirs(out, exist_ok=True)
    pcb = os.path.join(out, "lumi.kicad_pcb")
    write_project(os.path.join(out, "lumi.kicad_pro"))

    board = pcbnew.NewBoard(pcb)
    ds = board.GetDesignSettings()
    ds.SetBoardThickness(mm(1.0))
    ds.SetCopperLayerCount(2)
    add_outline(board)
    place_parts(board)
    add_keepout(board)
    add_edge_keepouts(board)
    add_text(board, "LUMI PCB v1 - DRAFT, NOT REVIEWED", 118.5, 106.9, pcbnew.F_SilkS, 0.7)
    add_text(board, "github.com/belivablelevi/Lumi", 118.5, 108.1, pcbnew.F_SilkS, 0.6)
    for part in design.TESTPOINTS:
        x, y, _, _ = PLACE[part.ref]
        dx, dy = TP_LABEL[part.ref]
        add_text(board, part.value, x + dx, y + dy, pcbnew.F_SilkS, 0.6)
    pcbnew.SaveBoard(pcb, board, True)
    with open(os.path.join(out, "fp-lib-table"), "w") as fh:
        fh.write('(fp_lib_table\n  (lib (name "lumi")(type "KiCad")(uri "${KIPRJMOD}/../lumi.pretty")'
                 '(options "")(descr "Parts KiCad\'s own library lacks"))\n)\n')
    print(f"wrote {pcb}: {len(design.PARTS)} parts, {len(design.nets())} nets")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out"))
