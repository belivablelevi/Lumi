#include "pong.h"

#include <math.h>

namespace lumi {
namespace pong {

namespace {

const uint8_t kBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint32_t mix(uint32_t x) {
  x += 0x9E3779B9u;
  x ^= x >> 16;
  x *= 0x85EBCA6Bu;
  x ^= x >> 13;
  x *= 0xC2B2AE35u;
  x ^= x >> 16;
  return x;
}

inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

}  // namespace

const char* phaseName(Phase p) {
  switch (p) {
    case Phase::Idle: return "idle";
    case Phase::Lobby: return "lobby";
    case Phase::Inviting: return "inviting";
    case Phase::Intro: return "intro";
    case Phase::Play: return "play";
    case Phase::MatchOver: return "match_over";
    case Phase::Aborted: return "aborted";
    case Phase::Done: return "done";
  }
  return "?";
}

float bounceX(float x, float vx, float* vxOut) {
  const float lo = kBallR, span = kCourtWidth - 1 - 2 * kBallR;
  float u = fmodf(x - lo, 2 * span);
  if (u < 0) u += 2 * span;
  bool reversed = false;
  if (u > span) {
    u = 2 * span - u;
    reversed = true;
  }
  if (vxOut) *vxOut = reversed ? -vx : vx;
  return lo + u;
}

void Game::begin(const uint8_t mac[6], uint32_t now, uint32_t randomSeed, SendFn send, void* ctx) {
  memcpy(me_, mac, 6);
  memset(peer_, 0, 6);
  rng_.reseed(randomSeed ^ mix(mac[2] << 24 | mac[3] << 16 | mac[4] << 8 | mac[5]));
  sendFn_ = send;
  ctx_ = ctx;
  host_ = false;
  session_ = 0;
  abort_ = AbortReason::None;
  myMisses_ = theirMisses_ = 0;
  lastPointMine_ = false;
  lastMiss_ = Miss::None;
  pointUntil_ = serveAt_ = 0;
  rally_ = 0;
  ball_ = Ball::None;
  speed_ = kServeSpeed;
  smash_ = false;
  lastSent_ = lastRecv_ = 0;
  eventCount_ = 0;
  lastSend_ = now - kBeaconEveryMs;
  enter(Phase::Lobby, now);
}

void Game::enter(Phase p, uint32_t now) {
  phase_ = p;
  phaseStart_ = now;
}

void Game::abort(AbortReason why, uint32_t now) {
  abort_ = why;
  ball_ = Ball::None;
  enter(Phase::Aborted, now);
}

void Game::cancel(uint32_t now) {
  if (!active()) return;
  if (inMatch() || phase_ == Phase::Inviting) send(MsgType::Bye, peer_, now);
  abort(AbortReason::Cancelled, now);
}

void Game::push(Event e) {
  if (eventCount_ < sizeof(events_) / sizeof(events_[0])) events_[eventCount_++] = e;
}

Event Game::takeEvent() {
  if (!eventCount_) return Event::None;
  const Event e = events_[0];
  for (int i = 1; i < eventCount_; ++i) events_[i - 1] = events_[i];
  --eventCount_;
  return e;
}

void Game::send(MsgType type, const uint8_t* to, uint32_t now) {
  lastSend_ = now;
  if (!sendFn_) return;
  Packet p;
  memset(&p, 0, sizeof(p));
  p.magic = kMagic;
  p.version = kVersion;
  p.type = (uint8_t)type;
  memcpy(p.from, me_, 6);
  memcpy(p.to, to, 6);
  p.session = session_;
  p.misses = myMisses_;
  p.ballSeq = lastSent_;
  p.ballX = sentX_;
  p.ballVx = sentVx_;
  p.ballSpeed = sentSpeed_;
  p.ballFlags = sentFlags_;
  sendFn_(p, ctx_);
}

float Game::ballX(uint32_t now) const {
  return bounceX(x0_ + vx_ * (float)(int32_t)(now - t0_), vx_, nullptr);
}

float Game::ballY(uint32_t now) const { return y0_ + vy_ * (float)(int32_t)(now - t0_); }

void Game::serve(uint32_t now) {
  serveAt_ = 0;
  rally_ = 0;
  speed_ = kServeSpeed;
  smash_ = false;
  ball_ = Ball::Outgoing;
  t0_ = now;
  x0_ = kCourtWidth / 2 + rng_.range(-30, 30);
  y0_ = kPaddleY;
  vx_ = (rng_.range(-100, 100) / 100.f) * kMaxVx * 0.5f;
  vy_ = -speed_;
}

void Game::miss(Miss why, uint32_t now) {
  ++myMisses_;
  lastMiss_ = why;
  lastPointMine_ = false;
  ball_ = Ball::None;
  pointUntil_ = now + kPointPauseMs;
  serveAt_ = pointUntil_;  // whoever lost the point serves the next one
  push(Event::PointLost);
  send(MsgType::Play, peer_, now);
}

void Game::onTap(uint32_t t) {
  if (phase_ != Phase::Play || ball_ != Ball::Incoming) return;
  const float d = ballY(t) - kPaddleY;
  if (d < -kHitWindow) {
    miss(Miss::TooEarly, t);
    return;
  }
  if (d > kHitWindow) return;  // already past; tick() will call it

  const float quality = 1 - fabsf(d) / kHitWindow;
  smash_ = quality >= kSmashQuality;
  speed_ = speed_ * (smash_ ? kSmashBoost : kReturnBoost);
  if (speed_ > kMaxSpeed) speed_ = kMaxSpeed;
  x0_ = ballX(t);
  y0_ = ballY(t);
  vx_ = aim_ * kMaxVx;
  vy_ = -speed_;
  t0_ = t;
  ball_ = Ball::Outgoing;
  ++rally_;
  push(smash_ ? Event::Smash : Event::Hit);
}

void Game::onPacket(const Packet& p, uint32_t now) {
  if (p.magic != kMagic || p.version != kVersion) return;
  if (memcmp(p.from, me_, 6) == 0) return;
  const MsgType type = (MsgType)p.type;

  if (phase_ == Phase::Lobby) {
    if (type == MsgType::Beacon) {
      // The Lumi with the larger MAC hosts; the other waits for an invite.
      if (memcmp(me_, p.from, 6) > 0) {
        memcpy(peer_, p.from, 6);
        host_ = true;
        do session_ = (uint16_t)rng_.next(); while (session_ == 0);
        enter(Phase::Inviting, now);
        send(MsgType::Invite, peer_, now);
      }
    } else if (type == MsgType::Invite && memcmp(p.to, me_, 6) == 0) {
      memcpy(peer_, p.from, 6);
      host_ = false;
      session_ = p.session;
      lastHeard_ = now;
      enter(Phase::Intro, now);
      send(MsgType::Play, peer_, now);
    }
    return;
  }

  if (memcmp(p.from, peer_, 6) != 0 || p.session != session_) return;

  if (phase_ == Phase::Inviting) {
    if (type == MsgType::Play) {
      lastHeard_ = now;
      enter(Phase::Intro, now);
    } else if (type == MsgType::Bye) {
      enter(Phase::Lobby, now);
    }
    return;
  }

  if (!inMatch()) return;
  lastHeard_ = now;
  if (type == MsgType::Bye) {
    if (phase_ != Phase::MatchOver) abort(AbortReason::PeerLost, now);
    return;
  }
  if (type != MsgType::Play) return;

  if (p.misses > theirMisses_) {
    theirMisses_ = p.misses;
    lastPointMine_ = true;
    lastMiss_ = Miss::None;
    ball_ = Ball::None;
    serveAt_ = 0;
    pointUntil_ = now + kPointPauseMs;
    push(Event::PointWon);
  }

  const uint16_t newest = lastSent_ > lastRecv_ ? lastSent_ : lastRecv_;
  if (phase_ == Phase::Play && p.ballSeq > newest) {
    // A new ball crossed the net. Mirror it: their right is our left.
    lastRecv_ = p.ballSeq;
    ball_ = Ball::Incoming;
    serveAt_ = 0;
    t0_ = now;
    y0_ = 0;
    speed_ = p.ballSpeed / 10000.f;
    vy_ = speed_;
    x0_ = kCourtWidth - 1 - p.ballX / 16.f;
    vx_ = -p.ballVx / 10000.f;
    smash_ = p.ballFlags & 1;
    ++rally_;
    push(Event::BallArrived);
  }
}

void Game::tick(uint32_t now) {
  const uint32_t elapsed = now - phaseStart_;

  if (inMatch() && phase_ != Phase::MatchOver && now - lastHeard_ > kPeerLostMs) {
    abort(AbortReason::PeerLost, now);
    return;
  }

  switch (phase_) {
    case Phase::Idle:
    case Phase::Done:
      return;
    case Phase::Lobby:
      if (now - lastSend_ >= kBeaconEveryMs + (rng_.next() & 31)) send(MsgType::Beacon, kBroadcast, now);
      if (elapsed >= kLobbyTimeoutMs) abort(AbortReason::NoFriend, now);
      return;
    case Phase::Inviting:
      if (now - lastSend_ >= kSendEveryMs) send(MsgType::Invite, peer_, now);
      if (elapsed >= kInviteTimeoutMs) {
        host_ = false;
        session_ = 0;
        enter(Phase::Lobby, now);
      }
      return;
    case Phase::Intro:
      if (elapsed >= kIntroMs) {
        enter(Phase::Play, now);
        // The host serves first; the guest waits for the ball.
        if (host_) serveAt_ = now + 600;
        else ball_ = Ball::Away;
      }
      break;
    case Phase::Play:
      if (theirMisses_ >= kPointsToWin || myMisses_ >= kPointsToWin) {
        ball_ = Ball::None;
        enter(Phase::MatchOver, now);
        break;
      }
      if (serveAt_ && (int32_t)(now - serveAt_) >= 0) serve(now);
      if (ball_ == Ball::Incoming && ballY(now - (uint32_t)kLateGraceMs) > kPaddleY + kHitWindow) {
        miss(Miss::TooLate, now);
      } else if (ball_ == Ball::Outgoing && ballY(now) <= 0) {
        // Over the net: hand the ball to our pal.
        float vx;
        const float x = bounceX(x0_ + vx_ * (float)(int32_t)(now - t0_), vx_, &vx);
        const uint16_t newest = lastSent_ > lastRecv_ ? lastSent_ : lastRecv_;
        lastSent_ = newest + 1;
        sentX_ = (int16_t)(clampf(x, 0, kCourtWidth - 1) * 16);
        sentVx_ = (int16_t)(vx * 10000);
        sentSpeed_ = (uint16_t)(speed_ * 10000);
        sentFlags_ = smash_ ? 1 : 0;
        ball_ = Ball::Away;
        push(Event::BallLeft);
        send(MsgType::Play, peer_, now);
      }
      break;
    case Phase::MatchOver:
      if (elapsed >= kMatchOverMs) {
        enter(Phase::Done, now);
        return;
      }
      break;
    case Phase::Aborted:
      if (elapsed >= kAbortedMs) enter(Phase::Done, now);
      return;
  }

  if (inMatch() && now - lastSend_ >= kSendEveryMs) send(MsgType::Play, peer_, now);
}

}  // namespace pong
}  // namespace lumi
