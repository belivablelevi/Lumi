"""Talking to a Lumi over USB serial: identify, write and read its persona pack, flash firmware.

Protocol: see firmware/lib/lumi_core/src/serial_cmd.h.
"""
import time
import zlib
from typing import Callable, Dict, List, Optional

import serial
import serial.tools.list_ports

CHUNK = 64  # bytes per "persona put" line; stays well inside the unit's serial buffer


class DeviceError(RuntimeError):
    pass


def list_ports() -> List[Dict[str, str]]:
    out = []
    for p in serial.tools.list_ports.comports():
        out.append({"device": p.device, "description": p.description or "", "vid": p.vid, "pid": p.pid})
    return out


class LumiDevice:
    def __init__(self, port: str, baud: int = 115200, timeout: float = 3.0, log: Optional[Callable[[str], None]] = None):
        self.port = port
        self.timeout = timeout
        self.log = log or (lambda s: None)
        self.ser = serial.Serial(port, baud, timeout=0.1)
        time.sleep(0.05)
        self.ser.reset_input_buffer()

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ---- low level ----
    def _readline(self, deadline: float) -> Optional[str]:
        buf = b""
        while time.monotonic() < deadline:
            c = self.ser.read(1)
            if not c:
                continue
            if c in b"\r\n":
                if buf:
                    return buf.decode("utf-8", "replace")
                continue
            buf += c
        return None

    def command(self, line: str, expect=("ok", "err")) -> str:
        """Sends a line; returns the first reply starting with one of `expect` (skipping log lines)."""
        self.log(f"> {line if len(line) < 80 else line[:77] + '...'}")
        self.ser.write((line + "\n").encode())
        self.ser.flush()
        deadline = time.monotonic() + self.timeout
        while True:
            reply = self._readline(deadline)
            if reply is None:
                raise DeviceError(f"No reply to '{line.split(' ')[0]}' within {self.timeout:.0f} s. "
                                  "Is this a Lumi with firmware 1.2 or newer?")
            if reply.startswith(tuple(expect)):
                self.log(f"< {reply if len(reply) < 100 else reply[:97] + '...'}")
                if reply.startswith("err"):
                    raise DeviceError(reply[4:])
                return reply

    # ---- commands ----
    def identify(self) -> Dict[str, str]:
        reply = self.command("id", expect=("id ",))
        info = {}
        for part in reply[3:].split():
            k, _, v = part.partition("=")
            info[k] = v
        return info

    def upload(self, data: bytes, progress: Optional[Callable[[int, int], None]] = None):
        self.command(f"persona begin {len(data)}")
        for off in range(0, len(data), CHUNK):
            self.command(f"persona put {off} {data[off:off + CHUNK].hex()}")
            if progress:
                progress(min(off + CHUNK, len(data)), len(data))
        self.command(f"persona commit {zlib.crc32(data) & 0xFFFFFFFF:08X}")

    def download(self) -> Optional[bytes]:
        reply = self.command("persona get", expect=("persona ",))
        if reply == "persona none":
            return None
        _, size, crc = reply.split()
        size, crc = int(size), int(crc, 16)
        data = bytearray(size)
        deadline = time.monotonic() + self.timeout * 4
        while True:
            line = self._readline(deadline)
            if line is None:
                raise DeviceError("Timed out reading the pack back.")
            if line == "end":
                break
            if line.startswith("data "):
                _, off, hexdata = line.split(" ", 2)
                chunk = bytes.fromhex(hexdata)
                data[int(off):int(off) + len(chunk)] = chunk
        if zlib.crc32(bytes(data)) & 0xFFFFFFFF != crc:
            raise DeviceError("Read-back checksum mismatch.")
        return bytes(data)

    def clear(self):
        self.command("persona clear")

    def provision(self, data: bytes, progress=None) -> Dict[str, str]:
        """Writes the pack, reads it back to verify, and returns the unit's identity."""
        self.upload(data, progress)
        back = self.download()
        if back != data:
            raise DeviceError("The pack read back from the unit doesn't match what was written.")
        return self.identify()


def flash_firmware(port: str, image: str, offset: int = 0x10000, log: Callable[[str], None] = print):
    """Flashes a firmware image with esptool (in-process, so it also works in the packaged app).

    Use offset 0x0 for a merged image (bootloader + partitions + app), or
    0x10000 for the app-only firmware.bin that PlatformIO builds.
    """
    import contextlib
    import io

    import esptool

    args = ["--port", port, "--baud", "460800", "write_flash", hex(offset), image]
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            esptool.main(args)
        except SystemExit as e:  # esptool exits on errors
            if e.code:
                raise DeviceError(out.getvalue().strip().splitlines()[-1] if out.getvalue() else str(e))
        except Exception as e:
            raise DeviceError(str(e))
    for line in out.getvalue().splitlines():
        log(line)
