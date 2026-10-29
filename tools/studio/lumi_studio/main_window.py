"""Lumi Studio's main window: toolbar, tabs and status bar."""
import os

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QColor, QIcon, QKeySequence, QPalette, QPixmap
from PySide6.QtWidgets import QApplication, QFileDialog, QLabel, QMainWindow, QMessageBox, QTabWidget

from . import __version__, native
from .animations_tab import AnimationsTab
from .factory_tab import FactoryTab
from .faces_tab import FacesTab
from .model import MAX_PACK, Project, export_firmware_header
from .personality_tab import PersonalityTab
from .provision_tab import ProvisionTab
from .session import Session
from .widgets import frame_image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FIRMWARE_HEADER = os.path.join(REPO, "firmware", "lib", "lumi_core", "src", "generated", "default_pack.h")


def apply_theme(app):
    app.setStyle("Fusion")
    pal = QPalette()
    colours = {
        QPalette.Window: "#16191d", QPalette.WindowText: "#e6eaee", QPalette.Base: "#0f1114",
        QPalette.AlternateBase: "#1b1f24", QPalette.Text: "#e6eaee", QPalette.Button: "#22272d",
        QPalette.ButtonText: "#e6eaee", QPalette.Highlight: "#1fb5c9", QPalette.HighlightedText: "#05080a",
        QPalette.ToolTipBase: "#22272d", QPalette.ToolTipText: "#e6eaee", QPalette.PlaceholderText: "#6c7782",
        QPalette.Link: "#3cf0ff",
    }
    for role, c in colours.items():
        pal.setColor(role, QColor(c))
    pal.setColor(QPalette.Disabled, QPalette.Text, QColor("#5b646d"))
    pal.setColor(QPalette.Disabled, QPalette.ButtonText, QColor("#5b646d"))
    app.setPalette(pal)
    app.setStyleSheet("""
        QTabBar::tab { padding: 8px 18px; }
        QTabBar::tab:selected { color: #3cf0ff; }
        QGroupBox { border: 1px solid #2b3138; border-radius: 6px; margin-top: 12px; padding-top: 8px; }
        QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; color: #aab4bd; }
        QPushButton { padding: 5px 12px; }
        QToolBar { spacing: 6px; border: none; }
    """)


def app_icon():
    face = native.render_expression(3, None, 600)
    return QIcon(QPixmap.fromImage(frame_image(face, 2)))


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.s = Session()
        self.setWindowIcon(app_icon())
        self.resize(1360, 860)

        self.tabs = QTabWidget()
        self.faces = FacesTab(self.s)
        self.animations = AnimationsTab(self.s)
        self.personality = PersonalityTab(self.s)
        self.factory = FactoryTab(self.s)
        self.provision = ProvisionTab(self.s)
        for w, name in ((self.faces, "Faces"), (self.animations, "Animations"),
                        (self.personality, "Personality"), (self.factory, "Factory batch"),
                        (self.provision, "Provision")):
            self.tabs.addTab(w, name)
        self.setCentralWidget(self.tabs)

        tb = self.addToolBar("File")
        tb.setMovable(False)
        tb.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self.actions = {}
        for key, label, shortcut, slot in (
                ("new", "New", QKeySequence.New, self.new_project),
                ("open", "Open…", QKeySequence.Open, self.open_project),
                ("save", "Save", QKeySequence.Save, self.save_project),
                ("save_as", "Save as…", QKeySequence.SaveAs, self.save_project_as),
                ("export_pack", "Export .lumipack…", None, self.export_pack),
                ("export_fw", "Export to firmware…", None, self.export_firmware)):
            act = QAction(label, self)
            if shortcut:
                act.setShortcut(shortcut)
            act.triggered.connect(slot)
            tb.addAction(act)
            self.actions[key] = act
        self.actions["export_pack"].setToolTip("The project's emotions plus the Personality tab's persona, "
                                               "as one unit's pack file.")
        self.actions["export_fw"].setToolTip("Build the project's emotions into the firmware, for every unit.")

        self.pack_label = QLabel()
        self.statusBar().addPermanentWidget(self.pack_label)
        self.statusBar().showMessage(f"Lumi Studio {__version__} · core {native.version()}", 6000)
        self.s.edited.connect(self.update_status)
        self.s.personaChanged.connect(self.update_status)
        self.update_status()

    # ---- status ----
    def update_status(self):
        name = os.path.basename(self.s.path) if self.s.path else "untitled.lumiproject"
        self.setWindowTitle(f"{name}{' *' if self.s.dirty else ''} — Lumi Studio")
        size, problems = self.s.pack_status()
        p = self.s.project
        counts = f"{len(p.faces)} faces · {len(p.animations)} animations"
        if size is None:
            self.pack_label.setText(f"{counts} · <span style='color:#ff8a65'>{len(problems)} problem(s)</span>")
            self.pack_label.setToolTip("\n".join(problems))
        else:
            self.pack_label.setText(f"{counts} · unit pack {size:,} / {MAX_PACK:,} bytes")
            self.pack_label.setToolTip("")

    # ---- project files ----
    def confirm_discard(self):
        if not self.s.dirty:
            return True
        r = QMessageBox.question(self, "Lumi Studio", "Save changes to this project first?",
                                 QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel)
        if r == QMessageBox.Save:
            return self.save_project()
        return r == QMessageBox.Discard

    def new_project(self):
        if self.confirm_discard():
            self.s.replace_project(Project())

    def open_project(self, path=None):
        if not path:
            if not self.confirm_discard():
                return
            path, _ = QFileDialog.getOpenFileName(self, "Open project", "", "Lumi project (*.lumiproject)")
        if not path:
            return
        try:
            self.s.replace_project(Project.load(path), path)
        except (OSError, ValueError, KeyError, TypeError) as e:
            QMessageBox.warning(self, "Lumi Studio", f"Couldn't open {path}:\n{e}")

    def save_project(self):
        if not self.s.path:
            return self.save_project_as()
        self.s.project.save(self.s.path)
        self.s.dirty = False
        self.update_status()
        self.statusBar().showMessage(f"Saved {self.s.path}", 4000)
        return True

    def save_project_as(self, path=None):
        if not path:
            path, _ = QFileDialog.getSaveFileName(self, "Save project", "emotions.lumiproject",
                                                  "Lumi project (*.lumiproject)")
        if not path:
            return False
        if not path.endswith(".lumiproject"):
            path += ".lumiproject"
        self.s.path = path
        return self.save_project()

    # ---- exports ----
    def export_pack(self, path=None):
        try:
            data = self.s.pack(self.s.persona)
        except ValueError as e:
            QMessageBox.warning(self, "Lumi Studio", f"Can't build the pack:\n{e}")
            return None
        if not path:
            path, _ = QFileDialog.getSaveFileName(self, "Export pack", f"{self.s.persona.name or 'unit'}.lumipack",
                                                  "Lumi pack (*.lumipack)")
        if path:
            with open(path, "wb") as f:
                f.write(data)
            self.statusBar().showMessage(f"Wrote {len(data):,} bytes to {path}", 5000)
        return path

    def export_firmware(self, path=None):
        try:
            data = self.s.pack() if (self.s.project.faces or self.s.project.animations) else b""
        except ValueError as e:
            QMessageBox.warning(self, "Lumi Studio", f"Can't build the pack:\n{e}")
            return None
        if not path:
            start = FIRMWARE_HEADER if os.path.isdir(os.path.dirname(FIRMWARE_HEADER)) else "default_pack.h"
            path, _ = QFileDialog.getSaveFileName(self, "Export to firmware (generated/default_pack.h)", start,
                                                  "C header (*.h)")
        if path:
            export_firmware_header(data, path)
            self.statusBar().showMessage(f"Wrote {path}. Rebuild and flash the firmware to ship these emotions.", 8000)
        return path

    def closeEvent(self, e):
        if not self.confirm_discard():
            e.ignore()
            return
        self.provision.stop_virtual()
        e.accept()


def main(argv=None):
    import sys
    app = QApplication(argv if argv is not None else sys.argv)
    app.setApplicationName("Lumi Studio")
    apply_theme(app)
    w = MainWindow()
    args = app.arguments()[1:]
    if args and args[0].endswith(".lumiproject"):
        w.open_project(args[0])
    w.show()
    smoke = os.environ.get("LUMI_STUDIO_SMOKE")
    if smoke:  # CI: prove the packaged app starts, save a screenshot, quit
        from PySide6.QtCore import QTimer
        QTimer.singleShot(800, lambda: (w.grab().save(smoke), w.s.__setattr__("dirty", False), app.quit()))
    return app.exec()
