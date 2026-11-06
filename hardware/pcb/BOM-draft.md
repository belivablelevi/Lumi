# Lumi PCB v1: draft parts list

Checked against LCSC and JLCPCB listings on 2026-10-29; part numbers,
values, footprints and JLCPCB stock rechecked on 2026-11-05 with
[`kicad/verify_parts.py`](kicad/verify_parts.py) (report:
[`kicad/fab/parts-check.txt`](kicad/fab/parts-check.txt)). Stock and prices
move daily, so rerun it before ordering. "Extended" parts add a one-off
loading fee per unique part to each JLCPCB assembly order (about $3 each).

## Main parts

> The draft board in [kicad/](kicad/) uses the **ESP32-C3-MINI-1-H4X**
> ([C41349510](https://jlcpcb.com/partdetail/ESP32-C3-MINI-1-H4X/C41349510)) for U1, the top-contact JUSHUO
> AFC07-S30ECC-00 ([C11095](https://jlcpcb.com/partdetail/C11095)) for J2 and USBLC6-2SC6
> ([C7519](https://jlcpcb.com/partdetail/C7519)) for D1. The full list the factory builds from is
> [kicad/fab/lumi-bom.csv](kicad/fab/lumi-bom.csv).

| Ref | Part | LCSC # | JLCPCB class | ≈ Price (1 → 1k) | Notes |
|---|---|---|---|---|---|
| U1 | **ESP32-C3-MINI-1-H4X** (4 MB flash, PCB antenna, chip revision v1.1) | [C41349510](https://www.lcsc.com/product-detail/C41349510.html) | [Extended](https://jlcpcb.com/partdetail/ESP32-C3-MINI-1-H4X/C41349510), 724 in stock | $3.10 → $2.16 | Radio-certified module. The antenna goes at the board edge, toward the keyring. Espressif marks the older **-N4** ([C2838502](https://www.lcsc.com/product-detail/C2838502.html), same footprint and pins, about 15,000 in stock) "not recommended for new designs" (datasheet v2.2, revision note for v1.5); it's the fallback if the H4X runs out. Chip v1.1 needs ESP-IDF 4.4.7 or newer, which is what the firmware's `espressif32@6.9.0` (Arduino 2.0.17) uses. |
| U2 | **LIS2DH12TR** accelerometer, LGA-12 2×2 mm | [C110926](https://www.lcsc.com/product-detail/C110926.html) | [Extended, ~57k in stock](https://jlcpcb.com/partdetail/STMicroelectronics-LIS2DH12TR/C110926) | $0.57 → $0.32 | 32-sample FIFO, motion interrupt on INT1. I2C address 0x19 with SA0 high (0x18 low). |
| U3 | **TP4054** LiPo charger, SOT-23-5 | [C32574](https://www.lcsc.com/product-detail/C32574.html) (TOPPOWER) or [C668215](https://jlcpcb.com/partdetail/C668215) (UMW) | Extended | ≈ $0.13 | PROG resistor 4.7 kΩ: 1000 V / 4.7 kΩ ≈ 213 mA (0.4 C for a 500 mAh cell). 4.7 kΩ is a Basic part already on the board; 3.9 kΩ would add an Extended fee. |
| U4 | **RT9080-33GJ5** 3.3 V LDO, 2 µA standby | [C841192](https://www.lcsc.com/product-detail/C841192.html) (Richtek); 2nd source [C7528830](https://www.lcsc.com/product-detail/Linear-Voltage-Regulators-LDO_MSKSEMI-RT9080-33GJ5-MS_C7528830.html) | Extended | ≈ $0.12 | 600 mA is plenty: the C3 peaks at ~350 mA when transmitting. |
| J1 | **USB-C receptacle**, 16-pin SMD, TYPE-C-31-M-12 | [C165948](https://lcsc.com/product-detail/USB-Connectors_Korean-Hroparts-Elec-TYPE-C-31-M-12_C165948.html) | Extended | ≈ $0.19 | Mid-mount is preferred, to keep the stack thin. Recheck the height against the case. |
| SW1 | **MSK12C02** SPDT slide switch, 8 × 2.8 mm | [C431540](https://jlcpcb.com/partdetail/SHOUHAN-MSK12C02/C431540) | Extended | ≈ $0.05 | Its own footprint (`lumi:MSK12C02`), from LCSC's footprint and the maker's land pattern: KiCad's PCM12 footprint puts the mounting pads and peg holes 0.5 mm off for this part. **Drives the LDO's EN pin**, not the battery current. The switch is rated only 50 mA, but the radio peaks around 350 mA. Switched to EN, it carries microamps. "Off" means the 3.3 V rail is off, leaving well under 1 µA of drain, and charging still works. |
| J2 | **30-pin 0.5 mm top-contact ZIF FPC connector** for the plug-in panel (see Screen below) | [C11095](https://jlcpcb.com/partdetail/C11095) | Extended | ≈ $0.15 | Top contact, because the panel's contacts face away from the board after the cable wraps round it. |
| D1 | **USBLC6-2SC6** ESD protection on USB D+/D− and VBUS, SOT-23-6 | [C7519](https://jlcpcb.com/partdetail/C7519) | Extended | ≈ $0.16 | I/O lines on pins 1/6 and 3/4, GND 2, VBUS 5. |
| BT1 | 503030 LiPo, 3.7 V ~450–500 mAh, **with protection PCB**, on pads or a JST-SH 2-pin | outside JLCPCB | – | ≈ $1.5–3 | Buy with UN38.3 and IEC 62133 reports. |

Passives are JLCPCB **Basic** parts in 0402/0603, except two values that
have no Basic part: the 150 kΩ USB-sense resistor (R8, C25755) and the
390 kΩ IREF resistor (R15, C25782). That covers the decoupling capacitors,
4.7 kΩ I2C pull-ups and PROG resistor, 5.1 kΩ CC resistors, the 1 MΩ /
1 MΩ battery divider, the VBUS sense divider, and the charge-pump and VCOMH
capacitors the bare SSD1306 needs. That makes **10 Extended part types**:
U1–U4, D1, J1, J2, SW1, R8 and R15.

R15's LCSC number was wrong in the first draft: C25778 is 330 kΩ, not
390 kΩ. The value check in `verify_parts.py` found it.

## Screen: plug-in panel (chosen candidate)

**Candidate:** [BuyDisplay ER-OLED0.96-1.3B (blue 128×64, SSD1306)](https://buydisplay.com/blue-128x64-0-96-inch-oled-display-top-contact-connector-fpc-ssd1306),
a bare panel with a **plug-in 30-pin, 0.5 mm FPC**, top-contact. They offer
an optional matching ZIF connector.
- Outline: 26.70 × 19.26 × 1.45 mm.
- Interfaces: I2C, SPI or parallel, chosen with the BS pins.
- Price: US$2.49 each, $2.36 at 30, $2.23 at 100. Factory-direct quotes at
  1,000+ are usually lower.
- "Blue" monochrome panels read as cyan, which is the Lumi look. A
  white-on-black version is the same part with a different emitter.

This beats the soldered 0.7 mm panels. JLCPCB places only the ZIF
connector, and at final assembly the cable is pushed in and the latch
closed, like a phone screen. No soldering, and a panel can be swapped.

The common LCSC bare panel ([Wisevision N096-2864KSWEG01-H30, C2890596](https://www.lcsc.com/product-detail/C2890596.html))
is solder-type and listed as discontinued, so it's out.

**Connector:** the JUSHUO AFC07-S30ECC-00 ([C11095](https://jlcpcb.com/partdetail/C11095))
is **top-contact**, which is what this panel needs. The panel's drawing puts
its contacts on the viewing side, so they face away from the board once the
cable wraps round the bottom edge. Its own PDF is still to check.

**Wiring in I2C mode**, from the panel's datasheet (rev 2.0):
- BS0 = 0, BS1 = 1, BS2 = 0 (I2C).
- D0 = SCL. D1 and D2 tied together = SDA.
- D/C# low = address 0x3C. CS# low.
- RES# to GPIO10. R/W#, E/RD# and D3–D7 to GND.
- VDD = 3.3 V. VBAT from the battery rail feeds the internal charge pump,
  which needs 3.5–4.2 V.
- Capacitors: 2 × 1 µF on C1P/C1N and C2P/C2N, 2.2 µF on VCC, 4.7 µF on
  VCOMH. IREF to GND through ~390 kΩ.

The firmware already turns on the SSD1306's internal charge pump (the
modules use it too), so only the reset pin is new.

**Still to get:** the AFC07-S30ECC-00's own PDF (entry depth, drawer travel),
linked from its LCSC page. Automated downloads of it were blocked. Its pads
match LCSC's footprint for C11095 to within 0.02 mm.

## Rough cost per unit at 1,000

> See [BUDGET.md](BUDGET.md) for the full per-unit and prototype costs (USD and CAD), generated by `budget.py`.

| | ≈ |
|---|---|
| ESP32-C3-MINI-1-H4X | $2.16 |
| LIS2DH12 | $0.32 |
| OLED panel (plug-in, BuyDisplay ER-OLED0.96-1; $2.23 at 100, less factory-direct at volume) | $1.5–2.2 |
| Charger + LDO + switch + USB-C + ESD + FPC connector | $0.65 |
| Passives | $0.10 |
| PCB (2-layer, 1.0 mm, ~31 × 31 mm) | $0.15–0.30 |
| **Board parts total** | **≈ $4.8–5.6** |
| Battery | $1.5–3 |
| Factory assembly (per board, at volume) | $0.3–0.8 |
