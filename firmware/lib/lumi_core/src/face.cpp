#include "face.h"

#include <math.h>

namespace lumi {

namespace {

constexpr float kPi = 3.14159265f;

inline int iround(float v) { return (int)floorf(v + 0.5f); }
inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
inline float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

// Thick arc from angle a0 to a1 (degrees; 0 = right, 90 = down on screen).
void arc(Canvas& c, float cx, float cy, float r, float a0, float a1, int thick) {
  const int steps = 14;
  float px = 0, py = 0;
  for (int i = 0; i <= steps; ++i) {
    const float a = (a0 + (a1 - a0) * i / steps) * kPi / 180.f;
    const float x = cx + r * cosf(a), y = cy + r * sinf(a);
    if (i) c.thickLine(iround(px), iround(py), iround(x), iround(y), thick);
    px = x;
    py = y;
  }
}

void drawNormalEye(Canvas& c, float x, float y, const Face& f, float open, float scale,
                   bool left) {
  const float w = f.eyeW * scale, h = f.eyeH * scale;
  const int L = iround(x - w / 2), T = iround(y - h / 2);
  const int W = iround(w), H = iround(h);
  if (W <= 0 || H <= 0) return;
  open = clamp01(open);

  const float lidTop = T + (1 - open) * H;
  if (H * open < 3.f) {
    // Fully blinked: a short rounded bar where the lid meets the bottom.
    int ly = iround(lidTop) - 1;
    if (ly > T + H - 3) ly = T + H - 3;
    c.fillRoundRect(L + 1, ly, W - 2, 3, 1);
    return;
  }

  c.fillRoundRect(L, T, W, H, iround(f.eyeR * scale));

  // Lids are carved out column by column so slant and cheek combine freely.
  for (int px = L; px < L + W; ++px) {
    const float rel = (px + 0.5f - x) / (w / 2);    // -1 .. 1 across the eye
    const float inner = left ? (rel + 1) / 2 : (1 - rel) / 2;  // 0 outer .. 1 inner
    float top = lidTop;
    const float slant = f.slant + f.baseSlant;
    if (slant > 0) top += slant * inner;
    else if (slant < 0) top += -slant * (1 - inner);
    // Cheek: an ellipse pushing up from below the eye -> crescent smile.
    float bottom = T + H;
    if (f.cheek > 0.01f) {
      const float ry = h * (0.5f + f.cheek * 0.8f);
      const float k = rel / 1.5f;
      bottom = T + H + h * 0.5f - ry * sqrtf(1 - k * k);
    }
    for (int py = T; py < T + H; ++py)
      if (py < top || py > bottom) c.pixel(px, py, false);
  }

  if (f.shine > 0.5f && open > 0.55f && W > 14 && f.cheek < 0.4f && f.shineStyle != Shine::None) {
    const float slant = f.slant + f.baseSlant;
    const int s = iround(w * 0.22f);
    const int sx = iround(x - w * 0.30f);
    const int sy = iround(lidTop + h * 0.14f + (slant > 0 ? slant * 0.5f : 0));
    const int mx = sx + s / 2, my = sy + s / 2;
    switch (f.shineStyle) {
      case Shine::Square:
      case Shine::Count:
        c.fillRoundRect(sx, sy, s, s, s / 3, false);
        break;
      case Shine::None:
        break;
      case Shine::Dot:
        c.fillCircle(mx, my, s / 2, false);
        break;
      case Shine::Double:
        c.fillCircle(mx, my, s / 2, false);
        c.fillCircle(mx + s, my + s, s > 5 ? 2 : 1, false);
        break;
      case Shine::Star:
        c.thickLine(mx - s / 2 - 1, my, mx + s / 2 + 1, my, 1, false);
        c.thickLine(mx, my - s / 2 - 1, mx, my + s / 2 + 1, 1, false);
        c.fillRect(mx - 1, my - 1, 3, 3, false);
        break;
      case Shine::Ring:
        c.fillCircle(mx, my, s / 2 + 1, false);
        if (s / 2 - 1 > 0) c.fillCircle(mx, my, s / 2 - 1, true);
        break;
    }
  }
}

// Gene accents around one eye. `left` is the viewer's left eye.
void drawAccent(Canvas& c, const Face& f, float x, float y, float scale, EyeStyle style,
                float open, bool left, uint32_t t) {
  (void)t;
  const float w = f.eyeW * scale, h = f.eyeH * scale;
  const float top = y - h / 2 + (style == EyeStyle::Normal ? (1 - clamp01(open)) * h : 0);
  const float bottom = y + h / 2;
  const int out = left ? -1 : 1;  // towards the outer edge of the face
  switch (f.accent) {
    case Accent::None:
    case Accent::Count:
      break;
    case Accent::Lashes:
      if (style != EyeStyle::Normal || open < 0.3f) break;
      for (int i = 0; i < 3; ++i) {
        const float bx = x + out * (w * 0.5f - 1 - i * 3.f);
        const float by = top + 1 + i * 0.6f;
        c.thickLine(iround(bx), iround(by), iround(bx + out * 3), iround(by - 3 + i * 0.5f), 1);
      }
      break;
    case Accent::Brows: {
      // Brows follow the mood: inner ends drop when angry, rise when sad.
      const float slant = f.slant + f.baseSlant;
      const float by = y - h / 2 - 5;
      const float inner = by + slant * 0.45f, outer = by - slant * 0.2f;
      const float ix = x - out * w * 0.32f, ox = x + out * w * 0.32f;
      c.thickLine(iround(ix), iround(inner), iround(ox), iround(outer), 2);
      break;
    }
    case Accent::Freckles:
      for (int i = 0; i < 3; ++i)
        c.pixel(iround(x + out * (w * 0.15f + i * 3.f)), iround(bottom + 3 + (i & 1)));
      break;
    case Accent::Blush:
      c.ditherEllipse(iround(x + out * 6), iround(bottom + 3), 8, 3);
      break;
    case Accent::Mark:
      if (!left) c.fillRect(iround(x + w * 0.45f), iround(bottom + 2), 2, 2);
      break;
  }
}

void drawStar(Canvas& c, float cx, float cy, float R, float rot) {
  const float r = R * 0.45f;
  float ox[5], oy[5], ix[5], iy[5];
  for (int i = 0; i < 5; ++i) {
    const float a = rot - kPi / 2 + i * 2 * kPi / 5;
    const float b = a + kPi / 5;
    ox[i] = cx + R * cosf(a);
    oy[i] = cy + R * sinf(a);
    ix[i] = cx + r * cosf(b);
    iy[i] = cy + r * sinf(b);
  }
  for (int i = 0; i < 5; ++i) {
    const int j = (i + 4) % 5;
    c.fillTriangle(iround(cx), iround(cy), iround(ox[i]), iround(oy[i]), iround(ix[i]),
                   iround(iy[i]));
    c.fillTriangle(iround(cx), iround(cy), iround(ox[i]), iround(oy[i]), iround(ix[j]),
                   iround(iy[j]));
  }
}

void drawEye(Canvas& c, float x, float y, const Face& f, EyeStyle style, float open,
             float scale, bool left, uint32_t t) {
  const float w = f.eyeW * scale, h = f.eyeH * scale;
  switch (style) {
    case EyeStyle::Normal:
      drawNormalEye(c, x, y, f, open, scale, left);
      break;
    case EyeStyle::Heart: {
      const float beat = 1 + 0.08f * sinf(t * 0.012f);
      drawHeart(c, iround(x), iround(y), iround(w * 1.05f * beat));
      break;
    }
    case EyeStyle::Spiral: {
      const float R = w * 0.45f;
      const float rot = t * 0.008f * (left ? 1 : -1);
      const float turns = 3.0f;
      float px = x, py = y;
      for (int i = 1; i <= 60; ++i) {
        const float k = i / 60.f;
        const float a = rot + k * turns * 2 * kPi * (left ? 1 : -1);
        const float nx = x + R * k * cosf(a), ny = y + R * k * sinf(a);
        c.thickLine(iround(px), iround(py), iround(nx), iround(ny), 2);
        px = nx;
        py = ny;
      }
      break;
    }
    case EyeStyle::Cross: {
      const int s = iround(w * 0.34f);
      c.thickLine(iround(x) - s, iround(y) - s, iround(x) + s, iround(y) + s, 4);
      c.thickLine(iround(x) - s, iround(y) + s, iround(x) + s, iround(y) - s, 4);
      break;
    }
    case EyeStyle::Star:
      drawStar(c, x, y, w * 0.6f * (1 + 0.06f * sinf(t * 0.01f)), 0.15f * sinf(t * 0.004f));
      break;
    case EyeStyle::HappyArc: {
      const float R = w * 0.48f;
      arc(c, x, y + R * 0.45f, R, 200, 340, 4);
      break;
    }
    case EyeStyle::Closed: {
      const float R = w * 0.45f;
      arc(c, x, y - R * 0.35f, R, 25, 155, 3);
      break;
    }
    case EyeStyle::Squint: {
      const int s = iround(w * 0.36f);
      const int d = left ? 1 : -1;
      const int X = iround(x), Y = iround(y);
      c.thickLine(X - d * s, Y - s, X + d * s, Y, 4);
      c.thickLine(X + d * s, Y, X - d * s, Y + s, 4);
      break;
    }
    case EyeStyle::Dot:
      c.fillCircle(iround(x), iround(y + h * 0.1f), iround(4 * scale));
      break;
    case EyeStyle::Ring: {
      const int R = iround(w * 0.55f);
      c.fillCircle(iround(x), iround(y), R);
      c.fillCircle(iround(x), iround(y), R - 4, false);
      c.fillCircle(iround(x), iround(y), 3);
      break;
    }
  }
}

void drawMouth(Canvas& c, float mx, float my, const Face& f, uint32_t t) {
  const float w = f.mouthW;
  const int X = iround(mx), Y = iround(my);
  switch (f.mouth) {
    case Mouth::None:
      break;
    case Mouth::Smile: {
      const float R = w / 1.732f;
      arc(c, mx, my + 1 - R, R, 30, 150, 2);
      break;
    }
    case Mouth::BigSmile: {
      const int rx = iround(w * 0.62f), ry = iround(3 + f.mouthOpen * 6);
      const int top = Y - 3;
      c.fillEllipse(X, top, rx, ry);
      c.fillRect(X - rx - 1, top - ry - 1, 2 * rx + 3, ry + 1, false);
      break;
    }
    case Mouth::Flat:
      c.thickLine(iround(mx - w / 2), Y, iround(mx + w / 2), Y, 2);
      break;
    case Mouth::Frown: {
      const float R = w / 1.732f;
      arc(c, mx, my - 1 + R, R, 210, 330, 2);
      break;
    }
    case Mouth::O: {
      const int rx = iround(2.5f + w * 0.16f + f.mouthOpen * 2);
      const int ry = iround(2.5f + f.mouthOpen * 4);
      c.fillEllipse(X, Y - 1, rx, ry);
      if (rx > 2 && ry > 2) c.fillEllipse(X, Y - 1, rx - 2, ry - 2, false);
      break;
    }
    case Mouth::Cat: {
      const float r = w / 4;
      arc(c, mx - r, my - r * 0.6f, r, 0, 180, 2);
      arc(c, mx + r, my - r * 0.6f, r, 0, 180, 2);
      break;
    }
    case Mouth::Wavy: {
      int px = 0, py = 0;
      for (int i = 0; i <= 16; ++i) {
        const float k = i / 16.f;
        const int x = iround(mx - w / 2 + k * w);
        const int y = iround(my + 2 * sinf(k * 3 * kPi + t * 0.01f));
        if (i) c.thickLine(px, py, x, y, 2);
        px = x;
        py = y;
      }
      break;
    }
    case Mouth::Tongue: {
      const float R = w / 1.732f;
      c.fillCircle(X + 2, Y + 2, 4);
      c.vline(X + 2, Y + 1, Y + 4, false);
      arc(c, mx, my + 1 - R, R, 30, 150, 2);
      break;
    }
    case Mouth::Smirk:
      c.thickLine(iround(mx - w / 2), Y + 1, iround(mx + w / 2), Y - 2, 2);
      c.thickLine(iround(mx + w / 2), Y - 2, iround(mx + w / 2 + 2), Y - 4, 2);
      break;
    case Mouth::Teeth: {
      const int ww = iround(w * 1.3f);
      c.fillRoundRect(X - ww / 2, Y - 4, ww, 9, 2);
      c.hline(X - ww / 2 + 1, X + ww / 2 - 2, Y, false);
      for (int x = X - ww / 2 + 4; x < X + ww / 2 - 2; x += 4) c.vline(x, Y - 3, Y + 3, false);
      break;
    }
  }
}

void sparkle(Canvas& c, int x, int y, int s) {
  c.hline(x - s, x + s, y);
  c.vline(x, y - s, y + s);
  if (s > 2) {
    c.pixel(x - 1, y - 1);
    c.pixel(x + 1, y - 1);
    c.pixel(x - 1, y + 1);
    c.pixel(x + 1, y + 1);
  }
}

void musicNote(Canvas& c, int x, int y) {
  c.fillEllipse(x, y, 3, 2);
  c.vline(x + 3, y - 8, y);
  c.thickLine(x + 3, y - 8, x + 7, y - 5, 2);
}

void drawOverlays(Canvas& c, const Face& f, float lx, float rx, float ey, uint32_t t) {
  const uint16_t fx = f.fx;
  if (fx & kFxBlush) {
    const int by = iround(ey + f.eyeH * 0.5f + 3);
    c.ditherEllipse(iround(lx - 6), by, 9, 4);
    c.ditherEllipse(iround(rx + 6), by, 9, 4);
  }
  if (fx & kFxTears) {
    const float y0 = ey + f.eyeH * 0.35f;
    const float xs[2] = {lx - f.eyeW * 0.3f, rx + f.eyeW * 0.3f};
    for (float x : xs) {
      c.thickLine(iround(x), iround(y0), iround(x), iround(y0 + 6), 2);
      for (int k = 0; k < 2; ++k) {
        const float p = fmodf(t / 650.f + k * 0.5f, 1.f);
        c.fillCircle(iround(x), iround(y0 + 6 + p * 22), 2);
      }
    }
  }
  if (fx & kFxSweat) {
    const float slide = (t % 1600) / 1600.f * 6;
    const int x = iround(rx + f.eyeW * 0.5f + 5), y = iround(ey - f.eyeH * 0.3f + slide);
    c.fillCircle(x, y, 3);
    c.fillTriangle(x - 3, y - 1, x + 3, y - 1, x, y - 7);
    c.pixel(x - 1, y, false);
  }
  if (fx & kFxZzz) {
    for (int i = 0; i < 3; ++i) {
      const float p = fmodf(t / 2400.f + i / 3.f, 1.f);
      const int x = iround(96 + p * 22), y = iround(26 - p * 24);
      c.text(x, y, p > 0.55f ? "Z" : "z", p > 0.55f ? 2 : 1);
    }
  }
  if (fx & kFxSparkles) {
    const int pts[4][2] = {{7, 9}, {120, 12}, {10, 52}, {118, 50}};
    for (int i = 0; i < 4; ++i) {
      const int s = 1 + iround(3 * fabsf(sinf(t * 0.004f + i * 1.7f)));
      sparkle(c, pts[i][0], pts[i][1], s);
    }
  }
  if (fx & kFxQuestion) c.text(110, 2 + iround(2 * sinf(t * 0.006f)), "?", 2);
  if (fx & kFxExclaim) c.text(112, 2 + iround(2 * sinf(t * 0.012f)), "!", 2);
  if (fx & kFxAnger) {
    const int s = 3 + ((t / 220) & 1);
    const int x = 114, y = 9;
    c.thickLine(x - s - 2, y - s, x - 2, y - 2, 2);
    c.thickLine(x + s + 2, y - s, x + 2, y - 2, 2);
    c.thickLine(x - s - 2, y + s, x - 2, y + 2, 2);
    c.thickLine(x + s + 2, y + s, x + 2, y + 2, 2);
  }
  if (fx & kFxNotes) {
    for (int i = 0; i < 2; ++i) {
      const float p = fmodf(t / 1800.f + i * 0.5f, 1.f);
      musicNote(c, iround(6 + p * 6 + 3 * sinf(p * 9)), iround(46 - p * 36));
    }
  }
  if (fx & kFxHearts) {
    for (int i = 0; i < 3; ++i) {
      const float p = fmodf(t / 1600.f + i / 3.f, 1.f);
      const int x = iround((i == 1 ? 10 : 116) + 4 * sinf(p * 8 + i));
      drawHeart(c, x, iround(56 - p * 50), 9);
    }
  }
  if (fx & kFxLowBattery) {
    if ((t / 500) & 1) {
      c.rect(2, 2, 14, 8);
      c.fillRect(16, 4, 2, 4);
      c.fillRect(4, 4, 2, 4);
    }
  }
  if (fx & kFxSpeedLines) {
    for (int i = 0; i < 5; ++i) {
      const int y = 6 + i * 12;
      const int off = (int)((t / 30 + i * 7) % 20);
      c.hline(off - 10, off - 2, y);
      c.hline(kWidth - off + 2, kWidth - off + 10, y + 5);
    }
  }
}

}  // namespace

void drawHeart(Canvas& c, int cx, int cy, int size, bool on) {
  const float r = size / 4.f;
  c.fillCircle(iround(cx - r), iround(cy - r * 0.4f), iround(r), on);
  c.fillCircle(iround(cx + r), iround(cy - r * 0.4f), iround(r), on);
  c.fillTriangle(iround(cx - 2 * r), iround(cy - r * 0.1f), iround(cx + 2 * r),
                 iround(cy - r * 0.1f), cx, iround(cy + 1.8f * r), on);
}

Face lerp(const Face& a, const Face& b, float t) {
  t = clamp01(t);
  Face o;
  o.eyeW = lerpf(a.eyeW, b.eyeW, t);
  o.eyeH = lerpf(a.eyeH, b.eyeH, t);
  o.eyeR = lerpf(a.eyeR, b.eyeR, t);
  o.spacing = lerpf(a.spacing, b.spacing, t);
  o.eyeY = lerpf(a.eyeY, b.eyeY, t);
  o.lookX = lerpf(a.lookX, b.lookX, t);
  o.lookY = lerpf(a.lookY, b.lookY, t);
  o.openL = lerpf(a.openL, b.openL, t);
  o.openR = lerpf(a.openR, b.openR, t);
  o.slant = lerpf(a.slant, b.slant, t);
  o.cheek = lerpf(a.cheek, b.cheek, t);
  o.scaleL = lerpf(a.scaleL, b.scaleL, t);
  o.scaleR = lerpf(a.scaleR, b.scaleR, t);
  o.shine = lerpf(a.shine, b.shine, t);
  o.mouthW = lerpf(a.mouthW, b.mouthW, t);
  o.mouthOpen = lerpf(a.mouthOpen, b.mouthOpen, t);
  o.mouthY = lerpf(a.mouthY, b.mouthY, t);
  o.offX = lerpf(a.offX, b.offX, t);
  o.offY = lerpf(a.offY, b.offY, t);
  o.baseSlant = lerpf(a.baseSlant, b.baseSlant, t);
  const bool late = t >= 0.5f;
  o.styleL = late ? b.styleL : a.styleL;
  o.styleR = late ? b.styleR : a.styleR;
  o.mouth = late ? b.mouth : a.mouth;
  o.fx = late ? b.fx : a.fx;
  o.shineStyle = late ? b.shineStyle : a.shineStyle;
  o.accent = late ? b.accent : a.accent;
  return o;
}

void drawFace(Canvas& c, const Face& f, uint32_t t) {
  const float cx = kWidth / 2.f + f.offX;
  const float lx = cx - f.spacing / 2 + f.lookX;
  const float rx = cx + f.spacing / 2 + f.lookX;
  const float ey = f.eyeY + f.offY + f.lookY;
  drawEye(c, lx, ey, f, f.styleL, f.openL, f.scaleL, true, t);
  drawEye(c, rx, ey, f, f.styleR, f.openR, f.scaleR, false, t);
  if (f.accent != Accent::None) {
    drawAccent(c, f, lx, ey, f.scaleL, f.styleL, f.openL, true, t);
    drawAccent(c, f, rx, ey, f.scaleR, f.styleR, f.openR, false, t);
  }
  drawMouth(c, cx + f.lookX * 0.4f, f.mouthY + f.offY + f.lookY * 0.3f, f, t);
  drawOverlays(c, f, lx, rx, ey, t);
}

Face expression(Expr e) {
  Face f;
  switch (e) {
    case Expr::Neutral:
    case Expr::Count:
      f.mouthW = 10;
      break;
    case Expr::Happy:
      f.cheek = 0.6f;
      f.mouthW = 14;
      break;
    case Expr::Joy:
      f.styleL = f.styleR = EyeStyle::HappyArc;
      f.mouth = Mouth::BigSmile;
      f.mouthW = 14;
      f.mouthOpen = 0.6f;
      break;
    case Expr::Love:
      f.styleL = f.styleR = EyeStyle::Heart;
      f.mouthW = 12;
      f.fx = kFxBlush;
      break;
    case Expr::Sad:
      f.slant = -8;
      f.openL = f.openR = 0.85f;
      f.eyeH = 30;
      f.lookY = 3;
      f.mouth = Mouth::Frown;
      break;
    case Expr::Cry:
      f.slant = -9;
      f.openL = f.openR = 0.7f;
      f.eyeH = 30;
      f.lookY = 2;
      f.mouth = Mouth::Wavy;
      f.fx = kFxTears;
      break;
    case Expr::Angry:
      f.slant = 10;
      f.eyeH = 30;
      f.mouth = Mouth::Frown;
      break;
    case Expr::Furious:
      f.slant = 13;
      f.eyeH = 28;
      f.mouth = Mouth::Teeth;
      f.mouthW = 14;
      f.fx = kFxAnger;
      break;
    case Expr::Surprised:
      f.eyeW = 30;
      f.eyeH = 40;
      f.eyeR = 14;
      f.eyeY = 24;
      f.mouth = Mouth::O;
      f.mouthOpen = 0.6f;
      break;
    case Expr::Shocked:
      f.styleL = f.styleR = EyeStyle::Ring;
      f.mouth = Mouth::O;
      f.mouthOpen = 1;
      f.fx = kFxExclaim;
      break;
    case Expr::Sleepy:
      f.openL = f.openR = 0.3f;
      f.lookY = 4;
      f.mouth = Mouth::Flat;
      f.mouthW = 8;
      break;
    case Expr::Asleep:
      f.styleL = f.styleR = EyeStyle::Closed;
      f.offY = 2;
      f.mouthW = 8;
      f.fx = kFxZzz;
      break;
    case Expr::Dizzy:
      f.styleL = f.styleR = EyeStyle::Spiral;
      f.mouth = Mouth::Wavy;
      f.mouthW = 14;
      break;
    case Expr::Scared:
      f.eyeW = 22;
      f.eyeH = 30;
      f.slant = -4;
      f.mouth = Mouth::Wavy;
      f.fx = kFxSweat;
      break;
    case Expr::Suspicious:
      f.openL = 0.42f;
      f.openR = 0.75f;
      f.lookX = 7;
      f.mouth = Mouth::Flat;
      f.mouthW = 9;
      break;
    case Expr::Bored:
      f.openL = f.openR = 0.5f;
      f.lookX = -5;
      f.lookY = 3;
      f.mouth = Mouth::Flat;
      f.mouthW = 10;
      break;
    case Expr::Excited:
      f.styleL = f.styleR = EyeStyle::Star;
      f.mouth = Mouth::BigSmile;
      f.mouthOpen = 0.8f;
      f.fx = kFxSparkles;
      break;
    case Expr::Smug:
      f.openL = f.openR = 0.5f;
      f.slant = 3;
      f.lookX = 4;
      f.mouth = Mouth::Smirk;
      break;
    case Expr::Confused:
      f.scaleL = 0.8f;
      f.scaleR = 1.1f;
      f.slant = -3;
      f.mouth = Mouth::Wavy;
      f.mouthW = 10;
      f.fx = kFxQuestion;
      break;
    case Expr::Wink:
      f.styleL = EyeStyle::HappyArc;
      f.cheek = 0.3f;
      f.mouth = Mouth::Tongue;
      break;
    case Expr::Laugh:
      f.styleL = f.styleR = EyeStyle::HappyArc;
      f.mouth = Mouth::BigSmile;
      f.mouthW = 16;
      f.mouthOpen = 1;
      f.eyeY = 24;
      break;
    case Expr::Determined:
      f.slant = 6;
      f.openL = f.openR = 0.8f;
      f.mouth = Mouth::Flat;
      f.mouthW = 14;
      break;
    case Expr::Worried:
      f.slant = -6;
      f.mouth = Mouth::Wavy;
      f.mouthW = 10;
      f.fx = kFxSweat;
      break;
    case Expr::Cute:
      f.eyeW = 30;
      f.eyeH = 36;
      f.eyeR = 14;
      f.mouth = Mouth::Cat;
      f.mouthW = 12;
      f.fx = kFxBlush;
      break;
    case Expr::Dead:
      f.styleL = f.styleR = EyeStyle::Cross;
      f.mouth = Mouth::Tongue;
      break;
    case Expr::Squint:
      f.styleL = f.styleR = EyeStyle::Squint;
      f.mouth = Mouth::Wavy;
      f.mouthW = 12;
      break;
    case Expr::Blank:
      f.styleL = f.styleR = EyeStyle::Dot;
      f.mouth = Mouth::Flat;
      f.mouthW = 6;
      break;
    case Expr::Content:
      f.cheek = 0.55f;
      f.openL = f.openR = 0.75f;
      f.mouth = Mouth::Smile;
      break;
    case Expr::Pout:
      f.eyeH = 30;
      f.slant = -2;
      f.lookX = -6;
      f.mouth = Mouth::O;
      f.mouthW = 4;
      f.mouthOpen = 0.1f;
      break;
  }
  return f;
}

const char* exprName(Expr e) {
  static const char* const kNames[] = {
      "neutral",    "happy",   "joy",     "love",     "sad",        "cry",
      "angry",      "furious", "surprised", "shocked", "sleepy",    "asleep",
      "dizzy",      "scared",  "suspicious", "bored",  "excited",   "smug",
      "confused",   "wink",    "laugh",   "determined", "worried",  "cute",
      "dead",       "squint",  "blank",   "content",  "pout"};
  static_assert(sizeof(kNames) / sizeof(kNames[0]) == (int)Expr::Count, "names");
  return (int)e < (int)Expr::Count ? kNames[(int)e] : "?";
}

}  // namespace lumi
