// Desktop tests for the portable Lumi core. Build & run with `make -C tests`.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <deque>
#include <set>
#include <string>
#include <vector>

#include "animations.h"
#include "app.h"
#include "genes.h"
#include "pack.h"
#include "serial_cmd.h"
#include "fake_hal.h"
#include "animator.h"
#include "pong.h"
#include "face.h"
#include "gestures.h"
#include "gfx.h"
#include "mood.h"

using namespace lumi;

static int g_failures = 0, g_checks = 0;
#define CHECK(cond)                                                     \
  do {                                                                  \
    ++g_checks;                                                         \
    if (!(cond)) {                                                      \
      ++g_failures;                                                     \
      printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);          \
    }                                                                   \
  } while (0)
#define CHECK_EQ(a, b)                                                                \
  do {                                                                                \
    ++g_checks;                                                                       \
    long _a = (long)(a), _b = (long)(b);                                              \
    if (_a != _b) {                                                                   \
      ++g_failures;                                                                   \
      printf("  FAIL %s:%d: %s == %s (%ld vs %ld)\n", __FILE__, __LINE__, #a, #b, _a, _b); \
    }                                                                                 \
  } while (0)

// ---------------------------------------------------------------------------
// Gesture helpers: feed a 100 Hz signal and collect events.

struct Recorder {
  GestureDetector det;
  uint32_t t = 0;
  std::vector<GestureEvent> events;
  float noise = 0.004f;
  uint32_t seed = 1;

  float jitter() {
    seed = seed * 1103515245u + 12345u;
    return ((seed >> 16) % 2001 / 1000.f - 1.f) * noise;
  }
  void sample(float x, float y, float z) {
    GestureEvent ev[8];
    int n = det.update(x + jitter(), y + jitter(), z + jitter(), t, ev, 8);
    for (int i = 0; i < n; ++i) events.push_back(ev[i]);
    t += 10;
  }
  void hold(float x, float y, float z, uint32_t ms) {
    for (uint32_t e = 0; e < ms; e += 10) sample(x, y, z);
  }
  // A pat: a 20 ms spike along -Z on top of gravity.
  void pat(float x, float y, float z) {
    sample(x, y, z - 1.4f);
    sample(x, y, z + 0.5f);
  }
  int count(Gesture g) const {
    int n = 0;
    for (auto& e : events) n += e.gesture == g;
    return n;
  }
  bool sawOrientation(Orientation o) const {
    for (auto& e : events)
      if (e.gesture == Gesture::Orientation && e.orientation == o) return true;
    return false;
  }
};

static void testGestures() {
  printf("gestures\n");
  {
    Recorder r;  // single pat while hanging upright
    r.hold(0, 1, 0, 800);
    r.pat(0, 1, 0);
    r.hold(0, 1, 0, 800);
    CHECK_EQ(r.count(Gesture::Pat), 1);
    CHECK_EQ(r.count(Gesture::DoublePat), 0);
    CHECK_EQ(r.count(Gesture::Shake), 0);
  }
  {
    Recorder r;  // double pat
    r.hold(0, 1, 0, 800);
    r.pat(0, 1, 0);
    r.hold(0, 1, 0, 200);
    r.pat(0, 1, 0);
    r.hold(0, 1, 0, 800);
    CHECK_EQ(r.count(Gesture::Pat), 2);
    CHECK_EQ(r.count(Gesture::DoublePat), 1);
  }
  {
    Recorder r;  // pat spam: 7 pats, ~2.5 per second
    r.hold(0, 1, 0, 800);
    for (int i = 0; i < 7; ++i) {
      r.pat(0, 1, 0);
      r.hold(0, 1, 0, 450);
    }
    CHECK(r.count(Gesture::PatSpam) >= 1);
  }
  {
    Recorder r;  // vigorous shake at 5 Hz, +-2 g along X
    r.hold(0, 1, 0, 800);
    for (int i = 0; i < 150; ++i) r.sample(2.0f * sinf(i * 0.01f * 2 * 3.14159f * 5), 1, 0);
    r.hold(0, 1, 0, 1000);
    CHECK(r.count(Gesture::Shake) >= 1);
    CHECK_EQ(r.count(Gesture::Pat), 0);
  }
  {
    Recorder r;  // resting on a desk, then picked up
    r.hold(0, 0, 1, 3500);
    CHECK_EQ(r.count(Gesture::PutDown), 1);
    CHECK(r.det.still());
    for (int i = 0; i < 60; ++i) r.sample(0.3f * sinf(i * 0.5f), 0.2f * cosf(i * 0.4f), 1);
    CHECK_EQ(r.count(Gesture::Pickup), 1);
    CHECK(!r.det.still());
  }
  {
    Recorder r;  // freefall
    r.hold(0, 1, 0, 500);
    r.hold(0, 0.05f, 0, 150);
    r.hold(0, 1, 0, 500);
    CHECK_EQ(r.count(Gesture::Freefall), 1);
  }
  {
    Recorder r;  // orientations
    r.hold(0, 1, 0, 500);
    CHECK(r.det.orientation() == Orientation::Upright);
    r.hold(-0.9f, 0.3f, 0, 1200);  // right side down
    CHECK(r.sawOrientation(Orientation::TiltRight));
    r.hold(0.9f, 0.3f, 0, 1200);
    CHECK(r.sawOrientation(Orientation::TiltLeft));
    r.hold(0, -1, 0, 1200);
    CHECK(r.sawOrientation(Orientation::UpsideDown));
    r.hold(0, 0, -1, 1200);
    CHECK(r.sawOrientation(Orientation::FaceDown));
    r.hold(0, 0, 1, 1200);
    CHECK(r.sawOrientation(Orientation::FaceUp));
  }
  {
    Recorder r;  // gently carrying it around shouldn't register pats
    r.noise = 0.03f;
    for (int i = 0; i < 500; ++i) r.sample(0.15f * sinf(i * 0.07f), 1 + 0.1f * sinf(i * 0.05f), 0.1f);
    CHECK_EQ(r.count(Gesture::Pat), 0);
    CHECK_EQ(r.count(Gesture::Shake), 0);
  }
}

// ---------------------------------------------------------------------------
// Boop Pong: two games talking through a simulated radio.

// How a scripted player moves its paddle (and whether it pats to smash).
enum class Style { Perfect, Smasher, MissEveryThird, EdgeHits, Never };

struct Radio;
struct Node {
  pong::Game game;
  uint8_t mac[6];
  Radio* radio;
  int id;
  Style style = Style::Perfect;
  pong::Ball lastBall = pong::Ball::None;
  bool tapped = false;
  int incoming = 0;
  int smashes = 0;
};

struct InFlight {
  uint32_t at;
  int to;
  pong::Packet p;
};

struct Radio {
  std::vector<Node*> nodes;
  std::deque<InFlight> air;
  uint32_t now = 0;
  uint32_t latency = 4;
  int lossPercent = 0;
  uint32_t rng = 7;

  bool lose() {
    rng = rng * 1103515245u + 12345u;
    return (int)((rng >> 16) % 100) < lossPercent;
  }
};

static void radioSend(const pong::Packet& p, void* ctx) {
  Node* from = (Node*)ctx;
  Radio* r = from->radio;
  for (Node* n : r->nodes) {
    if (n == from || r->lose()) continue;
    r->air.push_back({r->now + r->latency, n->id, p});
  }
}

// Plays one node's scripted paddle (and pats) for this instant.
static void playTurn(Node& n, uint32_t now) {
  pong::Game& g = n.game;
  if (g.ball() == pong::Ball::Incoming && n.lastBall != pong::Ball::Incoming) {
    n.tapped = false;
    ++n.incoming;
  }
  n.lastBall = g.ball();
  for (pong::Event e = g.takeEvent(); e != pong::Event::None; e = g.takeEvent())
    if (e == pong::Event::Smash) ++n.smashes;
  if (g.ball() != pong::Ball::Incoming) return;
  const float x = g.ballX(now);
  const float away = x < pong::kCourtWidth / 2 ? 120.f : 8.f;
  switch (n.style) {
    case Style::Perfect:
    case Style::Smasher: g.setPaddle(x); break;
    case Style::MissEveryThird: g.setPaddle(n.incoming % 3 == 0 ? away : x); break;
    case Style::EdgeHits: g.setPaddle(x < 64 ? x + 13 : x - 13); break;
    case Style::Never: g.setPaddle(away); break;
  }
  if (n.style == Style::Smasher && !n.tapped && g.ballY(now) >= pong::kPaddleY - 40) {
    n.tapped = true;
    g.onTap(now);
  }
}

static void step(Radio& r) {
  while (!r.air.empty() && r.air.front().at <= r.now) {
    InFlight f = r.air.front();
    r.air.pop_front();
    r.nodes[f.to]->game.onPacket(f.p, r.now);
  }
  for (Node* n : r.nodes) {
    playTurn(*n, r.now);
    n->game.tick(r.now);
  }
  r.now += 5;
}

struct Pair {
  Radio r;
  Node a, b;
  Pair(int loss, uint32_t seed, Style sa, Style sb) {
    r.lossPercent = loss;
    r.rng = seed;
    const uint8_t macA[6] = {0x24, 0x0A, 0xC4, 0x00, 0x00, 0x10};
    const uint8_t macB[6] = {0x24, 0x0A, 0xC4, 0x00, 0x00, 0x22};
    memcpy(a.mac, macA, 6);
    memcpy(b.mac, macB, 6);
    a.radio = b.radio = &r;
    a.id = 0;
    b.id = 1;
    a.style = sa;
    b.style = sb;
    r.nodes = {&a, &b};
    a.game.begin(a.mac, r.now, seed, radioSend, &a);
    r.now += 70;  // B starts a moment later
    b.game.begin(b.mac, r.now, seed * 3 + 1, radioSend, &b);
  }
  void runUntilDone(uint32_t maxMs = 600000) {
    while ((a.game.active() || b.game.active()) && r.now < maxMs) step(r);
  }
  void runFor(uint32_t ms) {
    const uint32_t end = r.now + ms;
    while (r.now < end) step(r);
  }
};

static void testPong() {
  printf("pong\n");
  using namespace pong;
  {  // walls: the ball stays on screen and reverses when it bounces
    float vx = 0;
    for (int x = -300; x < 600; x += 7) {
      const float b = bounceX((float)x, 1, &vx);
      CHECK(b >= kBallR && b <= kCourtWidth - 1 - kBallR);
    }
    CHECK(fabsf(bounceX(64, 1, &vx) - 64) < 0.01f && vx > 0);
    bounceX(200, 1, &vx);
    CHECK(vx < 0);
  }
  for (int loss : {0, 40}) {  // A never misses, B misses every third ball
    Pair m(loss, 42 + loss, Style::Perfect, Style::MissEveryThird);
    m.runUntilDone();
    CHECK(m.a.game.phase() == Phase::Done && m.b.game.phase() == Phase::Done);
    CHECK(m.a.game.abortReason() == AbortReason::None);
    CHECK_EQ(m.a.game.myPoints(), kPointsToWin);
    CHECK_EQ(m.a.game.theirPoints(), 0);
    // Both Lumis agree on the final score.
    CHECK_EQ(m.b.game.myPoints(), m.a.game.theirPoints());
    CHECK_EQ(m.b.game.theirPoints(), m.a.game.myPoints());
    CHECK(m.a.game.wonMatch() && !m.b.game.wonMatch());
    CHECK_EQ(m.a.smashes, 0);  // no pats, no smashes
  }
  {  // a paddle that never reaches the ball loses every point
    Pair m(0, 6, Style::Never, Style::Perfect);
    m.runUntilDone();
    CHECK_EQ(m.b.game.myPoints(), kPointsToWin);
    CHECK_EQ(m.a.game.myPoints(), 0);
  }
  {  // patting as the ball meets the paddle smashes it
    Pair m(0, 11, Style::Smasher, Style::MissEveryThird);
    m.runUntilDone();
    CHECK(m.a.smashes > 3);
    CHECK(m.a.game.wonMatch());
  }
  {  // hitting with the paddle's edge sends the ball off at an angle
    Pair m(0, 12, Style::EdgeHits, Style::Never);
    float maxDrift = 0;
    while (m.a.game.active() && m.r.now < 120000) {
      step(m.r);
      const pong::Game& g = m.a.game;
      if (g.ball() == Ball::Outgoing && g.rally() > 0) {
        const float drift = fabsf(g.ballX(m.r.now + 100) - g.ballX(m.r.now));
        if (drift > maxDrift) maxDrift = drift;
      }
    }
    CHECK(maxDrift > 5);  // ~0.08 px/ms sideways
    CHECK(m.a.game.wonMatch());
  }
  {  // two perfect players on a lossy link: the ball is never lost, the rally
     // just goes on and speeds up to the cap
    Pair m(40, 9, Style::Perfect, Style::Perfect);
    m.runFor(90000);
    CHECK(m.a.game.phase() == Phase::Play && m.b.game.phase() == Phase::Play);
    CHECK_EQ(m.a.game.myPoints() + m.a.game.theirPoints(), 0);
    CHECK(m.a.game.rally() > 40);
    CHECK(fabsf(m.a.game.ballSpeed() - kMaxSpeed) < 0.001f || fabsf(m.b.game.ballSpeed() - kMaxSpeed) < 0.001f);
  }
  {  // nobody around -> lobby times out
    Radio r;
    Node a;
    const uint8_t mac[6] = {1, 2, 3, 4, 5, 6};
    memcpy(a.mac, mac, 6);
    a.radio = &r;
    a.id = 0;
    r.nodes = {&a};
    a.game.begin(a.mac, 0, 1, radioSend, &a);
    while (a.game.active() && r.now < 60000) step(r);
    CHECK(a.game.phase() == Phase::Done);
    CHECK(a.game.abortReason() == AbortReason::NoFriend);
  }
  {  // pal walks out of range mid-match
    Pair m(0, 3, Style::Perfect, Style::Perfect);
    while (m.a.game.phase() != Phase::Play && m.r.now < 10000) step(m.r);
    CHECK(m.a.game.phase() == Phase::Play);
    m.r.lossPercent = 100;
    while (m.a.game.active() && m.r.now < 60000) step(m.r);
    CHECK(m.a.game.abortReason() == AbortReason::PeerLost);
  }
}

// ---------------------------------------------------------------------------

static void testAnimations() {
  printf("animations\n");
  const int n = animationCount();
  printf("  %d animations, %d expressions\n", n, (int)Expr::Count);
  CHECK(n >= 60);
  std::set<std::string> names;
  for (int i = 0; i < n; ++i) {
    const Animation& a = animation(i);
    CHECK(names.insert(a.name).second);  // unique
    CHECK(a.count > 0);
    CHECK(a.moodMin <= a.moodMax);
    CHECK(animationDuration(a) > 0 && animationDuration(a) < 10000);
    CHECK_EQ(findAnimation(a.name), i);
  }
  // Every trigger the firmware uses has at least one animation, and every
  // trigger can be satisfied at both mood extremes.
  for (int t = 0; t < (int)Trigger::Count; ++t) {
    bool any = false;
    for (int i = 0; i < n; ++i) any |= animation(i).trigger == (Trigger)t;
    if (!any) printf("  no animation for trigger %s\n", triggerName((Trigger)t));
    CHECK(any);
  }
  Animator anim;
  anim.begin(0, 1);
  for (int t = 0; t < (int)Trigger::Count; ++t) {
    CHECK(anim.play((Trigger)t, 0) >= 0);
    CHECK(anim.play((Trigger)t, 100) >= 0);
  }
  // Playing runs to completion and returns to rest.
  anim.begin(0, 2);
  anim.setIdleEnabled(false);
  const int idx = findAnimation("shake_dizzy");
  anim.playIndex(idx);
  uint32_t t = 0;
  for (; t < 20000 && anim.busy(); t += 33) anim.update(t);
  CHECK(!anim.busy());
  CHECK(t >= animationDuration(animation(idx)));
  // Idle animations fire on their own.
  anim.setIdleEnabled(true);
  bool fired = false;
  for (uint32_t e = 0; e < 15000; e += 33) {
    anim.update(t + e);
    fired |= anim.busy();
  }
  CHECK(fired);
}

static void testGfxAndFace() {
  printf("gfx\n");
  Canvas c;
  c.pixel(0, 0);
  c.pixel(127, 63);
  c.pixel(10, 20);
  Canvas d = c;
  d.rotate180();
  CHECK(d.get(127, 63) && d.get(0, 0) && d.get(117, 43) && !d.get(10, 20));
  d.rotate180();
  CHECK(memcmp(c.buf, d.buf, kBufferSize) == 0);
  CHECK_EQ(Canvas::textWidth("BOOP!", 1), 29);
  CHECK_EQ(Canvas::textWidth("", 2), 0);

  // Every expression draws something and stays on screen without crashing.
  for (int e = 0; e < (int)Expr::Count; ++e) {
    Canvas f;
    drawFace(f, expression((Expr)e), 1234);
    int lit = 0;
    for (int i = 0; i < kBufferSize; ++i) lit += __builtin_popcount(f.buf[i]);
    if (lit < 40) printf("  expression %s only lit %d px\n", exprName((Expr)e), lit);
    CHECK(lit >= 40);
  }
  // Extreme gaze / offsets must clip cleanly.
  Face f = expression(Expr::Love);
  f.lookX = 200;
  f.lookY = -200;
  f.fx = 0xFFFF;
  Canvas big;
  drawFace(big, f, 99);
  CHECK(true);
}

static void testMood() {
  printf("mood\n");
  MoodState s;
  Mood m(&s);
  CHECK_EQ(s.magic, Mood::kMagic);
  const int h0 = m.happiness();
  for (int i = 0; i < 5; ++i) m.onPat();
  CHECK(m.happiness() > h0);
  for (int i = 0; i < 30; ++i) m.onShake();
  CHECK(m.happiness() >= 5);
  CHECK(m.restingExpression() == Expr::Sad);
  m.tickAsleep(8 * 3600);
  CHECK_EQ(m.energy(), 100);
  for (int i = 0; i < 40; ++i) m.onDoublePat();
  CHECK(m.restingExpression() == Expr::Happy);
  m.tickAwake(130 * 60000u, false);
  CHECK(m.restingExpression() == Expr::Sleepy);
  // Persisted state survives a "reboot".
  Mood again(&s);
  CHECK_EQ(again.state().pats, 5u);
}


// ---------------------------------------------------------------------------
// Whole-app behaviour with a fake HAL.

static void testApp() {
  printf("app\n");
  using sim::Driver;
  using sim::FakeHal;
  {  // left face-up on a desk -> falls asleep by itself
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::PowerOn, 0);
    Driver d(app, hal);
    d.orient(0, 0, 1);
    d.run(30000);
    CHECK(!app.wantsSleep());
    d.run(25000);
    CHECK(app.wantsSleep());
  }
  {  // woken by motion but nobody plays -> back to sleep after the grace period
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::Motion, 3600);
    Driver d(app, hal);
    d.run(15000);
    CHECK(!app.wantsSleep());
    d.run(12000);
    CHECK(app.wantsSleep());
  }
  {  // pats keep it awake, make it happier and play pat animations
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::Motion, 60);
    Driver d(app, hal);
    d.run(4000);
    const int h0 = app.mood().happiness();
    d.pat();
    d.run(100);
    CHECK(app.animator().busy());
    CHECK(animation(app.animator().current()).trigger == Trigger::Pat);
    for (int i = 0; i < 5; ++i) {
      d.run(15000);
      d.pat();
    }
    CHECK(!app.wantsSleep());
    CHECK(app.mood().happiness() > h0);
  }
  {  // lay it face-down -> sleeps quickly
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::PowerOn, 0);
    Driver d(app, hal);
    d.run(3000);
    d.orient(0, 0, -1);
    d.run(3500);
    CHECK(app.wantsSleep());
  }
  {  // flip upside-down, flip back -> menu; tilt right, pat -> battery screen
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::PowerOn, 0);
    Driver d(app, hal);
    d.run(3000);
    d.orient(0, -1, 0);
    d.run(2500);
    CHECK(app.mode() == App::Mode::Pet);
    d.orient(0, 1, 0);
    d.run(800);
    CHECK(app.mode() == App::Mode::Menu);
    d.orient(-0.9f, 0.35f, 0);  // right side down
    d.run(700);
    d.orient(0, 1, 0);
    d.run(700);
    d.pat();
    d.run(100);
    CHECK(app.mode() == App::Mode::Battery);
    d.run(4500);
    CHECK(app.mode() == App::Mode::Pet);
  }
  {  // quick flip (no hold) does not open the menu
    FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::PowerOn, 0);
    Driver d(app, hal);
    d.run(3000);
    d.orient(0, -1, 0);
    d.run(700);
    d.orient(0, 1, 0);
    d.run(800);
    CHECK(app.mode() == App::Mode::Pet);
  }
  {  // two Lumis play a full Boop Pong match through the menus
    sim::FakeAir air;
    FakeHal ha, hb;
    ha.mac[5] = 0x01;
    hb.mac[5] = 0x02;
    hb.rng = 0xBEEF;
    ha.air = hb.air = &air;
    air.hals = {&ha, &hb};
    MoodState ma, mb;
    App a(ha, &ma), b(hb, &mb);
    ha.app = &a;
    hb.app = &b;
    a.begin(WakeReason::PowerOn, 0);
    b.begin(WakeReason::PowerOn, 0);
    Driver da(a, ha), db(b, hb);
    Driver* drv[2] = {&da, &db};
    auto both = [&](uint32_t ms) {
      for (uint32_t e = 0; e < ms; e += 10) {
        da.step();
        db.step();
        air.deliver(ha.now);
      }
    };
    both(3000);
    for (Driver* d : drv) d->orient(0, -1, 0);
    both(2000);
    for (Driver* d : drv) d->orient(0, 1, 0);
    both(800);
    CHECK(a.mode() == App::Mode::Menu && b.mode() == App::Mode::Menu);
    da.queuePat();
    db.queuePat();
    both(100);
    CHECK(a.mode() == App::Mode::Pong && b.mode() == App::Mode::Pong);

    // A steers its paddle under the ball by tilting; B leans hard left and
    // never moves.
    db.orient(0.9f, 0.4f, 0);
    int hits = 0;
    pong::Ball last = pong::Ball::None;
    for (int i = 0; i < 30000 && (a.mode() == App::Mode::Pong || b.mode() == App::Mode::Pong); ++i) {
      const pong::Game& g = a.game();
      if (g.ball() == pong::Ball::Outgoing && last == pong::Ball::Incoming) ++hits;
      last = g.ball();
      if (g.ball() == pong::Ball::Incoming) {
        // Tilt so the paddle lines up with where the ball is now.
        const float want = (g.ballX(ha.now) - 64) / (64 - pong::kPaddleHalf);
        const float gx = -0.5f * (want < -1 ? -1 : (want > 1 ? 1 : want));
        da.orient(gx, sqrtf(1 - gx * gx), 0);
      }
      both(10);
    }
    CHECK(hits >= 2);
    CHECK(a.mode() == App::Mode::Pet && b.mode() == App::Mode::Pet);
    CHECK_EQ(ma.gamesPlayed, 1u);
    CHECK_EQ(mb.gamesPlayed, 1u);
    CHECK_EQ(ma.gamesWon, 1u);
    CHECK_EQ(mb.gamesWon, 0u);
    CHECK(!ha.radioOn && !hb.radioOn);
  }
  CHECK_EQ(batteryPercent(4200), 100);
  CHECK_EQ(batteryPercent(3300), 0);
  CHECK_EQ(batteryPercent(3850), 56);
}

// ---------------------------------------------------------------------------
// Personalities, emotion packs and factory provisioning.

static std::vector<uint8_t> readFile(const char* path) {
  std::vector<uint8_t> v;
  FILE* f = fopen(path, "rb");
  if (!f) return v;
  uint8_t buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof(buf), f)) > 0) v.insert(v.end(), buf, buf + n);
  fclose(f);
  return v;
}

static int litPixels(const Canvas& c) {
  int lit = 0;
  for (int i = 0; i < kBufferSize; ++i) lit += __builtin_popcount(c.buf[i]);
  return lit;
}

struct Lines {
  std::vector<std::string> v;
  static void out(void* ctx, const char* line) { static_cast<Lines*>(ctx)->v.push_back(line); }
  const std::string& last() const { return v.back(); }
};

static void testPersonality() {
  printf("personality\n");
  {  // the built-in expressions look exactly as they did before genes existed
    const std::vector<uint8_t> golden = readFile("golden/expressions.frames");
    CHECK_EQ(golden.size(), (size_t)Expr::Count * kBufferSize);
    for (int e = 0; e < (int)Expr::Count && golden.size() == (size_t)Expr::Count * kBufferSize; ++e) {
      Canvas c;
      drawFace(c, expression((Expr)e), 600);
      CHECK(memcmp(c.buf, golden.data() + e * kBufferSize, kBufferSize) == 0);
    }
  }
  {  // deterministic from a seed
    char a[16], b[16];
    for (uint64_t seed = 1; seed < 200; seed += 7) {
      CHECK_EQ(genesCode(genesFromSeed(seed)), genesCode(genesFromSeed(seed)));
      CHECK(genesValid(genesFromSeed(seed)));
      nameFromSeed(seed, a, sizeof(a));
      nameFromSeed(seed, b, sizeof(b));
      CHECK(strcmp(a, b) == 0 && strlen(a) >= 2);
    }
    CHECK_EQ(lookCount(), 108000u);
  }
  {  // rarity mix and how often automatic looks repeat
    int tiers[4] = {0};
    std::set<uint32_t> looks;
    const int n = 100000;
    for (int i = 0; i < n; ++i) {
      const Genes g = genesFromSeed(0x240AC4000000ull + (uint64_t)i * 977u);
      ++tiers[(int)rarityOf(g)];
      looks.insert(genesCode(g));
    }
    printf("  rarity %.1f/%.1f/%.1f/%.1f%%, %zu distinct looks in %d units\n", 100.0 * tiers[0] / n,
           100.0 * tiers[1] / n, 100.0 * tiers[2] / n, 100.0 * tiers[3] / n, looks.size(), n);
    CHECK(fabs(100.0 * tiers[0] / n - 60) < 3);
    CHECK(fabs(100.0 * tiers[1] / n - 25) < 3);
    CHECK(fabs(100.0 * tiers[2] / n - 12) < 2);
    CHECK(fabs(100.0 * tiers[3] / n - 3) < 1);
    CHECK(looks.size() > 30000);
  }
  {  // every eye geometry keeps every expression on screen and visible
    int bad = 0;
    for (int shape = 0; shape < geneOptions(kGeneEyeShape); ++shape)
      for (int size = 0; size < geneOptions(kGeneEyeSize); ++size)
        for (int sp = 0; sp < geneOptions(kGeneSpacing); ++sp)
          for (int h = 0; h < geneOptions(kGeneHeight); ++h) {
            Genes g;
            g.eyeShape = shape;
            g.eyeSize = size;
            g.spacing = sp;
            g.height = h;
            g.shine = (shape + size) % geneOptions(kGeneShine);
            g.accent = (sp + h + shape) % geneOptions(kGeneAccent);
            for (int e = 0; e < (int)Expr::Count; ++e) {
              const Face f = personalize(expression((Expr)e), g);
              const float left = kWidth / 2.f - f.spacing / 2 - f.eyeW * f.scaleL / 2;
              const float right = kWidth / 2.f + f.spacing / 2 + f.eyeW * f.scaleR / 2;
              const float top = f.eyeY - f.eyeH * (f.scaleL > f.scaleR ? f.scaleL : f.scaleR) / 2;
              const float gap = (f.spacing - f.eyeW * (f.scaleL + f.scaleR) / 2);  // between the eyes
              Canvas c;
              drawFace(c, f, 600);
              if (left < 0 || right > kWidth || top < 0 || gap < 2 || litPixels(c) < 40) ++bad;
            }
          }
    if (bad) printf("  %d personalized expressions off screen or blank\n", bad);
    CHECK_EQ(bad, 0);
  }

  // A pack with two custom faces, two animations and a persona.
  static Pack pack;
  pack.clear();
  Face wink = expression(Expr::Wink);
  wink.accent = Accent::Lashes;
  wink.eyeW = 31.5f;
  const int fWink = pack.addFace(wink);
  Face proud = expression(Expr::Smug);
  proud.cheek = 0.4f;
  proud.fx = kFxSparkles;
  const int fProud = pack.addFace(proud);
  const Key k1[] = {{Expr::Neutral, 0, 0, Motion::Hop, 150, 600, 0, kKeep, kKeep, pack.faces() + fWink},
                    {Expr::Neutral, 4, -2, Motion::None, 200, 500, kFxHearts, kKeep, kKeep, pack.faces() + fProud}};
  const Key k2[] = {{Expr::Joy, 0, 0, Motion::Bounce, 120, 800, 0, kKeep, (int8_t)Mouth::Cat, nullptr}};
  CHECK_EQ(pack.addAnimation("signature_wink", Trigger::Pat, 40, 100, 3, k1, 2), 0);
  CHECK_EQ(pack.addAnimation("signature_bounce", Trigger::DoublePat, 0, 100, 1, k2, 1), 1);
  PackPersona persona;
  persona.present = true;
  strcpy(persona.name, "Starla");
  strcpy(persona.serial, "LUMI-000421");
  persona.genes.eyeShape = 2;
  persona.genes.shine = 4;
  persona.genes.accent = 1;
  persona.genes.temperament = (uint8_t)Temperament::Hyper;
  persona.favouriteCount = 1;
  strcpy(persona.favourites[0], "signature_wink");
  pack.setPersona(persona);

  static uint8_t bytes[kPackMaxBytes], again[kPackMaxBytes];
  const size_t len = pack.encode(bytes, sizeof(bytes));
  CHECK(len > kPackHeaderBytes);
  {  // round trip: decoding and re-encoding gives the same bytes
    static Pack decoded;
    CHECK(decoded.decode(bytes, len) == Pack::Error::None);
    CHECK_EQ(decoded.faceCount(), 2);
    CHECK_EQ(decoded.animationCount(), 2);
    CHECK(decoded.persona().present && strcmp(decoded.persona().name, "Starla") == 0);
    CHECK_EQ(genesCode(decoded.persona().genes), genesCode(persona.genes));
    CHECK(decoded.animation(0).keys[0].face == decoded.faces() + 0);
    CHECK(decoded.animation(1).keys[0].face == nullptr && decoded.animation(1).keys[0].expr == Expr::Joy);
    CHECK_EQ(decoded.animation(0).weight, 3);
    const size_t len2 = decoded.encode(again, sizeof(again));
    CHECK_EQ(len2, len);
    CHECK(memcmp(bytes, again, len) == 0);
    // Quantization keeps the face the same on screen.
    Canvas a, b;
    drawFace(a, wink, 300);
    drawFace(b, decoded.face(0), 300);
    CHECK(memcmp(a.buf, b.buf, kBufferSize) == 0);
  }
  {  // damaged packs are refused with a reason
    static Pack p;
    static uint8_t bad[kPackMaxBytes];
    memcpy(bad, bytes, len);
    bad[len - 3] ^= 0x40;
    CHECK(p.decode(bad, len) == Pack::Error::BadCrc);
    CHECK(p.empty());
    CHECK(p.decode(bytes, len - 1) == Pack::Error::BadLength);
    CHECK(p.decode(bytes, 10) == Pack::Error::TooShort);
    memcpy(bad, bytes, len);
    bad[0] = 'X';
    CHECK(p.decode(bad, len) == Pack::Error::BadMagic);
    memcpy(bad, bytes, len);
    bad[4] = 9;
    CHECK(p.decode(bad, len) == Pack::Error::BadVersion);
    CHECK(p.decode(bytes, kPackMaxBytes + 1) == Pack::Error::TooBig);
    // Valid checksum, nonsense contents: an eye style that doesn't exist.
    memcpy(bad, bytes, len);
    bad[kPackHeaderBytes + 4 + 20] = 99;  // section header (3) + count (1) + styleL
    const uint32_t crc = Pack::crc32(bad + kPackHeaderBytes, len - kPackHeaderBytes);
    for (int i = 0; i < 4; ++i) bad[12 + i] = (uint8_t)(crc >> (8 * i));
    CHECK(p.decode(bad, len) == Pack::Error::BadData);
  }
  {  // pack animations join the registry and play with their custom faces
    const int before = animationCount();
    registerPack(1, &pack);
    CHECK_EQ(animationCount(), before + 2);
    const int idx = findAnimation("signature_wink");
    CHECK(idx >= builtinAnimationCount());
    Animator anim;
    anim.begin(0, 5);
    anim.setIdleEnabled(false);
    anim.playIndex(idx);
    uint32_t t = 0;
    bool sawLashes = false;
    for (; t < 10000 && anim.busy(); t += 33) {
      anim.update(t);
      sawLashes |= anim.face().accent == Accent::Lashes;
    }
    CHECK(sawLashes);
    CHECK(!anim.busy());
    // Favourites are picked about 3x as often as the rest.
    int fav = idx, hits = 0, plays = 3000, pats = 0;
    for (int i = 0; i < animationCount(); ++i) pats += animation(i).trigger == Trigger::Pat && 60 >= animation(i).moodMin && 60 <= animation(i).moodMax;
    anim.setFavourites(&fav, 1);
    for (int i = 0; i < plays; ++i) {
      anim.stop();
      hits += anim.play(Trigger::Pat, 60) == fav;
    }
    // weight 3 x favourite 3 = 9 shares against 1 for each other pat animation
    const double expected = 9.0 / (9.0 + (pats - 1));
    printf("  favourite picked %.0f%% (expected ~%.0f%%)\n", 100.0 * hits / plays, 100 * expected);
    CHECK(fabs((double)hits / plays - expected) < 0.05);
    registerPack(1, nullptr);
    CHECK_EQ(animationCount(), before);
  }
  {  // a unit with nothing stored gets its automatic persona from the MAC
    sim::FakeHal hal;
    MoodState ms;
    App app(hal, &ms);
    app.begin(WakeReason::PowerOn, 0);
    uint64_t seed = 0;
    for (int i = 0; i < 6; ++i) seed = seed << 8 | hal.mac[i];
    char name[16];
    nameFromSeed(seed, name, sizeof(name));
    CHECK(!app.personaAssigned());
    CHECK(strcmp(app.name(), name) == 0);
    CHECK_EQ(genesCode(app.genes()), genesCode(genesFromSeed(seed)));

    // Factory provisioning over the serial protocol.
    SerialCommands cmd(app, hal);
    Lines out;
    CHECK(cmd.handle("id", Lines::out, &out));
    CHECK(out.last().find("persona=auto") != std::string::npos);
    CHECK(!cmd.handle("i", Lines::out, &out));  // not ours: the firmware's debug command

    char line[SerialCommands::kMaxLine];
    auto upload = [&](const uint8_t* data, size_t n, uint32_t crc) {
      snprintf(line, sizeof(line), "persona begin %zu", n);
      cmd.handle(line, Lines::out, &out);
      for (size_t off = 0; off < n; off += 64) {
        int p = snprintf(line, sizeof(line), "persona put %zu ", off);
        for (size_t i = off; i < n && i < off + 64; ++i) p += snprintf(line + p, sizeof(line) - p, "%02x", data[i]);
        cmd.handle(line, Lines::out, &out);
      }
      snprintf(line, sizeof(line), "persona commit %08X", crc);
      cmd.handle(line, Lines::out, &out);
      return out.last();
    };
    CHECK(upload(bytes, len, Pack::crc32(bytes, len) ^ 1).rfind("err crc mismatch", 0) == 0);
    CHECK(!app.personaAssigned());
    CHECK(upload(bytes, len, Pack::crc32(bytes, len)) == "ok commit");
    CHECK(app.personaAssigned());
    CHECK(strcmp(app.name(), "Starla") == 0);
    CHECK(strcmp(app.serial(), "LUMI-000421") == 0);
    CHECK(findAnimation("signature_bounce") >= 0);
    cmd.handle("id", Lines::out, &out);
    CHECK(out.last().find("persona=assigned name=Starla") != std::string::npos);

    // Read it back byte for byte.
    out.v.clear();
    cmd.handle("persona get", Lines::out, &out);
    std::string hex;
    for (const std::string& l : out.v)
      if (l.rfind("data ", 0) == 0) hex += l.substr(l.find(' ', 5) + 1);
    CHECK_EQ(hex.size(), len * 2);
    bool same = hex.size() == len * 2;
    for (size_t i = 0; same && i < len; ++i) same = (uint8_t)strtoul(hex.substr(i * 2, 2).c_str(), nullptr, 16) == bytes[i];
    CHECK(same);
    CHECK(out.v.back() == "end");

    // A pack with a valid checksum but broken contents is refused and the
    // assigned persona stays.
    static uint8_t bad[kPackMaxBytes];
    memcpy(bad, bytes, len);
    bad[kPackHeaderBytes + 4 + 22] = 77;  // mouth that doesn't exist
    const uint32_t c2 = Pack::crc32(bad + kPackHeaderBytes, len - kPackHeaderBytes);
    for (int i = 0; i < 4; ++i) bad[12 + i] = (uint8_t)(c2 >> (8 * i));
    CHECK(upload(bad, len, Pack::crc32(bad, len)) == "err invalid contents");
    CHECK(app.personaAssigned() && strcmp(app.name(), "Starla") == 0);

    // It survives a reboot (same storage, new App).
    App app2(hal, &ms);
    app2.begin(WakeReason::Motion, 10);
    CHECK(app2.personaAssigned() && strcmp(app2.name(), "Starla") == 0);

    // Clearing goes back to the automatic persona.
    cmd.handle("persona clear", Lines::out, &out);
    CHECK(out.last() == "ok clear");
    CHECK(!app.personaAssigned() && strcmp(app.name(), name) == 0);
    cmd.handle("persona get", Lines::out, &out);
    CHECK(out.last() == "persona none");
    cmd.handle("persona put 0 00", Lines::out, &out);
    CHECK(out.last().rfind("err", 0) == 0);
    registerPack(1, nullptr);
  }
}

int main() {
  testGfxAndFace();
  testGestures();
  testPong();
  testAnimations();
  testMood();
  testApp();
  testPersonality();
  printf("\n%d checks, %d failures\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
