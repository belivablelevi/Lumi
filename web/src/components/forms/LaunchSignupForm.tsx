"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Mail } from "lucide-react";
import clsx from "clsx";
import { brand } from "@/config/brand";
import { consentText } from "@/config/consent";
import { duration, ease } from "@/lib/motion";
import { Button } from "../ui/Button";
import { useCart } from "../cart/CartProvider";

type State = { kind: "idle" | "loading" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export function LaunchSignupForm({
  topic,
  tone = "light",
  compact = false,
  className,
}: {
  topic: string;
  tone?: "light" | "dark";
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const { services } = useCart();
  const [state, setState] = useState<State>({ kind: "idle" });
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now(); // when the form appeared, for the too-fast-to-be-human check
  }, []);
  const dark = tone === "dark";

  if (!services.signup) {
    return (
      <div className={clsx("rounded-card p-4 text-sm", dark ? "bg-white/10 text-white/80" : "bg-white/70 text-muted", className)}>
        <p className={clsx("font-bold", dark ? "text-white" : "text-ink")}>Launch emails are coming soon</p>
        <p className="mt-1">Signups open once our mailing list is set up. Nothing you type here is stored yet.</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!form.get("consent")) {
      setState({ kind: "error", message: "Tick the box so we know you'd like these emails." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/launch-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          consent: true,
          topic,
          website: form.get("website"),
          elapsedMs: Date.now() - started.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setState({ kind: "done", message: data.message ?? "Check your inbox to confirm." });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {state.kind === "done" ? (
          <motion.div
            key="done"
            role="status"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: duration.base, ease }}
            className={clsx("flex items-start gap-3 rounded-card p-4", dark ? "bg-white/10 text-white" : "bg-mint-pale text-ink")}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-ink">
              <Check className="size-4" />
            </span>
            <p className="pt-1 text-sm font-semibold">{state.message}</p>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} noValidate exit={{ opacity: 0 }} className="space-y-3">
            <div className={clsx("flex gap-2", compact ? "flex-row" : "flex-col sm:flex-row")}>
              <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
              <div className="relative flex-1">
                <Mail className={clsx("pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2", dark ? "text-white/50" : "text-muted")} aria-hidden />
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className={clsx(
                    "h-12 w-full rounded-chip border pr-4 pl-11 text-[0.9375rem] outline-none transition-colors",
                    dark
                      ? "border-white/20 bg-white/10 text-white placeholder:text-white/45 focus:border-white/60"
                      : "border-line bg-white text-ink placeholder:text-muted/70 focus:border-ink/40",
                  )}
                />
              </div>
              {/* Honeypot: people never see or fill this. */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor={`${id}-website`}>Website</label>
                <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
              </div>
              <Button type="submit" className={clsx("h-12", dark && "bg-white text-ink hover:bg-lavender-pale")} disabled={state.kind === "loading"}>
                {state.kind === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
                {state.kind === "loading" ? "Signing up…" : "Notify me"}
              </Button>
            </div>
            <label className={clsx("flex items-start gap-2.5 text-[0.8125rem] leading-snug", dark ? "text-white/75" : "text-muted")}>
              <input type="checkbox" name="consent" className="mt-0.5 size-4 shrink-0 accent-ink" />
              <span>{consentText(brand.name)}</span>
            </label>
            <p role="alert" aria-live="polite" className={clsx("min-h-4 text-[0.8125rem] font-semibold", dark ? "text-peach" : "text-peach-deep")}>
              {state.kind === "error" ? state.message : ""}
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
