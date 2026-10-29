"""Faces tab: design custom faces from any built-in expression."""
from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QCheckBox, QFormLayout, QGridLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit,
                               QListWidget, QMessageBox, QPushButton, QScrollArea, QSplitter, QVBoxLayout, QWidget)

from . import native
from .model import EFFECTS, ENUMS, MAX_FACES, NUMERIC, Face
from .widgets import OledView, SliderSpin, combo

ENUM_LABELS = {"styleL": "Left eye style", "styleR": "Right eye style", "mouth": "Mouth",
               "shineStyle": "Highlight style", "accent": "Accent"}
# Sliders stop at sensible values; the spin boxes still reach the full stored range.
SLIDER_STEP = {4: 0.25, 2: 0.5, 250: 0.01, 100: 0.01}


class FacesTab(QWidget):
    def __init__(self, session, parent=None):
        super().__init__(parent)
        self.s = session
        self.current = None  # name of the face being edited
        self.t = 0
        self._loading = False

        # ---- left: the project's faces ----
        self.list = QListWidget()
        self.start_from = combo(native.expression_names())
        new_btn = QPushButton("New face")
        dup_btn = QPushButton("Duplicate")
        del_btn = QPushButton("Delete")
        new_btn.clicked.connect(lambda: self.new_face(self.start_from.currentIndex()))
        dup_btn.clicked.connect(self.duplicate_face)
        del_btn.clicked.connect(self.delete_face)
        left = QVBoxLayout()
        left.addWidget(QLabel("<b>Custom faces</b>"))
        left.addWidget(self.list, 1)
        row = QHBoxLayout()
        row.addWidget(QLabel("Start from"))
        row.addWidget(self.start_from, 1)
        left.addLayout(row)
        row = QHBoxLayout()
        for b in (new_btn, dup_btn, del_btn):
            row.addWidget(b)
        left.addLayout(row)
        leftw = QWidget()
        leftw.setLayout(left)

        # ---- centre: preview ----
        self.view = OledView()
        self.on_genes = QCheckBox("Preview on the persona from the Personality tab")
        self.on_genes.toggled.connect(self.render)
        self.name_edit = QLineEdit()
        self.name_edit.setMaxLength(23)
        self.name_edit.editingFinished.connect(self.rename_face)
        self.hint = QLabel()
        self.hint.setWordWrap(True)
        self.hint.setStyleSheet("color: #8a97a3;")
        centre = QVBoxLayout()
        row = QHBoxLayout()
        row.addWidget(QLabel("Name"))
        row.addWidget(self.name_edit, 1)
        centre.addLayout(row)
        centre.addWidget(self.view, 1)
        centre.addWidget(self.on_genes)
        centre.addWidget(self.hint)
        centrew = QWidget()
        centrew.setLayout(centre)

        # ---- right: every parameter ----
        form = QFormLayout()
        self.numeric = {}
        for key, _off, scale, _signed, lo, hi, label in NUMERIC:
            w = SliderSpin(lo, hi, SLIDER_STEP[scale], 2)
            w.valueChanged.connect(lambda v, k=key: self.set_value(k, v))
            form.addRow(label, w)
            self.numeric[key] = w
        self.enums = {}
        for key, _off, names in ENUMS:
            c = combo(names)
            c.currentIndexChanged.connect(lambda i, k=key: self.set_value(k, i))
            form.addRow(ENUM_LABELS[key], c)
            self.enums[key] = c
        fx_box = QGroupBox("Effects")
        grid = QGridLayout(fx_box)
        self.fx = []
        for i, name in enumerate(EFFECTS):
            cb = QCheckBox(name)
            cb.toggled.connect(self.set_fx)
            grid.addWidget(cb, i // 3, i % 3)
            self.fx.append(cb)
        params = QWidget()
        pl = QVBoxLayout(params)
        pl.addLayout(form)
        pl.addWidget(fx_box)
        pl.addStretch(1)
        self.params = params
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(params)
        scroll.setMinimumWidth(420)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(leftw)
        split.addWidget(centrew)
        split.addWidget(scroll)
        split.setStretchFactor(1, 1)
        split.setSizes([220, 640, 440])
        lay = QHBoxLayout(self)
        lay.addWidget(split)

        self.start_from.currentIndexChanged.connect(self.render)
        self.list.currentTextChanged.connect(self.select)
        self.s.projectChanged.connect(self.refresh_list)
        self.s.personaChanged.connect(self.render)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(100)
        self.refresh_list()

    # ---- list ----
    def refresh_list(self):
        names = list(self.s.project.faces)
        if [self.list.item(i).text() for i in range(self.list.count())] != names:
            self.list.blockSignals(True)
            self.list.clear()
            self.list.addItems(names)
            self.list.blockSignals(False)
        if self.current not in self.s.project.faces:
            self.current = None
            if names:
                self.list.setCurrentRow(0)
                self.select(names[0])
        self.load_editor()

    def _unique(self, base):
        name, n = base[:23], 2
        while name in self.s.project.faces:
            suffix = f" {n}"
            name = base[:23 - len(suffix)] + suffix
            n += 1
        return name

    def new_face(self, expr_index, name=None):
        if len(self.s.project.faces) >= MAX_FACES:
            QMessageBox.warning(self, "Lumi Studio", f"A pack holds at most {MAX_FACES} custom faces.")
            return None
        name = self._unique(name or f"my {native.expression_names()[expr_index]}")
        self.s.project.faces[name] = Face.from_expression(expr_index)
        self.current = name
        self.s.touch()
        self.list.setCurrentRow(list(self.s.project.faces).index(name))
        return name

    def duplicate_face(self):
        if not self.current:
            return
        name = self._unique(self.current + " copy")
        self.s.project.faces[name] = self.s.project.faces[self.current].copy()
        self.current = name
        self.s.touch()
        self.list.setCurrentRow(list(self.s.project.faces).index(name))

    def delete_face(self):
        if not self.current:
            return
        users = [a.name for a in self.s.project.animations
                 if any(k.face == f"custom:{self.current}" for k in a.keys)]
        if users:
            QMessageBox.warning(self, "Lumi Studio",
                                f"'{self.current}' is used by: {', '.join(users)}.\nChange those keys first.")
            return
        del self.s.project.faces[self.current]
        self.current = None
        self.s.touch()

    def rename_face(self):
        new = self.name_edit.text().strip()
        old = self.current
        if not old or new == old:
            return
        if not new or new in self.s.project.faces:
            self.name_edit.setText(old)
            return
        self.s.project.faces = {(new if k == old else k): v for k, v in self.s.project.faces.items()}
        for a in self.s.project.animations:
            for k in a.keys:
                if k.face == f"custom:{old}":
                    k.face = f"custom:{new}"
        self.current = new
        self.s.touch()

    def select(self, name):
        if name and name in self.s.project.faces:
            self.current = name
            self.load_editor()

    # ---- editor ----
    def face(self):
        return self.s.project.faces.get(self.current) if self.current else None

    def load_editor(self):
        f = self.face()
        self.params.setEnabled(f is not None)
        self.name_edit.setEnabled(f is not None)
        self._loading = True
        if f:
            self.name_edit.setText(self.current)
            for k, w in self.numeric.items():
                w.setValue(f.values[k])
            for k, c in self.enums.items():
                c.setCurrentIndex(f.styles[k])
            for i, cb in enumerate(self.fx):
                cb.setChecked(bool(f.fx & (1 << i)))
            self.hint.setText("Every change is stored exactly as the unit will show it. "
                              "Use this face in an animation on the Animations tab.")
        else:
            self.name_edit.clear()
            self.hint.setText("Pick an expression under 'Start from' and press New face.")
        self._loading = False
        self.render()

    def set_value(self, key, v):
        f = self.face()
        if self._loading or not f:
            return
        f.update({key: v})
        self.s.touch(structural=False)
        self.render()

    def set_fx(self):
        f = self.face()
        if self._loading or not f:
            return
        f.update({"fx": sum(1 << i for i, cb in enumerate(self.fx) if cb.isChecked())})
        self.s.touch(structural=False)
        self.render()

    def tick(self):
        if not self.isVisible():
            return
        self.t += 100
        f = self.face()
        if f and f.fx:
            self.render()

    def render(self):
        f = self.face()
        if f is None:
            frame = native.render_expression(self.start_from.currentIndex(), self._genes(), self.t)
        else:
            frame = native.render_face(f.to_bytes(), self._genes(), self.t)
        self.view.setFrame(frame)

    def _genes(self):
        return self.s.persona.genes if self.on_genes.isChecked() else None
