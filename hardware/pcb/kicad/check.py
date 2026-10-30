"""Connectivity checks that KiCad 7's command line can't do (it has no ERC/DRC
commands; those arrived in KiCad 8):

1. Schematic vs design.py: every pin is on the net design.py says, and
   nothing extra is connected (the schematic netlist is exported by
   kicad-cli, so this checks the drawn labels really connect).
2. Board vs design.py: every pad carries the right net.
3. KiCad's design-rule check on the routed board (via its Python API),
   which must report no violations and nothing unrouted.

Usage: python3 check.py <project-dir> <netlist.xml> <drc-report-out>
"""

import os
import re
import sys
import xml.etree.ElementTree as ET

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402


def expected():
    return {(ref, pad): net for ref, pad, net in
            ((p.ref, pad, net) for p in design.PARTS for pad, net in p.pins.items()) if net}


def schematic_nets(xml_path):
    got = {}
    for net in ET.parse(xml_path).getroot().iter("net"):
        name = net.get("name").lstrip("/")
        for node in net.iter("node"):
            got[(node.get("ref"), node.get("pin"))] = name
    return got


def board_nets(board):
    got = {}
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNumber() and pad.GetNetname():
                got[(fp.GetReference(), pad.GetNumber())] = pad.GetNetname()
    return got


def compare(label, want, got):
    errors = []
    for key, net in want.items():
        if got.get(key) != net:
            errors.append(f"{label}: {key[0]} pin {key[1]} should be {net}, is {got.get(key)}")
    for key, net in got.items():
        if key not in want and not net.startswith(("unconnected-", "Net-(")):
            errors.append(f"{label}: {key[0]} pin {key[1]} is on {net}, design.py has it unconnected")
    return errors


def main(proj, netlist, drc_out):
    want = expected()
    errors = compare("schematic", want, schematic_nets(netlist))
    board = pcbnew.LoadBoard(os.path.join(proj, "lumi.kicad_pcb"))
    errors += compare("board", want, board_nets(board))

    pcbnew.WriteDRCReport(board, drc_out, pcbnew.EDA_UNITS_MILLIMETRES, True)
    report = open(drc_out).read()
    counts = {k: int(v) for v, k in re.findall(r"\*\* Found (\d+) (DRC violations|unconnected pads)", report)}
    if counts.get("DRC violations", 1) or counts.get("unconnected pads", 1):
        errors.append(f"DRC: {counts} (see {drc_out})")

    for e in errors:
        print("FAIL", e)
    print(f"checked {len(want)} pin connections against schematic and board; "
          f"DRC: {counts.get('DRC violations')} violations, {counts.get('unconnected pads')} unrouted")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
