import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** For the success page: an order's status, only to someone holding its Stripe session id. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("order") ?? "";
  const session = url.searchParams.get("session_id") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !session) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const order = await store.getOrder(id);
  if (!order || order.stripeSessionId !== session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    { status: order.status, fulfilment: order.fulfilment, items: order.items.map((i) => ({ name: i.name, qty: i.qty })) },
    { headers: { "cache-control": "no-store" } },
  );
}
