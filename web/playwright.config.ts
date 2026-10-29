import { defineConfig, devices } from "@playwright/test";

// Two runs: E2E_MODE=site (the catalogue as shipped) and E2E_MODE=demo (the demo pre-order
// catalogue, with checkout keys set to fakes so the checkout button is live; the
// checkout API call itself is intercepted in the test). Each needs its own build:
//   NEXT_DIST_DIR=.next-e2e-site next build
//   LUMI_DEMO_CATALOGUE=1 NEXT_DIST_DIR=.next-e2e-demo next build
const MODE = process.env.E2E_MODE === "demo" ? "demo" : "site";
const PORT = MODE === "demo" ? 3201 : 3200;
const env: Record<string, string> = { NEXT_DIST_DIR: `.next-e2e-${MODE}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` };
if (MODE === "demo") {
  Object.assign(env, {
    LUMI_DEMO_CATALOGUE: "1",
    STRIPE_SECRET_KEY: "sk_test_e2e_fake",
    STRIPE_WEBHOOK_SECRET: "whsec_e2e_fake",
    SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-fake",
  });
}

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: MODE === "demo" ? "demo.spec.ts" : "site.spec.ts",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
