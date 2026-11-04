// Shipping mode's lock: decides whether a motion wake was someone asking Lumi
// to wake up, or just the parcel being handled.
//
// In shipping mode every bump wakes the chip with the screen off. The firmware
// feeds the accelerometer into a ShipLock for a few seconds: if it sees enough
// pats in that time, Lumi wakes for real; otherwise it goes straight back to
// sleep. The tap that woke the chip happens while it's booting and is never
// seen, so "tap three times" means waking it plus two more pats.
//
// A dropped parcel can hit, bounce and look like two pats, so a freefall, a
// shake or a change of orientation starts the count again: a person holds
// Lumi still and taps it, a parcel tumbles.
#pragma once
#include <stdint.h>

#include "gestures.h"

namespace lumi {

class ShipLock {
 public:
  explicit ShipLock(uint8_t taps = 2, uint32_t windowMs = 3000) : taps_(taps), windowMs_(windowMs) {}

  void begin(uint32_t nowMs);
  // Feed one accelerometer sample (screen frame, in g).
  void onAccel(float x, float y, float z, uint32_t nowMs);

  bool unlocked() const { return unlocked_; }
  bool expired(uint32_t nowMs) const { return !unlocked_ && nowMs - start_ >= windowMs_; }
  uint8_t pats() const { return pats_; }

 private:
  GestureDetector gestures_;
  uint8_t taps_;
  uint32_t windowMs_;
  uint32_t start_ = 0;
  uint8_t pats_ = 0;
  bool unlocked_ = false;
};

}  // namespace lumi
