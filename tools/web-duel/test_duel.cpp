// Native check of the website's Boop Pong harness: whole matches play out,
// someone wins, the screens show the game, and new seeds deal new Lumis.
#include <stdio.h>
#include <string.h>

#include <set>
#include <string>

extern "C" {
void duel_new(unsigned seedA, unsigned seedB);
void duel_step(unsigned ms, float playerTilt, int patA, int autoA);
const unsigned char* duel_screen(int k);
float duel_tilt(int k);
int duel_state();
int duel_points(int k);
const char* duel_name(int k);
int duel_gene(int k, int g);
const char* duel_rarity(int k);
}

static int failures = 0;
#define CHECK(c)                                                  \
  do {                                                            \
    if (!(c)) {                                                   \
      printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #c);         \
      ++failures;                                                 \
    }                                                             \
  } while (0)

static int lit(const unsigned char* f) {
  int n = 0;
  for (int i = 0; i < 1024; ++i) n += __builtin_popcount(f[i]);
  return n;
}

static std::string look(int k) {
  std::string s;
  for (int g = 0; g < 7; ++g) s += char('0' + duel_gene(k, g));
  return s;
}

int main() {
  std::set<std::string> looks, names;
  for (unsigned m = 0; m < 4; ++m) {
    duel_new(1000 + m * 7919, 2000 + m * 104729);
    CHECK(duel_state() == 1);
    looks.insert(look(0));
    looks.insert(look(1));
    names.insert(duel_name(0));
    names.insert(duel_name(1));
    CHECK(strlen(duel_name(0)) > 0);
    CHECK(strlen(duel_rarity(1)) > 0);
    // Demo vs opponent until the match is decided (both sides steered).
    int steps = 0, maxLit = 0;
    float maxTilt = 0;
    while (duel_state() == 1 && steps < 30000) {
      duel_step(33, 0, 0, 1);
      ++steps;
      if (steps % 30 == 0) maxLit = lit(duel_screen(0)) > maxLit ? lit(duel_screen(0)) : maxLit;
      maxTilt = duel_tilt(1) > maxTilt ? duel_tilt(1) : maxTilt;
    }
    CHECK(duel_state() == 2);
    const int a = duel_points(0), b = duel_points(1);
    CHECK((a == 5) != (b == 5));
    CHECK(maxLit > 40);
    CHECK(maxTilt > 0.05f);
    printf("match %u: %s (%s) %d : %d %s (%s), %d s\n", m, duel_name(0), duel_rarity(0), a, b, duel_name(1),
           duel_rarity(1), steps * 33 / 1000);
    for (int i = 0; i < 300 && duel_state() == 2; ++i) duel_step(33, 0, 0, 1);
    CHECK(duel_state() == 3);
  }
  CHECK(looks.size() == 8);
  CHECK(names.size() == 8);

  // A human who never moves loses: the opponent wins 5-0... or close to it.
  duel_new(42, 43);
  duel_step(10, 0, 0, 0);
  int steps = 0;
  while (duel_state() == 1 && steps < 30000) {
    duel_step(33, 1.0f, 0, 0);  // paddle pinned to one side
    ++steps;
  }
  CHECK(duel_points(1) == 5);
  CHECK(duel_points(0) <= 2);
  printf("%s\n", failures ? "FAILED" : "duel: all checks passed");
  return failures ? 1 : 0;
}
