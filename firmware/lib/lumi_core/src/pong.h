// Boop Pong: classic Pong between two Lumis.
//
// Each Lumi shows its own half of the court with a paddle along the bottom.
// Tilt Lumi to slide the paddle, like turning the knob on the original Pong:
// right side down moves it right. The ball drops in from the top of the screen
// (the "net"); if the paddle is under it when it arrives it bounces back, and
// where it hits the paddle sets the angle - dead centre goes straight, the
// edges send it off sideways. Every return is a little faster. A pat just as
// the ball meets the paddle is a SMASH (extra speed). Miss the ball and your
// pal scores. First to 5 points wins.
//
// When the ball leaves the top of your screen it flies over the radio and
// drops onto your pal's screen. Only the Lumi the ball is on decides whether
// it was hit, so radio latency just makes the flight a little longer.
// Transport is ESP-NOW broadcast (unacknowledged), so every packet carries the
// full state - the sender's miss counter and the last ball it sent, tagged
// with a sequence number - and is repeated ~10x per second. Lost packets only
// delay things.
//
// This file is transport-agnostic; the firmware plugs in ESP-NOW and the tests
// plug in an in-memory link.
#pragma once
#include <stdint.h>
#include <string.h>

#include "rng.h"

namespace lumi {
namespace pong {

constexpr uint32_t kMagic = 0x494D554Cu;  // "LUMI"
constexpr uint8_t kVersion = 2;
constexpr int kPointsToWin = 5;

// Court geometry. x is in screen pixels; y is in court units from the net
// (0, top of the screen) to the baseline (1000).
constexpr float kCourtWidth = 128;
constexpr float kBallR = 3;
constexpr float kPaddleY = 880;      // the paddle's top edge
constexpr float kPaddleHalf = 14;    // half the paddle width, px
constexpr float kOutY = 1060;        // a missed ball is gone once it reaches here
constexpr uint32_t kSmashWindowMs = 150;  // pat this close to the bounce to smash

// Speeds in court units per millisecond.
constexpr float kServeSpeed = 0.55f;  // ~1.8 s to cross one screen
constexpr float kMaxSpeed = 1.9f;     // ~0.5 s
constexpr float kReturnBoost = 1.06f;
constexpr float kSmashBoost = 1.18f;
constexpr float kMaxVx = 0.1f;          // sideways speed off the paddle's very edge, px/ms

constexpr uint32_t kBeaconEveryMs = 150;
constexpr uint32_t kSendEveryMs = 100;
constexpr uint32_t kLobbyTimeoutMs = 20000;
constexpr uint32_t kInviteTimeoutMs = 2500;
constexpr uint32_t kIntroMs = 2500;
constexpr uint32_t kPointPauseMs = 1800;
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
  uint8_t misses;      // points the sender has lost so far (only ever grows)
  uint16_t ballSeq;    // last ball the sender hit over the net (0 = none yet)
  int16_t ballX;       // where it left the sender's screen, 1/16 px
  int16_t ballVx;      // sideways speed, 1/10000 px/ms
  uint16_t ballSpeed;  // forward speed, 1/10000 court units/ms
  uint8_t ballFlags;   // bit 0: smash
};
#pragma pack(pop)
static_assert(sizeof(Packet) <= 250, "must fit in one ESP-NOW frame");

enum class Phase : uint8_t {
  Idle,
  Lobby,     // looking for a pal
  Inviting,  // found one, we host, waiting for them to accept
  Intro,     // "BOOP PONG" title card
  Play,
  MatchOver,
  Aborted,
  Done
};
enum class AbortReason : uint8_t { None, NoFriend, PeerLost, Cancelled };

// Where the ball is, from this Lumi's point of view.
enum class Ball : uint8_t {
  None,      // between points
  Incoming,  // dropping towards our hit line
  Outgoing,  // we hit it; flying back up to the net
  Away       // on our pal's screen
};

// Things the app may want to react to; read them with takeEvent().
enum class Event : uint8_t { None, Hit, Smash, BallLeft, BallArrived, PointWon, PointLost };

const char* phaseName(Phase p);

// Bounces x off the side walls. Returns the on-screen x and, through vxOut,
// the direction the ball is moving at that moment.
float bounceX(float x, float vx, float* vxOut);

class Game {
 public:
  using SendFn = void (*)(const Packet& p, void* ctx);

  void begin(const uint8_t mac[6], uint32_t nowMs, uint32_t randomSeed, SendFn send, void* ctx);
  void tick(uint32_t nowMs);
  void onTap(uint32_t tapTimeMs);
  void onPacket(const Packet& p, uint32_t nowMs);
  void cancel(uint32_t nowMs);
  // Paddle centre in screen pixels; the app drives it from the tilt.
  void setPaddle(float x);
  float paddleX() const { return paddle_; }

  Phase phase() const { return phase_; }
  uint32_t phaseElapsed(uint32_t nowMs) const { return nowMs - phaseStart_; }
  AbortReason abortReason() const { return abort_; }
  bool active() const { return phase_ != Phase::Idle && phase_ != Phase::Done; }
  bool isHost() const { return host_; }

  int myPoints() const { return theirMisses_; }
  int theirPoints() const { return myMisses_; }
  bool wonMatch() const { return theirMisses_ >= kPointsToWin; }

  Ball ball() const { return ball_; }
  float ballX(uint32_t nowMs) const;
  float ballY(uint32_t nowMs) const;  // court units, 0 = net
  float ballSpeed() const { return speed_; }
  bool ballSmash() const { return smash_; }
  int rally() const { return rally_; }  // hits so far this point, both sides
  bool inPointPause(uint32_t nowMs) const { return (int32_t)(pointUntil_ - nowMs) > 0; }
  bool lastPointMine() const { return lastPointMine_; }
  bool serving() const { return serveAt_ != 0; }

  Event takeEvent();

 private:
  void enter(Phase p, uint32_t now);
  void abort(AbortReason why, uint32_t now);
  void send(MsgType type, const uint8_t* to, uint32_t now);
  void push(Event e);
  void miss(uint32_t now);
  void checkPaddle(uint32_t now);
  void serve(uint32_t now);
  bool inMatch() const { return phase_ >= Phase::Intro && phase_ <= Phase::MatchOver; }

  uint8_t me_[6] = {0};
  uint8_t peer_[6] = {0};
  bool host_ = false;
  uint16_t session_ = 0;
  Rng rng_;
  SendFn sendFn_ = nullptr;
  void* ctx_ = nullptr;

  Phase phase_ = Phase::Idle;
  uint32_t phaseStart_ = 0;
  uint32_t lastSend_ = 0;
  uint32_t lastHeard_ = 0;
  AbortReason abort_ = AbortReason::None;

  uint8_t myMisses_ = 0, theirMisses_ = 0;
  bool lastPointMine_ = false;
  uint32_t pointUntil_ = 0;
  uint32_t serveAt_ = 0;
  float paddle_ = kCourtWidth / 2;
  int rally_ = 0;
  uint32_t lastTap_ = 0, hitAt_ = 0;
  bool haveTap_ = false;
  bool missed_ = false;  // ball got past the paddle and is falling off-screen

  // Current ball on our screen: position = start + velocity * (t - t0).
  Ball ball_ = Ball::None;
  uint32_t t0_ = 0;
  float x0_ = 0, y0_ = 0, vx_ = 0, vy_ = 0, speed_ = kServeSpeed;
  bool smash_ = false;

  // Sequence numbers of balls sent and received; a new ball always gets a
  // higher number than any seen so far, so stale repeats are ignored.
  uint16_t lastSent_ = 0, lastRecv_ = 0;
  int16_t sentX_ = 0, sentVx_ = 0;
  uint16_t sentSpeed_ = 0;
  uint8_t sentFlags_ = 0;

  Event events_[8];
  uint8_t eventCount_ = 0;
};

}  // namespace pong
}  // namespace lumi
