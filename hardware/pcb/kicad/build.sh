#!/usr/bin/env bash
# Rebuild the Lumi PCB draft from design.py:
#   schematic -> board (placement) -> autoroute -> checks -> factory files.
#
# Needs: KiCad 10 (kicad-cli and its Python module), Java 21+ and
# Freerouting 2.1 (FREEROUTING=/path/to/freerouting-2.1.0.jar, from
# github.com/freerouting/freerouting/releases).
# Optional: MODELS3D=/path/to/kicad-packages3D for the STEP export,
#           node + Playwright for the PNG renders.
#
#   FREEROUTING=~/freerouting-2.1.0.jar hardware/pcb/kicad/build.sh
#
# Only the routing step needs Freerouting. `build.sh --no-route` keeps the
# committed routing and just re-runs the checks and factory files.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
proj=lumi
fab=fab
mkdir -p "$fab" renders
# KiCad's own Python, which has the pcbnew module. On Windows:
#   PYTHON="/c/Program Files/KiCad/10.0/bin/python.exe"
python="${PYTHON:-python3}"

if [[ "${1:-}" != "--no-route" ]]; then
  : "${FREEROUTING:?set FREEROUTING to the Freerouting 2.1 jar}"
  "$python" gen_board.py "$proj"
  "$python" route.py "$proj" "$FREEROUTING"
fi
"$python" gen_schematic.py "$proj"

# Checks: schematic and board against design.py, then KiCad's DRC.
kicad-cli sch export netlist --format kicadxml -o "$fab/netlist.xml" "$proj/lumi.kicad_sch" >/dev/null
"$python" check.py "$proj" "$fab/netlist.xml" "$fab/drc-report.txt"

"$python" fab.py "$proj" "$fab" "${MODELS3D:-}"
"$python" case_refs.py "$proj" ../../enclosure/blender

# Drawings
kicad-cli sch export pdf -o "$fab/lumi-schematic.pdf" "$proj/lumi.kicad_sch" >/dev/null
kicad-cli sch export svg -o renders/ "$proj/lumi.kicad_sch" >/dev/null
mv renders/lumi.svg renders/schematic.svg
kicad-cli pcb export svg -l B.Cu,B.SilkS,B.Fab,Edge.Cuts --mirror --page-size-mode 2 \
  --exclude-drawing-sheet -o renders/board-back.svg "$proj/lumi.kicad_pcb" >/dev/null
kicad-cli pcb export svg -l F.Cu,F.SilkS,Edge.Cuts --page-size-mode 2 \
  --exclude-drawing-sheet -o renders/board-front.svg "$proj/lumi.kicad_pcb" >/dev/null
if command -v node >/dev/null && node -e "require('playwright')" 2>/dev/null; then
  node render.js renders
fi
echo "done: $here/$fab"
