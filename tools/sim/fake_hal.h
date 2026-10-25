// In-memory Hal for the desktop simulator and tests: a virtual clock, a
// virtual battery and a radio that delivers to other FakeHals on the same
// FakeAir.
#pragma once
#include <math.h>
#include <string.h>

#include <deque>
#include <vector>

#include "app.h"

namespace lumi {
namespace sim {

struct FakeAir;

class FakeHal : public Hal {
 public:
  uint32_t now = 0;
  uint16_t mv = 3950;
  bool usb = false;
  uint8_t mac[6] = {0x24, 0x0A, 0xC4, 0x12, 0x34, 0x56};
  uint32_t rng = 0xC0FFEEu;
  uint8_t contrast = 255;
  bool radioOn = false, updateOn = false;
  int progress = -1;
  FakeAir* air = nullptr;
  App* app = nullptr;  // receiver for packets

  uint32_t millis() override { return now; }
  uint32_t random32() override {
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return rng;
  }
  uint16_t batteryMv() override { return mv; }
  bool usbPowered() override { return usb; }
  void macAddress(uint8_t out[6]) override { memcpy(out, mac, 6); }
  void setContrast(uint8_t level) override { contrast = level; }
  bool radioStart() override { return radioOn = true; }
  void radioStop() override { radioOn = false; }
  void radioSend(const battle::Packet& p) override;
  bool updateStart() override { return updateOn = true; }
  void updateStop() override { updateOn = false; }
  const char* updateSsid() override { return "Lumi-3456"; }
  const char* updatePassword() override { return "lumi1234"; }
  const char* updateAddress() override { return "192.168.4.1"; }
  int updateProgress() override { return progress; }
};

struct FakeAir {
  struct Frame {
    uint32_t at;
    FakeHal* to;
    battle::Packet p;
  };
  std::vector<FakeHal*> hals;
  std::deque<Frame> frames;
  uint32_t latency = 4;

  void deliver(uint32_t now) {
    while (!frames.empty() && frames.front().at <= now) {
      Frame f = frames.front();
      frames.pop_front();
      if (f.to->radioOn && f.to->app) f.to->app->onPacket(f.p);
    }
  }
};

inline void FakeHal::radioSend(const battle::Packet& p) {
  if (!air) return;
  for (FakeHal* h : air->hals)
    if (h != this) air->frames.push_back({now + air->latency, h, p});
}

// Drives an App with synthetic accelerometer data at 100 Hz.
class Driver {
 public:
  Driver(App& app, FakeHal& hal) : app_(app), hal_(hal) {}

  // Gravity vector the device currently feels (screen frame, in g).
  float gx = 0, gy = 1, gz = 0;
  // Called after every 10 ms step, e.g. to record frames.
  void (*onTick)(void* ctx, uint32_t now) = nullptr;
  void* ctx = nullptr;

  // One 10 ms step: one IMU sample, a frame update every 30 ms.
  void step() {
    float x = gx, y = gy, z = gz;
    if (patPhase_ == 2) {
      z -= 1.4f;
      patPhase_ = 1;
    } else if (patPhase_ == 1) {
      z += 0.5f;
      patPhase_ = 0;
    }
    if (shakeLeft_ > 0) {
      x += 2.0f * sinf(shakeLeft_ * 0.001f * 2 * 3.14159f * 5);
      shakeLeft_ = shakeLeft_ > 10 ? shakeLeft_ - 10 : 0;
    }
    noise_ = noise_ * 1103515245u + 12345u;
    const float n = ((noise_ >> 16) % 2001 / 1000.f - 1.f) * 0.004f;
    app_.onAccel(x + n, y - n, z + n, hal_.now);
    if (hal_.now % 30 == 0) app_.update();
    if (onTick) onTick(ctx, hal_.now);
    hal_.now += 10;
  }
  void run(uint32_t ms) {
    for (uint32_t e = 0; e < ms; e += 10) step();
  }
  void queuePat() { patPhase_ = 2; }
  void pat() {
    queuePat();
    step();
    step();
  }
  void shake(uint32_t ms) {
    shakeLeft_ = ms;
    while (shakeLeft_ > 0) step();
  }
  void orient(float x, float y, float z) {
    gx = x;
    gy = y;
    gz = z;
  }

 private:
  App& app_;
  FakeHal& hal_;
  uint32_t noise_ = 99;
  int patPhase_ = 0;
  uint32_t shakeLeft_ = 0;
};

}  // namespace sim
}  // namespace lumi
