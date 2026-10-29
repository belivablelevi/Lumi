// Minimal SSD1306 128x64 I2C driver that pushes a lumi::Canvas buffer as-is.
#pragma once
#include <Arduino.h>
#include <Wire.h>

class Ssd1306 {
 public:
  bool begin(TwoWire& wire, uint8_t addr, bool flip);
  void push(const uint8_t* buf);  // 1024 bytes, page layout
  void power(bool on);
  void contrast(uint8_t level);

 private:
  void command(uint8_t c);
  void commands(const uint8_t* list, size_t n);

  TwoWire* wire_ = nullptr;
  uint8_t addr_ = 0x3C;
};
