import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/admin/CopyButton";
import { OrderPill } from "@/components/admin/OrderPill";
import { Button } from "@/components/ui/Button";
import { PROTECTION_LABEL } from "@/lib/addons";
import { requireAdmin } from "@/lib/admin-session";
import { lumiNames, shippedHeading } from "@/lib/email";
import { env } from "@/lib/env";
import { CARRIERS, addressLines, dateTime, shippingAddress, trackingUrl } from "@/lib/fulfilment";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/store";
import { markShipped, resendShipped, savePacking } from "../../actions";

export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  saved: "Saved.",
  packed: "Marked packed.",
  shipped: "Marked shipped. No email went out: the order has no email address, email isn't set up, or it was already sent.",
  "shipped-emailed": "Marked shipped, and the customer has been emailed their tracking.",
  emailed: "Shipping email sent again.",
  "no-email": "Couldn't send: the order has no email address, or email isn't set up.",
  "not-paid": "Only paid orders can be shipped.",
  "not-shipped": "Mark it shipped first.",
};

const field = "h-11 w-full rounded-chip border border-line bg-white px-4 text-[0.9375rem] outline-none focus:border-ink/40";
const card = "rounded-card bg-white p-6 ring-1 ring-line";

export default async function Page({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { done } = await searchParams;
  const store = getStore();
  const order = store && /^[0-9a-f-]{36}$/i.test(id) ? await store.getOrder(id) : null;
  if (!order || !order.paidAt) notFound();

  const a = shippingAddress(order);
  const lines = addressLines(a);
  const url = trackingUrl(order.carrier, order.trackingNumber);
  const shipped = order.fulfilmentStatus === "shipped";
  const canShip = order.status === "paid" || order.status === "review";
  const stripeBase = env.stripeSecretKey?.startsWith("sk_test_") || env.stripeSecretKey?.startsWith("rk_test_") ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
  const message = typeof done === "string" ? DONE[done] : undefined;
  const extras = [
    ...(order.protectionAmount ? [[PROTECTION_LABEL, order.protectionAmount] as const] : []),
    ...(order.shippingAmount !== undefined ? [["Shipping", order.shippingAmount] as const] : []),
    ...(order.tipAmount ? [["Tip", order.tipAmount] as const] : []),
  ];

  const names = lumiNames(order.unitNames);
  // Off by default: the name is usually first revealed on the birth certificate in the box.
  const namesBox = (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="includeNames" value="1" disabled={!names.length} className="mt-1 size-4 accent-current" />
      <span>
        <span className="font-semibold">Name {names.length > 1 ? "them" : "it"} in the email</span>
        <span className="block text-muted">
          {names.length
            ? `Subject becomes "${shippedHeading(names)}". Leave it off to keep the name a surprise.`
            : "Save a name in “Lumi(s) packed” first. Brackets and serials are left out."}
        </span>
      </span>
    </label>
  );

  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-muted hover:text-ink">← All orders</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-h2 font-bold">{a.name ?? order.email ?? "Order"}</h1>
        <OrderPill order={order} />
      </div>
      <p className="mt-1 text-sm text-muted">
        Order {order.id.slice(0, 8)} · paid {dateTime(order.paidAt)}
        {order.fulfilment === "preorder" ? " · pre-order" : ""}
      </p>
      {message ? <p role="status" className="mt-4 rounded-card bg-mint/40 px-4 py-3 text-sm font-semibold">{message}</p> : null}
      {order.status === "review" ? (
        <p className="mt-4 rounded-card bg-[#ffe6b3] px-4 py-3 text-sm">
          <b>Check this payment before shipping.</b> The amount Stripe charged didn&apos;t match the order, or it was paid after its checkout
          window ended (so it may be over capacity). Compare it in Stripe, and refund it there if it&apos;s wrong.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="ship-to">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ship-to" className="text-h3 font-bold">Ship to</h2>
            {lines.length ? <CopyButton text={lines.join("\n")} label="Copy address" /> : null}
          </div>
          {lines.length ? (
            <address className="mt-3 not-italic leading-relaxed">{lines.map((l) => <span key={l} className="block">{l}</span>)}</address>
          ) : (
            <p className="mt-3 text-muted">No shipping address on this order.</p>
          )}
          {order.email ? <p className="mt-3 text-sm text-muted">{order.email}</p> : null}
        </section>

        <section className={card} aria-labelledby="items">
          <h2 id="items" className="text-h3 font-bold">Items</h2>
          <ul className="mt-3 space-y-1">
            {order.items.map((i) => (
              <li key={`${i.sku}-${i.variantId ?? ""}`} className="flex justify-between gap-4">
                <span>{i.qty} × {i.name}</span>
                <span className="text-muted">{formatMoney({ amount: i.unitAmount * i.qty, currency: order.currency })}</span>
              </li>
            ))}
            {extras.map(([label, amount]) => (
              <li key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span className="text-muted">{formatMoney({ amount, currency: order.currency })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 font-semibold">
            Paid {formatMoney({ amount: order.amountTotal ?? order.subtotal, currency: order.currency })}
            {order.refundedAmount ? <span className="text-muted"> · refunded {formatMoney({ amount: order.refundedAmount, currency: order.currency })}</span> : null}
          </p>
          {order.paymentIntent ? (
            <a className="mt-2 inline-block text-sm font-semibold underline" href={`${stripeBase}/payments/${order.paymentIntent}`} target="_blank" rel="noreferrer">
              Open in Stripe (refunds happen there)
            </a>
          ) : null}
        </section>

        <section className={card} aria-labelledby="packing">
          <h2 id="packing" className="text-h3 font-bold">Packing</h2>
          {order.protectionAmount ? (
            <p className="mt-3 rounded-card bg-lavender-pale px-4 py-3 text-sm font-semibold">Shipping protection: pack this one with the extra protection.</p>
          ) : null}
          <form action={savePacking.bind(null, order.id)} className="mt-3 space-y-3">
            <div>
              <label htmlFor="unitNames" className="text-sm font-semibold">Lumi(s) packed</label>
              <input id="unitNames" name="unitNames" defaultValue={order.unitNames ?? ""} maxLength={200} placeholder="e.g. Starla (LUMI-000421)" className={field} />
            </div>
            <div>
              <label htmlFor="adminNote" className="text-sm font-semibold">Note (only you see this)</label>
              <textarea id="adminNote" name="adminNote" defaultValue={order.adminNote ?? ""} maxLength={2000} rows={3} className={`${field} h-auto py-3`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline">Save</Button>
              {!shipped && canShip ? <Button type="submit" name="packed" value="1" variant="soft">Save and mark packed</Button> : null}
            </div>
          </form>
        </section>

        <section className={card} aria-labelledby="shipping">
          <h2 id="shipping" className="text-h3 font-bold">Shipping</h2>
          {shipped ? (
            <p className="mt-3 text-sm">
              Shipped {dateTime(order.shippedAt)}
              {order.shippedEmailSentAt ? `, customer emailed ${dateTime(order.shippedEmailSentAt)}` : ", customer not emailed"}.
              {url ? <> <a className="font-semibold underline" href={url} target="_blank" rel="noreferrer">Track it</a></> : null}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Buy the label (Snap Ship or Chit Chats), then enter the tracking number here. The customer gets an email with the tracking link
              and how to wake their Lumi.
            </p>
          )}
          {canShip ? (
            <form action={markShipped.bind(null, order.id)} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <div>
                  <label htmlFor="carrier" className="text-sm font-semibold">Carrier</label>
                  <select id="carrier" name="carrier" defaultValue={order.carrier ?? "canada_post"} className={field}>
                    {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="trackingNumber" className="text-sm font-semibold">Tracking number</label>
                  <input id="trackingNumber" name="trackingNumber" defaultValue={order.trackingNumber ?? ""} maxLength={60} autoComplete="off" className={field} />
                </div>
              </div>
              {!order.shippedEmailSentAt ? namesBox : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{shipped ? "Update tracking" : "Mark shipped"}</Button>
              </div>
            </form>
          ) : null}
          {shipped ? (
            <form action={resendShipped.bind(null, order.id)} className="mt-4 space-y-2 border-t border-line pt-3">
              {namesBox}
              <Button type="submit" variant="ghost" className="px-0">Resend shipping email</Button>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
