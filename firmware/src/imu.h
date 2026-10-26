// MPU-6050 / MPU-6500-family accelerometer driver.
//
// Normal mode samples the accelerometer at 100 Hz into the chip's FIFO, so the
// firmware can be busy pushing a frame to the display without dropping
// samples (and tap timestamps stay accurate for Boop Pong).
// Sleep mode puts the chip in low-power cycle mode with a wake-on-motion
// interrupt that pulls INT high to wake the ESP32-C3.
#pragma once
#include <Arduino.h>
#include <Wire.h>

struct AccelSample {
  float x, y, z;  // g, IMU frame
  uint32_t t;     // ms (reconstructed from the 100 Hz FIFO cadence)
};

class Imu {
 public:
  bool begin(TwoWire& wire, uint8_t addr);
  uint8_t whoAmI() const { return who_; }
  bool is6500Family() const { return who_ != 0x68; }

  // Drains the FIFO. Returns number of samples written.
  int read(AccelSample* out, int max, uint32_t nowMs);

  // Configure wake-on-motion and low-power cycling before deep sleep.
  void enterMotionWake(uint8_t threshold, uint8_t durationMs);

 private:
  void write(uint8_t reg, uint8_t v);
  uint8_t read8(uint8_t reg);
  bool readBytes(uint8_t reg, uint8_t* buf, size_t n);
  void resetFifo();

  TwoWire* wire_ = nullptr;
  uint8_t addr_ = 0x68;
  uint8_t who_ = 0;
};
