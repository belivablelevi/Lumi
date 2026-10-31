"""Factory files for JLCPCB from the routed board:

  fab/lumi-gerbers.zip   Gerbers + drill files (upload this for the bare PCB)
  fab/lumi-bom.csv       Bill of materials in JLCPCB's format (LCSC part numbers)
  fab/lumi-cpl.csv       Pick-and-place positions in JLCPCB's format
  fab/lumi.step          3D model of the board for the case fit (parts that
                         have a KiCad 3D model; the WROOM-02 has none in
                         KiCad 7, so it's drawn as a box in the fit check)
  fab/fit.txt            Height stack against the case

Usage: python3 fab.py <project-dir> <out-dir> [3d-model-dir]
"""

import csv
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design  # noqa: E402

LAYERS = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"

# Tallest point of each part above the board, mm (maker drawings and
# KiCad's 3D models). Used for the case fit.
HEIGHTS = {
    "RF_Module:ESP32-C3-WROOM-02": 3.2,
    "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12": 3.26,
    "lumi:JUSHUO_AFC07-S30ECC-00": 2.0,
    "Button_Switch_SMD:SW_SPDT_PCM12": 1.5,
    "Package_TO_SOT_SMD:SOT-23-5": 1.45,
    "Package_TO_SOT_SMD:SOT-23-6": 1.45,
    "Package_LGA:LGA-12_2x2mm_P0.5mm": 1.0,
    design.C0603: 0.8,
    design.C0402: 0.5,
    design.R0402: 0.5,
    design.TP: 0.0,
    design.BATPAD: 0.0,
}

# Case stack from the front, mm. The plan's 12.5 mm assumed 1.5 mm parts.
STACK = [
    ("front wall", 1.4),
    ("OLED glass (ER-OLED0.96-1)", 1.45),
    ("PCB", 1.0),
    ("tallest part on the back", None),  # filled in
    ("clearance", 0.3),
    ("503030 LiPo (pouch, swells a little)", 5.4),
    ("back wall", 1.4),
    ("clearances, foam tape", 0.4),
]
TARGET = 12.5


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def gerbers(pcb, out):
    tmp = tempfile.mkdtemp()
    run("kicad-cli", "pcb", "export", "gerbers", "--layers", LAYERS,
        "--subtract-soldermask", "-o", tmp + "/", pcb)
    run("kicad-cli", "pcb", "export", "drill", "--format", "excellon",
        "--excellon-separate-th", "--generate-map", "--map-format", "gerberx2",
        "-o", tmp + "/", pcb)
    zpath = os.path.join(out, "lumi-gerbers.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(os.listdir(tmp)):
            z.write(os.path.join(tmp, name), name)
    shutil.rmtree(tmp)
    return zpath


def bom(out):
    groups = {}
    for p in design.PARTS:
        if not p.bom:
            continue
        key = (p.value, p.footprint, p.lcsc)
        groups.setdefault(key, []).append(p.ref)
    path = os.path.join(out, "lumi-bom.csv")
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for (value, fp, lcsc), refs in sorted(groups.items(), key=lambda kv: kv[1][0]):
            w.writerow([value, ",".join(sorted(refs, key=lambda r: (r.rstrip("0123456789"),
                                                                   int(r.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))))),
                        fp.split(":")[1], lcsc])
    return path


def cpl(pcb, out):
    tmp = os.path.join(tempfile.mkdtemp(), "pos.csv")
    run("kicad-cli", "pcb", "export", "pos", "--side", "both", "--format", "csv",
        "--units", "mm", "-o", tmp, pcb)
    path = os.path.join(out, "lumi-cpl.csv")
    with open(tmp) as src, open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        for row in csv.DictReader(src):
            w.writerow([row["Ref"], row["PosX"] + "mm", row["PosY"] + "mm",
                        "Top" if row["Side"] == "top" else "Bottom",
                        f"{float(row['Rot']) % 360:g}"])
    shutil.rmtree(os.path.dirname(tmp))
    return path


def step(pcb, out, models):
    env = dict(os.environ)
    if models:
        for v in ("KICAD6_3DMODEL_DIR", "KICAD7_3DMODEL_DIR"):
            env[v] = models
    path = os.path.join(out, "lumi.step")
    subprocess.run(["kicad-cli", "pcb", "export", "step", "--subst-models", "--force",
                    "-o", path, pcb], check=True, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return path


def fit(out):
    tallest = max((HEIGHTS[p.footprint], p.ref) for p in design.PARTS)
    lines = ["Lumi PCB v1: case height stack (front to back), mm", ""]
    total = 0.0
    for name, h in STACK:
        if h is None:
            h, name = tallest[0], f"{name} ({tallest[1]})"
        total += h
        lines.append(f"  {name:<44} {h:5.2f}")
    lines += ["  " + "-" * 50, f"  {'total':<44} {total:5.2f}",
              f"  {'plan target':<44} {TARGET:5.2f}", ""]
    over = total - TARGET
    lines.append(f"Over the 12.5 mm target by {over:.2f} mm." if over > 0 else "Fits the 12.5 mm target.")
    lines.append("")
    lines.append("Tallest parts:")
    for h, ref in sorted(((HEIGHTS[p.footprint], p.ref) for p in design.PARTS), reverse=True)[:5]:
        lines.append(f"  {ref:<5} {h:.2f} mm")
    path = os.path.join(out, "fit.txt")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return path, total


def main(proj, out, models=""):
    os.makedirs(out, exist_ok=True)
    pcb = os.path.join(proj, "lumi.kicad_pcb")
    for path in (gerbers(pcb, out), bom(out), cpl(pcb, out), step(pcb, out, models)):
        print("wrote", path)
    path, total = fit(out)
    print(f"wrote {path}: stack {total:.2f} mm")


if __name__ == "__main__":
    main(*sys.argv[1:])
