#include "imu.h"

namespace {

enum Reg : uint8_t {
  SMPLRT_DIV = 0x19,
  CONFIG = 0x1A,
  ACCEL_CONFIG = 0x1C,
  ACCEL_CONFIG2 = 0x1D,  // 6500 family
  LP_ACCEL_ODR = 0x1E,   // 6500 family
  MOT_THR = 0x1F,        // WOM_THR on the 6500 family
  MOT_DUR = 0x20,        // 6050 only
  FIFO_EN = 0x23,
  INT_PIN_CFG = 0x37,
  INT_ENABLE = 0x38,
  INT_STATUS = 0x3A,
  MOT_DETECT_CTRL = 0x69,  // ACCEL_INTEL_CTRL on the 6500 family
  USER_CTRL = 0x6A,
  PWR_MGMT_1 = 0x6B,
  PWR_MGMT_2 = 0x6C,
  FIFO_COUNTH = 0x72,
  FIFO_R_W = 0x74,
  WHO_AM_I = 0x75,
};

constexpr float kLsbPerG = 8192.f;  // +-4 g range
constexpr uint32_t kSampleMs = 10;  // 100 Hz

}  // namespace

void Imu::write(uint8_t reg, uint8_t v) {
  wire_->beginTransmission(addr_);
  wire_->write(reg);
  wire_->write(v);
  wire_->endTransmission();
}

uint8_t Imu::read8(uint8_t reg) {
  uint8_t v = 0;
  readBytes(reg, &v, 1);
  return v;
}

bool Imu::readBytes(uint8_t reg, uint8_t* buf, size_t n) {
  wire_->beginTransmission(addr_);
  wire_->write(reg);
  if (wire_->endTransmission(false) != 0) return false;
  if (wire_->requestFrom((int)addr_, (int)n) != (int)n) return false;
  for (size_t i = 0; i < n; ++i) buf[i] = wire_->read();
  return true;
}

void Imu::resetFifo() {
  write(USER_CTRL, 0x04);  // FIFO_RESET
  delay(1);
  write(USER_CTRL, 0x40);  // FIFO_EN
  write(FIFO_EN, 0x08);    // accelerometer only
}

bool Imu::begin(TwoWire& wire, uint8_t addr) {
  wire_ = &wire;
  addr_ = addr;
  wire_->beginTransmission(addr_);
  if (wire_->endTransmission() != 0) return false;

  write(PWR_MGMT_1, 0x80);  // device reset
  delay(100);
  who_ = read8(WHO_AM_I);
  write(PWR_MGMT_1, 0x00);  // awake, internal oscillator
  delay(10);
  write(PWR_MGMT_2, 0x07);  // gyro in standby: we only need the accelerometer
  write(CONFIG, 0x03);      // DLPF ~44 Hz, 1 kHz internal rate
  write(SMPLRT_DIV, 9);     // 1 kHz / (1 + 9) = 100 Hz
  write(ACCEL_CONFIG, 0x08);  // +-4 g (taps can exceed 2 g)
  if (is6500Family()) write(ACCEL_CONFIG2, 0x03);  // accel DLPF ~44 Hz
  write(INT_ENABLE, 0x00);
  write(INT_PIN_CFG, 0x20);  // INT active-high, push-pull, latched
  read8(INT_STATUS);
  resetFifo();
  return true;
}

int Imu::read(AccelSample* out, int max, uint32_t nowMs) {
  uint8_t c[2];
  if (!readBytes(FIFO_COUNTH, c, 2)) return 0;
  int count = (c[0] << 8 | c[1]) / 6;
  if (count >= 1024 / 6 - 1) {  // overflowed: drop everything and start over
    resetFifo();
    return 0;
  }
  if (count > max) count = max;
  int n = 0;
  uint8_t buf[120];
  while (n < count) {
    const int chunk = (count - n) > 20 ? 20 : (count - n);
    if (!readBytes(FIFO_R_W, buf, chunk * 6)) break;
    for (int i = 0; i < chunk; ++i) {
      const uint8_t* p = buf + i * 6;
      out[n].x = (int16_t)(p[0] << 8 | p[1]) / kLsbPerG;
      out[n].y = (int16_t)(p[2] << 8 | p[3]) / kLsbPerG;
      out[n].z = (int16_t)(p[4] << 8 | p[5]) / kLsbPerG;
      ++n;
    }
  }
  // The newest sample is "now"; older ones step back 10 ms each.
  for (int i = 0; i < n; ++i) out[i].t = nowMs - (uint32_t)(n - 1 - i) * kSampleMs;
  return n;
}

void Imu::enterMotionWake(uint8_t threshold, uint8_t durationMs) {
  write(USER_CTRL, 0x00);
  write(FIFO_EN, 0x00);
  write(INT_PIN_CFG, 0x20);  // latched until INT_STATUS is read (on wake)

  if (is6500Family()) {
    // MPU-6500 / 9250 / 6515 "wake on motion" sequence (datasheet 7.1).
    write(PWR_MGMT_1, 0x00);
    write(PWR_MGMT_2, 0x07);
    write(ACCEL_CONFIG2, 0x01);
    write(INT_ENABLE, 0x40);       // WOM_EN
    write(MOT_DETECT_CTRL, 0xC0);  // ACCEL_INTEL_EN | ACCEL_INTEL_MODE (compare to previous)
    write(MOT_THR, threshold / 2 ? threshold / 2 : 1);  // 4 mg/LSB here vs ~2 mg on the 6050
    write(LP_ACCEL_ODR, 0x05);     // ~15.6 Hz wake-up rate
    read8(INT_STATUS);
    write(PWR_MGMT_1, 0x20);       // CYCLE
  } else {
    // MPU-6050 low-power accelerometer mode with motion interrupt.
    write(ACCEL_CONFIG, 0x09);     // +-4 g, high-pass 5 Hz for motion detection
    write(MOT_THR, threshold);
    write(MOT_DUR, durationMs ? durationMs : 1);
    write(MOT_DETECT_CTRL, 0x15);
    write(INT_ENABLE, 0x40);       // MOT_EN
    read8(INT_STATUS);
    write(PWR_MGMT_2, (1 << 6) | 0x07);  // LP_WAKE_CTRL = 5 Hz, gyro standby
    write(PWR_MGMT_1, 0x28);       // CYCLE | TEMP_DIS
  }
  delay(30);
  read8(INT_STATUS);  // clear anything triggered while reconfiguring
}
