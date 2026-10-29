import type { Order, PaidDetails, PaidResult, ReserveResult, SignupRecord, SignupResult, Store } from "./types";

interface Signup extends SignupRecord {
  confirmedAt?: string;
  unsubscribedAt?: string;
}

/** A Store kept in memory: for tests, and for trying the site with no database. */
export class MemoryStore implements Store {
  orders = new Map<string, Order>();
  events = new Map<string, string>();
  signups = new Map<string, Signup>();
  attempts: { key: string; at: string }[] = [];
  /** sku -> { total, reserved, sold } */
  capacity = new Map<string, { total: number; reserved: number; sold: number }>();

  constructor(capacity: Record<string, number> = {}) {
    for (const [sku, total] of Object.entries(capacity)) this.capacity.set(sku, { total, reserved: 0, sold: 0 });
  }

  async createOrder(order: Order): Promise<ReserveResult> {
    const need = new Map<string, number>();
    for (const i of order.items) need.set(i.sku, (need.get(i.sku) ?? 0) + i.qty);
    for (const [sku, qty] of need) {
      const c = this.capacity.get(sku);
      if (!c) return { ok: false, reason: "not_configured", sku };
      if (c.total - c.reserved - c.sold < qty) return { ok: false, reason: "insufficient", sku };
    }
    for (const [sku, qty] of need) this.capacity.get(sku)!.reserved += qty;
    this.orders.set(order.id, structuredClone(order));
    return { ok: true };
  }

  async attachSession(orderId: string, sessionId: string) {
    const o = this.orders.get(orderId);
    if (o) o.stripeSessionId = sessionId;
  }

  async getOrder(orderId: string) {
    const o = this.orders.get(orderId);
    return o ? structuredClone(o) : null;
  }

  async markPaid(orderId: string, d: PaidDetails): Promise<PaidResult> {
    const o = this.orders.get(orderId);
    if (!o) return "missing";
    if (o.status === "paid" || o.status === "review") return "already";
    const wasPending = o.status === "pending";
    Object.assign(o, {
      // Paid after its reservation ended, or for the wrong amount: a person should look at it.
      status: d.mismatch || !wasPending ? "review" : "paid",
      stripeSessionId: d.sessionId,
      email: d.email,
      customerName: d.customerName,
      shipping: d.shipping,
      amountTotal: d.amountTotal,
      paidAt: new Date().toISOString(),
    });
    // A late payment's reservation is already gone: leave capacity for the person reviewing it.
    if (wasPending) {
      for (const i of o.items) {
        const c = this.capacity.get(i.sku);
        if (!c) continue;
        c.reserved -= i.qty;
        c.sold += i.qty;
      }
    }
    return "updated";
  }

  async markConfirmationSent(orderId: string) {
    const o = this.orders.get(orderId);
    if (o) o.confirmationSentAt = new Date().toISOString();
  }

  async releaseOrder(orderId: string, status: "expired" | "failed") {
    const o = this.orders.get(orderId);
    if (!o || o.status !== "pending") return;
    o.status = status;
    for (const i of o.items) {
      const c = this.capacity.get(i.sku);
      if (c) c.reserved -= i.qty;
    }
  }

  async recordEvent(eventId: string, type: string) {
    if (this.events.has(eventId)) return false;
    this.events.set(eventId, type);
    return true;
  }

  async hasEvent(eventId: string) {
    return this.events.has(eventId);
  }

  async saveSignup(s: SignupRecord): Promise<SignupResult> {
    const key = `${s.email}|${s.topic}`;
    const existing = this.signups.get(key);
    if (existing?.confirmedAt && !existing.unsubscribedAt) return "confirmed";
    this.signups.set(key, { ...s });
    return existing ? "pending" : "new";
  }

  async confirmSignup(tokenHash: string) {
    for (const s of this.signups.values()) {
      if (s.confirmTokenHash === tokenHash) {
        s.confirmedAt ??= new Date().toISOString();
        s.unsubscribedAt = undefined;
        return true;
      }
    }
    return false;
  }

  async unsubscribe(tokenHash: string) {
    let found = false;
    for (const s of this.signups.values()) {
      if (s.unsubscribeTokenHash === tokenHash) {
        s.unsubscribedAt = new Date().toISOString();
        found = true;
      }
    }
    return found;
  }

  async countAttempts(key: string, sinceIso: string) {
    return this.attempts.filter((a) => a.key === key && a.at >= sinceIso).length;
  }

  async recordAttempt(key: string) {
    this.attempts.push({ key, at: new Date().toISOString() });
  }
}
