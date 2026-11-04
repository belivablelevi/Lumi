"""Birth certificates: one small card per unit, to go in its box.

Business-card size (3.5 x 2 in), printed both sides:
- front: the unit's own face (drawn by the firmware's face engine), its name, rarity and temperament,
- back: a hello, how to wake it out of shipping mode, and its traits and serial.

Cards come eight to a Letter sheet with cut marks, in manifest order (by serial), so the packer
can match each card to the unit with the same serial. Print double-sided, flip on the long edge.

    from lumi_studio import unit_cards
    unit_cards.export(folder, manifest_rows)   # -> lumi-unit-cards-letter.pdf
"""
import os

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QColor, QPainterPath, QPen

from . import factory, native
from .odds_card import (CLOUD, INK, LAVENDER_DEEP, LAVENDER_PALE, LINE, LETTER, MUTED, _begin, _glass, _text,
                        _writer, font)
from .widgets import RARITY_COLOURS, frame_image

PT = 72
CW, CH = 3.5 * PT, 2 * PT  # trim size, landscape
BLEED = 0.125 * PT
PAD = 12
COLS, ROWS = 2, 4
GAP = 22  # between cards on the sheet: room for bleed and cut marks
PER_SHEET = COLS * ROWS

WAKE = "I travel asleep, so bumps in the post can't wake me. Tap my screen three times and I'll say hello."


def _face(genes):
    expr = native.expression_names().index("neutral")
    return frame_image(native.render_expression(expr, genes, 600), 4)


def _born(row):
    when = (row.get("provisioned_at") or "")[:10]
    return f"Made {when}" if when else ""


def _traits(row):
    bits = [f"{row['eye_shape']} eyes", f"{row['highlight']} glint" if row["highlight"] != "none" else "no glint"]
    if row.get("accent") and row["accent"] != "none":
        bits.append(row["accent"])
    bits.append(f"{row['eye_size']} size, {row['spacing']} spacing, {row['height']} height")
    return " · ".join(bits)


def _base(p):
    p.fillRect(QRectF(-BLEED, -BLEED, CW + 2 * BLEED, CH + 2 * BLEED), CLOUD)


def draw_front(p, row):
    """One card's front in trim coordinates (0,0)-(CW,CH) in points; the background runs into the bleed."""
    _base(p)
    p.fillRect(QRectF(-BLEED, -BLEED, 128 + BLEED, CH + 2 * BLEED), LAVENDER_PALE)
    _glass(p, QRectF(PAD, (CH - 56) / 2, 104, 52), _face(factory.row_persona(row).genes))

    x = 128 + PAD
    w = CW - x - PAD
    _text(p, QRectF(x, PAD, w, 10), "POCKET LUMI", font(5.6, True, spacing=14), LAVENDER_DEEP)
    _text(p, QRectF(x, PAD + 9, w, 28), row["name"], font(19, display=True))

    tier = row["rarity"]
    p.setPen(Qt.NoPen)
    p.setBrush(QColor(RARITY_COLOURS.get(tier, "#999999")))
    p.drawEllipse(QRectF(x, PAD + 42.5, 6, 6))
    _text(p, QRectF(x + 9, PAD + 40, w - 9, 11), tier.capitalize(), font(7.6, True))
    _text(p, QRectF(x, PAD + 54, w, 11), f"{row['temperament'].capitalize()} temperament", font(7.4), MUTED)

    p.setPen(QPen(LINE, 0.6))
    p.drawLine(QPointF(x, CH - PAD - 16), QPointF(CW - PAD, CH - PAD - 16))
    _text(p, QRectF(x, CH - PAD - 12, w, 10), row["serial"], font(6.2, True), INK)
    _text(p, QRectF(x, CH - PAD - 12, w, 10), _born(row), font(6.2), MUTED, Qt.AlignRight | Qt.AlignTop)


def draw_back(p, row):
    _base(p)
    w = CW - 2 * PAD
    _text(p, QRectF(PAD, PAD, w, 22), f"Hi, I'm {row['name']}!", font(14, display=True))
    _text(p, QRectF(PAD, PAD + 24, w, 34), WAKE, font(7.4), INK)
    _text(p, QRectF(PAD, PAD + 60, w, 30), "My looks: " + _traits(row), font(6.4), MUTED)

    p.setPen(QPen(LINE, 0.6))
    p.drawLine(QPointF(PAD, CH - PAD - 16), QPointF(CW - PAD, CH - PAD - 16))
    _text(p, QRectF(PAD, CH - PAD - 12, w, 10), f"{row['serial']}  ·  look #{row['look']}", font(6.2), MUTED)
    _text(p, QRectF(PAD, CH - PAD - 12, w, 10), "snaggo.tech", font(6.2, True), LAVENDER_DEEP, Qt.AlignRight | Qt.AlignTop)


def _slots():
    """Top-left of each card's trim box on a Letter page, row by row."""
    lw, lh = LETTER
    left = (lw - COLS * CW - (COLS - 1) * GAP) / 2
    top = (lh - ROWS * CH - (ROWS - 1) * GAP) / 2
    return [(left + c * (CW + GAP), top + r * (CH + GAP)) for r in range(ROWS) for c in range(COLS)]


def _cut_marks(p):
    p.setPen(QPen(QColor("#000000"), 0.4))
    slots = _slots()
    xs = sorted({x for x, _ in slots} | {x + CW for x, _ in slots})
    ys = sorted({y for _, y in slots} | {y + CH for _, y in slots})
    near, far = BLEED + 3, BLEED + 15
    for x in xs:
        p.drawLine(QPointF(x, ys[0] - near), QPointF(x, ys[0] - far))
        p.drawLine(QPointF(x, ys[-1] + near), QPointF(x, ys[-1] + far))
    for y in ys:
        p.drawLine(QPointF(xs[0] - near, y), QPointF(xs[0] - far, y))
        p.drawLine(QPointF(xs[-1] + near, y), QPointF(xs[-1] + far, y))


def _clip_card(p):
    clip = QPainterPath()
    clip.addRect(QRectF(-BLEED, -BLEED, CW + 2 * BLEED, CH + 2 * BLEED))
    p.setClipPath(clip)


def write_letter(path, rows):
    """All the cards, eight per Letter sheet: each sheet is a page of fronts, then a page of backs.

    Backs sit mirrored left to right, so after flipping on the long edge each back lands behind its front.
    Returns the number of sheets."""
    rows = sorted(rows, key=lambda r: r["serial"])
    w = _writer(path, LETTER)
    w.setTitle("Lumi birth certificates")
    p = _begin(w)
    sheets = [rows[i:i + PER_SHEET] for i in range(0, len(rows), PER_SHEET)] or [[]]
    slots = _slots()
    first = True
    for sheet in sheets:
        for side in ("front", "back"):
            if not first:
                w.newPage()
            first = False
            for i, row in enumerate(sheet):
                col, r = i % COLS, i // COLS
                x, y = slots[r * COLS + (col if side == "front" else COLS - 1 - col)]
                p.save()
                p.translate(x, y)
                _clip_card(p)
                (draw_front if side == "front" else draw_back)(p, row)
                p.restore()
            _cut_marks(p)
            note = ("Print at 100% (actual size), double-sided, flip on long edge. Cut on the marks."
                    if side == "front" else "Backs")
            _text(p, QRectF(0, LETTER[1] - 24, LETTER[0], 12), f"{note}   ·   {sheet[0]['serial'] if sheet else ''}"
                  f"{' – ' + sheet[-1]['serial'] if len(sheet) > 1 else ''}", font(6.5), MUTED, Qt.AlignHCenter | Qt.AlignTop)
    p.end()
    return len(sheets)


def export(folder, rows):
    """Writes lumi-unit-cards-letter.pdf into folder; returns its path."""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "lumi-unit-cards-letter.pdf")
    write_letter(path, rows)
    return path
