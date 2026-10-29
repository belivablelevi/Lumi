// A fake I2C bus: devices are register models that tests plug in.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include <map>
#include <vector>

struct FakeDevice {
  virtual ~FakeDevice() = default;
  virtual void writeReg(uint8_t reg, uint8_t v) = 0;
  // Read starting at `reg`; `n` bytes (the device decides auto-increment rules).
  virtual std::vector<uint8_t> readRegs(uint8_t reg, size_t n) = 0;
};

class TwoWire {
 public:
  std::map<uint8_t, FakeDevice*> devices;

  void beginTransmission(uint8_t addr) {
    addr_ = addr;
    tx_.clear();
  }
  size_t write(uint8_t b) {
    tx_.push_back(b);
    return 1;
  }
  uint8_t endTransmission(bool stop = true) {
    auto it = devices.find(addr_);
    if (it == devices.end()) return 2;  // NACK on address
    if (tx_.size() >= 2) {
      for (size_t i = 1; i < tx_.size(); ++i) it->second->writeReg(tx_[0] + (uint8_t)(i - 1), tx_[i]);
    } else if (tx_.size() == 1) {
      reg_ = tx_[0];
    }
    (void)stop;
    return 0;
  }
  int requestFrom(int addr, int n) {
    auto it = devices.find((uint8_t)addr);
    if (it == devices.end()) return 0;
    rx_ = it->second->readRegs(reg_, (size_t)n);
    pos_ = 0;
    return (int)rx_.size();
  }
  int read() { return pos_ < rx_.size() ? rx_[pos_++] : -1; }

 private:
  uint8_t addr_ = 0, reg_ = 0;
  std::vector<uint8_t> tx_, rx_;
  size_t pos_ = 0;
};
