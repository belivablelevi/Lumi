"""Factory batches: unique personas, manifests and provisioning records."""
import csv
import hashlib
import os
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from . import native
from .model import Persona, RARITIES

DEFAULT_MIX = {"common": 0.60, "uncommon": 0.25, "rare": 0.12, "legendary": 0.03}
MANIFEST_FIELDS = ["serial", "name", "rarity", "look", "eye_shape", "eye_size", "spacing", "height", "highlight",
                   "accent", "temperament", "genes", "mac", "provisioned_at"]


def _seed(batch_seed: str, i: int) -> int:
    h = hashlib.sha256(f"{batch_seed}:{i}".encode()).digest()
    return int.from_bytes(h[:8], "little")


def quotas(count: int, mix: Dict[str, float]) -> Dict[str, int]:
    """Splits `count` units across rarity tiers, largest remainders first."""
    total = sum(mix.values()) or 1
    raw = {r: count * mix.get(r, 0) / total for r in RARITIES}
    q = {r: int(v) for r, v in raw.items()}
    for r in sorted(RARITIES, key=lambda r: raw[r] - q[r], reverse=True)[: count - sum(q.values())]:
        q[r] += 1
    return q


def generate_batch(count: int, batch_seed: str = "batch-1", mix: Optional[Dict[str, float]] = None,
                   prefix: str = "LUMI", start: int = 1, avoid_looks: Iterable[int] = (),
                   avoid_names: Iterable[str] = (), max_tries: int = 5_000_000) -> List[Persona]:
    """Unique personas: no two share a look or a name (also against `avoid_*`, e.g. earlier batches).

    The same arguments always give the same batch, so a batch can be regenerated
    from its seed.
    """
    need = quotas(count, mix or DEFAULT_MIX)
    used_looks = set(avoid_looks)
    used_names = {n.lower() for n in avoid_names}
    out: List[Persona] = []
    i = 0
    while sum(need.values()) and i < max_tries:
        s = _seed(batch_seed, i)
        i += 1
        genes = native.genes_from_seed(s)
        tier = native.genes_rarity(genes)
        look = native.genes_code(genes)
        if need[tier] <= 0 or look in used_looks:
            continue
        name = native.name_from_seed(s)
        k = 0
        while name.lower() in used_names and k < 64:
            k += 1
            name = native.name_from_seed(s ^ (k * 0x9E3779B97F4A7C15))
        if name.lower() in used_names:
            continue
        used_looks.add(look)
        used_names.add(name.lower())
        need[tier] -= 1
        out.append(Persona(name=name, genes=genes))
    if sum(need.values()):
        missing = ", ".join(f"{v} {r}" for r, v in need.items() if v)
        raise RuntimeError(f"Ran out of unique looks before filling the batch (still need {missing}).")
    # Interleave tiers so rare units aren't all at the end of the line.
    out.sort(key=lambda p: hashlib.sha256(f"{batch_seed}/{p.name}".encode()).digest())
    for n, p in enumerate(out):
        p.serial = f"{prefix}-{start + n:06d}"
    return out


def persona_row(p: Persona, mac: str = "", when: str = "") -> Dict[str, str]:
    opts = [native.gene_options(g) for g in range(native.GENE_COUNT)]
    g = p.genes
    return {
        "serial": p.serial, "name": p.name, "rarity": p.rarity, "look": str(p.look),
        "eye_shape": opts[0][g[0]], "eye_size": opts[1][g[1]], "spacing": opts[2][g[2]], "height": opts[3][g[3]],
        "highlight": opts[4][g[4]], "accent": opts[5][g[5]], "temperament": opts[6][g[6]],
        "genes": " ".join(str(v) for v in g), "mac": mac, "provisioned_at": when,
    }


def write_manifest(path: str, rows: List[Dict[str, str]]):
    tmp = path + ".tmp"
    with open(tmp, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in MANIFEST_FIELDS})
    os.replace(tmp, path)


def read_manifest(path: str) -> List[Dict[str, str]]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def row_persona(row: Dict[str, str]) -> Persona:
    return Persona(name=row["name"], serial=row["serial"], genes=[int(v) for v in row["genes"].split()])


def next_unprovisioned(rows: List[Dict[str, str]]) -> Optional[int]:
    for i, r in enumerate(rows):
        if not r.get("mac"):
            return i
    return None


def mark_provisioned(rows: List[Dict[str, str]], index: int, mac: str):
    for i, r in enumerate(rows):
        if i != index and r.get("mac", "").upper() == mac.upper():
            raise ValueError(f"{mac} was already provisioned as {r['serial']} ({r['name']}).")
    rows[index]["mac"] = mac.upper()
    rows[index]["provisioned_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def release_mac(rows: List[Dict[str, str]], mac: str, keep: Optional[int] = None) -> List[int]:
    """Frees the rows recorded for `mac` (except `keep`): that unit is being given another persona."""
    freed = []
    for i, r in enumerate(rows):
        if i != keep and r.get("mac", "").upper() == mac.upper():
            r["mac"] = ""
            r["provisioned_at"] = ""
            freed.append(i)
    return freed
