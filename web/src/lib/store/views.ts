import type { Order } from "./types";

/** Paid (or paid but flagged for review) and not shipped yet. */
export const isToShip = (o: Order) => (o.status === "paid" || o.status === "review") && o.fulfilmentStatus !== "shipped";
