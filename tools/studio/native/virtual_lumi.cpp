// Virtual Lumi: a desktop stand-in for a real unit on a serial port.
//
// It runs the real App and the real provisioning command handler, so Lumi
// Studio's "Provision" tab (and its tests) can be tried without hardware.
//
//   virtual_lumi --pty [--store FILE] [--mac 24:0A:C4:12:34:56]
//       creates a pseudo-terminal, prints its path ("/dev/pts/N"), then
//       serves commands until killed. --store keeps the unit's pack in a file,
//       like NVS survives a reboot.
//   virtual_lumi [--store FILE]       reads commands on stdin instead.
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

#include <string>

#include "app.h"
#include "fake_hal.h"
#include "serial_cmd.h"

using namespace lumi;

namespace {

struct FileHal : sim::FakeHal {
  std::string path;
  bool storeLoad(uint8_t* buf, size_t cap, size_t* len) override {
    if (path.empty()) return sim::FakeHal::storeLoad(buf, cap, len);
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return false;
    const size_t n = fread(buf, 1, cap, f);
    fclose(f);
    if (!n) return false;
    *len = n;
    return true;
  }
  bool storeSave(const uint8_t* data, size_t len) override {
    if (path.empty()) return sim::FakeHal::storeSave(data, len);
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) return false;
    const bool ok = fwrite(data, 1, len, f) == len;
    fclose(f);
    return ok;
  }
  bool storeClear() override {
    if (path.empty()) return sim::FakeHal::storeClear();
    remove(path.c_str());
    return true;
  }
};

int g_out = 1;

void writeLine(void*, const char* line) {
  std::string s(line);
  s += "\r\n";
  const char* p = s.data();
  size_t left = s.size();
  while (left) {
    const ssize_t n = write(g_out, p, left);
    if (n <= 0) return;
    p += n;
    left -= (size_t)n;
  }
}

}  // namespace

int main(int argc, char** argv) {
  static FileHal hal;
  bool usePty = false;
  for (int i = 1; i < argc; ++i) {
    if (!strcmp(argv[i], "--pty")) usePty = true;
    else if (!strcmp(argv[i], "--store") && i + 1 < argc) hal.path = argv[++i];
    else if (!strcmp(argv[i], "--mac") && i + 1 < argc) {
      unsigned m[6];
      if (sscanf(argv[++i], "%x:%x:%x:%x:%x:%x", &m[0], &m[1], &m[2], &m[3], &m[4], &m[5]) == 6)
        for (int k = 0; k < 6; ++k) hal.mac[k] = (uint8_t)m[k];
    }
  }

  int in = 0;
  if (usePty) {
    const int master = posix_openpt(O_RDWR | O_NOCTTY);
    if (master < 0 || grantpt(master) || unlockpt(master)) {
      perror("pty");
      return 1;
    }
    termios t;
    tcgetattr(master, &t);
    cfmakeraw(&t);
    tcsetattr(master, TCSANOW, &t);
    printf("%s\n", ptsname(master));
    fflush(stdout);
    in = g_out = master;
  }

  static MoodState mood;
  static App app(hal, &mood);
  app.begin(WakeReason::PowerOn, 0);
  static SerialCommands cmd(app, hal);

  std::string line;
  char buf[256];
  for (;;) {
    const ssize_t n = read(in, buf, sizeof(buf));
    if (n <= 0) {
      if (!usePty) return 0;
      usleep(20000);  // nobody connected to the pty yet
      continue;
    }
    for (ssize_t i = 0; i < n; ++i) {
      const char c = buf[i];
      if (c != '\n' && c != '\r') {
        if (line.size() < SerialCommands::kMaxLine) line += c;
        continue;
      }
      if (line.empty()) continue;
      if (!cmd.handle(line.c_str(), writeLine, nullptr)) writeLine(nullptr, "err unknown command");
      line.clear();
    }
  }
}
