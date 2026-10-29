import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/shop", "/pocket", "/desk", "/products/pocket-lumi", "/launches", "/our-world", "/faq", "/contact", "/shipping-returns", "/privacy", "/terms", "/cart"];

test("every page loads with no errors, no horizontal scroll and no accessibility violations", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("unknown pages get a friendly 404", async ({ page }) => {
  const res = await page.goto("/no-such-lumi");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page wandered off" })).toBeVisible();
  expect((await page.goto("/products/no-such-lumi"))?.status()).toBe(404);
});

test("the shipped catalogue sells nothing yet and says so", async ({ page }) => {
  await page.goto("/products/pocket-lumi");
  await expect(page.getByText("Price to be announced").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /pre-order|add to cart/i })).toHaveCount(0);
  await expect(page.getByText("Launch emails are coming soon").first()).toBeVisible();
  await expect(page.getByText("To be confirmed").first()).toBeVisible();
  // No countdown without a confirmed date.
  await page.goto("/");
  await expect(page.getByText("Date to be announced")).toBeVisible();
  await expect(page.getByText("days", { exact: true })).toHaveCount(0);
});

test("the screens play real firmware frames", async ({ page }) => {
  await page.goto("/products/pocket-lumi");
  const cycler = page.getByRole("img", { name: /happy expression/ });
  await cycler.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const lit = await cycler.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });
  expect(lit).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Next expression" }).click();
  await expect(page.getByRole("img", { name: /joy expression/ })).toBeVisible();
});

test("the personality showcase switches mood and unit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sleepy", exact: true }).click();
  await page.getByRole("button", { name: /^Ni/ }).click();
  await expect(page.getByText("Ni is sleepy")).toBeVisible();
  await expect(page.getByRole("img", { name: /Ni: sleepy \(yawn animation\)/ })).toBeVisible();
});

test("shop filters and counts come from the catalogue", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("2 Lumis")).toBeVisible();
  await page.getByRole("button", { name: "Desk Lumis" }).click();
  await expect(page.getByText("1 Lumi", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desk Lumi" })).toBeVisible();
  // Every product is coming soon, so there's no availability filter to offer.
  await expect(page.getByRole("button", { name: "Pre-order" })).toHaveCount(0);
});

test("the announcement can be dismissed and stays dismissed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dismiss announcement" }).click();
  await expect(page.getByText("Meet the next generation of little companions.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Meet the next generation of little companions.")).toHaveCount(0);
});

test("navigation works on every screen size", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Launches" }).click();
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Launches" }).click();
  }
  await expect(page).toHaveURL(/\/launches$/);
  await expect(page.getByRole("heading", { name: "What's coming next" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("holds still frames instead of animating", async ({ page }) => {
    await page.goto("/");
    const canvas = page.getByRole("img", { name: /Yotos, idling/ }).first();
    await page.waitForTimeout(400);
    const a = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page.waitForTimeout(1500);
    const b = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    expect(a).toBe(b);
  });
});

test.describe("Boop Pong", () => {
  test("plays itself, lets you take over, and goes back to the demo after 10 s", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    const game = page.getByRole("application", { name: /Boop Pong/ });
    await game.scrollIntoViewIfNeeded();
    await page.clock.runFor(1500);
    await expect(game.getByText("Demo", { exact: true })).toBeVisible();
    // Two named, different Lumis.
    const names = await game.locator("[data-persona-name]").allInnerTexts();
    expect(names.filter((n) => n && n !== "…")).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    // The screens draw the game.
    await page.clock.runFor(3000);
    const lit = await game.locator("canvas").first().evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    });
    expect(lit).toBeGreaterThan(200);

    await game.focus();
    await page.keyboard.down("ArrowRight");
    await page.clock.runFor(400);
    await page.keyboard.up("ArrowRight");
    await expect(game.getByText("You're playing")).toBeVisible();
    await page.clock.runFor(5000);
    await expect(game.getByText("You're playing")).toBeVisible();
    await page.clock.runFor(6000);
    await expect(game.getByText("Demo", { exact: true })).toBeVisible();
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("waits for a tap instead of playing itself", async ({ page }) => {
      await page.goto("/");
      const game = page.getByRole("application", { name: /Boop Pong/ });
      await game.scrollIntoViewIfNeeded();
      await expect(game.getByText("Paused")).toBeVisible();
      await game.getByRole("button", { name: "Play the demo" }).click();
      await expect(game.getByText(/Demo|You're playing/)).toBeVisible();
    });
  });
});
