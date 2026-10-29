// Lumi's behaviour: what happens when you pat, shake, flip or ignore it.
//
// Everything hardware-specific sits behind the Hal interface, so this exact
// code runs on the ESP32-C3 and in the desktop simulator / tests.
#pragma once
#include <stdint.h>

#include "animator.h"
#include "pack.h"
#include "pong.h"
#include "gestures.h"
#include "gfx.h"
#include "mood.h"

namespace lumi {

constexpr const char* kFirmwareVersion = "1.2.0";

class Hal {
 public:
  virtual ~Hal() {}
  virtual uint32_t millis() = 0;
  virtual uint32_t random32() = 0;
  virtual uint16_t batteryMv() = 0;    // 0 if unknown
  virtual bool usbPowered() = 0;       // charging / plugged in
  virtual void macAddress(uint8_t mac[6]) = 0;
  virtual void setContrast(uint8_t level) = 0;

  // Boop Pong radio.
  virtual bool radioStart() = 0;
  virtual void radioStop() = 0;
  virtual void radioSend(const pong::Packet& p) = 0;

  // Over-the-air update mode (Wi-Fi access point + upload page).
  virtual bool updateStart() = 0;
  virtual void updateStop() = 0;
  virtual const char* updateSsid() = 0;
  virtual const char* updatePassword() = 0;
  virtual const char* updateAddress() = 0;
  virtual int updateProgress() = 0;  // -1 idle, 0..100 while uploading

  // This unit's own emotion pack / persona (NVS on the device). Units without
  // storage simply always use the automatic persona.
  virtual bool storeLoad(uint8_t* buf, size_t cap, size_t* len) {
    (void)buf;
    (void)cap;
    (void)len;
    return false;
  }
  virtual bool storeSave(const uint8_t* data, size_t len) {
    (void)data;
    (void)len;
    return false;
  }
  virtual bool storeClear() { return false; }
};

enum class WakeReason : uint8_t { PowerOn, Motion, Other };

struct AppConfig {
  uint32_t stillSleepMs = 45000;       // resting untouched this long -> sleep
  uint32_t noInteractionMs = 120000;   // awake but ignored this long -> sleep
  uint32_t wakeGraceMs = 20000;        // woken by motion but nobody played -> sleep
  uint32_t faceDownSleepMs = 2500;     // lay it face-down to put it to bed
  uint32_t menuHoldMs = 1500;          // hold upside-down this long to arm the menu
  uint32_t menuTimeoutMs = 10000;
  uint32_t updateTimeoutMs = 300000;
  uint16_t lowBatteryMv = 3450;
  uint16_t emptyBatteryMv = 3300;
};

class App {
 public:
  enum class Mode : uint8_t { Pet, Menu, Battery, Pong, Update, FallingAsleep, Sleep };

  App(Hal& hal, MoodState* moodState, const AppConfig& cfg = AppConfig())
      : hal_(hal), mood_(moodState), cfg_(cfg) {}

  void begin(WakeReason why, uint32_t sleptSeconds);
  void onAccel(float x, float y, float z, uint32_t tMs);  // call at ~100 Hz
  void onPacket(const pong::Packet& p);
  void update();                                          // call once per frame
  void render(Canvas& c);

  // True once Lumi has played its fall-asleep animation; the firmware should
  // then put the hardware into deep sleep.
  bool wantsSleep() const { return mode_ == Mode::Sleep; }
  Mode mode() const { return mode_; }
  const Animator& animator() const { return anim_; }
  const Mood& mood() const { return mood_; }
  const GestureDetector& gestures() const { return gestures_; }
  const pong::Game& game() const { return game_; }
  void debugPlay(int animationIndex) { anim_.playIndex(animationIndex); }

  // Personality. Assigned at the factory (a persona in this unit's pack) or
  // derived automatically from the chip's MAC address.
  const Genes& genes() const { return genes_; }
  const char* name() const { return name_; }
  const char* serial() const { return serial_; }
  bool personaAssigned() const { return assigned_; }
  Rarity rarity() const { return rarityOf(genes_); }
  const Pack& unitPack() const { return unitPack_; }
  const Pack& defaultPack() const { return defaultPack_; }

  // Validates and stores a new unit pack, then applies it. On failure the
  // previous pack stays in place and `error` says why.
  bool installUnitPack(const uint8_t* data, size_t len, const char** error);
  // Forgets the unit pack: back to the automatic persona.
  void clearUnitPack();
  // Reloads packs and persona from storage (also done by begin()).
  void loadPersona();

  static const char* modeName(Mode m);

 private:
  void handle(const GestureEvent& e);
  void handlePet(const GestureEvent& e);
  void handleMenu(const GestureEvent& e);
  void handlePong(const GestureEvent& e);
  void enterMode(Mode m);
  void interacted() { lastInteraction_ = hal_.millis(); interactedSinceWake_ = true; }
  void react(Trigger t) { anim_.play(t, mood_.happiness()); }
  void updatePet(uint32_t now);
  void updatePong(uint32_t now);
  void startSleep();

  void renderMenu(Canvas& c, uint32_t now);
  void renderBattery(Canvas& c, uint32_t now);
  void renderPong(Canvas& c, uint32_t now);
  void renderCourt(Canvas& c, uint32_t now);
  void renderUpdate(Canvas& c, uint32_t now);
  void drawCompactFace(Canvas& c, uint32_t now);
  void applyPersona();

  static void sendThunk(const pong::Packet& p, void* ctx);

  Hal& hal_;
  Mood mood_;
  AppConfig cfg_;
  Animator anim_;
  GestureDetector gestures_;
  pong::Game game_;

  Mode mode_ = Mode::Pet;
  uint32_t modeStart_ = 0;
  uint32_t wakeTime_ = 0;
  uint32_t lastInteraction_ = 0;
  bool interactedSinceWake_ = false;
  uint32_t lastTick_ = 0;

  // Pet-mode orientation bookkeeping.
  uint32_t upsideSince_ = 0;
  bool upside_ = false;
  bool menuArmed_ = false;
  uint32_t faceDownSince_ = 0;
  bool faceDown_ = false;

  int menuSel_ = 0;
  uint32_t menuLastInput_ = 0;

  uint16_t batteryMv_ = 0;
  uint32_t lastBatteryRead_ = 0;
  uint32_t lastLowBatteryNag_ = 0;

  pong::Phase lastPhase_ = pong::Phase::Idle;
  bool gameRecorded_ = false;
  uint32_t smashUntil_ = 0;
  float paddle_ = kWidth / 2.f;  // smoothed paddle position

  Pack defaultPack_;  // built into the firmware
  Pack unitPack_;     // this unit's own, from storage
  Genes genes_;
  char name_[16] = "Lumi";
  char serial_[kPackNameLen] = "";
  bool assigned_ = false;
};

uint8_t batteryPercent(uint16_t mv);

}  // namespace lumi
