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
