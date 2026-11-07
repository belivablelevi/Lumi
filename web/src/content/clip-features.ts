// Default feature lines for the Clip maker's spin videos (/admin/clips). Each line can play one
// of the personality's animations while it's on screen. Keep them true to products.ts.

export interface ClipFeature {
  text: string;
  /** A key of the persona's animations (see public/lumi/manifest.json), or none for its idle loop. */
  anim?: string;
}

export const CLIP_FEATURES: ClipFeature[] = [
  { text: "Pat it and it giggles", anim: "pat_giggle" },
  { text: "Pick it up and it says hi", anim: "pickup_hello" },
  { text: "Every Lumi gets its own random personality", anim: "sparkle" },
  { text: "Play Tilt Pong with a friend", anim: "pong_win_match" },
  { text: "No app. No subscription.", anim: "dance" },
];
