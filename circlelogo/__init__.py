"""Automatic "circle method" logo construction.

    from circlelogo import circleize, to_svg
    logo = circleize("bird.png", tolerance=0.015, scale="golden")
    open("bird.svg", "w").write(to_svg(logo))
"""

from .construct import Circle, Logo, circleize
from .render import rasterize, to_construction_svg, to_json, to_png, to_svg

__all__ = ["Circle", "Logo", "circleize", "rasterize", "to_construction_svg", "to_json", "to_png", "to_svg"]
