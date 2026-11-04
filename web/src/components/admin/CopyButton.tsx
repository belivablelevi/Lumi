"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

/** Copies text (e.g. a shipping address) for pasting into a label tool. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", "md", "h-9 px-4 text-sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
