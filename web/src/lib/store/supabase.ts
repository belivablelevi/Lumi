import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Order, PaidDetails, PaidResult, ReserveResult, SignupRecord, SignupResult, Store } from "./types";

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

  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await this.db.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
    if (error) SupabaseStore.fail("get order", error);
    if (!data) return null;
    return {
      id: data.id,
      status: data.status,
      fulfilment: data.fulfilment,
      currency: data.currency,
      subtotal: data.subtotal,
      createdAt: data.created_at,
      reservationExpiresAt: data.reservation_expires_at,
      stripeSessionId: data.stripe_session_id ?? undefined,
      email: data.email ?? undefined,
      customerName: data.customer_name ?? undefined,
      shipping: data.shipping ?? undefined,
      amountTotal: data.amount_total ?? undefined,
      paidAt: data.paid_at ?? undefined,
      confirmationSentAt: data.confirmation_sent_at ?? undefined,
      items: (data.order_items as Record<string, unknown>[])
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
