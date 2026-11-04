import { z } from "zod";
import type { Addons } from "./store/types";

// Checkout extras. Prices are set here, on the server; the browser only says
// whether it wants protection and how big a tip.

/** Shipping protection: one flat fee per order, in cents (CAD). */
export const PROTECTION_CENTS = 398;
export const PROTECTION_LABEL = "Shipping protection";

/** The tip buttons, in cents. "Custom" allows any whole-dollar or cents amount up to TIP_MAX_CENTS. */
export const TIP_PRESETS = [200, 500, 1000] as const;
export const TIP_MAX_CENTS = 10000;
export const TIP_LABEL = "Tip";

export const addonsRequest = z.object({
  protection: z.boolean().default(false),
  tip: z.number().int().min(0).max(TIP_MAX_CENTS).default(0),
});
export type AddonsRequest = z.infer<typeof addonsRequest>;

export const toAddons = (r: AddonsRequest): Addons => ({
  tipAmount: r.tip,
  protectionAmount: r.protection ? PROTECTION_CENTS : 0,
});

export const addonsTotal = (o: { tipAmount?: number; protectionAmount?: number }) => (o.tipAmount ?? 0) + (o.protectionAmount ?? 0);
