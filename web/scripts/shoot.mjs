// Full-page screenshots for design review: node scripts/shoot.mjs http://localhost:3100 / /shop ...
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base, ...paths] = process.argv.slice(2);
mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
  for (const p of paths.length ? paths : ["/"]) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    // Scroll through so in-view animations run, then settle.
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 500) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) console.error(`${name} ${p}: horizontal overflow ${overflow}px`);
    const file = `screenshots/${name}${p === "/" ? "-home" : p.replaceAll("/", "-")}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await page.close();
}
await browser.close();
