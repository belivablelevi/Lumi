// Tiny deterministic PRNG (xorshift32) so behaviour is reproducible in tests
// and in the desktop simulator.
#pragma once
#include <stdint.h>

namespace lumi {

class Rng {
 public:
  explicit Rng(uint32_t seed = 0x1234567u) { reseed(seed); }
  void reseed(uint32_t seed) { s_ = seed ? seed : 0x1234567u; }
  uint32_t next() {
    s_ ^= s_ << 13;
    s_ ^= s_ >> 17;
    s_ ^= s_ << 5;
    return s_;
  }
  // Uniform integer in [lo, hi].
  int32_t range(int32_t lo, int32_t hi) {
    if (hi <= lo) return lo;
    return lo + (int32_t)(next() % (uint32_t)(hi - lo + 1));
  }
  float unit() { return (next() >> 8) * (1.0f / 16777216.0f); }

 private:
  uint32_t s_;
};

}  // namespace lumi
