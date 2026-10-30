"""Lumi PCB v1: parts and connections, the single source of truth.

gen_schematic.py draws the schematic from this file and gen_board.py builds
the board from it, so the two can't drift apart. Change a connection here,
then run build.sh.

DRAFT. Pinouts marked VERIFY come from memory or from similar parts, not
from the part's own datasheet. Check every one before ordering
(see ../GUIDE.md).
"""

from dataclasses import dataclass, field

# Set True if the screen's FPC arrives mirrored at the connector (pin 1 at
# the other end). It depends on which way the panel's cable folds; see the
# guide. It only swaps which connector pad each panel pin lands on.
OLED_PIN_REVERSED = False


@dataclass
class Part:
    ref: str
    value: str
    footprint: str            # KiCad library:footprint
    pins: dict                # pad number -> net name (None = not connected)
    names: dict = field(default_factory=dict)   # pad number -> pin name (schematic)
    lcsc: str = ""
    note: str = ""
    block: str = ""           # schematic group
    bom: bool = True          # False for bare pads (test points, battery pads)


R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"
TP = "TestPoint:TestPoint_Pad_D1.0mm"
BATPAD = "TestPoint:TestPoint_Pad_1.5x1.5mm"

# JLCPCB "Basic" passives (no loading fee). Check each number in the JLCPCB
# parts library before ordering; values matter, the exact maker doesn't.
LCSC_R = {"5.1k": "C25905", "3.9k": "C51721", "1M": "C26083", "100k": "C25741",
          "4.7k": "C25900", "10k": "C25744", "390k": "C25778"}
LCSC_C = {("100nF", C0402): "C1525", ("1uF", C0402): "C52923",
          ("10uF", C0402): "C15525", ("1uF", C0603): "C15849",
          ("2.2uF", C0603): "C23630", ("4.7uF", C0603): "C19666"}


def R(ref, value, a, b, block, note=""):
    return Part(ref, value, R0402, {"1": a, "2": b}, lcsc=LCSC_R[value],
                note=note, block=block)


def C(ref, value, a, b, block, fp=C0402, note=""):
    return Part(ref, value, fp, {"1": a, "2": b}, lcsc=LCSC_C[(value, fp)],
                note=note, block=block)


# ---------------------------------------------------------------- module
# ESP32-C3-WROOM-02 pin map (Espressif datasheet "Pin Definitions"; VERIFY
# against the current PDF). Pad 19 is the centre ground pad.
WROOM_NAMES = {
    "1": "3V3", "2": "EN", "3": "IO4", "4": "IO5", "5": "IO6", "6": "IO7",
    "7": "IO8", "8": "IO9", "9": "GND", "10": "IO10", "11": "RXD", "12": "TXD",
    "13": "IO18", "14": "IO19", "15": "IO3", "16": "IO2", "17": "IO1",
    "18": "IO0", "19": "GND",
}
U1 = Part("U1", "ESP32-C3-WROOM-02-N4", "RF_Module:ESP32-C3-WROOM-02", {
    "1": "3V3", "2": "EN", "3": "VBAT_SENSE", "4": "USB_SENSE", "5": "SDA",
    "6": "SCL", "7": "IO8", "8": "BOOT", "9": "GND", "10": "OLED_RES",
    "11": "RXD", "12": "TXD", "13": "USB_DN", "14": "USB_DP", "15": "IMU_INT",
    "16": "IO2", "17": "CHG_STAT", "18": None, "19": "GND",
}, WROOM_NAMES, lcsc="C2934560", block="MCU",
    note="Radio-certified module. Antenna at the keyring edge; keep copper out of the marked area.")

# ---------------------------------------------------------------- motion
U2 = Part("U2", "LIS2DH12TR", "Package_LGA:LGA-12_2x2mm_P0.5mm", {
    "1": "SCL", "2": "3V3", "3": "3V3", "4": "SDA", "5": "GND", "6": "GND",
    "7": "GND", "8": "GND", "9": "3V3", "10": "3V3", "11": None, "12": "IMU_INT",
}, {"1": "SCL", "2": "CS", "3": "SA0", "4": "SDA", "5": "RES", "6": "GND",
    "7": "GND", "8": "GND", "9": "VDD", "10": "VDD_IO", "11": "INT2", "12": "INT1"},
    lcsc="C110926", block="Motion",
    note="CS high = I2C. SA0 high = address 0x19. RES must go to GND.")

# ---------------------------------------------------------------- power
J1 = Part("J1", "USB-C 16P", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12", {
    "A1": "GND", "A12": "GND", "B1": "GND", "B12": "GND",
    "A4": "VBUS", "A9": "VBUS", "B4": "VBUS", "B9": "VBUS",
    "A5": "CC1", "B5": "CC2",
    "A6": "USB_DP", "B6": "USB_DP", "A7": "USB_DN", "B7": "USB_DN",
    "A8": None, "B8": None, "S1": "GND",
}, {"A1": "GND", "A12": "GND", "B1": "GND", "B12": "GND", "A4": "VBUS",
    "A9": "VBUS", "B4": "VBUS", "B9": "VBUS", "A5": "CC1", "B5": "CC2",
    "A6": "D+", "B6": "D+", "A7": "D-", "B7": "D-", "A8": "SBU1", "B8": "SBU2",
    "S1": "SHIELD"}, lcsc="C165948", block="USB")

D1 = Part("D1", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6", {
    "1": "USB_DP", "2": "GND", "3": "USB_DN", "4": "USB_DN", "5": "VBUS",
    "6": "USB_DP",
}, {"1": "IO1", "2": "GND", "3": "IO2", "4": "IO2", "5": "VBUS", "6": "IO1"},
    lcsc="C7519", block="USB", note="USB ESD protection.")

U3 = Part("U3", "TP4054", "Package_TO_SOT_SMD:SOT-23-5", {
    "1": "CHG_STAT", "2": "GND", "3": "VBAT", "4": "VBUS", "5": "PROG",
}, {"1": "CHRG", "2": "GND", "3": "BAT", "4": "VCC", "5": "PROG"},
    lcsc="C32574", block="Power",
    note="LiPo charger. CHRG is open-drain: firmware enables the IO1 pull-up. VERIFY pinout.")

U4 = Part("U4", "RT9080-33GJ5", "Package_TO_SOT_SMD:SOT-23-5", {
    "1": "VBAT", "2": "GND", "3": "LDO_EN", "4": None, "5": "3V3",
}, {"1": "VIN", "2": "GND", "3": "EN", "4": "NC", "5": "VOUT"},
    lcsc="C841192", block="Power", note="3.3 V LDO, 2 uA standby. VERIFY pinout.")

SW1 = Part("SW1", "MSK12C02", "Button_Switch_SMD:SW_SPDT_PCM12", {
    "1": "VBAT", "2": "LDO_EN", "3": "GND",
}, {"1": "ON", "2": "COM", "3": "OFF"}, lcsc="C431540", block="Power",
    note="Power switch on the LDO enable (microamps), not on the battery. "
         "VERIFY the MSK12C02 matches the PCM12 footprint.")

BT1 = Part("BT1", "BAT+", BATPAD, {"1": "VBAT"}, {"1": "+"}, block="Power",
           bom=False, note="Battery red wire (protected 503030 LiPo).")
BT2 = Part("BT2", "BAT-", BATPAD, {"1": "GND"}, {"1": "-"}, block="Power",
           bom=False, note="Battery black wire.")

# ---------------------------------------------------------------- screen
# Usual 30-pin SSD1306 panel pinout (UG-2864 family). VERIFY against the
# BuyDisplay ER-OLED0.96-1 datasheet before ordering.
OLED = {
    1: ("NC/GND", "GND"), 2: ("C2P", "C2P"), 3: ("C2N", "C2N"),
    4: ("C1P", "C1P"), 5: ("C1N", "C1N"), 6: ("VBAT", "3V3"), 7: ("NC", None),
    8: ("VSS", "GND"), 9: ("VDD", "3V3"), 10: ("BS0", "GND"),
    11: ("BS1", "3V3"), 12: ("BS2", "GND"), 13: ("CS#", "GND"),
    14: ("RES#", "OLED_RES"), 15: ("D/C#", "GND"), 16: ("R/W#", "GND"),
    17: ("E/RD#", "GND"), 18: ("D0/SCL", "SCL"), 19: ("D1/SDA", "SDA"),
    20: ("D2/SDA", "SDA"), 21: ("D3", "GND"), 22: ("D4", "GND"),
    23: ("D5", "GND"), 24: ("D6", "GND"), 25: ("D7", "GND"),
    26: ("IREF", "IREF"), 27: ("VCOMH", "VCOMH"), 28: ("VCC", "VCC_OLED"),
    29: ("VLSS", "GND"), 30: ("NC/GND", "GND"),
}


def _oled_pad(pin):
    return str(31 - pin if OLED_PIN_REVERSED else pin)


J2 = Part("J2", "FH12-30S-0.5SH", "Connector_FFC-FPC:Hirose_FH12-30S-0.5SH_1x30-1MP_P0.50mm_Horizontal",
          {**{_oled_pad(p): n for p, (_, n) in OLED.items()}, "MP": "GND"},
          {**{_oled_pad(p): nm for p, (nm, _) in OLED.items()}, "MP": "MP"},
          lcsc="C506793", block="Screen",
          note="30-pin 0.5 mm ZIF for the plug-in OLED. VERIFY contact side and pin 1 end.")

# ---------------------------------------------------------------- passives
PASSIVES = [
    # USB-C: 5.1k on each CC pin so a USB-C charger supplies 5 V.
    R("R1", "5.1k", "CC1", "GND", "USB"),
    R("R2", "5.1k", "CC2", "GND", "USB"),
    # Charger
    C("C1", "1uF", "VBUS", "GND", "Power", note="Charger input"),
    C("C2", "1uF", "VBAT", "GND", "Power", note="Charger output / battery"),
    R("R3", "3.9k", "PROG", "GND", "Power", note="Charge current = 1000 V / R = 256 mA"),
    # LDO
    C("C3", "1uF", "VBAT", "GND", "Power", note="LDO input"),
    C("C4", "1uF", "3V3", "GND", "Power", note="LDO output"),
    # Module supply and strapping
    C("C5", "10uF", "3V3", "GND", "MCU"),
    C("C6", "100nF", "3V3", "GND", "MCU"),
    R("R11", "10k", "3V3", "EN", "MCU", note="EN pull-up"),
    C("C8", "1uF", "EN", "GND", "MCU", note="EN delay (with R11)"),
    R("R12", "10k", "3V3", "IO2", "MCU", note="GPIO2 strap: high"),
    R("R13", "10k", "3V3", "IO8", "MCU", note="GPIO8 strap: high"),
    # Sensing
    R("R5", "1M", "VBAT", "VBAT_SENSE", "Sense", note="Battery divider top"),
    R("R6", "1M", "VBAT_SENSE", "GND", "Sense", note="Battery divider bottom"),
    C("C9", "100nF", "VBAT_SENSE", "GND", "Sense"),
    R("R7", "100k", "VBUS", "USB_SENSE", "Sense", note="USB sense divider top"),
    R("R8", "100k", "USB_SENSE", "GND", "Sense", note="USB sense divider bottom"),
    # I2C
    R("R9", "4.7k", "3V3", "SDA", "Motion", note="I2C pull-up"),
    R("R10", "4.7k", "3V3", "SCL", "Motion", note="I2C pull-up"),
    C("C7", "100nF", "3V3", "GND", "Motion", note="LIS2DH12 decoupling"),
    # Screen: SSD1306 internal charge pump and references
    C("C10", "1uF", "C1P", "C1N", "Screen", note="Charge-pump flying cap 1"),
    C("C11", "1uF", "C2P", "C2N", "Screen", note="Charge-pump flying cap 2"),
    C("C12", "2.2uF", "VCC_OLED", "GND", "Screen", fp=C0603, note="VCC (~7.5 V): 0603, 25 V"),
    C("C13", "4.7uF", "VCOMH", "GND", "Screen", fp=C0603, note="VCOMH: 0603, 16 V+"),
    C("C14", "1uF", "3V3", "GND", "Screen", note="Panel VDD/VBAT"),
    R("R15", "390k", "IREF", "GND", "Screen", note="IREF ~12 uA"),
]

# Front-side test pads, outside the screen glass.
TEST_PADS = [
    ("TP1", "3V3"), ("TP2", "GND"), ("TP3", "EN"), ("TP4", "BOOT"),
    ("TP5", "TXD"), ("TP6", "RXD"), ("TP7", "VBAT"),
]
TESTPOINTS = [Part(r, n, TP, {"1": n}, {"1": n}, block="Test", bom=False,
                   note="Hold BOOT to GND while resetting to force download mode."
                   if n == "BOOT" else "")
              for r, n in TEST_PADS]

PARTS = [U1, U2, U3, U4, D1, J1, J2, SW1, BT1, BT2, *PASSIVES, *TESTPOINTS]

POWER_NETS = {"GND", "3V3", "VBAT", "VBUS"}


def nets():
    """net name -> list of (ref, pad)."""
    out = {}
    for p in PARTS:
        for pad, net in p.pins.items():
            if net:
                out.setdefault(net, []).append((p.ref, pad))
    return out


def check():
    refs = [p.ref for p in PARTS]
    assert len(refs) == len(set(refs)), "duplicate reference"
    for net, conns in nets().items():
        assert len(conns) >= 2, f"net {net} has only one connection: {conns}"


check()
