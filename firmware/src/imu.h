// Accelerometer driver: MPU-6050 / MPU-6500 family (GY-521 boards) or
// LIS2DH12 (the Lumi PCB, or a LIS2DH12 breakout). begin() finds whichever
// is fitted, so one firmware build works with either.
//
// Normal mode samples the accelerometer at 100 Hz into the chip's FIFO, so the
// firmware can be busy pushing a frame to the display without dropping
// samples (and tap timestamps stay accurate for Boop Pong).
// Sleep mode puts the chip in a low-power mode with a wake-on-motion
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
  enum class Kind : uint8_t { None, Mpu6050, Mpu6500, Lis2dh12 };

  // Tries an MPU at `mpuAddr` (0x68/0x69), then a LIS2DH12 at 0x19 and 0x18.
  bool begin(TwoWire& wire, uint8_t mpuAddr);
  Kind kind() const { return kind_; }
  const char* kindName() const;
  uint8_t whoAmI() const { return who_; }
  uint8_t address() const { return addr_; }

  // Drains the FIFO. Returns number of samples written.
  int read(AccelSample* out, int max, uint32_t nowMs);

  // Configure wake-on-motion and low-power mode before deep sleep.
  // `threshold` is in MPU-6050 units (~2 mg/LSB) whatever the chip.
  void enterMotionWake(uint8_t threshold, uint8_t durationMs);

 private:
  bool probe(uint8_t addr);
  void write(uint8_t reg, uint8_t v);
  uint8_t read8(uint8_t reg);
  bool readBytes(uint8_t reg, uint8_t* buf, size_t n);

  bool beginMpu();
  int readMpu(AccelSample* out, int max);
  void resetMpuFifo();
  void wakeMpu(uint8_t threshold, uint8_t durationMs);

  bool beginLis();
  int readLis(AccelSample* out, int max);
  void wakeLis(uint8_t threshold, uint8_t durationMs);

  TwoWire* wire_ = nullptr;
  uint8_t addr_ = 0x68;
  uint8_t who_ = 0;
  Kind kind_ = Kind::None;
};
