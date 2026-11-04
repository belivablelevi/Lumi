import type { Currency } from "../money";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "review" | "refunded";
export type FulfilmentStatus = "unfulfilled" | "packed" | "shipped";
export type Carrier = "canada_post" | "chit_chats" | "other";

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
  // After payment (0003_fulfilment.sql). Unset means unfulfilled / nothing refunded.
  fulfilmentStatus?: FulfilmentStatus;
  carrier?: Carrier;
  trackingNumber?: string;
  shippedAt?: string;
  shippedEmailSentAt?: string;
  /** The Lumi(s) packed for this order, for the card in the box. */
  unitNames?: string;
  adminNote?: string;
  paymentIntent?: string;
  refundedAmount?: number;
  /** Whether this order's units count as sold (so a refund returns them once). */
  countedSold?: boolean;
  // Checkout extras, in cents. Tip and protection are line items in Stripe on top of `subtotal`.
  tipAmount?: number;
  protectionAmount?: number;
  /** Shipping Stripe charged (before tax), set when the order is paid. */
  shippingAmount?: number;
}

export interface Addons {
  tipAmount: number;
  protectionAmount: number;
}

export type OrderView = "to_ship" | "shipped" | "all";

export interface FulfilmentPatch {
  fulfilmentStatus?: FulfilmentStatus;
  carrier?: Carrier | null;
  trackingNumber?: string | null;
  unitNames?: string | null;
  adminNote?: string | null;
}

export type RefundResult = "updated" | "partial" | "already" | "missing";

export type ReserveResult = { ok: true } | { ok: false; reason: "insufficient" | "not_configured"; sku: string };
export type PaidResult = "updated" | "already" | "missing";

export interface PaidDetails {
  sessionId: string;
  email?: string;
  customerName?: string;
  shipping?: unknown;
  amountTotal?: number;
  paymentIntent?: string;
  shippingAmount?: number;
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
  /** Changes the tip and protection on an order that's still being paid. False once it isn't pending. */
  updateAddons(orderId: string, addons: Addons): Promise<boolean>;
  getOrder(orderId: string): Promise<Order | null>;
  markPaid(orderId: string, details: PaidDetails): Promise<PaidResult>;
  markConfirmationSent(orderId: string): Promise<void>;
  /** Ends a pending order and gives its reserved capacity back. No-op unless pending. */
  releaseOrder(orderId: string, status: "expired" | "failed"): Promise<void>;
  /** Paid orders for the admin page, oldest first for "to_ship", newest first otherwise. */
  listOrders(view: OrderView): Promise<Order[]>;
  /** Shipping it also stamps shippedAt the first time. */
  updateFulfilment(orderId: string, patch: FulfilmentPatch): Promise<void>;
  markShippedEmailSent(orderId: string): Promise<void>;
  /** A refund made in Stripe, found by its payment intent. */
  markRefunded(paymentIntent: string, refundedAmount: number, full: boolean): Promise<RefundResult>;
  /** Returns false if this webhook event was already recorded. */
  recordEvent(eventId: string, type: string): Promise<boolean>;
  hasEvent(eventId: string): Promise<boolean>;

  saveSignup(s: SignupRecord): Promise<SignupResult>;
  confirmSignup(tokenHash: string): Promise<boolean>;
  unsubscribe(tokenHash: string): Promise<boolean>;
  countAttempts(keyHash: string, sinceIso: string): Promise<number>;
  recordAttempt(keyHash: string): Promise<void>;
}
