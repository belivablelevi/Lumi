import type { Currency } from "../money";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "review";

export interface OrderItem {
  sku: string;
  slug: string;
  name: string;
  variantId?: string;
  qty: number;
  unitAmount: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  fulfilment: "preorder" | "now";
  currency: Currency;
  subtotal: number;
  items: OrderItem[];
  createdAt: string;
  reservationExpiresAt: string;
  stripeSessionId?: string;
  email?: string;
  customerName?: string;
  shipping?: unknown;
  amountTotal?: number;
  paidAt?: string;
  confirmationSentAt?: string;
}

export type ReserveResult = { ok: true } | { ok: false; reason: "insufficient" | "not_configured"; sku: string };
export type PaidResult = "updated" | "already" | "missing";

export interface PaidDetails {
  sessionId: string;
  email?: string;
  customerName?: string;
  shipping?: unknown;
  amountTotal?: number;
  /** Set when Stripe's amounts don't match the order: the order goes to "review" instead of "paid". */
  mismatch?: boolean;
}

export type SignupResult = "new" | "pending" | "confirmed";

export interface SignupRecord {
  email: string;
  topic: string;
  consentText: string;
  consentVersion: string;
  confirmTokenHash: string;
  unsubscribeTokenHash: string;
}

/** Everything the server persists. Supabase in production; in memory for tests. */
export interface Store {
  /** Creates a pending order and reserves capacity for every item, all or nothing. */
  createOrder(order: Order): Promise<ReserveResult>;
  attachSession(orderId: string, sessionId: string): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  markPaid(orderId: string, details: PaidDetails): Promise<PaidResult>;
  markConfirmationSent(orderId: string): Promise<void>;
  /** Ends a pending order and gives its reserved capacity back. No-op unless pending. */
  releaseOrder(orderId: string, status: "expired" | "failed"): Promise<void>;
  /** Returns false if this webhook event was already recorded. */
  recordEvent(eventId: string, type: string): Promise<boolean>;
  hasEvent(eventId: string): Promise<boolean>;

  saveSignup(s: SignupRecord): Promise<SignupResult>;
  confirmSignup(tokenHash: string): Promise<boolean>;
  unsubscribe(tokenHash: string): Promise<boolean>;
  countAttempts(keyHash: string, sinceIso: string): Promise<number>;
  recordAttempt(keyHash: string): Promise<void>;
}
