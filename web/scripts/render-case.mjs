// Renders product images of the real Lumi case design into public/renders,
// and writes src/content/renders.json (image list + where the screen sits in front shots).
//
//   node scripts/render-case.mjs
//
// Uses the STLs in hardware/enclosure/stl and frames exported by
// tools/studio/export_web_assets.py. These are renders of the CAD model, not photos.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..");
const OUT = join(WEB, "public", "renders");
mkdirSync(OUT, { recursive: true });

function frames(path) {
  const raw = inflateSync(readFileSync(path));
  const out = [];
  let prev = new Uint8Array(1024);
  for (let i = 0; i + 1024 <= raw.length; i += 1024) {
    const f = new Uint8Array(1024);
    for (let j = 0; j < 1024; j++) f[j] = raw[i + j] ^ prev[j];
    out.push(f);
    prev = f;
  }
  return out;
}
const manifest = JSON.parse(readFileSync(join(WEB, "public", "lumi", "manifest.json"), "utf8"));
const still = (persona, expr) =>
  Array.from(frames(join(WEB, "public", "lumi", persona, "expressions.lumi"))[manifest.expressions.indexOf(expr)]);

const types = { ".html": "text/html", ".js": "text/javascript", ".stl": "model/stl" };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const path = url.startsWith("/stl/") ? join(REPO, "hardware", "enclosure", "stl", url.slice(5))
    : url === "/" ? join(WEB, "scripts", "render-case.html") : join(WEB, url);
  try {
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const LAVENDER = "#c99be0", MINT = "#8fd6b6", PEACH = "#ffb592";
const shots = [
  // Front-on: the screen is left dark so the site can play real animations over it.
  { file: "front-lavender.png", alt: "Pocket Lumi, front", color: LAVENDER, width: 1400, height: 1400,
    fov: 16, dist: 165, lookY: 3, groundY: -21, shadow: 0, live: true },
  { file: "front-mint.png", alt: "Pocket Lumi in a mint shell, front", color: MINT, width: 1400, height: 1400,
    fov: 16, dist: 165, lookY: 3, groundY: -21, shadow: 0, live: true },
  { file: "front-peach.png", alt: "Pocket Lumi in a peach shell, front", color: PEACH, width: 1400, height: 1400,
    fov: 16, dist: 165, lookY: 3, groundY: -21, shadow: 0, live: true },
  { file: "three-quarter.png", alt: "Pocket Lumi from the side, showing its face", color: LAVENDER,
    width: 1400, height: 1400, yaw: -0.62, pitch: 0.12, fov: 16, dist: 230, lookY: 3, frame: still("yotos", "happy"),
    groundY: -21, groundTilt: -Math.PI / 2 },
  { file: "usb-side.png", alt: "Pocket Lumi from the right, showing the USB-C port", color: LAVENDER,
    width: 1400, height: 1400, yaw: 1.2, pitch: 0.1, fov: 16, dist: 230, lookY: 3, frame: still("yotos", "neutral"),
    groundY: -21, groundTilt: -Math.PI / 2 },
  { file: "on-keyring.png", alt: "Pocket Lumi on a keyring", color: MINT, width: 1400, height: 1600,
    yaw: -0.35, pitch: 0.05, roll: 0.08, fov: 18, dist: 260, lookY: 10, ringOn: true, frame: still("ni", "sleepy"),
    groundY: -21, groundTilt: -Math.PI / 2 },
  { file: "trio.png", alt: "", color: PEACH, width: 1400, height: 1400, yaw: 0.5, pitch: 0.12, fov: 16, dist: 230,
    lookY: 3, frame: still("katos", "love"), groundY: -21, groundTilt: -Math.PI / 2 },
];

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error(m.text()));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const out = [];
for (const s of shots) {
  const { live, file, alt, ...opts } = s;
  const r = await page.evaluate((o) => window.renderShot(o), opts);
  writeFileSync(join(OUT, file), Buffer.from(r.dataUrl.split(",")[1], "base64"));
  const xs = r.screen.map((c) => c[0]), ys = r.screen.map((c) => c[1]);
  out.push({
    src: `/renders/${file}`, alt, width: s.width, height: s.height, color: s.color,
    ...(live ? { screen: { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys) } } : {}),
  });
  console.log("rendered", file);
}
await browser.close();
server.close();
writeFileSync(join(WEB, "src", "content", "renders.json"), JSON.stringify(out, null, 2) + "\n");
