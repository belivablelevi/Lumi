#include "battle.h"

namespace lumi {
namespace battle {

namespace {

const uint8_t kBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint32_t mix(uint32_t x) {
  // splitmix-style integer hash.
  x += 0x9E3779B9u;
  x ^= x >> 16;
  x *= 0x85EBCA6Bu;
  x ^= x >> 13;
  x *= 0xC2B2AE35u;
  x ^= x >> 16;
  return x;
}

}  // namespace

Outcome judge(uint16_t mine, uint16_t theirs) {
  if (mine == theirs) return Outcome::Draw;  // includes double foul / double timeout
  if (mine == kFoul) return Outcome::Lose;
  if (theirs == kFoul) return Outcome::Win;
  if (mine == kTimeout) return Outcome::Lose;
  if (theirs == kTimeout) return Outcome::Win;
  return mine < theirs ? Outcome::Win : Outcome::Lose;
}

uint32_t roundDelayMs(uint32_t seed, int round) {
  return 1500 + mix(seed ^ (uint32_t)(round * 0x632BE5ABu)) % 2500;
}

const char* phaseName(Phase p) {
  switch (p) {
    case Phase::Idle: return "idle";
    case Phase::Lobby: return "lobby";
    case Phase::Inviting: return "inviting";
    case Phase::Intro: return "intro";
    case Phase::Ready: return "ready";
    case Phase::Go: return "go";
    case Phase::Waiting: return "waiting";
    case Phase::RoundResult: return "round_result";
    case Phase::MatchOver: return "match_over";
    case Phase::Aborted: return "aborted";
    case Phase::Done: return "done";
  }
  return "?";
}

void Game::begin(const uint8_t mac[6], uint32_t now, uint32_t randomSeed, SendFn send, void* ctx) {
  memcpy(me_, mac, 6);
  memset(peer_, 0, 6);
  rng_.reseed(randomSeed ^ mix(mac[2] << 24 | mac[3] << 16 | mac[4] << 8 | mac[5]));
  sendFn_ = send;
  ctx_ = ctx;
  host_ = false;
  session_ = 0;
  seed_ = 0;
  abort_ = AbortReason::None;
  round_ = myWins_ = theirWins_ = 0;
  for (int i = 0; i < kMaxRounds; ++i) mine_[i] = theirs_[i] = kPending;
  lastSend_ = now - kBeaconEveryMs;
  enter(Phase::Lobby, now);
}

void Game::enter(Phase p, uint32_t now) {
  phase_ = p;
  phaseStart_ = now;
}

bool Game::inMatch() const {
  return phase_ >= Phase::Intro && phase_ <= Phase::MatchOver;
}

void Game::startRound(int r, uint32_t now) {
  round_ = r;
  enter(Phase::Ready, now);
}

void Game::abort(AbortReason why, uint32_t now) {
  abort_ = why;
  enter(Phase::Aborted, now);
}

void Game::cancel(uint32_t now) {
  if (!active()) return;
  if (inMatch() || phase_ == Phase::Inviting) send(MsgType::Bye, peer_, now);
  abort(AbortReason::Cancelled, now);
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
  p.seed = seed_;
  // Only publish rounds we have finished, so the peer never sees "pending".
  int count = 0;
  while (count < kMaxRounds && mine_[count] != kPending) ++count;
  p.count = (uint8_t)count;
  for (int i = 0; i < kMaxRounds; ++i) p.results[i] = mine_[i];
  sendFn_(p, ctx_);
}

void Game::onTap(uint32_t t) {
  if (phase_ == Phase::Ready) {
    mine_[round_] = kFoul;
    enter(Phase::Waiting, t);
  } else if (phase_ == Phase::Go) {
    if ((int32_t)(t - goStart_) < 0) {
      mine_[round_] = kFoul;  // the tap's peak landed just before the flash
    } else {
      const uint32_t reaction = t - goStart_;
      mine_[round_] = reaction >= kGoWindowMs ? kTimeout : (uint16_t)reaction;
    }
    enter(Phase::Waiting, t);
  }
}

void Game::onPacket(const Packet& p, uint32_t now) {
  if (p.magic != kMagic || p.version != kVersion) return;
  if (memcmp(p.from, me_, 6) == 0) return;
  const MsgType type = (MsgType)p.type;

  if (phase_ == Phase::Lobby) {
    if (type == MsgType::Beacon) {
      // The device with the larger MAC hosts; the other waits for an invite.
      if (memcmp(me_, p.from, 6) > 0) {
        memcpy(peer_, p.from, 6);
        host_ = true;
        do session_ = (uint16_t)rng_.next(); while (session_ == 0);
        seed_ = rng_.next();
        enter(Phase::Inviting, now);
        send(MsgType::Invite, peer_, now);
      }
    } else if (type == MsgType::Invite && memcmp(p.to, me_, 6) == 0) {
      memcpy(peer_, p.from, 6);
      host_ = false;
      session_ = p.session;
      seed_ = p.seed;
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
  if (type == MsgType::Play) {
    for (int i = 0; i < p.count && i < kMaxRounds; ++i) theirs_[i] = p.results[i];
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
      if (elapsed >= kIntroMs) startRound(0, now);
      break;
    case Phase::Ready:
      if (elapsed >= roundDelayMs(seed_, round_)) {
        enter(Phase::Go, now);
        goStart_ = now;
      }
      break;
    case Phase::Go:
      if (elapsed >= kGoWindowMs) {
        mine_[round_] = kTimeout;
        enter(Phase::Waiting, now);
      }
      break;
    case Phase::Waiting:
      if (theirs_[round_] != kPending) {
        lastOutcome_ = judge(mine_[round_], theirs_[round_]);
        if (lastOutcome_ == Outcome::Win) ++myWins_;
        else if (lastOutcome_ == Outcome::Lose) ++theirWins_;
        enter(Phase::RoundResult, now);
      }
      break;
    case Phase::RoundResult:
      if (elapsed >= kRoundResultMs) {
        if (myWins_ >= kWinsNeeded || theirWins_ >= kWinsNeeded || round_ + 1 >= kMaxRounds)
          enter(Phase::MatchOver, now);
        else
          startRound(round_ + 1, now);
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

}  // namespace battle
}  // namespace lumi
