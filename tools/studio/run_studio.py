"""Starts Lumi Studio (used by `python tools/studio/run_studio.py` and the packaged app)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lumi_studio.main_window import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
