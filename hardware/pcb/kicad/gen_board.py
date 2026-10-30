"""Build lumi.kicad_pcb from design.py: outline, parts, nets, keep-outs.

Routing is done afterwards by route.py (Freerouting), then zones are filled.

Coordinates are millimetres in KiCad's view (looking at the FRONT of the
board, y down). The board is 31 x 33 mm with its top-left corner at
(100, 100). Every part sits on the BACK; the front is flat for the screen
glass and carries only copper, test pads and silkscreen.

Usage: python3 gen_board.py <out-dir>
"""

import json
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402

FP_DIR = "/usr/share/kicad/footprints"

X0, Y0, W, H = 100.0, 100.0, 31.0, 33.0

# ref -> (x, y, orientation, side). Orientation is KiCad's value for the
# footprint *after* it has been flipped to the back: 180 keeps the part
# mirrored left-to-right only (antenna stays at the top), 0 mirrors it
# top-to-bottom.
PLACE = {
    # Module: antenna at the keyring (top) edge.
    "U1": (120.9, 113.1, 180, "B"),
    # USB-C, opening on the left edge (seen from the front).
    "J1": (103.7, 113.2, 90, "B"),
    # Screen ZIF, opening toward the bottom edge where the panel's cable
    # wraps around from the front.
    "J2": (115.5, 127.95, 180, "B"),
    # Slide switch, lever out of the right edge.
    "SW1": (128.8, 126.5, 270, "B"),
    # Top-left corner: battery pads and charger (outside the antenna area).
    "BT1": (101.25, 101.3, 0, "B"),
    "BT2": (101.25, 104.0, 0, "B"),
    "U3": (104.6, 102.3, 0, "B"),
    "C1": (103.7, 105.4, 90, "B"),
    "C2": (104.95, 105.4, 90, "B"),
    "R3": (106.1, 105.4, 90, "B"),
    # Strip above the USB-C.
    "R7": (101.6, 107.1, 0, "B"),
    "R8": (103.85, 107.1, 0, "B"),
    "R12": (106.1, 107.1, 0, "B"),
    # Between the USB-C and the module: just the CC resistors, leaving room
    # for the module's left-hand pins to fan out.
    "R2": (109.6, 111.3, 90, "B"),
    "R1": (109.6, 114.6, 90, "B"),
    # Left strip under the USB-C: ESD, LDO.
    "D1": (102.6, 120.9, 90, "B"),
    "U4": (102.6, 125.4, 90, "B"),
    "C3": (102.6, 128.5, 0, "B"),
    "C4": (102.6, 129.8, 0, "B"),
    "R5": (102.6, 131.1, 0, "B"),
    "R6": (102.6, 132.3, 0, "B"),
    # Strip between the module and the ZIF.
    "C12": (106.9, 121.1, 0, "B"),
    "C13": (110.1, 121.1, 0, "B"),
    "R9": (113.0, 121.1, 0, "B"),
    "U2": (115.6, 122.5, 0, "B"),
    "C7": (118.2, 121.1, 0, "B"),
    "R13": (120.5, 121.1, 0, "B"),
    "C9": (122.8, 121.1, 0, "B"),
    "C5": (125.1, 121.1, 0, "B"),
    "C6": (127.4, 121.1, 0, "B"),
    "R11": (129.7, 121.1, 0, "B"),
    "R15": (107.2, 123.9, 0, "B"),
    "R10": (113.0, 123.9, 0, "B"),
    "C14": (118.2, 123.9, 0, "B"),
    "C10": (120.5, 123.9, 0, "B"),
    "C11": (122.8, 123.9, 0, "B"),
    "C8": (125.1, 123.9, 0, "B"),
    # Front test pads in the bottom corners, outside the screen glass.
    "TP1": (101.4, 128.6, 0, "F"),
    "TP2": (103.6, 128.6, 0, "F"),
    "TP3": (101.4, 131.2, 0, "F"),
    "TP4": (103.6, 131.2, 0, "F"),
    "TP5": (125.6, 130.0, 0, "F"),
    "TP6": (127.8, 130.0, 0, "F"),
    "TP7": (125.6, 132.1, 0, "F"),
}

# Antenna keep-out (from the module footprint, clipped to the board): no
# copper on any layer above this line, for the module's width plus margin.
KEEPOUT = (106.9, Y0, X0 + W, 106.0)

NETCLASSES = {
    "Default": {"track_width": 0.15, "clearance": 0.13, "via_diameter": 0.6, "via_drill": 0.3},
    "Power": {"track_width": 0.3, "clearance": 0.13, "via_diameter": 0.6, "via_drill": 0.3},
}


def mm(v):
    return pcbnew.FromMM(v)


def pt(x, y):
    return pcbnew.VECTOR2I(mm(x), mm(y))


def add_outline(board):
    corners = [(X0, Y0), (X0 + W, Y0), (X0 + W, Y0 + H), (X0, Y0 + H)]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        seg = pcbnew.PCB_SHAPE(board)
        seg.SetShape(pcbnew.SHAPE_T_SEGMENT)
        seg.SetStart(pt(*a))
        seg.SetEnd(pt(*b))
        seg.SetLayer(pcbnew.Edge_Cuts)
        seg.SetWidth(mm(0.1))
        board.Add(seg)


def rect_poly(x1, y1, x2, y2):
    chain = pcbnew.SHAPE_LINE_CHAIN()
    for x, y in [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]:
        chain.Append(mm(x), mm(y))
    chain.SetClosed(True)
    return chain


def rule_area(board, name, box, pads=True):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetZoneName(name)
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(layers)
    z.SetDoNotAllowCopperPour(False)
    z.SetDoNotAllowTracks(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowPads(not pads)
    z.SetDoNotAllowFootprints(False)
    z.Outline().AddOutline(rect_poly(*box))
    board.Add(z)


def add_edge_keepouts(board, d=0.35):
    """Strips along the edges so the autorouter (which doesn't know KiCad's
    copper-to-edge rule) keeps tracks and vias 0.35 mm from the edge."""
    x1, y1, x2, y2 = X0, Y0, X0 + W, Y0 + H
    for i, box in enumerate([(x1, y1, x2, y1 + d), (x1, y2 - d, x2, y2),
                             (x1, y1, x1 + d, y2), (x2 - d, y1, x2, y2)]):
        rule_area(board, f"edge-{i}", box)


def add_keepout(board):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetZoneName("antenna-keepout")
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(layers)
    z.SetDoNotAllowCopperPour(True)
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


def place_parts(board):
    netinfo = {}
    for name in design.nets():
        n = pcbnew.NETINFO_ITEM(board, name)
        board.Add(n)
        netinfo[name] = n

    for part in design.PARTS:
        lib, name = part.footprint.split(":")
        fp = pcbnew.FootprintLoad(os.path.join(FP_DIR, lib + ".pretty"), name)
        if fp is None:
            raise SystemExit(f"footprint not found: {part.footprint}")
        fp.SetFPIDAsString(part.footprint)
        fp.SetReference(part.ref)
        fp.SetValue(part.value)
        if part.lcsc:
            fp.SetProperty("LCSC", part.lcsc)
        if not part.bom:
            fp.SetAttributes(fp.GetAttributes() | pcbnew.FP_EXCLUDE_FROM_BOM
                             | pcbnew.FP_EXCLUDE_FROM_POS_FILES)
        board.Add(fp)
        x, y, rot, side = PLACE[part.ref]
        pos = pt(x, y)
        fp.SetPosition(pos)
        if side == "B":
            fp.Flip(pos, True)
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
    add_text(board, "LUMI PCB v1 - DRAFT, NOT REVIEWED", 115.5, 101.4, pcbnew.F_SilkS, 0.7)
    add_text(board, "github.com/belivablelevi/Lumi", 115.5, 102.6, pcbnew.F_SilkS, 0.6)
    add_text(board, "antenna: keep metal away", 115.5, 104.6, pcbnew.B_SilkS, 0.6, mirror=True)
    for part in design.TESTPOINTS:
        x, y, _, _ = PLACE[part.ref]
        add_text(board, part.value, x, y + (-1.2 if y < 130 else 1.2), pcbnew.F_SilkS, 0.6)
    pcbnew.SaveBoard(pcb, board, True)
    print(f"wrote {pcb}: {len(design.PARTS)} parts, {len(design.nets())} nets")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out"))
