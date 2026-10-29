"""Circle / line fitting and intersection primitives."""

from __future__ import annotations

import math

import numpy as np

TAU = 2 * math.pi


def fit_circle_algebraic(pts: np.ndarray):
    """Kasa least-squares circle fit. Returns (center, radius) or None if degenerate."""
    m = pts.mean(axis=0)
    u = pts - m
    a = np.column_stack([u, np.ones(len(u))])
    b = -(u * u).sum(axis=1)
    try:
        (d, e, f), *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    c = np.array([-d / 2, -e / 2])
    r2 = c @ c - f
    if not np.isfinite(r2) or r2 <= 0:
        return None
    return c + m, math.sqrt(r2)


def fit_circle(pts: np.ndarray, iters: int = 15):
    """Geometric (orthogonal distance) circle fit, seeded by the algebraic fit."""
    init = fit_circle_algebraic(pts)
    if init is None:
        return None
    c, r = init
    p = np.array([c[0], c[1], r])
    for _ in range(iters):
        d = pts - p[:2]
        dist = np.hypot(d[:, 0], d[:, 1])
        dist[dist == 0] = 1e-9
        res = dist - p[2]
        j = np.column_stack([-d[:, 0] / dist, -d[:, 1] / dist, -np.ones(len(d))])
        try:
            step, *_ = np.linalg.lstsq(j, -res, rcond=None)
        except np.linalg.LinAlgError:
            break
        p += step
        if np.abs(step).max() < 1e-6:
            break
    if not np.all(np.isfinite(p)) or p[2] <= 0:
        return init
    return p[:2].copy(), float(p[2])


def fit_center_fixed_radius(pts: np.ndarray, r: float, c0: np.ndarray, iters: int = 30):
    """Best center for a circle of fixed radius r, starting the search at c0."""
    c = np.asarray(c0, dtype=float).copy()
    for _ in range(iters):
        d = pts - c
        dist = np.hypot(d[:, 0], d[:, 1])
        dist[dist == 0] = 1e-9
        res = dist - r
        j = -d / dist[:, None]
        step, *_ = np.linalg.lstsq(j, -res, rcond=None)
        # Damp large jumps so the center stays on the side it started on.
        n = np.hypot(*step)
        if n > r * 0.25:
            step *= r * 0.25 / n
        c += step
        if n < 1e-6:
            break
    return c


def circle_error(pts: np.ndarray, c: np.ndarray, r: float) -> float:
    d = pts - c
    return float(np.abs(np.hypot(d[:, 0], d[:, 1]) - r).max())


def fit_line(pts: np.ndarray):
    """Total-least-squares line. Returns (point_on_line, unit_direction)."""
    m = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - m, full_matrices=False)
    return m, vt[0]


def line_error(pts: np.ndarray, p: np.ndarray, d: np.ndarray) -> float:
    n = np.array([-d[1], d[0]])
    return float(np.abs((pts - p) @ n).max())


def chord_error(pts: np.ndarray) -> float:
    """Max distance of pts from the straight chord joining the first and last point."""
    a, b = pts[0], pts[-1]
    d = b - a
    n = math.hypot(*d)
    if n < 1e-9:
        return float(np.hypot(*(pts - a).T).max())
    normal = np.array([-d[1], d[0]]) / n
    return float(np.abs((pts - a) @ normal).max())


def circle_circle(c1, r1, c2, r2):
    d = math.dist(c1, c2)
    if d < 1e-9 or d > r1 + r2 or d < abs(r1 - r2):
        return []
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(r1 * r1 - a * a, 0.0))
    u = (np.asarray(c2) - c1) / d
    m = np.asarray(c1) + a * u
    perp = np.array([-u[1], u[0]])
    return [m + h * perp, m - h * perp]


def line_circle(p, d, c, r):
    f = np.asarray(p) - c
    b = f @ d
    disc = b * b - (f @ f - r * r)
    if disc < 0:
        return []
    s = math.sqrt(disc)
    return [p + (-b + s) * d, p + (-b - s) * d]


def line_line(p1, d1, p2, d2):
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(cross) < 1e-9:
        return []
    w = np.asarray(p2) - p1
    t = (w[0] * d2[1] - w[1] * d2[0]) / cross
    return [p1 + t * d1]


def project_to_circle(p, c, r):
    v = np.asarray(p) - c
    n = math.hypot(*v)
    if n < 1e-9:
        return np.asarray(c) + np.array([r, 0.0])
    return np.asarray(c) + v * (r / n)


def project_to_line(p, q, d):
    return q + ((np.asarray(p) - q) @ d) * d
