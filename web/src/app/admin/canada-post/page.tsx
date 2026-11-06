import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin-session";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { checkCanadaPost, quotedCm } from "@/lib/shipping";

export const dynamic = "force-dynamic";

const card = "rounded-card bg-white p-6 ring-1 ring-line";
const SETTINGS = ["CANADA_POST_API_KEY", "CANADA_POST_API_SECRET", "CANADA_POST_CUSTOMER_NUMBER"] as const;
const cad = (cents: number) => formatMoney({ amount: cents, currency: "CAD" });

/** Checks the Canada Post key in Vercel by pricing one Lumi to a few sample addresses. */
export default async function Page({ searchParams }: PageProps<"/admin/canada-post">) {
  await requireAdmin();
  const { run } = await searchParams;
  const cp = env.canadaPost;
  const missing = SETTINGS.filter((k) => !process.env[k]?.trim());
  const results = cp && run === "1" ? await checkCanadaPost(cp, env.parcel) : null;
  const main = results?.filter((r) => !r.counter);
  const allGood = main?.every((r) => r.ok);
  const counterOnly = !!results && !main?.some((r) => r.ok) && results.some((r) => r.counter && r.ok);
  const forbidden = !!results && results.every((r) => !r.ok && r.error.includes("(403)"));
  const p = env.parcel;
  const t = env.shippingTable;
  const rules = env.shippingRules;

  return (
    <>
      <p>
        <Link href="/admin" className="text-sm font-semibold text-muted underline underline-offset-4">Back to orders</Link>
      </p>
      <h1 className="mt-4 text-h2 font-bold">Canada Post prices</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Checkout asks Canada Post for the price to each address. This test does the same for one Lumi to a few sample
        addresses, using the key saved in Vercel, and shows Canada Post&apos;s answer.
      </p>

      <section className={`mt-6 ${card}`} aria-labelledby="settings">
        <h2 id="settings" className="text-h3 font-bold">Settings in Vercel</h2>
        <ul className="mt-3 space-y-1 text-[0.9375rem]">
          {SETTINGS.map((k) => (
            <li key={k}>
              <code className="font-semibold">{k}</code>:{" "}
              {missing.includes(k) ? <span className="font-semibold text-[#b42318]">not set</span> : <span className="text-ink-soft">set</span>}
              {k === "CANADA_POST_CUSTOMER_NUMBER" && cp ? <span className="text-muted"> (ends in {cp.customerNumber.slice(-4)})</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Ships from {p.fromPostalCode}. Parcel: {p.cm.join(" × ")} cm, {p.boxKg} kg box plus {p.unitKg} kg per Lumi
          {p.handlingCents ? `, plus ${cad(p.handlingCents)} packing charge` : ""}.
          {quotedCm(p, "CA").join() !== [...p.cm].sort((a, b) => b - a).join()
            ? ` Inside Canada it's priced as ${quotedCm(p, "CA").join(" × ")} cm, Canada Post's smallest parcel.`
            : ""}
        </p>
      </section>

      {!cp ? (
        <p className={`mt-6 ${card}`}>
          Live Canada Post prices are off, so checkout uses your flat prices: {cad(t.near)} Ontario and Quebec, {cad(t.far)} rest of
          Canada, {cad(t.north)} the North, {cad(t.us)} US. US orders add {rules.usDutyPercent}% of the order&apos;s value plus{" "}
          {cad(rules.usDutyFeeCents)} for import duties and fees.{" "}
          {rules.freeOverCents ? `Canadian orders of ${cad(rules.freeOverCents)} or more ship free.` : "Free shipping is off."} To turn live
          prices on, add the settings marked &quot;not set&quot; in Vercel (Project → Settings → Environment Variables), then redeploy.
        </p>
      ) : (
        <section className={`mt-6 ${card}`} aria-labelledby="test">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="test" className="text-h3 font-bold">Test</h2>
            <a href="/admin/canada-post?run=1" className={buttonClass("primary")}>{results ? "Run it again" : "Test Canada Post"}</a>
          </div>
          {results ? (
            <>
              <p className={`mt-4 rounded-chip px-4 py-2.5 text-sm font-semibold ${allGood ? "bg-mint-pale" : "bg-[#fde8e7]"}`} role="status">
                {allGood
                  ? "Working: checkout is getting Canada Post's own prices."
                  : "Not working: checkout is using the backup price table. Canada Post's reason is below."}
              </p>
              <ul className="mt-4 divide-y divide-line">
                {results.map((r) => (
                  <li key={r.place} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                    <span className="font-semibold">{r.place}</span>
                    {r.ok ? (
                      <span className="text-ink-soft">
                        {r.service}: <b className="text-ink">{cad(r.cents)}</b> before tax
                        {r.checkoutCents !== r.cents ? `, ${cad(r.checkoutCents)} at checkout` : ""}
                        {r.transitDays ? `, about ${r.transitDays} business day${r.transitDays === 1 ? "" : "s"}` : ""}
                      </span>
                    ) : (
                      <span className="break-words text-[#b42318]">{r.error}</span>
                    )}
                  </li>
                ))}
              </ul>
              {counterOnly ? (
                <p className="mt-3 text-sm font-semibold">
                  Regular prices work but your discounted ones don&apos;t: the customer number in Vercel doesn&apos;t match the account the
                  API key was made under. Check the customer number on the app in the Developer Portal.
                </p>
              ) : forbidden ? (
                <p className="mt-3 text-sm text-muted">
                  403 means Canada Post accepted the key but won&apos;t let it get prices. Check that the app is a Production app and its
                  Rating subscription is approved, not pending. If both look right, send this page to Snaggo&apos;s developer.
                </p>
              ) : !allGood ? (
                <p className="mt-3 text-sm text-muted">
                  &quot;Refused the API key and secret&quot; usually means the secret doesn&apos;t belong to that key (reset it in the Developer
                  Portal and update Vercel), or the app isn&apos;t subscribed to Rating. After changing a setting in Vercel, redeploy before testing again.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-muted">Click the button to ask Canada Post for three sample prices. It doesn&apos;t buy or create anything.</p>
          )}
        </section>
      )}
    </>
  );
}
