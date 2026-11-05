#!/usr/bin/env python3
"""Writes tests/golden/studio_parity.json: what the desktop Studio produces for a fixed set of
inputs, so the Chrome version (web/src/lib/studio) can be checked against it byte for byte.

    python tools/studio/tests/make_parity.py              # rewrite the file
    python tools/studio/tests/make_parity.py --check      # fail if the file is out of date
    python tools/studio/tests/make_parity.py --out PATH   # write it somewhere else (CI)

Needs liblumicore (cmake -S tools/studio -B build/studio && cmake --build build/studio).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(REPO, "tests", "golden", "studio_parity.json")

from lumi_studio import factory, native  # noqa: E402
from lumi_studio.model import AnimationDef, Face, Key, Persona, Project, encode_pack  # noqa: E402


def sample_project():
    p = Project()
    wink = Face.from_expression(native.expression_names().index("happy"))
    wink.update({"openL": 0.1, "slant": 3.3, "mouth": 6, "fx": 1 << 4})
    p.faces["wink"] = wink
    p.faces["big eyes"] = Face({"eyeW": 30.1, "eyeH": 26.7, "lookX": -5.25, "scaleL": 1.17, "styleR": 4})
    p.animations.append(AnimationDef(name="giggle", trigger="pat", moodMin=20, moodMax=90, weight=3, keys=[
        Key(face="custom:wink", lookX=-3, motion="hop", tween=150, hold=400, fx=["sparkles", "hearts"]),
        Key(face="expr:surprised", lookY=4, motion="shake", tween=90, hold=250, eyes="star", mouth="o"),
    ]))
    p.animations.append(AnimationDef(name="stare", trigger="shake", keys=[Key(face="custom:big eyes", hold=900)]))
    return p


def build():
    project = sample_project()
    persona = Persona(name="Mochi", genes=[3, 1, 4, 2, 5, 1, 2], serial="LUMI-000042", favourites=["giggle"])
    batch = factory.generate_batch(50, "parity-1", prefix="TEST", start=7)
    gene_sets = [[0, 2, 2, 1, 0, 0, 0], [3, 1, 4, 2, 5, 1, 2], [7, 4, 0, 2, 4, 5, 4], [1, 0, 3, 0, 2, 3, 1]]
    return {
        "about": "Made by tools/studio/tests/make_parity.py from the desktop Studio. Don't edit by hand.",
        "project": project.to_json(),
        "persona": {"name": persona.name, "genes": persona.genes, "serial": persona.serial,
                    "favourites": persona.favourites},
        "pack_project_hex": encode_pack(project).hex(),
        "pack_persona_hex": encode_pack(project, persona).hex(),
        "pack_empty_persona_hex": encode_pack(None, persona).hex(),
        "batch": {"count": 50, "seed": "parity-1", "prefix": "TEST", "start": 7,
                  "rows": [factory.persona_row(p) for p in batch]},
        "quotas": {str(n): factory.quotas(n, factory.DEFAULT_MIX) for n in (1, 7, 50, 333)},
        "genes": [{"genes": g, "code": native.genes_code(g), "rarity": native.genes_rarity(g),
                   "probability": native.genes_probability(g)} for g in gene_sets],
        "mac": {"mac": "24:0A:C4:82:B7:0E", "seed": native.mac_seed("24:0A:C4:82:B7:0E"),
                "genes": native.genes_from_seed(native.mac_seed("24:0A:C4:82:B7:0E")),
                "name": native.name_from_seed(native.mac_seed("24:0A:C4:82:B7:0E"))},
    }


def main():
    text = json.dumps(build(), indent=1) + "\n"
    if "--check" in sys.argv:
        old = open(OUT).read() if os.path.exists(OUT) else ""
        if old != text:
            sys.stderr.write(f"{OUT} is out of date: run tools/studio/tests/make_parity.py and commit it.\n")
            sys.exit(1)
        print("studio_parity.json is up to date")
        return
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else OUT
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", newline="\n") as fh:
        fh.write(text)
    print("wrote", out)


if __name__ == "__main__":
    main()
