// Checks firmware/src/imu.cpp against register models of the LIS2DH12 and
// MPU-6050: detection, 100 Hz FIFO reads, units, and the wake-on-motion setup.
#include <math.h>
#include <stdio.h>

#include <deque>

#include "imu.h"

static int failures = 0, checks = 0;
#define CHECK(c)                                          \
  do {                                                    \
    ++checks;                                             \
    if (!(c)) {                                           \
      printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); \
      ++failures;                                         \
    }                                                     \
  } while (0)
#define NEAR(a, b) (fabsf((a) - (b)) < 0.01f)

// LIS2DH12 register model (datasheet DocID025056): FIFO of 32 samples,
// auto-increment with the address MSB, OUT_X_L..OUT_Z_H wrap when the FIFO is on.
struct Lis2dh12 : FakeDevice {
  uint8_t regs[0x40] = {};
  std::deque<int16_t> fifo;  // x, y, z triples, raw left-justified
  bool overrun = false;
  int pops = 0;

  Lis2dh12() { regs[0x0F] = 0x33; }
  void push(float x, float y, float z) {
    // +-4 g high-res: 2 mg/digit, 12-bit left-justified.
    for (float g : {x, y, z}) fifo.push_back((int16_t)(lroundf(g / 0.002f) * 16));
    while (fifo.size() > 32 * 3) {
      fifo.pop_front();
      overrun = true;
    }
  }
  void writeReg(uint8_t reg, uint8_t v) override {
    if (reg == 0x2E && (v >> 6) == 0) {  // bypass: FIFO emptied
      fifo.clear();
      overrun = false;
    }
    if (reg == 0x24 && (v & 0x80)) {  // BOOT
      for (int r = 0x20; r < 0x40; ++r) regs[r] = 0;
      return;
    }
    regs[reg & 0x3F] = v;
  }
  std::vector<uint8_t> readRegs(uint8_t reg, size_t n) override {
    std::vector<uint8_t> out;
    const bool inc = reg & 0x80;
    uint8_t r = reg & 0x7F;
    int16_t cur[3] = {0, 0, 0};
    for (size_t i = 0; i < n; ++i) {
      if (r >= 0x28 && r <= 0x2D) {
        if (r == 0x28) {  // start of a sample: pop it from the FIFO
          for (int k = 0; k < 3; ++k) {
            cur[k] = fifo.empty() ? 0 : fifo.front();
            if (!fifo.empty()) fifo.pop_front();
          }
          ++pops;
        }
        const int16_t v = cur[(r - 0x28) / 2];
        out.push_back((r - 0x28) % 2 ? (uint8_t)(v >> 8) : (uint8_t)v);
      } else if (r == 0x2F) {
        const int samples = (int)fifo.size() / 3;
        out.push_back((uint8_t)((overrun ? 0x40 : 0) | (samples >= 32 ? 31 : samples) | (samples == 0 ? 0x20 : 0)));
      } else if (r == 0x31) {
        out.push_back(regs[0x31]);
        regs[0x31] = 0;  // reading INT1_SRC clears the latch
      } else {
        out.push_back(regs[r]);
      }
      if (inc) r = (r == 0x2D && (regs[0x24] & 0x40)) ? 0x28 : (uint8_t)(r + 1);
    }
    return out;
  }
};

// Minimal MPU-6050: WHO_AM_I 0x68, FIFO of big-endian samples.
struct Mpu6050 : FakeDevice {
  uint8_t regs[0x80] = {};
  std::deque<uint8_t> fifo;
  Mpu6050() { regs[0x75] = 0x68; }
  void push(float x, float y, float z) {
    for (float g : {x, y, z}) {
      const int16_t v = (int16_t)lroundf(g * 8192.f);
      fifo.push_back((uint8_t)(v >> 8));
      fifo.push_back((uint8_t)v);
    }
  }
  void writeReg(uint8_t reg, uint8_t v) override {
    if (reg == 0x6A && (v & 0x04)) fifo.clear();
    regs[reg] = v;
  }
  std::vector<uint8_t> readRegs(uint8_t reg, size_t n) override {
    std::vector<uint8_t> out;
    if (reg == 0x72) return {(uint8_t)(fifo.size() >> 8), (uint8_t)fifo.size()};
    for (size_t i = 0; i < n; ++i) {
      if (reg == 0x74) {
        out.push_back(fifo.empty() ? 0 : fifo.front());
        if (!fifo.empty()) fifo.pop_front();
      } else {
        out.push_back(regs[(reg + i) & 0x7F]);
      }
    }
    return out;
  }
};

static void testLis(uint8_t addr) {
  TwoWire wire;
  Lis2dh12 chip;
  wire.devices[addr] = &chip;
  Imu imu;
  CHECK(imu.begin(wire, 0x68));
  CHECK(imu.kind() == Imu::Kind::Lis2dh12);
  CHECK(imu.address() == addr);
  CHECK(chip.regs[0x20] == 0x57);         // 100 Hz, X Y Z
  CHECK(chip.regs[0x23] == 0x98);         // BDU, +-4 g, high-res
  CHECK((chip.regs[0x24] & 0x40) != 0);   // FIFO on
  CHECK((chip.regs[0x2E] >> 6) == 2);     // stream mode

  // 25 samples (250 ms) of Lumi hanging from its keyring, with a 1.5 g tap.
  for (int i = 0; i < 25; ++i) chip.push(0.01f, i == 20 ? 1.5f : 1.0f, -0.02f);
  AccelSample s[64];
  const int n = imu.read(s, 64, 1000);
  CHECK(n == 25);
  CHECK(NEAR(s[0].y, 1.0f) && NEAR(s[0].x, 0.01f) && NEAR(s[0].z, -0.02f));
  CHECK(NEAR(s[20].y, 1.5f));
  CHECK(s[24].t == 1000 && s[0].t == 1000 - 240);  // 10 ms apart, newest = now
  CHECK(imu.read(s, 64, 1033) == 0);               // drained

  // Negative values and the +-4 g extremes survive the 12-bit conversion.
  chip.push(-3.9f, 0.5f, -1.0f);
  CHECK(imu.read(s, 64, 1100) == 1 && NEAR(s[0].x, -3.9f) && NEAR(s[0].z, -1.0f));

  // Overrun: only the newest 32 are there, and they're all read.
  for (int i = 0; i < 40; ++i) chip.push(0, (float)i / 100.f, 0);
  CHECK(imu.read(s, 64, 2000) == 32);
  CHECK(NEAR(s[31].y, 0.39f) && NEAR(s[0].y, 0.08f));

  // Wake-on-motion before deep sleep.
  chip.regs[0x31] = 0x6A;  // pretend something is latched
  imu.enterMotionWake(40, 2);
  CHECK(chip.regs[0x20] == 0x2F);          // 10 Hz low-power
  CHECK(chip.regs[0x21] == 0x01);          // high-pass on interrupt 1
  CHECK(chip.regs[0x22] == 0x40);          // IA1 -> INT1
  CHECK(chip.regs[0x23] == 0x00);          // +-2 g
  CHECK(chip.regs[0x24] == 0x08);          // latched, FIFO off
  CHECK(chip.regs[0x32] == 5);             // 40 * 2 mg = 80 mg = 5 * 16 mg
  CHECK(chip.regs[0x30] == 0x2A);          // XH | YH | ZH
  CHECK(chip.regs[0x31] == 0);             // latch cleared before sleeping

  // Waking up again: begin() releases a latched interrupt.
  chip.regs[0x31] = 0x6A;
  CHECK(imu.begin(wire, 0x68));
  CHECK(chip.regs[0x31] == 0);
}

static void testMpuStillWorks() {
  TwoWire wire;
  Mpu6050 chip;
  wire.devices[0x68] = &chip;
  Imu imu;
  CHECK(imu.begin(wire, 0x68));
  CHECK(imu.kind() == Imu::Kind::Mpu6050);
  for (int i = 0; i < 10; ++i) chip.push(0, 1, 0);
  AccelSample s[64];
  CHECK(imu.read(s, 64, 500) == 10 && NEAR(s[3].y, 1.0f) && s[9].t == 500);
}

static void testNothingFitted() {
  TwoWire wire;
  Imu imu;
  CHECK(!imu.begin(wire, 0x68));
  CHECK(imu.kind() == Imu::Kind::None);
  AccelSample s[4];
  CHECK(imu.read(s, 4, 0) == 0);
}

int main() {
  testLis(0x19);
  testLis(0x18);
  testMpuStillWorks();
  testNothingFitted();
  printf("imu: %d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
