"""Personality tab: one unit's genes (look + temperament), name, rarity and favourites."""
import random

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QFormLayout, QGridLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit, QListWidget,
                               QListWidgetItem, QPushButton, QScrollArea, QSplitter, QVBoxLayout, QWidget)

from . import native
from .model import Persona
from .widgets import OledView, combo, set_rarity

TEMPERAMENT_HELP = {
    "cheerful": "Starts out happy and recovers quickly. Loves giggles, dancing and humming.",
    "sleepy": "Gets tired 60% faster and idles slowly. Yawns, nods off and zones out.",
    "shy": "Gets bashful when patted. Favours shy and squishy reactions.",
    "grumpy": "Starts out a bit low and needs more attention to be happy. Side-eyes and pouts.",
    "hyper": "Restless: idles almost twice as often and tires faster. Dances and goes cross-eyed.",
}


class PersonalityTab(QWidget):
    def __init__(self, session, parent=None):
        super().__init__(parent)
        self.s = session
        self._loading = False
        self.player = native.Player(seed=11)
        self.player.set_idle(True)
        self.t = 0

        # ---- genes ----
        self.name = QLineEdit()
        self.name.setMaxLength(15)
        self.serial = QLineEdit()
        self.serial.setMaxLength(23)
        self.serial.setPlaceholderText("optional, e.g. LUMI-000421")
        self.genes = []
        form = QFormLayout()
        form.addRow("Name", self.name)
        form.addRow("Serial", self.serial)
        for g, gname in enumerate(native.gene_names()):
            weights = native.gene_weights(g)
            total = sum(weights)
            c = combo([f"{o}   ({100 * w / total:.0f}%)" for o, w in zip(native.gene_options(g), weights)])
            c.currentIndexChanged.connect(self.from_controls)
            form.addRow(gname.capitalize(), c)
            self.genes.append(c)
        self.name.textEdited.connect(self.from_controls)
        self.serial.textEdited.connect(self.from_controls)
        self.temper = QLabel()
        self.temper.setWordWrap(True)
        self.temper.setStyleSheet("color: #8a97a3;")
        self.rarity = QLabel()
        self.look = QLabel()
        self.look.setStyleSheet("color: #8a97a3;")

        self.random_btn = rand = QPushButton("🎲  Random unit")
        # clicked() sends checked=False, which randomize() would take as seed 0: the same unit every press.
        rand.clicked.connect(lambda: self.randomize())
        self.mac = QLineEdit()
        self.mac.setPlaceholderText("chip MAC, e.g. 24:0A:C4:12:34:56")
        auto = QPushButton("Show its automatic persona")
        auto.clicked.connect(self.from_mac)
        self.mac_msg = QLabel()
        self.mac_msg.setWordWrap(True)
        self.mac_msg.setStyleSheet("color: #8a97a3;")
        mrow = QHBoxLayout()
        mrow.addWidget(self.mac, 1)
        mrow.addWidget(auto)

        self.favs = QListWidget()
        self.favs.setMaximumHeight(150)
        self.favs.itemChanged.connect(self.fav_changed)
        fav_box = QGroupBox("Favourite animations (up to 4, played 3x as often)")
        fl = QVBoxLayout(fav_box)
        fl.addWidget(self.favs)

        left = QVBoxLayout()
        left.addLayout(form)
        left.addWidget(self.temper)
        left.addWidget(self.rarity)
        left.addWidget(self.look)
        left.addWidget(rand)
        left.addLayout(mrow)
        left.addWidget(self.mac_msg)
        left.addWidget(fav_box)
        left.addStretch(1)
        leftw = QWidget()
        leftw.setLayout(left)
        lscroll = QScrollArea()
        lscroll.setWidgetResizable(True)
        lscroll.setWidget(leftw)
        lscroll.setMinimumWidth(380)

        # ---- previews ----
        self.live = OledView()
        live_note = QLabel("Live: this unit idling, with blinks, breathing and idle animations.")
        live_note.setStyleSheet("color: #8a97a3;")
        grid = QGridLayout()
        grid.setSpacing(6)
        self.cells = []
        for i, name in enumerate(native.expression_names()):
            v = OledView(min_scale=1, gap=False)
            v.setMinimumSize(132, 68)
            lab = QLabel(name)
            lab.setAlignment(Qt.AlignCenter)
            lab.setStyleSheet("color: #8a97a3; font-size: 11px;")
            box = QVBoxLayout()
            box.setSpacing(1)
            box.addWidget(v)
            box.addWidget(lab)
            grid.addLayout(box, i // 6, i % 6)
            self.cells.append(v)
        gridw = QWidget()
        gridw.setLayout(grid)
        gscroll = QScrollArea()
        gscroll.setWidgetResizable(True)
        gscroll.setWidget(gridw)
        right = QVBoxLayout()
        right.addWidget(self.live, 2)
        right.addWidget(live_note)
        right.addWidget(QLabel("<b>Every expression on this unit</b> (check none look broken)"))
        right.addWidget(gscroll, 3)
        rightw = QWidget()
        rightw.setLayout(right)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(lscroll)
        split.addWidget(rightw)
        split.setStretchFactor(1, 1)
        split.setSizes([400, 900])
        lay = QHBoxLayout(self)
        lay.addWidget(split)

        self.s.personaChanged.connect(self.load)
        self.s.projectChanged.connect(self.refresh_favourites)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(33)
        self.load()

    # ---- persona <-> controls ----
    def load(self):
        p = self.s.persona
        self._loading = True
        if self.name.text() != p.name:
            self.name.setText(p.name)
        if self.serial.text() != p.serial:
            self.serial.setText(p.serial)
        for c, v in zip(self.genes, p.genes):
            c.setCurrentIndex(v)
        self._loading = False
        self.refresh_favourites()
        self.show_info()

    def from_controls(self):
        if self._loading:
            return
        p = self.s.persona
        favs = [f for f in p.favourites]
        self.s.persona = Persona(self.name.text().strip(), [c.currentIndex() for c in self.genes],
                                 self.serial.text().strip(), favs)
        self.s.personaChanged.emit()

    def refresh_favourites(self):
        names = self.s.animation_names()
        favs = set(self.s.persona.favourites)
        self.favs.blockSignals(True)
        self.favs.clear()
        for n in names:
            item = QListWidgetItem(n)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked if n in favs else Qt.Unchecked)
            self.favs.addItem(item)
        self.favs.blockSignals(False)

    def fav_changed(self, item):
        favs = [self.favs.item(i).text() for i in range(self.favs.count())
                if self.favs.item(i).checkState() == Qt.Checked]
        if len(favs) > 4:
            self.favs.blockSignals(True)
            item.setCheckState(Qt.Unchecked)
            self.favs.blockSignals(False)
            return
        self.s.persona.favourites = favs

    def show_info(self):
        p = self.s.persona
        temperament = native.gene_options(6)[p.genes[6]]
        self.temper.setText(f"<b>{temperament.capitalize()}:</b> {TEMPERAMENT_HELP.get(temperament, '')}")
        set_rarity(self.rarity, p.rarity, native.genes_probability(p.genes))
        self.look.setText(f"Look #{p.look:,} of {native.look_count():,}")
        for i, v in enumerate(self.cells):
            v.setFrame(native.render_expression(i, p.genes, 600))
        self.player.set_genes(p.genes)

    # ---- actions ----
    def randomize(self, seed=None):
        seed = random.getrandbits(48) if seed is None else seed
        self.s.set_persona(Persona(native.name_from_seed(seed), native.genes_from_seed(seed)))
        self.mac_msg.clear()

    def from_mac(self):
        try:
            seed = native.mac_seed(self.mac.text().strip())
        except ValueError as e:
            self.mac_msg.setText(str(e))
            return
        self.s.set_persona(Persona(native.name_from_seed(seed), native.genes_from_seed(seed)))
        self.mac_msg.setText("This is who that unit becomes if it's never provisioned. "
                             "Provisioning replaces it with an assigned persona.")

    def tick(self):
        if not self.isVisible():
            return
        self.t += 33
        self.player.update(self.t)
        self.live.setFrame(self.player.render())

    def showEvent(self, e):
        try:
            self.player.load_pack(self.s.pack())
        except ValueError:
            self.player.load_pack(b"")
        self.player.set_genes(self.s.persona.genes)
        super().showEvent(e)
