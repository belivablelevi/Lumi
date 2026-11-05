import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signSession } from "../../src/lib/admin-auth";

test("the demo catalogue is clearly marked", async ({ page }) => {
  await page.goto("/products/pocket-lumi");
  await expect(page.getByText("DEMO PRICE").first()).toBeVisible();
  await expect(page.getByLabel("Pre-order terms")).toContainText("Demo only");
});

test("the pill marks a demo price in full and leads to the terms", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: document.querySelector("main > section")!.getBoundingClientRect().bottom + window.scrollY + 40, behavior: "instant" }));
  const pill = page.getByRole("complementary", { name: "Pocket Lumi" });
  const tag = pill.getByText("DEMO PRICE");
  await expect(tag).toBeVisible();
  const [tagBox, linkBox] = [await tag.boundingBox(), await pill.getByRole("link").boundingBox()];
  expect(tagBox!.x + tagBox!.width).toBeLessThanOrEqual(linkBox!.x);
  await pill.getByRole("link", { name: /^Pre-order/ }).click();
  await expect(page).toHaveURL(/\/products\/pocket-lumi$/);
  await expect(page.getByLabel("Pre-order terms")).toBeVisible();
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

test("checkout opens our own checkout page and sends only identifiers, quantities and add-on choices", async ({ page }) => {
  let sent: unknown;
  await page.route("**/api/checkout", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: "Pocket Lumi doesn't have enough left for this order." } });
  });
  await page.goto("/products/pocket-lumi");
  await page.getByRole("button", { name: "Pre-order your Lumi" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Pre-order securely" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  // Errors from the server are shown, not hidden, with a way back to the cart.
  await expect(page.getByText("doesn't have enough left")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your cart" })).toBeVisible();
  expect(sent).toEqual({ lines: [{ slug: "pocket-lumi", qty: 1, variantId: "grey" }], protection: false, tip: 0 });
});

test("the checkout page with an empty cart points back to the shop", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a Lumi" })).toBeVisible();
});

test("the checkout API never takes prices from the browser", async ({ request }) => {
  for (const path of ["/api/checkout/shipping", "/api/checkout/addons"]) {
    const res = await request.post(path, { data: { sessionId: "nope", protection: true, protectionAmount: 1, tip: -5 } });
    expect(res.status(), path).toBeGreaterThanOrEqual(400);
  }
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

test("the order admin asks for a password and keeps orders behind it", async ({ page, request }) => {
  const res = await request.get("/admin", { maxRedirects: 0 });
  expect([303, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/admin/login");
  expect((await request.get("/admin/export.csv", { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get("/admin/orders/11111111-1111-4111-8111-111111111111", { maxRedirects: 0 })).status()).not.toBe(200);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  // The e2e database is unreachable, so signing in fails closed instead of skipping the rate limit.
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Reaching the fake database address takes a few seconds to fail.
  await expect(page).toHaveURL(/error=unavailable/, { timeout: 30_000 });
  await expect(page.getByText("Signing in isn't available")).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === "lumi_admin")).toBe(false);
});

// ---- Lumi Studio in Chrome (admin only) ----------------------------------------------

async function signIn(page: Page) {
  const base = test.info().project.use.baseURL!;
  await page.context().addCookies([{ name: "lumi_admin", value: signSession("e2e-admin-password"), url: base }]);
}

/** A short fingerprint of the first canvas's pixels. */
const canvasPrint = (page: Page, name: string) =>
  page.getByRole("img", { name }).first().evaluate((c) => {
    const ctx = (c as HTMLCanvasElement).getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, (c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height);
    let lit = 0, h = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 1]! > 128) { lit++; h = (h * 31 + i) >>> 0; }
    return `${lit}:${h}`;
  });

test("Lumi Studio stays behind the admin login", async ({ request }) => {
  for (const path of ["/admin/studio", "/admin/studio/print?doc=odds"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/admin/login");
  }
});

test("Lumi Studio designs faces with the firmware's face engine and makes batches", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Studio is a desktop-size tool");
  await signIn(page);
  await page.goto("/admin/studio");
  await expect(page.getByRole("heading", { name: "Lumi Studio" })).toBeVisible();
  await expect(page.getByText("Custom faces")).toBeVisible({ timeout: 15_000 });

  // A new face renders, and moving a slider changes what the screen shows.
  await page.getByLabel("Start from").selectOption("happy");
  await page.getByRole("button", { name: "New face" }).click();
  const preview = "Preview of the face my happy";
  await expect(page.getByRole("img", { name: preview })).toBeVisible();
  const before = await canvasPrint(page, preview);
  expect(Number(before.split(":")[0])).toBeGreaterThan(500);
  await page.getByLabel("Eye width").fill("12");
  await expect.poll(() => canvasPrint(page, preview)).not.toBe(before);
  await expect(page.getByRole("status").filter({ hasText: "Pack" })).toContainText("1 faces");

  // An animation using it plays through the firmware's animator.
  await page.getByRole("tab", { name: "Animations" }).click();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Key 1 face").selectOption("custom:my happy");
  const still = await canvasPrint(page, "Animation preview");
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect.poll(() => canvasPrint(page, "Playing my_anim")).not.toBe(still);

  // Personality: the expression grid shows every expression.
  await page.getByRole("tab", { name: "Personality" }).click();
  await expect(page.getByRole("img", { name: /^Mochi: / })).toHaveCount(29);

  // A batch: 20 units, no two alike.
  await page.getByRole("tab", { name: "Factory batch" }).click();
  await page.getByLabel("How many units").fill("20");
  await page.getByLabel("Batch seed").fill("e2e-batch");
  await page.getByRole("button", { name: "Generate batch" }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(20);
  const names = await rows.locator("td:nth-child(2)").allTextContents();
  expect(new Set(names).size).toBe(20);
  await expect(rows.first().locator("td").first()).toHaveText("LUMI-000001");

  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);

  // Work in progress survives a reload.
  await page.reload();
  await page.getByRole("tab", { name: "Factory batch" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
});

test("Lumi Studio lays out birth certificates and odds cards for printing", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Studio is a desktop-size tool");
  await signIn(page);
  await page.goto("/admin/studio/print?doc=odds");
  await expect(page.locator("svg.studio-sheet")).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText("Meet your Lumi")).toBeVisible();
  await expect(page.locator("header").first()).toBeHidden();

  await page.goto("/admin/studio/print?doc=odds-letter");
  await expect(page.locator("svg.studio-sheet")).toHaveCount(2, { timeout: 20_000 });

  // Ten units: two sheets, each a page of fronts and a page of backs.
  const rows = Array.from({ length: 10 }, (_, i) => ({
    serial: `LUMI-${String(i + 1).padStart(6, "0")}`, name: `Unit${i}`, rarity: "rare", look: "12345", eye_shape: "round", eye_size: "medium",
    spacing: "normal", height: "middle", highlight: "dot", accent: "none", temperament: "shy", genes: "1 2 2 1 2 0 2", mac: "", provisioned_at: "",
  }));
  await page.evaluate((r) => localStorage.setItem("lumi-studio-print", JSON.stringify({ doc: "cards", rows: r })), rows);
  await page.goto("/admin/studio/print?doc=cards");
  await expect(page.locator("svg.studio-sheet")).toHaveCount(4, { timeout: 20_000 });
  await expect(page.getByText("Hi, I'm Unit0!")).toBeVisible();
});
