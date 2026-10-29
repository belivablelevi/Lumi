import type { GalleryImage } from "@/content/products";
import renders from "@/content/renders.json";

type Render = (typeof renders)[number] & { screen?: GalleryImage["screen"] };

export function renderImage(file: string): GalleryImage {
  const r = (renders as Render[]).find((x) => x.src.endsWith(file));
  if (!r) throw new Error(`missing render ${file}`);
  return { src: r.src, alt: r.alt, width: r.width, height: r.height, kind: "render", screen: r.screen };
}
