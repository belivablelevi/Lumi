// Parametric robot face.
//
// A Face is a bag of numbers (eye size, lid positions, gaze, mouth shape...)
// that can be tweened smoothly into any other Face. Expressions are just named
// Face presets; animations (animations.h) are timed sequences of expressions.
#pragma once
#include <stdint.h>

#include "gfx.h"

namespace lumi {

enum class EyeStyle : uint8_t {
  Normal,    // rounded rectangle with lids (the default, fully parametric)
  Heart,
  Spiral,    // dizzy, rotates over time
  Cross,     // X_X
  Star,
  HappyArc,  // ^ ^
  Closed,    // sleeping arc
  Squint,    // > <
  Dot,       // tiny pupil, blank stare
  Ring,      // hollow, shocked
};

enum class Mouth : uint8_t {
  None,
  Smile,
  BigSmile,
  Flat,
  Frown,
  O,
  Cat,    // :3
  Wavy,   // nervous squiggle
  Tongue,
  Smirk,
  Teeth,  // gritted
};

// Highlight drawn in each open eye (a unit's "gene"; most expressions keep it).
enum class Shine : uint8_t { Square, None, Dot, Double, Star, Ring, Count };

// Permanent decoration around the eyes (also a gene).
enum class Accent : uint8_t { None, Lashes, Brows, Freckles, Blush, Mark, Count };

// Overlay effects drawn on top of the face. Combine with |.
enum Overlay : uint16_t {
  kFxNone = 0,
  kFxZzz = 1 << 0,
  kFxSweat = 1 << 1,
  kFxTears = 1 << 2,
  kFxBlush = 1 << 3,
  kFxSparkles = 1 << 4,
  kFxQuestion = 1 << 5,
  kFxExclaim = 1 << 6,
  kFxAnger = 1 << 7,
  kFxNotes = 1 << 8,
  kFxHearts = 1 << 9,
  kFxLowBattery = 1 << 10,
  kFxSpeedLines = 1 << 11,
};

struct Face {
  float eyeW = 28, eyeH = 34, eyeR = 10;
  float spacing = 50;     // distance between eye centres
  float eyeY = 26;        // eye centre y
  float lookX = 0, lookY = 0;
  float openL = 1, openR = 1;  // top lid: 1 open, 0 closed
  float slant = 0;        // >0 angry (inner corners drop), <0 sad (outer drop), px
  float cheek = 0;        // 0..1 bottom lid crescent (smiling eyes)
  float scaleL = 1, scaleR = 1;
  float shine = 1;        // draw the little highlight in each eye
  float mouthW = 12, mouthOpen = 0.5f, mouthY = 54;
  float offX = 0, offY = 0;
  float baseSlant = 0;    // added to slant: a unit's resting eye tilt (almond / droopy)
  EyeStyle styleL = EyeStyle::Normal, styleR = EyeStyle::Normal;
  Mouth mouth = Mouth::Smile;
  uint16_t fx = kFxNone;
  Shine shineStyle = Shine::Square;
  Accent accent = Accent::None;
};

enum class Expr : uint8_t {
  Neutral,
  Happy,
  Joy,
  Love,
  Sad,
  Cry,
  Angry,
  Furious,
  Surprised,
  Shocked,
  Sleepy,
  Asleep,
  Dizzy,
  Scared,
  Suspicious,
  Bored,
  Excited,
  Smug,
  Confused,
  Wink,
  Laugh,
  Determined,
  Worried,
  Cute,
  Dead,
  Squint,
  Blank,
  Content,
  Pout,
  Count
};

Face expression(Expr e);
const char* exprName(Expr e);

// Linear blend of every numeric field; styles/mouth switch at the midpoint.
Face lerp(const Face& a, const Face& b, float t);

// Draws the face. `timeMs` drives looping effects (spirals, floating Zzz...).
void drawFace(Canvas& c, const Face& f, uint32_t timeMs);

// Small heart glyph, also used by the UI.
void drawHeart(Canvas& c, int cx, int cy, int size, bool on = true);

}  // namespace lumi
