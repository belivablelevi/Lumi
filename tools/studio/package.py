"""Builds a one-file Lumi Studio app with PyInstaller, for the OS it runs on.

    cmake -S tools/studio -B build/studio -DCMAKE_BUILD_TYPE=Release
    cmake --build build/studio --config Release
    pip install -r tools/studio/requirements.txt pyinstaller
    python tools/studio/package.py        # -> build/studio/dist/LumiStudio[.exe|.app]
"""
import os
import sys

import PyInstaller.__main__

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(REPO, "build", "studio")

sys.path.insert(0, HERE)
from lumi_studio import native  # noqa: E402


def main():
    lib = None
    for path in native._candidates():
        if os.path.exists(path):
            lib = path
            break
    if not lib:
        sys.exit("Build liblumicore first (see the top of this file).")
    args = [
        os.path.join(HERE, "run_studio.py"),
        "--name", "LumiStudio",
        "--onefile", "--windowed", "--noconfirm",
        "--distpath", os.path.join(BUILD, "dist"),
        "--workpath", os.path.join(BUILD, "pyinstaller"),
        "--specpath", os.path.join(BUILD, "pyinstaller"),
        "--paths", HERE,
        "--add-binary", f"{lib}{os.pathsep}lumi_studio",
        "--collect-data", "esptool",
        "--collect-submodules", "esptool",
        "--hidden-import", "serial.tools.list_ports",
    ]
    tool = native.find_tool("virtual_lumi")
    if tool:
        args += ["--add-binary", f"{tool}{os.pathsep}lumi_studio"]
    for mod in ("QtWebEngineCore", "QtWebEngineWidgets", "QtPdf", "Qt3DCore", "QtQuick", "QtQml", "QtMultimedia"):
        args += ["--exclude-module", f"PySide6.{mod}"]
    print("PyInstaller", " ".join(args))
    PyInstaller.__main__.run(args)


if __name__ == "__main__":
    main()
