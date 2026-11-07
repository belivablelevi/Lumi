# Bill of materials

Everything is an off-the-shelf module. Prices are rough single-unit
AliExpress/Amazon numbers from late 2026, so check current listings.

| # | Part | Qty | Notes | ≈ Price |
|---|------|-----|-------|---------|
| 1 | **Seeed Studio XIAO ESP32C3** | 1 | ESP32-C3 brain + USB-C + built-in LiPo charger. Keep the little u.FL antenna that ships with it. | $5 |
| 2 | **0.96" SSD1306 OLED, 128×64, I2C, 4-pin** (GND VCC SCL SDA) | 1 | Pick the **blue** single-colour version: it reads as cyan. Avoid the yellow/blue two-tone panels. | $3 |
| 3 | **GY-521 MPU-6050 module** | 1 | 6-axis accelerometer + gyro. MPU-6500 clones (WHO_AM_I 0x70) work too. **Remove the power LED** (see below). | $2 |
| 4 | **LiPo 3.7 V, 702025** (≈7 × 20 × 25 mm) with protection PCB | 1 | Usually sold as 300 mAh. The case fits a cell up to 26 × 20.4 × 7.4 mm; change `battery` in `lumi_case.scad` for a different cell. | $1 |
| 5 | 220 kΩ resistor | 2 | Battery-voltage divider. 0603/0805 SMD or 1/8 W through-hole. | — |
| 6 | 30 AWG silicone or Kynar wire | ~30 cm | Point-to-point wiring | — |
| 7 | Kapton tape, thin double-sided foam tape | — | Insulation between layers, mounting the display | — |
| 8 | Split ring / keychain | 1 | ≈ 15–20 mm | — |
| 9 | 3D-printed case (`enclosure/`) | 1 set | ~6 g of glitter/"galaxy" PLA or PETG | — |
| 10 | *(optional)* 100 kΩ resistor | 2 | USB-power sense, so the battery screen can say "charging" | — |
| 11 | *(optional)* tiny slide switch | 1 | In series with battery + if you want a hard off switch for storage | — |

**Total: roughly $15 per Lumi**, plus filament.

### Alternative controller: ESP32-S3 SuperMini

Instead of the XIAO you can use an ESP32-S3 SuperMini (~$3–5). Some versions
(e.g. HW-747) have BAT+/BAT− pads and a built-in charger; those drop straight
in. Versions without a charger also need a **TP4056 USB-C charger board with
protection** (~$1) and a tiny slide switch, and the case gets 6.7 mm deeper.
Wiring for both is in [`wiring.md`](wiring.md#alternative-esp32-s3-supermini).

### Alternative controller: ESP32-C3 SuperMini + TP4056

The ESP32-C3 SuperMini (~$2–3) has the XIAO's chip but no charger. Add a
**TP4056 USB-C charger board with protection** (~$1) and a Schottky diode
(SS14 or 1N5817). It uses the same 32.2 mm deep case as the S3 + TP4056. **Lower the TP4056's
charge current** for the 300 mAh cell before using it, and remove the
SuperMini's power LED. Wiring is in [`wiring.md`](wiring.md#alternative-esp32-c3-supermini--tp4056).

## Why these parts

- **XIAO ESP32C3** has USB-C, a LiPo charger and battery pads, and it's
  21 × 17.8 mm. The ESP32-C3 has the radio for ESP-NOW (used by Tilt Pong)
  and enough flash for over-the-air updates. A bare "ESP32-C3 SuperMini"
  also works with a TP4056 USB-C charger board, but the case is 6.7 mm deeper.
- **SSD1306** is the standard 0.96" 128×64 OLED (the same resolution as the
  original). It sleeps at a few µA when its charge pump is off.
- **MPU-6050** has a hardware *wake-on-motion* interrupt. That lets the
  ESP32-C3 sit in deep sleep and wake when you pick Lumi up. Only its
  accelerometer is used (the gyro stays in standby to save power), so
  "6-axis" is honest but the gyro is spare capacity.

## Power notes (please read)

- **Desolder or scrape off the GY-521 power LED.** It draws around 1 mA all
  the time, which on its own would flatten the battery in about three weeks
  of "sleep".
- The XIAO's own power LED only lights while charging. That's fine.
- Rough battery life estimates, not yet measured on a built unit:
  - **Awake** (face animating, radio off, 80 MHz): about 25–30 mA, so
    ~16–20 h of continuous play.
  - **Tilt Pong** (ESP-NOW receiving): about 80–100 mA while a match runs.
  - **Asleep**: Seeed quotes ~44 µA for the XIAO ESP32C3 in deep sleep.
    Add the MPU-6050 in 5 Hz cycle mode (~10–20 µA), the OLED in sleep
    (a few µA) and the 440 kΩ divider (~9 µA). That's under 0.1 mA, so
    **months of standby** on 300 mAh. The awake figure above is for
    500 mAh; on the 300 mAh 702025 expect about 10–12 h of play. In practice wake-ups from being
    carried around will dominate.
