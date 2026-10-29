"""Drives Lumi Studio's window offscreen through a whole design-to-factory run.

Screenshots of each tab land in build/studio/screens for review.
"""
import os
import sys
import time

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SCREENS = os.path.join(REPO, "build", "studio", "screens")

from PySide6.QtWidgets import QApplication  # noqa: E402

from lumi_studio import factory, native  # noqa: E402
from lumi_studio.main_window import MainWindow, apply_theme  # noqa: E402
from lumi_studio.model import ACCENTS, Project  # noqa: E402


@pytest.fixture(scope="module")
def app():
    a = QApplication.instance() or QApplication([])
    apply_theme(a)
    return a


@pytest.fixture
def win(app):
    w = MainWindow()
    w.show()
    yield w
    w.provision.stop_virtual()
    w.s.dirty = False
    w.close()


def pump(app, ms):
    end = time.monotonic() + ms / 1000
    while time.monotonic() < end:
        app.processEvents()
        time.sleep(0.005)


def shot(w, name):
    os.makedirs(SCREENS, exist_ok=True)
    w.grab().save(os.path.join(SCREENS, name + ".png"))


def test_design_to_factory(app, win, tmp_path):
    s = win.s
    exprs = native.expression_names()

    # Faces: start a face from "wink", give it lashes and bigger eyes.
    win.tabs.setCurrentWidget(win.faces)
    name = win.faces.new_face(exprs.index("wink"), "big wink")
    assert name == "big wink" and "big wink" in s.project.faces
    win.faces.enums["accent"].setCurrentIndex(ACCENTS.index("lashes"))
    win.faces.numeric["eyeW"].spin.setValue(32)
    win.faces.fx[9].setChecked(True)  # hearts
    face = s.project.faces["big wink"]
    assert face.styles["accent"] == ACCENTS.index("lashes") and face.values["eyeW"] == 32 and face.fx == 1 << 9
    pump(app, 150)
    assert win.faces.view.frame() == native.render_face(face.to_bytes(), None, win.faces.t)
    shot(win, "1-faces")

    # Renaming a face follows into animations.
    win.tabs.setCurrentWidget(win.animations)
    a = win.animations.new_animation("signature_wink")
    assert a.keys[0].face == "custom:big wink"
    win.faces.name_edit.setText("starry wink")
    win.faces.rename_face()
    assert a.keys[0].face == "custom:starry wink"

    # Animations: edit a key through the table, then play it in the preview.
    win.animations.select(0)
    win.animations.table.cellWidget(0, 5).setValue(900)  # hold ms
    assert a.keys[0].hold == 900
    win.animations.trigger.setCurrentIndex(native.trigger_names().index("double_pat"))
    assert a.trigger == "double_pat"
    win.animations.add_key()
    assert len(a.keys) == 3
    assert win.animations.play(a.name)
    frames = set()
    for _ in range(20):
        pump(app, 40)
        frames.add(win.animations.view.frame())
    assert len(frames) > 3
    shot(win, "2-animations")

    # Personality: a random unit, then the automatic persona for a MAC.
    win.tabs.setCurrentWidget(win.personality)
    win.personality.randomize(seed=987654)
    assert s.persona.genes == native.genes_from_seed(987654)
    win.personality.mac.setText("24:0A:C4:12:34:56")
    win.personality.from_mac()
    seed = native.mac_seed("24:0A:C4:12:34:56")
    assert s.persona.name == native.name_from_seed(seed)
    win.personality.genes[5].setCurrentIndex(ACCENTS.index("freckles"))
    assert s.persona.genes[5] == ACCENTS.index("freckles")
    pump(app, 300)
    assert any(win.personality.live.frame())
    shot(win, "3-personality")

    # Factory: a batch of 40, saved, with cards.
    win.tabs.setCurrentWidget(win.factory)
    win.factory.count.setValue(40)
    win.factory.seed.setText("ui-test")
    win.factory.generate()
    rows = s.manifest_rows
    assert len(rows) == 40 and len({r["look"] for r in rows}) == 40
    manifest = str(tmp_path / "batch.csv")
    win.factory.save_manifest(manifest)
    assert os.path.exists(manifest) and s.manifest_path == manifest
    cards = win.factory.export_cards(str(tmp_path / "cards"))
    assert len(os.listdir(cards)) == 41  # one per unit + the sheet
    win.factory.table.selectRow(2)
    pump(app, 50)
    shot(win, "4-factory")
    os.makedirs(SCREENS, exist_ok=True)
    factory_sheet = os.path.join(cards, "sheet.png")
    with open(factory_sheet, "rb") as f, open(os.path.join(SCREENS, "cards-sheet.png"), "wb") as g:
        g.write(f.read())

    # Save and reopen the project.
    path = str(tmp_path / "emotions.lumiproject")
    win.save_project_as(path)
    assert not s.dirty
    before = s.pack()
    s.replace_project(Project())
    win.open_project(path)
    assert s.pack() == before

    # Export to firmware and a .lumipack.
    header = str(tmp_path / "default_pack.h")
    win.export_firmware(header)
    assert f"kDefaultPackSize = {len(before)};" in open(header).read()
    assert os.path.getsize(win.export_pack(str(tmp_path / "unit.lumipack"))) > len(before)

    # Provision: two units from the manifest onto a virtual Lumi, then a hand-picked one.
    if not native.find_tool("virtual_lumi") or sys.platform == "win32":
        pytest.skip("virtual_lumi not built")
    win.tabs.setCurrentWidget(win.provision)
    win.provision.start_virtual()
    results = []
    win.provision.jobDone.connect(results.append)

    def run():
        n = len(results)
        win.provision.provision()
        deadline = time.monotonic() + 20
        while len(results) == n and time.monotonic() < deadline:
            pump(app, 20)
        assert len(results) == n + 1, "provisioning didn't finish"
        return results[-1]

    assert run(), win.provision.log_view.toPlainText()
    first = factory.next_unprovisioned(factory.read_manifest(manifest))
    assert first == 1  # row 0 recorded on disk
    done = factory.read_manifest(manifest)[0]
    assert done["mac"].startswith("24:0A:C4") and win.provision.unit_name.text() == done["name"]
    # The same unit again keeps its persona (no second row used).
    assert run()
    assert factory.next_unprovisioned(factory.read_manifest(manifest)) == 1
    shot(win, "5-provision")

    win.provision.mode_handpick.setChecked(True)
    s.persona.name = ""
    assert not run()  # needs a name
    win.personality.randomize(seed=42)
    s.persona.serial = "LUMI-SPECIAL-1"
    assert run(), win.provision.log_view.toPlainText()
    rows = factory.read_manifest(manifest)
    assert len(rows) == 41 and rows[-1]["serial"] == "LUMI-SPECIAL-1" and rows[-1]["mac"] == done["mac"]
    # That unit isn't row 0's persona any more, so row 0 is free for the next unit.
    assert rows[0]["mac"] == "" and factory.next_unprovisioned(rows) == 0

    win.provision.mode_auto.setChecked(True)
    assert run()
    assert win.provision.unit_name.text() == native.name_from_seed(native.mac_seed(done["mac"]))
