// Plays animations on top of a mood-driven resting face, and layers the small
// "alive" details over everything: blinking, eye darts, breathing and motion
// (shake / bounce / tremble) offsets.
#pragma once
#include <stdint.h>

#include "animations.h"
#include "face.h"
#include "rng.h"

namespace lumi {

class Animator {
 public:
  void begin(uint32_t nowMs, uint32_t seed);

  // Resting expression used whenever no animation is playing.
  void setBase(Expr e);
  Expr base() const { return base_; }

  // Continuous gaze bias (e.g. eyes rolling toward the low side when tilted).
  void setGaze(float x, float y) {
    gazeX_ = x;
    gazeY_ = y;
  }

  // Picks a random animation for `t` that fits `mood`. Returns its index or -1.
  int play(Trigger t, uint8_t mood);
  void playIndex(int index);
  void stop();

  bool busy() const { return anim_ >= 0; }
  int current() const { return anim_; }

  // Idle animations fire every few seconds while nothing else plays.
  void setIdleEnabled(bool on) { idleEnabled_ = on; }
  void setMood(uint8_t mood) { mood_ = mood; }

  // Personality: favourite animations are picked 3x as often, and the gap
  // between idle animations is scaled (hyper Lumis fidget more).
  static constexpr int kMaxFavourites = 8;
  void setFavourites(const int* indices, int count);
  void setIdleScale(float scale) { idleScale_ = scale > 0.1f ? scale : 0.1f; }

  void update(uint32_t nowMs);
  const Face& face() const { return out_; }
  uint32_t now() const { return now_; }

 private:
  Face target() const;
  void scheduleBlink();
  void scheduleIdle();

  Rng rng_;
  Expr base_ = Expr::Neutral;
  uint8_t mood_ = 60;
  bool idleEnabled_ = true;
  int favourites_[kMaxFavourites] = {0};
  int favouriteCount_ = 0;
  float idleScale_ = 1;
  int weightOf(int index) const;
  float gazeX_ = 0, gazeY_ = 0;

  int anim_ = -1;
  int key_ = 0;
  uint32_t keyStart_ = 0;
  Face from_;       // face at the start of the current blend
  Face blended_;    // face before the "alive" layers
  Face out_;

  uint32_t now_ = 0;
  uint32_t restStart_ = 0;
  uint32_t nextBlink_ = 0, blinkStart_ = 0;
  bool doubleBlink_ = false;
  uint32_t nextIdle_ = 0;
  uint32_t nextDart_ = 0;
  float dartX_ = 0, dartY_ = 0, dartTX_ = 0, dartTY_ = 0;
};

}  // namespace lumi
