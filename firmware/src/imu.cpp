#include "imu.h"

namespace {

// ---- MPU-6050 / MPU-6500 family --------------------------------------------
namespace mpu {
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
}  // namespace mpu

// ---- LIS2DH12 ---------------------------------------------------------------
namespace lis {
enum Reg : uint8_t {
  WHO_AM_I = 0x0F,  // reads 0x33
  CTRL_REG1 = 0x20,
  CTRL_REG2 = 0x21,
  CTRL_REG3 = 0x22,
  CTRL_REG4 = 0x23,
  CTRL_REG5 = 0x24,
  CTRL_REG6 = 0x25,
  REFERENCE = 0x26,
  OUT_X_L = 0x28,
  FIFO_CTRL_REG = 0x2E,
  FIFO_SRC_REG = 0x2F,
  INT1_CFG = 0x30,
  INT1_SRC = 0x31,
  INT1_THS = 0x32,
  INT1_DURATION = 0x33,
};
constexpr uint8_t kWhoAmI = 0x33;
constexpr uint8_t kAutoIncrement = 0x80;  // set on the register address for multi-byte reads
constexpr float kGPerDigit = 0.002f;      // +-4 g, high-resolution: 12-bit, left-justified (/16 to align)
constexpr int kFifoDepth = 32;
}  // namespace lis

constexpr uint32_t kSampleMs = 10;  // 100 Hz

}  // namespace

// ---- I2C helpers ------------------------------------------------------------

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

bool Imu::probe(uint8_t addr) {
  wire_->beginTransmission(addr);
  return wire_->endTransmission() == 0;
}

// ---- Common entry points ------------------------------------------------------

bool Imu::begin(TwoWire& wire, uint8_t mpuAddr) {
  wire_ = &wire;
  kind_ = Kind::None;
  if (probe(mpuAddr)) {
    addr_ = mpuAddr;
    return beginMpu();
  }
  for (uint8_t a : {(uint8_t)0x19, (uint8_t)0x18}) {
    if (!probe(a)) continue;
    addr_ = a;
    if (read8(lis::WHO_AM_I) == lis::kWhoAmI) return beginLis();
  }
  return false;
}

const char* Imu::kindName() const {
  switch (kind_) {
    case Kind::Mpu6050: return "MPU-6050";
    case Kind::Mpu6500: return "MPU-6500";
    case Kind::Lis2dh12: return "LIS2DH12";
    default: return "none";
  }
}

int Imu::read(AccelSample* out, int max, uint32_t nowMs) {
  int n = 0;
  if (kind_ == Kind::Lis2dh12) n = readLis(out, max);
  else if (kind_ != Kind::None) n = readMpu(out, max);
  // The newest sample is "now"; older ones step back 10 ms each.
  for (int i = 0; i < n; ++i) out[i].t = nowMs - (uint32_t)(n - 1 - i) * kSampleMs;
  return n;
}

void Imu::enterMotionWake(uint8_t threshold, uint8_t durationMs) {
  if (kind_ == Kind::Lis2dh12) wakeLis(threshold, durationMs);
  else if (kind_ != Kind::None) wakeMpu(threshold, durationMs);
}

// ---- MPU-6050 / MPU-6500 ------------------------------------------------------

void Imu::resetMpuFifo() {
  write(mpu::USER_CTRL, 0x04);  // FIFO_RESET
  delay(1);
  write(mpu::USER_CTRL, 0x40);  // FIFO_EN
  write(mpu::FIFO_EN, 0x08);    // accelerometer only
}

bool Imu::beginMpu() {
  using namespace mpu;
  write(PWR_MGMT_1, 0x80);  // device reset
  delay(100);
  who_ = read8(WHO_AM_I);
  kind_ = who_ == 0x68 ? Kind::Mpu6050 : Kind::Mpu6500;
  write(PWR_MGMT_1, 0x00);  // awake, internal oscillator
  delay(10);
  write(PWR_MGMT_2, 0x07);  // gyro in standby: we only need the accelerometer
  write(CONFIG, 0x03);      // DLPF ~44 Hz, 1 kHz internal rate
  write(SMPLRT_DIV, 9);     // 1 kHz / (1 + 9) = 100 Hz
  write(ACCEL_CONFIG, 0x08);  // +-4 g (taps can exceed 2 g)
  if (kind_ == Kind::Mpu6500) write(ACCEL_CONFIG2, 0x03);  // accel DLPF ~44 Hz
  write(INT_ENABLE, 0x00);
  write(INT_PIN_CFG, 0x20);  // INT active-high, push-pull, latched
  read8(INT_STATUS);
  resetMpuFifo();
  return true;
}

int Imu::readMpu(AccelSample* out, int max) {
  using namespace mpu;
  uint8_t c[2];
  if (!readBytes(FIFO_COUNTH, c, 2)) return 0;
  int count = (c[0] << 8 | c[1]) / 6;
  if (count >= 1024 / 6 - 1) {  // overflowed: drop everything and start over
    resetMpuFifo();
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
  return n;
}

void Imu::wakeMpu(uint8_t threshold, uint8_t durationMs) {
  using namespace mpu;
  write(USER_CTRL, 0x00);
  write(FIFO_EN, 0x00);
  write(INT_PIN_CFG, 0x20);  // latched until INT_STATUS is read (on wake)

  if (kind_ == Kind::Mpu6500) {
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

// ---- LIS2DH12 -----------------------------------------------------------------

bool Imu::beginLis() {
  using namespace lis;
  who_ = kWhoAmI;
  kind_ = Kind::Lis2dh12;
  write(CTRL_REG5, 0x80);  // BOOT: reload trimming, back to defaults
  delay(10);
  write(CTRL_REG1, 0x57);  // 100 Hz, normal/high-res, X Y Z on
  write(CTRL_REG2, 0x00);  // no high-pass on the data
  write(CTRL_REG3, 0x00);  // nothing on INT1 while awake
  write(CTRL_REG4, 0x98);  // BDU, +-4 g, high resolution (12-bit)
  write(CTRL_REG6, 0x00);  // INT active-high
  write(INT1_CFG, 0x00);
  read8(INT1_SRC);         // release a wake interrupt still latched from sleep
  write(CTRL_REG5, 0x40);  // FIFO on
  write(FIFO_CTRL_REG, 0x00);  // bypass (empties the FIFO) ...
  write(FIFO_CTRL_REG, 0x80);  // ... then stream mode
  return true;
}

int Imu::readLis(AccelSample* out, int max) {
  using namespace lis;
  const uint8_t src = read8(FIFO_SRC_REG);
  int count = src & 0x1F;
  if (src & 0x40) count = kFifoDepth;  // overrun: full, the oldest samples were overwritten
  if (count > max) count = max;
  int n = 0;
  uint8_t buf[120];
  while (n < count) {
    // With the FIFO on, auto-increment wraps from OUT_Z_H back to OUT_X_L, so
    // one burst reads several samples.
    const int chunk = (count - n) > 20 ? 20 : (count - n);
    if (!readBytes(OUT_X_L | kAutoIncrement, buf, chunk * 6)) break;
    for (int i = 0; i < chunk; ++i) {
      const uint8_t* p = buf + i * 6;
      out[n].x = ((int16_t)(p[1] << 8 | p[0]) / 16) * kGPerDigit;
      out[n].y = ((int16_t)(p[3] << 8 | p[2]) / 16) * kGPerDigit;
      out[n].z = ((int16_t)(p[5] << 8 | p[4]) / 16) * kGPerDigit;
      ++n;
    }
  }
  return n;
}

void Imu::wakeLis(uint8_t threshold, uint8_t durationMs) {
  using namespace lis;
  write(FIFO_CTRL_REG, 0x00);  // FIFO off
  write(CTRL_REG5, 0x08);      // latch INT1 until INT1_SRC is read (on wake)
  write(CTRL_REG1, 0x2F);      // 10 Hz, low-power mode (~3 uA), X Y Z on
  write(CTRL_REG2, 0x01);      // high-pass filter on interrupt 1: react to change, not gravity
  write(CTRL_REG3, 0x40);      // interrupt activity 1 -> INT1 pin
  write(CTRL_REG4, 0x00);      // +-2 g: 16 mg per threshold step
  // `threshold` is in MPU-6050 steps (~2 mg); convert to 16 mg steps.
  const int ths = (threshold * 2 + 8) / 16;
  write(INT1_THS, ths < 1 ? 1 : (ths > 127 ? 127 : ths));
  write(INT1_DURATION, durationMs / 100);  // in samples at 10 Hz
  read8(REFERENCE);                        // reset the high-pass filter to "now"
  write(INT1_CFG, 0x2A);                   // any axis above the threshold (OR)
  delay(150);                              // let the filter settle
  read8(INT1_SRC);                         // clear anything triggered while reconfiguring
}
