#include "animations.h"

#include <string.h>

namespace lumi {

namespace {

#define K(e, lx, ly, m, tw, hd) {Expr::e, lx, ly, Motion::m, tw, hd, 0, kKeep, kKeep}
#define KF(e, lx, ly, m, tw, hd, fx) {Expr::e, lx, ly, Motion::m, tw, hd, fx, kKeep, kKeep}
#define KO(e, lx, ly, m, tw, hd, fx, eyes, mouth) \
  {Expr::e, lx, ly, Motion::m, tw, hd, fx, (int8_t)(eyes), (int8_t)(mouth)}

constexpr int8_t kClosed = (int8_t)EyeStyle::Closed;
constexpr int8_t kArc = (int8_t)EyeStyle::HappyArc;
constexpr int8_t kMouthO = (int8_t)Mouth::O;
constexpr int8_t kMouthCat = (int8_t)Mouth::Cat;

// ---- idle -----------------------------------------------------------------
const Key kLookLeft[] = {K(Neutral, -16, 0, None, 180, 900), K(Neutral, 0, 0, None, 180, 100)};
const Key kLookRight[] = {K(Neutral, 16, 0, None, 180, 900), K(Neutral, 0, 0, None, 180, 100)};
const Key kLookUp[] = {K(Neutral, 3, -7, None, 200, 900), K(Neutral, 0, 0, None, 200, 100)};
const Key kLookAround[] = {K(Neutral, -16, 0, None, 150, 500), K(Neutral, 16, 0, None, 220, 500),
                           K(Neutral, 0, -6, None, 180, 400), K(Neutral, 0, 0, None, 180, 100)};
const Key kHum[] = {KF(Content, 0, -2, Wobble, 300, 2600, kFxNotes)};
const Key kBored[] = {K(Bored, 0, 0, None, 400, 1800), K(Neutral, 0, 0, None, 300, 100)};
const Key kYawn[] = {K(Sleepy, 0, 0, None, 300, 300),
                     KO(Neutral, 0, -2, None, 300, 900, 0, kClosed, kMouthO),
                     K(Sleepy, 0, 0, None, 300, 400)};
const Key kCurious[] = {KO(Confused, 0, 0, None, 300, 1400, 0, kKeep, kKeep)};
const Key kSparkle[] = {K(Excited, 0, 0, None, 250, 1000), K(Happy, 0, 0, None, 200, 300)};
const Key kIdleWink[] = {K(Wink, 0, 0, None, 150, 700)};
const Key kSideEye[] = {K(Suspicious, 0, 0, None, 250, 800), K(Suspicious, -14, 0, None, 250, 800)};
const Key kPeek[] = {K(Neutral, 0, 40, None, 350, 700), K(Neutral, 0, 10, None, 400, 300),
                     K(Surprised, 0, 0, None, 120, 500)};
const Key kSquish[] = {K(Cute, 0, 0, Hop, 300, 1200)};
const Key kDaydream[] = {KF(Content, 6, -7, None, 400, 2000, kFxHearts)};
const Key kIdlePout[] = {K(Pout, 0, 0, None, 300, 1400)};
const Key kSigh[] = {K(Sad, 0, 0, None, 400, 1200), K(Neutral, 0, 0, None, 300, 100)};
const Key kSmugIdle[] = {K(Smug, 0, 0, None, 300, 1300)};
const Key kDance[] = {KF(Joy, 0, 0, Bounce, 200, 2000, kFxNotes)};
const Key kShy[] = {K(Cute, -10, 5, None, 300, 1400)};
const Key kZoneOut[] = {K(Blank, 0, 0, None, 200, 1500)};
const Key kNodOff[] = {K(Sleepy, 0, 0, None, 700, 900), KO(Sleepy, 0, 3, None, 500, 400, 0, kClosed, kKeep),
                       K(Surprised, 0, 0, None, 100, 300), K(Sleepy, 0, 0, None, 300, 200)};
const Key kCrossEyed[] = {K(Neutral, 0, 0, None, 200, 100), K(Squint, 0, 0, Tremble, 150, 600),
                          K(Happy, 0, 0, None, 200, 300)};

// ---- touch ----------------------------------------------------------------
const Key kPatHappy[] = {K(Happy, 0, 0, Hop, 120, 800)};
const Key kPatGiggle[] = {K(Laugh, 0, 0, Wobble, 120, 1000)};
const Key kPatLove[] = {KF(Love, 0, 0, None, 200, 1300, kFxHearts)};
const Key kPatPurr[] = {KO(Content, 0, 0, None, 200, 1300, kFxBlush, kKeep, kMouthCat)};
const Key kPatSurprise[] = {K(Surprised, 0, 0, None, 70, 250), K(Happy, 0, 0, Hop, 150, 700)};
const Key kPatShy[] = {K(Cute, 0, 4, None, 200, 1100)};
const Key kPatCheerUp[] = {K(Sad, 0, 0, None, 100, 300), K(Content, 0, 0, None, 400, 900)};
const Key kPatGrumpy[] = {K(Pout, 0, 0, None, 150, 900), K(Smug, 0, 0, None, 300, 400)};
const Key kDPatHearts[] = {KF(Love, 0, 0, Bounce, 150, 1600, kFxHearts)};
const Key kDPatStars[] = {K(Excited, 0, 0, Bounce, 150, 1300)};
const Key kSpamAnnoyed[] = {K(Angry, 0, 0, None, 150, 600), K(Furious, 0, 0, Tremble, 150, 1000)};
const Key kSpamSquint[] = {K(Squint, 0, 0, Tremble, 120, 1000), K(Pout, 0, 0, None, 250, 600)};

// ---- motion ---------------------------------------------------------------
const Key kShakeDizzy[] = {K(Dizzy, 0, 0, Wobble, 200, 1800), K(Blank, 0, 0, None, 200, 300)};
const Key kShakeScared[] = {K(Scared, 0, 0, Tremble, 120, 1400)};
const Key kShakeAngry[] = {K(Furious, 0, 0, Shake, 150, 1200)};
const Key kShakeKO[] = {K(Dead, 0, 0, Wobble, 150, 1500), K(Dizzy, 0, 0, None, 200, 600)};
const Key kPickupSurprised[] = {K(Surprised, 0, 0, None, 80, 400), K(Happy, 0, 0, None, 200, 600)};
const Key kPickupHello[] = {K(Joy, 0, 0, Hop, 200, 900)};
const Key kPickupShocked[] = {K(Shocked, 0, 0, None, 60, 500), K(Neutral, 0, 0, None, 200, 200)};
const Key kPutDownBye[] = {K(Content, 0, 0, None, 300, 800)};
const Key kTiltLeftWhoa[] = {K(Worried, -16, 4, None, 250, 900)};
const Key kTiltRightWhoa[] = {K(Worried, 16, 4, None, 250, 900)};
const Key kUpsidePanic[] = {K(Shocked, 0, 0, Tremble, 100, 600), K(Scared, 0, 0, Shake, 150, 1200)};
const Key kUpsideDizzy[] = {K(Dizzy, 0, 0, None, 200, 1500)};
const Key kFallScream[] = {KF(Shocked, 0, -4, Tremble, 40, 700, kFxSpeedLines),
                           K(Dizzy, 0, 0, Wobble, 200, 1200)};

// ---- sleep / wake / needs -------------------------------------------------
const Key kWakeUp[] = {K(Asleep, 0, 0, None, 0, 300), K(Sleepy, 0, 0, None, 400, 500),
                       K(Surprised, 0, 0, None, 120, 300), K(Happy, 0, 0, None, 200, 500)};
const Key kWakeStretch[] = {K(Sleepy, 0, 0, None, 0, 400),
                            KO(Neutral, 0, -2, Wobble, 300, 800, 0, kClosed, kMouthO),
                            K(Neutral, 0, 0, None, 300, 200)};
const Key kWakeGrumpy[] = {K(Sleepy, 0, 0, None, 0, 600), K(Pout, 0, 0, None, 300, 700)};
const Key kFallAsleep[] = {K(Sleepy, 0, 0, None, 600, 800), KO(Sleepy, 0, 2, None, 500, 400, 0, kKeep, kMouthO),
                           K(Asleep, 0, 0, None, 600, 1600)};
const Key kLonely[] = {K(Sad, 0, 0, None, 600, 1500), K(Cry, 0, 0, None, 400, 1600),
                       K(Sad, 0, 0, None, 400, 300)};
const Key kLonelyLook[] = {K(Worried, -14, 0, None, 300, 700), K(Worried, 14, 0, None, 300, 700),
                           K(Sad, 0, 0, None, 300, 800)};
const Key kLowBattery[] = {KF(Sleepy, 0, 0, None, 400, 2000, kFxLowBattery)};

// ---- Boop Pong ------------------------------------------------------------
const Key kSearching[] = {KF(Neutral, -14, 0, None, 250, 600, kFxQuestion),
                          KF(Neutral, 14, 0, None, 300, 600, kFxQuestion)};
const Key kFound[] = {K(Excited, 0, 0, Hop, 100, 900)};
const Key kPointWon[] = {KF(Joy, 0, 0, Hop, 150, 1300, kFxSparkles)};
const Key kPointWonSmug[] = {K(Smug, 0, 0, None, 150, 1300)};
const Key kPointLost[] = {K(Sad, 0, 0, None, 200, 1300)};
const Key kPointLostMad[] = {K(Angry, 0, 0, Tremble, 150, 1300)};
const Key kWinMatch[] = {K(Excited, 0, 0, Bounce, 200, 1500), KF(Laugh, 0, 0, Hop, 200, 1500, kFxSparkles)};
const Key kLoseMatch[] = {K(Cry, 0, 0, None, 300, 2600)};

// ---- system ---------------------------------------------------------------
const Key kBootHello[] = {K(Blank, 0, 0, None, 0, 400), K(Surprised, 0, 0, None, 200, 300),
                          KO(Joy, 0, 0, Hop, 200, 900, 0, kArc, kKeep)};
const Key kUpdating[] = {K(Determined, 0, 0, None, 300, 1500), K(Squint, 0, 0, Tremble, 200, 800)};

#define ANIM(name, trig, lo, hi, arr) \
  {name, Trigger::trig, lo, hi, arr, (uint8_t)(sizeof(arr) / sizeof(arr[0]))}

const Animation kAnimations[] = {
    ANIM("look_left", Idle, 0, 100, kLookLeft),
    ANIM("look_right", Idle, 0, 100, kLookRight),
    ANIM("look_up", Idle, 0, 100, kLookUp),
    ANIM("look_around", Idle, 0, 100, kLookAround),
    ANIM("hum", Idle, 55, 100, kHum),
    ANIM("bored", Idle, 0, 60, kBored),
    ANIM("yawn", Idle, 0, 100, kYawn),
    ANIM("curious", Idle, 20, 100, kCurious),
    ANIM("sparkle", Idle, 65, 100, kSparkle),
    ANIM("idle_wink", Idle, 50, 100, kIdleWink),
    ANIM("side_eye", Idle, 0, 70, kSideEye),
    ANIM("peek", Idle, 30, 100, kPeek),
    ANIM("squish", Idle, 60, 100, kSquish),
    ANIM("daydream", Idle, 70, 100, kDaydream),
    ANIM("idle_pout", Idle, 0, 40, kIdlePout),
    ANIM("sigh", Idle, 0, 35, kSigh),
    ANIM("smug", Idle, 45, 100, kSmugIdle),
    ANIM("dance", Idle, 75, 100, kDance),
    ANIM("shy", Idle, 40, 100, kShy),
    ANIM("zone_out", Idle, 0, 100, kZoneOut),
    ANIM("nod_off", Idle, 0, 100, kNodOff),
    ANIM("cross_eyed", Idle, 50, 100, kCrossEyed),

    ANIM("pat_happy", Pat, 30, 100, kPatHappy),
    ANIM("pat_giggle", Pat, 50, 100, kPatGiggle),
    ANIM("pat_love", Pat, 70, 100, kPatLove),
    ANIM("pat_purr", Pat, 40, 100, kPatPurr),
    ANIM("pat_surprise", Pat, 0, 100, kPatSurprise),
    ANIM("pat_shy", Pat, 40, 100, kPatShy),
    ANIM("pat_cheer_up", Pat, 0, 45, kPatCheerUp),
    ANIM("pat_grumpy", Pat, 0, 25, kPatGrumpy),
    ANIM("double_pat_hearts", DoublePat, 30, 100, kDPatHearts),
    ANIM("double_pat_stars", DoublePat, 0, 100, kDPatStars),
    ANIM("pat_spam_annoyed", PatSpam, 0, 100, kSpamAnnoyed),
    ANIM("pat_spam_squint", PatSpam, 0, 100, kSpamSquint),

    ANIM("shake_dizzy", Shake, 0, 100, kShakeDizzy),
    ANIM("shake_scared", Shake, 0, 100, kShakeScared),
    ANIM("shake_angry", Shake, 0, 60, kShakeAngry),
    ANIM("shake_ko", Shake, 0, 100, kShakeKO),
    ANIM("pickup_surprised", Pickup, 0, 100, kPickupSurprised),
    ANIM("pickup_hello", Pickup, 40, 100, kPickupHello),
    ANIM("pickup_shocked", Pickup, 0, 100, kPickupShocked),
    ANIM("put_down", PutDown, 0, 100, kPutDownBye),
    ANIM("tilt_left", TiltLeft, 0, 100, kTiltLeftWhoa),
    ANIM("tilt_right", TiltRight, 0, 100, kTiltRightWhoa),
    ANIM("upside_down_panic", UpsideDown, 0, 100, kUpsidePanic),
    ANIM("upside_down_dizzy", UpsideDown, 0, 100, kUpsideDizzy),
    ANIM("freefall", Freefall, 0, 100, kFallScream),

    ANIM("wake_up", Wake, 0, 100, kWakeUp),
    ANIM("wake_stretch", Wake, 30, 100, kWakeStretch),
    ANIM("wake_grumpy", Wake, 0, 30, kWakeGrumpy),
    ANIM("fall_asleep", Sleep, 0, 100, kFallAsleep),
    ANIM("lonely", Lonely, 0, 100, kLonely),
    ANIM("lonely_look", Lonely, 0, 100, kLonelyLook),
    ANIM("low_battery", LowBattery, 0, 100, kLowBattery),

    ANIM("pong_searching", PongSearching, 0, 100, kSearching),
    ANIM("pong_found", PongFound, 0, 100, kFound),
    ANIM("pong_point_won", PongPointWon, 0, 100, kPointWon),
    ANIM("pong_point_won_smug", PongPointWon, 0, 100, kPointWonSmug),
    ANIM("pong_point_lost", PongPointLost, 0, 100, kPointLost),
    ANIM("pong_point_lost_mad", PongPointLost, 0, 100, kPointLostMad),
    ANIM("pong_win_match", PongWinMatch, 0, 100, kWinMatch),
    ANIM("pong_lose_match", PongLoseMatch, 0, 100, kLoseMatch),

    ANIM("boot_hello", Boot, 0, 100, kBootHello),
    ANIM("updating", Update, 0, 100, kUpdating),
};

constexpr int kAnimationCount = sizeof(kAnimations) / sizeof(kAnimations[0]);

}  // namespace

int animationCount() { return kAnimationCount; }

const Animation& animation(int index) {
  if (index < 0 || index >= kAnimationCount) index = 0;
  return kAnimations[index];
}

int findAnimation(const char* name) {
  for (int i = 0; i < kAnimationCount; ++i)
    if (strcmp(kAnimations[i].name, name) == 0) return i;
  return -1;
}

uint32_t animationDuration(const Animation& a) {
  uint32_t total = 0;
  for (int i = 0; i < a.count; ++i) total += a.keys[i].tweenMs + a.keys[i].holdMs;
  return total;
}

const char* triggerName(Trigger t) {
  static const char* const kNames[] = {
      "idle",         "pat",          "double_pat",     "pat_spam",        "shake",
      "pickup",       "put_down",     "tilt_left",      "tilt_right",      "upside_down",
      "freefall",     "wake",         "sleep",          "lonely",          "low_battery",
      "pong_searching", "pong_found",   "pong_point_won", "pong_point_lost", "pong_win_match",
      "pong_lose_match",
      "boot",         "update"};
  static_assert(sizeof(kNames) / sizeof(kNames[0]) == (int)Trigger::Count, "names");
  return (int)t < (int)Trigger::Count ? kNames[(int)t] : "?";
}

Face keyFace(const Key& k) {
  Face f = expression(k.expr);
  f.lookX += k.lookX;
  f.lookY += k.lookY;
  f.fx |= k.fx;
  if (k.eyes != kKeep) f.styleL = f.styleR = (EyeStyle)k.eyes;
  if (k.mouth != kKeep) f.mouth = (Mouth)k.mouth;
  return f;
}

}  // namespace lumi
