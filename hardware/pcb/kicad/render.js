// Turn the SVG drawings in <dir> into PNGs (for the guide and quick looks).
// Usage: node render.js renders
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SIZES = {
  "schematic.svg": [1680, 1188],
  "board-back.svg": [900, 960],
  "board-front.svg": [900, 960],
};

(async () => {
  const dir = path.resolve(process.argv[2] || "renders");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [svg, [w, h]] of Object.entries(SIZES)) {
    const src = path.join(dir, svg);
    if (!fs.existsSync(src)) continue;
    const html = path.join(dir, ".render.html");
    fs.writeFileSync(html, `<body style="margin:0;background:#fff"><img src="${svg}" ` +
      `style="width:${w}px;height:${h}px;object-fit:contain"></body>`);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("file://" + html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: src.replace(/\.svg$/, ".png") });
    fs.unlinkSync(html);
  }
  await browser.close();
})();
