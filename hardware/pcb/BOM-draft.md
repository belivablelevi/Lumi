# Lumi PCB v1: draft parts list

Checked against LCSC and JLCPCB listings on 2026-10-29. Stock and prices
move daily, so recheck each C-number before ordering. "Extended" parts add
a one-off loading fee per unique part to each JLCPCB assembly order
(about $3 each).

## Main parts

| Ref | Part | LCSC # | JLCPCB class | ≈ Price (1 → 1k) | Notes |
|---|---|---|---|---|---|
| U1 | **ESP32-C3-MINI-1-N4** (4 MB flash, PCB antenna) | [C2838502](https://www.lcsc.com/product-detail/C2838502.html) | [Extended](https://jlcpcb.com/partdetail/ESP32-C3-MINI-1-N4/C2838502) | $3.00 → $2.03 | Radio-certified module. The antenna goes at the board edge, toward the keyring. |
| U2 | **LIS2DH12TR** accelerometer, LGA-12 2×2 mm | [C110926](https://www.lcsc.com/product-detail/C110926.html) | [Extended, ~57k in stock](https://jlcpcb.com/partdetail/STMicroelectronics-LIS2DH12TR/C110926) | $0.57 → $0.32 | 32-sample FIFO, motion interrupt on INT1. I2C address 0x19 with SA0 high (0x18 low). |
| U3 | **TP4054** LiPo charger, SOT-23-5 | [C32574](https://www.lcsc.com/product-detail/C32574.html) (TOPPOWER) or [C668215](https://jlcpcb.com/partdetail/C668215) (UMW) | Extended | ≈ $0.05 | PROG resistor ≈ 4 kΩ for ~250 mA (0.5 C for a 500 mAh cell). |
| U4 | **RT9080-33GJ5** 3.3 V LDO, 2 µA standby | [C841192](https://www.lcsc.com/product-detail/C841192.html) (Richtek); 2nd source [C7528830](https://www.lcsc.com/product-detail/Linear-Voltage-Regulators-LDO_MSKSEMI-RT9080-33GJ5-MS_C7528830.html) | check | ≈ $0.06 | 600 mA is plenty: the C3 peaks at ~350 mA when transmitting. |
| J1 | **USB-C receptacle**, 16-pin SMD, TYPE-C-31-M-12 | [C165948](https://lcsc.com/product-detail/USB-Connectors_Korean-Hroparts-Elec-TYPE-C-31-M-12_C165948.html) | check | ≈ $0.10 | Mid-mount is preferred, to keep the stack thin. Recheck the height against the case. |
| SW1 | **MSK12C02** SPDT slide switch, 8 × 2.8 mm | [C431540](https://jlcpcb.com/partdetail/SHOUHAN-MSK12C02/C431540) | Extended | ≈ $0.05 | **Drives the LDO's EN pin**, not the battery current. The switch is rated only 50 mA, but the radio peaks around 350 mA. Switched to EN, it carries microamps. "Off" means the 3.3 V rail is off, leaving well under 1 µA of drain, and charging still works. |
| J2 | **OLED connection**: see the open item below | – | – | – | |
| D1 | ESD protection on USB D+/D− and VBUS (e.g. USBLC6-2SC6 or a low-cost equivalent) | TBD | – | ≈ $0.05 | |
| BT1 | 503030 LiPo, 3.7 V ~450–500 mAh, **with protection PCB**, on pads or a JST-SH 2-pin | outside JLCPCB | – | ≈ $1.5–3 | Buy with UN38.3 and IEC 62133 reports. |

Passives are all JLCPCB **Basic** parts in 0402/0603. That covers the
decoupling capacitors, 4.7 kΩ I2C pull-ups, 5.1 kΩ CC resistors, the
1 MΩ / 1 MΩ battery divider, the VBUS sense divider, the PROG resistor,
and the charge-pump and VCOMH capacitors the bare SSD1306 needs.

## Open item: how the screen connects

The common bare 0.96" SSD1306 panels have a **30-pin cable at 0.7 mm
pitch** that is **soldered**, not plugged in. One listing,
[Wisevision N096-2864KSWEG01-H30 (C2890596)](https://www.lcsc.com/product-detail/C2890596.html),
is SSD1306, 128×64, −40…+85 °C, and probably a 0.70 mm-pitch footprint
judging by [its Flux footprint name](https://www.flux.ai/lcsc/n096-2864ksweg01-h30~6as4/schematic).
LCSC marks it **discontinued**. A 0.5 mm ZIF connector such as
[XUNPU FPC-05F-30PH20 (C2856808)](https://www.lcsc.com/product-detail/C2856808.html)
only suits panels with a **plug-in 0.5 mm** cable.

The options, in order of preference:
1. **A panel with a plug-in 0.5 mm 30-pin cable** plus the XUNPU ZIF
   connector. Assembly is a snap-in step, and the panel can be swapped.
   Needs: a current panel with a datasheet and a pinout.
2. **A soldered 0.7 mm panel**: solder pads on the PCB, and the panel is
   soldered on by hand or with hot-bar soldering after factory assembly.
   This is cheapest per unit, but adds a skilled assembly step.
3. **Keep a 4-pin I2C module** on a low header. It's simplest and
   pre-tested, but adds about 2 mm of thickness and about $1.5 per unit.

**To decide before the schematic:** pick a current panel part number, get
its datasheet, and confirm the cable type, pitch and pinout.

## Rough cost per unit at 1,000

| | ≈ |
|---|---|
| ESP32-C3-MINI-1 | $2.03 |
| LIS2DH12 | $0.32 |
| OLED panel | $1.0–1.5 |
| Charger + LDO + switch + USB-C + ESD + FPC connector | $0.35 |
| Passives | $0.10 |
| PCB (2-layer, 1.0 mm, ~31 × 31 mm) | $0.15–0.30 |
| **Board parts total** | **≈ $4.0–4.6** |
| Battery | $1.5–3 |
| Factory assembly (per board, at volume) | $0.3–0.8 |
