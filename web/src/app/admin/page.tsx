import Link from "next/link";
import clsx from "clsx";
import { OrderPill } from "@/components/admin/OrderPill";
import { buttonClass } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin-session";
import { DEMO_PLACES, isDemoOrder } from "@/lib/demo-order";
import { itemsSummary, shippingAddress, shortDate } from "@/lib/fulfilment";
import { getStore } from "@/lib/store";
import type { OrderView } from "@/lib/store/types";
import { logout, makeDemoOrder } from "./actions";

export const dynamic = "force-dynamic";

const DEMO: Record<string, string> = {
  deleted: "Demo order deleted.",
  failed: "Couldn't make the demo order. Check that Supabase has a capacity row for LUMI-POCKET-01.",
  "no-db": "The database isn't set up, so there's nowhere to save a demo order.",
};

const VIEWS: { id: OrderView; label: string }[] = [
  { id: "to_ship", label: "To ship" },
  { id: "shipped", label: "Shipped" },
  { id: "all", label: "All paid" },
];

export default async function Page({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const { view: v, demo } = await searchParams;
  const demoMessage = typeof demo === "string" ? DEMO[demo] : undefined;
  const view = VIEWS.find((x) => x.id === v)?.id ?? "to_ship";
  const store = getStore();
  const orders = store ? await store.listOrders(view) : [];
  const units = orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-bold">Orders</h1>
        <div className="flex gap-2">
          {view === "to_ship" && orders.length ? (
            <a href="/admin/export.csv" className={buttonClass("outline")}>Download CSV</a>
          ) : null}
          <Link href="/admin/studio" className={buttonClass("outline")}>Lumi Studio</Link>
          <Link href="/admin/canada-post" className={buttonClass("outline")}>Canada Post test</Link>
          <form action={logout}>
            <button type="submit" className={buttonClass("ghost")}>Sign out</button>
          </form>
        </div>
      </div>

      {demoMessage ? <p role="status" className="mt-4 rounded-card bg-mint/40 px-4 py-3 text-sm font-semibold">{demoMessage}</p> : null}

      <nav className="mt-6 flex gap-2" aria-label="Order views">
        {VIEWS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "to_ship" ? "/admin" : `/admin?view=${x.id}`}
            aria-current={x.id === view ? "page" : undefined}
            className={clsx("rounded-chip px-4 py-2 text-sm font-semibold", x.id === view ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line hover:ring-ink/30")}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {!store ? (
        <p className="mt-8 rounded-card bg-white p-6 text-muted ring-1 ring-line">The database isn&apos;t set up, so there are no orders to show.</p>
      ) : orders.length === 0 ? (
        <p className="mt-8 rounded-card bg-white p-6 text-muted ring-1 ring-line">
          {view === "to_ship" ? "Nothing to ship. Paid orders show up here." : "No orders here yet."}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {orders.length} order{orders.length === 1 ? "" : "s"}, {units} unit{units === 1 ? "" : "s"}
          </p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-white ring-1 ring-line">
            {orders.map((o) => {
              const a = shippingAddress(o);
              return (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="grid gap-1 px-5 py-4 hover:bg-cloud sm:grid-cols-[5rem_1fr_auto] sm:items-center sm:gap-4">
                    <span className="text-sm text-muted">{shortDate(o.paidAt)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{a.name ?? o.email ?? "No name"}</span>
                      <span className="block truncate text-sm text-muted">
                        {itemsSummary(o)}
                        {a.city ? ` · ${a.city}${a.state ? `, ${a.state}` : ""}` : ""}
                        {isDemoOrder(o) ? " · Demo" : ""}
                        {o.protectionAmount ? " · Protection" : ""}
                        {o.unitNames ? ` · ${o.unitNames}` : ""}
                        {o.trackingNumber ? ` · ${o.trackingNumber}` : ""}
                      </span>
                    </span>
                    <OrderPill order={o} className="justify-self-start sm:justify-self-end" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {store ? (
        <section aria-labelledby="demo-order" className="mt-8 rounded-card bg-white p-6 ring-1 ring-line">
          <h2 id="demo-order" className="text-h3 font-bold">Demo order</h2>
          <p className="mt-1 text-sm text-muted">
            A fake paid order for 1 Pocket Lumi, to try packing and Chit Chats labels. No email goes out, no stock is used, and it stays out of the
            CSV. Delete it from its page when you&apos;re done.
          </p>
          <form action={makeDemoOrder} className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="demo-place" className="text-sm font-semibold">Ship to</label>
            <select id="demo-place" name="place" defaultValue="toronto" className="h-11 rounded-chip border border-line bg-white px-4 text-[0.9375rem] outline-none focus:border-ink/40">
              {DEMO_PLACES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button type="submit" className={buttonClass("outline")}>Make demo order</button>
          </form>
        </section>
      ) : null}
    </>
  );
}
