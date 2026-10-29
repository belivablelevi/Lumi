// Personalities: what makes each Lumi look and behave a little differently.
//
// A unit's look and temperament are a handful of discrete "genes". Every
// gene option has a weight, so common looks show up often and some are rare;
// the rarity tier comes from how likely the whole combination is. Genes are
// either assigned at the factory (Lumi Studio writes them over USB) or, when
// nothing was assigned, derived from the chip's unique ID so every unit still
// gets its own look without any factory step.
#pragma once
#include <stdint.h>

#include "face.h"

namespace lumi {

enum class Temperament : uint8_t { Cheerful, Sleepy, Shy, Grumpy, Hyper, Count };
enum class Rarity : uint8_t { Common, Uncommon, Rare, Legendary, Count };

struct Genes {
  uint8_t eyeShape = 0;  // kEyeShapes
  uint8_t eyeSize = 2;   // 0 smallest .. 4 largest
  uint8_t spacing = 2;   // 0 closest .. 4 widest
  uint8_t height = 1;    // 0 high .. 2 low
  uint8_t shine = 0;     // Shine
  uint8_t accent = 0;    // Accent
  uint8_t temperament = 0;  // Temperament
};

// Number of options per gene, in Genes field order.
enum GeneId : uint8_t { kGeneEyeShape, kGeneEyeSize, kGeneSpacing, kGeneHeight, kGeneShine, kGeneAccent,
                        kGeneTemperament, kGeneCount };
int geneOptions(GeneId g);
const char* geneName(GeneId g);
const char* geneOptionName(GeneId g, int option);
uint16_t geneWeight(GeneId g, int option);
uint8_t geneValue(const Genes& genes, GeneId g);
void setGene(Genes& genes, GeneId g, uint8_t value);

// Which look combination this is: 0 .. lookCount()-1. Two units look the same
// exactly when their codes match (temperament included).
uint32_t genesCode(const Genes& g);
uint32_t lookCount();
bool genesValid(const Genes& g);

// Probability of this exact combination under the gene weights, and its tier.
double genesProbability(const Genes& g);
Rarity rarityOf(const Genes& g);
const char* rarityName(Rarity r);
const char* temperamentName(Temperament t);

// Deterministic: the same seed always gives the same genes and name.
Genes genesFromSeed(uint64_t seed);
void nameFromSeed(uint64_t seed, char* out, int size);  // e.g. "Kipo"

// Applies a unit's look to any expression, keeping the expression's own
// relative changes (surprised eyes stay bigger than neutral ones).
Face personalize(const Face& f, const Genes& g);

// Temperament effects used by Mood and Animator.
struct TemperamentTraits {
  float startHappy;      // happiness for a brand-new unit
  float energyDrain;     // multiplier on awake energy drain
  float idleInterval;    // multiplier on the gap between idle animations
  int8_t happyShift;     // shifts the happy/sad resting thresholds
  const char* favourites[4];  // animations it picks 3x as often (nullptr = unused)
};
const TemperamentTraits& traits(Temperament t);

}  // namespace lumi
