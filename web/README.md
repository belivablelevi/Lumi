# Lumi web store

The Lumi website: a Next.js storefront for pre-ordering Lumis, with the
real firmware's animations playing on every screen.

```sh
cd web
npm install
npm run dev            # http://localhost:3000
```

It runs with no accounts set up. In that state it says plainly that
checkout and launch emails aren't set up yet, and it never fakes an order,
a payment or a signup.

## Put it online (demo)

This gives you a real link where the Pocket Lumi shows a clearly marked
**DEMO PRICE**, so you can try the cart and the pre-order button. No
payments are possible: the checkout button says checkout isn't set up.

1. Sign up at [vercel.com](https://vercel.com) with GitHub (the free Hobby plan).
2. **Add New → Project**, pick this repository, and tap **Import**.
3. **Root Directory**: Edit, then choose `web`. Leave the framework as Next.js.
4. **Environment Variables**: add `LUMI_DEMO_CATALOGUE` = `1` and `LUMI_DEMO_ON_PRODUCTION` = `1`, then tap **Deploy**.
5. Open the link Vercel shows (something like `lumi-xxxx.vercel.app`).

If you already created the project, add the two variables under **Settings → Environment Variables**,
set **Settings → Build and Deployment → Root Directory** to `web`, and redeploy from **Deployments**.

Before you sell for real, delete both variables. The demo also switches itself off as soon as a
live Stripe key (`sk_live_…`) is set, so a demo price can never be charged. With no
`NEXT_PUBLIC_SITE_URL` set, links in social previews and the sitemap use the deployment's own
Vercel address.

## What's real and what's a placeholder

| | |
|---|---|
| **Animations** | Real. `public/lumi/` holds frames rendered by the firmware's own code (`python3 tools/studio/export_web_assets.py`). The site draws them on a canvas, pixel for pixel. |
| **Product images** | Renders of the actual case STLs (`node scripts/render-case.mjs`), labelled as renders. Add photos to `public/` and list them in `src/content/products.ts` once units exist. |
| **Specs** | The open-source prototype design, labelled "prototype specification". |
| **Price, pre-order terms, shipping, battery life, materials, warranty, contact email, business address** | Placeholders (`tbc(...)` in `src/content/products.ts` and `src/config/brand.ts`). Pages show "To be confirmed". The catalogue refuses to sell a product without a confirmed price, and refuses pre-orders without confirmed terms, so the build fails instead of showing invented facts. |
| **Policy pages** | Outlines with the headings Canadian law expects (PIPEDA, CASL), marked as placeholders. |
| **Launch dates** | None set. The countdown only appears once `launchAt` and `timeZone` are confirmed in `src/content/launches.ts`. |

## Where things live

| To change… | Edit |
|---|---|
| Name, tagline, announcement bar, nav, footer, socials, legal details | `src/config/brand.ts` |
| Logo | `src/components/brand/Mark.tsx`, `public/icon.svg` |
| Colours, type, radii, shadows | the `@theme` block in `src/app/globals.css` |
| Products, statuses, prices, specs, FAQ | `src/content/products.ts` |
| Launches | `src/content/launches.ts` |
| Example personalities and the mood showcase | `src/content/personas.ts` |
| Motion timings | `src/lib/motion.ts` |

### Product states

The statuses are `draft`, `coming_soon`, `preorder`, `available`, `sold_out` and `archived`. The allowed changes between them are in `src/lib/product-state.ts`. The status decides the button: Notify me, Pre-order your Lumi, Add to cart, or nothing.

To open pre-orders:
1. Set `price`, `preorder` (dispatch window, payment timing, cancellation, delays) and `shipping` to real values.
2. Set `status: "preorder"`.
3. Add a `capacity` row in Supabase: `insert into capacity (sku, total) values ('LUMI-POCKET-01', 500);`.
4. Redeploy.

Pre-orders and in-stock items check out separately (`allowMixedCarts` in `brand.ts`).

## Setting up the services

Copy `.env.example` to `.env.local` for local work. On Vercel, put the same values in **Project → Settings → Environment Variables**. Secret keys are only read on the server.

1. **Supabase.** Create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor. Copy `SUPABASE_URL` and the **service role** key. Every table has row-level security with no public policies, so only the server can read or write.
2. **Stripe.** Use test keys first.
   - Set `STRIPE_SECRET_KEY`.
   - Add a webhook endpoint at `https://<your-domain>/api/stripe/webhook` for these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   - Optional: `STRIPE_AUTOMATIC_TAX=1` (after setting up Stripe Tax for your GST/HST/PST registrations), `STRIPE_SHIPPING_RATE_IDS` and `STRIPE_SHIPPING_COUNTRIES`.
   - Test locally with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. **Resend.** Verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Lumi <hello@yourdomain>`). Also fill in `legal.businessName` and `legal.mailingAddress` in `brand.ts`: CASL requires a mailing address in every marketing email, so signups stay closed until it's set.
4. Set `SIGNUP_HASH_SALT` to a long random string and `NEXT_PUBLIC_SITE_URL` to your domain.
5. **Vercel.** Import the repo and set **Root Directory** to `web`. Pages are prerendered, so redeploy after changing environment variables.

### How an order works

1. The browser sends only product slugs, options and quantities to `/api/checkout`.
2. The server checks them against its own catalogue: status, quantity limits, price in CAD.
3. In one database transaction it reserves pre-order capacity and creates a pending order (`create_order`).
4. It opens a Stripe Checkout session that expires when the reservation does.
5. Stripe's webhook marks the order paid (`mark_order_paid`, which runs once per order) and the confirmation email is sent. If an amount doesn't match, the order goes to `review` instead. Expired or failed checkouts give their capacity back.
6. The success page shows "Confirming your payment…" until the database says the order is paid. It never trusts the redirect alone.

Launch signups use double opt-in. Each one stores the exact consent text and version. Confirm and unsubscribe links carry random tokens, and only their hashes are stored. Signups are rate-limited by a hashed IP, and a honeypot plus a minimum fill time catch bots. Sending launch newsletters isn't built in: use the confirmed rows in `launch_signups`, or Resend's broadcasts, and always include the unsubscribe link.

## Tests

```sh
npm run lint && npm run typecheck
npm test                        # unit tests, including the SQL functions in PGlite and signed Stripe webhooks
NEXT_DIST_DIR=.next-e2e-site npx next build
E2E_MODE=site npx playwright test    # every page, desktop + mobile, axe accessibility scan
LUMI_DEMO_CATALOGUE=1 STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x \
  SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x NEXT_DIST_DIR=.next-e2e-demo npx next build
E2E_MODE=demo npx playwright test    # cart, checkout hand-off, success page
```

`LUMI_DEMO_CATALOGUE=1` opens the Pocket Lumi for pre-order at a price marked **DEMO PRICE**, so you can try the whole flow with Stripe test keys. On Vercel's production deployment it also needs `LUMI_DEMO_ON_PRODUCTION=1`, and it's always refused with a live Stripe key.

## Not done yet

- Real product photos and lifestyle images.
- Live Stripe, Supabase and Resend: the code is tested against fakes and signed test events, but hasn't run against real accounts.
- An admin view for orders: use the Supabase table editor for now.
