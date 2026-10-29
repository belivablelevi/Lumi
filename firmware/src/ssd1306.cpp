#include "ssd1306.h"

bool Ssd1306::begin(TwoWire& wire, uint8_t addr, bool flip) {
  wire_ = &wire;
  addr_ = addr;
  wire_->beginTransmission(addr_);
  if (wire_->endTransmission() != 0) return false;

  const uint8_t init[] = {
      0xAE,              // display off
      0xD5, 0x80,        // clock divide
      0xA8, 0x3F,        // multiplex 64
      0xD3, 0x00,        // display offset
      0x40,              // start line 0
      0x8D, 0x14,        // charge pump on
      0x20, 0x00,        // horizontal addressing
      (uint8_t)(flip ? 0xA0 : 0xA1),  // segment remap
      (uint8_t)(flip ? 0xC0 : 0xC8),  // COM scan direction
      0xDA, 0x12,        // COM pins
      0x81, 0xCF,        // contrast
      0xD9, 0xF1,        // pre-charge
      0xDB, 0x40,        // VCOMH
      0xA4,              // resume from RAM
      0xA6,              // normal (not inverted)
      0x2E,              // no scrolling
      0xAF,              // display on
  };
  commands(init, sizeof(init));
  return true;
}

void Ssd1306::command(uint8_t c) {
  wire_->beginTransmission(addr_);
  wire_->write(0x00);
  wire_->write(c);
  wire_->endTransmission();
}

void Ssd1306::commands(const uint8_t* list, size_t n) {
  for (size_t i = 0; i < n; ++i) command(list[i]);
}

void Ssd1306::push(const uint8_t* buf) {
  const uint8_t window[] = {0x21, 0x00, 0x7F, 0x22, 0x00, 0x07};
  commands(window, sizeof(window));
  // The ESP32 Wire buffer is 128 bytes; send 64 data bytes per transaction.
  for (int i = 0; i < 1024; i += 64) {
    wire_->beginTransmission(addr_);
    wire_->write(0x40);
    wire_->write(buf + i, 64);
    wire_->endTransmission();
  }
}

void Ssd1306::power(bool on) {
  if (on) {
    const uint8_t seq[] = {0x8D, 0x14, 0xAF};
    commands(seq, sizeof(seq));
  } else {
    const uint8_t seq[] = {0xAE, 0x8D, 0x10};  // off + charge pump off: a few uA
    commands(seq, sizeof(seq));
  }
}

void Ssd1306::contrast(uint8_t level) {
  const uint8_t seq[] = {0x81, level};
  commands(seq, sizeof(seq));
}
