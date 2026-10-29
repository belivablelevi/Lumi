// Turns raw accelerometer samples into the gestures Lumi reacts to.
//
// Axes are in the *screen* frame (see config.h for the IMU remap):
//   +X  towards the right edge of the screen
//   +Y  towards the top edge (the keyring)
//   +Z  out of the screen, towards the viewer
// At rest the sensor reads +1 g "up", so hanging from the keyring gives
// a = (0, +1, 0) and lying face-up on a desk gives a = (0, 0, +1).
#pragma once
#include <stdint.h>

namespace lumi {

enum class Gesture : uint8_t {
  None,
  Pat,        // short sharp tap anywhere on the shell
  DoublePat,  // two pats in quick succession
  PatSpam,    // lots of pats in a few seconds
  Shake,
  Pickup,     // was resting, now moving
  PutDown,    // was moving, now resting
  Freefall,
  Orientation,  // orientation changed; read orientation()
};

enum class Orientation : uint8_t { Unknown, Upright, UpsideDown, TiltLeft, TiltRight, FaceUp, FaceDown };

struct GestureEvent {
  Gesture gesture = Gesture::None;
  uint32_t timeMs = 0;  // when it physically happened (tap peak), not when detected
  Orientation orientation = Orientation::Unknown;
};

struct GestureConfig {
  float tapThreshold = 0.45f;     // g, high-passed magnitude
  uint16_t tapMaxMs = 60;         // longer bursts are movement, not taps
  uint16_t tapRefractoryMs = 90;
  uint16_t doubleTapMs = 400;
  uint8_t spamCount = 6;
  uint16_t spamWindowMs = 4000;
  float shakeThreshold = 1.1f;    // g
  uint8_t shakeBursts = 4;
  uint16_t shakeWindowMs = 1000;
  float freefallG = 0.35f;
  uint16_t freefallMs = 60;
  float stillActivity = 0.035f;   // g
  uint16_t stillMs = 1500;
  uint16_t pickupAfterStillMs = 2000;
  float pickupActivity = 0.10f;
  uint16_t orientationHoldMs = 250;
};

class GestureDetector {
 public:
  explicit GestureDetector(const GestureConfig& cfg = GestureConfig()) : cfg_(cfg) {}

  void reset(uint32_t nowMs);

  // Feed one sample; returns the number of events written (at most `max`).
  int update(float ax, float ay, float az, uint32_t nowMs, GestureEvent* out, int max);

  Orientation orientation() const { return orient_; }
  bool still() const { return still_; }
  uint32_t stillForMs(uint32_t nowMs) const { return still_ ? nowMs - stillSince_ : 0; }
  uint32_t lastMotionMs() const { return lastMotion_; }
  float activity() const { return activity_; }
  // Low-passed gravity direction (unit-ish vector).
  float gx() const { return gx_; }
  float gy() const { return gy_; }
  float gz() const { return gz_; }

  static const char* name(Gesture g);
  static const char* name(Orientation o);

 private:
  Orientation classify() const;

  GestureConfig cfg_;
  bool primed_ = false;
  uint32_t last_ = 0;
  float gx_ = 0, gy_ = 1, gz_ = 0;
  float activity_ = 0;

  // Burst tracking (a burst is a run of samples above tapThreshold).
  bool inBurst_ = false;
  uint32_t burstStart_ = 0, burstPeakT_ = 0, burstEnd_ = 0;
  float burstPeak_ = 0;
  uint32_t lastTap_ = 0;
  bool haveTap_ = false;
  uint32_t taps_[8] = {0};
  uint8_t tapCount_ = 0;
  uint32_t shakeBursts_[8] = {0};
  uint8_t shakeCount_ = 0;
  uint32_t lastShake_ = 0;
  bool haveShake_ = false;

  uint32_t lowGStart_ = 0;
  bool lowG_ = false;
  uint32_t lastFreefall_ = 0;
  bool haveFreefall_ = false;

  bool still_ = false;
  uint32_t stillSince_ = 0, quietSince_ = 0, movingSince_ = 0;
  bool quiet_ = false;
  uint32_t lastMotion_ = 0;

  Orientation orient_ = Orientation::Unknown;
  Orientation candidate_ = Orientation::Unknown;
  uint32_t candidateSince_ = 0;
};

}  // namespace lumi
