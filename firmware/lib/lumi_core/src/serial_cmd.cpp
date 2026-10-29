#include "serial_cmd.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace lumi {

namespace {

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

const char* skipSpaces(const char* s) {
  while (*s == ' ' || *s == '\t') ++s;
  return s;
}

// Matches `word` at the start of `s` followed by a space or the end.
const char* matchWord(const char* s, const char* word) {
  const size_t n = strlen(word);
  if (strncmp(s, word, n) != 0 || (s[n] != 0 && s[n] != ' ')) return nullptr;
  return skipSpaces(s + n);
}

uint8_t g_readBuffer[kPackMaxBytes];

}  // namespace

void SerialCommands::reply(Out out, void* ctx, const char* fmt, ...) {
  char line[kMaxLine];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(line, sizeof(line), fmt, ap);
  va_end(ap);
  out(ctx, line);
}

bool SerialCommands::handle(const char* line, Out out, void* ctx) {
  line = skipSpaces(line);
  if (matchWord(line, "id")) {
    uint8_t mac[6];
    hal_.macAddress(mac);
    reply(out, ctx, "id mac=%02X:%02X:%02X:%02X:%02X:%02X fw=%s persona=%s name=%s rarity=%s look=%lu serial=%s",
          mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], kFirmwareVersion,
          app_.personaAssigned() ? "assigned" : "auto", app_.name(), rarityName(app_.rarity()),
          (unsigned long)genesCode(app_.genes()), app_.serial()[0] ? app_.serial() : "-");
    return true;
  }
  if (const char* args = matchWord(line, "persona")) {
    handlePersona(args, out, ctx);
    return true;
  }
  return false;
}

void SerialCommands::handlePersona(const char* args, Out out, void* ctx) {
  if (const char* a = matchWord(args, "begin")) {
    const long len = strtol(a, nullptr, 10);
    if (len <= 0 || (size_t)len > sizeof(staging_)) {
      reply(out, ctx, "err size must be 1..%u bytes", (unsigned)sizeof(staging_));
      return;
    }
    stagingLen_ = (size_t)len;
    received_ = 0;
    uploading_ = true;
    reply(out, ctx, "ok begin %lu", (unsigned long)stagingLen_);
    return;
  }
  if (const char* a = matchWord(args, "put")) {
    if (!uploading_) {
      reply(out, ctx, "err no upload in progress");
      return;
    }
    char* end = nullptr;
    const unsigned long off = strtoul(a, &end, 10);
    const char* hex = skipSpaces(end);
    if (off != received_) {
      reply(out, ctx, "err expected offset %lu", (unsigned long)received_);
      return;
    }
    size_t n = 0;
    while (hex[0] && hex[1]) {
      const int hi = hexValue(hex[0]), lo = hexValue(hex[1]);
      if (hi < 0 || lo < 0) {
        reply(out, ctx, "err bad hex");
        return;
      }
      if (received_ + n >= stagingLen_) {
        reply(out, ctx, "err more data than announced");
        return;
      }
      staging_[received_ + n++] = (uint8_t)(hi << 4 | lo);
      hex += 2;
    }
    if (*hex) {
      reply(out, ctx, "err odd number of hex digits");
      return;
    }
    received_ += n;
    reply(out, ctx, "ok put %lu", (unsigned long)received_);
    return;
  }
  if (const char* a = matchWord(args, "commit")) {
    if (!uploading_ || received_ != stagingLen_) {
      reply(out, ctx, "err incomplete upload (%lu of %lu bytes)", (unsigned long)received_,
            (unsigned long)stagingLen_);
      return;
    }
    const unsigned long want = strtoul(a, nullptr, 16);
    const uint32_t got = Pack::crc32(staging_, stagingLen_);
    if (want != got) {
      reply(out, ctx, "err crc mismatch (got %08lX)", (unsigned long)got);
      return;
    }
    uploading_ = false;
    const char* why = nullptr;
    if (!app_.installUnitPack(staging_, stagingLen_, &why)) {
      reply(out, ctx, "err %s", why ? why : "rejected");
      return;
    }
    reply(out, ctx, "ok commit");
    return;
  }
  if (matchWord(args, "get")) {
    size_t len = 0;
    if (!hal_.storeLoad(g_readBuffer, sizeof(g_readBuffer), &len) || len == 0) {
      reply(out, ctx, "persona none");
      return;
    }
    reply(out, ctx, "persona %lu %08lX", (unsigned long)len, (unsigned long)Pack::crc32(g_readBuffer, len));
    char line[16 + 256 + 1];
    for (size_t off = 0; off < len; off += 128) {
      int p = snprintf(line, sizeof(line), "data %lu ", (unsigned long)off);
      for (size_t i = off; i < len && i < off + 128; ++i) p += snprintf(line + p, sizeof(line) - p, "%02X", g_readBuffer[i]);
      out(ctx, line);
    }
    out(ctx, "end");
    return;
  }
  if (matchWord(args, "clear")) {
    app_.clearUnitPack();
    uploading_ = false;
    reply(out, ctx, "ok clear");
    return;
  }
  reply(out, ctx, "err unknown persona command (begin, put, commit, get, clear)");
}

}  // namespace lumi
