import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Addons,
  FulfilmentPatch,
  Order,
  OrderView,
  PaidDetails,
  PaidResult,
  RefundResult,
  ReserveResult,
  SignupRecord,
  SignupResult,
  Store,
} from "./types";

type Row = Record<string, unknown>;
const opt = <T,>(v: unknown) => (v ?? undefined) as T | undefined;

function toOrder(data: Row): Order {
  return {
    id: String(data.id),
    status: data.status as Order["status"],
    fulfilment: data.fulfilment as Order["fulfilment"],
    currency: data.currency as Order["currency"],
    subtotal: Number(data.subtotal),
    createdAt: String(data.created_at),
    reservationExpiresAt: String(data.reservation_expires_at),
    stripeSessionId: opt(data.stripe_session_id),
    email: opt(data.email),
    customerName: opt(data.customer_name),
    shipping: opt(data.shipping),
    amountTotal: opt(data.amount_total),
    paidAt: opt(data.paid_at),
    confirmationSentAt: opt(data.confirmation_sent_at),
    fulfilmentStatus: opt(data.fulfilment_status),
    carrier: opt(data.carrier),
    trackingNumber: opt(data.tracking_number),
    chitchatsShipmentId: opt(data.chitchats_shipment_id),
    shippedAt: opt(data.shipped_at),
    shippedEmailSentAt: opt(data.shipped_email_sent_at),
    unitNames: opt(data.unit_names),
    adminNote: opt(data.admin_note),
    paymentIntent: opt(data.payment_intent),
    refundedAmount: opt(data.refunded_amount),
    countedSold: opt(data.counted_sold),
    tipAmount: opt(data.tip_amount),
    protectionAmount: opt(data.protection_amount),
    shippingAmount: opt(data.shipping_amount),
    items: ((data.order_items as Row[] | undefined) ?? [])
      .sort((a, b) => Number(a.line) - Number(b.line))
      .map((i) => ({
        sku: String(i.sku),
        slug: String(i.slug),
        name: String(i.name),
        variantId: i.variant_id ? String(i.variant_id) : undefined,
        qty: Number(i.qty),
        unitAmount: Number(i.unit_amount),
      })),
  };
}

/** The Store backed by Supabase (tables and functions in supabase/migrations). Server only. */
export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private static fail(what: string, error: { message: string } | null): never {
    throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
  }

  async createOrder(order: Order): Promise<ReserveResult> {
    const { items, ...head } = order;
    const { data, error } = await this.db.rpc("create_order", { p_order: head, p_items: items });
    if (error) SupabaseStore.fail("create_order", error);
    const result = String(data);
    if (result === "ok") return { ok: true };
    const [reason, sku] = result.split(":") as ["insufficient" | "not_configured", string];
    return { ok: false, reason, sku };
  }

  async attachSession(orderId: string, sessionId: string) {
    const { error } = await this.db.from("orders").update({ stripe_session_id: sessionId }).eq("id", orderId);
    if (error) SupabaseStore.fail("attach session", error);
  }

  async updateAddons(orderId: string, addons: Addons) {
    const { data, error } = await this.db
      .from("orders")
      .update({ tip_amount: addons.tipAmount, protection_amount: addons.protectionAmount })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id");
    if (error) SupabaseStore.fail("update addons", error);
    return (data?.length ?? 0) > 0;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await this.db.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
    if (error) SupabaseStore.fail("get order", error);
    return data ? toOrder(data) : null;
  }

  async listOrders(view: OrderView): Promise<Order[]> {
    let q = this.db.from("orders").select("*, order_items(*)").not("paid_at", "is", null);
    if (view === "to_ship") q = q.in("status", ["paid", "review"]).neq("fulfilment_status", "shipped").order("paid_at", { ascending: true });
    else if (view === "shipped") q = q.eq("fulfilment_status", "shipped").order("shipped_at", { ascending: false });
    else q = q.order("paid_at", { ascending: false });
    const { data, error } = await q.limit(500);
    if (error) SupabaseStore.fail("list orders", error);
    return (data ?? []).map(toOrder);
  }

  async updateFulfilment(orderId: string, patch: FulfilmentPatch) {
    const row: Row = {};
    if (patch.fulfilmentStatus) row.fulfilment_status = patch.fulfilmentStatus;
    if (patch.carrier !== undefined) row.carrier = patch.carrier;
    if (patch.trackingNumber !== undefined) row.tracking_number = patch.trackingNumber;
    if (patch.chitchatsShipmentId !== undefined) row.chitchats_shipment_id = patch.chitchatsShipmentId;
    if (patch.unitNames !== undefined) row.unit_names = patch.unitNames;
    if (patch.adminNote !== undefined) row.admin_note = patch.adminNote;
    if (Object.keys(row).length) {
      const { error } = await this.db.from("orders").update(row).eq("id", orderId);
      if (error) SupabaseStore.fail("update fulfilment", error);
    }
    if (patch.fulfilmentStatus === "shipped") {
      // Only the first time: re-saving a tracking number keeps the original ship date.
      const { error } = await this.db.from("orders").update({ shipped_at: new Date().toISOString() }).eq("id", orderId).is("shipped_at", null);
      if (error) SupabaseStore.fail("stamp shipped", error);
    }
  }

  async markShippedEmailSent(orderId: string) {
    const { error } = await this.db.from("orders").update({ shipped_email_sent_at: new Date().toISOString() }).eq("id", orderId);
    if (error) SupabaseStore.fail("mark shipped email sent", error);
  }

  async addDemoOrder(order: Order) {
    const { error } = await this.db.from("orders").insert({
      id: order.id,
      status: order.status,
      fulfilment: order.fulfilment,
      currency: order.currency,
      subtotal: order.subtotal,
      created_at: order.createdAt,
      reservation_expires_at: order.reservationExpiresAt,
      stripe_session_id: order.stripeSessionId,
      customer_name: order.customerName ?? null,
      shipping: order.shipping ?? null,
      amount_total: order.amountTotal ?? null,
      paid_at: order.paidAt ?? null,
      counted_sold: false,
      admin_note: order.adminNote ?? null,
    });
    if (error) SupabaseStore.fail("add demo order", error);
    const { error: e2 } = await this.db.from("order_items").insert(
      order.items.map((i, line) => ({ order_id: order.id, line, sku: i.sku, slug: i.slug, name: i.name, variant_id: i.variantId ?? null, qty: i.qty, unit_amount: i.unitAmount })),
    );
    if (e2) {
      await this.db.from("orders").delete().eq("id", order.id);
      SupabaseStore.fail("add demo order items", e2);
    }
  }

  async deleteDemoOrder(orderId: string) {
    // Only the row whose session id is exactly this demo's: a real order can't match.
    const { data, error } = await this.db.from("orders").delete().eq("id", orderId).eq("stripe_session_id", `demo_${orderId}`).select("id");
    if (error) SupabaseStore.fail("delete demo order", error);
    return (data?.length ?? 0) > 0;
  }

  async markRefunded(paymentIntent: string, refundedAmount: number, full: boolean): Promise<RefundResult> {
    const { data, error } = await this.db.rpc("mark_order_refunded", {
      p_payment_intent: paymentIntent,
      p_refunded: refundedAmount,
      p_full: full,
    });
    if (error) SupabaseStore.fail("mark_order_refunded", error);
    return data as RefundResult;
  }

  async markPaid(orderId: string, d: PaidDetails): Promise<PaidResult> {
    const { data, error } = await this.db.rpc("mark_order_paid", {
      p_order: orderId,
      p_session: d.sessionId,
      p_email: d.email ?? null,
      p_name: d.customerName ?? null,
      p_shipping: d.shipping ?? null,
      p_amount_total: d.amountTotal ?? null,
      p_mismatch: !!d.mismatch,
    });
    if (error) SupabaseStore.fail("mark_order_paid", error);
    if (data === "updated" && (d.paymentIntent || d.shippingAmount !== undefined)) {
      const { error: e2 } = await this.db
        .from("orders")
        .update({ payment_intent: d.paymentIntent ?? null, shipping_amount: d.shippingAmount ?? null })
        .eq("id", orderId);
      if (e2) SupabaseStore.fail("save payment details", e2);
    }
    return data as PaidResult;
  }

  async markConfirmationSent(orderId: string) {
    const { error } = await this.db.from("orders").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", orderId);
    if (error) SupabaseStore.fail("mark confirmation sent", error);
  }

  async releaseOrder(orderId: string, status: "expired" | "failed") {
    const { error } = await this.db.rpc("release_order", { p_order: orderId, p_status: status });
    if (error) SupabaseStore.fail("release_order", error);
  }

  async recordEvent(eventId: string, type: string) {
    const { data, error } = await this.db
      .from("stripe_events")
      .upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) SupabaseStore.fail("record event", error);
    return (data?.length ?? 0) > 0;
  }

  async hasEvent(eventId: string) {
    const { data, error } = await this.db.from("stripe_events").select("id").eq("id", eventId).maybeSingle();
    if (error) SupabaseStore.fail("has event", error);
    return !!data;
  }

  async saveSignup(s: SignupRecord): Promise<SignupResult> {
    const { data: existing, error } = await this.db
      .from("launch_signups")
      .select("confirmed_at, unsubscribed_at")
      .eq("email", s.email)
      .eq("topic", s.topic)
      .maybeSingle();
    if (error) SupabaseStore.fail("read signup", error);
    if (existing?.confirmed_at && !existing.unsubscribed_at) return "confirmed";
    const row = {
      email: s.email,
      topic: s.topic,
      consent_text: s.consentText,
      consent_version: s.consentVersion,
      consented_at: new Date().toISOString(),
      confirm_token_hash: s.confirmTokenHash,
      unsubscribe_token_hash: s.unsubscribeTokenHash,
      confirmed_at: null,
      unsubscribed_at: null,
    };
    const { error: e2 } = await this.db.from("launch_signups").upsert(row, { onConflict: "email,topic" });
    if (e2) SupabaseStore.fail("save signup", e2);
    return existing ? "pending" : "new";
  }

  async confirmSignup(tokenHash: string) {
    const { data, error } = await this.db
      .from("launch_signups")
      .update({ confirmed_at: new Date().toISOString(), unsubscribed_at: null })
      .eq("confirm_token_hash", tokenHash)
      .select("id");
    if (error) SupabaseStore.fail("confirm signup", error);
    return (data?.length ?? 0) > 0;
  }

  async unsubscribe(tokenHash: string) {
    const { data, error } = await this.db
      .from("launch_signups")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token_hash", tokenHash)
      .select("id");
    if (error) SupabaseStore.fail("unsubscribe", error);
    return (data?.length ?? 0) > 0;
  }

  async countAttempts(keyHash: string, sinceIso: string) {
    const { count, error } = await this.db
      .from("signup_attempts")
      .select("*", { count: "exact", head: true })
      .eq("key_hash", keyHash)
      .gte("at", sinceIso);
    if (error) SupabaseStore.fail("count attempts", error);
    return count ?? 0;
  }

  async recordAttempt(keyHash: string) {
    const { error } = await this.db.from("signup_attempts").insert({ key_hash: keyHash });
    if (error) SupabaseStore.fail("record attempt", error);
  }
}
