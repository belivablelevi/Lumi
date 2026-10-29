"""Animations tab: sequences of faces with timing, motion, trigger and mood range."""
from dataclasses import replace

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (QAbstractItemView, QCheckBox, QFormLayout, QHBoxLayout, QHeaderView, QLabel,
                               QLineEdit, QListWidget, QMenu, QMessageBox, QPushButton, QSpinBox, QSplitter,
                               QTableWidget, QVBoxLayout, QWidget)

from . import native
from .model import EFFECTS, EYE_STYLES, MAX_ANIMS, MAX_KEYS, MOTIONS, MOUTHS, AnimationDef, Key
from .widgets import OledView, combo

COLUMNS = ["Face", "Look X", "Look Y", "Motion", "Blend ms", "Hold ms", "Effects", "Eyes", "Mouth"]
TRIGGER_HELP = {
    "idle": "now and then while nothing happens", "pat": "a tap on the head", "double_pat": "two quick taps",
    "pat_spam": "lots of taps", "shake": "shaken", "pickup": "picked up", "put_down": "put down",
    "tilt_left": "tilted left", "tilt_right": "tilted right", "upside_down": "held upside down",
    "freefall": "dropped", "wake": "waking from sleep", "sleep": "falling asleep", "lonely": "left alone a long time",
    "low_battery": "battery low", "boot": "switched on", "update": "new emotions installed",
}


def spin(lo, hi, value, step=1):
    w = QSpinBox()
    w.setRange(lo, hi)
    w.setSingleStep(step)
    w.setValue(value)
    return w


class AnimationsTab(QWidget):
    def __init__(self, session, parent=None):
        super().__init__(parent)
        self.s = session
        self.current = -1
        self._loading = False
        self.player = native.Player(seed=7)
        self.t = 0
        self.playing = False

        # ---- left: list ----
        self.list = QListWidget()
        new_btn = QPushButton("New")
        dup_btn = QPushButton("Duplicate")
        del_btn = QPushButton("Delete")
        new_btn.clicked.connect(lambda: self.new_animation())
        dup_btn.clicked.connect(self.duplicate_animation)
        del_btn.clicked.connect(self.delete_animation)
        left = QVBoxLayout()
        left.addWidget(QLabel("<b>Animations</b>"))
        left.addWidget(self.list, 1)
        row = QHBoxLayout()
        for b in (new_btn, dup_btn, del_btn):
            row.addWidget(b)
        left.addLayout(row)
        leftw = QWidget()
        leftw.setLayout(left)

        # ---- right: properties, keys, preview ----
        self.name = QLineEdit()
        self.name.setMaxLength(23)
        self.trigger = combo(native.trigger_names())
        self.trigger_help = QLabel()
        self.trigger_help.setStyleSheet("color: #8a97a3;")
        self.mood_min = spin(0, 100, 0)
        self.mood_max = spin(0, 100, 100)
        self.weight = spin(1, 10, 1)
        self.weight.setMaximumWidth(80)
        self.weight.setToolTip("How often this plays compared with other animations for the same trigger.")
        form = QFormLayout()
        form.addRow("Name", self.name)
        trow = QHBoxLayout()
        trow.addWidget(self.trigger)
        trow.addWidget(self.trigger_help, 1)
        form.addRow("Plays when", trow)
        mrow = QHBoxLayout()
        mrow.addWidget(self.mood_min)
        mrow.addWidget(QLabel("to"))
        mrow.addWidget(self.mood_max)
        mrow.addWidget(QLabel("(0 = sad, 100 = very happy)"))
        mrow.addStretch(1)
        form.addRow("Mood range", mrow)
        form.addRow("Weight", self.weight)
        self.name.editingFinished.connect(self.save_props)
        self.trigger.currentIndexChanged.connect(self.save_props)
        for w in (self.mood_min, self.mood_max, self.weight):
            w.valueChanged.connect(self.save_props)

        self.table = QTableWidget(0, len(COLUMNS))
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.verticalHeader().setDefaultSectionSize(34)
        self.table.setMinimumHeight(34 * 4 + 30)
        add_key = QPushButton("Add key")
        del_key = QPushButton("Remove key")
        up_key = QPushButton("Move up")
        down_key = QPushButton("Move down")
        add_key.clicked.connect(self.add_key)
        del_key.clicked.connect(self.remove_key)
        up_key.clicked.connect(lambda: self.move_key(-1))
        down_key.clicked.connect(lambda: self.move_key(1))
        krow = QHBoxLayout()
        for b in (add_key, del_key, up_key, down_key):
            krow.addWidget(b)
        krow.addStretch(1)
        self.length = QLabel()
        krow.addWidget(self.length)

        self.view = OledView()
        self.play_btn = QPushButton("▶  Play")
        self.play_btn.clicked.connect(self.play_current)
        self.loop = QCheckBox("Loop")
        self.on_genes = QCheckBox("On the Personality tab's persona")
        self.on_genes.toggled.connect(self._apply_genes)
        self.builtin = combo([f"{n}  ({t})" for n, t in native.builtin_animations()])
        play_builtin = QPushButton("Play built-in")
        play_builtin.clicked.connect(lambda: self.play(native.builtin_animations()[self.builtin.currentIndex()][0]))
        self.problems = QLabel()
        self.problems.setWordWrap(True)
        self.problems.setStyleSheet("color: #ff8a65;")
        prow = QHBoxLayout()
        prow.addWidget(self.play_btn)
        prow.addWidget(self.loop)
        prow.addWidget(self.on_genes)
        prow.addStretch(1)
        prow.addWidget(QLabel("Built-ins:"))
        prow.addWidget(self.builtin)
        prow.addWidget(play_builtin)

        right = QVBoxLayout()
        right.addLayout(form)
        right.addWidget(self.table, 3)
        right.addLayout(krow)
        right.addWidget(self.view, 2)
        right.addLayout(prow)
        right.addWidget(self.problems)
        self.editor = QWidget()
        self.editor.setLayout(right)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(leftw)
        split.addWidget(self.editor)
        split.setStretchFactor(1, 1)
        split.setSizes([220, 1080])
        lay = QHBoxLayout(self)
        lay.addWidget(split)

        self.list.currentRowChanged.connect(self.select)
        self.s.projectChanged.connect(self.refresh)
        self.s.edited.connect(self.update_problems)
        self.s.personaChanged.connect(self._apply_genes)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(33)
        self.refresh()

    # ---- list ----
    def anim(self):
        anims = self.s.project.animations
        return anims[self.current] if 0 <= self.current < len(anims) else None

    def refresh(self):
        names = [a.name or "(unnamed)" for a in self.s.project.animations]
        if [self.list.item(i).text() for i in range(self.list.count())] != names:
            self.list.blockSignals(True)
            self.list.clear()
            self.list.addItems(names)
            self.list.blockSignals(False)
        if not 0 <= self.current < len(names):
            self.current = 0 if names else -1
        self.list.blockSignals(True)
        self.list.setCurrentRow(self.current)
        self.list.blockSignals(False)
        self.load_editor()
        self.update_problems()

    def update_problems(self):
        problems = self.s.project.problems()
        self.problems.setText("\n".join(problems[:6]) + ("\n…" if len(problems) > 6 else ""))

    def _unique(self, base):
        names = {a.name for a in self.s.project.animations}
        name, n = base[:23], 2
        while name in names:
            suffix = f"_{n}"
            name = base[:23 - len(suffix)] + suffix
            n += 1
        return name

    def new_animation(self, name=None, trigger="pat"):
        if len(self.s.project.animations) >= MAX_ANIMS:
            QMessageBox.warning(self, "Lumi Studio", f"A pack holds at most {MAX_ANIMS} animations.")
            return None
        first = f"custom:{next(iter(self.s.project.faces))}" if self.s.project.faces else "expr:joy"
        a = AnimationDef(self._unique(name or "my_animation"), trigger, 0, 100, 1,
                         [Key(first, tween=150, hold=700), Key("expr:neutral", tween=250, hold=200)])
        self.s.project.animations.append(a)
        self.current = len(self.s.project.animations) - 1
        self.s.touch()
        return a

    def duplicate_animation(self):
        a = self.anim()
        if not a:
            return
        b = replace(a, name=self._unique(a.name + "_copy"), keys=[replace(k, fx=list(k.fx)) for k in a.keys])
        self.s.project.animations.append(b)
        self.current = len(self.s.project.animations) - 1
        self.s.touch()

    def delete_animation(self):
        if self.anim():
            del self.s.project.animations[self.current]
            self.current = min(self.current, len(self.s.project.animations) - 1)
            self.s.touch()

    def select(self, row):
        self.current = row
        self.load_editor()

    # ---- editor ----
    def load_editor(self):
        a = self.anim()
        self.editor.setEnabled(True)
        for w in (self.name, self.trigger, self.mood_min, self.mood_max, self.weight, self.table):
            w.setEnabled(a is not None)
        self._loading = True
        if a:
            self.name.setText(a.name)
            if a.trigger in native.trigger_names():
                self.trigger.setCurrentIndex(native.trigger_names().index(a.trigger))
            self.mood_min.setValue(a.moodMin)
            self.mood_max.setValue(a.moodMax)
            self.weight.setValue(a.weight)
        self._update_trigger_help()
        self._fill_table()
        self._loading = False

    def _update_trigger_help(self):
        t = self.trigger.currentText()
        self.trigger_help.setText(TRIGGER_HELP.get(t, "during Boop Pong" if t.startswith("pong") else ""))

    def save_props(self):
        a = self.anim()
        self._update_trigger_help()
        if self._loading or not a:
            return
        new_name = self.name.text().strip()
        if new_name != a.name:
            others = {x.name for x in self.s.project.animations if x is not a}
            if new_name and new_name not in others:
                a.name = new_name
            else:
                self.name.setText(a.name)
        a.trigger = self.trigger.currentText()
        a.moodMin, a.moodMax, a.weight = self.mood_min.value(), self.mood_max.value(), self.weight.value()
        self.s.touch()

    def _face_choices(self):
        return ([("custom:" + n, f"★ {n}") for n in self.s.project.faces] +
                [("expr:" + n, n) for n in native.expression_names()])

    def _fill_table(self):
        a = self.anim()
        keys = a.keys if a else []
        self.table.setRowCount(len(keys))
        choices = self._face_choices()
        for r, k in enumerate(keys):
            face = combo([label for _, label in choices])
            refs = [ref for ref, _ in choices]
            if k.face in refs:
                face.setCurrentIndex(refs.index(k.face))
            face.currentIndexChanged.connect(lambda i, k=k, refs=refs: self._set(k, "face", refs[i]))
            self.table.setCellWidget(r, 0, face)
            for col, attr, lo, hi, step in ((1, "lookX", -40, 40, 1), (2, "lookY", -20, 20, 1),
                                            (4, "tween", 0, 5000, 50), (5, "hold", 0, 15000, 100)):
                w = spin(lo, hi, getattr(k, attr), step)
                w.valueChanged.connect(lambda v, k=k, attr=attr: self._set(k, attr, v))
                self.table.setCellWidget(r, col, w)
            motion = combo(MOTIONS)
            motion.setCurrentIndex(MOTIONS.index(k.motion) if k.motion in MOTIONS else 0)
            motion.currentIndexChanged.connect(lambda i, k=k: self._set(k, "motion", MOTIONS[i]))
            self.table.setCellWidget(r, 3, motion)
            self.table.setCellWidget(r, 6, self._fx_button(k))
            for col, attr, names in ((7, "eyes", EYE_STYLES), (8, "mouth", MOUTHS)):
                c = combo(["keep"] + names)
                v = getattr(k, attr)
                c.setCurrentIndex(0 if v == "keep" else names.index(v) + 1)
                c.currentIndexChanged.connect(
                    lambda i, k=k, attr=attr, names=names: self._set(k, attr, "keep" if i == 0 else names[i - 1]))
                self.table.setCellWidget(r, col, c)
        total = sum(k.tween + k.hold for k in keys)
        self.length.setText(f"{len(keys)}/{MAX_KEYS} keys · {total / 1000:.2f} s")

    def _fx_button(self, k):
        b = QPushButton(", ".join(k.fx) or "none")
        menu = QMenu(b)
        for name in EFFECTS:
            act = QAction(name, menu)
            act.setCheckable(True)
            act.setChecked(name in k.fx)
            act.toggled.connect(lambda on, name=name, k=k, b=b: self._toggle_fx(k, name, on, b))
            menu.addAction(act)
        b.setMenu(menu)
        return b

    def _toggle_fx(self, k, name, on, button):
        k.fx = [n for n in EFFECTS if (n in k.fx and n != name) or (n == name and on)]
        button.setText(", ".join(k.fx) or "none")
        self.s.touch(structural=False)

    def _set(self, k, attr, v):
        if self._loading:
            return
        setattr(k, attr, v)
        a = self.anim()
        self.length.setText(f"{len(a.keys)}/{MAX_KEYS} keys · {sum(x.tween + x.hold for x in a.keys) / 1000:.2f} s")
        self.s.touch(structural=False)

    def add_key(self):
        a = self.anim()
        if not a or len(a.keys) >= MAX_KEYS:
            return
        row = self.table.currentRow()
        base = a.keys[row] if 0 <= row < len(a.keys) else (a.keys[-1] if a.keys else Key())
        a.keys.insert(row + 1 if row >= 0 else len(a.keys), replace(base, fx=list(base.fx)))
        self.s.touch()

    def remove_key(self):
        a = self.anim()
        row = self.table.currentRow()
        if a and len(a.keys) > 1:
            del a.keys[row if 0 <= row < len(a.keys) else -1]
            self.s.touch()

    def move_key(self, d):
        a = self.anim()
        row = self.table.currentRow()
        if a and 0 <= row < len(a.keys) and 0 <= row + d < len(a.keys):
            a.keys[row], a.keys[row + d] = a.keys[row + d], a.keys[row]
            self.s.touch()
            self.table.selectRow(row + d)

    # ---- preview ----
    def _apply_genes(self):
        self.player.set_genes(self.s.persona.genes if self.on_genes.isChecked() else None)

    def load_project_pack(self):
        """Loads the project into the preview player. Returns an error message or ''."""
        try:
            data = self.s.pack()
        except ValueError as e:
            self.player.load_pack(b"")
            return str(e)
        self.player.load_pack(data)
        return ""

    def play_current(self):
        a = self.anim()
        if a:
            err = self.load_project_pack()
            if err:
                self.problems.setText("Fix these to preview:\n" + err)
                return
            self.play(a.name)

    def play(self, name):
        self.load_project_pack()
        self._apply_genes()
        self.playing_name = name
        self.playing = self.player.play(name) >= 0
        return self.playing

    def tick(self):
        if not self.isVisible():
            return
        self.t += 33
        self.player.update(self.t)
        if self.playing and not self.player.busy():
            if self.loop.isChecked():
                self.player.play(self.playing_name)
            else:
                self.playing = False
        self.view.setFrame(self.player.render())

    def showEvent(self, e):
        self.load_project_pack()
        super().showEvent(e)
