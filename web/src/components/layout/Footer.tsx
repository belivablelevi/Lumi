import Link from "next/link";
import { brand } from "@/config/brand";
import { confirmed } from "@/lib/placeholder";
import { Mark } from "../brand/Mark";
import { LaunchSignupForm } from "../forms/LaunchSignupForm";

export function Footer() {
  const socials = brand.footer.socials.filter((s) => s.href);
  const business = confirmed(brand.legal.businessName) ?? brand.name;
  return (
    <footer className="mt-20 bg-night text-white">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.2fr_2fr] lg:py-20">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Mark className="h-8 w-auto text-mint" />
            <span className="font-display text-2xl font-extrabold tracking-[-0.04em]">{brand.name}</span>
          </div>
          <p className="mt-4 text-white/70">{brand.tagline}</p>
          <p className="mt-8 text-sm font-bold">Hear about new Lumis first</p>
          <LaunchSignupForm topic="newsletter" tone="dark" className="mt-3" />
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {brand.footer.columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="text-sm font-bold text-white/50">{c.title}</h2>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[0.9375rem] text-white/85 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {business}. All rights reserved.</p>
          {socials.length ? (
            <ul className="flex gap-5">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} className="hover:text-white" rel="noopener noreferrer" target="_blank">{s.label}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
