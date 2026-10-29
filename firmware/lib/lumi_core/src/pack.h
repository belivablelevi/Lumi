// Emotion packs: custom faces, animations and a unit's persona, as bytes.
//
// Lumi Studio writes packs; the firmware reads them. A pack built into the
// firmware (generated/default_pack.h) adds emotions to every unit, and a pack
// stored on one unit (written over USB at the factory) gives that unit its
// own persona and signature animations.
//
// Layout (little-endian):
//   header  "LPK1" | version u8 | flags u8 | reserved u16 | payload length u32 | CRC-32 of payload u32
//   payload sections, each: type u8 | length u16 | data
//     1 faces    count u8, then 32 bytes per face (see encodeFace)
//     2 anims    count u8, then per animation: name, trigger, mood range, weight, keys
//     3 persona  name, serial, genes, favourite animation names
// Unknown section types are skipped, so newer packs still load on older units.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "animations.h"
#include "face.h"
#include "genes.h"

namespace lumi {

constexpr int kPackMaxFaces = 32;
constexpr int kPackMaxAnims = 32;
constexpr int kPackMaxKeys = 12;
constexpr int kPackNameLen = 24;  // including the terminator
constexpr size_t kPackMaxBytes = 8192;
constexpr size_t kPackHeaderBytes = 16;
constexpr size_t kPackFaceBytes = 32;
constexpr uint8_t kPackVersion = 1;

struct PackPersona {
  bool present = false;
  char name[16] = "";
  char serial[kPackNameLen] = "";
  Genes genes;
  uint8_t favouriteCount = 0;
  char favourites[4][kPackNameLen] = {};
};

class Pack {
 public:
  enum class Error : uint8_t { None, TooShort, BadMagic, BadVersion, BadLength, BadCrc, BadData, TooBig };

  Pack() { clear(); }
  Pack(const Pack&) = delete;  // keys point into this pack's own face table
  Pack& operator=(const Pack&) = delete;

  void clear();
  Error decode(const uint8_t* data, size_t len);
  // Returns bytes written, or 0 if it does not fit.
  size_t encode(uint8_t* out, size_t cap) const;

  // Building a pack (tests, desktop tools). Keys may point at faces()[i].
  int addFace(const Face& f);
  int addAnimation(const char* name, Trigger trigger, uint8_t moodMin, uint8_t moodMax, uint8_t weight,
                   const Key* keys, int count);
  void setPersona(const PackPersona& p) { persona_ = p; }

  int faceCount() const { return faceCount_; }
  const Face& face(int i) const { return faces_[i]; }
  const Face* faces() const { return faces_; }
  int animationCount() const { return animCount_; }
  const Animation& animation(int i) const { return anims_[i]; }
  const PackPersona& persona() const { return persona_; }
  bool empty() const { return faceCount_ == 0 && animCount_ == 0 && !persona_.present; }

  static uint32_t crc32(const uint8_t* data, size_t len);
  static const char* errorName(Error e);
  static void encodeFace(const Face& f, uint8_t out[kPackFaceBytes]);
  static bool decodeFace(const uint8_t in[kPackFaceBytes], Face* f);

 private:
  int faceCount_ = 0, animCount_ = 0;
  Face faces_[kPackMaxFaces];
  Animation anims_[kPackMaxAnims];
  Key keys_[kPackMaxAnims][kPackMaxKeys];
  char names_[kPackMaxAnims][kPackNameLen];
  PackPersona persona_;
};

}  // namespace lumi
