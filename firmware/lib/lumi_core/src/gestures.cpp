#include "gestures.h"

#include <math.h>

namespace lumi {

namespace {

// Counts timestamps in `ring` (size 8) that are within `window` of `now`.
int countRecent(const uint32_t* ring, uint8_t count, uint32_t now, uint32_t window) {
  int n = 0;
  for (int i = 0; i < count && i < 8; ++i)
    if (now - ring[i] <= window) ++n;
  return n;
}

void pushRing(uint32_t* ring, uint8_t& count, uint32_t t) {
  // Keep the newest 8 entries, newest first.
  for (int i = 7; i > 0; --i) ring[i] = ring[i - 1];
  ring[0] = t;
  if (count < 8) ++count;
}

}  // namespace

void GestureDetector::reset(uint32_t nowMs) {
  const GestureConfig cfg = cfg_;
  *this = GestureDetector(cfg);
  last_ = nowMs;
}

Orientation GestureDetector::classify() const {
  const float len = sqrtf(gx_ * gx_ + gy_ * gy_ + gz_ * gz_);
  if (len < 0.5f) return orient_;
  const float x = gx_ / len, y = gy_ / len, z = gz_ / len;
  if (z > 0.8f) return Orientation::FaceUp;
  if (z < -0.8f) return Orientation::FaceDown;
  if (y > 0.55f && fabsf(x) < 0.5f) return Orientation::Upright;
  if (y < -0.55f && fabsf(x) < 0.5f) return Orientation::UpsideDown;
  // "Up" points away from the low edge: right side down -> up leans left (-x).
  if (x < -0.6f) return Orientation::TiltRight;
  if (x > 0.6f) return Orientation::TiltLeft;
  return orient_;  // in-between: keep the previous answer (hysteresis)
}

int GestureDetector::update(float ax, float ay, float az, uint32_t now, GestureEvent* out,
                            int max) {
  int n = 0;
  auto emit = [&](Gesture g, uint32_t t) {
    if (n < max) {
      out[n].gesture = g;
      out[n].timeMs = t;
      out[n].orientation = orient_;
      ++n;
    }
  };

  if (!primed_) {
    primed_ = true;
    gx_ = ax;
    gy_ = ay;
    gz_ = az;
    last_ = now;
    quietSince_ = movingSince_ = now;
    orient_ = candidate_ = classify();
    candidateSince_ = now;
    return 0;
  }

  uint32_t dt = now - last_;
  if (dt < 1) dt = 1;
  if (dt > 100) dt = 100;
  last_ = now;

  const float a = 1 - expf(-(float)dt / 150.f);
  gx_ += (ax - gx_) * a;
  gy_ += (ay - gy_) * a;
  gz_ += (az - gz_) * a;
  const float hx = ax - gx_, hy = ay - gy_, hz = az - gz_;
  const float mag = sqrtf(hx * hx + hy * hy + hz * hz);
  const float total = sqrtf(ax * ax + ay * ay + az * az);
  activity_ += (mag - activity_) * (1 - expf(-(float)dt / 300.f));
  if (activity_ > cfg_.stillActivity * 2) lastMotion_ = now;

  // --- taps and shakes -----------------------------------------------------
  if (mag > cfg_.tapThreshold) {
    if (!inBurst_) {
      inBurst_ = true;
      burstStart_ = now;
      burstPeak_ = 0;
    }
    if (mag > burstPeak_) {
      burstPeak_ = mag;
      burstPeakT_ = now;
    }
  } else if (inBurst_ && mag < cfg_.tapThreshold * 0.6f) {
    inBurst_ = false;
    burstEnd_ = now;
    lastMotion_ = now;
    const uint32_t dur = now - burstStart_;

    if (burstPeak_ >= cfg_.shakeThreshold) {
      pushRing(shakeBursts_, shakeCount_, burstPeakT_);
      if (countRecent(shakeBursts_, shakeCount_, now, cfg_.shakeWindowMs) >= cfg_.shakeBursts &&
          (!haveShake_ || now - lastShake_ > 1200)) {
        emit(Gesture::Shake, now);
        haveShake_ = true;
        lastShake_ = now;
        shakeCount_ = 0;
      }
    }

    const bool shaking = haveShake_ && now - lastShake_ < 700;
    const bool refractory = haveTap_ && burstPeakT_ - lastTap_ < cfg_.tapRefractoryMs;
    if (dur <= cfg_.tapMaxMs && !shaking && !refractory) {
      emit(Gesture::Pat, burstPeakT_);
      if (haveTap_ && burstPeakT_ - lastTap_ <= cfg_.doubleTapMs) emit(Gesture::DoublePat, burstPeakT_);
      lastTap_ = burstPeakT_;
      haveTap_ = true;
      pushRing(taps_, tapCount_, burstPeakT_);
      if (countRecent(taps_, tapCount_, now, cfg_.spamWindowMs) >= cfg_.spamCount) {
        emit(Gesture::PatSpam, burstPeakT_);
        tapCount_ = 0;
      }
    }
  }

  // --- freefall ------------------------------------------------------------
  if (total < cfg_.freefallG) {
    if (!lowG_) {
      lowG_ = true;
      lowGStart_ = now;
    }
    if (now - lowGStart_ >= cfg_.freefallMs && (!haveFreefall_ || now - lastFreefall_ > 1000)) {
      emit(Gesture::Freefall, lowGStart_);
      haveFreefall_ = true;
      lastFreefall_ = now;
    }
  } else {
    lowG_ = false;
  }

  // --- resting / picked up -------------------------------------------------
  if (activity_ < cfg_.stillActivity) {
    if (!quiet_) {
      quiet_ = true;
      quietSince_ = now;
    }
    if (!still_ && now - quietSince_ >= cfg_.stillMs) {
      still_ = true;
      stillSince_ = quietSince_;
      emit(Gesture::PutDown, now);
    }
  } else {
    quiet_ = false;
    if (activity_ > cfg_.pickupActivity && still_) {
      const uint32_t restedFor = now - stillSince_;
      still_ = false;
      movingSince_ = now;
      if (restedFor >= cfg_.pickupAfterStillMs) emit(Gesture::Pickup, now);
    }
  }

  // --- orientation ---------------------------------------------------------
  const Orientation c = classify();
  if (c != candidate_) {
    candidate_ = c;
    candidateSince_ = now;
  } else if (c != orient_ && now - candidateSince_ >= cfg_.orientationHoldMs) {
    orient_ = c;
    emit(Gesture::Orientation, now);
  }

  return n;
}

const char* GestureDetector::name(Gesture g) {
  switch (g) {
    case Gesture::None: return "none";
    case Gesture::Pat: return "pat";
    case Gesture::DoublePat: return "double_pat";
    case Gesture::PatSpam: return "pat_spam";
    case Gesture::Shake: return "shake";
    case Gesture::Pickup: return "pickup";
    case Gesture::PutDown: return "put_down";
    case Gesture::Freefall: return "freefall";
    case Gesture::Orientation: return "orientation";
  }
  return "?";
}

const char* GestureDetector::name(Orientation o) {
  switch (o) {
    case Orientation::Unknown: return "unknown";
    case Orientation::Upright: return "upright";
    case Orientation::UpsideDown: return "upside_down";
    case Orientation::TiltLeft: return "tilt_left";
    case Orientation::TiltRight: return "tilt_right";
    case Orientation::FaceUp: return "face_up";
    case Orientation::FaceDown: return "face_down";
  }
  return "?";
}

}  // namespace lumi
