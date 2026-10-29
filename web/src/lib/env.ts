import { brand } from "@/config/brand";
import { confirmed } from "./placeholder";

/** Server-side configuration. Never import from client components. */
const get = (name: string) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

export const env = {
  siteUrl: brand.siteUrl,
  stripeSecretKey: get("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: get("STRIPE_WEBHOOK_SECRET"),
  stripeTax: get("STRIPE_AUTOMATIC_TAX") === "1",
  shippingRateIds: (get("STRIPE_SHIPPING_RATE_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  shippingCountries: (get("STRIPE_SHIPPING_COUNTRIES") ?? "CA").split(",").map((s) => s.trim()).filter(Boolean),
  supabaseUrl: get("SUPABASE_URL"),
  supabaseServiceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: get("RESEND_API_KEY"),
  emailFrom: get("EMAIL_FROM"),
  hashSalt: get("SIGNUP_HASH_SALT") ?? "lumi-dev-salt",
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
