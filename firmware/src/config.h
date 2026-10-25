// Board wiring and tuning. Defaults match the reference build in
// hardware/wiring.md (Seeed Studio XIAO ESP32C3 + SSD1306 + MPU-6050).
#pragma once

// ---- Pins (XIAO ESP32C3 silkscreen names in comments) ----------------------
#define LUMI_PIN_SDA 6       // D4
#define LUMI_PIN_SCL 7       // D5
#define LUMI_PIN_IMU_INT 3   // D1. Must be GPIO0..5: only those can wake the C3 from deep sleep.
#define LUMI_PIN_BATTERY 4   // D2, battery+ through a 1:2 divider (2 x 220k)
#define LUMI_PIN_USB_SENSE -1  // optional: VBUS through 100k/100k divider; -1 = not fitted

#define LUMI_BATTERY_DIVIDER 2.0f
#define LUMI_I2C_HZ 400000

// ---- Display ----------------------------------------------------------------
#define LUMI_OLED_ADDR 0x3C
#define LUMI_OLED_FLIP 0     // 1 if the panel is mounted rotated 180 degrees

// ---- IMU --------------------------------------------------------------------
#define LUMI_IMU_ADDR 0x68   // 0x69 if AD0 is pulled high

// Map IMU axes onto the screen frame used by the gesture code:
//   +X = towards the right edge of the screen, +Y = towards the keyring,
//   +Z = out of the screen towards the viewer.
// Each screen axis takes IMU axis N (0=X, 1=Y, 2=Z) times a sign. The default
// assumes the GY-521 sits flat behind the display, chip facing the back of the
// case, with its printed Y arrow pointing at the keyring. If tilting the wrong
// way makes Lumi look the wrong way, open the serial monitor, type `i` and
// adjust these until hanging upright prints y ~ +1 and face-up prints z ~ +1.
#define LUMI_IMU_SCREEN_X_AXIS 0
#define LUMI_IMU_SCREEN_X_SIGN -1
#define LUMI_IMU_SCREEN_Y_AXIS 1
#define LUMI_IMU_SCREEN_Y_SIGN 1
#define LUMI_IMU_SCREEN_Z_AXIS 2
#define LUMI_IMU_SCREEN_Z_SIGN -1

// Wake-on-motion sensitivity while asleep. Higher = needs a firmer pick-up.
// MPU-6050: ~2 mg/LSB; MPU-6500 family: 4 mg/LSB.
#define LUMI_WAKE_THRESHOLD 40
#define LUMI_WAKE_DURATION_MS 2

// ---- Radio ------------------------------------------------------------------
#define LUMI_ESPNOW_CHANNEL 1

// ---- Misc -------------------------------------------------------------------
#define LUMI_FRAME_MS 33     // ~30 fps
#define LUMI_CPU_MHZ 80      // plenty for 30 fps; saves ~10 mA vs 160 MHz
