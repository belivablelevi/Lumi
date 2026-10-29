"""CLI: python -m circlelogo input.png [-o outdir] [--tolerance 0.012] [--scale golden]"""

from __future__ import annotations

import argparse
import os

from . import circleize, to_construction_svg, to_json, to_png, to_svg


def main(argv=None):
    ap = argparse.ArgumentParser(prog="circlelogo", description=__doc__)
    ap.add_argument("image", help="input image (silhouette, icon, photo of a high-contrast shape)")
    ap.add_argument("-o", "--out", default=None, help="output directory (default: next to the input)")
    ap.add_argument("-t", "--tolerance", type=float, default=0.012,
                    help="max deviation as a fraction of shape size; higher = simpler logo (default 0.012)")
    ap.add_argument("-s", "--scale", choices=["golden", "fibonacci", "free"], default="golden",
                    help="radius system the circles snap to (default golden)")
    ap.add_argument("--corner", type=float, default=40.0, help="min angle in degrees that counts as a sharp corner")
    ap.add_argument("--lines", action="store_true", help="allow straight segments for very flat edges")
    ap.add_argument("--no-merge", action="store_true", help="don't let edges share circles")
    ap.add_argument("--invert", action="store_true", default=None, help="treat light areas as the shape")
    ap.add_argument("--threshold", type=int, default=None, help="fixed 0-255 threshold instead of Otsu")
    ap.add_argument("--color", default="#1f2937", help="logo fill colour")
    ap.add_argument("--labels", action="store_true", help="label circles with their radius step")
    ap.add_argument("--png", action="store_true", help="also write PNG previews")
    a = ap.parse_args(argv)

    logo = circleize(a.image, tolerance=a.tolerance, scale=a.scale, corner_deg=a.corner,
                     allow_lines=a.lines, merge=not a.no_merge, invert=a.invert, threshold=a.threshold)

    base = os.path.splitext(os.path.basename(a.image))[0]
    out = a.out or os.path.dirname(os.path.abspath(a.image))
    os.makedirs(out, exist_ok=True)
    stem = os.path.join(out, base)
    with open(f"{stem}.logo.svg", "w") as f:
        f.write(to_svg(logo, color=a.color))
    with open(f"{stem}.construction.svg", "w") as f:
        f.write(to_construction_svg(logo, color=a.color, labels=a.labels))
    with open(f"{stem}.circles.json", "w") as f:
        f.write(to_json(logo))
    if a.png:
        to_png(logo, f"{stem}.logo.png")
        to_png(logo, f"{stem}.construction.png", construction=True)
    s = logo.stats
    print(f"{base}: {s['circles']} circles, {s['arcs']} arcs, {s['lines']} lines, "
          f"IoU vs. traced shape {s['iou']:.3f} -> {stem}.*")


if __name__ == "__main__":
    main()
