"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Only rendered when a real, confirmed launch time exists. */
export function Countdown({ at, timeZone }: { at: string; timeZone: string }) {
  const target = new Date(at).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const local = new Intl.DateTimeFormat("en-CA", { dateStyle: "full", timeStyle: "short" }).format(target);
  const there = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone, timeZoneName: "short" }).format(target);
  if (now !== null && now >= target) return <p className="font-bold">It&apos;s here.</p>;
  const p = parts(now === null ? 0 : target - now);
  return (
    <div>
      <div className="flex gap-3" aria-hidden={now === null}>
        {(["d", "h", "m", "s"] as const).map((k) => (
          <div key={k} className="min-w-16 rounded-control bg-white/10 px-3 py-2 text-center">
            <p className="font-display text-2xl font-bold tabular-nums">{now === null ? "–" : String(p[k]).padStart(2, "0")}</p>
            <p className="text-[0.6875rem] text-white/60">{{ d: "days", h: "hours", m: "minutes", s: "seconds" }[k]}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-white/70">
        {local} your time ({there}).
      </p>
    </div>
  );
}
