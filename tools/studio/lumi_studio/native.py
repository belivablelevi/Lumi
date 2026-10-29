"""ctypes bindings to liblumicore: Lumi's real face engine, genes and packs.

The library is looked up, in order, at $LUMI_CORE_LIB, next to this package
(as bundled in the packaged app), and in the repository's build/studio folder
(after `cmake --build build/studio`).
"""
import ctypes
import os
import sys
import threading
from functools import lru_cache

FRAME_BYTES = 1024
FACE_BYTES = 32
GENE_COUNT = 7

_LOCK = threading.RLock()  # the pack helpers below share static state in the library
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))


def _lib_names():
    if sys.platform == "win32":
        return ["lumicore.dll", "liblumicore.dll"]
    if sys.platform == "darwin":
        return ["liblumicore.dylib"]
    return ["liblumicore.so"]


def _candidates():
    env = os.environ.get("LUMI_CORE_LIB")
    if env:
        yield env
    bases = [_HERE, getattr(sys, "_MEIPASS", ""), os.path.join(_REPO, "build", "studio"),
             os.path.join(_REPO, "build", "studio", "Release")]
    for base in bases:
        if base:
            for name in _lib_names():
                yield os.path.join(base, name)


def find_tool(name):
    """Path of a helper executable such as virtual_lumi, or None."""
    exe = name + (".exe" if sys.platform == "win32" else "")
    for base in [_HERE, getattr(sys, "_MEIPASS", ""), os.path.join(_REPO, "build", "studio")]:
        path = os.path.join(base, exe) if base else ""
        if path and os.path.exists(path):
            return path
    return None


@lru_cache(maxsize=1)
def lib():
    errors = []
    for path in _candidates():
        if os.path.exists(path):
            try:
                return _bind(ctypes.CDLL(path))
            except OSError as e:  # pragma: no cover - platform specific
                errors.append(f"{path}: {e}")
    raise RuntimeError(
        "Could not find liblumicore. Build it with:\n"
        "  cmake -S tools/studio -B build/studio && cmake --build build/studio --config Release\n"
        + "\n".join(errors))


def _bind(L):
    u8p = ctypes.POINTER(ctypes.c_uint8)
    sigs = {
        "lumi_version": (ctypes.c_char_p, []),
        "lumi_expr_count": (ctypes.c_int, []),
        "lumi_expr_name": (ctypes.c_char_p, [ctypes.c_int]),
        "lumi_expression": (None, [ctypes.c_int, u8p]),
        "lumi_render_face": (None, [u8p, u8p, ctypes.c_uint32, u8p]),
        "lumi_render_expression": (None, [ctypes.c_int, u8p, ctypes.c_uint32, u8p]),
        "lumi_gene_count": (ctypes.c_int, []),
        "lumi_gene_name": (ctypes.c_char_p, [ctypes.c_int]),
        "lumi_gene_options": (ctypes.c_int, [ctypes.c_int]),
        "lumi_gene_option_name": (ctypes.c_char_p, [ctypes.c_int, ctypes.c_int]),
        "lumi_gene_weight": (ctypes.c_int, [ctypes.c_int, ctypes.c_int]),
        "lumi_genes_from_seed": (None, [ctypes.c_uint64, u8p]),
        "lumi_name_from_seed": (None, [ctypes.c_uint64, ctypes.c_char_p, ctypes.c_int]),
        "lumi_genes_code": (ctypes.c_uint32, [u8p]),
        "lumi_look_count": (ctypes.c_uint32, []),
        "lumi_genes_probability": (ctypes.c_double, [u8p]),
        "lumi_genes_rarity": (ctypes.c_int, [u8p]),
        "lumi_rarity_name": (ctypes.c_char_p, [ctypes.c_int]),
        "lumi_trigger_count": (ctypes.c_int, []),
        "lumi_trigger_name": (ctypes.c_char_p, [ctypes.c_int]),
        "lumi_builtin_anim_count": (ctypes.c_int, []),
        "lumi_builtin_anim_name": (ctypes.c_char_p, [ctypes.c_int]),
        "lumi_builtin_anim_trigger": (ctypes.c_int, [ctypes.c_int]),
        "lumi_pack_validate": (ctypes.c_int, [u8p, ctypes.c_size_t, ctypes.c_char_p, ctypes.c_int]),
        "lumi_pack_reencode": (ctypes.c_size_t, [u8p, ctypes.c_size_t, u8p, ctypes.c_size_t]),
        "lumi_player_new": (ctypes.c_void_p, [ctypes.c_uint32]),
        "lumi_player_free": (None, [ctypes.c_void_p]),
        "lumi_player_load_pack": (ctypes.c_int, [ctypes.c_void_p, u8p, ctypes.c_size_t]),
        "lumi_player_set_genes": (None, [ctypes.c_void_p, u8p]),
        "lumi_player_set_base": (None, [ctypes.c_void_p, ctypes.c_int]),
        "lumi_player_set_idle": (None, [ctypes.c_void_p, ctypes.c_int]),
        "lumi_player_play": (ctypes.c_int, [ctypes.c_void_p, ctypes.c_char_p]),
        "lumi_player_stop": (None, [ctypes.c_void_p]),
        "lumi_player_busy": (ctypes.c_int, [ctypes.c_void_p]),
        "lumi_player_update": (None, [ctypes.c_void_p, ctypes.c_uint32]),
        "lumi_player_render": (None, [ctypes.c_void_p, u8p]),
        "lumi_anim_count": (ctypes.c_int, []),
        "lumi_anim_name": (ctypes.c_char_p, [ctypes.c_int]),
    }
    for name, (res, args) in sigs.items():
        fn = getattr(L, name)
        fn.restype = res
        fn.argtypes = args
    return L


def _buf(data):
    data = bytes(data)
    return (ctypes.c_uint8 * max(1, len(data))).from_buffer_copy(data or b"\0")


def _out(n):
    return (ctypes.c_uint8 * n)()


def _s(b):
    return b.decode("utf-8") if b else ""


# ---- expressions & rendering ------------------------------------------------

def version():
    return _s(lib().lumi_version())


def expression_names():
    L = lib()
    return [_s(L.lumi_expr_name(i)) for i in range(L.lumi_expr_count())]


def expression_bytes(index):
    out = _out(FACE_BYTES)
    lib().lumi_expression(index, out)
    return bytes(out)


def render_face(face_bytes, genes=None, t_ms=600):
    out = _out(FRAME_BYTES)
    g = _buf(genes) if genes is not None else None
    lib().lumi_render_face(_buf(face_bytes), g, t_ms, out)
    return bytes(out)


def render_expression(index, genes=None, t_ms=600):
    """A built-in expression rendered straight from the firmware's float values."""
    out = _out(FRAME_BYTES)
    g = _buf(genes) if genes is not None else None
    lib().lumi_render_expression(index, g, t_ms, out)
    return bytes(out)


def frame_diff(a, b):
    """Number of pixels that differ between two frames."""
    return sum(bin(x ^ y).count("1") for x, y in zip(a, b))


# ---- genes -------------------------------------------------------------------

def gene_names():
    L = lib()
    return [_s(L.lumi_gene_name(g)) for g in range(L.lumi_gene_count())]


def gene_options(gene):
    L = lib()
    return [_s(L.lumi_gene_option_name(gene, o)) for o in range(L.lumi_gene_options(gene))]


def gene_weights(gene):
    L = lib()
    return [L.lumi_gene_weight(gene, o) for o in range(L.lumi_gene_options(gene))]


def genes_from_seed(seed):
    out = _out(GENE_COUNT)
    lib().lumi_genes_from_seed(seed & 0xFFFFFFFFFFFFFFFF, out)
    return list(out)


def name_from_seed(seed):
    buf = ctypes.create_string_buffer(16)
    lib().lumi_name_from_seed(seed & 0xFFFFFFFFFFFFFFFF, buf, 16)
    return _s(buf.value)


def genes_code(genes):
    return lib().lumi_genes_code(_buf(genes))


def genes_from_code(code):
    """The genes for a look number (the inverse of genes_code)."""
    genes = []
    for g in reversed(range(GENE_COUNT)):
        n = lib().lumi_gene_options(g)
        genes.append(code % n)
        code //= n
    return genes[::-1]


def look_count():
    return lib().lumi_look_count()


def genes_probability(genes):
    return lib().lumi_genes_probability(_buf(genes))


def rarity_names():
    return [_s(lib().lumi_rarity_name(i)) for i in range(4)]


def genes_rarity(genes):
    return rarity_names()[lib().lumi_genes_rarity(_buf(genes))]


def mac_seed(mac):
    """The seed a unit uses for its automatic persona: its MAC as a 48-bit number."""
    parts = [int(p, 16) for p in mac.replace("-", ":").split(":")]
    if len(parts) != 6 or any(p < 0 or p > 255 for p in parts):
        raise ValueError(f"not a MAC address: {mac!r}")
    v = 0
    for p in parts:
        v = v << 8 | p
    return v


# ---- triggers & animations ----------------------------------------------------

def trigger_names():
    L = lib()
    return [_s(L.lumi_trigger_name(i)) for i in range(L.lumi_trigger_count())]


def builtin_animations():
    L = lib()
    trig = trigger_names()
    return [(_s(L.lumi_builtin_anim_name(i)), trig[L.lumi_builtin_anim_trigger(i)])
            for i in range(L.lumi_builtin_anim_count())]


# ---- packs -------------------------------------------------------------------

def validate_pack(data):
    """Returns (ok, message) using the firmware's own decoder."""
    err = ctypes.create_string_buffer(64)
    with _LOCK:
        code = lib().lumi_pack_validate(_buf(data), len(data), err, 64)
    return code == 0, _s(err.value)


def reencode_pack(data):
    out = _out(8192)
    with _LOCK:
        n = lib().lumi_pack_reencode(_buf(data), len(data), out, 8192)
    return bytes(out[:n])


class Player:
    """The firmware's Animator: plays animations with blinks and breathing."""

    def __init__(self, seed=1):
        self._L = lib()
        self._p = self._L.lumi_player_new(seed)

    def close(self):
        if self._p:
            self._L.lumi_player_free(self._p)
            self._p = None

    def __del__(self):  # pragma: no cover
        try:
            self.close()
        except Exception:
            pass

    def load_pack(self, data):
        return self._L.lumi_player_load_pack(self._p, _buf(data) if data else None, len(data or b""))

    def set_genes(self, genes):
        self._L.lumi_player_set_genes(self._p, _buf(genes) if genes is not None else None)

    def set_base(self, expr_index):
        self._L.lumi_player_set_base(self._p, expr_index)

    def set_idle(self, on):
        self._L.lumi_player_set_idle(self._p, 1 if on else 0)

    def play(self, name):
        return self._L.lumi_player_play(self._p, name.encode())

    def stop(self):
        self._L.lumi_player_stop(self._p)

    def busy(self):
        return bool(self._L.lumi_player_busy(self._p))

    def update(self, t_ms):
        self._L.lumi_player_update(self._p, t_ms & 0xFFFFFFFF)

    def render(self):
        out = _out(FRAME_BYTES)
        self._L.lumi_player_render(self._p, out)
        return bytes(out)

    def animation_names(self):
        return [_s(self._L.lumi_anim_name(i)) for i in range(self._L.lumi_anim_count())]


def pixel(frame, x, y):
    return bool(frame[(y >> 3) * 128 + x] & (1 << (y & 7)))
