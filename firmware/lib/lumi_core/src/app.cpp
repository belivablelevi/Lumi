#include "app.h"

#include <stdio.h>
#include <string.h>

#include "generated/default_pack.h"

namespace lumi {

namespace {

const char* const kMenuItems[] = {"PONG", "BATTERY", "UPDATE", "SLEEP", "BACK"};
constexpr int kMenuCount = sizeof(kMenuItems) / sizeof(kMenuItems[0]);
enum MenuItem { kMenuPong, kMenuBattery, kMenuUpdate, kMenuSleep, kMenuBack };

constexpr uint32_t kBatteryScreenMs = 4000;
constexpr uint32_t kBatteryReadEveryMs = 5000;
constexpr uint32_t kLowBatteryNagMs = 30000;
constexpr uint32_t kIgnoredForMoodMs = 30000;

inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

}  // namespace

uint8_t batteryPercent(uint16_t mv) {
  // Typical single-cell LiPo discharge curve at light load.
  static const uint16_t kMv[] = {3300, 3500, 3600, 3650, 3700, 3750, 3800, 3900, 4000, 4100, 4200};
  static const uint8_t kPct[] = {0, 4, 10, 18, 28, 38, 48, 64, 78, 90, 100};
  if (mv <= kMv[0]) return 0;
  for (int i = 1; i < 11; ++i)
    if (mv <= kMv[i])
      return (uint8_t)(kPct[i - 1] + (kPct[i] - kPct[i - 1]) * (mv - kMv[i - 1]) / (kMv[i] - kMv[i - 1]));
  return 100;
}

const char* App::modeName(Mode m) {
  switch (m) {
    case Mode::Pet: return "pet";
    case Mode::Menu: return "menu";
    case Mode::Battery: return "battery";
    case Mode::Pong: return "pong";
    case Mode::Update: return "update";
    case Mode::FallingAsleep: return "falling_asleep";
    case Mode::Sleep: return "sleep";
  }
  return "?";
}

void App::begin(WakeReason why, uint32_t sleptSeconds) {
  const uint32_t now = hal_.millis();
  anim_.begin(now, hal_.random32());
  gestures_.reset(now);
  wakeTime_ = lastInteraction_ = lastTick_ = now;
  interactedSinceWake_ = why != WakeReason::Motion;
  loadPersona();
  if (why == WakeReason::Motion) mood_.tickAsleep(sleptSeconds);
  anim_.setMood(mood_.happiness());
  anim_.setBase(mood_.restingExpression());
  batteryMv_ = hal_.batteryMv();
  lastBatteryRead_ = now;
  enterMode(Mode::Pet);

  if (why == WakeReason::PowerOn) react(Trigger::Boot);
  else if (mood_.lonely()) react(Trigger::Lonely);
  else react(Trigger::Wake);
}

namespace {

// Scratch space for reading the unit pack from storage (too big for a stack).
uint8_t g_storeBuffer[kPackMaxBytes];

uint64_t macToSeed(const uint8_t mac[6]) {
  uint64_t v = 0;
  for (int i = 0; i < 6; ++i) v = v << 8 | mac[i];
  return v;
}

}  // namespace

void App::loadPersona() {
  anim_.stop();  // pack animations may be about to move
  registerPack(0, nullptr);
  registerPack(1, nullptr);
  if (kDefaultPackSize && defaultPack_.decode(kDefaultPack, kDefaultPackSize) == Pack::Error::None)
    registerPack(0, &defaultPack_);
  size_t len = 0;
  unitPack_.clear();
  if (hal_.storeLoad(g_storeBuffer, sizeof(g_storeBuffer), &len) &&
      unitPack_.decode(g_storeBuffer, len) == Pack::Error::None)
    registerPack(1, &unitPack_);
  applyPersona();
}

void App::applyPersona() {
  const PackPersona& p = unitPack_.persona();
  assigned_ = p.present;
  if (assigned_) {
    genes_ = p.genes;
    snprintf(name_, sizeof(name_), "%s", p.name[0] ? p.name : "Lumi");
    snprintf(serial_, sizeof(serial_), "%s", p.serial);
  } else {
    uint8_t mac[6];
    hal_.macAddress(mac);
    const uint64_t seed = macToSeed(mac);
    genes_ = genesFromSeed(seed);
    nameFromSeed(seed, name_, sizeof(name_));
    serial_[0] = 0;
  }

  const TemperamentTraits& t = traits((Temperament)genes_.temperament);
  mood_.setTemperament((Temperament)genes_.temperament);
  anim_.setIdleScale(t.idleInterval);
  int favs[Animator::kMaxFavourites];
  int n = 0;
  for (const char* name : t.favourites)
    if (name && n < Animator::kMaxFavourites) favs[n++] = findAnimation(name);
  for (int i = 0; assigned_ && i < p.favouriteCount && n < Animator::kMaxFavourites; ++i)
    favs[n++] = findAnimation(p.favourites[i]);
  anim_.setFavourites(favs, n);
}

bool App::installUnitPack(const uint8_t* data, size_t len, const char** error) {
  // Check it decodes before touching storage, using the live pack's slot.
  anim_.stop();
  registerPack(1, nullptr);
  const Pack::Error e = unitPack_.decode(data, len);
  if (e != Pack::Error::None) {
    if (error) *error = Pack::errorName(e);
    loadPersona();  // put the previous pack back
    return false;
  }
  if (!hal_.storeSave(data, len)) {
    if (error) *error = "storage write failed";
    loadPersona();
    return false;
  }
  loadPersona();
  return true;
}

void App::clearUnitPack() {
  hal_.storeClear();
  loadPersona();
}

void App::enterMode(Mode m) {
  mode_ = m;
  modeStart_ = hal_.millis();
  anim_.setIdleEnabled(m == Mode::Pet);
  switch (m) {
    case Mode::Pet:
      hal_.setContrast(255);
      upside_ = faceDown_ = menuArmed_ = false;
      break;
    case Mode::Menu:
      menuSel_ = 0;
      menuLastInput_ = modeStart_;
      break;
    case Mode::Pong: {
      if (!hal_.radioStart()) {
        enterMode(Mode::Pet);
        react(Trigger::PongPointLost);
        return;
      }
      uint8_t mac[6];
      hal_.macAddress(mac);
      game_.begin(mac, modeStart_, hal_.random32(), &App::sendThunk, this);
      lastPhase_ = pong::Phase::Idle;
      gameRecorded_ = false;
      smashUntil_ = 0;
      paddle_ = kWidth / 2.f;
      anim_.stop();
      break;
    }
    case Mode::Update:
      if (!hal_.updateStart()) {
        enterMode(Mode::Pet);
        react(Trigger::PongPointLost);
        return;
      }
      anim_.stop();
      anim_.setBase(Expr::Determined);
      break;
    case Mode::FallingAsleep:
      hal_.setContrast(80);
      break;
    case Mode::Battery:
    case Mode::Sleep:
      break;
  }
}

void App::sendThunk(const pong::Packet& p, void* ctx) { static_cast<App*>(ctx)->hal_.radioSend(p); }

void App::onPacket(const pong::Packet& p) {
  if (mode_ == Mode::Pong) game_.onPacket(p, hal_.millis());
}

void App::onAccel(float x, float y, float z, uint32_t t) {
  GestureEvent ev[8];
  const int n = gestures_.update(x, y, z, t, ev, 8);
  for (int i = 0; i < n; ++i) handle(ev[i]);
}

void App::handle(const GestureEvent& e) {
  switch (e.gesture) {
    case Gesture::Pat:
    case Gesture::DoublePat:
    case Gesture::PatSpam:
    case Gesture::Shake:
    case Gesture::Freefall:
    case Gesture::Pickup:
      interacted();
      break;
    case Gesture::Orientation:
      if (e.orientation == Orientation::TiltLeft || e.orientation == Orientation::TiltRight ||
          e.orientation == Orientation::UpsideDown)
        interacted();
      break;
    default:
      break;
  }

  switch (mode_) {
    case Mode::Pet:
      handlePet(e);
      break;
    case Mode::Menu:
      handleMenu(e);
      break;
    case Mode::Battery:
      if (e.gesture == Gesture::Pat || e.gesture == Gesture::Shake) enterMode(Mode::Pet);
      break;
    case Mode::Pong:
      handlePong(e);
      break;
    case Mode::Update:
      if (e.gesture == Gesture::Shake && hal_.updateProgress() < 0) {
        hal_.updateStop();
        enterMode(Mode::Pet);
      }
      break;
    case Mode::FallingAsleep:
      if (e.gesture == Gesture::Pat || e.gesture == Gesture::Shake || e.gesture == Gesture::Pickup) {
        enterMode(Mode::Pet);
        anim_.setBase(mood_.restingExpression());
        react(Trigger::Wake);
      }
      break;
    case Mode::Sleep:
      break;
  }
}

void App::handlePet(const GestureEvent& e) {
  switch (e.gesture) {
    case Gesture::Pat:
      mood_.onPat();
      react(Trigger::Pat);
      break;
    case Gesture::DoublePat:
      mood_.onDoublePat();
      react(Trigger::DoublePat);
      break;
    case Gesture::PatSpam:
      mood_.onPatSpam();
      react(Trigger::PatSpam);
      break;
    case Gesture::Shake:
      mood_.onShake();
      react(Trigger::Shake);
      break;
    case Gesture::Freefall:
      mood_.onFreefall();
      react(Trigger::Freefall);
      break;
    case Gesture::Pickup:
      if (!anim_.busy()) react(Trigger::Pickup);
      break;
    case Gesture::PutDown:
      if (!anim_.busy()) react(Trigger::PutDown);
      break;
    case Gesture::Orientation: {
      const Orientation o = e.orientation;
      const uint32_t now = hal_.millis();
      if (o == Orientation::TiltLeft) react(Trigger::TiltLeft);
      if (o == Orientation::TiltRight) react(Trigger::TiltRight);
      if (o == Orientation::UpsideDown && !upside_) {
        react(Trigger::UpsideDown);
        upsideSince_ = now;
      }
      upside_ = o == Orientation::UpsideDown;
      if (o == Orientation::FaceDown && !faceDown_) faceDownSince_ = now;
      faceDown_ = o == Orientation::FaceDown;
      if ((o == Orientation::Upright || o == Orientation::FaceUp) && menuArmed_) {
        menuArmed_ = false;
        enterMode(Mode::Menu);
      }
      break;
    }
    default:
      break;
  }
}

void App::handleMenu(const GestureEvent& e) {
  const uint32_t now = hal_.millis();
  if (e.gesture == Gesture::Orientation) {
    if (e.orientation == Orientation::TiltLeft) {
      menuSel_ = (menuSel_ + kMenuCount - 1) % kMenuCount;
      menuLastInput_ = now;
    } else if (e.orientation == Orientation::TiltRight) {
      menuSel_ = (menuSel_ + 1) % kMenuCount;
      menuLastInput_ = now;
    }
  } else if (e.gesture == Gesture::Shake) {
    enterMode(Mode::Pet);
  } else if (e.gesture == Gesture::Pat) {
    switch (menuSel_) {
      case kMenuPong:
        enterMode(Mode::Pong);
        break;
      case kMenuBattery:
        batteryMv_ = hal_.batteryMv();
        enterMode(Mode::Battery);
        break;
      case kMenuUpdate:
        enterMode(Mode::Update);
        break;
      case kMenuSleep:
        enterMode(Mode::Pet);
        startSleep();
        break;
      default:
        enterMode(Mode::Pet);
        break;
    }
  }
}

void App::handlePong(const GestureEvent& e) {
  const uint32_t now = hal_.millis();
  if (e.gesture == Gesture::Pat) {
    game_.onTap(e.timeMs);
  } else if (e.gesture == Gesture::Shake) {
    const pong::Phase p = game_.phase();
    if (p == pong::Phase::Lobby || p == pong::Phase::Inviting || p == pong::Phase::Intro)
      game_.cancel(now);
  }
}

void App::startSleep() {
  anim_.stop();
  anim_.setBase(Expr::Asleep);
  react(Trigger::Sleep);
  enterMode(Mode::FallingAsleep);
}

void App::updatePet(uint32_t now) {
  if (upside_ && !menuArmed_ && now - upsideSince_ >= cfg_.menuHoldMs) menuArmed_ = true;
  if (faceDown_ && now - faceDownSince_ >= cfg_.faceDownSleepMs) {
    enterMode(Mode::Sleep);  // nobody can see the screen: skip the animation
    return;
  }

  const bool empty = batteryMv_ && batteryMv_ < cfg_.emptyBatteryMv && !hal_.usbPowered();
  if (empty) {
    startSleep();
    return;
  }
  if (batteryMv_ && batteryMv_ < cfg_.lowBatteryMv && !hal_.usbPowered() &&
      now - lastLowBatteryNag_ >= kLowBatteryNagMs && !anim_.busy()) {
    lastLowBatteryNag_ = now;
    react(Trigger::LowBattery);
  }

  const uint32_t sinceInteraction = now - lastInteraction_;
  const bool still = gestures_.stillForMs(now) >= cfg_.stillSleepMs && sinceInteraction >= cfg_.stillSleepMs;
  const bool ignored = sinceInteraction >= cfg_.noInteractionMs;
  const bool unloved = !interactedSinceWake_ && now - wakeTime_ >= cfg_.wakeGraceMs;
  if ((still || ignored || unloved) && !anim_.busy()) {
    startSleep();
    return;
  }

  // Eyes roll towards whichever edge is lower.
  anim_.setGaze(clampf(-gestures_.gx() * 18, -18, 18), 0);
  anim_.setBase(mood_.restingExpression());
}

void App::updatePong(uint32_t now) {
  using pong::Phase;
  // Tilt steers the paddle like the knob on the original Pong: right side
  // down slides it right; ~30 degrees of tilt reaches the edge.
  const float target = kWidth / 2.f + clampf(-gestures_.gx() / 0.5f, -1, 1) * (kWidth / 2.f - pong::kPaddleHalf);
  paddle_ += (target - paddle_) * 0.6f;
  game_.setPaddle(paddle_);
  game_.tick(now);

  for (pong::Event e = game_.takeEvent(); e != pong::Event::None; e = game_.takeEvent()) {
    switch (e) {
      case pong::Event::Smash:
        smashUntil_ = now + 700;
        break;
      case pong::Event::PointWon:
        react(Trigger::PongPointWon);
        break;
      case pong::Event::PointLost:
        react(Trigger::PongPointLost);
        break;
      default:
        break;
    }
  }

  const Phase p = game_.phase();
  if (p != lastPhase_) {
    switch (p) {
      case Phase::Lobby:
        anim_.setBase(Expr::Neutral);
        react(Trigger::PongSearching);
        break;
      case Phase::Intro:
        react(Trigger::PongFound);
        break;
      case Phase::Play:
        anim_.setBase(Expr::Neutral);
        break;
      case Phase::MatchOver:
        react(game_.wonMatch() ? Trigger::PongWinMatch : Trigger::PongLoseMatch);
        if (!gameRecorded_) {
          mood_.onGame(game_.wonMatch());
          gameRecorded_ = true;
        }
        break;
      case Phase::Aborted:
        anim_.setBase(Expr::Sad);
        anim_.playIndex(findAnimation("lonely_look"));
        break;
      case Phase::Done:
        hal_.radioStop();
        enterMode(Mode::Pet);
        break;
      default:
        break;
    }
    lastPhase_ = p;
  }
  if (p == Phase::Lobby && !anim_.busy()) react(Trigger::PongSearching);
}

void App::update() {
  const uint32_t now = hal_.millis();
  const uint32_t dt = now - lastTick_;
  lastTick_ = now;

  if (now - lastBatteryRead_ >= kBatteryReadEveryMs) {
    lastBatteryRead_ = now;
    batteryMv_ = hal_.batteryMv();
  }
  mood_.tickAwake(dt, now - lastInteraction_ > kIgnoredForMoodMs);

  switch (mode_) {
    case Mode::Pet:
      updatePet(now);
      break;
    case Mode::Menu:
      if (now - menuLastInput_ >= cfg_.menuTimeoutMs) enterMode(Mode::Pet);
      break;
    case Mode::Battery:
      if (now - modeStart_ >= kBatteryScreenMs) enterMode(Mode::Pet);
      break;
    case Mode::Pong:
      updatePong(now);
      break;
    case Mode::Update:
      if (now - modeStart_ >= cfg_.updateTimeoutMs && hal_.updateProgress() < 0) {
        hal_.updateStop();
        enterMode(Mode::Pet);
      }
      break;
    case Mode::FallingAsleep:
      if (!anim_.busy()) enterMode(Mode::Sleep);
      break;
    case Mode::Sleep:
      break;
  }

  anim_.setMood(mood_.happiness());
  anim_.update(now);
}

// ---------------------------------------------------------------------------
// Rendering

void App::render(Canvas& c) {
  const uint32_t now = hal_.millis();
  c.clear();
  switch (mode_) {
    case Mode::Pet:
      if (menuArmed_) {
        // Lumi is upside down: draw the hint so it reads the right way up.
        c.textCentered(14, "flip me back", 1);
        c.textCentered(26, "for the", 1);
        c.textCentered(38, "MENU", 2);
        c.rotate180();
      } else {
        drawFace(c, personalize(anim_.face(), genes_), now);
      }
      break;
    case Mode::FallingAsleep:
    case Mode::Sleep:
      drawFace(c, personalize(anim_.face(), genes_), now);
      break;
    case Mode::Menu:
      renderMenu(c, now);
      break;
    case Mode::Battery:
      renderBattery(c, now);
      break;
    case Mode::Pong:
      renderPong(c, now);
      break;
    case Mode::Update:
      renderUpdate(c, now);
      break;
  }
}

void App::renderMenu(Canvas& c, uint32_t now) {
  c.text(2, 1, "MENU");
  for (int i = 0; i < kMenuCount; ++i) {
    const int x = 126 - (kMenuCount - i) * 7;
    if (i == menuSel_) c.fillCircle(x, 4, 2);
    else c.circle(x, 4, 2);
  }
  c.hline(0, 127, 10);

  c.fillRoundRect(14, 17, 100, 26, 6);
  c.textCentered(23, kMenuItems[menuSel_], 2, false);
  const int nudge = (now / 400) & 1;
  c.text(1 - nudge, 23, "<", 2);
  c.text(116 + nudge, 23, ">", 2);

  c.textCentered(52, "tilt to pick, pat=ok", 1);
}

void App::renderBattery(Canvas& c, uint32_t now) {
  const uint16_t mv = batteryMv_;
  const uint8_t pct = batteryPercent(mv);
  const bool usb = hal_.usbPowered();

  char buf[40];
  snprintf(buf, sizeof(buf), "%s - %s", name_, rarityName(rarity()));
  c.textCentered(1, buf, 1);

  c.rect(6, 12, 54, 26);
  c.rect(7, 13, 52, 24);
  c.fillRect(60, 19, 4, 12);
  int fill = 48 * pct / 100;
  if (usb) fill = (int)((now / 300) % 5) * 12;  // charging sweep
  if (fill > 0) c.fillRect(10, 16, fill, 18);

  snprintf(buf, sizeof(buf), "%u%%", (unsigned)pct);
  c.text(72, 12, buf, 2);
  snprintf(buf, sizeof(buf), "%u.%02uV", mv / 1000, (mv % 1000) / 10);
  c.text(72, 32, mv ? buf : "--", 1);
  if (usb) c.textCentered(44, "charging", 1);

  const MoodState& s = mood_.state();
  snprintf(buf, sizeof(buf), "pats %lu  wins %lu", (unsigned long)s.pats, (unsigned long)s.gamesWon);
  c.textCentered(55, buf, 1);
}

void App::drawCompactFace(Canvas& c, uint32_t now) {
  Face f = personalize(anim_.face(), genes_);
  f.eyeW *= 0.78f;
  f.eyeH *= 0.72f;
  f.eyeR *= 0.75f;
  f.spacing *= 0.85f;
  f.eyeY = 28 + (f.eyeY - 26) * 0.7f;
  f.mouthY = 45 + (f.mouthY - 54) * 0.7f;
  f.lookX *= 0.7f;
  f.lookY *= 0.6f;
  f.offY *= 0.6f;
  f.fx &= ~(kFxZzz | kFxSparkles | kFxHearts | kFxNotes);  // keep the text bands clear
  drawFace(c, f, now);
}

void App::renderCourt(Canvas& c, uint32_t now) {
  // Court: the net is the top edge, our paddle runs along the bottom.
  auto pixY = [](float y) { return (int)(11 + y * 50 / 1000.f); };
  for (int x = 0; x < kWidth; x += 4) c.pixel(x, 10);
  const int px = (int)(game_.paddleX() + 0.5f), py = pixY(pong::kPaddleY) + 1;
  c.fillRoundRect(px - (int)pong::kPaddleHalf, py, 2 * (int)pong::kPaddleHalf + 1, 3, 1);

  const pong::Ball ball = game_.ball();
  if (ball == pong::Ball::Incoming || ball == pong::Ball::Outgoing) {
    const int bx = (int)(game_.ballX(now) + 0.5f), by = pixY(game_.ballY(now));
    c.fillCircle(bx, by, 3);
    if (ball == pong::Ball::Incoming && game_.ballSmash()) {
      c.vline(bx, by - 8, by - 5);  // speed streak behind a smash
      c.vline(bx - 2, by - 7, by - 5);
      c.vline(bx + 2, by - 7, by - 5);
    }
  } else if (game_.serving()) {
    c.textCentered(28, "your serve", 1);
  } else {
    c.textCentered(28, game_.rally() > 1 ? "nice rally!" : "pal's turn", 1);
  }
  if ((int32_t)(smashUntil_ - now) > 0) c.textCentered(24, "SMASH!", 2);
}

void App::renderPong(Canvas& c, uint32_t now) {
  using pong::Phase;
  const Phase p = game_.phase();
  const uint32_t el = game_.phaseElapsed(now);
  char buf[32];

  if (p == Phase::Intro) {
    c.textCentered(2, "BOOP", 3);
    c.textCentered(28, "PONG", 2);
    c.textCentered(50, (el / 1200) & 1 ? "tilt to move" : "don't miss the ball!", 1);
    return;
  }

  snprintf(buf, sizeof(buf), "YOU %d : %d PAL", game_.myPoints(), game_.theirPoints());
  if (p == Phase::Play && !game_.inPointPause(now)) {
    c.textCentered(0, buf, 1);
    renderCourt(c, now);
    return;
  }

  drawCompactFace(c, now);
  switch (p) {
    case Phase::Lobby: {
      c.textCentered(0, "BOOP PONG", 1);
      static const char* const kDots[] = {"finding a pal", "finding a pal.", "finding a pal..",
                                          "finding a pal..."};
      c.textCentered(56, kDots[(now / 400) % 4], 1);
      break;
    }
    case Phase::Inviting:
      c.textCentered(0, "BOOP PONG", 1);
      c.textCentered(56, "found a pal!", 1);
      break;
    case Phase::Play:
      c.textCentered(0, buf, 1);
      c.textCentered(56, game_.lastPointMine() ? "POINT TO YOU!" : "missed it!", 1);
      break;
    case Phase::MatchOver:
      c.textCentered(0, game_.wonMatch() ? "VICTORY!" : "DEFEAT", 1);
      snprintf(buf, sizeof(buf), "%d : %d", game_.myPoints(), game_.theirPoints());
      c.textCentered(56, buf, 1);
      break;
    case Phase::Aborted:
      c.textCentered(56,
                     game_.abortReason() == pong::AbortReason::NoFriend    ? "no pal nearby"
                     : game_.abortReason() == pong::AbortReason::Cancelled ? "maybe later"
                                                                           : "pal left :(",
                     1);
      break;
    default:
      break;
  }
}

void App::renderUpdate(Canvas& c, uint32_t now) {
  char buf[40];
  c.text(2, 1, "UPDATE MODE");
  c.hline(0, 127, 10);
  const int prog = hal_.updateProgress();
  if (prog >= 0) {
    c.textCentered(18, "installing...", 1);
    c.rect(10, 32, 108, 10);
    c.fillRect(12, 34, 104 * prog / 100, 6);
    snprintf(buf, sizeof(buf), "%d%%", prog);
    c.textCentered(48, buf, 1);
    return;
  }
  snprintf(buf, sizeof(buf), "wifi %s", hal_.updateSsid());
  c.text(2, 15, buf);
  snprintf(buf, sizeof(buf), "pass %s", hal_.updatePassword());
  c.text(2, 26, buf);
  snprintf(buf, sizeof(buf), "open %s", hal_.updateAddress());
  c.text(2, 37, buf);
  c.textCentered(54, (now / 1500) & 1 ? "shake to cancel" : "upload lumi.bin", 1);
}

}  // namespace lumi
