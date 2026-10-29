"""SVG / PNG / JSON output for a circle-method logo."""

from __future__ import annotations

import json
import math

import cv2
import numpy as np

from .construct import Logo, Outline


def _f(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".")


def outline_path(ol: Outline, circles) -> str:
    ps = ol.pieces
    d = [f"M{_f(ps[0].start[0])} {_f(ps[0].start[1])}"]
    for k, p in enumerate(ps):
        if k and not np.allclose(p.start, ps[k - 1].end, atol=0.01):
            d.append(f"L{_f(p.start[0])} {_f(p.start[1])}")
        if p.kind == "line":
            d.append(f"L{_f(p.end[0])} {_f(p.end[1])}")
            continue
        c = circles[p.circle]
        r = _f(c.radius)
        sweep = 1 if p.sweep > 0 else 0
        if abs(p.sweep) > 2 * math.pi - 1e-3:
            # Full circle: SVG needs it as two half arcs.
            mid = 2 * c.center - p.start
            d.append(f"A{r} {r} 0 0 {sweep} {_f(mid[0])} {_f(mid[1])}")
            d.append(f"A{r} {r} 0 0 {sweep} {_f(p.end[0])} {_f(p.end[1])}")
        else:
            large = 1 if abs(p.sweep) > math.pi else 0
            d.append(f"A{r} {r} 0 {large} {sweep} {_f(p.end[0])} {_f(p.end[1])}")
    return "".join(d) + "Z"


def logo_path(logo: Logo) -> str:
    return "".join(outline_path(o, logo.circles) for o in logo.outlines)


def _bounds(logo: Logo, with_circles: bool, pad: float):
    pts = [p.start for o in logo.outlines for p in o.pieces]
    pts += [p.pts for o in logo.outlines for p in o.pieces]
    allp = np.vstack([np.atleast_2d(x) for x in pts])
    lo, hi = allp.min(axis=0), allp.max(axis=0)
    if with_circles:
        # Show circles comparable to the logo in full; huge ones (near-straight
        # edges) just run off the sheet, as on hand-drawn construction grids.
        size = (hi - lo).max()
        for c in logo.circles:
            if c.radius <= 0.7 * size:
                lo = np.minimum(lo, c.center - c.radius)
                hi = np.maximum(hi, c.center + c.radius)
    span = (hi - lo).max()
    lo, hi = lo - pad * span, hi + pad * span
    return lo, hi - lo


def to_svg(logo: Logo, color: str = "#1f2937", background: str | None = None) -> str:
    (x, y), (w, h) = _bounds(logo, False, 0.05)
    bg = f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" fill="{background}"/>' if background else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_f(x)} {_f(y)} {_f(w)} {_f(h)}">'
            f'{bg}<path fill="{color}" fill-rule="evenodd" d="{logo_path(logo)}"/></svg>\n')


def to_construction_svg(logo: Logo, color: str = "#3b82f6", line: str = "#9ca3af",
                        background: str = "#ffffff", labels: bool = False) -> str:
    """The logo over every construction circle, in the style of a 'circle grid' sheet."""
    (x, y), (w, h) = _bounds(logo, True, 0.06)
    sw = _f(max(w, h) / 600)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_f(x)} {_f(y)} {_f(w)} {_f(h)}">',
             f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" fill="{background}"/>',
             f'<path fill="{color}" fill-opacity="0.85" fill-rule="evenodd" d="{logo_path(logo)}"/>',
             f'<g fill="none" stroke="{line}" stroke-width="{sw}">']
    for c in logo.circles:
        parts.append(f'<circle cx="{_f(c.center[0])}" cy="{_f(c.center[1])}" r="{_f(c.radius)}"/>')
    parts.append("</g>")
    if labels:
        fs = _f(max(w, h) / 70)
        parts.append(f'<g font-family="sans-serif" font-size="{fs}" fill="{line}" text-anchor="middle">')
        for c in logo.circles:
            parts.append(f'<text x="{_f(c.center[0])}" y="{_f(c.center[1])}">{c.label}</text>')
        parts.append("</g>")
    parts.append("</svg>\n")
    return "".join(parts)


def sample_outline(ol: Outline, circles, step: float = 1.0) -> np.ndarray:
    out = []
    for p in ol.pieces:
        if p.kind == "line":
            out += [p.start, p.end]
            continue
        c = circles[p.circle]
        t0 = math.atan2(p.start[1] - c.center[1], p.start[0] - c.center[0])
        n = max(4, int(abs(p.sweep) * c.radius / step))
        t = t0 + np.linspace(0, p.sweep, n)
        out += list(c.center + c.radius * np.column_stack([np.cos(t), np.sin(t)]))
    return np.array(out)


def rasterize(logo: Logo, scale: int = 1) -> np.ndarray:
    """Even-odd fill of the logo on the working canvas (bool mask)."""
    shape = (logo.size * scale, logo.size * scale)
    acc = np.zeros(shape, dtype=bool)
    for ol in logo.outlines:
        m = np.zeros(shape, dtype=np.uint8)
        poly = np.round(sample_outline(ol, logo.circles) * scale * 16).astype(np.int32)
        cv2.fillPoly(m, [poly], 1, lineType=cv2.LINE_8, shift=4)
        acc ^= m.astype(bool)
    return acc


def to_png(logo: Logo, path: str, construction: bool = False, px: int = 1200,
           color=(31, 41, 55), circle_color=(156, 163, 175)) -> None:
    """Anti-aliased PNG preview (rendered by supersampling, no SVG renderer needed)."""
    ss = 3
    k = px * ss / logo.size
    shape = (px * ss, px * ss)
    img = np.full(shape + (3,), 255, dtype=np.uint8)
    fill = np.zeros(shape, dtype=bool)
    for ol in logo.outlines:
        m = np.zeros(shape, dtype=np.uint8)
        poly = np.round(sample_outline(ol, logo.circles, step=0.5) * k * 16).astype(np.int32)
        cv2.fillPoly(m, [poly], 1, shift=4)
        fill ^= m.astype(bool)
    img[fill] = color
    if construction:
        for c in logo.circles:
            cv2.circle(img, tuple(int(v) for v in np.round(c.center * k * 16)), int(round(c.radius * k * 16)),
                       circle_color, thickness=ss, lineType=cv2.LINE_AA, shift=4)
    img = cv2.resize(img, (px, px), interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))


def to_json(logo: Logo) -> str:
    return json.dumps({
        "scale": logo.scale,
        "unit": logo.unit,
        "stats": logo.stats,
        "circles": [{"cx": round(float(c.center[0]), 3), "cy": round(float(c.center[1]), 3),
                     "r": round(c.radius, 3), "label": c.label} for c in logo.circles],
        "outlines": [{"hole": o.is_hole, "pieces": [
            {"kind": p.kind, "circle": p.circle,
             "start": [round(float(v), 3) for v in p.start], "end": [round(float(v), 3) for v in p.end],
             **({"sweep_deg": round(math.degrees(p.sweep), 2)} if p.kind == "arc" else {})}
            for p in o.pieces]} for o in logo.outlines],
        "path": logo_path(logo),
    }, indent=2)
