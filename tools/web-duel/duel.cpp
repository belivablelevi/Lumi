// Boop Pong between two Lumis, for the website: the real firmware (App, Game,
// faces, genes) running on the simulator's fake hardware and radio.
//
// Built to WebAssembly by build.sh (web/public/duel/lumi-duel.wasm) and natively
// by the Makefile for test_duel.cpp. The page drives Lumi A with the visitor's
// tilt (or the same steering as Lumi B when nobody is playing) and reads both
// screens back every frame.
#include <math.h>
#include <stdint.h>
#include <string.h>

#include "app.h"
#include "fake_hal.h"
#include "genes.h"

#if defined(__wasm__)
#define DUEL_API(name) extern "C" __attribute__((export_name(#name)))
#else
#define DUEL_API(name) extern "C"
#endif

using namespace lumi;

namespace {

struct Duel {
  sim::FakeAir air;
  sim::FakeHal ha, hb;
  MoodState ma, mb;
  App a{ha, &ma}, b{hb, &mb};
  sim::Driver da{a, ha}, db{b, hb};
  float tilt[2] = {0, 0};
  int incoming[2] = {0, 0};
  bool patted[2] = {false, false};
  pong::Ball last[2] = {pong::Ball::None, pong::Ball::None};
  uint32_t carry = 0;
  bool started = false;

  Duel(uint32_t seedA, uint32_t seedB) {
    // Random chip IDs: each Lumi gets the automatic, one-of-a-kind persona the
    // firmware derives from its MAC.
    setMac(ha, seedA, 0x24);
    setMac(hb, seedB, 0x34);
    if (memcmp(ha.mac, hb.mac, 6) == 0) hb.mac[5] ^= 1;
    ha.rng = seedA | 1;
    hb.rng = seedB | 1;
    ha.air = hb.air = &air;
    air.hals = {&ha, &hb};
    ha.app = &a;
    hb.app = &b;
    da.onTick = [](void* ctx, uint32_t now) {
      Duel* d = static_cast<Duel*>(ctx);
      d->db.step();
      d->air.deliver(now);
    };
    da.ctx = this;
  }

  static void setMac(sim::FakeHal& h, uint32_t seed, uint8_t first) {
    uint32_t x = seed * 2654435761u + 0x9E3779B9u;
    h.mac[0] = first;
    for (int i = 1; i < 6; ++i) {
      x ^= x << 13;
      x ^= x >> 17;
      x ^= x << 5;
      h.mac[i] = (uint8_t)x;
    }
  }

  // Wake both up, open the menu (upside down, then upright) and pick PONG.
  void start() {
    a.begin(WakeReason::PowerOn, 0);
    b.begin(WakeReason::PowerOn, 0);
    da.run(2600);
    da.orient(0, -1, 0);
    db.orient(0, -1, 0);
    da.run(1900);
    da.orient(0, 1, 0);
    db.orient(0, 1, 0);
    da.run(700);
    da.queuePat();
    db.queuePat();
    da.run(100);
    started = true;
  }

  // The opponent's (and the demo player's) hands, like the simulator's scripted
  // players: track the ball a little late on odd hits, let some balls past, and
  // (if `smashes`) pat for a smash on even hits. Returns the paddle target,
  // -1 (left) .. 1 (right).
  float steer(int k, uint32_t now, bool smashes) {
    App& app = k == 0 ? a : b;
    sim::Driver& drv = k == 0 ? da : db;
    const pong::Game& g = app.game();
    if (g.ball() == pong::Ball::Incoming && last[k] != pong::Ball::Incoming) {
      ++incoming[k];
      patted[k] = false;
    }
    last[k] = g.ball();
    float want = 0;
    if (g.ball() == pong::Ball::Incoming) {
      const int n = incoming[k];
      const bool dodge = k == 0 ? n % 6 == 0 : n % 3 == 0;
      const float x = g.ballX(now) + (n % 2 ? 9.f : 0.f);
      want = (x - 64) / (64 - pong::kPaddleHalf);
      if (dodge) want = x < 64 ? 1 : -1;
      if (smashes && n % 2 == 0 && !dodge && !patted[k] && g.ballY(now) >= pong::kPaddleY - 30) {
        drv.queuePat();
        patted[k] = true;
      }
    }
    return want < -1 ? -1 : (want > 1 ? 1 : want);
  }

  // Advances by `ms`. Lumi A follows `playerTilt` (-1 .. 1) unless `autoA`.
  void step(uint32_t ms, float playerTilt, bool patA, bool autoA) {
    if (patA) da.queuePat();
    carry += ms;
    while (carry >= 10) {
      carry -= 10;
      const uint32_t now = ha.now;
      const float wantA = autoA ? steer(0, now, true) : playerTilt;
      const float wantB = steer(1, hb.now, false);
      // Hands move smoothly; tilting right moves the paddle right.
      tilt[0] += (-0.5f * wantA - tilt[0]) * (autoA ? 0.2f : 0.5f);
      tilt[1] += (-0.5f * wantB - tilt[1]) * 0.2f;
      da.orient(tilt[0], sqrtf(1 - tilt[0] * tilt[0]), 0);
      db.orient(tilt[1], sqrtf(1 - tilt[1] * tilt[1]), 0);
      da.step();
    }
  }
};

Duel* g_duel = nullptr;
char g_name[2][16];  // one per Lumi, so both names can be read before copying
uint8_t g_screen[kBufferSize];

}  // namespace

DUEL_API(duel_new) void duel_new(uint32_t seedA, uint32_t seedB) {
  delete g_duel;
  g_duel = new Duel(seedA, seedB);
  g_duel->start();  // ~5 s of simulated time, so the match is on and the personas are known
}

DUEL_API(duel_step) void duel_step(uint32_t ms, float playerTilt, int patA, int autoA) {
  if (g_duel) g_duel->step(ms > 250 ? 250 : ms, playerTilt, patA != 0, autoA != 0);
}

// Pointer to a 1024-byte SSD1306 page buffer of Lumi k's screen.
DUEL_API(duel_screen) const uint8_t* duel_screen(int k) {
  Canvas c;
  if (g_duel) (k == 0 ? g_duel->a : g_duel->b).render(c);
  memcpy(g_screen, c.buf, kBufferSize);
  return g_screen;
}

// How far Lumi k is tilted, as the x component of gravity (-0.5 .. 0.5).
DUEL_API(duel_tilt) float duel_tilt(int k) { return g_duel ? g_duel->tilt[k ? 1 : 0] : 0; }

// 0: starting, 1: playing, 2: match over (the winner celebrates), 3: finished.
DUEL_API(duel_state) int duel_state() {
  if (!g_duel || !g_duel->started) return 0;
  const App& a = g_duel->a;
  if (a.mode() != App::Mode::Pong) return 3;
  switch (a.game().phase()) {
    case pong::Phase::MatchOver:
      return 2;
    case pong::Phase::Aborted:
    case pong::Phase::Done:
      return 3;
    default:
      return 1;
  }
}

// Points scored by Lumi k in this match.
DUEL_API(duel_points) int duel_points(int k) {
  if (!g_duel) return 0;
  return (k == 0 ? g_duel->a : g_duel->b).game().myPoints();
}

DUEL_API(duel_name) const char* duel_name(int k) {
  if (!g_duel) return "";
  char* out = g_name[k ? 1 : 0];
  strncpy(out, (k == 0 ? g_duel->a : g_duel->b).name(), sizeof g_name[0] - 1);
  out[sizeof g_name[0] - 1] = 0;
  return out;
}

// Gene g (GeneId order) of Lumi k; names come from duel_option_name.
DUEL_API(duel_gene) int duel_gene(int k, int g) {
  if (!g_duel) return 0;
  return geneValue((k == 0 ? g_duel->a : g_duel->b).genes(), (GeneId)g);
}

DUEL_API(duel_option_name) const char* duel_option_name(int g, int option) {
  return geneOptionName((GeneId)g, option);
}

DUEL_API(duel_rarity) const char* duel_rarity(int k) {
  if (!g_duel) return "";
  return rarityName((k == 0 ? g_duel->a : g_duel->b).rarity());
}
