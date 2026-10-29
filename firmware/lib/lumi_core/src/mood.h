// Lumi's feelings: happiness rises with attention and falls with neglect or
// rough handling; energy drains while awake and recovers while asleep. The
// state is small enough to live in RTC memory across deep sleep.
#pragma once
#include <stdint.h>

#include "face.h"
#include "genes.h"

namespace lumi {

struct MoodState {
  uint32_t magic = 0;
  float happy = 65;   // 0..100
  float energy = 85;  // 0..100
  uint32_t pats = 0;  // lifetime pats, for fun stats
  uint32_t gamesWon = 0, gamesPlayed = 0;
};

// Traits before a unit's temperament is known: no shifts at all.
inline const TemperamentTraits& neutralTraits() {
  static const TemperamentTraits kNeutral = {65, 1.0f, 1.0f, 0, {nullptr, nullptr, nullptr, nullptr}};
  return kNeutral;
}

class Mood {
 public:
  static constexpr uint32_t kMagic = 0x4C4D4F31;  // "LMO1"

  explicit Mood(MoodState* s) : s_(s), traits_(&neutralTraits()) {
    if (s_->magic != kMagic) {
      *s_ = MoodState();
      s_->magic = kMagic;
      fresh_ = true;
    }
  }

  // A unit's temperament: a brand-new unit starts at its own happiness, and
  // it shifts how quickly Lumi tires and how easily it looks happy or sad.
  void setTemperament(Temperament t) {
    traits_ = &traits(t);
    if (fresh_) {
      s_->happy = traits_->startHappy;
      fresh_ = false;
    }
  }

  void onPat() { add(4, 0.5f); ++s_->pats; }
  void onDoublePat() { add(6, 0.5f); }
  void onPatSpam() { add(-6, 0); }
  void onShake() { add(-5, 1); }
  void onFreefall() { add(-8, 2); }
  void onGame(bool won) {
    ++s_->gamesPlayed;
    if (won) ++s_->gamesWon;
    add(won ? 10 : 3, -4);
  }

  // Awake time slowly drains energy; being ignored slowly saps happiness.
  void tickAwake(uint32_t dtMs, bool ignored) {
    const float minutes = dtMs / 60000.f;
    add(ignored ? -0.8f * minutes : 0, -0.7f * minutes * traits_->energyDrain);
  }
  // Sleeping recharges energy; long absences make Lumi a bit lonely.
  void tickAsleep(uint32_t seconds) {
    const float hours = seconds / 3600.f;
    add(-2.5f * hours, 30 * hours);
  }

  uint8_t happiness() const { return (uint8_t)(s_->happy + 0.5f); }
  uint8_t energy() const { return (uint8_t)(s_->energy + 0.5f); }
  bool lonely() const { return s_->happy < 25; }
  const MoodState& state() const { return *s_; }

  Expr restingExpression() const {
    if (s_->energy < 20) return Expr::Sleepy;
    if (s_->happy >= 80 + traits_->happyShift) return Expr::Happy;
    if (s_->happy < 30 + traits_->happyShift) return Expr::Sad;
    return Expr::Neutral;
  }

 private:
  void add(float dh, float de) {
    s_->happy = clamp(s_->happy + dh, 5, 100);
    s_->energy = clamp(s_->energy + de, 0, 100);
  }
  static float clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

  MoodState* s_;
  const TemperamentTraits* traits_;
  bool fresh_ = false;
};

}  // namespace lumi
