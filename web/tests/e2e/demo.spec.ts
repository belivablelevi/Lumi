import { expect, test } from "@playwright/test";

test("the demo catalogue is clearly marked", async ({ page }) => {
  await page.goto("/products/pocket-lumi");
  await expect(page.getByText("DEMO PRICE").first()).toBeVisible();
  await expect(page.getByLabel("Pre-order terms")).toContainText("Demo only");
});

test("add to cart, change quantity, survive a reload, remove", async ({ page }) => {
  await page.goto("/products/pocket-lumi");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Pre-order your Lumi" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Your cart/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("$98.00 CAD").first()).toBeVisible();
  await expect(drawer.getByText("This is a pre-order")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cart, 2 items" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Cart, 2 items" })).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Increase quantity of Pocket Lumi" }).click();
  await expect(page.getByText("$147.00 CAD").first()).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity of Pocket Lumi" }).click();
  await expect(page.getByRole("button", { name: "Increase quantity of Pocket Lumi" })).toBeDisabled(); // max 4
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("checkout sends only identifiers and quantities, then hands off to Stripe", async ({ page }) => {
  let sent: unknown;
  await page.route("**/api/checkout", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { url: "/checkout/cancel?order=e2e" } });
  });
  await page.goto("/products/pocket-lumi");
  await page.getByRole("button", { name: "Pre-order your Lumi" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Pre-order securely" }).click();
  await expect(page).toHaveURL(/\/checkout\/cancel/);
  expect(sent).toEqual({ lines: [{ slug: "pocket-lumi", qty: 1 }] });
  await expect(page.getByText("No payment was taken")).toBeVisible();
});

test("checkout errors are shown, not hidden", async ({ page }) => {
  await page.route("**/api/checkout", (route) => route.fulfill({ status: 409, json: { error: "Pocket Lumi doesn't have enough left for this order." } }));
  await page.goto("/products/pocket-lumi");
  await page.getByRole("button", { name: "Pre-order your Lumi" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Pre-order securely" }).click();
  await expect(page.getByText("doesn't have enough left")).toBeVisible();
});

test("the real checkout API refuses bad carts without trusting the browser", async ({ request }) => {
  expect((await request.post("/api/checkout", { data: { lines: [] } })).status()).toBe(400);
  expect((await request.post("/api/checkout", { data: { lines: [{ slug: "desk-lumi", qty: 1 }] } })).status()).toBe(409);
  // The webhook refuses unsigned calls.
  expect((await request.post("/api/stripe/webhook", { data: "{}" })).status()).toBe(400);
});

test("the success page never claims payment it hasn't verified", async ({ page }) => {
  await page.route("**/api/orders/status**", (route) => route.fulfill({ json: { status: "pending", fulfilment: "preorder", items: [] } }));
  await page.goto("/checkout/success?order=00000000-0000-4000-8000-000000000001&session_id=cs_test_x");
  await expect(page.getByText("Confirming your payment…")).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByText("Confirming your payment…")).toBeVisible();
  await page.unroute("**/api/orders/status**");
  await page.route("**/api/orders/status**", (route) => route.fulfill({ json: { status: "paid", fulfilment: "preorder", items: [{ name: "Pocket Lumi", qty: 1 }] } }));
  await expect(page.getByText("Your pre-order is confirmed")).toBeVisible({ timeout: 10_000 });
});
