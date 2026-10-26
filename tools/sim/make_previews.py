#!/usr/bin/env python3
"""Build the simulator, run it, and turn its frames into PNG/GIF previews.

    python3 tools/sim/make_previews.py            # writes docs/previews/
    python3 tools/sim/make_previews.py --all-gifs # also one GIF per animation in build/sim/gifs

Needs a C++17 compiler and Pillow (pip install pillow).
"""
import argparse
import os
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SIM_DIR = os.path.join(ROOT, "tools", "sim")
OUT = os.path.join(ROOT, "build", "sim")
DOCS = os.path.join(ROOT, "docs", "previews")

W, H, FRAME = 128, 64, 1024
ON = (60, 230, 255)   # cyan OLED
OFF = (6, 10, 14)
GAP = (2, 4, 6)

# Animations stitched into the highlight reel, in order.
HIGHLIGHTS = [
    "boot_hello", "look_around", "pat_giggle", "double_pat_hearts", "pat_purr", "shake_dizzy",
    "upside_down_panic", "sparkle", "hum", "pat_spam_annoyed", "pong_smash", "pong_win_match", "lonely",
    "yawn", "fall_asleep",
]


def frames(path):
    data = open(path, "rb").read()
    return [data[i:i + FRAME] for i in range(0, len(data) - FRAME + 1, FRAME)]


def to_image(buf, scale=3, grid=True):
    """Decode an SSD1306 page buffer into an RGB image with an OLED-ish pixel grid."""
    img = Image.new("RGB", (W * scale, H * scale), GAP if grid and scale > 2 else OFF)
    px = img.load()
    inner = scale - 1 if grid and scale > 2 else scale
    for y in range(H):
        row = (y >> 3) * W
        bit = 1 << (y & 7)
        for x in range(W):
            color = ON if buf[row + x] & bit else OFF
            for dy in range(inner):
                for dx in range(inner):
                    px[x * scale + dx, y * scale + dy] = color
    return img


def framed(img, pad=10):
    out = Image.new("RGB", (img.width + 2 * pad, img.height + 2 * pad), (18, 18, 22))
    out.paste(img, (pad, pad))
    return out


def sheet(bufs, labels, cols, scale=2, path=None):
    cell_w, cell_h = W * scale + 16, H * scale + 30
    rows = (len(bufs) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell_w + 8, rows * cell_h + 8), (18, 18, 22))
    d = ImageDraw.Draw(img)
    for i, (buf, label) in enumerate(zip(bufs, labels)):
        x, y = 8 + (i % cols) * cell_w, 8 + (i // cols) * cell_h
        img.paste(to_image(buf, scale), (x, y))
        d.text((x + 2, y + H * scale + 6), label, fill=(170, 190, 200))
    img.save(path)
    return img


def gif(bufs, path, frame_ms, scale=2):
    imgs = [framed(to_image(b, scale), 6).convert("P", palette=Image.ADAPTIVE, colors=8) for b in bufs]
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=frame_ms, loop=0, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all-gifs", action="store_true")
    args = ap.parse_args()

    subprocess.run(["make", "-C", SIM_DIR, "run"], check=True)
    os.makedirs(DOCS, exist_ok=True)

    labels = open(os.path.join(OUT, "expressions.labels")).read().split()
    sheet(frames(os.path.join(OUT, "expressions.frames")), labels, 6,
          path=os.path.join(DOCS, "expressions.png"))

    screen_labels = open(os.path.join(OUT, "screens.labels")).read().split()
    screen_bufs = frames(os.path.join(OUT, "screens.frames"))
    sheet(screen_bufs, screen_labels, 4, path=os.path.join(DOCS, "screens.png"))

    reel = []
    for name in HIGHLIGHTS:
        f = frames(os.path.join(OUT, "anim_%s.frames" % name))
        reel.extend(f[::2])  # 33 ms frames -> ~15 fps
    gif(reel, os.path.join(DOCS, "highlights.gif"), 66)

    tour = frames(os.path.join(OUT, "tour.frames"))
    gif(tour[::2], os.path.join(DOCS, "tour.gif"), 120, scale=2)

    if args.all_gifs:
        gdir = os.path.join(OUT, "gifs")
        os.makedirs(gdir, exist_ok=True)
        for line in open(os.path.join(OUT, "animations.txt")):
            name = line.split()[0]
            gif(frames(os.path.join(OUT, "anim_%s.frames" % name))[::2], os.path.join(gdir, name + ".gif"), 66)
        print("per-animation GIFs in", gdir)

    for f in sorted(os.listdir(DOCS)):
        print("%-18s %7.1f KB" % (f, os.path.getsize(os.path.join(DOCS, f)) / 1024))


if __name__ == "__main__":
    sys.exit(main())
