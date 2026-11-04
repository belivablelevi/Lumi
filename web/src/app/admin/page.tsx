import Link from "next/link";
import clsx from "clsx";
import { OrderPill } from "@/components/admin/OrderPill";
import { buttonClass } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin-session";
import { itemsSummary, shippingAddress, shortDate } from "@/lib/fulfilment";
import { getStore } from "@/lib/store";
import type { OrderView } from "@/lib/store/types";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

const VIEWS: { id: OrderView; label: string }[] = [
  { id: "to_ship", label: "To ship" },
  { id: "shipped", label: "Shipped" },
  { id: "all", label: "All paid" },
];

export default async function Page({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const { view: v } = await searchParams;
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
          <form action={logout}>
            <button type="submit" className={buttonClass("ghost")}>Sign out</button>
          </form>
        </div>
      </div>

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
    </>
  );
}
