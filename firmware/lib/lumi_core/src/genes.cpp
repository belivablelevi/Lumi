#include "genes.h"

#include <math.h>
#include <string.h>

#include "rng.h"

namespace lumi {

namespace {

struct EyeShape {
  const char* name;
  float w, h, r, slant;
  uint16_t weight;
};

// Base eye geometry per shape, relative to the classic 28 x 34 eye.
const EyeShape kEyeShapes[] = {
    {"classic", 28, 34, 10, 0, 30}, {"round", 30, 30, 15, 0, 20},  {"pill", 22, 38, 11, 0, 15},
    {"wide", 34, 26, 10, 0, 12},    {"boxy", 28, 30, 4, 0, 10},    {"almond", 30, 26, 10, 3, 6},
    {"droopy", 28, 30, 10, -3, 5},  {"tiny", 18, 22, 8, 0, 2},
};

const char* const kSizeNames[] = {"smallest", "small", "medium", "big", "biggest"};
const float kSizes[] = {0.85f, 0.92f, 1.0f, 1.08f, 1.15f};
const uint16_t kSizeWeights[] = {10, 20, 40, 20, 10};

const char* const kSpacingNames[] = {"closest", "close", "normal", "apart", "far apart"};
const float kSpacing[] = {-8, -4, 0, 4, 8};
const uint16_t kSpacingWeights[] = {10, 20, 40, 20, 10};

const char* const kEyeHeightNames[] = {"high", "middle", "low"};
const float kEyeHeight[] = {-2, 0, 2};
const uint16_t kEyeHeightWeights[] = {25, 50, 25};

const char* const kShineNames[] = {"square", "none", "dot", "double", "star", "ring"};
const uint16_t kShineWeights[] = {40, 8, 25, 15, 8, 4};

const char* const kAccentNames[] = {"none", "lashes", "brows", "freckles", "blush", "beauty mark"};
const uint16_t kAccentWeights[] = {55, 12, 12, 10, 8, 3};

const char* const kTemperamentNames[] = {"cheerful", "sleepy", "shy", "grumpy", "hyper"};
const uint16_t kTemperamentWeights[] = {30, 20, 20, 15, 15};

const TemperamentTraits kTraits[] = {
    {75, 1.0f, 1.0f, -8, {"pat_giggle", "dance", "hum", "sparkle"}},
    {60, 1.6f, 1.4f, 0, {"yawn", "nod_off", "zone_out", nullptr}},
    {62, 1.0f, 1.1f, 0, {"pat_shy", "shy", "squish", nullptr}},
    {45, 1.0f, 1.0f, 10, {"side_eye", "idle_pout", "pat_grumpy", "smug"}},
    {70, 1.3f, 0.6f, -4, {"dance", "cross_eyed", "double_pat_stars", "sparkle"}},
};

const uint8_t kOptionCounts[kGeneCount] = {8, 5, 5, 3, 6, 6, 5};

// Probability thresholds between tiers, chosen so that genes drawn from the
// weights come out roughly 60% common, 25% uncommon, 12% rare, 3% legendary
// (computed by enumerating every combination; see tests/test_core.cpp).
const double kUncommonBelow = 2.4000e-5;
const double kRareBelow = 6.6000e-6;
const double kLegendaryBelow = 1.6200e-6;

uint64_t mix64(uint64_t x) {
  x ^= x >> 33;
  x *= 0xFF51AFD7ED558CCDull;
  x ^= x >> 33;
  x *= 0xC4CEB9FE1A85EC53ull;
  x ^= x >> 33;
  return x;
}

uint16_t totalWeight(GeneId g) {
  uint16_t t = 0;
  for (int i = 0; i < geneOptions(g); ++i) t += geneWeight(g, i);
  return t;
}

uint8_t pick(Rng& rng, GeneId g) {
  int r = rng.range(0, totalWeight(g) - 1);
  for (int i = 0; i < geneOptions(g); ++i) {
    r -= geneWeight(g, i);
    if (r < 0) return (uint8_t)i;
  }
  return 0;
}

}  // namespace

int geneOptions(GeneId g) { return g < kGeneCount ? kOptionCounts[g] : 0; }

const char* geneName(GeneId g) {
  static const char* const kNames[] = {"eye shape", "eye size", "eye spacing", "eye height",
                                       "highlight", "accent",   "temperament"};
  return g < kGeneCount ? kNames[g] : "?";
}

const char* geneOptionName(GeneId g, int o) {
  if (o < 0 || o >= geneOptions(g)) return "?";
  switch (g) {
    case kGeneEyeShape: return kEyeShapes[o].name;
    case kGeneEyeSize: return kSizeNames[o];
    case kGeneSpacing: return kSpacingNames[o];
    case kGeneHeight: return kEyeHeightNames[o];
    case kGeneShine: return kShineNames[o];
    case kGeneAccent: return kAccentNames[o];
    case kGeneTemperament: return kTemperamentNames[o];
    default: return "?";
  }
}

uint16_t geneWeight(GeneId g, int o) {
  if (o < 0 || o >= geneOptions(g)) return 0;
  switch (g) {
    case kGeneEyeShape: return kEyeShapes[o].weight;
    case kGeneEyeSize: return kSizeWeights[o];
    case kGeneSpacing: return kSpacingWeights[o];
    case kGeneHeight: return kEyeHeightWeights[o];
    case kGeneShine: return kShineWeights[o];
    case kGeneAccent: return kAccentWeights[o];
    case kGeneTemperament: return kTemperamentWeights[o];
    default: return 0;
  }
}

uint8_t geneValue(const Genes& x, GeneId g) {
  switch (g) {
    case kGeneEyeShape: return x.eyeShape;
    case kGeneEyeSize: return x.eyeSize;
    case kGeneSpacing: return x.spacing;
    case kGeneHeight: return x.height;
    case kGeneShine: return x.shine;
    case kGeneAccent: return x.accent;
    case kGeneTemperament: return x.temperament;
    default: return 0;
  }
}

void setGene(Genes& x, GeneId g, uint8_t v) {
  switch (g) {
    case kGeneEyeShape: x.eyeShape = v; break;
    case kGeneEyeSize: x.eyeSize = v; break;
    case kGeneSpacing: x.spacing = v; break;
    case kGeneHeight: x.height = v; break;
    case kGeneShine: x.shine = v; break;
    case kGeneAccent: x.accent = v; break;
    case kGeneTemperament: x.temperament = v; break;
    default: break;
  }
}

bool genesValid(const Genes& x) {
  for (int g = 0; g < kGeneCount; ++g)
    if (geneValue(x, (GeneId)g) >= geneOptions((GeneId)g)) return false;
  return true;
}

uint32_t lookCount() {
  uint32_t n = 1;
  for (int g = 0; g < kGeneCount; ++g) n *= geneOptions((GeneId)g);
  return n;
}

uint32_t genesCode(const Genes& x) {
  uint32_t code = 0;
  for (int g = 0; g < kGeneCount; ++g) code = code * geneOptions((GeneId)g) + geneValue(x, (GeneId)g);
  return code;
}

double genesProbability(const Genes& x) {
  double p = 1;
  for (int g = 0; g < kGeneCount; ++g)
    p *= (double)geneWeight((GeneId)g, geneValue(x, (GeneId)g)) / totalWeight((GeneId)g);
  return p;
}

Rarity rarityOf(const Genes& x) {
  const double p = genesProbability(x);
  if (p < kLegendaryBelow) return Rarity::Legendary;
  if (p < kRareBelow) return Rarity::Rare;
  if (p < kUncommonBelow) return Rarity::Uncommon;
  return Rarity::Common;
}

const char* rarityName(Rarity r) {
  static const char* const kNames[] = {"common", "uncommon", "rare", "legendary"};
  return (int)r < (int)Rarity::Count ? kNames[(int)r] : "?";
}

const char* temperamentName(Temperament t) {
  return (int)t < (int)Temperament::Count ? kTemperamentNames[(int)t] : "?";
}

Genes genesFromSeed(uint64_t seed) {
  const uint64_t h = mix64(seed ^ 0x4C554D4947454E45ull);  // "LUMIGENE"
  Rng rng((uint32_t)(h ^ (h >> 32)));
  Genes x;
  x.eyeShape = pick(rng, kGeneEyeShape);
  x.eyeSize = pick(rng, kGeneEyeSize);
  x.spacing = pick(rng, kGeneSpacing);
  x.height = pick(rng, kGeneHeight);
  x.shine = pick(rng, kGeneShine);
  x.accent = pick(rng, kGeneAccent);
  x.temperament = pick(rng, kGeneTemperament);
  return x;
}

void nameFromSeed(uint64_t seed, char* out, int size) {
  static const char* const kStart[] = {"Pi", "Lu", "Mo", "Ki", "Bo", "Zu", "Ni", "Ta",
                                       "Ro", "Fi", "Ka", "Mi", "No", "Pu", "Yo", "Ze"};
  static const char* const kMid[] = {"po", "li", "mo", "ki", "bu", "nu", "ra", "zi", "to", "ba", "", ""};
  static const char* const kEnd[] = {"", "", "", "p", "x", "n", "o", "bit", "ko", "s"};
  const uint64_t h = mix64(seed ^ 0x4C554D494E414D45ull);  // "LUMINAME"
  Rng rng((uint32_t)(h ^ (h >> 32)));
  const char* a = kStart[rng.range(0, 15)];
  const char* b = kMid[rng.range(0, 11)];
  const char* c = kEnd[rng.range(0, 9)];
  if (size <= 0) return;
  out[0] = 0;
  strncat(out, a, size - 1);
  strncat(out, b, size - 1 - strlen(out));
  strncat(out, c, size - 1 - strlen(out));
}

Face personalize(const Face& in, const Genes& x) {
  if (!genesValid(x)) return in;
  Face f = in;
  const EyeShape& s = kEyeShapes[x.eyeShape];
  const float size = kSizes[x.eyeSize];
  float sx = s.w / 28.f * size, sy = s.h / 34.f * size;
  if (34 * sy > 40) sy = 40.f / 34;  // keep tall eyes on screen
  f.eyeW *= sx;
  f.eyeH *= sy;
  f.eyeR *= s.r / 10.f * size;
  f.spacing += kSpacing[x.spacing];
  f.eyeY += kEyeHeight[x.height];
  f.baseSlant += s.slant;
  // Keep the biggest looks on screen and the eyes apart.
  const float scale = f.scaleL > f.scaleR ? f.scaleL : f.scaleR;
  const float top = f.eyeY - f.eyeH * scale / 2;
  if (top < 1) f.eyeY += 1 - top;
  const float gap = f.spacing - f.eyeW * (f.scaleL + f.scaleR) / 2;
  if (gap < 3) f.spacing += 3 - gap;
  if (f.shineStyle == Shine::Square) f.shineStyle = (Shine)x.shine;
  if (f.accent == Accent::None) f.accent = (Accent)x.accent;
  return f;
}

const TemperamentTraits& traits(Temperament t) {
  return kTraits[(int)t < (int)Temperament::Count ? (int)t : 0];
}

}  // namespace lumi
