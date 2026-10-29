"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { brand } from "@/config/brand";

const KEY = `lumi-announcement-${brand.announcement.id}`;

export function AnnouncementBar() {
  const a = brand.announcement;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(KEY) === "1") setDismissed(true);
    } catch {}
  }, []);
  if (!a.enabled || dismissed) return null;
  return (
    <div className="relative bg-ink text-white">
      <div className="container-page flex min-h-10 items-center justify-center gap-3 py-2 pr-12 text-center text-[0.8125rem]">
        <p>
          <span className="font-semibold">{a.text}</span>{" "}
          {a.href ? (
            <Link href={a.href} className="underline decoration-white/40 underline-offset-4 hover:decoration-white">
              {a.linkText}
            </Link>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
        }}
        className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss announcement"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
