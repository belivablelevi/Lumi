# Wiring

All modules share one I2C bus. Both the OLED and GY-521 boards already
carry I2C pull-up resistors, so no extra pull-ups are needed.

```
                 XIAO ESP32C3 (top view, USB-C at the top)
                  ┌──────────[USB-C]──────────┐
                D0│ GPIO2              5V     │
   IMU INT ──── D1│ GPIO3              GND    │──── GND (OLED, IMU, divider)
   divider ──── D2│ GPIO4              3V3    │──── VCC (OLED, IMU)
                D3│ GPIO5      GPIO10  D10    │
   SDA ──────── D4│ GPIO6      GPIO9   D9     │
   SCL ──────── D5│ GPIO7      GPIO8   D8     │
                D6│ GPIO21     GPIO20  D7     │
                  └───────────────────────────┘
                     back side: BAT+  BAT-  pads ── LiPo
```

| From | To | Notes |
|------|----|-------|
| XIAO **3V3** | OLED **VCC**, GY-521 **VCC** | |
| XIAO **GND** | OLED **GND**, GY-521 **GND** | |
| XIAO **D4 / GPIO6** | OLED **SDA**, GY-521 **SDA** | I2C data |
| XIAO **D5 / GPIO7** | OLED **SCL**, GY-521 **SCL** | I2C clock |
| XIAO **D1 / GPIO3** | GY-521 **INT** | Wake-on-motion. It must be GPIO0–5: only those can wake the C3 from deep sleep. |
| XIAO **BAT+** pad | LiPo **+** (red) | Back of the XIAO. Mind the polarity! |
| XIAO **BAT−** pad | LiPo **−** (black) | |
| LiPo **+** → 220 kΩ → **D2 / GPIO4** → 220 kΩ → **GND** | | Battery voltage divider (1:2) |
| GY-521 **AD0** | leave unconnected | Pulled low on the board, so address 0x68 |
| GY-521 XDA, XCL | leave unconnected | |

Optional USB-power sense, so the battery screen shows "charging": wire
XIAO **5V** → 100 kΩ → **D3 / GPIO5** → 100 kΩ → **GND**, then set
`LUMI_PIN_USB_SENSE 5` in `firmware/src/config.h`.

## Pins to avoid

GPIO2, GPIO8 and GPIO9 are ESP32-C3 *strapping pins*. They decide the boot
mode, so don't hang anything on them that could pull them the wrong way at
power-up. The pin map above avoids them.

## IMU orientation

The firmware wants the accelerometer in "screen" axes: +X right, +Y up
toward the keyring, +Z out of the screen. In the reference build the GY-521
lies flat behind the XIAO with its **chip facing the back of the case** and
its printed **Y arrow pointing at the keyring**. If you mount it another
way, remap the axes in `config.h` (`LUMI_IMU_SCREEN_*`). The serial `i`
command prints live values to check against:

| Hold Lumi… | `i` should print gravity ≈ |
|---|---|
| hanging from its keyring | `y = +1` |
| lying face-up on a table | `z = +1` |
| with its right side down | `x = −1` |

## Alternative: ESP32-S3 SuperMini

The firmware picks these pins automatically when built for the S3
(`pio run -e esp32s3_supermini -t upload`). The board's silkscreen shows
GPIO numbers.

| S3 SuperMini | To | Notes |
|---|---|---|
| **3V3** | OLED **VCC**, GY-521 **VCC** | |
| **GND** | OLED **GND**, GY-521 **GND**, divider bottom | |
| **GPIO5** | OLED **SDA**, GY-521 **SDA** | I2C data |
| **GPIO6** | OLED **SCL**, GY-521 **SCL** | I2C clock |
| **GPIO4** | GY-521 **INT** | Wake-on-motion. Must be GPIO0–21 (RTC pins). |
| **GPIO1** | Middle of the 220k + 220k divider from battery + | Battery voltage |

Avoid GPIO0, 3, 45 and 46 (strapping pins) and GPIO48 (the RGB LED).

**Power, depending on your board:**

- **Board with BAT+ / BAT− pads (built-in charger, e.g. HW-747):** solder
  the LiPo to those pads, exactly like the XIAO. Charging is through the
  board's own USB-C. Print `stl/lumi_front_s3.stl` + `lumi_back_s3.stl` (`board="s3"`).
- **Board without a charger:** add a TP4056 USB-C charger board with
  protection. LiPo → TP4056 **B+ / B−**; TP4056 **OUT+** → slide switch →
  SuperMini **5V** pin; **OUT−** → **GND**. Take the divider from **B+**.
  Charge through the TP4056's USB-C. **Turn the switch off before plugging
  USB into the SuperMini itself** (for flashing): otherwise its USB 5 V can
  feed back into the battery. Day to day, use Wi-Fi updates instead. Build
  `stl/lumi_front_s3_tp4056.stl` + `lumi_back_s3_tp4056.stl` (`board="s3_tp4056"`).

Most S3 SuperMinis have an always-on power LED; remove it for decent
standby time, just like the GY-521's.
