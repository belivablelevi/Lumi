#include "pack.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

namespace lumi {

namespace {

enum Section : uint8_t { kSecFaces = 1, kSecAnims = 2, kSecPersona = 3 };

constexpr int kEyeStyleCount = 10;  // EyeStyle::Ring + 1
constexpr int kMouthCount = 11;     // Mouth::Teeth + 1
constexpr int kMotionCount = 6;     // Motion::Hop + 1

inline uint8_t qu8(float v, float scale) {
  const float x = floorf(v * scale + 0.5f);
  return (uint8_t)(x < 0 ? 0 : (x > 255 ? 255 : x));
}
inline int8_t qi8(float v, float scale) {
  const float x = floorf(v * scale + 0.5f);
  return (int8_t)(x < -128 ? -128 : (x > 127 ? 127 : x));
}

// Little-endian writer/reader that stop quietly at the buffer's end.
struct Writer {
  uint8_t* p;
  size_t cap, n = 0;
  bool ok = true;
  void u8(uint8_t v) {
    if (n < cap) p[n] = v;
    else ok = false;
    ++n;
  }
  void u16(uint16_t v) {
    u8(v & 0xFF);
    u8(v >> 8);
  }
  void u32(uint32_t v) {
    u16(v & 0xFFFF);
    u16(v >> 16);
  }
  void bytes(const uint8_t* b, size_t len) {
    for (size_t i = 0; i < len; ++i) u8(b[i]);
  }
  void str(const char* s, size_t max) {
    size_t len = strlen(s);
    if (len > max) len = max;
    u8((uint8_t)len);
    bytes((const uint8_t*)s, len);
  }
};

struct Reader {
  const uint8_t* p;
  size_t len, n = 0;
  bool ok = true;
  uint8_t u8() {
    if (n >= len) {
      ok = false;
      return 0;
    }
    return p[n++];
  }
  uint16_t u16() {
    const uint16_t a = u8();
    return a | (uint16_t)(u8() << 8);
  }
  uint32_t u32() {
    const uint32_t a = u16();
    return a | ((uint32_t)u16() << 16);
  }
  bool str(char* out, size_t size) {
    const uint8_t l = u8();
    if (l >= size) {
      ok = false;
      return false;
    }
    for (uint8_t i = 0; i < l; ++i) out[i] = (char)u8();
    out[l] = 0;
    return ok;
  }
};

}  // namespace

uint32_t Pack::crc32(const uint8_t* data, size_t len) {
  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < len; ++i) {
    c ^= data[i];
    for (int k = 0; k < 8; ++k) c = (c >> 1) ^ (0xEDB88320u & (0u - (c & 1)));
  }
  return ~c;
}

const char* Pack::errorName(Error e) {
  switch (e) {
    case Error::None: return "ok";
    case Error::TooShort: return "too short";
    case Error::BadMagic: return "not a Lumi pack";
    case Error::BadVersion: return "unsupported version";
    case Error::BadLength: return "length mismatch";
    case Error::BadCrc: return "checksum mismatch";
    case Error::BadData: return "invalid contents";
    case Error::TooBig: return "too big";
  }
  return "?";
}

void Pack::clear() {
  faceCount_ = animCount_ = 0;
  persona_ = PackPersona();
  memset(names_, 0, sizeof(names_));
}

int Pack::addFace(const Face& f) {
  if (faceCount_ >= kPackMaxFaces) return -1;
  faces_[faceCount_] = f;
  return faceCount_++;
}

int Pack::addAnimation(const char* name, Trigger trigger, uint8_t moodMin, uint8_t moodMax, uint8_t weight,
                       const Key* keys, int count) {
  if (animCount_ >= kPackMaxAnims || count < 1 || count > kPackMaxKeys) return -1;
  const int i = animCount_++;
  snprintf(names_[i], kPackNameLen, "%s", name);
  for (int k = 0; k < count; ++k) keys_[i][k] = keys[k];
  anims_[i] = Animation{names_[i], trigger, moodMin, moodMax, keys_[i], (uint8_t)count, weight ? weight : (uint8_t)1};
  return i;
}

void Pack::encodeFace(const Face& f, uint8_t o[kPackFaceBytes]) {
  memset(o, 0, kPackFaceBytes);
  o[0] = qu8(f.eyeW, 4);
  o[1] = qu8(f.eyeH, 4);
  o[2] = qu8(f.eyeR, 4);
  o[3] = qu8(f.spacing, 2);
  o[4] = qu8(f.eyeY, 2);
  o[5] = (uint8_t)qi8(f.lookX, 2);
  o[6] = (uint8_t)qi8(f.lookY, 2);
  o[7] = qu8(f.openL, 250);
  o[8] = qu8(f.openR, 250);
  o[9] = (uint8_t)qi8(f.slant, 4);
  o[10] = qu8(f.cheek, 250);
  o[11] = qu8(f.scaleL, 100);
  o[12] = qu8(f.scaleR, 100);
  o[13] = qu8(f.shine, 250);
  o[14] = qu8(f.mouthW, 4);
  o[15] = qu8(f.mouthOpen, 250);
  o[16] = qu8(f.mouthY, 2);
  o[17] = (uint8_t)qi8(f.offX, 2);
  o[18] = (uint8_t)qi8(f.offY, 2);
  o[19] = (uint8_t)qi8(f.baseSlant, 4);
  o[20] = (uint8_t)f.styleL;
  o[21] = (uint8_t)f.styleR;
  o[22] = (uint8_t)f.mouth;
  o[23] = (uint8_t)f.shineStyle;
  o[24] = (uint8_t)f.accent;
  o[25] = f.fx & 0xFF;
  o[26] = f.fx >> 8;
}

bool Pack::decodeFace(const uint8_t b[kPackFaceBytes], Face* f) {
  if (b[20] >= kEyeStyleCount || b[21] >= kEyeStyleCount || b[22] >= kMouthCount ||
      b[23] >= (uint8_t)Shine::Count || b[24] >= (uint8_t)Accent::Count)
    return false;
  Face o;
  o.eyeW = b[0] / 4.f;
  o.eyeH = b[1] / 4.f;
  o.eyeR = b[2] / 4.f;
  o.spacing = b[3] / 2.f;
  o.eyeY = b[4] / 2.f;
  o.lookX = (int8_t)b[5] / 2.f;
  o.lookY = (int8_t)b[6] / 2.f;
  o.openL = b[7] / 250.f;
  o.openR = b[8] / 250.f;
  o.slant = (int8_t)b[9] / 4.f;
  o.cheek = b[10] / 250.f;
  o.scaleL = b[11] / 100.f;
  o.scaleR = b[12] / 100.f;
  o.shine = b[13] / 250.f;
  o.mouthW = b[14] / 4.f;
  o.mouthOpen = b[15] / 250.f;
  o.mouthY = b[16] / 2.f;
  o.offX = (int8_t)b[17] / 2.f;
  o.offY = (int8_t)b[18] / 2.f;
  o.baseSlant = (int8_t)b[19] / 4.f;
  o.styleL = (EyeStyle)b[20];
  o.styleR = (EyeStyle)b[21];
  o.mouth = (Mouth)b[22];
  o.shineStyle = (Shine)b[23];
  o.accent = (Accent)b[24];
  o.fx = (uint16_t)(b[25] | b[26] << 8);
  *f = o;
  return true;
}

size_t Pack::encode(uint8_t* out, size_t cap) const {
  if (cap < kPackHeaderBytes) return 0;
  Writer w{out + kPackHeaderBytes, cap - kPackHeaderBytes};

  if (faceCount_) {
    w.u8(kSecFaces);
    w.u16((uint16_t)(1 + faceCount_ * kPackFaceBytes));
    w.u8((uint8_t)faceCount_);
    for (int i = 0; i < faceCount_; ++i) {
      uint8_t b[kPackFaceBytes];
      encodeFace(faces_[i], b);
      w.bytes(b, kPackFaceBytes);
    }
  }
  if (animCount_) {
    w.u8(kSecAnims);
    const size_t lenAt = w.n;
    w.u16(0);
    const size_t start = w.n;
    w.u8((uint8_t)animCount_);
    for (int i = 0; i < animCount_; ++i) {
      const Animation& a = anims_[i];
      w.str(a.name, kPackNameLen - 1);
      w.u8((uint8_t)a.trigger);
      w.u8(a.moodMin);
      w.u8(a.moodMax);
      w.u8(a.weight);
      w.u8(a.count);
      for (int k = 0; k < a.count; ++k) {
        const Key& key = a.keys[k];
        int16_t ref = (int16_t)(-1 - (int)key.expr);
        if (key.face && key.face >= faces_ && key.face < faces_ + faceCount_) ref = (int16_t)(key.face - faces_);
        w.u16((uint16_t)ref);
        w.u8((uint8_t)key.lookX);
        w.u8((uint8_t)key.lookY);
        w.u8((uint8_t)key.motion);
        w.u16(key.tweenMs);
        w.u16(key.holdMs);
        w.u16(key.fx);
        w.u8((uint8_t)key.eyes);
        w.u8((uint8_t)key.mouth);
      }
    }
    const size_t len = w.n - start;
    if (w.ok && lenAt + 1 < w.cap) {
      w.p[lenAt] = len & 0xFF;
      w.p[lenAt + 1] = (uint8_t)(len >> 8);
    }
  }
  if (persona_.present) {
    w.u8(kSecPersona);
    const size_t lenAt = w.n;
    w.u16(0);
    const size_t start = w.n;
    w.str(persona_.name, sizeof(persona_.name) - 1);
    w.str(persona_.serial, kPackNameLen - 1);
    for (int g = 0; g < kGeneCount; ++g) w.u8(geneValue(persona_.genes, (GeneId)g));
    w.u8(persona_.favouriteCount);
    for (int i = 0; i < persona_.favouriteCount && i < 4; ++i) w.str(persona_.favourites[i], kPackNameLen - 1);
    const size_t len = w.n - start;
    if (w.ok && lenAt + 1 < w.cap) {
      w.p[lenAt] = len & 0xFF;
      w.p[lenAt + 1] = (uint8_t)(len >> 8);
    }
  }
  if (!w.ok || kPackHeaderBytes + w.n > kPackMaxBytes) return 0;

  const uint32_t payload = (uint32_t)w.n;
  Writer h{out, kPackHeaderBytes};
  h.bytes((const uint8_t*)"LPK1", 4);
  h.u8(kPackVersion);
  h.u8(0);
  h.u16(0);
  h.u32(payload);
  h.u32(crc32(out + kPackHeaderBytes, payload));
  return kPackHeaderBytes + payload;
}

Pack::Error Pack::decode(const uint8_t* data, size_t len) {
  clear();
  if (len < kPackHeaderBytes) return Error::TooShort;
  if (len > kPackMaxBytes) return Error::TooBig;
  if (memcmp(data, "LPK1", 4) != 0) return Error::BadMagic;
  if (data[4] != kPackVersion) return Error::BadVersion;
  Reader h{data + 8, 8};
  const uint32_t payload = h.u32();
  const uint32_t crc = h.u32();
  if (kPackHeaderBytes + payload != len) return Error::BadLength;
  if (crc32(data + kPackHeaderBytes, payload) != crc) return Error::BadCrc;

  Reader r{data + kPackHeaderBytes, payload};
  while (r.ok && r.n < r.len) {
    const uint8_t type = r.u8();
    const uint16_t slen = r.u16();
    if (!r.ok || r.n + slen > r.len) break;
    Reader s{r.p + r.n, slen};
    r.n += slen;

    if (type == kSecFaces) {
      const uint8_t count = s.u8();
      if (count > kPackMaxFaces || s.len != 1 + (size_t)count * kPackFaceBytes) {
        clear();
        return Error::BadData;
      }
      for (int i = 0; i < count; ++i)
        if (!decodeFace(s.p + 1 + i * kPackFaceBytes, &faces_[i])) {
          clear();
          return Error::BadData;
        }
      faceCount_ = count;
    } else if (type == kSecAnims) {
      const uint8_t count = s.u8();
      if (count > kPackMaxAnims) {
        clear();
        return Error::BadData;
      }
      for (int i = 0; i < count && s.ok; ++i) {
        char name[kPackNameLen];
        s.str(name, sizeof(name));
        const uint8_t trig = s.u8(), lo = s.u8(), hi = s.u8(), weight = s.u8(), keys = s.u8();
        if (!s.ok || trig >= (uint8_t)Trigger::Count || lo > hi || hi > 100 || weight < 1 || weight > 10 ||
            keys < 1 || keys > kPackMaxKeys || !name[0]) {
          clear();
          return Error::BadData;
        }
        Key ks[kPackMaxKeys];
        for (int k = 0; k < keys; ++k) {
          const int16_t ref = (int16_t)s.u16();
          Key& key = ks[k];
          key.lookX = (int8_t)s.u8();
          key.lookY = (int8_t)s.u8();
          const uint8_t motion = s.u8();
          key.tweenMs = s.u16();
          key.holdMs = s.u16();
          key.fx = s.u16();
          key.eyes = (int8_t)s.u8();
          key.mouth = (int8_t)s.u8();
          const bool refOk = ref >= 0 ? ref < faceCount_ : (-1 - ref) < (int)Expr::Count;
          if (!s.ok || !refOk || motion >= kMotionCount || (key.eyes != kKeep && (key.eyes < 0 || key.eyes >= kEyeStyleCount)) ||
              (key.mouth != kKeep && (key.mouth < 0 || key.mouth >= kMouthCount)) ||
              (uint32_t)key.tweenMs + key.holdMs > 20000) {
            clear();
            return Error::BadData;
          }
          key.motion = (Motion)motion;
          key.expr = ref >= 0 ? Expr::Neutral : (Expr)(-1 - ref);
          key.face = ref >= 0 ? &faces_[ref] : nullptr;
        }
        addAnimation(name, (Trigger)trig, lo, hi, weight, ks, keys);
      }
      if (!s.ok) {
        clear();
        return Error::BadData;
      }
    } else if (type == kSecPersona) {
      PackPersona p;
      s.str(p.name, sizeof(p.name));
      s.str(p.serial, sizeof(p.serial));
      for (int g = 0; g < kGeneCount; ++g) setGene(p.genes, (GeneId)g, s.u8());
      p.favouriteCount = s.u8();
      if (p.favouriteCount > 4) s.ok = false;
      for (int i = 0; i < p.favouriteCount && s.ok; ++i) s.str(p.favourites[i], kPackNameLen);
      if (!s.ok || !genesValid(p.genes)) {
        clear();
        return Error::BadData;
      }
      p.present = true;
      persona_ = p;
    }
    // Unknown section types are skipped.
  }
  if (!r.ok || r.n != r.len) {
    clear();
    return Error::BadData;
  }
  return Error::None;
}

}  // namespace lumi
