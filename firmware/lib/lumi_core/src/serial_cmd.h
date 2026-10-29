// Factory / provisioning commands over the USB serial console.
//
// Lumi Studio drives these to read a unit's identity and write its persona
// and emotion pack. Every reply is one line starting with "ok", "err" or the
// command's own keyword, so the protocol is easy to script and to test.
//
//   id                         -> id mac=24:0A:C4:12:34:56 fw=1.2.0 persona=auto|assigned
//                                 name=Kipo rarity=rare look=12345 serial=LUMI-0001
//   persona begin <bytes>      -> ok begin <bytes>         start an upload (<= 8192 bytes)
//   persona put <off> <hex>    -> ok put <next offset>     up to 128 bytes per line
//   persona commit <crc32hex>  -> ok commit | err <why>   verify, store, apply
//   persona get                -> persona <bytes> <crc32hex>, data <off> <hex> lines..., end
//                                 (or "persona none")
//   persona clear              -> ok clear                 back to the automatic persona
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "app.h"

namespace lumi {

class SerialCommands {
 public:
  using Out = void (*)(void* ctx, const char* line);

  SerialCommands(App& app, Hal& hal) : app_(app), hal_(hal) {}

  // Handles one input line. Returns false if it isn't a provisioning command
  // (the firmware then tries its own debug commands).
  bool handle(const char* line, Out out, void* ctx);

  static constexpr size_t kMaxLine = 600;

 private:
  void reply(Out out, void* ctx, const char* fmt, ...);
  void handlePersona(const char* args, Out out, void* ctx);

  App& app_;
  Hal& hal_;
  uint8_t staging_[kPackMaxBytes];
  size_t stagingLen_ = 0;
  size_t received_ = 0;
  bool uploading_ = false;
};

}  // namespace lumi
