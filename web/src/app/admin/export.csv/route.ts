import { isAdmin } from "@/lib/admin-session";
import { env } from "@/lib/env";
import { isDemoOrder } from "@/lib/demo-order";
import { ordersCsv } from "@/lib/fulfilment";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The orders still to ship, for a label tool or as a packing list. */
export async function GET() {
  if (!env.adminPassword) return new Response("Not found", { status: 404 });
  if (!(await isAdmin())) return new Response("Sign in first", { status: 401 });
  const store = getStore();
  if (!store) return new Response("The database isn't set up", { status: 503 });
  // Demo orders stay out, so they never end up in a bulk label upload.
  const csv = ordersCsv((await store.listOrders("to_ship")).filter((o) => !isDemoOrder(o)));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lumi-orders-to-ship-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
