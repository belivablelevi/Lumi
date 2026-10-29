import math
import unittest
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw

from circlelogo import circleize, to_construction_svg, to_json, to_svg
from circlelogo.construct import PHI
from circlelogo.geometry import circle_circle, fit_circle


def disc_image(circles, size=600):
    """Black discs (cx, cy, r, fill) on white; fill 255 cuts a disc away."""
    img = Image.new("L", (size, size), 255)
    d = ImageDraw.Draw(img)
    for cx, cy, r, fill in circles:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    return img


class GeometryTests(unittest.TestCase):
    def test_fit_circle_recovers_arc(self):
        t = np.linspace(0.2, 1.4, 50)
        pts = np.column_stack([10 + 7 * np.cos(t), -3 + 7 * np.sin(t)])
        c, r = fit_circle(pts)
        self.assertAlmostEqual(r, 7, places=4)
        np.testing.assert_allclose(c, [10, -3], atol=1e-4)

    def test_circle_intersections(self):
        pts = circle_circle(np.array([0.0, 0]), 5, np.array([8.0, 0]), 5)
        self.assertEqual(len(pts), 2)
        for p in pts:
            self.assertAlmostEqual(abs(p[1]), 3)
            self.assertAlmostEqual(p[0], 4)


class PipelineTests(unittest.TestCase):
    def test_disc_is_one_circle(self):
        logo = circleize(disc_image([(300, 300, 200, 0)]), scale="free")
        self.assertEqual(logo.stats["circles"], 1)
        self.assertGreater(logo.stats["iou"], 0.98)

    def test_crescent_is_two_circles(self):
        logo = circleize(disc_image([(300, 300, 220, 0), (390, 250, 180, 255)]), scale="free")
        self.assertEqual(logo.stats["circles"], 2)
        self.assertGreater(logo.stats["iou"], 0.95)

    def test_golden_radii_are_powers_of_phi(self):
        logo = circleize(disc_image([(240, 300, 150, 0), (400, 280, 110, 0), (330, 420, 70, 0)]))
        top = max(c.radius for c in logo.circles)
        for c in logo.circles:
            k = math.log(top / c.radius, PHI)
            self.assertAlmostEqual(k, round(k), places=6)

    def test_holes_survive(self):
        ring = disc_image([(300, 300, 220, 0), (300, 300, 120, 255)])
        logo = circleize(ring, scale="free")
        self.assertEqual(sorted(o.is_hole for o in logo.outlines), [False, True])
        self.assertGreater(logo.stats["iou"], 0.97)

    def test_outputs_are_well_formed(self):
        logo = circleize(disc_image([(260, 300, 160, 0), (380, 300, 160, 0)]))
        for svg in (to_svg(logo), to_construction_svg(logo, labels=True)):
            ET.fromstring(svg)
        self.assertIn('"circles"', to_json(logo))

    def test_higher_tolerance_is_simpler(self):
        img = Image.new("L", (600, 600), 255)
        t = np.linspace(0, 2 * math.pi, 400)
        r = 200 + 30 * np.sin(5 * t)
        ImageDraw.Draw(img).polygon(list(zip(300 + r * np.cos(t), 300 + r * np.sin(t))), fill=0)
        fine = circleize(img, tolerance=0.005)
        coarse = circleize(img, tolerance=0.03)
        self.assertLess(coarse.stats["arcs"], fine.stats["arcs"])


if __name__ == "__main__":
    unittest.main()
