#include "animator.h"

#include <math.h>

namespace lumi {

namespace {

constexpr uint32_t kRestBlendMs = 300;
constexpr uint32_t kBlinkMs = 150;

inline float smooth(float t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

}  // namespace

void Animator::begin(uint32_t nowMs, uint32_t seed) {
  rng_.reseed(seed);
  now_ = nowMs;
  anim_ = -1;
  from_ = blended_ = out_ = expression(base_);
  restStart_ = nowMs;
  scheduleBlink();
  scheduleIdle();
  nextDart_ = nowMs + 1000;
}

void Animator::setBase(Expr e) {
  if (e == base_) return;
  base_ = e;
  if (anim_ < 0) {
    from_ = blended_;
    restStart_ = now_;
  }
}

int Animator::play(Trigger t, uint8_t mood) {
  int eligible[96];
  int n = 0;
  for (int pass = 0; pass < 2 && n == 0; ++pass) {
    for (int i = 0; i < animationCount() && n < 96; ++i) {
      const Animation& a = animation(i);
      if (a.trigger != t) continue;
      // Second pass ignores mood so a trigger always gets *some* reaction.
      if (pass == 0 && (mood < a.moodMin || mood > a.moodMax)) continue;
      eligible[n++] = i;
    }
  }
  if (n == 0) return -1;
  // Avoid repeating the animation that is already playing when possible.
  if (n > 1) {
    int m = 0;
    for (int j = 0; j < n; ++j)
      if (eligible[j] != anim_) eligible[m++] = eligible[j];
    n = m;
  }
  // Weighted pick: pack animations carry a weight, favourites count 3x.
  int total = 0;
  for (int j = 0; j < n; ++j) total += weightOf(eligible[j]);
  int r = rng_.range(0, total - 1);
  int pick = eligible[n - 1];
  for (int j = 0; j < n; ++j) {
    r -= weightOf(eligible[j]);
    if (r < 0) {
      pick = eligible[j];
      break;
    }
  }
  playIndex(pick);
  return pick;
}

int Animator::weightOf(int index) const {
  int w = animation(index).weight;
  for (int i = 0; i < favouriteCount_; ++i)
    if (favourites_[i] == index) w *= 3;
  return w > 0 ? w : 1;
}

void Animator::setFavourites(const int* indices, int count) {
  favouriteCount_ = 0;
  for (int i = 0; i < count && favouriteCount_ < kMaxFavourites; ++i)
    if (indices[i] >= 0) favourites_[favouriteCount_++] = indices[i];
}

void Animator::playIndex(int index) {
  if (index < 0 || index >= animationCount()) return;
  from_ = blended_;
  anim_ = index;
  key_ = 0;
  keyStart_ = now_;
}

void Animator::stop() {
  if (anim_ < 0) return;
  anim_ = -1;
  from_ = blended_;
  restStart_ = now_;
  scheduleIdle();
}

Face Animator::target() const {
  if (anim_ >= 0) return keyFace(animation(anim_).keys[key_]);
  return expression(base_);
}

void Animator::scheduleBlink() { nextBlink_ = now_ + rng_.range(2200, 6000); }

void Animator::scheduleIdle() {
  nextIdle_ = now_ + (uint32_t)(rng_.range(3500, 9000) * idleScale_);
}

void Animator::update(uint32_t nowMs) {
  const uint32_t dt = nowMs - now_;
  now_ = nowMs;

  // Advance through keys, carrying over leftover time.
  while (anim_ >= 0) {
    const Animation& a = animation(anim_);
    const Key& k = a.keys[key_];
    const uint32_t len = (uint32_t)k.tweenMs + k.holdMs;
    if (now_ - keyStart_ < len) break;
    from_ = keyFace(k);
    keyStart_ += len;
    if (++key_ >= a.count) {
      anim_ = -1;
      restStart_ = keyStart_;
      scheduleIdle();
    }
  }

  Motion motion = Motion::None;
  if (anim_ >= 0) {
    const Key& k = animation(anim_).keys[key_];
    const float t = k.tweenMs ? (float)(now_ - keyStart_) / k.tweenMs : 1.f;
    blended_ = lerp(from_, keyFace(k), smooth(t));
    motion = k.motion;
  } else {
    blended_ = lerp(from_, expression(base_), smooth((float)(now_ - restStart_) / kRestBlendMs));
    if (idleEnabled_ && (int32_t)(now_ - nextIdle_) >= 0) {
      play(Trigger::Idle, mood_);
      scheduleIdle();
    }
  }

  out_ = blended_;

  // Motion layer.
  const float te = (float)(now_ - keyStart_);
  switch (motion) {
    case Motion::None:
      break;
    case Motion::Shake:
      out_.offX += 4 * sinf(te * 0.09f);
      break;
    case Motion::Bounce:
      out_.offY -= fabsf(sinf(te * 0.011f)) * 5;
      break;
    case Motion::Wobble:
      out_.offX += 3 * sinf(te * 0.012f);
      break;
    case Motion::Tremble:
      out_.offX += rng_.range(-1, 1);
      out_.offY += rng_.range(-1, 0);
      break;
    case Motion::Hop:
      out_.offY -= fabsf(sinf(te * 0.018f)) * 3;
      break;
  }
  if (anim_ < 0) out_.offY += 0.8f * sinf(now_ * 0.0025f);  // breathing

  // Eye darts while resting; they fade out during animations.
  if (anim_ < 0 && (int32_t)(now_ - nextDart_) >= 0) {
    if (rng_.range(0, 3) == 0) {
      dartTX_ = dartTY_ = 0;
    } else {
      dartTX_ = (float)rng_.range(-6, 6);
      dartTY_ = (float)rng_.range(-3, 3);
    }
    nextDart_ = now_ + rng_.range(1200, 3500);
  }
  if (anim_ >= 0) dartTX_ = dartTY_ = 0;
  const float follow = 1 - expf(-(float)dt / 45.f);
  dartX_ += (dartTX_ - dartX_) * follow;
  dartY_ += (dartTY_ - dartY_) * follow;
  out_.lookX += dartX_ + gazeX_;
  out_.lookY += dartY_ + gazeY_;

  // Blink layer (only meaningful for the parametric eye style).
  if ((int32_t)(now_ - nextBlink_) >= 0) {
    blinkStart_ = now_;
    doubleBlink_ = rng_.range(0, 4) == 0;
    scheduleBlink();
  }
  float p = (float)(now_ - blinkStart_) / kBlinkMs;
  if (doubleBlink_ && p >= 1.3f && p < 2.3f) p -= 1.3f;
  if (p >= 0 && p < 1 && out_.styleL == EyeStyle::Normal && out_.styleR == EyeStyle::Normal) {
    const float closed = 1 - fabsf(2 * p - 1);
    out_.openL *= 1 - closed;
    out_.openR *= 1 - closed;
  }
}

}  // namespace lumi
