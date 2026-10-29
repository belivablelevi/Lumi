"""Split a closed outline into the fewest pieces that each fit one circle (or line).

Sharp corners are found first and become forced break points. Each run between
corners is then split by dynamic programming: the minimum number of pieces such
that every piece stays within `tol` of a single circle.
"""

from __future__ import annotations

import math

import numpy as np

from .geometry import chord_error, circle_error, fit_circle_algebraic


def turning_angles(pts: np.ndarray, k: int) -> np.ndarray:
    """Unsigned turning angle at each point, measured over +/- k samples."""
    a = pts - np.roll(pts, k, axis=0)
    b = np.roll(pts, -k, axis=0) - pts
    cross = a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
    dot = (a * b).sum(axis=1)
    return np.abs(np.arctan2(cross, dot))


def find_corners(pts: np.ndarray, k: int, min_angle_deg: float) -> list[int]:
    ang = turning_angles(pts, k)
    n = len(pts)
    thresh = math.radians(min_angle_deg)
    corners = []
    for i in np.argsort(-ang):
        if ang[i] < thresh:
            break
        if all(min((i - c) % n, (c - i) % n) > 2 * k for c in corners):
            corners.append(int(i))
    return sorted(corners)


class Fitter:
    """Answers "does pts[i..j] fit one circle/line within tol?" with caching."""

    def __init__(self, pts: np.ndarray, tol: float, max_radius: float,
                 min_radius: float, allow_lines: bool):
        self.pts, self.tol = pts, tol
        self.max_radius, self.min_radius = max_radius, min_radius
        self.allow_lines = allow_lines
        self._cache: dict[tuple[int, int], bool] = {}

    def ok(self, i: int, j: int) -> bool:
        if j - i < 2:
            return True  # two points: always joinable by a tiny connector
        key = (i, j)
        if key not in self._cache:
            self._cache[key] = self._check(self.pts[i:j + 1])
        return self._cache[key]

    def _check(self, seg: np.ndarray) -> bool:
        if chord_error(seg) <= self.tol:
            return True  # straight within tol: a line, or a large enough circle
        fit = fit_circle_algebraic(seg)
        if fit is None:
            return False
        c, r = fit
        if r > self.max_radius or r < self.min_radius:
            return False
        return circle_error(seg, c, r) <= self.tol


def split_span(f: Fitter, start: int, end: int) -> list[tuple[int, int]]:
    """Fewest pieces covering indices start..end (inclusive), via DP.

    Fit feasibility is treated as monotone (if i..j fits, i..j-1 fits), so for
    each start we binary-search the furthest reachable end.
    """
    m = end - start
    inf = 1 << 30
    best = [inf] * (m + 1)
    prev = [-1] * (m + 1)
    best[0] = 0
    for i in range(m):
        if best[i] == inf:
            continue
        # Exponential search, then binary search; m + 1 is an "infeasible" sentinel.
        lo, probe = i + 1, i + 2
        while probe <= m and f.ok(start + i, start + probe):
            lo = probe
            probe = i + 2 * (probe - i)
        hi = min(probe, m + 1)
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if f.ok(start + i, start + mid):
                lo = mid
            else:
                hi = mid
        for j in range(i + 1, lo + 1):
            if best[i] + 1 < best[j]:
                best[j] = best[i] + 1
                prev[j] = i
    pieces = []
    j = m
    while j > 0:
        i = prev[j]
        pieces.append((start + i, start + j))
        j = i
    return pieces[::-1]


def relax_breaks(f: Fitter, pieces: list[tuple[int, int]], fixed: set[int],
                 window: int, err) -> list[tuple[int, int]]:
    """Slide each free break point to balance the error of its two neighbours."""
    pieces = list(pieces)
    for _ in range(2):
        for k in range(len(pieces) - 1):
            (a, b), (_, c) = pieces[k], pieces[k + 1]
            if b in fixed:
                continue
            best_b, best_e = b, max(err(a, b), err(b, c))
            for nb in range(max(a + 2, b - window), min(c - 2, b + window) + 1):
                e = max(err(a, nb), err(nb, c))
                if e < best_e - 1e-9:
                    best_b, best_e = nb, e
            pieces[k], pieces[k + 1] = (a, best_b), (best_b, c)
    return pieces


def segment_contour(pts: np.ndarray, tol: float, size: float, corner_deg: float = 40.0,
                    allow_lines: bool = True) -> tuple[np.ndarray, list[tuple[int, int]], set[int]]:
    """Return (rotated closed points with the first point repeated at the end,
    list of (i, j) pieces, set of corner indices)."""
    n = len(pts)
    spacing = float(np.hypot(*np.diff(pts, axis=0).T).mean())
    k = max(2, int(round(1.5 * tol / spacing)))
    corners = find_corners(pts, k, corner_deg)

    start = corners[0] if corners else int(np.argmax(turning_angles(pts, k)))
    pts = np.roll(pts, -start, axis=0)
    corners = sorted((c - start) % n for c in corners) or [0]
    ext = np.vstack([pts, pts[:1]])

    f = Fitter(ext, tol, max_radius=4 * size, min_radius=tol, allow_lines=allow_lines)
    bounds = corners + [n]
    pieces = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        pieces += split_span(f, a, b)

    def err(i, j):
        seg = ext[i:j + 1]
        if len(seg) < 3:
            return 0.0
        fit = fit_circle_algebraic(seg)
        e = circle_error(seg, *fit) if fit else math.inf
        return min(e, chord_error(seg)) if allow_lines else e

    fixed = set(corners) | {n}
    pieces = relax_breaks(f, pieces, fixed, window=k, err=err)
    return ext, pieces, set(corners)
