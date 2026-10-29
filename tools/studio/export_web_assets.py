#!/usr/bin/env python3
"""Exports real Lumi frames for the website (web/public/lumi), rendered by the firmware's own code.

    cmake -S tools/studio -B build/studio && cmake --build build/studio
    python3 tools/studio/export_web_assets.py

For each example persona it writes:
  expressions.lumi       every expression as a still frame
  <animation>.lumi       an animation played by the firmware's Animator (blinks and breathing included)
  idle.lumi              ~12 s of the unit idling on its own
  poster-<name>.png      a still for reduced motion and link previews
plus manifest.json describing all of it.

.lumi files are zlib-compressed frames of 1024 bytes (SSD1306 page layout,
128x64, 1 bit per pixel). Each frame is XORed with the one before it, so
unchanged pixels compress to almost nothing.
"""
import json
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "web", "public", "lumi")

from lumi_studio import native  # noqa: E402

FRAME_MS = 33

# Example units: real genes from real seeds. Every manufactured unit is different.
PERSONAS = [340, 860, 1085, 1879]

# Animations the site plays. The emotion showcase maps onto these firmware names.
ANIMATIONS = ["pat_giggle", "yawn", "curious", "pickup_surprised", "smug", "daydream", "double_pat_hearts",
              "hum", "sparkle", "shy", "dance", "nod_off", "pickup_hello", "pong_win_match", "boot_hello"]
IDLE_MS = 12000


def encode(frames):
    prev = bytes(native.FRAME_BYTES)
    out = bytearray()
    for f in frames:
        out += bytes(a ^ b for a, b in zip(f, prev))
        prev = f
    return zlib.compress(bytes(out), 9)


def write(path, frames):
    data = encode(frames)
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def poster(path, frame, scale=6):
    from PIL import Image
    on, off = (60, 240, 255), (6, 16, 20)
    img = Image.new("RGB", (128 * scale, 64 * scale), (11, 11, 14))
    px = img.load()
    for y in range(64):
        for x in range(128):
            c = on if native.pixel(frame, x, y) else off
            for dy in range(scale - 1):
                for dx in range(scale - 1):
                    px[x * scale + dx, y * scale + dy] = c
    img.save(path, optimize=True)


def play(player, name, t0):
    """Plays one animation from rest; returns its frames and the time after it."""
    frames = []
    t = t0
    player.set_idle(False)
    player.update(t)
    if player.play(name) < 0:
        raise SystemExit(f"no animation called {name!r}")
    while player.busy() and len(frames) < 600:
        player.update(t)
        frames.append(player.render())
        t += FRAME_MS
    for _ in range(12):  # a short rest so loops don't snap
        player.update(t)
        frames.append(player.render())
        t += FRAME_MS
    return frames, t


def main():
    os.makedirs(OUT, exist_ok=True)
    triggers = dict(native.builtin_animations())
    exprs = native.expression_names()
    manifest = {"frameMs": FRAME_MS, "width": 128, "height": 64, "core": native.version(),
                "expressions": exprs, "personas": []}
    total = 0
    for seed in PERSONAS:
        genes = native.genes_from_seed(seed)
        name = native.name_from_seed(seed)
        pid = name.lower()
        d = os.path.join(OUT, pid)
        os.makedirs(d, exist_ok=True)
        stills = [native.render_expression(i, genes, 600) for i in range(len(exprs))]
        total += write(os.path.join(d, "expressions.lumi"), stills)
        poster(os.path.join(d, "poster-neutral.png"), stills[exprs.index("neutral")])
        poster(os.path.join(d, "poster-happy.png"), stills[exprs.index("happy")])

        player = native.Player(seed=seed & 0xFFFFFFFF or 1)
        player.load_pack(b"")
        player.set_genes(genes)
        anims, t = {}, 0
        for a in ANIMATIONS:
            frames, t = play(player, a, t)
            total += write(os.path.join(d, f"{a}.lumi"), frames)
            anims[a] = {"file": f"/lumi/{pid}/{a}.lumi", "frames": len(frames), "trigger": triggers[a]}
        player.set_idle(True)
        idle = []
        for _ in range(IDLE_MS // FRAME_MS):
            player.update(t)
            idle.append(player.render())
            t += FRAME_MS
        player.close()
        total += write(os.path.join(d, "idle.lumi"), idle)
        opts = [native.gene_options(g)[v] for g, v in enumerate(genes)]
        manifest["personas"].append({
            "id": pid, "name": name, "seed": seed, "genes": genes, "rarity": native.genes_rarity(genes),
            "traits": dict(zip(["eyeShape", "eyeSize", "eyeSpacing", "eyeHeight", "highlight", "accent",
                                "temperament"], opts)),
            "expressions": f"/lumi/{pid}/expressions.lumi",
            "idle": {"file": f"/lumi/{pid}/idle.lumi", "frames": len(idle)},
            "posters": {"neutral": f"/lumi/{pid}/poster-neutral.png", "happy": f"/lumi/{pid}/poster-happy.png"},
            "animations": anims,
        })
        print(f"{name:8s} {native.genes_rarity(genes):10s} {' '.join(opts)}")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"{total / 1024:.0f} KB of frames -> {os.path.relpath(OUT, REPO)}")


if __name__ == "__main__":
    main()
