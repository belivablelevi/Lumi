// Desktop simulator: renders Lumi's real firmware logic into frame files that
// make_previews.py turns into PNG/GIF previews.
//
// Output (in the directory given as argv[1]):
//   expressions.frames / .labels   one frame per expression
//   anim_<name>.frames             every animation, 30 fps
//   tour.frames                    a scripted session: pats, shake, menu, battle
//   screens.frames / .labels       stills of each UI screen
// A .frames file is a sequence of raw 1024-byte SSD1306 page buffers.
#include <stdio.h>
#include <string.h>

#include <string>
#include <vector>

#include "animations.h"
#include "animator.h"
#include "app.h"
#include "face.h"
#include "fake_hal.h"

using namespace lumi;

namespace {

std::string g_out;

struct Clip {
  std::vector<uint8_t> data;
  std::vector<std::string> labels;
  void add(const Canvas& c, const std::string& label = "") {
    data.insert(data.end(), c.buf, c.buf + kBufferSize);
    labels.push_back(label);
  }
  void save(const std::string& name, bool withLabels = false) const {
    FILE* f = fopen((g_out + "/" + name + ".frames").c_str(), "wb");
    fwrite(data.data(), 1, data.size(), f);
    fclose(f);
    if (withLabels) {
      FILE* l = fopen((g_out + "/" + name + ".labels").c_str(), "w");
      for (auto& s : labels) fprintf(l, "%s\n", s.c_str());
      fclose(l);
    }
  }
};

void renderExpressions() {
  Clip clip;
  for (int e = 0; e < (int)Expr::Count; ++e) {
    Canvas c;
    drawFace(c, expression((Expr)e), 600);
    clip.add(c, exprName((Expr)e));
  }
  clip.save("expressions", true);
}

void renderAnimations() {
  FILE* index = fopen((g_out + "/animations.txt").c_str(), "w");
  for (int i = 0; i < animationCount(); ++i) {
    const Animation& a = animation(i);
    Animator anim;
    anim.begin(0, 1000 + i);
    anim.setIdleEnabled(false);
    anim.update(0);
    anim.playIndex(i);
    Clip clip;
    const uint32_t len = animationDuration(a) + 400;
    for (uint32_t t = 0; t <= len; t += 33) {
      anim.update(t);
      Canvas c;
      drawFace(c, anim.face(), t);
      clip.add(c);
    }
    clip.save(std::string("anim_") + a.name);
    fprintf(index, "%s %s %u\n", a.name, triggerName(a.trigger), (unsigned)animationDuration(a));
  }
  fclose(index);
}

// A scripted session on device A, with device B as a battle partner.
struct Tour {
  sim::FakeAir air;
  sim::FakeHal ha, hb;
  MoodState ma, mb;
  App a{ha, &ma}, b{hb, &mb};
  sim::Driver da{a, ha}, db{b, hb};
  Clip frames, screens;
  std::string lastScreen;
  bool recordB = false;

  Tour() {
    ha.mac[5] = 1;
    hb.mac[5] = 2;
    hb.rng = 0xBEEF;
    ha.air = hb.air = &air;
    air.hals = {&ha, &hb};
    ha.app = &a;
    hb.app = &b;
    da.onTick = [](void* ctx, uint32_t now) { static_cast<Tour*>(ctx)->tick(now); };
    da.ctx = this;
  }

  std::string screenName() {
    std::string s = App::modeName(a.mode());
    if (a.mode() == App::Mode::Battle) s += std::string(":") + battle::phaseName(a.game().phase());
    return s;
  }

  void tick(uint32_t now) {
    db.step();
    air.deliver(now);
    if (now % 60 != 0) return;  // record at ~16 fps
    Canvas c;
    a.render(c);
    frames.add(c);
    const std::string s = screenName();
    if (s != lastScreen && a.mode() != App::Mode::Pet) {
      // Capture each new screen a little after it appears.
      pendingScreen_ = s;
      pendingAt_ = now + (a.mode() == App::Mode::Battle ? 600 : a.mode() == App::Mode::FallingAsleep ? 1500 : 300);
    }
    lastScreen = s;
    if (!pendingScreen_.empty() && now >= pendingAt_) {
      if (screenName() == pendingScreen_) screens.add(c, pendingScreen_);
      pendingScreen_.clear();
    }
  }

  void openMenu() {
    da.orient(0, -1, 0);
    db.orient(0, -1, 0);
    da.run(1900);
    da.orient(0, 1, 0);
    db.orient(0, 1, 0);
    da.run(700);
  }

  void run() {
    a.begin(WakeReason::PowerOn, 0);
    b.begin(WakeReason::PowerOn, 0);
    da.run(3000);
    da.pat();
    da.run(1400);
    da.pat();
    da.run(250);
    da.pat();
    da.run(2200);
    da.shake(900);
    da.run(2600);
    da.orient(-0.85f, 0.45f, 0);
    da.run(1500);
    da.orient(0.85f, 0.45f, 0);
    da.run(1500);
    da.orient(0, 1, 0);
    da.run(1200);

    // Menu -> battery screen.
    openMenu();
    da.orient(-0.85f, 0.45f, 0);
    db.orient(-0.85f, 0.45f, 0);
    da.run(600);
    da.orient(0, 1, 0);
    db.orient(0, 1, 0);
    da.run(1000);
    da.queuePat();
    da.run(4600);

    // Menu -> update screen, then shake to cancel.
    openMenu();
    for (int i = 0; i < 2; ++i) {
      da.orient(-0.85f, 0.45f, 0);
      da.run(600);
      da.orient(0, 1, 0);
      da.run(700);
    }
    da.queuePat();
    da.run(2500);
    da.shake(900);
    da.run(1500);

    // Both into battle (the menu opens on BATTLE).
    openMenu();
    da.queuePat();
    db.queuePat();
    da.run(100);
    const uint32_t react[2] = {210, 300};
    int lastRound[2] = {-1, -1};
    uint32_t goAt[2] = {0, 0};
    bool patted[2] = {false, false};
    bool fouled = false;
    App* apps[2] = {&a, &b};
    sim::Driver* drv[2] = {&da, &db};
    for (int i = 0; i < 6000 && a.mode() == App::Mode::Battle; ++i) {
      for (int k = 0; k < 2; ++k) {
        const battle::Game& g = apps[k]->game();
        if (g.phase() == battle::Phase::Go && lastRound[k] != g.round()) {
          lastRound[k] = g.round();
          goAt[k] = ha.now;
          patted[k] = false;
        }
        // B fouls in round 2 to show the "too early" screen.
        if (k == 1 && g.phase() == battle::Phase::Ready && g.round() == 1 && !fouled &&
            g.phaseElapsed(ha.now) > 900) {
          drv[1]->queuePat();
          fouled = true;
        }
        if (g.phase() == battle::Phase::Go && !patted[k] && ha.now >= goAt[k] + react[k]) {
          drv[k]->queuePat();
          patted[k] = true;
        }
      }
      da.run(10);
    }
    da.run(1500);

    // Ignore it face-up on the desk until it dozes off.
    da.orient(0, 0, 1);
    db.orient(0, 0, 1);
    for (int i = 0; i < 9000 && !a.wantsSleep(); ++i) da.run(10);
    da.run(500);

    frames.save("tour");
    screens.save("screens", true);
    printf("tour: %zu frames, %zu screens, A wins %lu/%lu\n", frames.labels.size(), screens.labels.size(),
           (unsigned long)ma.battlesWon, (unsigned long)ma.battlesPlayed);
  }

 private:
  std::string pendingScreen_;
  uint32_t pendingAt_ = 0;
};

}  // namespace

int main(int argc, char** argv) {
  g_out = argc > 1 ? argv[1] : ".";
  renderExpressions();
  renderAnimations();
  Tour* tour = new Tour();
  tour->run();
  delete tour;
  printf("%d expressions, %d animations -> %s\n", (int)Expr::Count, animationCount(), g_out.c_str());
  return 0;
}
