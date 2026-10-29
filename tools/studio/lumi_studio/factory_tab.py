"""Factory batch tab: generate unique personas, save the manifest, export cards."""
import os
from datetime import date

from PySide6.QtCore import QRect, QSize, Qt
from PySide6.QtGui import QColor, QFont, QIcon, QImage, QPainter, QPixmap
from PySide6.QtWidgets import (QAbstractItemView, QDoubleSpinBox, QFileDialog, QFormLayout, QHBoxLayout, QHeaderView,
                               QLabel, QLineEdit, QMessageBox, QPushButton, QSpinBox, QSplitter, QTableWidget,
                               QTableWidgetItem, QVBoxLayout, QWidget)

from . import factory, native
from .model import RARITIES
from .widgets import BEZEL, RARITY_COLOURS, OledView, frame_image

COLUMNS = ["", "Serial", "Name", "Rarity", "Look", "Eye shape", "Size", "Spacing", "Height", "Highlight", "Accent",
           "Temperament", "MAC", "Provisioned"]
FIELDS = [None, "serial", "name", "rarity", "look", "eye_shape", "eye_size", "spacing", "height", "highlight",
          "accent", "temperament", "mac", "provisioned_at"]
NEUTRAL = 0  # shows a unit's eye shape best
MAX_TABLE_ROWS = 5000
MAX_ICONS = 500


def card_image(row, expr=NEUTRAL):
    """A printable card for one unit: its face on the screen, name, serial and traits."""
    persona = factory.row_persona(row)
    w, h = 640, 420
    img = QImage(w, h, QImage.Format_RGB32)
    img.fill(QColor("#101317"))
    p = QPainter(img)
    p.setRenderHint(QPainter.Antialiasing)
    p.setBrush(BEZEL)
    p.setPen(Qt.NoPen)
    p.drawRoundedRect(QRect(48, 28, 544, 288), 22, 22)
    p.drawImage(64, 44, frame_image(native.render_expression(expr, persona.genes, 600), 4, gap=True))
    p.setPen(QColor("#f2f5f7"))
    f = QFont()
    f.setPixelSize(34)
    f.setBold(True)
    p.setFont(f)
    p.drawText(QRect(48, 326, 400, 44), Qt.AlignLeft | Qt.AlignVCenter, row["name"])
    f.setPixelSize(20)
    p.setFont(f)
    p.setPen(QColor(RARITY_COLOURS.get(row["rarity"], "#ccc")))
    p.drawText(QRect(392, 326, 200, 44), Qt.AlignRight | Qt.AlignVCenter, row["rarity"].upper())
    f.setBold(False)
    f.setPixelSize(16)
    p.setFont(f)
    p.setPen(QColor("#8a97a3"))
    traits = f"{row['temperament']} · {row['eye_shape']} eyes · {row['highlight']} highlight"
    if row["accent"] != "none":
        traits += f" · {row['accent']}"
    p.drawText(QRect(48, 368, 544, 24), Qt.AlignLeft | Qt.AlignVCenter, traits)
    p.drawText(QRect(48, 390, 544, 24), Qt.AlignLeft | Qt.AlignVCenter, f"{row['serial']}  ·  look #{row['look']}")
    p.end()
    return img


def contact_sheet(rows, columns=6):
    cards = [card_image(r).scaled(320, 210, Qt.KeepAspectRatio, Qt.SmoothTransformation) for r in rows]
    n_rows = (len(cards) + columns - 1) // columns
    sheet = QImage(columns * 320, max(1, n_rows) * 210, QImage.Format_RGB32)
    sheet.fill(QColor("#101317"))
    p = QPainter(sheet)
    for i, c in enumerate(cards):
        p.drawImage((i % columns) * 320, (i // columns) * 210, c)
    p.end()
    return sheet


class FactoryTab(QWidget):
    def __init__(self, session, parent=None):
        super().__init__(parent)
        self.s = session
        self.avoid_looks, self.avoid_names = set(), set()

        self.count = QSpinBox()
        self.count.setRange(1, 100000)
        self.count.setValue(100)
        self.seed = QLineEdit(f"batch-{date.today().isoformat()}")
        self.seed.setToolTip("The same seed and settings always give the same batch.")
        self.prefix = QLineEdit("LUMI")
        self.prefix.setMaxLength(12)
        self.start = QSpinBox()
        self.start.setRange(0, 999999)
        self.start.setValue(1)
        self.mix = {}
        mix_row = QHBoxLayout()
        for r in RARITIES:
            sp = QDoubleSpinBox()
            sp.setRange(0, 100)
            sp.setSuffix(" %")
            sp.setDecimals(1)
            sp.setValue(factory.DEFAULT_MIX[r] * 100)
            lab = QLabel(r)
            lab.setStyleSheet(f"color: {RARITY_COLOURS[r]}; font-weight: 600;")
            mix_row.addWidget(lab)
            mix_row.addWidget(sp)
            self.mix[r] = sp
        mix_row.addStretch(1)
        self.avoid_label = QLabel("none")
        avoid_btn = QPushButton("Add earlier manifest…")
        avoid_btn.clicked.connect(self.choose_avoid)
        avoid_row = QHBoxLayout()
        avoid_row.addWidget(self.avoid_label, 1)
        avoid_row.addWidget(avoid_btn)
        form = QFormLayout()
        form.addRow("Units", self.count)
        form.addRow("Batch seed", self.seed)
        srow = QHBoxLayout()
        srow.addWidget(self.prefix)
        srow.addWidget(QLabel("-"))
        srow.addWidget(self.start)
        srow.addStretch(1)
        form.addRow("Serials", srow)
        form.addRow("Rarity mix", mix_row)
        form.addRow("Never repeat units from", avoid_row)

        gen = QPushButton("Generate batch")
        gen.setDefault(True)
        gen.clicked.connect(self.generate)
        save = QPushButton("Save manifest…")
        save.clicked.connect(self.save_manifest)
        open_btn = QPushButton("Open manifest…")
        open_btn.clicked.connect(self.open_manifest)
        cards = QPushButton("Export cards…")
        cards.clicked.connect(self.export_cards)
        to_persona = QPushButton("Show in Personality tab")
        to_persona.clicked.connect(self.show_selected)
        brow = QHBoxLayout()
        for b in (gen, save, open_btn, cards, to_persona):
            brow.addWidget(b)
        brow.addStretch(1)
        self.summary = QLabel()
        self.manifest_label = QLabel()
        self.manifest_label.setStyleSheet("color: #8a97a3;")

        self.table = QTableWidget(0, len(COLUMNS))
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setIconSize(QSize(64, 32))
        self.table.verticalHeader().setDefaultSectionSize(36)
        self.table.verticalHeader().setVisible(False)
        self.table.currentCellChanged.connect(lambda r, *_: self.preview(r))
        self.view = OledView()
        self.card_info = QLabel()
        self.card_info.setWordWrap(True)

        left = QVBoxLayout()
        left.addLayout(form)
        left.addLayout(brow)
        left.addWidget(self.summary)
        left.addWidget(self.manifest_label)
        left.addWidget(self.table, 1)
        leftw = QWidget()
        leftw.setLayout(left)
        right = QVBoxLayout()
        right.addWidget(self.view)
        right.addWidget(self.card_info)
        right.addStretch(1)
        rightw = QWidget()
        rightw.setLayout(right)
        split = QSplitter(Qt.Horizontal)
        split.addWidget(leftw)
        split.addWidget(rightw)
        split.setStretchFactor(0, 1)
        split.setSizes([900, 400])
        lay = QHBoxLayout(self)
        lay.addWidget(split)
        self.s.manifestChanged.connect(self.fill)
        self.fill()

    # ---- batch ----
    def generate(self):
        mix = {r: sp.value() for r, sp in self.mix.items()}
        if sum(mix.values()) <= 0:
            QMessageBox.warning(self, "Lumi Studio", "The rarity mix adds up to 0%.")
            return
        try:
            batch = factory.generate_batch(self.count.value(), self.seed.text().strip() or "batch",
                                           mix=mix, prefix=self.prefix.text().strip() or "LUMI",
                                           start=self.start.value(), avoid_looks=self.avoid_looks,
                                           avoid_names=self.avoid_names)
        except RuntimeError as e:
            QMessageBox.warning(self, "Lumi Studio", str(e))
            return
        self.s.set_manifest(None, [factory.persona_row(p) for p in batch])

    def choose_avoid(self):
        path, _ = QFileDialog.getOpenFileName(self, "Earlier manifest", "", "Manifest (*.csv)")
        if path:
            self.add_avoid(path)

    def add_avoid(self, path):
        rows = factory.read_manifest(path)
        self.avoid_looks |= {int(r["look"]) for r in rows}
        self.avoid_names |= {r["name"] for r in rows}
        self.avoid_label.setText(f"{len(self.avoid_looks):,} earlier units")

    # ---- manifest ----
    def fill(self):
        rows = self.s.manifest_rows
        shown = rows[:MAX_TABLE_ROWS]
        self.table.setRowCount(len(shown))
        for i, row in enumerate(shown):
            for c, key in enumerate(FIELDS):
                if key is None and i >= MAX_ICONS:
                    item = QTableWidgetItem()
                elif key is None:
                    item = QTableWidgetItem()
                    genes = [int(v) for v in row["genes"].split()]
                    img = frame_image(native.render_expression(NEUTRAL, genes, 600), 1)
                    item.setIcon(QIcon(QPixmap.fromImage(img.scaled(64, 32, Qt.KeepAspectRatio,
                                                                    Qt.SmoothTransformation))))
                else:
                    item = QTableWidgetItem(row.get(key, ""))
                    if key == "rarity":
                        item.setForeground(QColor(RARITY_COLOURS.get(row[key], "#ccc")))
                self.table.setItem(i, c, item)
        counts = {r: sum(x["rarity"] == r for x in rows) for r in RARITIES}
        done = sum(bool(x.get("mac")) for x in rows)
        parts = [f"<span style='color:{RARITY_COLOURS[r]}'>{counts[r]} {r}</span>" for r in RARITIES]
        more = f" (table shows the first {MAX_TABLE_ROWS:,})" if len(rows) > MAX_TABLE_ROWS else ""
        self.summary.setText(f"<b>{len(rows):,} units</b>: " + " · ".join(parts) + f" · {done} provisioned{more}"
                             if rows else "Generate a batch to get started.")
        if self.s.manifest_path:
            self.manifest_label.setText(f"Manifest: {self.s.manifest_path} (the Provision tab fills it in)")
        elif rows:
            self.manifest_label.setText("Not saved yet. Save the manifest before provisioning.")
        else:
            self.manifest_label.clear()
        if rows:
            self.preview(max(0, self.table.currentRow()))

    def save_manifest(self, path=None):
        if not self.s.manifest_rows:
            return
        if not path:
            path, _ = QFileDialog.getSaveFileName(self, "Save manifest", f"{self.seed.text().strip()}.csv",
                                                  "Manifest (*.csv)")
        if path:
            self.s.manifest_path = path
            self.s.save_manifest()

    def open_manifest(self, path=None):
        if not path:
            path, _ = QFileDialog.getOpenFileName(self, "Open manifest", "", "Manifest (*.csv)")
        if path:
            self.s.set_manifest(path, factory.read_manifest(path))

    def export_cards(self, folder=None):
        rows = self.s.manifest_rows
        if not rows:
            return
        if not folder:
            folder = QFileDialog.getExistingDirectory(self, "Folder for the cards")
        if not folder:
            return
        os.makedirs(folder, exist_ok=True)
        for row in rows:
            card_image(row).save(os.path.join(folder, f"{row['serial']}.png"))
        contact_sheet(rows[:60]).save(os.path.join(folder, "sheet.png"))
        return folder

    # ---- selection ----
    def preview(self, r):
        rows = self.s.manifest_rows
        if not 0 <= r < len(rows):
            return
        row = rows[r]
        genes = [int(v) for v in row["genes"].split()]
        self.view.setFrame(native.render_expression(NEUTRAL, genes, 600))
        colour = RARITY_COLOURS.get(row["rarity"], "#ccc")
        self.card_info.setText(
            f"<h2 style='margin:0'>{row['name']}</h2>"
            f"<p style='color:{colour}; font-weight:700'>{row['rarity'].upper()}</p>"
            f"<p>{row['serial']} · look #{row['look']}<br>{row['temperament']}, {row['eye_shape']} eyes "
            f"({row['eye_size']}, {row['spacing']}), {row['highlight']} highlight, accent: {row['accent']}</p>"
            + (f"<p>Provisioned to {row['mac']} at {row['provisioned_at']}</p>" if row.get("mac") else ""))

    def show_selected(self):
        r = self.table.currentRow()
        if 0 <= r < len(self.s.manifest_rows):
            self.s.set_persona(factory.row_persona(self.s.manifest_rows[r]))
