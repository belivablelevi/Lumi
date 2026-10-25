// Boop Battle: a 2-player reaction game between two Lumis.
//
// Both devices wait a shared random delay (derived from a seed the host picks),
// then flash "BOOP!". The first to pat their Lumi wins the round; patting
// before the flash is a foul. Each device times its *own* reaction locally, so
// radio latency never decides a round - only the reaction times are swapped.
//
// Transport is ESP-NOW broadcast, which is unacknowledged, so every packet
// carries the full result history and is re-sent ~10x per second. Losing any
// individual packet is harmless.
//
// This file is transport-agnostic; the firmware plugs in ESP-NOW and the tests
// plug in an in-memory link.
#pragma once
#include <stdint.h>
#include <string.h>

#include "rng.h"

namespace lumi {
namespace battle {

constexpr uint32_t kMagic = 0x494D554Cu;  // "LUMI"
constexpr uint8_t kVersion = 1;
constexpr int kMaxRounds = 9;
constexpr int kWinsNeeded = 3;  // best of five (draws replay)

constexpr uint16_t kFoul = 0xFFFF;
constexpr uint16_t kTimeout = 0xFFFE;
constexpr uint16_t kPending = 0xFFFD;

constexpr uint32_t kBeaconEveryMs = 150;
constexpr uint32_t kSendEveryMs = 100;
constexpr uint32_t kLobbyTimeoutMs = 20000;
constexpr uint32_t kInviteTimeoutMs = 2500;
constexpr uint32_t kIntroMs = 2000;
constexpr uint32_t kGoWindowMs = 2000;
constexpr uint32_t kRoundResultMs = 2200;
constexpr uint32_t kMatchOverMs = 4500;
constexpr uint32_t kAbortedMs = 2500;
constexpr uint32_t kPeerLostMs = 6000;

enum class MsgType : uint8_t { Beacon = 1, Invite = 2, Play = 3, Bye = 4 };

#pragma pack(push, 1)
struct Packet {
  uint32_t magic;
  uint8_t version;
  uint8_t type;
  uint8_t from[6];
  uint8_t to[6];
  uint16_t session;
  uint32_t seed;
  uint8_t count;  // number of valid entries in results
  uint16_t results[kMaxRounds];
};
#pragma pack(pop)
static_assert(sizeof(Packet) <= 250, "must fit in one ESP-NOW frame");

enum class Outcome : uint8_t { Win, Lose, Draw };
enum class Phase : uint8_t {
  Idle,
  Lobby,     // looking for a friend
  Inviting,  // found one, we are host, waiting for them to accept
  Intro,     // "VS" screen
  Ready,     // waiting for the flash - don't pat yet!
  Go,        // BOOP! pat now
  Waiting,   // we have our time, waiting for theirs
  RoundResult,
  MatchOver,
  Aborted,
  Done
};
enum class AbortReason : uint8_t { None, NoFriend, PeerLost, Cancelled };

Outcome judge(uint16_t mine, uint16_t theirs);
uint32_t roundDelayMs(uint32_t seed, int round);
const char* phaseName(Phase p);

class Game {
 public:
  using SendFn = void (*)(const Packet& p, void* ctx);

  void begin(const uint8_t mac[6], uint32_t nowMs, uint32_t randomSeed, SendFn send, void* ctx);
  void tick(uint32_t nowMs);
  void onTap(uint32_t tapTimeMs);
  void onPacket(const Packet& p, uint32_t nowMs);
  void cancel(uint32_t nowMs);

  Phase phase() const { return phase_; }
  uint32_t phaseElapsed(uint32_t nowMs) const { return nowMs - phaseStart_; }
  AbortReason abortReason() const { return abort_; }
  int round() const { return round_; }
  int myWins() const { return myWins_; }
  int theirWins() const { return theirWins_; }
  Outcome lastOutcome() const { return lastOutcome_; }
  uint16_t myResult(int r) const { return r >= 0 && r < kMaxRounds ? mine_[r] : kPending; }
  uint16_t theirResult(int r) const { return r >= 0 && r < kMaxRounds ? theirs_[r] : kPending; }
  bool wonMatch() const { return myWins_ > theirWins_; }
  bool drewMatch() const { return myWins_ == theirWins_; }
  bool isHost() const { return host_; }
  bool active() const { return phase_ != Phase::Idle && phase_ != Phase::Done; }

 private:
  void enter(Phase p, uint32_t now);
  void startRound(int r, uint32_t now);
  void abort(AbortReason why, uint32_t now);
  void send(MsgType type, const uint8_t* to, uint32_t now);
  bool inMatch() const;

  uint8_t me_[6] = {0};
  uint8_t peer_[6] = {0};
  bool host_ = false;
  uint16_t session_ = 0;
  uint32_t seed_ = 0;
  Rng rng_;
  SendFn sendFn_ = nullptr;
  void* ctx_ = nullptr;

  Phase phase_ = Phase::Idle;
  uint32_t phaseStart_ = 0;
  uint32_t lastSend_ = 0;
  uint32_t lastHeard_ = 0;
  uint32_t goStart_ = 0;
  AbortReason abort_ = AbortReason::None;

  int round_ = 0;
  int myWins_ = 0, theirWins_ = 0;
  Outcome lastOutcome_ = Outcome::Draw;
  uint16_t mine_[kMaxRounds];
  uint16_t theirs_[kMaxRounds];
};

}  // namespace battle
}  // namespace lumi
