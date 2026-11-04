#include "shiplock.h"

namespace lumi {

void ShipLock::begin(uint32_t nowMs) {
  gestures_.reset(nowMs);
  start_ = nowMs;
  pats_ = 0;
  unlocked_ = false;
}

void ShipLock::onAccel(float x, float y, float z, uint32_t nowMs) {
  if (unlocked_ || nowMs - start_ >= windowMs_) return;
  GestureEvent ev[4];
  const int n = gestures_.update(x, y, z, nowMs, ev, 4);
  for (int i = 0; i < n; ++i) {
    switch (ev[i].gesture) {
      case Gesture::Pat:  // DoublePat comes as an extra event with the second Pat, so only Pat counts
        if (++pats_ >= taps_) unlocked_ = true;
        break;
      case Gesture::Freefall:
      case Gesture::Shake:
      case Gesture::Orientation:
        pats_ = 0;
        break;
      default:
        break;
    }
  }
}

}  // namespace lumi
