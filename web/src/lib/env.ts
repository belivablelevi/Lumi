import { brand } from "@/config/brand";
import { confirmed } from "./placeholder";

/** Server-side configuration. Never import from client components. */
const get = (name: string) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};
const dims = (v: string | undefined): [number, number, number] | null => {
  const p = (v ?? "").split(/[x×,]/i).map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n) && n > 0) ? [p[0]!, p[1]!, p[2]!] : null;
};

export const env = {
  siteUrl: brand.siteUrl,
  stripeSecretKey: get("STRIPE_SECRET_KEY"),
  // Not secret: the checkout page hands it to Stripe.js. The Vercel Stripe integration uses the NEXT_PUBLIC_ name.
  stripePublishableKey: get("STRIPE_PUBLISHABLE_KEY") ?? get("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
  stripeWebhookSecret: get("STRIPE_WEBHOOK_SECRET"),
  stripeTax: get("STRIPE_AUTOMATIC_TAX") === "1",
  shippingCountries: (get("STRIPE_SHIPPING_COUNTRIES") ?? "CA").split(",").map((s) => s.trim()).filter(Boolean),
  // The Vercel Supabase integration sets both names; either works.
  supabaseUrl: get("SUPABASE_URL") ?? get("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: get("RESEND_API_KEY"),
  emailFrom: get("EMAIL_FROM"),
  hashSalt: get("SIGNUP_HASH_SALT") ?? "lumi-dev-salt",
  // The order admin (/admin) is off unless this is set. Use a long random password.
  adminPassword: get("ADMIN_PASSWORD"),
  // Live shipping prices from Canada Post's Rating API. Without these, checkout uses the region table in lib/shipping.ts.
  canadaPost:
    get("CANADA_POST_USERNAME") && get("CANADA_POST_PASSWORD") && get("CANADA_POST_CUSTOMER_NUMBER")
      ? {
          username: get("CANADA_POST_USERNAME")!,
          password: get("CANADA_POST_PASSWORD")!,
          customerNumber: get("CANADA_POST_CUSTOMER_NUMBER")!,
          sandbox: get("CANADA_POST_SANDBOX") === "1",
        }
      : null,
  // The packed parcel: box + padding, plus each Lumi. Weigh a real one and adjust.
  parcel: {
    boxKg: num(get("SHIPPING_BOX_KG"), 0.08),
    unitKg: num(get("SHIPPING_UNIT_KG"), 0.03),
    cm: dims(get("SHIPPING_BOX_CM")) ?? ([10, 10, 6] as [number, number, number]),
    handlingCents: Math.round(num(get("SHIPPING_HANDLING_CENTS"), 0)),
    fromPostalCode: get("SHIPPING_FROM_POSTAL_CODE") ?? "K1R6A1",
  },
  demoCatalogue: get("LUMI_DEMO_CATALOGUE") === "1",
  demoOnProduction: get("LUMI_DEMO_ON_PRODUCTION") === "1",
  vercelEnv: get("VERCEL_ENV"),
};

/**
 * Whether to show the demo catalogue (a fake price, clearly marked). Production
 * needs a second, explicit opt-in, and a live Stripe key always turns it off,
 * so a demo price can never be charged for real.
 */
export function demoAllowed(o: { demoCatalogue: boolean; demoOnProduction: boolean; vercelEnv?: string; stripeSecretKey?: string }) {
  if (!o.demoCatalogue) return false;
  if (o.stripeSecretKey && /^(sk|rk)_live_/.test(o.stripeSecretKey)) return false;
  return o.vercelEnv !== "production" || o.demoOnProduction;
}

export const demoMode = () => demoAllowed(env);

export interface ServiceStatus {
  checkout: boolean;
  signup: boolean;
  missing: { checkout: string[]; signup: string[] };
}

export function serviceStatus(): ServiceStatus {
  const checkout = [
    !env.stripeSecretKey && "STRIPE_SECRET_KEY",
    !env.stripePublishableKey && "STRIPE_PUBLISHABLE_KEY",
    !env.stripeWebhookSecret && "STRIPE_WEBHOOK_SECRET",
    !env.supabaseUrl && "SUPABASE_URL",
    !env.supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];
  const signup = [
    !env.supabaseUrl && "SUPABASE_URL",
    !env.supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !env.resendApiKey && "RESEND_API_KEY",
    !env.emailFrom && "EMAIL_FROM",
    // CASL: every marketing email must identify the sender with a mailing address.
    !confirmed(brand.legal.mailingAddress) && "brand.legal.mailingAddress (src/config/brand.ts)",
  ].filter(Boolean) as string[];
  return { checkout: checkout.length === 0, signup: signup.length === 0, missing: { checkout, signup } };
}
