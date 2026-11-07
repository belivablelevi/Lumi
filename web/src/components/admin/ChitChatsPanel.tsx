import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CHIT_CHATS_STAGING, getShipment, packing, type ChitChatsConfig, type ChitChatsShipment, type CustomsConfig } from "@/lib/chitchats";
import { shippingAddress } from "@/lib/fulfilment";
import { formatMoney } from "@/lib/money";
import type { ParcelConfig } from "@/lib/shipping";
import type { Order } from "@/lib/store/types";
import { buyChitChatsLabel, createChitChatsShipment, deleteChitChatsShipment } from "@/app/admin/actions";

const cad = (amount: number) => formatMoney({ amount, currency: "CAD" });
const BOUGHT = new Set(["ready", "in_transit", "received", "released", "inducted", "resolved", "delivered"]);

/** Chit Chats' battery rules for this order, in plain words. */
function PackingNote({ marked, us }: { marked: boolean; us: boolean }) {
  return marked ? (
    <div className="mt-3 rounded-chip border border-line p-3 text-sm">
      <b>More than one Lumi: battery rules apply.</b>
      <ul className="mt-1 list-disc pl-5">
        <li>Pack them in a sturdy cardboard box (not a padded mailer), 5.5 lb at most.</li>
        <li>Stick a lithium battery mark with your phone number on it on the same side as the label (or the side next to it, never the opposite side).</li>
        {us ? <li>Pick <b>U.S. Edge</b>. USPS Priority also works but adds a battery handling charge.</li> : null}
      </ul>
    </div>
  ) : (
    <p className="mt-3 text-sm text-muted">One Lumi: a padded mailer is fine, with no battery markings on it.</p>
  );
}

/** Chit Chats on an order: create the shipment, pick and buy a rate, then print the label. */
export async function ChitChatsPanel({ order, cfg, parcel, customs, canShip }: {
  order: Order;
  cfg: ChitChatsConfig | null;
  parcel: ParcelConfig;
  customs: CustomsConfig;
  canShip: boolean;
}) {
  if (!cfg) {
    return (
      <p className="mt-3 text-sm text-muted">
        To buy labels here, add <code>CHIT_CHATS_CLIENT_ID</code> and <code>CHIT_CHATS_ACCESS_TOKEN</code> (mark it Sensitive) in Vercel, from
        Chit Chats → Settings → Developer → API Access Tokens, then redeploy.
      </p>
    );
  }
  const test = cfg.base === CHIT_CHATS_STAGING ? <p className="mt-3 text-sm font-semibold">Using Chit Chats&apos; test site: labels are fake.</p> : null;
  const us = shippingAddress(order).country?.toUpperCase() === "US";
  const pack = packing(order, parcel, customs, us ? "US" : "CA");
  const box = `${pack.cm.join(" × ")} cm, ${pack.kg} kg, ${pack.packageType === "thick_envelope" ? "padded envelope" : "parcel"}`;
  const note = <PackingNote marked={pack.marked} us={us} />;

  if (!order.chitchatsShipmentId) {
    if (!canShip || order.fulfilmentStatus === "shipped") return <>{test}<p className="mt-3 text-sm text-muted">No Chit Chats shipment for this order.</p></>;
    return (
      <>
        {test}
        <p className="mt-3 text-sm text-muted">
          Makes an unpaid shipment with this order&apos;s address and your parcel settings ({box}), so you can compare rates. Nothing is
          charged until you buy one.
        </p>
        {note}
        <form action={createChitChatsShipment.bind(null, order.id)} className="mt-3">
          <Button type="submit" variant="outline">Create Chit Chats shipment</Button>
        </form>
      </>
    );
  }

  let s: ChitChatsShipment | null = null;
  let problem: string | undefined;
  try {
    s = await getShipment(cfg, order.chitchatsShipmentId);
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  if (!s) {
    return (
      <>
        {test}
        <p role="alert" className="mt-3 text-sm text-[#b42318]">Couldn&apos;t load shipment {order.chitchatsShipmentId}: {problem}</p>
      </>
    );
  }

  const deleteForm = (
    <form action={deleteChitChatsShipment.bind(null, order.id)} className="mt-3">
      <Button type="submit" variant="ghost" className="px-0">Delete this shipment</Button>
    </form>
  );

  if (BOUGHT.has(s.status)) {
    return (
      <>
        {test}
        <p className="mt-3 text-sm">
          Label bought{s.purchaseCents !== undefined ? ` (${cad(s.purchaseCents)})` : ""}. Print it, drop the parcel off, then press{" "}
          <b>Mark shipped</b>.
        </p>
        {note}
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
          {s.labelPdfUrl ? <a className="underline" href={s.labelPdfUrl} target="_blank" rel="noreferrer">Label (PDF)</a> : <span className="text-muted">Label not ready yet</span>}
          {s.trackingUrl ? <a className="underline" href={s.trackingUrl} target="_blank" rel="noreferrer">Tracking</a> : null}
        </div>
        <p className="mt-2 text-xs text-muted">Shipment {s.id} · {s.status}. To cancel a bought label, refund it in your Chit Chats account.</p>
      </>
    );
  }

  if (s.status === "postage_requested") {
    return (
      <>
        {test}
        <p className="mt-3 text-sm">Chit Chats is buying the label. This takes a few seconds.</p>
        <Link href={`/admin/orders/${order.id}`} className="mt-3 inline-block text-sm font-semibold underline">Refresh</Link>
      </>
    );
  }

  return (
    <>
      {test}
      {s.status === "postage_purchase_failed" ? (
        <p role="alert" className="mt-3 text-sm text-[#b42318]">Chit Chats couldn&apos;t buy that label. Check your credits in Chit Chats, then try again.</p>
      ) : null}
      {s.rates.length ? (
        <ul className="mt-3 divide-y divide-line">
          {s.rates.map((r) => (
            <li key={r.postageType} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="text-sm">
                <b>{r.description}</b> · {cad(r.paymentCents)}
                {r.tariffCents ? <span className="text-muted"> (includes {cad(r.tariffCents)} US tariff)</span> : null}
                {r.deliveryTime ? <span className="block text-muted">{r.deliveryTime}</span> : null}
              </span>
              <form action={buyChitChatsLabel.bind(null, order.id)}>
                <input type="hidden" name="postageType" value={r.postageType} />
                <Button type="submit" variant="soft">Buy</Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Chit Chats has no rates for this shipment. Check the address, or delete it and create it again.</p>
      )}
      {note}
      <p className="mt-2 text-xs text-muted">Shipment {s.id} · {box}. Buying uses your Chit Chats credits.</p>
      {deleteForm}
    </>
  );
}
