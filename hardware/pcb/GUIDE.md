# Lumi PCB v1: draft board, review checklist, ordering and bring-up

> **Status: DRAFT, NOT REVIEWED. Don't order yet.**
>
> Rebuilt in KiCad 10 on 2026-10-30 with the faults listed under
> [Fixed from the datasheets](#fixed-from-the-datasheets) corrected.
>
> `budget.py` and `BUDGET.md` still price the old J2 connector.
>
> These files were generated and checked by software:
> - KiCad's design-rule check passes with nothing left unrouted.
> - The schematic and board match the design file pin for pin.
>
> Software can't catch a wrong pinout in a datasheet I couldn't open, a bad
> antenna layout, or a part that doesn't fit the case. Work through
> [Before you order](#before-you-order-review-checklist) first, ideally with
> someone who has designed small RF boards. An hour of review costs less
> than a batch of boards that don't work.

## What's here

| File | What it is |
|---|---|
| [`kicad/lumi/lumi.kicad_pro`](kicad/lumi/lumi.kicad_pro) | The KiCad project. Open it in KiCad 10 or newer. |
| [`kicad/lumi/lumi.kicad_sch`](kicad/lumi/lumi.kicad_sch) | Schematic, one page, grouped by function. Each pin ends in a labelled net. |
| [`kicad/lumi/lumi.kicad_pcb`](kicad/lumi/lumi.kicad_pcb) | Board layout, routed, with ground pours |
| [`kicad/fab/lumi-gerbers.zip`](kicad/fab/lumi-gerbers.zip) | Gerbers and drill files: upload this to JLCPCB |
| [`kicad/fab/lumi-bom.csv`](kicad/fab/lumi-bom.csv) | Parts list in JLCPCB's format, with LCSC part numbers |
| [`kicad/fab/lumi-cpl.csv`](kicad/fab/lumi-cpl.csv) | Part positions (pick-and-place) in JLCPCB's format |
| [`kicad/fab/lumi-schematic.pdf`](kicad/fab/lumi-schematic.pdf) | Schematic as a PDF, for reviewers without KiCad |
| [`kicad/fab/lumi.step`](kicad/fab/lumi.step) | 3D board for the case design. The module has no KiCad 3D model, so it's missing; it's an 18 × 20 × 3.2 mm box. |
| [`kicad/fab/fit.txt`](kicad/fab/fit.txt) | Height stack against the case |
| [`kicad/fab/drc-report.txt`](kicad/fab/drc-report.txt) | KiCad's design-rule check output |
| [`kicad/renders/`](kicad/renders/) | Pictures of the schematic and both sides of the board |
| [`kicad/design.py`](kicad/design.py) | **The source.** Every part and connection lives here; the schematic and board are generated from it. |

## The board at a glance

| | |
|---|---|
| Size | 31 × 33 mm, 2 layers, 1.0 mm thick |
| Parts | All on the **back**. The front is flat for the screen glass, with copper, 7 test pads and the label. |
| Antenna | Top edge (keyring end). No copper on either layer above the module's antenna line. |
| USB-C | **Left** edge seen from the front (right edge seen from the back) |
| Power switch | Right edge, lever sticking out about 1 mm |
| Screen | Its cable wraps around the **bottom** edge into a 30-pin ZIF connector on the back |
| Battery | Two solder pads in the top-left corner on the back (BT1 +, BT2 −) |
| Test pads (front) | Bottom corners, outside the glass: 3V3, GND, EN, BOOT, TXD, RXD, VBAT |

![Back of the board (seen from the back)](kicad/renders/board-back.png)

![Front of the board](kicad/renders/board-front.png)

### Two changes from the plan

1. **Module: ESP32-C3-WROOM-02 instead of the MINI-1.**
   - Why: KiCad 7, the version available here, has no footprint for the MINI-1, and drawing its 53-pad footprint without the datasheet would be guesswork.
   - Same: the WROOM-02 has the same chip and the same radio certification (FCC/IC), and also comes in 4 MB.
   - Cost: it's bigger (18 × 20 × 3.2 mm vs 13.2 × 16.6 × 2.4 mm) and costs about the same. LCSC C2934560, Extended.
   - Switching back to the MINI-1 later is a footprint change in `design.py` plus a re-place.
2. **The case gets thicker: about 14.5 mm, not 12.5 mm.**
   - Why: the module and the USB-C socket are each about 3.2 mm tall, against the plan's assumed 1.5 mm for parts. See `fab/fit.txt`.
   - Ways back toward 12.5 mm, roughly in order of cost:
     - a 4 mm battery (402030, ~300 mAh): −1.4 mm,
     - a mid-mount USB-C that sinks into a board cutout: about −1.5 mm for that part, but the module still sets the height,
     - the MINI-1 (2.4 mm): −0.8 mm.

## Fixed from the datasheets

Checking the board against the ER-OLED0.96-1 datasheet (rev 2.0) and Espressif's documents found these. KiCad's design-rule check passed all of them, because each one is consistent inside the board and wrong only against the real part.

| Fault in the first draft | Effect | Fix |
|---|---|---|
| The panel was mirrored at J2 (pin 1 at the board's high-x end) | 7.5 V VCC on the wrong panel pin; a likely dead panel | `OLED_PIN_REVERSED = True`; screen capacitors moved next to their new pins |
| J2 was bottom-contact, but the ER-OLED0.96-1.3's contacts are on its viewing side, so they face away from the board after the wrap | No contact at all | J2 is now the top-contact JUSHUO AFC07-S30ECC-00 (C11095) |
| The 12 mm cable couldn't reach J2 with the glass centred on the board | The screen can't be plugged in | The glass sits 2.6 mm below the board's centre. That leaves about 1.2 mm of slack and centres the pixels in the case. |
| The charge pump's VBAT ran from 3.3 V; the panel needs 3.5-4.2 V | Below spec, dim or unreliable | VBAT runs from the battery rail, with its own capacitor (C15) |
| USB sense was VBUS/2 (2.5 V), against the C3's 2.48 V input-high level | Could read "not charging" while plugged in | R8 is now 150 kΩ, giving 3.0 V |
| The board ran under the antenna | Detunes the antenna; Espressif recommends cutting the board away | Notch above the module |

**Effect on bring-up:** with VBAT on the battery rail, the panel's pin stays powered when the switch is off. Test 4 measures whether that raises the off current.

## Before you order: review checklist

Tick every box. Items marked **VERIFY** come from memory or similar parts, not from the part's own datasheet.

### Pinouts

- [x] **ESP32-C3-WROOM-02 pin map.** Matches Table 3-1 of Espressif's datasheet v1.7.
- [x] **OLED panel, 30 pins and I2C wiring.** Matches sections 1.5 and 1.6.2 of the ER-OLED0.96-1 datasheet rev 2.0.
- [ ] **Screen cable: hold a real panel against the board.** These come from reading the drawing, so check them on the part before ordering boards:
  - **Part:** the panel must be the **ER-OLED0.96-1.3** (top contact). Other versions put the contacts on the other side.
  - **Pin 1 end:** seen from the front with the cable at the bottom, pin 1 is on the left, according to drawing 1.4.2.
  - **Reach:** about 1.2 mm of slack, based on an estimated 4 mm entry into J2 and a 2.2 mm bend.
- [ ] **AFC07-S30ECC-00 (C11095, VERIFY).** Its PDF wouldn't download here. The pads come from EasyEDA's footprint for this part, and they match KiCad's footprints for the same series. Check the entry depth and that the drawer can open with the connector at the board edge.
- [ ] **TP4054 (VERIFY):** 1 CHRG, 2 GND, 3 BAT, 4 VCC, 5 PROG.
- [ ] **RT9080-33GJ5 (VERIFY):** 1 VIN, 2 GND, 3 EN, 4 NC, 5 VOUT.
- [ ] **LIS2DH12:** 1 SCL, 2 CS, 3 SA0, 4 SDA, 5 RES (to GND), 6–8 GND, 9 VDD, 10 VDD_IO, 11 INT2, 12 INT1. This matches ST's datasheet as far as I know; still worth a glance.
- [ ] **USBLC6-2SC6:** I/O lines on 1/6 and 3/4, VBUS 5, GND 2.
- [ ] **MSK12C02 switch:** it's placed on KiCad's C&K PCM12 footprint. Check the pad layout matches the MSK12C02 drawing. Many clones copy the PCM12, but not all.

### Layout

- [ ] **Antenna:**
  - nothing metal in front of or behind the module's antenna (top ~6 mm),
  - **The battery currently sits behind it.** A 30 mm cell reaches about 4.6 mm into the antenna zone when centred, and about 2 mm even when pushed to the bottom of today's case. This needs a shorter cell or a taller case. Espressif's 15 mm clearance isn't possible in a case this size, so test range on real boards (test 12).
  - The charger and battery pads sit just left of the keep-out. A reviewer may want them further away.
- [ ] **Decoupling:** the 3.3 V pin is at the module's top-right corner, but its 10 µF/100 nF capacitors (C5, C6) sit below the module, about 14 mm away by trace. There's no room beside the pin. The module has its own on-board capacitors, so this probably works; a reviewer should still say yes or no.
- [ ] **USB data:** D+/D− go via the ESD part at the bottom left, about 25 mm of trace. Fine for 12 Mb/s USB; check the routing doesn't run beside the screen's charge-pump lines.
- [ ] **Autorouted tracks:** the routing came from an autorouter. It meets every rule, but a person would tidy it: shorter power paths, fewer vias, straighter USB pair. A reviewer may suggest touch-ups.

### Parts and stock

- [ ] Open each LCSC number in `fab/lumi-bom.csv` in JLCPCB's parts library. Check:
  - it's the right part and package,
  - it's in stock,
  - it's Basic or Extended. Each Extended part adds ~$3 per order. This board has 8: U1, U2, U3, U4, D1, J1, J2, SW1.
- [ ] Passive voltage ratings:
  - C12 (VCC, ~7.5 V) needs ≥ 16 V, 25 V better.
  - C13 (VCOMH) needs ≥ 16 V.
  - C1 (USB 5 V) needs ≥ 10 V.

### Case

- [ ] Model the case around the references in [`../enclosure/blender/`](../enclosure/blender/README.md). Blender's ready-made scene has every part, the openings and the antenna keep-out. Check:
  - the USB-C opening on the left,
  - the switch slot on the right,
  - the screen cable wrap at the bottom,
  - the ~14.5 mm depth.
- [ ] **Corners:** today's case has 7 mm rounded corners, and the board's square corners and the module's top corners don't fit inside them. The PCB case needs smaller corners (about 4 mm), or the board needs rounded corners and a re-layout.

## Ordering from JLCPCB

1. Go to jlcpcb.com, choose **Order now**, and upload `kicad/fab/lumi-gerbers.zip`.
2. Board options:
   - **Layers:** 2.
   - **Thickness:** 1.0 mm.
   - **Quantity:** 5. If you only have 5 boards assembled, extra bare boards are cheap spares.
   - **Surface finish:** HASL lead-free, or ENIG for the 0.5 mm-pitch parts (flatter pads; a few dollars more).
   - Everything else default.
3. Turn on **PCB Assembly**:
   - **Side:** **Bottom** (all parts are on the back).
   - **Quantity:** 5 (or 2 to start; see the note below).
   - **Tooling holes:** "Added by JLCPCB".
4. Upload `kicad/fab/lumi-bom.csv` (BOM) and `kicad/fab/lumi-cpl.csv` (CPL). On the parts page:
   - Every line should match its LCSC number. Fix any "out of stock" with an equivalent part.
   - The battery pads and test pads aren't in the BOM on purpose.
5. **Check the placement preview carefully.** This is where most first-order mistakes show up. On bottom-side boards, rotations are often off by 90° or 180°. For each part, check:
   - **U1 module:** antenna at the top edge, pads on the board's pads.
   - **U2, U3, U4, D1:** the pin-1 dot matches the silkscreen dot.
   - **J1 USB-C:** opening at the board edge.
   - **J2 ZIF:** drawer toward the bottom edge.
   - **SW1:** lever pointing out of the right edge.

   Use JLCPCB's rotate buttons to fix anything off, and note the fix so the next order can use it.
6. Order. The screen panels (BuyDisplay) and batteries come separately.

Cost guide: see the prototype budget in [PLAN.md](PLAN.md). Expect roughly:
- $30–60 in assembly setup and Extended-part fees,
- $25–40 of parts for 5 boards,
- plus shipping.

Ordering 2 assembled boards first halves the parts cost and finds problems sooner.

## Bring-up test sheet

You need:
- a USB-C cable,
- a multimeter (ideally one that reads microamps),
- a protected 503030 cell,
- the plug-in screen.

Test in this order, and stop at the first failure.

| # | Test | How | Pass |
|---|---|---|---|
| 1 | No shorts | Before powering, measure resistance VBUS–GND, VBAT–GND and 3V3–GND | Each above ~1 kΩ (3V3 reads lower while the capacitors charge) |
| 2 | Charger | Plug in USB-C with no battery and the switch OFF. Measure VBAT (TP7). | ~4.2 V |
| 3 | Battery | Unplug USB. Solder the battery: red to BT1 (+), black to BT2 (−). Switch ON. | 3V3 test pad reads 3.25–3.35 V |
| 4 | Off really is off | Switch OFF. Measure the battery current with the meter in series. | Under ~5 µA |
| 5 | USB flashing | Switch ON, USB plugged in. In PlatformIO, upload the firmware. | Uploads. If not: short BOOT to GND, tap EN to GND, release BOOT, upload again. |
| 6 | Serial console | Open the serial monitor at 115200 | Boot log, including `IMU: LIS2DH12 at 0x19` |
| 7 | Screen | Fit the screen cable into J2 and close the latch, then reset | Lumi's face. If blank, check pin 1 orientation (`OLED_PIN_REVERSED`) and the I2C scan in the log (expect 0x3C and 0x19). |
| 8 | Accelerometer axes | Console `i` command, tilt the board | Tilting toward the screen's top raises Y; work out any remap for `config.h` |
| 9 | Pats and wake | Pat the case. Let it sleep, then pick it up. | Reacts to pats; wakes on pickup |
| 10 | Charging | Plug USB in with the battery fitted | The battery screen says "charging"; VBAT rises toward 4.2 V |
| 11 | Sleep current | Let it deep-sleep, meter in series with the battery | Target under 30 µA total |
| 12 | Radio | Start Boop Pong against a second Lumi and walk apart. Also pick **UPDATE** and join the `Lumi-XXXX` Wi-Fi from a phone. | A Pong match keeps working 10 m or more apart, and the phone reaches `http://192.168.4.1`. If range is poor, see the antenna items above. |

Send me the serial log and the numbers from tests 4 and 11, and I'll go through them with you.

**Firmware for this board.** The pins match today's XIAO build:
- unchanged: SDA 6, SCL 7, motion interrupt 3, battery 4,
- new: USB sense on IO5, the screen reset on IO10, the charger status on IO1 (with pull-up).

A `lumi_pcb_v1` build environment that sets these is the next firmware step (PLAN.md, "Firmware changes", items 2–4). Until then the XIAO build runs as-is, except that the screen needs IO10 driven high for its reset line.

## Rebuilding the files

Everything is generated from [`kicad/design.py`](kicad/design.py). Change parts or connections there, never in the KiCad files, and rebuild:

```sh
# Needs KiCad 10, Java 21+ and the Freerouting 2.1 jar. On Windows, run it
# from Git Bash with kicad-cli on the PATH and PYTHON set to KiCad's Python.
FREEROUTING=~/freerouting-2.1.0.jar hardware/pcb/kicad/build.sh

# Re-run only the checks and factory files on the committed routing:
hardware/pcb/kicad/build.sh --no-route
```

Placement is in `PLACE` in [`kicad/gen_board.py`](kicad/gen_board.py) (millimetres, seen from the front). Routing is done by Freerouting. If you hand-route in KiCad instead, use `--no-route` from then on so your work isn't overwritten.

The build fails unless all three checks pass:
- the schematic's netlist matches `design.py`,
- every board pad carries the right net,
- KiCad's DRC reports no violations and nothing unrouted.

`check.py` runs the design-rule check through `kicad-cli`. The scripts now use KiCad 10's Python interface, and a rebuild saves the board in KiCad 10's format, which KiCad 7 can't open.
