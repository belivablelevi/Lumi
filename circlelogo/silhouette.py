"""Turn an arbitrary image into clean, resampled outline contours."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image


@dataclass
class Contour:
    points: np.ndarray  # (N, 2) float, closed loop, roughly uniform spacing
    is_hole: bool


def load_mask(path_or_image, size: int = 600, invert: bool | None = None,
              threshold: int | None = None, margin: float = 0.08) -> np.ndarray:
    """Load an image and return a boolean foreground mask (True = logo shape).

    Transparent PNGs use their alpha channel. Otherwise the image is thresholded
    (Otsu by default) and the darker side is taken as foreground, flipped
    automatically when the image border is mostly "foreground".
    """
    img = path_or_image if isinstance(path_or_image, Image.Image) else Image.open(path_or_image)
    img = img.convert("RGBA")
    rgba = np.asarray(img)
    alpha = rgba[..., 3]

    scale = (size * (1 - 2 * margin)) / max(img.size)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))

    if alpha.min() < 250 and invert is None and threshold is None:
        gray = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_AREA)
        fg = gray > 127
    else:
        # Composite onto white so transparent pixels count as background.
        a = alpha[..., None].astype(np.float32) / 255
        rgb = rgba[..., :3].astype(np.float32) * a + 255 * (1 - a)
        gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        gray = cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA)
        gray = cv2.GaussianBlur(gray, (0, 0), 1.0)
        if threshold is None:
            threshold, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        fg = gray < threshold
        if invert is None:
            border = np.concatenate([fg[0], fg[-1], fg[:, 0], fg[:, -1]])
            invert = border.mean() > 0.5
        if invert:
            fg = ~fg

    # Pad so no contour touches the canvas edge.
    pad_y, pad_x = (size - h) // 2, (size - w) // 2
    mask = np.zeros((size, size), dtype=np.uint8)
    mask[pad_y:pad_y + h, pad_x:pad_x + w] = fg.astype(np.uint8)

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    return mask.astype(bool)


def _smooth_closed(pts: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return pts
    r = int(3 * sigma) + 1
    x = np.arange(-r, r + 1)
    kern = np.exp(-0.5 * (x / sigma) ** 2)
    kern /= kern.sum()
    padded = np.concatenate([pts[-r:], pts, pts[:r]])
    return np.column_stack([np.convolve(padded[:, i], kern, mode="valid") for i in range(2)])


def _resample_closed(pts: np.ndarray, spacing: float) -> np.ndarray:
    loop = np.vstack([pts, pts[:1]])
    seg = np.hypot(*np.diff(loop, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(12, int(round(s[-1] / spacing)))
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(t, s, loop[:, i]) for i in range(2)])


def extract_contours(mask: np.ndarray, spacing: float = 2.0, smooth: float = 1.5,
                     min_area_frac: float = 0.002) -> list[Contour]:
    """Outer boundaries and holes of the mask, smoothed and uniformly resampled."""
    m = mask.astype(np.uint8)
    found, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if not found:
        return []
    total = max(m.sum(), 1)
    out = []
    for c, h in zip(found, hier[0]):
        if abs(cv2.contourArea(c)) < min_area_frac * total:
            continue
        pts = c[:, 0, :].astype(float)
        pts = _resample_closed(pts, 1.0)
        pts = _smooth_closed(pts, smooth)
        pts = _resample_closed(pts, spacing)
        out.append(Contour(pts, is_hole=bool(h[3] != -1)))
    return out
