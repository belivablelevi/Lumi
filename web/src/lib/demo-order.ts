import { products } from "@/content/products";
import { confirmed } from "./placeholder";
import type { Order } from "./store/types";

/**
 * Demo orders: fake paid orders made from the admin, to try packing and Chit Chats labels
 * without a real checkout. They have no email (so no customer emails go out), no Stripe
 * payment and no stock reservation, and only they can be deleted from the admin.
 */

/** Public landmark addresses, matching the places the shipping prices were quoted for. */
export const DEMO_PLACES = [
  { id: "toronto", label: "Toronto, ON", address: { line1: "290 Bremner Blvd", line2: null, city: "Toronto", state: "ON", postal_code: "M5V 3L9", country: "CA" } },
  { id: "vancouver", label: "Vancouver, BC", address: { line1: "999 Canada Pl", line2: null, city: "Vancouver", state: "BC", postal_code: "V6C 3T4", country: "CA" } },
  { id: "whitehorse", label: "Whitehorse, YT", address: { line1: "2071 2nd Ave", line2: null, city: "Whitehorse", state: "YT", postal_code: "Y1A 1B2", country: "CA" } },
  { id: "new-york", label: "New York, NY (US)", address: { line1: "350 5th Ave", line2: null, city: "New York", state: "NY", postal_code: "10118", country: "US" } },
] as const;

export type DemoPlace = (typeof DEMO_PLACES)[number]["id"];

const PREFIX = "demo_";
/** What a demo Lumi is "sold" for: the real price, or this if there isn't one. */
export const DEMO_UNIT_CENTS = confirmed(products[0]?.price)?.amount ?? 3500;
export const DEMO_NAME = "Demo order (not real)";

export const isDemoOrder = (o: Pick<Order, "stripeSessionId">) => !!o.stripeSessionId?.startsWith(PREFIX);

export function demoOrder(place: DemoPlace, id: string = crypto.randomUUID(), now: Date = new Date()): Order {
  const where = DEMO_PLACES.find((p) => p.id === place);
  if (!where) throw new Error(`Unknown demo place: ${place}`);
  const lumi = products[0]!;
  const at = now.toISOString();
  return {
    id,
    status: "paid",
    fulfilment: "preorder",
    currency: "CAD",
    subtotal: DEMO_UNIT_CENTS,
    items: [{ sku: lumi.sku, slug: lumi.slug, name: lumi.name, qty: 1, unitAmount: DEMO_UNIT_CENTS }],
    createdAt: at,
    reservationExpiresAt: at,
    paidAt: at,
    stripeSessionId: `${PREFIX}${id}`,
    customerName: DEMO_NAME,
    shipping: { name: DEMO_NAME, address: { ...where.address } },
    amountTotal: DEMO_UNIT_CENTS,
    countedSold: false,
    adminNote: "Made with the Make demo order button, to test packing and labels. Not a real customer: delete it when you're done.",
  };
}
