"""Faces, animations, personas and the emotion-pack file format.

The byte layouts here mirror firmware/lib/lumi_core/src/pack.cpp exactly; the
tests check Studio's packs against the firmware's own decoder and encoder.
"""
import json
import math
import struct
import zlib
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

from . import native

EYE_STYLES = ["normal", "heart", "spiral", "cross", "star", "happy arc", "closed", "squint", "dot", "ring"]
MOUTHS = ["none", "smile", "big smile", "flat", "frown", "o", "cat", "wavy", "tongue", "smirk", "teeth"]
SHINES = ["square", "none", "dot", "double", "star", "ring"]
ACCENTS = ["none", "lashes", "brows", "freckles", "blush", "beauty mark"]
MOTIONS = ["none", "shake", "bounce", "wobble", "tremble", "hop"]
EFFECTS = ["zzz", "sweat", "tears", "blush", "sparkles", "question", "exclaim", "anger", "notes", "hearts",
           "low battery", "speed lines"]
RARITIES = ["common", "uncommon", "rare", "legendary"]

MAX_FACES = 32
MAX_ANIMS = 32
MAX_KEYS = 12
MAX_PACK = 8192
NAME_LEN = 23  # bytes, without terminator

# (key, byte offset, scale, signed, min, max, label) for every numeric Face field.
NUMERIC = [
    ("eyeW", 0, 4, False, 0, 63.75, "Eye width"),
    ("eyeH", 1, 4, False, 0, 63.75, "Eye height"),
    ("eyeR", 2, 4, False, 0, 63.75, "Corner roundness"),
    ("spacing", 3, 2, False, 0, 127.5, "Eye spacing"),
    ("eyeY", 4, 2, False, 0, 63.5, "Eye height on screen"),
    ("lookX", 5, 2, True, -64, 63.5, "Look left / right"),
    ("lookY", 6, 2, True, -64, 63.5, "Look up / down"),
    ("openL", 7, 250, False, 0, 1.02, "Left eye open"),
    ("openR", 8, 250, False, 0, 1.02, "Right eye open"),
    ("slant", 9, 4, True, -32, 31.75, "Brow slant (angry + / sad -)"),
    ("cheek", 10, 250, False, 0, 1.02, "Smiling cheeks"),
    ("scaleL", 11, 100, False, 0, 2.55, "Left eye size"),
    ("scaleR", 12, 100, False, 0, 2.55, "Right eye size"),
    ("shine", 13, 250, False, 0, 1.02, "Show highlight"),
    ("mouthW", 14, 4, False, 0, 63.75, "Mouth width"),
    ("mouthOpen", 15, 250, False, 0, 1.02, "Mouth open"),
    ("mouthY", 16, 2, False, 0, 127.5, "Mouth height on screen"),
    ("offX", 17, 2, True, -64, 63.5, "Whole face left / right"),
    ("offY", 18, 2, True, -64, 63.5, "Whole face up / down"),
    ("baseSlant", 19, 4, True, -32, 31.75, "Resting eye tilt"),
]
ENUMS = [("styleL", 20, EYE_STYLES), ("styleR", 21, EYE_STYLES), ("mouth", 22, MOUTHS),
         ("shineStyle", 23, SHINES), ("accent", 24, ACCENTS)]


def _q(v, scale, signed):
    x = math.floor(v * scale + 0.5)
    lo, hi = (-128, 127) if signed else (0, 255)
    return max(lo, min(hi, x))


class Face:
    """A face's parameters. Values are stored as the pack will quantize them."""

    def __init__(self, values=None):
        self.values: Dict[str, float] = {}
        self.styles: Dict[str, int] = {}
        self.fx: int = 0
        self.set_bytes(native.expression_bytes(0))
        if values:
            self.update(values)

    @classmethod
    def from_expression(cls, index):
        f = cls()
        f.set_bytes(native.expression_bytes(index))
        return f

    def set_bytes(self, b):
        b = bytes(b)
        for key, off, scale, signed, *_ in NUMERIC:
            raw = struct.unpack_from("b" if signed else "B", b, off)[0]
            self.values[key] = raw / scale
        for key, off, _ in ENUMS:
            self.styles[key] = b[off]
        self.fx = b[25] | b[26] << 8

    def to_bytes(self):
        b = bytearray(32)
        for key, off, scale, signed, *_ in NUMERIC:
            struct.pack_into("b" if signed else "B", b, off, _q(self.values[key], scale, signed))
        for key, off, _ in ENUMS:
            b[off] = self.styles[key]
        b[25] = self.fx & 0xFF
        b[26] = self.fx >> 8
        return bytes(b)

    def update(self, d):
        for k, v in d.items():
            if k in self.values:
                self.values[k] = float(v)
            elif k in self.styles:
                self.styles[k] = int(v)
            elif k == "fx":
                self.fx = int(v)
        # Snap to what the pack can store.
        self.set_bytes(self.to_bytes())

    def to_json(self):
        d = dict(self.values)
        d.update(self.styles)
        d["fx"] = self.fx
        return d

    def copy(self):
        f = Face()
        f.set_bytes(self.to_bytes())
        return f


@dataclass
class Key:
    face: str = "expr:neutral"  # "expr:<name>" or "custom:<face name>"
    lookX: int = 0
    lookY: int = 0
    motion: str = "none"
    tween: int = 200
    hold: int = 600
    fx: List[str] = field(default_factory=list)
    eyes: str = "keep"   # "keep" or an EYE_STYLES name
    mouth: str = "keep"  # "keep" or a MOUTHS name


@dataclass
class AnimationDef:
    name: str
    trigger: str = "pat"
    moodMin: int = 0
    moodMax: int = 100
    weight: int = 1
    keys: List[Key] = field(default_factory=list)


@dataclass
class Persona:
    name: str
    genes: List[int]
    serial: str = ""
    favourites: List[str] = field(default_factory=list)

    @property
    def rarity(self):
        return native.genes_rarity(self.genes)

    @property
    def look(self):
        return native.genes_code(self.genes)


def fx_mask(names):
    m = 0
    for n in names:
        if n not in EFFECTS:
            raise ValueError(f"unknown effect {n!r}")
        m |= 1 << EFFECTS.index(n)
    return m


def fx_names(mask):
    return [n for i, n in enumerate(EFFECTS) if mask & (1 << i)]


class Project:
    """Everything a designer makes: custom faces and animations. Saved as .lumiproject (JSON)."""

    VERSION = 1

    def __init__(self):
        self.faces: Dict[str, Face] = {}
        self.animations: List[AnimationDef] = []

    # ---- persistence ----
    def to_json(self):
        return {
            "version": self.VERSION,
            "faces": [{"name": n, "params": f.to_json()} for n, f in self.faces.items()],
            "animations": [asdict(a) for a in self.animations],
        }

    @classmethod
    def from_json(cls, d):
        p = cls()
        for item in d.get("faces", []):
            p.faces[item["name"]] = Face(item["params"])
        for a in d.get("animations", []):
            keys = [Key(**k) for k in a.get("keys", [])]
            p.animations.append(AnimationDef(**{**a, "keys": keys}))
        return p

    def save(self, path):
        with open(path, "w") as f:
            json.dump(self.to_json(), f, indent=2)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            return cls.from_json(json.load(f))

    # ---- checks ----
    def problems(self):
        """Human-readable reasons this project can't be packed (empty if fine)."""
        out = []
        exprs = native.expression_names()
        triggers = native.trigger_names()
        if len(self.faces) > MAX_FACES:
            out.append(f"Too many custom faces: {len(self.faces)} (max {MAX_FACES}).")
        if len(self.animations) > MAX_ANIMS:
            out.append(f"Too many animations: {len(self.animations)} (max {MAX_ANIMS}).")
        names = set()
        for a in self.animations:
            label = f"Animation '{a.name or '?'}'"
            if not a.name or len(a.name.encode()) > NAME_LEN:
                out.append(f"{label}: name must be 1-{NAME_LEN} characters.")
            if a.name in names:
                out.append(f"{label}: name used twice.")
            names.add(a.name)
            if a.trigger not in triggers:
                out.append(f"{label}: unknown trigger '{a.trigger}'.")
            if not (0 <= a.moodMin <= a.moodMax <= 100):
                out.append(f"{label}: mood range must be 0-100 with min <= max.")
            if not 1 <= a.weight <= 10:
                out.append(f"{label}: weight must be 1-10.")
            if not 1 <= len(a.keys) <= MAX_KEYS:
                out.append(f"{label}: needs 1-{MAX_KEYS} keys.")
            for i, k in enumerate(a.keys, 1):
                kind, _, ref = k.face.partition(":")
                if kind == "expr" and ref not in exprs:
                    out.append(f"{label} key {i}: unknown expression '{ref}'.")
                elif kind == "custom" and ref not in self.faces:
                    out.append(f"{label} key {i}: no custom face called '{ref}'.")
                elif kind not in ("expr", "custom"):
                    out.append(f"{label} key {i}: bad face reference '{k.face}'.")
                if k.tween + k.hold > 20000 or k.tween < 0 or k.hold < 0:
                    out.append(f"{label} key {i}: tween + hold must be 0-20000 ms.")
                if k.motion not in MOTIONS:
                    out.append(f"{label} key {i}: unknown motion '{k.motion}'.")
                if k.eyes != "keep" and k.eyes not in EYE_STYLES:
                    out.append(f"{label} key {i}: unknown eye style '{k.eyes}'.")
                if k.mouth != "keep" and k.mouth not in MOUTHS:
                    out.append(f"{label} key {i}: unknown mouth '{k.mouth}'.")
                if not (-128 <= k.lookX <= 127 and -128 <= k.lookY <= 127):
                    out.append(f"{label} key {i}: look must be -128..127.")
        return out


# ---- pack encoding -------------------------------------------------------------

def _str(s, max_len):
    b = s.encode("utf-8")[:max_len]
    return bytes([len(b)]) + b


def encode_pack(project: Optional[Project] = None, persona: Optional[Persona] = None) -> bytes:
    """Builds an emotion pack. Raises ValueError with the reasons if it can't."""
    project = project or Project()
    problems = project.problems()
    if persona is not None:
        if len(persona.genes) != native.GENE_COUNT:
            problems.append("Persona genes must have 7 values.")
        if len(persona.favourites) > 4:
            problems.append("A persona can have at most 4 favourite animations.")
    if problems:
        raise ValueError("\n".join(problems))

    exprs = native.expression_names()
    triggers = native.trigger_names()
    face_names = list(project.faces)
    payload = bytearray()

    if project.faces:
        body = bytes([len(face_names)]) + b"".join(project.faces[n].to_bytes() for n in face_names)
        payload += struct.pack("<BH", 1, len(body)) + body
    if project.animations:
        body = bytearray([len(project.animations)])
        for a in project.animations:
            body += _str(a.name, NAME_LEN)
            body += bytes([triggers.index(a.trigger), a.moodMin, a.moodMax, a.weight, len(a.keys)])
            for k in a.keys:
                kind, _, ref = k.face.partition(":")
                r = face_names.index(ref) if kind == "custom" else -1 - exprs.index(ref)
                eyes = -1 if k.eyes == "keep" else EYE_STYLES.index(k.eyes)
                mouth = -1 if k.mouth == "keep" else MOUTHS.index(k.mouth)
                body += struct.pack("<hbbBHHHbb", r, k.lookX, k.lookY, MOTIONS.index(k.motion), k.tween, k.hold,
                                    fx_mask(k.fx), eyes, mouth)
        payload += struct.pack("<BH", 2, len(body)) + body
    if persona is not None:
        body = bytearray()
        body += _str(persona.name, 15)
        body += _str(persona.serial, NAME_LEN)
        body += bytes(persona.genes)
        body += bytes([len(persona.favourites)])
        for fav in persona.favourites:
            body += _str(fav, NAME_LEN)
        payload += struct.pack("<BH", 3, len(body)) + body

    header = b"LPK1" + struct.pack("<BBHII", 1, 0, 0, len(payload), zlib.crc32(bytes(payload)) & 0xFFFFFFFF)
    data = header + bytes(payload)
    if len(data) > MAX_PACK:
        raise ValueError(f"Pack is {len(data)} bytes; the limit is {MAX_PACK}. Remove some faces or animations.")
    ok, msg = native.validate_pack(data)
    if not ok:  # pragma: no cover - would mean Studio and firmware disagree
        raise ValueError(f"The firmware would reject this pack: {msg}")
    return data


def export_firmware_header(data: bytes, path: str):
    """Writes generated/default_pack.h so every unit built from it ships with these emotions."""
    lines = []
    for i in range(0, len(data), 16):
        lines.append("    " + ", ".join(f"0x{b:02X}" for b in data[i:i + 16]) + ",")
    body = "\n".join(lines) if data else "    0"
    text = f"""// Emotions built into every Lumi. Lumi Studio overwrites this file with
// "Export to firmware"; rebuild and flash afterwards.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace lumi {{

static const uint8_t kDefaultPack[] = {{
{body}
}};
static const size_t kDefaultPackSize = {len(data)};

}}  // namespace lumi
"""
    with open(path, "w") as f:
        f.write(text)
