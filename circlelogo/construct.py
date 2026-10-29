"""The circle-method pipeline: image -> outline -> arcs -> snapped circles -> logo."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import geometry as g
from .segment import segment_contour
from .silhouette import extract_contours, load_mask

PHI = (1 + 5 ** 0.5) / 2
FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597]


@dataclass
class Circle:
    center: np.ndarray
    radius: float
    label: str = ""


@dataclass
class Piece:
    kind: str  # "arc" or "line"
    pts: np.ndarray
    circle: int | None = None
    line: tuple[np.ndarray, np.ndarray] | None = None  # (point, direction) for lines
    fit: tuple[np.ndarray, float] | None = None  # free (center, radius) before snapping
    start: np.ndarray | None = None
    end: np.ndarray | None = None
    sweep: float = 0.0  # signed angle swept, for arcs


@dataclass
class Outline:
    pieces: list[Piece]
    is_hole: bool


@dataclass
class Logo:
    size: int
    circles: list[Circle]
    outlines: list[Outline]
    mask: np.ndarray
    scale: str
    unit: float
    tol: float
    stats: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- radii

def allowed_radii(scale: str, unit: float, r_max: float) -> np.ndarray:
    if scale == "golden":
        k_lo = math.floor(math.log(1e-3 * r_max / unit, PHI))
        k_hi = math.ceil(math.log(10 * r_max / unit, PHI))
        return unit * PHI ** np.arange(k_lo, k_hi + 1)
    if scale == "fibonacci":
        return unit * np.array(FIBONACCI, dtype=float)
    raise ValueError(f"unknown scale {scale!r}")


def choose_unit(scale: str, radii: np.ndarray, weights: np.ndarray) -> float:
    """Unit that lets the measured radii snap to the scale with least (log) error."""
    lr = np.log(radii)
    r_min, r_max = radii.min(), radii.max()
    if scale == "golden":
        units = r_min * PHI ** np.linspace(-1, 0, 241)[1:]
    else:
        units = np.exp(np.linspace(math.log(r_max / FIBONACCI[-1]), math.log(r_min), 400))
    costs = []
    for u in units:
        la = np.log(allowed_radii(scale, u, r_max))
        d = np.abs(lr[:, None] - la[None, :]).min(axis=1)
        costs.append(float((weights * d * d).sum()))
    costs = np.array(costs)
    # Among near-optimal units prefer the largest (smaller, simpler multipliers).
    ok = np.nonzero(costs <= costs.min() * 1.05 + 1e-12)[0]
    return float(units[ok[-1]])


def radius_label(scale: str, unit: float, r: float, r_top: float) -> str:
    if scale == "golden":
        k = round(math.log(r_top / r, PHI))
        return "R" if k == 0 else f"R/φ^{k}"
    if scale == "fibonacci":
        return str(round(r / unit))
    return f"{r:.1f}"


def snap_arc(pts, c, r, choices, tol):
    """Pick the allowed radius (just below or above r) that fits pts best."""
    if choices is None:
        return c, r, g.circle_error(pts, c, r)
    half_chord = math.dist(pts[0], pts[-1]) / 2
    below = choices[choices <= r]
    above = choices[choices >= r]
    cands = list(below[-1:]) + list(above[:1])
    cands = [x for x in cands if x >= half_chord * 0.999] or list(choices[choices >= half_chord][:1])
    best = None
    for rr in cands:
        cc = g.fit_center_fixed_radius(pts, rr, c)
        e = g.circle_error(pts, cc, rr)
        if best is None or e < best[2]:
            best = (cc, float(rr), e)
    return best if best else (c, r, g.circle_error(pts, c, r))


# --------------------------------------------------------------------------- joints

def _intersections(a: Piece, b: Piece, circles):
    if a.kind == "arc" and b.kind == "arc":
        ca, cb = circles[a.circle], circles[b.circle]
        return g.circle_circle(ca.center, ca.radius, cb.center, cb.radius)
    if a.kind == "line" and b.kind == "line":
        return g.line_line(*a.line, *b.line)
    arc, ln = (a, b) if a.kind == "arc" else (b, a)
    c = circles[arc.circle]
    return g.line_circle(*ln.line, c.center, c.radius)


def _project(piece: Piece, p, circles):
    if piece.kind == "arc":
        c = circles[piece.circle]
        return g.project_to_circle(p, c.center, c.radius)
    return g.project_to_line(p, *piece.line)


def _set_joints(outline: Outline, circles, limit: float):
    ps = outline.pieces
    n = len(ps)
    for k in range(n):
        a, b = ps[k], ps[(k + 1) % n]
        p = a.pts[-1]
        if n == 1:
            q = _project(a, p, circles)
            a.end, a.start = q, q
            break
        cands = _intersections(a, b, circles)
        q = min(cands, key=lambda x: math.dist(x, p)) if cands else None
        # Snapping radii can slide an intersection a long way along big arcs (e.g. the
        # horns of a crescent), so allow distances proportional to the arcs' size.
        span = min(math.dist(a.pts[0], a.pts[-1]), math.dist(b.pts[0], b.pts[-1]))
        if q is not None and math.dist(q, p) <= max(limit, 0.4 * span):
            a.end, b.start = q, q
        else:
            a.end, b.start = _project(a, p, circles), _project(b, p, circles)


def _make_tangent(outlines: list[Outline], circles, members, limit: float, passes: int = 3):
    """Where neighbouring arcs meet smoothly but their circles miss each other (or
    cross far from the joint), slide one circle so the two become exactly tangent,
    the way a designer would draw them."""
    weight = [sum(len(m.pts) for m in ms) for ms in members]
    for _ in range(passes):
        moved = False
        for ol in outlines:
            ps = ol.pieces
            for k in range(len(ps) if len(ps) > 1 else 0):
                a, b = ps[k], ps[(k + 1) % len(ps)]
                if a.kind != "arc" or b.kind != "arc" or a.circle == b.circle:
                    continue
                p = a.pts[-1]
                cands = _intersections(a, b, circles)
                if cands and min(math.dist(q, p) for q in cands) <= limit:
                    continue
                ca, cb = circles[a.circle], circles[b.circle]
                d = math.dist(ca.center, cb.center)
                if d < 1e-9:
                    continue
                gaps = [d - (ca.radius + cb.radius), d - abs(ca.radius - cb.radius)]
                gap = min(gaps, key=abs)
                if abs(gap) < 1e-6 or abs(gap) > limit:
                    continue
                u = (cb.center - ca.center) / d
                if weight[b.circle] <= weight[a.circle]:
                    cb.center = cb.center - gap * u
                else:
                    ca.center = ca.center + gap * u
                moved = True
        if not moved:
            break


def _set_sweeps(outline: Outline, circles):
    for pc in outline.pieces:
        if pc.kind != "arc":
            continue
        c = circles[pc.circle].center
        ang = np.unwrap(np.arctan2(pc.pts[:, 1] - c[1], pc.pts[:, 0] - c[0]))
        total = ang[-1] - ang[0]
        sign = 1.0 if total >= 0 else -1.0
        t0 = math.atan2(pc.start[1] - c[1], pc.start[0] - c[0])
        t1 = math.atan2(pc.end[1] - c[1], pc.end[0] - c[0])
        delta = (sign * (t1 - t0)) % g.TAU * sign
        if len(outline.pieces) == 1 or (abs(delta) < 1e-6 and abs(total) > math.pi):
            delta = sign * g.TAU
        elif abs(delta) > abs(total) + math.pi:
            delta -= sign * g.TAU  # joint slid slightly past the arc's start
        pc.sweep = delta


# --------------------------------------------------------------------------- pipeline

def circleize(image, tolerance: float = 0.012, scale: str = "golden", corner_deg: float = 40.0,
              allow_lines: bool = False, merge: bool = True, size: int = 600,
              invert: bool | None = None, threshold: int | None = None) -> Logo:
    """Rebuild the main shape of `image` from arcs of a small set of circles.

    tolerance: max deviation from the traced outline, as a fraction of the shape's
               diagonal. Larger -> fewer circles -> simpler, more stylised logo.
    scale:     "golden" (radii are R, R/φ, R/φ², ...), "fibonacci" (unit × 1,2,3,5,8...)
               or "free" (no snapping).
    """
    mask = load_mask(image, size=size, invert=invert, threshold=threshold)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise ValueError("no foreground shape found in image")
    diag = math.hypot(np.ptp(xs), np.ptp(ys))
    tol = tolerance * diag
    spacing = max(1.0, min(3.0, tol / 3))
    contours = extract_contours(mask, spacing=spacing)

    # 1. Split each outline into circle-fitting pieces and fit them freely.
    raw: list[tuple[list[Piece], bool]] = []
    for ct in contours:
        ext, spans, _ = segment_contour(ct.points, tol, diag, corner_deg, allow_lines)
        pieces = []
        for i, j in spans:
            pts = ext[i:j + 1]
            if len(pts) < 3:
                continue  # sub-sample slivers: neighbours' intersection replaces them
            fit = g.fit_circle(pts)
            straight = allow_lines and g.chord_error(pts) <= 0.5 * tol
            if fit is None or fit[1] > 4 * diag or straight:
                pieces.append(Piece("line", pts, line=g.fit_line(pts)))
            else:
                pieces.append(Piece("arc", pts, fit=fit))
        if pieces:
            raw.append((pieces, ct.is_hole))

    arcs = [p for ps, _ in raw for p in ps if p.kind == "arc"]
    if not arcs:
        raise ValueError("outline produced no arcs; try a smaller tolerance")

    # 2. Snap radii to the chosen scale.
    radii = np.array([p.fit[1] for p in arcs])
    weights = np.array([len(p.pts) for p in arcs], dtype=float)
    unit, choices = 1.0, None
    if scale != "free":
        unit = choose_unit(scale, radii, weights)
        choices = allowed_radii(scale, unit, radii.max())

    snapped = []
    for p in arcs:
        c, r, e = snap_arc(p.pts, *p.fit, choices, tol)
        snapped.append((p, c, r, e))

    # 3. Reuse circles: arcs whose snapped circles nearly coincide share one circle.
    circles: list[Circle] = []
    members: list[list[Piece]] = []
    for p, c, r, e in sorted(snapped, key=lambda s: -len(s[0].pts)):
        target = None
        if merge:
            for idx, cir in enumerate(circles):
                if abs(cir.radius - r) > 1e-6 * r or math.dist(cir.center, c) > 2 * tol:
                    continue
                if g.circle_error(p.pts, cir.center, r) <= max(e, tol) * 1.5:
                    target = idx
                    break
        if target is None:
            circles.append(Circle(np.asarray(c, float), r))
            members.append([])
            target = len(circles) - 1
        p.circle = target
        members[target].append(p)
    for cir, ms in zip(circles, members):
        if len(ms) > 1:
            cir.center = g.fit_center_fixed_radius(np.vstack([m.pts for m in ms]), cir.radius, cir.center)

    r_top = max(c.radius for c in circles)
    for cir in circles:
        cir.label = radius_label(scale, unit, cir.radius, r_top)

    # 4. Fuse neighbouring arcs on the same circle, then build exact joints.
    outlines = []
    for pieces, is_hole in raw:
        fused: list[Piece] = []
        for p in pieces:
            if fused and p.kind == "arc" and fused[-1].kind == "arc" and fused[-1].circle == p.circle:
                fused[-1].pts = np.vstack([fused[-1].pts, p.pts[1:]])
            else:
                fused.append(p)
        if (len(fused) > 1 and fused[0].kind == "arc" and fused[-1].kind == "arc"
                and fused[0].circle == fused[-1].circle):
            fused[-1].pts = np.vstack([fused[-1].pts, fused[0].pts[1:]])
            fused.pop(0)
        outlines.append(Outline(fused, is_hole))
    _make_tangent(outlines, circles, members, limit=3 * tol)
    for ol in outlines:
        _set_joints(ol, circles, limit=4 * tol)
        _set_sweeps(ol, circles)

    logo = Logo(size, circles, outlines, mask, scale, unit, tol)
    from .render import rasterize  # local import: render depends on this module
    out = rasterize(logo)
    inter, union = (out & mask).sum(), (out | mask).sum()
    logo.stats = {
        "circles": len(circles),
        "arcs": sum(p.kind == "arc" for o in outlines for p in o.pieces),
        "lines": sum(p.kind == "line" for o in outlines for p in o.pieces),
        "iou": float(inter / union) if union else 0.0,
    }
    return logo
