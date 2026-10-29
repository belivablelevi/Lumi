import type { Money } from "@/lib/money";
import { tbc, type Maybe } from "@/lib/placeholder";
import type { ProductStatus } from "@/lib/product-state";
import { renderImage } from "@/lib/renders";

export type Category = "pocket" | "desk";

export interface GalleryImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  kind: "render" | "photo";
  caption?: string;
  /** Where the OLED's active area sits in a front-on render (fractions of the image). */
  screen?: { left: number; top: number; width: number; height: number };
}

export interface Variant {
  id: string;
  name: string;
  swatch: string;
  /** Index into the product's images to show when this variant is picked. */
  image?: number;
}

export interface PreorderTerms {
  dispatchWindow: string;
  paymentTiming: string;
  cancellation: string;
  delays: string;
}

export interface Spec {
  label: string;
  value: Maybe<string>;
}

export interface Product {
  id: string;
  sku: string;
  slug: string;
  name: string;
  category: Category;
  status: ProductStatus;
  tagline: string;
  personality: string;
  description: string[];
  price: Maybe<Money>;
  /** Only variants the business actually sells. Concept colours live in `images`. */
  variants: Variant[];
  images: GalleryImage[];
  /** Example personas (from public/lumi/manifest.json) shown with this product. */
  personas: string[];
  specs: Spec[];
  specsNote?: string;
  included: Maybe<string[]>;
  preorder?: Maybe<PreorderTerms>;
  shipping: Maybe<string>;
  maxPerOrder: number;
  launchId?: string;
  faq: { q: string; a: Maybe<string> }[];
  /** Only for the demo catalogue: shown as a ribbon on every price. */
  demo?: boolean;
}

const render = (file: string, caption?: string): GalleryImage => ({ ...renderImage(file), caption });

const CONCEPT = "Render of the prototype design. Shell colours aren't final.";

export const products: Product[] = [
  {
    id: "pocket-lumi",
    sku: "LUMI-POCKET-01",
    slug: "pocket-lumi",
    name: "Pocket Lumi",
    category: "pocket",
    status: "coming_soon",
    tagline: "A tiny face for your keys, with a personality all its own.",
    personality: "Feels every pat and shake, and no two are quite alike.",
    description: [
      "Pocket Lumi is a keychain companion with a glowing 0.96-inch screen for a face. It notices when you pat it, shake it, tilt it or pick it up, and it answers with one of 64 little animations.",
      "Every unit is made with its own look and temperament: the shape of its eyes, the glint in them, a little accent, and whether it's cheerful, sleepy, shy, grumpy or hyper. You meet yours when it arrives.",
    ],
    price: tbc("Retail price in CAD"),
    variants: [],
    images: [
      render("front-lavender.png", CONCEPT),
      render("three-quarter.png", CONCEPT),
      render("on-keyring.png", CONCEPT),
      render("usb-side.png", CONCEPT),
      render("front-mint.png", CONCEPT),
      render("front-peach.png", CONCEPT),
    ],
    personas: ["yotos", "ni", "katos", "mimox"],
    specsNote:
      "Prototype specification from the open-source design. It hasn't been tested on production hardware yet and may change.",
    specs: [
      { label: "Screen", value: '0.96" OLED, 128 × 64 pixels, cyan' },
      { label: "Motion sensing", value: "6-axis motion sensor: pats, double pats, shakes, tilts, drops, pick-up and put-down" },
      { label: "Brain", value: "ESP32-C3" },
      { label: "Expressions", value: "29 expressions and 64 animations, with blinking and breathing on top" },
      { label: "Play", value: "Boop Pong: two-player Pong between two Lumis, over the air" },
      { label: "Sleep", value: "Sleeps when left alone and wakes when picked up" },
      { label: "Updates", value: "New animations over Wi-Fi" },
      { label: "Charging", value: "USB-C" },
      { label: "Battery", value: tbc("Cell capacity and real-world battery life") },
      { label: "Size", value: "Case design: 35 × 37 × 19.5 mm, plus the keyring loop" },
      { label: "Materials", value: tbc("Production shell material and finish") },
      { label: "Warranty", value: tbc("Warranty terms") },
    ],
    included: tbc("What's in the box"),
    preorder: tbc("Pre-order terms: dispatch window, payment timing, cancellation and delays"),
    shipping: tbc("Shipping regions, rates and times"),
    maxPerOrder: 4,
    launchId: "pocket-first-run",
    faq: [
      {
        q: "Can I choose my Lumi's personality?",
        a: "Each unit's look and temperament are set when it's made. You meet yours when it arrives.",
      },
      {
        q: "What does it do when I'm not playing with it?",
        a: "It idles: looks around, hums, yawns and daydreams. After a while on its own it falls asleep, and it wakes when you pick it up.",
      },
      {
        q: "How long does the battery last?",
        a: tbc("Battery life, measured on production units"),
      },
      {
        q: "Does it need an app or a phone?",
        a: "No. Everything happens by touching and moving it. A phone is only used, optionally, to install new animations over Wi-Fi.",
      },
      { q: "When will it ship?", a: tbc("Dispatch window") },
    ],
  },
  {
    id: "desk-lumi",
    sku: "LUMI-DESK-01",
    slug: "desk-lumi",
    name: "Desk Lumi",
    category: "desk",
    status: "coming_soon",
    tagline: "A Lumi that lives on your desk.",
    personality: "In the works. We'll share more when it's ready.",
    description: [
      "Desk Lumi is a companion made to live beside your keyboard. It's still being designed, so there are no specs or pictures yet.",
      "Leave your email on the launches page and we'll tell you when there's something to see.",
    ],
    price: tbc("Not yet priced"),
    variants: [],
    images: [],
    personas: ["ni"],
    specs: [],
    included: tbc("Not yet designed"),
    shipping: tbc("Not yet known"),
    maxPerOrder: 2,
    faq: [],
  },
];
