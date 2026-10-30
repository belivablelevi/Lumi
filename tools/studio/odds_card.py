"""Writes the personality-odds insert card PDFs (see lumi_studio/odds_card.py).

    python tools/studio/odds_card.py [folder]    # default: docs/print
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtGui import QGuiApplication  # noqa: E402

from lumi_studio import odds_card  # noqa: E402

if __name__ == "__main__":
    app = QGuiApplication(sys.argv)
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "docs", "print")
    for path in odds_card.export(os.path.abspath(folder)):
        print("wrote", path)
