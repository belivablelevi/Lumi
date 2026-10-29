import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

export const alt = `${brand.name}: ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Bricolage Grotesque ExtraBold from Google Fonts, or the default font if that fails. */
async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800")).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const font = await displayFont();
  const render = readFileSync(join(process.cwd(), "public", "renders", "three-quarter.png")).toString("base64");
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "linear-gradient(135deg, #f0e7fa, #fbe8e3)", padding: 70, alignItems: "center", fontFamily: "Bricolage" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#30263a" }}>{brand.name}</div>
          <div style={{ fontSize: 76, fontWeight: 800, color: "#30263a", lineHeight: 1.02, marginTop: 28, letterSpacing: -2 }}>A little personality.</div>
          <div style={{ fontSize: 76, fontWeight: 800, color: "#774791", lineHeight: 1.02, letterSpacing: -2 }}>A lot of feeling.</div>
          <div style={{ fontSize: 28, color: "#4a3f55", marginTop: 30 }}>{brand.tagline}</div>
        </div>
        <img src={`data:image/png;base64,${render}`} width={470} height={470} alt="" />
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] : undefined },
  );
}
