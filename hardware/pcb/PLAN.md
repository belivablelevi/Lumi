# Lumi PCB: plan

Status: **draft board drawn, not reviewed**. The schematic, routed board and
JLCPCB files are in [kicad/](kicad/), with a review checklist, ordering
steps and a bring-up sheet in [GUIDE.md](GUIDE.md). Nothing has been
ordered or tested yet. Prices are rough single-batch estimates from late
2026. Check LCSC/JLCPCB before committing to any part.

## Goal

Replace the three hand-wired modules with **one board that a factory
builds**, at the **lowest cost per unit**:
- XIAO ESP32-C3
- OLED module
- GY-521 motion sensor

Start with **5–10 assembled prototypes** from a PCB factory (JLCPCB or
PCBWay). The same files then scale to production.

Side effects of one integrated board:
- No hand wiring, so every unit comes out the same.
- A much **thinner case**: about 12–13 mm instead of 19.5 mm, keeping the
  35 × 37 mm front.
- Parts cost drops from about $10–15 of modules to roughly **$5–6** per
  unit at volume, before assembly.

## What goes on the board

| Block | Part (first choice) | Why | ≈ Unit cost |
|---|---|---|---|
| Brain + radio | **ESP32-C3-MINI-1-N4** module (LCSC C2838502). The draft board uses the **WROOM-02** instead; see [GUIDE.md](GUIDE.md#two-changes-from-the-plan) | Same chip as today, so the firmware barely changes. It's **pre-certified for radio**; see "Certification" below. 13.2 × 16.6 mm. | $2.0–3.0 |
| Motion sensor | **LIS2DH12** (SC7A20 is a later cost-down option) | Lumi only uses the accelerometer (the gyro is switched off in `firmware/src/imu.cpp`). These cost a fraction of an MPU-6050, which is end-of-life. Each has a 32-sample FIFO and a motion-wake interrupt, which is what pats and wake-on-pickup need. | $0.15–0.6 |
| Screen | **Bare 0.96" 128×64 SSD1306 panel** with a 30-pin FPC, on a 0.5 mm FPC connector | The same panel as the module, without the module's board. We add its few capacitors ourselves. | $1.0–1.5 |
| Charging | **TP4054** linear LiPo charger, set to ≈250 mA | Tiny, a few cents, plenty for a 500 mAh cell. | $0.05 |
| Battery protection | Use a cell **with its own protection board**; leave footprints for DW01A + FS8205A | Cheapest safe option. The footprints let us add protection later if the cell supplier changes. | $0–0.10 |
| 3.3 V supply | **Low-quiescent LDO**, e.g. RT9080 (≈2 µA standby) | Deep-sleep battery life depends on this. Common LDOs draw 40 µA+ doing nothing. | $0.10 |
| USB-C | 16-pin USB-C receptacle, 5.1 kΩ CC resistors, ESD diode | Charging, plus programming through the C3's **built-in USB** (no USB-serial chip needed). | $0.15 |
| Battery level | 1 MΩ + 1 MΩ divider with 100 nF to ADC | Today's 220 kΩ pair wastes ~9 µA all the time. 1 MΩ cuts that to ~2 µA. | <$0.01 |
| Charging sense | VBUS divider to a GPIO | So the battery screen can say "charging". It's optional on today's build and free on a PCB. | <$0.01 |
| Buttons | **None on the outside.** Pads for BOOT (GPIO9) and EN for recovery only | Lumi stays button-free. The pads let the factory or you recover a bricked unit. | – |
| Power switch | Tiny slide switch on the LDO enable pin | For storage and shipping; see Decisions. | $0.05 |
| Battery connector | JST-SH 2-pin, or solder pads | Pads are cheapest. A connector makes assembly and repair easier. | $0–0.05 |

Estimated parts: **≈ $4–6 per unit at 1,000**. JLCPCB assembly adds setup
and "extended part" fees, which matter most for small runs.

## Layout sketch (all of it fits in today's 35 × 37 mm front)

```
   ┌───────── keyring loop ─────────┐
   │  ESP32-C3-MINI antenna here:   │  ← antenna at the top edge, no copper under it
   │  ┌──────────────┐              │
   │  │ ESP32-C3     │   USB-C →    │  ← USB-C on the right side, as today
   │  │ MINI-1       │              │
   │  └──────────────┘              │
   │  charger · LDO · accelerometer │
   │  [ OLED FPC connector ]        │
   └────────────────────────────────┘
        battery (30×30×5 mm) behind the board
        screen glass in front of the board
```

- **Board:** about **31 × 31 mm, 2-layer, 1.0 mm thick**, parts on the
  back only. The front is flat, so the screen glass can sit on it.
- **Stack from front to back:** wall 1.4, OLED glass 1.6, PCB 1.0, parts
  1.5, battery 5.4, wall 1.4, plus clearances. That makes **≈ 12.5 mm**.
- **Antenna:** the module's antenna overhangs the top edge, toward the
  keyring, with no copper or battery near it. The case wall there must be
  plastic only (it is).
- **Accelerometer:** placed near the middle, with its axes noted on the
  silkscreen so the screen-axis remap in `config.h` is known from the
  start.

## Pin map (unchanged from today where possible)

| Signal | ESP32-C3 pin | Notes |
|---|---|---|
| I2C SDA / SCL | GPIO6 / GPIO7 | Shared by the OLED and accelerometer, with 4.7 kΩ pull-ups on the board |
| Motion interrupt | GPIO3 | Must be GPIO0–5 to wake from deep sleep |
| Battery level | GPIO4 (ADC) | |
| USB charging sense | GPIO5 | |
| OLED reset | GPIO10 | The bare panel needs a reset line; the module did this itself |
| USB D− / D+ | GPIO18 / GPIO19 | Built-in USB: flashing and the serial console |
| Strapping | GPIO2, GPIO8, GPIO9 | Left alone or pulled the right way; BOOT pad on GPIO9 |

## Firmware changes needed

1. **New accelerometer driver** (LIS2DH12 / SC7A20) behind the existing
   `Imu` interface in `firmware/src/imu.{h,cpp}`. It must provide:
   - 100 Hz FIFO reads,
   - the wake-on-motion interrupt on INT1,
   - the same g-units.

   The gesture code (`gestures.cpp`) doesn't change, but the tap threshold
   may need re-tuning.
2. **OLED reset pin** and the bare panel's charge-pump setup. That's a
   few lines in `ssd1306.cpp`.
3. **USB sense** on by default, and the 1 MΩ battery divider ratio in
   `config.h`.
4. A new PlatformIO environment, `lumi_pcb_v1`, so the module builds keep
   working.

We can test step 1 **before any PCB exists**: a $3 LIS2DH12 breakout
wired in place of the GY-521.

## Case changes

A new `board = "pcb_v1"` option in `hardware/enclosure/lumi_case.scad`:
- 12.5 mm depth,
- the screen window lined up with the bare panel,
- the USB-C opening moved to the new connector position,
- standoffs for the PCB.

The STEP model of the board, exported from KiCad, checks the fit.

## How the design gets made

| Step | What | Who |
|---|---|---|
| 1 | Confirm parts against live LCSC stock and prices (done: see [BOM-draft.md](BOM-draft.md)); the OLED panel connection is still open | Me, then you approve |
| 2 | Test the new accelerometer on a breakout with the current build: firmware driver, pats, wake-on-pickup. The driver is done and tested against a register model (`make -C tests/imu`); wiring is in [../wiring.md](../wiring.md#trying-the-pcbs-accelerometer-lis2dh12-on-todays-build) | Me (driver, done), you (a $3 part + wiring) |
| 3 | Schematic (draft done: [kicad/lumi/lumi.kicad_sch](kicad/lumi/lumi.kicad_sch), generated from [kicad/design.py](kicad/design.py) and checked pin by pin against it) | Me |
| 4 | Board layout: placement, routing, ground pour, antenna keep-out; design rule check (draft done: KiCad's DRC is clean, nothing unrouted) | Me, then **a review by someone who does RF/PCB work** before ordering (strongly recommended) |
| 5 | 3D fit check against the new case, with STEP export (draft done: `kicad/fab/fit.txt`, plus Blender references in [../enclosure/blender/](../enclosure/blender/); the case itself is still to model) | Me |
| 6 | Factory files: Gerbers, BOM, pick-and-place (CPL) in JLCPCB format (draft done: `kicad/fab/`); their DFM check | Me |
| 7 | Order 5–10 assembled boards | You |
| 8 | Bring-up with a step-by-step test sheet | You, with me reading the results |

Bring-up checks: power and charge current, deep-sleep current (target
**< 30 µA** total), USB flashing, screen, accelerometer axes, pats and wake.

What I can't do from here: order boards, or measure real hardware. For
the layout, I'll use KiCad's command-line checks and a 3D fit check. An
experienced human review before the first order is worth the cost.

## Rough prototype budget (5 assembled boards)

> Superseded by the detailed **[BUDGET.md](BUDGET.md)**:
> - 5 prototypes all in (screens, batteries, cases, shipping to Canada and taxes) ≈ $189 USD / $264 CAD,
> - 10 ≈ $269 / $376,
> - per unit ≈ $11.70 at 100 and $8.00 at 1,000.
> The rough table below is kept for reference.

| | ≈ |
|---|---|
| PCBs (2-layer, 1.0 mm) | $5–15 |
| Assembly setup + "extended part" fees (module, accelerometer, charger, connectors) | $30–60 |
| Parts for 5 boards | $25–40 |
| Shipping to Canada | $20–40 |
| OLED panels (ordered separately; connect by hand to the FPC connector) | $10 |
| **Total** | **≈ $90–165** |

## Certification (selling in Canada and elsewhere)

- The **ESP32-C3-MINI-1 module is already radio-certified**: it has an
  FCC ID and an ISED (IC) number. Using it as-is, with its antenna
  untouched, means no expensive radio certification of our own. The
  product label says "Contains FCC ID … / IC …".
- The finished product still needs **unintentional-emissions** compliance:
  FCC Part 15B in the US, ICES-003 in Canada. That's usually a short lab
  test or a supplier's declaration.
- Batteries: buy cells with **UN38.3** test reports, needed to ship
  lithium cells, and **IEC 62133**.
- A chip-down design (bare ESP32-C3 + our own antenna) would save about
  $1 per unit. It needs its own radio certification, typically
  $5,000–15,000, so it only pays off well above ~10,000 units.

## Decisions

| Question | Decision |
|---|---|
| Case | Keep the **35 × 37 mm front**, about **12.5 mm thick**, with the same 500 mAh 503030 cell |
| Power switch | A **tiny slide switch** (MSK12C02, LCSC C431540) on the 3.3 V regulator's **enable pin**. It switches microamps, not the battery current, which matters because it's only rated 50 mA. Off = everything after the regulator is unpowered, for storage and shipping. Charging still works when it's off. The case gets a small slot. |
| Motion sensor | **LIS2DH12** for the first boards. SC7A20 may be tried later as a cost-down, since it's register-compatible. |

## Sources

- [LCSC: ESP32-C3-MINI-1-N4 (C2838502)](https://www.lcsc.com/product-detail/C2838502.html): price tiers about $3.00 at 1 down to about $2.03 at 650+.
- [JLCPCB parts: ESP32-C3-MINI-1-N4](https://jlcpcb.com/partdetail/ESP32-C3-MINI-1-N4/C2838502): listed as an Extended part.
