// 1-bit 128x64 framebuffer with the drawing primitives Lumi needs.
//
// The buffer uses the SSD1306 "page" layout (each byte is 8 vertical pixels,
// LSB on top, 128 bytes per page, 8 pages) so the display driver can push it
// to the panel without conversion. Nothing in here depends on Arduino, so the
// same code renders the desktop previews in tools/sim.
#pragma once
#include <stdint.h>
#include <string.h>

namespace lumi {

constexpr int kWidth = 128;
constexpr int kHeight = 64;
constexpr int kBufferSize = kWidth * kHeight / 8;

class Canvas {
 public:
  uint8_t buf[kBufferSize];

  Canvas() { clear(); }
  void clear() { memset(buf, 0, sizeof(buf)); }

  void pixel(int x, int y, bool on = true);
  bool get(int x, int y) const;
  void hline(int x0, int x1, int y, bool on = true);
  void vline(int x, int y0, int y1, bool on = true);
  void fillRect(int x, int y, int w, int h, bool on = true);
  void rect(int x, int y, int w, int h, bool on = true);
  void fillRoundRect(int x, int y, int w, int h, int r, bool on = true);
  void fillCircle(int cx, int cy, int r, bool on = true);
  void circle(int cx, int cy, int r, bool on = true);
  void fillEllipse(int cx, int cy, int rx, int ry, bool on = true);
  void line(int x0, int y0, int x1, int y1, bool on = true);
  void thickLine(int x0, int y0, int x1, int y1, int t, bool on = true);
  void fillTriangle(int x0, int y0, int x1, int y1, int x2, int y2, bool on = true);
  // 50% checkerboard fill, used for blush and dimmed UI.
  void ditherEllipse(int cx, int cy, int rx, int ry);
  void invert();

  // 5x7 font, 6px advance per character at scale 1.
  void text(int x, int y, const char* s, int scale = 1, bool on = true);
  static int textWidth(const char* s, int scale = 1);
  void textCentered(int y, const char* s, int scale = 1, bool on = true);

  // Copies the buffer rotated by 180 degrees (for upside-down mounting).
  void rotate180();
};

}  // namespace lumi
