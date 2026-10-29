"""Shared widgets: the OLED preview and small helpers."""
from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtGui import QColor, QImage, QPainter, QPixmap
from PySide6.QtWidgets import QComboBox, QDoubleSpinBox, QHBoxLayout, QSizePolicy, QSlider, QWidget

from . import native

CYAN = QColor(0x3C, 0xF0, 0xFF)
OFF = QColor(0x06, 0x10, 0x14)
BEZEL = QColor(0x0B, 0x0B, 0x0E)
RARITY_COLOURS = {"common": "#9aa5b1", "uncommon": "#4cd07d", "rare": "#4aa8ff", "legendary": "#ffb627"}


def frame_image(frame, scale=1, on=CYAN, off=OFF, gap=False):
    """A 128x64 frame as a QImage, each pixel `scale` x `scale` (with a 1 px gap between pixels if `gap`)."""
    rows = bytearray(16 * 64)  # 1 bit per pixel, row-major, most significant bit first
    for page in range(8):
        base = page * 128
        for x in range(128):
            v = frame[base + x]
            if v:
                for b in range(8):
                    if v >> b & 1:
                        rows[(page * 8 + b) * 16 + (x >> 3)] |= 0x80 >> (x & 7)
    img = QImage(bytes(rows), 128, 64, 16, QImage.Format_Mono).copy()
    img.setColorTable([off.rgb(), on.rgb()])
    img = img.convertToFormat(QImage.Format_RGB32)
    if scale > 1:
        img = img.scaled(128 * scale, 64 * scale, Qt.IgnoreAspectRatio, Qt.FastTransformation)
    if gap and scale >= 3:
        p = QPainter(img)
        p.setPen(BEZEL)
        for x in range(1, 129):
            p.drawLine(x * scale - 1, 0, x * scale - 1, 64 * scale)
        for y in range(1, 65):
            p.drawLine(0, y * scale - 1, 128 * scale, y * scale - 1)
        p.end()
    return img


class OledView(QWidget):
    """A zoomable picture of Lumi's 128x64 screen, pixel for pixel what the unit shows."""

    clicked = Signal()

    def __init__(self, parent=None, min_scale=2, gap=True):
        super().__init__(parent)
        self._frame = bytes(native.FRAME_BYTES)
        self._min_scale = min_scale
        self._gap = gap
        self._cache = None
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setMinimumSize(128 * min_scale + 16, 64 * min_scale + 16)

    def sizeHint(self):
        return QSize(128 * 5 + 24, 64 * 5 + 24)

    def hasHeightForWidth(self):
        return True

    def heightForWidth(self, w):
        return w // 2

    def setFrame(self, frame):
        frame = bytes(frame)
        if frame != self._frame:
            self._frame = frame
            self._cache = None
            self.update()

    def frame(self):
        return self._frame

    def mousePressEvent(self, e):
        self.clicked.emit()

    def paintEvent(self, e):
        p = QPainter(self)
        p.fillRect(self.rect(), BEZEL)
        scale = max(1, min((self.width() - 12) // 128, (self.height() - 12) // 64))
        if self._cache is None or self._cache[0] != scale:
            self._cache = (scale, QPixmap.fromImage(frame_image(self._frame, scale, gap=self._gap and scale >= 4)))
        pm = self._cache[1]
        p.drawPixmap((self.width() - pm.width()) // 2, (self.height() - pm.height()) // 2, pm)
        p.end()


class SliderSpin(QWidget):
    """A slider and a spin box that edit one number together."""

    valueChanged = Signal(float)

    def __init__(self, lo, hi, step, decimals, parent=None):
        super().__init__(parent)
        self._step = step
        self._lo = lo
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(0, round((hi - lo) / step))
        self.spin = QDoubleSpinBox()
        self.spin.setRange(lo, hi)
        self.spin.setSingleStep(step)
        self.spin.setDecimals(decimals)
        self.spin.setFixedWidth(84)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.addWidget(self.slider, 1)
        lay.addWidget(self.spin)
        self.slider.valueChanged.connect(self._from_slider)
        self.spin.valueChanged.connect(self._from_spin)

    def _from_slider(self, v):
        value = self._lo + v * self._step
        if abs(self.spin.value() - value) > self._step / 2:
            self.spin.setValue(value)

    def _from_spin(self, v):
        self.slider.blockSignals(True)
        self.slider.setValue(round((v - self._lo) / self._step))
        self.slider.blockSignals(False)
        self.valueChanged.emit(v)

    def value(self):
        return self.spin.value()

    def setValue(self, v):
        self.blockSignals(True)
        self.spin.setValue(v)
        self.blockSignals(False)


def combo(items, parent=None):
    c = QComboBox(parent)
    c.addItems(items)
    return c


def set_rarity(label, rarity, probability=None):
    """Shows a rarity tier (and optionally the odds of this exact look) in its colour."""
    colour = RARITY_COLOURS.get(rarity, "#ccc")
    text = rarity.upper()
    if probability:
        text += f"  ·  odds of this exact look: 1 in {round(1 / probability):,}"
    label.setText(text)
    label.setStyleSheet(f"color: {colour}; font-weight: 700; letter-spacing: 1px;")
