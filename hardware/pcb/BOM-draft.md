# Lumi PCB v1: draft parts list

Checked against LCSC and JLCPCB listings on 2026-10-29. Stock and prices
move daily, so recheck each C-number before ordering. "Extended" parts add
a one-off loading fee per unique part to each JLCPCB assembly order
(about $3 each).

## Main parts

> The draft board in [kicad/](kicad/) uses the **ESP32-C3-WROOM-02-N4**
> ([C2934560](https://jlcpcb.com/partdetail/3281215-ESP32_C3_WROOM_02N4/C2934560), Extended; 18 × 20 × 3.2 mm) for U1,
> because KiCad 7 has no MINI-1 footprint. It also uses Hirose FH12-30S-0.5SH ([C506793](https://lcsc.com/product-detail/FFC-FPC-Flat-Flexible-Connector-Assemblies_HRS-Hirose-FH12-30S-0-5SH-55_C506793.html))
> for J2 and USBLC6-2SC6 ([C7519](https://jlcpcb.com/partdetail/C7519)) for D1. The full list the factory
> builds from is [kicad/fab/lumi-bom.csv](kicad/fab/lumi-bom.csv).

| Ref | Part | LCSC # | JLCPCB class | ≈ Price (1 → 1k) | Notes |
|---|---|---|---|---|---|
| U1 | **ESP32-C3-MINI-1-N4** (4 MB flash, PCB antenna) | [C2838502](https://www.lcsc.com/product-detail/C2838502.html) | [Extended](https://jlcpcb.com/partdetail/ESP32-C3-MINI-1-N4/C2838502) | $3.00 → $2.03 | Radio-certified module. The antenna goes at the board edge, toward the keyring. |
| U2 | **LIS2DH12TR** accelerometer, LGA-12 2×2 mm | [C110926](https://www.lcsc.com/product-detail/C110926.html) | [Extended, ~57k in stock](https://jlcpcb.com/partdetail/STMicroelectronics-LIS2DH12TR/C110926) | $0.57 → $0.32 | 32-sample FIFO, motion interrupt on INT1. I2C address 0x19 with SA0 high (0x18 low). |
| U3 | **TP4054** LiPo charger, SOT-23-5 | [C32574](https://www.lcsc.com/product-detail/C32574.html) (TOPPOWER) or [C668215](https://jlcpcb.com/partdetail/C668215) (UMW) | Extended | ≈ $0.05 | PROG resistor ≈ 4 kΩ for ~250 mA (0.5 C for a 500 mAh cell). |
| U4 | **RT9080-33GJ5** 3.3 V LDO, 2 µA standby | [C841192](https://www.lcsc.com/product-detail/C841192.html) (Richtek); 2nd source [C7528830](https://www.lcsc.com/product-detail/Linear-Voltage-Regulators-LDO_MSKSEMI-RT9080-33GJ5-MS_C7528830.html) | check | ≈ $0.06 | 600 mA is plenty: the C3 peaks at ~350 mA when transmitting. |
| J1 | **USB-C receptacle**, 16-pin SMD, TYPE-C-31-M-12 | [C165948](https://lcsc.com/product-detail/USB-Connectors_Korean-Hroparts-Elec-TYPE-C-31-M-12_C165948.html) | check | ≈ $0.10 | Mid-mount is preferred, to keep the stack thin. Recheck the height against the case. |
| SW1 | **MSK12C02** SPDT slide switch, 8 × 2.8 mm | [C431540](https://jlcpcb.com/partdetail/SHOUHAN-MSK12C02/C431540) | Extended | ≈ $0.05 | **Drives the LDO's EN pin**, not the battery current. The switch is rated only 50 mA, but the radio peaks around 350 mA. Switched to EN, it carries microamps. "Off" means the 3.3 V rail is off, leaving well under 1 µA of drain, and charging still works. |
| J2 | **30-pin 0.5 mm ZIF FPC connector** for the plug-in panel (see Screen below) | [C2856808](https://www.lcsc.com/product-detail/C2856808.html) (bottom contact) or a top-contact variant | check | ≈ $0.05–0.10 | |
| D1 | ESD protection on USB D+/D− and VBUS (e.g. USBLC6-2SC6 or a low-cost equivalent) | TBD | – | ≈ $0.05 | |
| BT1 | 503030 LiPo, 3.7 V ~450–500 mAh, **with protection PCB**, on pads or a JST-SH 2-pin | outside JLCPCB | – | ≈ $1.5–3 | Buy with UN38.3 and IEC 62133 reports. |

Passives are all JLCPCB **Basic** parts in 0402/0603. That covers the
decoupling capacitors, 4.7 kΩ I2C pull-ups, 5.1 kΩ CC resistors, the
1 MΩ / 1 MΩ battery divider, the VBUS sense divider, the PROG resistor,
and the charge-pump and VCOMH capacitors the bare SSD1306 needs.

## Screen: plug-in panel (chosen candidate)

**Candidate:** [BuyDisplay ER-OLED0.96-1 (blue 128×64, SSD1306)](https://buydisplay.com/blue-128x64-0-96-inch-oled-display-top-contact-connector-fpc-ssd1306),
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

**Connector:** the XUNPU 30-pin 0.5 mm ZIF ([FPC-05F-30PH20, C2856808](https://www.lcsc.com/product-detail/C2856808.html))
is **bottom-contact**. Which contact side we need depends on how the cable
folds from the glass to the back of the board, and that's decided in
layout. A top-contact variant may be needed. Choose it once the panel's
mechanical drawing is in hand.

**Expected wiring in I2C mode.** This is the usual 30-pin SSD1306 panel
layout and must be **checked against this panel's own datasheet** before
the schematic is final:
- BS0 = 0, BS1 = 1, BS2 = 0 (I2C).
- D0 = SCL. D1 and D2 tied together = SDA.
- D/C# low = address 0x3C. CS# low.
- RES# to GPIO10. R/W#, E/RD# and D3–D7 to GND.
- VDD = 3.3 V. VBAT from the battery rail (3.3–4.2 V) feeds the internal
  charge pump.
- Capacitors: 2 × 1 µF on C1P/C1N and C2P/C2N, 2.2 µF on VCC, 4.7 µF on
  VCOMH. IREF to GND through ~390 kΩ.

The firmware already turns on the SSD1306's internal charge pump (the
modules use it too), so only the reset pin is new.

**Still to get:** the panel's datasheet and mechanical drawing (pinout,
FPC length, fold radius), and the ZIF connector's datasheet. They're linked
from the BuyDisplay page. This session can't open buydisplay.com or
lcsc.com, so either download the PDFs and send them to me, or allow those
sites in the session's network settings.

## Rough cost per unit at 1,000

| | ≈ |
|---|---|
| ESP32-C3-MINI-1 | $2.03 |
| LIS2DH12 | $0.32 |
| OLED panel (plug-in, BuyDisplay ER-OLED0.96-1; $2.23 at 100, less factory-direct at volume) | $1.5–2.2 |
| Charger + LDO + switch + USB-C + ESD + FPC connector | $0.35 |
| Passives | $0.10 |
| PCB (2-layer, 1.0 mm, ~31 × 31 mm) | $0.15–0.30 |
| **Board parts total** | **≈ $4.5–5.3** |
| Battery | $1.5–3 |
| Factory assembly (per board, at volume) | $0.3–0.8 |
