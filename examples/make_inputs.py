"""Generate sample silhouettes in examples/input/ to try the algorithm on."""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "input")
S = 800


def canvas():
    img = Image.new("L", (S, S), 255)
    return img, ImageDraw.Draw(img)


def ellipse(d, cx, cy, rx, ry, fill=0):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def bird():
    img, d = canvas()
    ellipse(d, 400, 470, 210, 150)                                  # body
    ellipse(d, 560, 300, 95, 95)                                    # head
    d.polygon([(640, 270), (760, 250), (650, 330)], fill=0)        # beak
    d.polygon([(220, 470), (60, 360), (120, 520), (250, 560)], fill=0)  # tail
    pts = [(260, 420), (180, 160), (330, 260), (470, 410)]         # wing
    d.polygon(pts, fill=0)
    ellipse(d, 560, 640, 260, 60, fill=255)                         # belly cut
    return img


def heart():
    img, d = canvas()
    t = np.linspace(0, 2 * math.pi, 600)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    d.polygon(list(zip(400 + 21 * x, 380 - 21 * y)), fill=0)
    return img


def leaf():
    img, d = canvas()
    a = Image.new("L", (S, S), 0)
    b = Image.new("L", (S, S), 0)
    ImageDraw.Draw(a).ellipse([120, 60, 820, 760], fill=255)
    ImageDraw.Draw(b).ellipse([-20, 40, 680, 740], fill=255)
    inter = np.minimum(np.asarray(a), np.asarray(b))
    img = Image.fromarray(255 - inter)
    d = ImageDraw.Draw(img)
    d.line([(400, 700), (420, 780)], fill=0, width=28)
    d.line([(400, 140), (405, 690)], fill=255, width=14)  # midrib
    return img


def cloud():
    img, d = canvas()
    for cx, cy, r in [(260, 450, 120), (400, 360, 170), (560, 430, 130), (330, 500, 110), (480, 510, 100)]:
        ellipse(d, cx, cy, r, r)
    d.rectangle([260, 470, 560, 610], fill=0)
    return img


def moon():
    img, d = canvas()
    ellipse(d, 400, 400, 300, 300)
    ellipse(d, 520, 330, 250, 250, fill=255)
    return img


def glyph(ch, font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
    img, d = canvas()
    f = ImageFont.truetype(font, 640)
    d.text((S / 2, S / 2), ch, font=f, fill=0, anchor="mm")
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    shapes = {"bird": bird(), "heart": heart(), "leaf": leaf(), "cloud": cloud(), "moon": moon(),
              "letter_S": glyph("S"), "letter_g": glyph("g"), "ampersand": glyph("&")}
    for name, img in shapes.items():
        img.save(os.path.join(OUT, f"{name}.png"))
    print("wrote", ", ".join(shapes), "to", OUT)
