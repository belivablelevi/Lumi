"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getCore } from "@/lib/studio/client";
import type { Player, Rarity, StudioCore } from "@/lib/studio/core";
import { genes as geneInfo } from "@/content/odds";
import { OledCanvas } from "@/components/studio/OledCanvas";
import { rarityFill } from "@/components/lumi/PersonaChip";
import { Button } from "@/components/ui/Button";

/** The reels lock one at a time, left to right. */
const FIRST_LOCK_MS = 900;
const LOCK_GAP_MS = 320;
const RING: Record<Rarity, string> = { common: "#9aa5b1", uncommon: "#3fbf74", rare: "#3b8fe6", legendary: "#f0a316" };
const MASK48 = (1n << 48n) - 1n;

/** Same text, same Lumi: FNV-1a over the lowercased text, kept to 48 bits like a MAC address. */
export function seedFromText(text: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text.trim().toLowerCase())) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return (h ^ (h >> 48n)) & MASK48;
}

/** A small seeded random number, 0 up to n. */
function rnd(seed: number, n: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * n;
}

const randomWord = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

interface Result {
  text: string;
  seed: bigint;
  genes: number[];
  name: string;
  rarity: Rarity;
  oneIn: number;
}

export function RollLumi() {
  const reduce = useReducedMotion();
  const [core, setCore] = useState<StudioCore | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  /** True while the box holds a word we picked, so the next roll picks a new one. Typing clears it. */
  const [auto, setAuto] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollId, setRollId] = useState(0);
  const [frame, setFrame] = useState<Uint8Array | null>(null);
  const [shown, setShown] = useState<number[] | null>(null);
  const [locked, setLocked] = useState(0);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const skip = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    getCore().then((c) => alive && setCore(c), () => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const roll = useCallback(
    (raw: string) => {
      if (!core) return;
      const typed = raw.trim();
      const word = typed || randomWord();
      setAuto(!typed);
      setText(word);
      const seed = seedFromText(word);
      const g = core.genesFromSeed(seed);
      const p = core.genesProbability(g);
      setResult({ text: word, seed, genes: g, name: core.nameFromSeed(seed), rarity: core.genesRarity(g), oneIn: Math.max(1, Math.round(1 / p)) });
      setRollId((n) => n + 1);
      setDone(false);
      setLocked(0);
      setRolling(true);
    },
    [core],
  );

  // Open a shared link such as /roll?n=levi once the face engine is ready.
  const started = useRef(false);
  useEffect(() => {
    if (!core) return;
    const id = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      const n = new URLSearchParams(window.location.search).get("n");
      if (n) roll(n.slice(0, 40));
    }, 0);
    return () => clearTimeout(id);
  }, [core, roll]);

  // The reel timeline. Everything is a function of the time and the seed, so the same text always plays the same reveal.
  useEffect(() => {
    if (!core || !result) return;
    const { genes: final, seed } = result;
    const seedNum = Number(seed & 0xffffffffn);
    const lockAt = final.map((_, k) => FIRST_LOCK_MS + k * LOCK_GAP_MS);
    const end = lockAt[lockAt.length - 1]! + 250;
    let player: Player | null = null;
    let raf = 0;
    let finished = false;
    let lastLocked = 0;
    const t0 = performance.now();
    let offset = 0;

    const finish = () => {
      finished = true;
      setShown(final);
      setLocked(final.length);
      setRolling(false);
      setDone(true);
      try {
        player = core.player(seedNum);
        player.setGenes(final);
        player.setIdle(true);
        player.play("boot_hello");
      } catch {
        player = null;
      }
    };

    if (reduce) {
      // Motion is reduced: no spin, just the finished face.
      raf = requestAnimationFrame(() => {
        finish();
        setFrame(core.renderExpression(0, final, 0));
      });
      return () => {
        cancelAnimationFrame(raf);
        (player as Player | null)?.free();
      };
    }

    skip.current = () => {
      offset = end + 1;
    };

    const tick = (now: number) => {
      const t = now - t0 + offset;
      if (!finished) {
        if (t >= end) finish();
        else {
          const cur = final.map((v, k) => {
            if (t >= lockAt[k]!) return v;
            const interval = 60 + 90 * Math.min(1, t / lockAt[k]!);
            const step = Math.floor(t / interval);
            return Math.floor(rnd(seedNum + k * 7919 + step * 104729, core.geneOptions[k]!.length));
          });
          const n = lockAt.filter((l) => t >= l).length;
          if (n !== lastLocked) {
            lastLocked = n;
            setLocked(n);
            navigator.vibrate?.(8);
          }
          setShown(cur);
          const step = Math.floor(t / 90);
          setFrame(core.renderExpression(Math.floor(rnd(seedNum + step * 31, core.expressions.length)), cur, t));
        }
      }
      if (finished && player) {
        player.update(now - t0);
        setFrame(player.render());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      skip.current = null;
      player?.free();
    };
  }, [core, result, rollId, reduce]);

  // Space skips the spin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && rolling && e.target === document.body) {
        e.preventDefault();
        skip.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rolling]);

  const share = async () => {
    if (!result) return;
    const url = `${window.location.origin}/roll?n=${encodeURIComponent(result.text)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${result.name} on Snaggo`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* the visitor closed the share sheet */
    }
  };

  const ring = done && result ? RING[result.rarity] : "transparent";
  const odds = (k: number) => {
    if (!core || !result) return "";
    const weights = core.geneWeights[k]!;
    const total = weights.reduce((a, b) => a + b, 0);
    const pct = (weights[result.genes[k]!]! / total) * 100;
    return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          roll(auto ? "" : text);
        }}
      >
        <label className="sr-only" htmlFor="roll-text">Type any name or word</label>
        <input
          id="roll-text"
          value={text}
          onChange={(e) => { setAuto(false); setText(e.target.value.slice(0, 40)); }}
          placeholder="Type any name or word"
          autoComplete="off"
          className="h-14 flex-1 rounded-chip border border-ink/15 bg-white px-5 text-base outline-offset-2"
        />
        <Button type="submit" size="lg" disabled={!core || rolling}>
          {rolling ? "Rolling..." : result ? "Roll again" : "Roll a Lumi"}
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted">
        {failed
          ? "The face engine couldn't load. Try refreshing the page."
          : core
            ? "Leave it empty for a surprise. The same word always gives the same Lumi."
            : "Warming up the dice..."}
      </p>

      <motion.div
        key={rollId}
        initial={{ scale: rollId ? 0.94 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 14 }}
        className="relative mt-8 rounded-panel bg-night p-5 sm:p-8"
        style={{ boxShadow: `0 0 0 3px ${ring}, 0 0 48px 6px ${ring === "transparent" ? "transparent" : ring + "55"}`, transition: "box-shadow 0.5s" }}
      >
        <OledCanvas frame={frame} label={result ? `${result.name}, rolled` : "A Lumi face"} />
        {!result ? (
          <div className="absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={() => roll(text)}
              disabled={!core}
              className="rounded-chip bg-white px-12 py-6 font-display text-h2 font-extrabold text-night ring-8 ring-white/25 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oled disabled:opacity-60"
            >
              {core ? "Roll a Lumi" : "Warming up..."}
            </button>
          </div>
        ) : null}
        {done && result?.rarity === "legendary" && !reduce ? <Sparkles /> : null}
      </motion.div>

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-7" aria-label="The seven traits">
        {geneInfo.map((g, k) => {
          const isLocked = locked > k;
          const option = shown && core ? (core.geneOptions[k]![shown[k]!] ?? "") : "";
          return (
            <motion.li
              key={g.id}
              animate={isLocked && rolling ? { scale: [1.14, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              className={`rounded-card p-2.5 text-center ring-1 transition-colors ${isLocked ? "bg-lavender-pale ring-lavender" : "bg-white ring-line"}`}
            >
              <p className="text-[0.6875rem] font-bold tracking-wide text-muted uppercase">{g.label}</p>
              <p className={`mt-1 min-h-[1.5rem] text-sm font-semibold first-letter:uppercase ${isLocked ? "text-ink" : "text-muted blur-[0.5px]"}`}>{option || "..."}</p>
              <p className="mt-0.5 h-4 text-xs text-ink-soft tabular-nums">{isLocked && result ? odds(k) : ""}</p>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-6 min-h-[7rem]" aria-live="polite">
        {done && result ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
            <p className="font-display text-h2 font-extrabold">{result.name}</p>
            <p className="mt-1 inline-flex items-center gap-2 text-ink-soft capitalize">
              <span className={`inline-block size-2.5 rounded-full ${rarityFill[result.rarity]}`} aria-hidden />
              {result.rarity} · {core?.geneOptions[6]?.[result.genes[6]!]}
            </p>
            <p className="mt-1 text-sm text-muted">About 1 in {result.oneIn.toLocaleString("en-CA")} Lumis look like this.</p>
            <p className="mt-3 text-sm text-muted">A demo roll, not your Lumi. Yours is rolled when it is made.</p>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" onClick={share}>{copied ? "Link copied" : "Share this roll"}</Button>
            </div>
          </motion.div>
        ) : rolling ? (
          <div className="text-center">
            <Button variant="ghost" onClick={() => skip.current?.()}>Skip</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A burst of sparkles around a legendary roll. */
function Sparkles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const far = 120 + (i % 3) * 40;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 block size-2 rounded-full bg-[#f0a316]"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * far, y: Math.sin(a) * far * 0.7, opacity: 0, scale: 0.2 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: (i % 4) * 0.05 }}
          />
        );
      })}
    </div>
  );
}
