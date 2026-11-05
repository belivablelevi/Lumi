/** Frames as images: for the print pages (cards) and anywhere a canvas is awkward. */

export const OLED_CYAN = "#3cf0ff";
export const OLED_OFF = "#061014";

export const pixelOn = (frame: Uint8Array, x: number, y: number) => ((frame[(y >> 3) * 128 + x] ?? 0) & (1 << (y & 7))) !== 0;

/** A 128 x 64 frame as a PNG data URL, each pixel `scale` x `scale`. */
export function frameDataUrl(frame: Uint8Array, scale = 4, on = OLED_CYAN, off = OLED_OFF): string {
  const canvas = document.createElement("canvas");
  canvas.width = 128 * scale;
  canvas.height = 64 * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = off;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = on;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (pixelOn(frame, x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
  return canvas.toDataURL("image/png");
}

/** Bounding box [x0, y0, x1, y1] (in OLED pixels) of the lit pixels with x in [fromX, toX). */
export function litBounds(frame: Uint8Array, fromX: number, toX: number): [number, number, number, number] | null {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let y = 0; y < 64; y++) {
    for (let x = fromX; x < toX; x++) {
      if (!pixelOn(frame, x, y)) continue;
      l = Math.min(l, x);
      t = Math.min(t, y);
      r = Math.max(r, x + 1);
      b = Math.max(b, y + 1);
    }
  }
  return l === Infinity ? null : [l, t, r, b];
}
