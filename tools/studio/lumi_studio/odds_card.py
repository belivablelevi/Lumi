"""The personality-odds insert card that ships with each Lumi.

A 4 x 6 in card, printed on both sides:
- front: how likely each rarity tier and each temperament is,
- back: how likely each eye shape, highlight and accent is.

Every number comes from the firmware's gene weights (through liblumicore), and every face is drawn by the
firmware's own face engine, so the card stays right when the weights change.

    python tools/studio/odds_card.py [folder]   # -> lumi-odds-card.pdf (4.25 x 6.25 in with bleed)
                                                 #    lumi-odds-card-letter.pdf (2 per Letter sheet, cut marks)
"""
import itertools
import os

from PySide6.QtCore import QMarginsF, QPointF, QRectF, QSizeF, Qt
from PySide6.QtGui import (QColor, QFont, QFontDatabase, QPageLayout, QPageSize, QPainter,
                           QPainterPath, QPdfWriter, QPen)

from . import native
from .widgets import RARITY_COLOURS, frame_image

PT = 72  # points per inch
W, H = 4 * PT, 6 * PT  # trim size, portrait
BLEED = 0.125 * PT
MARGIN = 18
RES = 600  # PDF resolution; drawing is done in points

CLOUD = QColor("#f9f7f3")
LAVENDER_PALE = QColor("#f0e7fa")
LAVENDER_DEEP = QColor("#774791")
INK = QColor("#30263a")
MUTED = QColor("#685f6c")
LINE = QColor("#e9e3ea")
GLASS = QColor("#0b0b0e")

GENE_SHAPE, GENE_SIZE, GENE_SPACING, GENE_HEIGHT, GENE_SHINE, GENE_ACCENT, GENE_TEMPERAMENT = range(7)
# The most common option of every gene: a typical Lumi, varied one gene at a time.
TYPICAL = [0, 2, 2, 1, 0, 0, 0]

# What each temperament is like (its favourite animations in genes.cpp), and a face that shows it.
TEMPERAMENTS = {
    "cheerful": ("Giggles when you pat it, hums and dances.", "happy"),
    "sleepy": ("Tires quickly. Yawns, zones out and nods off.", "sleepy"),
    "shy": ("Blushes and squishes up when you pat it.", "cute"),
    "grumpy": ("Side-eyes and pouts, but secretly loves a pat.", "suspicious"),
    "hyper": ("Bouncy and quick. Dances until it goes cross-eyed.", "excited"),
}

_families = {}


def _family(name):
    if name not in _families:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", name + ".ttf")
        fid = QFontDatabase.addApplicationFont(path)
        fams = QFontDatabase.applicationFontFamilies(fid) if fid >= 0 else []
        _families[name] = fams[0] if fams else "sans-serif"
    return _families[name]


def font(size, bold=False, display=False, spacing=0.0):
    """The site's fonts, one static file per weight so the PDF embeds exactly what's drawn."""
    if display:
        name = "BricolageGrotesque-ExtraBold" if bold else "BricolageGrotesque-Bold"
    else:
        name = "Manrope-Bold" if bold else "Manrope-Regular"
    f = QFont(_family(name))
    f.setPointSizeF(size * PT / RES)  # the painter is already scaled from device pixels to points
    if spacing:
        f.setLetterSpacing(QFont.PercentageSpacing, 100 + spacing)
    return f


# ---- the numbers -----------------------------------------------------------------

def gene_odds(gene):
    """[(option name, share 0..1)] for one gene, from the firmware's weights."""
    names, weights = native.gene_options(gene), native.gene_weights(gene)
    total = sum(weights)
    return [(n, w / total) for n, w in zip(names, weights)]


def rarity_odds():
    """{tier: share 0..1}, exact: every one of the 108,000 combinations weighed by how likely it is."""
    shares = dict.fromkeys(native.rarity_names(), 0.0)
    counts = [len(native.gene_options(g)) for g in range(len(native.gene_names()))]
    for genes in itertools.product(*[range(c) for c in counts]):
        genes = list(genes)
        shares[native.genes_rarity(genes)] += native.genes_probability(genes)
    return shares


def percents(shares):
    """Whole percentages that still add up to 100 (largest remainder)."""
    raw = [s * 100 for s in shares]
    out = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[:100 - sum(out)]:
        out[i] += 1
    return out


# ---- drawing helpers ---------------------------------------------------------------

def _face(genes, expr="neutral"):
    return frame_image(native.render_expression(native.expression_names().index(expr), genes, 600), 4)


def _glass(p, rect, img, source=None):
    """A face on a little black OLED: the image fills the rect, inside rounded glass."""
    path = QPainterPath()
    path.addRoundedRect(rect, rect.height() * 0.14, rect.height() * 0.14)
    p.fillPath(path, GLASS)
    pad = rect.height() * 0.07
    inner = rect.adjusted(pad, pad, -pad, -pad)
    if source is None:
        source = QRectF(img.rect())
    p.save()
    clip = QPainterPath()
    clip.addRoundedRect(inner, rect.height() * 0.08, rect.height() * 0.08)
    p.setClipPath(clip, Qt.IntersectClip)
    p.drawImage(inner, img, source)
    p.restore()


def _lit_bounds(img, x0, x1):
    """Bounding box (in image pixels) of the lit pixels with x in [x0, x1)."""
    on = img.pixel(0, 0)
    xs, ys = [], []
    for y in range(img.height()):
        for x in range(x0, x1):
            if img.pixel(x, y) != on:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def _text(p, rect, text, f, colour=INK, flags=Qt.AlignLeft | Qt.AlignTop | Qt.TextWordWrap):
    p.setFont(f)
    p.setPen(colour)
    p.drawText(rect, int(flags), text)


def _header(p, eyebrow, title, intro, size=24):
    _text(p, QRectF(MARGIN, MARGIN, W - 2 * MARGIN, 10), eyebrow, font(6.2, True, spacing=14), LAVENDER_DEEP)
    _text(p, QRectF(MARGIN, MARGIN + 10, W - 2 * MARGIN, 32), title, font(size, display=True))
    _text(p, QRectF(MARGIN, MARGIN + 44, W - 2 * MARGIN, 30), intro, font(7.6), MUTED)


def _section(p, y, title, note=""):
    f = font(9.5, True, display=True)
    _text(p, QRectF(MARGIN, y, W - 2 * MARGIN, 14), title, f)
    if note:
        x = p.boundingRect(QRectF(MARGIN, y, W, 14), int(Qt.AlignLeft | Qt.AlignTop), title).right() + 5
        _text(p, QRectF(x, y + 2.2, W - MARGIN - x, 12), note, font(6.6), MUTED)
    return y + 15


def _background(p):
    p.fillRect(QRectF(-BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED), CLOUD)
    p.fillRect(QRectF(-BLEED, -BLEED, W + 2 * BLEED, BLEED + 86), LAVENDER_PALE)


def _footer(p, text):
    p.setPen(QPen(LINE, 0.6))
    p.drawLine(QPointF(MARGIN, H - MARGIN - 22), QPointF(W - MARGIN, H - MARGIN - 22))
    _text(p, QRectF(MARGIN, H - MARGIN - 18, W - 2 * MARGIN, 20), text, font(6.4), MUTED)


# ---- the two sides -------------------------------------------------------------------

def draw_front(p, rarity=None):
    """The front, in trim coordinates (0,0)-(W,H) in points; bleed extends past the edges."""
    rarity = rarity or rarity_odds()
    _background(p)
    _header(p, "POCKET LUMI  ·  PERSONALITY GUIDE", "Meet your Lumi",
            "No two Lumis are alike. Its looks and temperament were picked by chance when it was made. "
            "Here's how likely each one is.")

    # Rarity: one bar split by tier, then a legend.
    y = _section(p, 100, "How rare is yours?")
    tiers = list(rarity)
    pcts = percents([rarity[t] for t in tiers])
    bar = QRectF(MARGIN, y + 1, W - 2 * MARGIN, 13)
    p.save()
    clip = QPainterPath()
    clip.addRoundedRect(bar, 6.5, 6.5)
    p.setClipPath(clip)
    x = bar.left()
    for t in tiers:
        w = bar.width() * rarity[t]
        p.fillRect(QRectF(x, bar.top(), w + 0.3, bar.height()), QColor(RARITY_COLOURS[t]))
        x += w
    p.restore()
    col = (W - 2 * MARGIN) / len(tiers)
    for i, (t, pc) in enumerate(zip(tiers, pcts)):
        lx = MARGIN + i * col
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(RARITY_COLOURS[t]))
        p.drawEllipse(QRectF(lx, y + 21.5, 6, 6))
        _text(p, QRectF(lx + 9, y + 19, col - 9, 10), t.capitalize(), font(7.4, True))
        _text(p, QRectF(lx + 9, y + 28.5, col - 9, 10), f"{pc}%", font(7.4), MUTED)

    # Temperament: a face, the name, the odds and what it's like.
    y = _section(p, y + 48, "Temperament", "how it acts")
    odds = gene_odds(GENE_TEMPERAMENT)
    row = 41
    for i, ((name, share), pc) in enumerate(zip(odds, percents([s for _, s in odds]))):
        ry = y + 2 + i * row
        desc, expr = TEMPERAMENTS.get(name, ("", "neutral"))
        _glass(p, QRectF(MARGIN, ry, 64, 32), _face(_with(GENE_TEMPERAMENT, i), expr))
        _text(p, QRectF(MARGIN + 74, ry + 3, 120, 14), name.capitalize(), font(10.5, display=True))
        _text(p, QRectF(W - MARGIN - 60, ry + 3, 60, 14), f"{pc}%", font(10.5, display=True), INK,
              Qt.AlignRight | Qt.AlignTop)
        _text(p, QRectF(MARGIN + 74, ry + 17, W - 2 * MARGIN - 74, 16), desc, font(7.0), MUTED)
        if i < len(odds) - 1:
            p.setPen(QPen(LINE, 0.6))
            p.drawLine(QPointF(MARGIN + 74, ry + row - 4.5), QPointF(W - MARGIN, ry + row - 4.5))

    _footer(p, "To see your Lumi's name and rarity, hold it upside down until the menu opens, "
               "then tilt to BATTERY and pat it.")


def draw_back(p):
    _background(p)
    _header(p, "POCKET LUMI  ·  PERSONALITY GUIDE", "How rare are its looks?",
            "Each feature was picked on its own, so a Lumi can be common in one way and rare in another. "
            "The smaller the number, the rarer it is.", size=21)
    inner = W - 2 * MARGIN

    def grid(y, items, cols, tile_w, tile_h, gap, stacked=False):
        """Tiles with the option's name and odds under each: side by side, or stacked when the tiles are narrow."""
        label_h = 18 if stacked else 10
        for i, (img, source, name, pc) in enumerate(items):
            cx = MARGIN + (i % cols) * (tile_w + gap)
            cy = y + (i // cols) * (tile_h + label_h + 6)
            _glass(p, QRectF(cx, cy, tile_w, tile_h), img, source)
            _text(p, QRectF(cx, cy + tile_h + 2, tile_w + gap, 10), name, font(6.6, True), INK,
                  Qt.AlignLeft | Qt.AlignTop)
            if stacked:
                _text(p, QRectF(cx, cy + tile_h + 10, tile_w, 10), f"{pc}%", font(6.6), MUTED)
            else:
                _text(p, QRectF(cx, cy + tile_h + 2, tile_w, 10), f"{pc}%", font(6.6), MUTED,
                      Qt.AlignRight | Qt.AlignTop)
        rows = (len(items) + cols - 1) // cols
        return y + rows * (tile_h + label_h + 6)

    def items(gene, half=None):
        """One tile per option of `gene` on a typical Lumi. With `half` (0 left, 1 right), every tile zooms in
        on the same square around that half's eye, so the options compare at one scale."""
        odds = gene_odds(gene)
        imgs = [_face(_with(gene, i)) for i in range(len(odds))]
        source = None
        if half is not None:
            x0, x1 = (0, imgs[0].width() // 2) if half == 0 else (imgs[0].width() // 2, imgs[0].width())
            boxes = [_lit_bounds(img, x0, x1) for img in imgs]
            l, t = min(b[0] for b in boxes), min(b[1] for b in boxes)
            r, b = max(b[2] for b in boxes), max(b[3] for b in boxes)
            side = max(r - l, b - t) + 24
            cx, cy = (l + r) / 2, (t + b) / 2
            source = QRectF(cx - side / 2, cy - side / 2, side, side)
        return [(img, source, name, pc) for img, (name, _), pc in zip(imgs, odds, percents([s for _, s in odds]))]

    # Eye shapes: the whole face.
    y = _section(p, 100, "Eye shape")
    gap = 8
    tw = (inner - 3 * gap) / 4
    y = grid(y + 1, items(GENE_SHAPE), 4, tw, tw / 2, gap)

    # Highlights and accents: zoomed in on one eye, where they show.
    gap = 6
    tw = (inner - 5 * gap) / 6
    y = _section(p, y + 4, "Sparkle", "the glint in its eyes")
    y = grid(y + 1, items(GENE_SHINE, half=0), 6, tw, tw, gap, stacked=True)
    y = _section(p, y + 4, "A little extra")
    y = grid(y + 1, items(GENE_ACCENT, half=1), 6, tw, tw, gap, stacked=True)

    # The rest vary too, but subtly: one line each.
    y = _section(p, y + 2, "Also varies")
    for label, gene in (("Eye size", GENE_SIZE), ("Eye spacing", GENE_SPACING), ("Eye height", GENE_HEIGHT)):
        o = gene_odds(gene)
        text = ", ".join(f"{n} {pc}%" for (n, _), pc in zip(o, percents([s for _, s in o])))
        _text(p, QRectF(MARGIN, y, 52, 10), label, font(6.4, True))
        _text(p, QRectF(MARGIN + 50, y, W - 2 * MARGIN - 50, 10), text, font(6.4), MUTED)
        y += 10.5


def _with(gene, option):
    g = list(TYPICAL)
    g[gene] = option
    return g


# ---- output -------------------------------------------------------------------------

def _writer(path, size_pt):
    w = QPdfWriter(path)
    w.setResolution(RES)
    w.setTitle("Lumi personality guide")
    w.setCreator("Lumi Studio")
    w.setPageLayout(QPageLayout(QPageSize(QSizeF(*size_pt), QPageSize.Point, "Lumi card"),
                                QPageLayout.Portrait, QMarginsF(0, 0, 0, 0)))
    return w


def _begin(writer):
    p = QPainter(writer)
    p.setRenderHint(QPainter.Antialiasing)
    p.setRenderHint(QPainter.TextAntialiasing)
    p.scale(RES / PT, RES / PT)  # draw in points
    return p


def _card(p, side, rarity):
    """Draw one side, clipped to its bleed, in the painter's current card coordinates."""
    p.save()
    p.setClipRect(QRectF(-BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED))
    if side == "front":
        draw_front(p, rarity)
    else:
        draw_back(p)
    p.restore()


def write_card(path, rarity=None):
    """The card on its own: 2 pages of 4.25 x 6.25 in (6 x 4 in plus bleed), for a print shop."""
    rarity = rarity or rarity_odds()
    w = _writer(path, (W + 2 * BLEED, H + 2 * BLEED))
    p = _begin(w)
    for i, side in enumerate(("front", "back")):
        if i:
            w.newPage()
        p.save()
        p.translate(BLEED, BLEED)
        _card(p, side, rarity)
        p.restore()
    p.end()


# Letter, two cards per sheet, turned sideways and stacked. Page 2 holds the backs, placed so they land behind
# the fronts when the printer flips on the long edge.
LETTER = (8.5 * PT, 11 * PT)
GAP = 36


def _slots():
    lw, lh = LETTER
    x = (lw - H) / 2
    top = (lh - 2 * W - GAP) / 2
    return [(x, top), (x, top + W + GAP)]  # top-left of each card's (sideways) trim box


def _cut_marks(p):
    p.setPen(QPen(QColor("#000000"), 0.4))
    lw, lh = LETTER
    near, far = BLEED + 6, BLEED + 24
    xs = sorted({x for x, _ in _slots()} | {x + H for x, _ in _slots()})
    ys = sorted({y for _, y in _slots()} | {y + W for _, y in _slots()})
    top, bottom = min(ys), max(ys)
    left, right = min(xs), max(xs)
    for x in xs:
        p.drawLine(QPointF(x, top - near), QPointF(x, top - far))
        p.drawLine(QPointF(x, bottom + near), QPointF(x, bottom + far))
    for y in ys:
        p.drawLine(QPointF(left - near, y), QPointF(left - far, y))
        p.drawLine(QPointF(right + near, y), QPointF(right + far, y))


def write_letter(path, rarity=None):
    """Two cards on Letter with cut marks: print both pages double-sided, flip on the long edge."""
    rarity = rarity or rarity_odds()
    w = _writer(path, LETTER)
    p = _begin(w)
    for page, side in enumerate(("front", "back")):
        if page:
            w.newPage()
        for x, y in _slots():
            p.save()
            if side == "front":  # the card's top points left
                p.translate(x, y + W)
                p.rotate(-90)
            else:  # the back's top points right, so it reads upright after the flip
                p.translate(x + H, y)
                p.rotate(90)
            _card(p, side, rarity)
            p.restore()
        if side == "front":
            _cut_marks(p)
        _text(p, QRectF(0, LETTER[1] - 30, LETTER[0], 12),
              "Print at 100% (actual size), double-sided, flip on long edge. Cut on the marks."
              if side == "front" else "", font(7), MUTED, Qt.AlignHCenter | Qt.AlignTop)
    p.end()


def export(folder):
    """Write both PDFs into folder; returns their paths."""
    os.makedirs(folder, exist_ok=True)
    rarity = rarity_odds()
    card = os.path.join(folder, "lumi-odds-card.pdf")
    letter = os.path.join(folder, "lumi-odds-card-letter.pdf")
    write_card(card, rarity)
    write_letter(letter, rarity)
    return card, letter
