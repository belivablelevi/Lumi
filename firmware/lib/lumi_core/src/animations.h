// Animation library: timed sequences of expressions.
//
// Each Animation is tagged with the Trigger that can start it and a mood range
// (happiness 0..100) in which it is eligible, so the same pat can earn a giggle
// from a cheerful Lumi and a grudging smile from a grumpy one. Adding a new
// animation is a matter of appending a Key list and a table row in
// animations.cpp - no other code changes needed.
#pragma once
#include <stdint.h>

#include "face.h"

namespace lumi {

enum class Motion : uint8_t { None, Shake, Bounce, Wobble, Tremble, Hop };

enum class Trigger : uint8_t {
  Idle,
  Pat,
  DoublePat,
  PatSpam,
  Shake,
  Pickup,
  PutDown,
  TiltLeft,
  TiltRight,
  UpsideDown,
  Freefall,
  Wake,
  Sleep,
  Lonely,
  LowBattery,
  PongSearching,
  PongFound,
  PongPointWon,
  PongPointLost,  // the ball got past our paddle
  PongWinMatch,
  PongLoseMatch,
  Boot,
  Update,
  Count
};

constexpr int8_t kKeep = -1;  // "use the expression's own value" for overrides

struct Key {
  Expr expr;
  int8_t lookX, lookY;
  Motion motion;
  uint16_t tweenMs;  // time to blend into this key
  uint16_t holdMs;   // time to stay once there
  uint16_t fx;       // overlays added to the expression's own
  int8_t eyes;       // EyeStyle override or kKeep
  int8_t mouth;      // Mouth override or kKeep
  const Face* face;  // custom face from an emotion pack; nullptr = use expr
};

struct Animation {
  const char* name;
  Trigger trigger;
  uint8_t moodMin, moodMax;  // eligible happiness range, inclusive
  const Key* keys;
  uint8_t count;
  uint8_t weight;  // relative chance among animations for the same trigger
};

class Pack;

// Built-in animations come first, then those of the registered packs
// (slot 0: the pack built into the firmware, slot 1: this unit's own pack).
int animationCount();
int builtinAnimationCount();
const Animation& animation(int index);
int findAnimation(const char* name);  // -1 if missing
void registerPack(int slot, const Pack* pack);  // nullptr unregisters
uint32_t animationDuration(const Animation& a);
const char* triggerName(Trigger t);

// Resolves a key into a concrete face (expression + overrides).
Face keyFace(const Key& k);

}  // namespace lumi
