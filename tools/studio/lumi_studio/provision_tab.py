"""Provision tab: give a connected unit its persona (and emotions) over USB."""
import os
import random
import subprocess
import sys
import tempfile
import time

from PySide6.QtCore import QObject, Qt, QThread, Signal
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import (QButtonGroup, QCheckBox, QFileDialog, QFormLayout, QGroupBox, QHBoxLayout, QLabel,
                               QLineEdit, QPlainTextEdit, QProgressBar, QPushButton, QRadioButton, QSplitter,
                               QVBoxLayout, QWidget)

from . import factory, native
from .device import DeviceError, LumiDevice, flash_firmware, list_ports
from .widgets import OledView, combo, set_rarity

MODES = ("manifest", "handpick", "automatic")


def run_job(job, log, progress=lambda done, total: None):
    """Provisions one unit. Pure Python, runs on a worker thread.

    `job` holds: port, firmware (path or ""), offset, mode, rows (manifest snapshot),
    persona (hand-pick), project_pack (callable persona -> bytes).
    Returns a result dict for the UI: info, persona, row (index or None), new_row (dict or None).
    """
    port = job["port"]
    if job.get("firmware"):
        log(f"Flashing {os.path.basename(job['firmware'])} at {hex(job['offset'])}…")
        flash_firmware(port, job["firmware"], job["offset"], log=log)
        log("Waiting for the unit to restart…")
        time.sleep(2.0)
    dev = None
    for attempt in range(10):
        try:
            dev = LumiDevice(port, timeout=job.get("timeout", 3.0), log=log)
            break
        except Exception as e:  # the port vanishes for a moment while the chip resets
            if attempt == 9:
                raise DeviceError(f"Can't open {port}: {e}")
            time.sleep(0.5)
    with dev:
        info = dev.identify()
        mac = info.get("mac", "")
        log(f"Found a Lumi: {mac}, firmware {info.get('fw')}, currently {info.get('name')} ({info.get('persona')})")
        mode = job["mode"]
        if mode == "automatic":
            dev.clear()
            info = dev.identify()
            log(f"Back to its automatic persona: {info.get('name')}")
            return {"info": info, "persona": None, "row": None, "new_row": None}

        rows = job.get("rows") or []
        row_index, new_row = None, None
        if mode == "manifest":
            matches = [i for i, r in enumerate(rows) if r.get("mac", "").upper() == mac.upper()]
            if matches:
                row_index = matches[0]
                log(f"This unit is already {rows[row_index]['serial']} in the manifest; writing it again.")
            else:
                row_index = factory.next_unprovisioned(rows)
                if row_index is None:
                    raise DeviceError("Every unit in the manifest is provisioned. Generate or open another batch.")
            persona = factory.row_persona(rows[row_index])
        else:
            persona = job["persona"]
            if not persona.name:
                raise DeviceError("The hand-picked persona needs a name.")
            matches = [i for i, r in enumerate(rows) if persona.serial and r["serial"] == persona.serial]
            if matches:
                row_index = matches[0]
            elif rows:
                new_row = factory.persona_row(persona)
        data = job["project_pack"](persona)
        log(f"Writing {persona.name} ({persona.rarity}, {persona.serial or 'no serial'}): {len(data):,} bytes")
        info = dev.provision(data, progress)
        expected = {"persona": "assigned", "name": persona.name, "look": str(persona.look)}
        wrong = [f"{k}={info.get(k)!r} (expected {v!r})" for k, v in expected.items() if info.get(k) != v]
        if wrong:
            raise DeviceError("The unit doesn't report the new persona: " + ", ".join(wrong))
        log(f"Verified: {mac} is now {persona.name}.")
        return {"info": info, "persona": persona, "row": row_index, "new_row": new_row}


class Worker(QObject):
    log = Signal(str)
    progress = Signal(int, int)
    finished = Signal(object, str)  # result, error

    def __init__(self, job):
        super().__init__()
        self.job = job

    def run(self):
        try:
            result = run_job(self.job, self.log.emit, self.progress.emit)
            self.finished.emit(result, "")
        except Exception as e:  # reported in the log, never crashes the app
            self.finished.emit(None, str(e) or e.__class__.__name__)


class ProvisionTab(QWidget):
    jobDone = Signal(bool)

    def __init__(self, session, parent=None):
        super().__init__(parent)
        self.s = session
        self.virtual = None
        self.thread = None

        # ---- unit ----
        self.port = combo([])
        self.port.setMinimumWidth(280)
        refresh = QPushButton("Refresh")
        refresh.clicked.connect(self.refresh_ports)
        self.virtual_btn = QPushButton("Start a virtual Lumi")
        self.virtual_btn.setToolTip("A simulated unit running the real firmware code, for trying things out.")
        self.virtual_btn.clicked.connect(self.start_virtual)
        self.virtual_btn.setEnabled(bool(native.find_tool("virtual_lumi")) and sys.platform != "win32")
        identify = QPushButton("Identify")
        identify.clicked.connect(self.identify)
        prow = QHBoxLayout()
        prow.addWidget(self.port, 1)
        prow.addWidget(refresh)
        prow.addWidget(self.virtual_btn)
        prow.addWidget(identify)

        # ---- what to write ----
        self.mode_group = QButtonGroup(self)
        self.mode_manifest = QRadioButton("Next unit from the manifest")
        self.mode_handpick = QRadioButton("Hand-pick: the persona on the Personality tab (e.g. a special edition)")
        self.mode_auto = QRadioButton("Automatic: erase any assigned persona (the unit uses its chip ID)")
        for i, b in enumerate((self.mode_manifest, self.mode_handpick, self.mode_auto)):
            self.mode_group.addButton(b, i)
        self.mode_manifest.setChecked(True)
        self.manifest_info = QLabel()
        self.manifest_info.setWordWrap(True)
        self.manifest_info.setStyleSheet("color: #8a97a3;")
        self.include = QCheckBox("Include this project's faces and animations in the unit's pack")
        self.include.setChecked(True)
        what = QGroupBox("Persona")
        wl = QVBoxLayout(what)
        for w in (self.mode_manifest, self.manifest_info, self.mode_handpick, self.mode_auto, self.include):
            wl.addWidget(w)

        # ---- firmware ----
        self.flash = QCheckBox("Flash firmware first")
        self.firmware = QLineEdit()
        self.firmware.setPlaceholderText("firmware.bin (app only) or a merged image")
        browse = QPushButton("Browse…")
        browse.clicked.connect(self.choose_firmware)
        self.offset = combo(["0x10000  (firmware.bin from PlatformIO)", "0x0  (merged image)"])
        fw = QGroupBox("Firmware (optional)")
        fl = QFormLayout(fw)
        frow = QHBoxLayout()
        frow.addWidget(self.firmware, 1)
        frow.addWidget(browse)
        fl.addRow(self.flash)
        fl.addRow("Image", frow)
        fl.addRow("Offset", self.offset)

        self.go = QPushButton("Provision unit")
        self.go.setMinimumHeight(44)
        self.go.setStyleSheet("font-size: 15px; font-weight: 700;")
        self.go.clicked.connect(self.provision)
        self.bar = QProgressBar()
        self.bar.setTextVisible(False)
        self.bar.setMaximumHeight(8)
        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setMaximumBlockCount(5000)

        left = QVBoxLayout()
        left.addWidget(QLabel("<b>Unit</b>"))
        left.addLayout(prow)
        left.addWidget(what)
        left.addWidget(fw)
        left.addWidget(self.go)
        left.addWidget(self.bar)
        left.addWidget(QLabel("Log"))
        left.addWidget(self.log_view, 1)
        leftw = QWidget()
        leftw.setLayout(left)

        # ---- result ----
        self.view = OledView()
        self.unit_name = QLabel("No unit yet")
        self.unit_name.setStyleSheet("font-size: 22px; font-weight: 700;")
        self.unit_rarity = QLabel()
        self.unit_info = QLabel()
        self.unit_info.setWordWrap(True)
        self.unit_info.setStyleSheet("color: #8a97a3;")
        self.status = QLabel()
        self.status.setWordWrap(True)
        right = QVBoxLayout()
        right.addWidget(self.view)
        right.addWidget(self.unit_name)
        right.addWidget(self.unit_rarity)
        right.addWidget(self.unit_info)
        right.addWidget(self.status)
        right.addStretch(1)
        rightw = QWidget()
        rightw.setLayout(right)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(leftw)
        split.addWidget(rightw)
        split.setStretchFactor(0, 1)
        split.setSizes([760, 520])
        lay = QHBoxLayout(self)
        lay.addWidget(split)

        self.s.manifestChanged.connect(self.update_manifest_info)
        self.s.personaChanged.connect(self.update_manifest_info)
        self.refresh_ports()
        self.update_manifest_info()

    # ---- ports ----
    def refresh_ports(self, select=None):
        current = select or self.port.currentData()
        self.port.clear()
        for p in list_ports():
            self.port.addItem(f"{p['device']}  {p['description']}", p["device"])
        if self.virtual:
            self.port.addItem(f"{self.virtual[1]}  virtual Lumi", self.virtual[1])
        i = self.port.findData(current)
        if i >= 0:
            self.port.setCurrentIndex(i)

    def start_virtual(self):
        if self.virtual:
            return self.virtual[1]
        exe = native.find_tool("virtual_lumi")
        store = os.path.join(tempfile.gettempdir(), f"lumi-virtual-{os.getpid()}.bin")
        mac = "24:0A:C4:" + ":".join(f"{random.randrange(256):02X}" for _ in range(3))
        proc = subprocess.Popen([exe, "--pty", "--store", store, "--mac", mac], stdout=subprocess.PIPE, text=True)
        path = proc.stdout.readline().strip()
        self.virtual = (proc, path)
        self.log(f"Started a virtual Lumi ({mac}) on {path}")
        self.refresh_ports(select=path)
        return path

    def stop_virtual(self):
        if self.virtual:
            self.virtual[0].kill()
            self.virtual[0].wait()
            self.virtual = None

    def choose_firmware(self):
        path, _ = QFileDialog.getOpenFileName(self, "Firmware image", "", "Firmware (*.bin)")
        if path:
            self.firmware.setText(path)
            self.flash.setChecked(True)

    # ---- info ----
    def log(self, line):
        self.log_view.appendPlainText(line)
        self.log_view.moveCursor(QTextCursor.End)

    def update_manifest_info(self):
        rows = self.s.manifest_rows
        if not rows:
            self.manifest_info.setText("No manifest. Generate or open one on the Factory batch tab.")
            return
        i = factory.next_unprovisioned(rows)
        where = self.s.manifest_path or "unsaved (save it on the Factory batch tab first)"
        if i is None:
            self.manifest_info.setText(f"{where}: every unit is provisioned.")
        else:
            r = rows[i]
            done = sum(bool(x.get("mac")) for x in rows)
            self.manifest_info.setText(f"{where}: {done}/{len(rows)} done. "
                                       f"Next: {r['serial']} {r['name']} ({r['rarity']})")

    def show_unit(self, info, persona=None):
        try:
            genes = persona.genes if persona else native.genes_from_code(int(info.get("look", "0")))
        except ValueError:
            genes = None
        self.view.setFrame(native.render_expression(0, genes, 600))  # neutral
        self.unit_name.setText(info.get("name", "?"))
        if genes:
            set_rarity(self.unit_rarity, native.genes_rarity(genes))
        self.unit_info.setText(
            f"MAC {info.get('mac')} · firmware {info.get('fw')}<br>"
            f"Persona: {info.get('persona')}" + (f" · serial {info['serial']}" if info.get("serial", "-") != "-" else ""))

    def identify(self):
        port = self.port.currentData()
        if not port:
            self.status.setText("Pick a port first.")
            return None
        try:
            with LumiDevice(port, log=self.log) as dev:
                info = dev.identify()
        except Exception as e:
            self.status.setText(f"<span style='color:#ff8a65'>{e}</span>")
            return None
        self.show_unit(info)
        self.status.clear()
        return info

    # ---- provisioning ----
    def make_job(self):
        mode = MODES[self.mode_group.checkedId()]
        include = self.include.isChecked()
        if mode == "manifest" and not self.s.manifest_rows:
            raise ValueError("There's no manifest. Generate one on the Factory batch tab, or hand-pick a persona.")
        if mode == "manifest" and not self.s.manifest_path:
            raise ValueError("Save the manifest first (Factory batch tab), so every unit you make is recorded.")
        if mode != "automatic":
            self.s.pack(self.s.persona, include)  # raises ValueError with the project's problems
        firmware = self.firmware.text().strip() if self.flash.isChecked() else ""
        if firmware and not os.path.exists(firmware):
            raise ValueError(f"No firmware image at {firmware}")
        return {
            "port": self.port.currentData(), "firmware": firmware,
            "offset": 0x10000 if self.offset.currentIndex() == 0 else 0x0,
            "mode": mode, "rows": [dict(r) for r in self.s.manifest_rows],
            "persona": self.s.persona,
            "project_pack": lambda persona: self.s.pack(persona, include),
        }

    def provision(self):
        if self.thread:
            return
        if not self.port.currentData():
            self.status.setText("<span style='color:#ff8a65'>Pick a port first.</span>")
            return
        try:
            job = self.make_job()
        except ValueError as e:
            self.status.setText(f"<span style='color:#ff8a65'>{e}</span>")
            return
        self.go.setEnabled(False)
        self.bar.setRange(0, 0)
        self.status.setText("Working…")
        self.log("")
        self.thread = QThread()
        self.worker = Worker(job)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.log.connect(self.log)
        self.worker.progress.connect(self.show_progress)  # a bound method, so it runs on the UI thread
        self.worker.finished.connect(self.done)
        self.thread.start()

    def show_progress(self, done, total):
        self.bar.setRange(0, total)
        self.bar.setValue(done)

    def done(self, result, error):
        self.thread.quit()
        self.thread.wait()
        self.thread = None
        self.go.setEnabled(True)
        self.bar.setRange(0, 1)
        self.bar.setValue(1 if not error else 0)
        if error:
            self.log(f"FAILED: {error}")
            self.status.setText(f"<span style='color:#ff8a65; font-weight:700'>Failed:</span> {error}")
            self.jobDone.emit(False)
            return
        info, persona = result["info"], result["persona"]
        mac = info.get("mac", "")
        rows = self.s.manifest_rows
        if result["new_row"] is not None:
            rows.append(result["new_row"])
            result["row"] = len(rows) - 1
        if result["row"] is not None and rows:
            try:
                for i in factory.release_mac(rows, mac, keep=result["row"]):
                    self.log(f"{mac} was {rows[i]['serial']} {rows[i]['name']}; that persona is free again.")
                factory.mark_provisioned(rows, result["row"], mac)
                self.s.save_manifest()
                self.log(f"Recorded {mac} as {rows[result['row']]['serial']} in the manifest.")
            except (ValueError, OSError) as e:
                self.log(f"The unit is provisioned, but the manifest wasn't updated: {e}")
        self.show_unit(info, persona)
        self.status.setText("<span style='color:#4cd07d; font-weight:700'>Done.</span> "
                            "Unplug this unit and connect the next one.")
        self.jobDone.emit(True)
