import clsx from "clsx";
import type { LumiPersona } from "@/lib/lumi-frames";

const rarityDot: Record<LumiPersona["rarity"], string> = {
  common: "bg-[#9aa5b1]",
  uncommon: "bg-[#3fbf74]",
  rare: "bg-[#3b8fe6]",
  legendary: "bg-[#f0a316]",
};

export function RarityDot({ rarity }: { rarity: LumiPersona["rarity"] }) {
  return <span className={clsx("inline-block size-2 rounded-full", rarityDot[rarity])} aria-hidden />;
}

export function PersonaChip({ p, className }: { p: LumiPersona; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 rounded-chip bg-white/85 px-3 py-1.5 text-[0.8125rem] shadow-soft backdrop-blur", className)}>
      <span className="font-bold text-ink">{p.name}</span>
      <span className="text-muted capitalize">{p.traits.temperament}</span>
      <span className="inline-flex items-center gap-1 text-muted capitalize">
        <RarityDot rarity={p.rarity} /> {p.rarity}
      </span>
    </span>
  );
}
