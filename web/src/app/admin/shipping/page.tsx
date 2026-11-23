import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { PRICE_SETTINGS, RULE_SETTINGS, SAMPLE_ADDRESSES, freeShippingArea, quoteShipping } from "@/lib/shipping";

export const metadata: Metadata = { title: "Shipping prices", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const card = "rounded-card bg-white p-6 ring-1 ring-line";
const cad = (cents: number) => formatMoney({ amount: cents, currency: "CAD" });

/** What checkout charges for shipping, read from the settings in Vercel. */
export default async function Page() {
  await requireAdmin();
  const p = env.parcel;
  const t = env.shippingTable;
  const rules = env.shippingRules;
  const deps = { parcel: p, table: t, rules };
  const samples = await Promise.all(SAMPLE_ADDRESSES.map(async (a) => ({ ...a, quote: await quoteShipping({ country: a.country, postalCode: a.postal }, 1, deps) })));
  const regions: { name: string; cents: number; setting: string }[] = [
    { name: "Ontario and Quebec", cents: t.near, setting: PRICE_SETTINGS.near },
    { name: "Rest of Canada", cents: t.far, setting: PRICE_SETTINGS.far },
    { name: "Yukon, NWT and Nunavut", cents: t.north, setting: PRICE_SETTINGS.north },
    { name: "United States", cents: t.us, setting: PRICE_SETTINGS.us },
  ];
  const freeArea = freeShippingArea(rules, t, p.handlingCents);

  return (
    <>
      <p>
        <Link href="/admin" className="text-sm font-semibold text-muted underline underline-offset-4">Back to orders</Link>
      </p>
      <h1 className="mt-4 text-h2 font-bold">Shipping prices</h1>
      <p className="mt-2 max-w-2xl text-muted">
        What checkout charges for shipping: a flat price for each region. To change one, edit its setting in Vercel (Project → Settings →
        Environment Variables), then redeploy.
      </p>

      <section className={`mt-6 ${card}`} aria-labelledby="regions">
        <h2 id="regions" className="text-h3 font-bold">Price for each region</h2>
        <ul className="mt-3 divide-y divide-line">
          {regions.map((r) => (
            <li key={r.setting} className="grid gap-1 py-3 sm:grid-cols-[14rem_6rem_1fr] sm:gap-4">
              <span className="font-semibold">{r.name}</span>
              <span>{cad(r.cents)}</span>
              <code className="text-sm text-muted">{r.setting}</code>
            </li>
          ))}
        </ul>
        {p.handlingCents ? <p className="mt-3 text-sm text-muted">Every order also adds a {cad(p.handlingCents)} packing charge.</p> : null}
      </section>

      <section className={`mt-6 ${card}`} aria-labelledby="rules">
        <h2 id="rules" className="text-h3 font-bold">Duties and free shipping</h2>
        <ul className="mt-3 space-y-2 text-[0.9375rem]">
          <li>
            US orders add {rules.usDutyPercent}% of the order&apos;s value plus {cad(rules.usDutyFeeCents)} for import duties and fees{" "}
            <code className="text-sm text-muted">({RULE_SETTINGS.usDutyPercent}, {RULE_SETTINGS.usDutyFeeCents})</code>.
          </li>
          <li>
            {rules.freeOverCents
              ? `Canadian orders of ${cad(rules.freeOverCents)} or more ship free ${rules.freeMaxCents === null ? "anywhere in Canada" : `where shipping is under ${cad(rules.freeMaxCents)}`} (${freeArea ?? "nowhere at these prices"}).`
              : "Free shipping is off."}{" "}
            <code className="text-sm text-muted">({RULE_SETTINGS.freeOverCents}, {RULE_SETTINGS.freeMaxCents})</code>
          </li>
        </ul>
      </section>

      <section className={`mt-6 ${card}`} aria-labelledby="samples">
        <h2 id="samples" className="text-h3 font-bold">What a customer sees</h2>
        <p className="mt-1 text-sm text-muted">Shipping for one Lumi to a sample address in each region. US prices here leave out the percent of the order&apos;s value.</p>
        <ul className="mt-3 divide-y divide-line">
          {samples.map((s) => (
            <li key={s.place} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <span className="font-semibold">{s.place}</span>
              <span className="text-ink-soft">
                {s.quote ? (
                  <>
                    <b className="text-ink">{cad(s.quote.amount)}</b>, {s.quote.label}, {s.quote.minDays} to {s.quote.maxDays} business days
                  </>
                ) : (
                  "Not shipped there"
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm text-muted">
        Ships from {p.fromPostalCode}. Parcel: {p.cm.join(" × ")} cm, {p.boxKg} kg box plus {p.unitKg} kg per Lumi. Labels are bought from Chit Chats on each
        order&apos;s page.
      </p>
    </>
  );
}
