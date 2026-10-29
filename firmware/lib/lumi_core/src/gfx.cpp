#include "gfx.h"

#include <stdlib.h>

namespace lumi {

namespace {

// Classic 5x7 ASCII font (0x20..0x7E), column-major, LSB at the top. The glyph
// shapes follow the long-standing public 5x7 LCD font also found in Adafruit
// GFX's glcdfont.c (BSD licence), with a few letters redrawn.
const uint8_t kFont5x7[95][5] = {
    {0x00, 0x00, 0x00, 0x00, 0x00},  // ' '
    {0x00, 0x00, 0x5F, 0x00, 0x00},  // !
    {0x00, 0x07, 0x00, 0x07, 0x00},  // "
    {0x14, 0x7F, 0x14, 0x7F, 0x14},  // #
    {0x24, 0x2A, 0x7F, 0x2A, 0x12},  // $
    {0x23, 0x13, 0x08, 0x64, 0x62},  // %
    {0x36, 0x49, 0x55, 0x22, 0x50},  // &
    {0x00, 0x05, 0x03, 0x00, 0x00},  // '
    {0x00, 0x1C, 0x22, 0x41, 0x00},  // (
    {0x00, 0x41, 0x22, 0x1C, 0x00},  // )
    {0x08, 0x2A, 0x1C, 0x2A, 0x08},  // *
    {0x08, 0x08, 0x3E, 0x08, 0x08},  // +
    {0x00, 0x50, 0x30, 0x00, 0x00},  // ,
    {0x08, 0x08, 0x08, 0x08, 0x08},  // -
    {0x00, 0x60, 0x60, 0x00, 0x00},  // .
    {0x20, 0x10, 0x08, 0x04, 0x02},  // /
    {0x3E, 0x51, 0x49, 0x45, 0x3E},  // 0
    {0x00, 0x42, 0x7F, 0x40, 0x00},  // 1
    {0x42, 0x61, 0x51, 0x49, 0x46},  // 2
    {0x21, 0x41, 0x45, 0x4B, 0x31},  // 3
    {0x18, 0x14, 0x12, 0x7F, 0x10},  // 4
    {0x27, 0x45, 0x45, 0x45, 0x39},  // 5
    {0x3C, 0x4A, 0x49, 0x49, 0x30},  // 6
    {0x01, 0x71, 0x09, 0x05, 0x03},  // 7
    {0x36, 0x49, 0x49, 0x49, 0x36},  // 8
    {0x06, 0x49, 0x49, 0x29, 0x1E},  // 9
    {0x00, 0x36, 0x36, 0x00, 0x00},  // :
    {0x00, 0x56, 0x36, 0x00, 0x00},  // ;
    {0x08, 0x14, 0x22, 0x41, 0x00},  // <
    {0x14, 0x14, 0x14, 0x14, 0x14},  // =
    {0x00, 0x41, 0x22, 0x14, 0x08},  // >
    {0x02, 0x01, 0x51, 0x09, 0x06},  // ?
    {0x32, 0x49, 0x79, 0x41, 0x3E},  // @
    {0x7E, 0x11, 0x11, 0x11, 0x7E},  // A
    {0x7F, 0x49, 0x49, 0x49, 0x36},  // B
    {0x3E, 0x41, 0x41, 0x41, 0x22},  // C
    {0x7F, 0x41, 0x41, 0x22, 0x1C},  // D
    {0x7F, 0x49, 0x49, 0x49, 0x41},  // E
    {0x7F, 0x09, 0x09, 0x09, 0x01},  // F
    {0x3E, 0x41, 0x49, 0x49, 0x7A},  // G
    {0x7F, 0x08, 0x08, 0x08, 0x7F},  // H
    {0x00, 0x41, 0x7F, 0x41, 0x00},  // I
    {0x20, 0x40, 0x41, 0x3F, 0x01},  // J
    {0x7F, 0x08, 0x14, 0x22, 0x41},  // K
    {0x7F, 0x40, 0x40, 0x40, 0x40},  // L
    {0x7F, 0x02, 0x0C, 0x02, 0x7F},  // M
    {0x7F, 0x04, 0x08, 0x10, 0x7F},  // N
    {0x3E, 0x41, 0x41, 0x41, 0x3E},  // O
    {0x7F, 0x09, 0x09, 0x09, 0x06},  // P
    {0x3E, 0x41, 0x51, 0x21, 0x5E},  // Q
    {0x7F, 0x09, 0x19, 0x29, 0x46},  // R
    {0x46, 0x49, 0x49, 0x49, 0x31},  // S
    {0x01, 0x01, 0x7F, 0x01, 0x01},  // T
    {0x3F, 0x40, 0x40, 0x40, 0x3F},  // U
    {0x1F, 0x20, 0x40, 0x20, 0x1F},  // V
    {0x3F, 0x40, 0x38, 0x40, 0x3F},  // W
    {0x63, 0x14, 0x08, 0x14, 0x63},  // X
    {0x07, 0x08, 0x70, 0x08, 0x07},  // Y
    {0x61, 0x51, 0x49, 0x45, 0x43},  // Z
    {0x00, 0x7F, 0x41, 0x41, 0x00},  // [
    {0x02, 0x04, 0x08, 0x10, 0x20},  // backslash
    {0x00, 0x41, 0x41, 0x7F, 0x00},  // ]
    {0x04, 0x02, 0x01, 0x02, 0x04},  // ^
    {0x40, 0x40, 0x40, 0x40, 0x40},  // _
    {0x00, 0x01, 0x02, 0x04, 0x00},  // `
    {0x20, 0x54, 0x54, 0x54, 0x78},  // a
    {0x7F, 0x48, 0x44, 0x44, 0x38},  // b
    {0x38, 0x44, 0x44, 0x44, 0x20},  // c
    {0x38, 0x44, 0x44, 0x48, 0x7F},  // d
    {0x38, 0x54, 0x54, 0x54, 0x18},  // e
    {0x08, 0x7E, 0x09, 0x01, 0x02},  // f
    {0x0C, 0x52, 0x52, 0x52, 0x3E},  // g
    {0x7F, 0x08, 0x04, 0x04, 0x78},  // h
    {0x00, 0x44, 0x7D, 0x40, 0x00},  // i
    {0x20, 0x40, 0x44, 0x3D, 0x00},  // j
    {0x7F, 0x10, 0x28, 0x44, 0x00},  // k
    {0x00, 0x41, 0x7F, 0x40, 0x00},  // l
    {0x7C, 0x04, 0x18, 0x04, 0x78},  // m
    {0x7C, 0x08, 0x04, 0x04, 0x78},  // n
    {0x38, 0x44, 0x44, 0x44, 0x38},  // o
    {0x7C, 0x14, 0x14, 0x14, 0x08},  // p
    {0x08, 0x14, 0x14, 0x18, 0x7C},  // q
    {0x7C, 0x08, 0x04, 0x04, 0x08},  // r
    {0x48, 0x54, 0x54, 0x54, 0x20},  // s
    {0x04, 0x3F, 0x44, 0x40, 0x20},  // t
    {0x3C, 0x40, 0x40, 0x20, 0x7C},  // u
    {0x1C, 0x20, 0x40, 0x20, 0x1C},  // v
    {0x3C, 0x40, 0x30, 0x40, 0x3C},  // w
    {0x44, 0x28, 0x10, 0x28, 0x44},  // x
    {0x0C, 0x50, 0x50, 0x50, 0x3C},  // y
    {0x44, 0x64, 0x54, 0x4C, 0x44},  // z
    {0x00, 0x08, 0x36, 0x41, 0x00},  // {
    {0x00, 0x00, 0x7F, 0x00, 0x00},  // |
    {0x00, 0x41, 0x36, 0x08, 0x00},  // }
    {0x02, 0x01, 0x02, 0x04, 0x02},  // ~
};

inline void swapInt(int& a, int& b) {
  int t = a;
  a = b;
  b = t;
}

}  // namespace

void Canvas::pixel(int x, int y, bool on) {
  if (x < 0 || y < 0 || x >= kWidth || y >= kHeight) return;
  uint8_t& b = buf[(y >> 3) * kWidth + x];
  const uint8_t m = 1u << (y & 7);
  if (on)
    b |= m;
  else
    b &= ~m;
}

bool Canvas::get(int x, int y) const {
  if (x < 0 || y < 0 || x >= kWidth || y >= kHeight) return false;
  return buf[(y >> 3) * kWidth + x] & (1u << (y & 7));
}

void Canvas::hline(int x0, int x1, int y, bool on) {
  if (y < 0 || y >= kHeight) return;
  if (x0 > x1) swapInt(x0, x1);
  if (x0 < 0) x0 = 0;
  if (x1 >= kWidth) x1 = kWidth - 1;
  for (int x = x0; x <= x1; ++x) pixel(x, y, on);
}

void Canvas::vline(int x, int y0, int y1, bool on) {
  if (y0 > y1) swapInt(y0, y1);
  for (int y = y0; y <= y1; ++y) pixel(x, y, on);
}

void Canvas::fillRect(int x, int y, int w, int h, bool on) {
  for (int j = y; j < y + h; ++j) hline(x, x + w - 1, j, on);
}

void Canvas::rect(int x, int y, int w, int h, bool on) {
  hline(x, x + w - 1, y, on);
  hline(x, x + w - 1, y + h - 1, on);
  vline(x, y, y + h - 1, on);
  vline(x + w - 1, y, y + h - 1, on);
}

void Canvas::fillRoundRect(int x, int y, int w, int h, int r, bool on) {
  if (w <= 0 || h <= 0) return;
  const int maxR = (w < h ? w : h) / 2;
  if (r > maxR) r = maxR;
  if (r <= 0) {
    fillRect(x, y, w, h, on);
    return;
  }
  for (int j = 0; j < h; ++j) {
    int inset = 0;
    int dy = -1;
    if (j < r) dy = r - j;
    else if (j >= h - r) dy = j - (h - r - 1);
    if (dy > 0) {
      // Horizontal inset of a circle of radius r at vertical distance dy.
      int dx = 0;
      while ((dx + 1) * (dx + 1) + dy * dy <= r * r) ++dx;
      inset = r - dx;
    }
    hline(x + inset, x + w - 1 - inset, y + j, on);
  }
}

void Canvas::fillCircle(int cx, int cy, int r, bool on) {
  for (int dy = -r; dy <= r; ++dy) {
    int dx = 0;
    while ((dx + 1) * (dx + 1) + dy * dy <= r * r + r) ++dx;
    hline(cx - dx, cx + dx, cy + dy, on);
  }
}

void Canvas::circle(int cx, int cy, int r, bool on) {
  int x = r, y = 0, err = 1 - r;
  while (x >= y) {
    pixel(cx + x, cy + y, on);
    pixel(cx + y, cy + x, on);
    pixel(cx - y, cy + x, on);
    pixel(cx - x, cy + y, on);
    pixel(cx - x, cy - y, on);
    pixel(cx - y, cy - x, on);
    pixel(cx + y, cy - x, on);
    pixel(cx + x, cy - y, on);
    ++y;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      --x;
      err += 2 * (y - x) + 1;
    }
  }
}

void Canvas::fillEllipse(int cx, int cy, int rx, int ry, bool on) {
  if (rx <= 0 || ry <= 0) return;
  const long rx2 = (long)rx * rx, ry2 = (long)ry * ry;
  for (int dy = -ry; dy <= ry; ++dy) {
    // x^2/rx^2 + y^2/ry^2 <= 1  ->  x <= rx * sqrt(1 - y^2/ry^2)
    int dx = 0;
    while ((long)(dx + 1) * (dx + 1) * ry2 + (long)dy * dy * rx2 <= rx2 * ry2) ++dx;
    hline(cx - dx, cx + dx, cy + dy, on);
  }
}

void Canvas::ditherEllipse(int cx, int cy, int rx, int ry) {
  if (rx <= 0 || ry <= 0) return;
  const long rx2 = (long)rx * rx, ry2 = (long)ry * ry;
  for (int dy = -ry; dy <= ry; ++dy)
    for (int dx = -rx; dx <= rx; ++dx)
      if ((long)dx * dx * ry2 + (long)dy * dy * rx2 <= rx2 * ry2 && ((cx + dx + cy + dy) & 1) == 0)
        pixel(cx + dx, cy + dy, true);
}

void Canvas::line(int x0, int y0, int x1, int y1, bool on) {
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (;;) {
    pixel(x0, y0, on);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

void Canvas::thickLine(int x0, int y0, int x1, int y1, int t, bool on) {
  if (t <= 1) {
    line(x0, y0, x1, y1, on);
    return;
  }
  // Stamp a small disc along the line; cheap and good enough at this size.
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  const int r = t / 2;
  for (;;) {
    fillCircle(x0, y0, r, on);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

void Canvas::fillTriangle(int x0, int y0, int x1, int y1, int x2, int y2, bool on) {
  // Sort by y, then scanline-fill between the long edge and the two short edges.
  if (y0 > y1) { swapInt(y0, y1); swapInt(x0, x1); }
  if (y1 > y2) { swapInt(y1, y2); swapInt(x1, x2); }
  if (y0 > y1) { swapInt(y0, y1); swapInt(x0, x1); }
  if (y0 == y2) {
    int a = x0, b = x0;
    if (x1 < a) a = x1; else if (x1 > b) b = x1;
    if (x2 < a) a = x2; else if (x2 > b) b = x2;
    hline(a, b, y0, on);
    return;
  }
  for (int y = y0; y <= y2; ++y) {
    int xa = x0 + (x2 - x0) * (y - y0) / (y2 - y0);
    int xb;
    if (y < y1 || y1 == y2)
      xb = (y1 == y0) ? x1 : x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    else
      xb = x1 + (x2 - x1) * (y - y1) / (y2 - y1);
    hline(xa, xb, y, on);
  }
}

void Canvas::invert() {
  for (int i = 0; i < kBufferSize; ++i) buf[i] = ~buf[i];
}

void Canvas::text(int x, int y, const char* s, int scale, bool on) {
  for (; *s; ++s) {
    char c = *s;
    if (c < 0x20 || c > 0x7E) c = '?';
    const uint8_t* g = kFont5x7[c - 0x20];
    for (int col = 0; col < 5; ++col)
      for (int row = 0; row < 7; ++row)
        if (g[col] & (1u << row)) {
          if (scale == 1)
            pixel(x + col, y + row, on);
          else
            fillRect(x + col * scale, y + row * scale, scale, scale, on);
        }
    x += 6 * scale;
  }
}

int Canvas::textWidth(const char* s, int scale) {
  int n = (int)strlen(s);
  return n ? (n * 6 - 1) * scale : 0;
}

void Canvas::textCentered(int y, const char* s, int scale, bool on) {
  text((kWidth - textWidth(s, scale)) / 2, y, s, scale, on);
}

void Canvas::rotate180() {
  // Pixel (x, y) moves to (W-1-x, H-1-y): reverse byte order and bit order.
  for (int i = 0, j = kBufferSize - 1; i <= j; ++i, --j) {
    uint8_t a = buf[i], b = buf[j];
    auto rev = [](uint8_t v) {
      v = (uint8_t)((v & 0xF0) >> 4 | (v & 0x0F) << 4);
      v = (uint8_t)((v & 0xCC) >> 2 | (v & 0x33) << 2);
      v = (uint8_t)((v & 0xAA) >> 1 | (v & 0x55) << 1);
      return v;
    };
    buf[i] = rev(b);
    buf[j] = rev(a);
  }
}

}  // namespace lumi
