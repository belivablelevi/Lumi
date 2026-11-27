/**
 * Copy for "How a Lumi is made" (/how-its-made and the short pieces on other pages).
 * Every sentence here must be true today. Anything not decided yet is left out
 * or marked with tbc(), like content/products.ts.
 */

export interface MakingStep {
  id: string;
  /** Short name for the homepage strip. */
  short: string;
  title: string;
  text: string[];
}

export const origin = {
  chip: "Made in Ottawa",
  line: "Designed and built in Ottawa, Ontario.",
  /** Shown beside the origin line, so it is honest about the parts. */
  partsNote:
    "The circuit boards and electronic parts are made by partner factories. Everything is designed, put together and tested here.",
};

export const makingSteps: MakingStep[] = [
  {
    id: "idea",
    short: "The idea",
    title: "A face for your keys",
    text: [
      "The things we carry every day could have a little more character. Lumi started as a screen the size of a postage stamp that could look pleased to see you.",
    ],
  },
  {
    id: "case",
    short: "Designed",
    title: "The case",
    text: [
      "The shell is designed in the open-source tool OpenSCAD, so every wall, snap and screen window is a number we can tune. The prototypes are 3D printed in PETG, and each design change goes through test prints until the screen, the lid and the charging port all fit.",
    ],
  },
  {
    id: "brain",
    short: "Wired",
    title: "The brain",
    text: [
      "Inside is a circuit board we drew ourselves, with an ESP32-C3 chip, a 0.96 inch screen, a motion sensor and a USB-C port. The boards and parts are made by partner factories. We design, assemble and test the Lumi here.",
    ],
  },
  {
    id: "dice",
    short: "Rolled",
    title: "The dice",
    text: [
      "Every chip has its own ID, and the ID decides who the Lumi is: the shape and size of its eyes, the glint, a little accent and its temperament. The same chip always gives the same Lumi.",
      "Batches are planned before any unit is flashed, so rare Lumis stay rare. The odds for every trait are public.",
    ],
  },
  {
    id: "senses",
    short: "Senses",
    title: "How it knows you patted it",
    text: [
      "A small motion sensor feels pats, double pats, shakes, tilts, drops and being picked up. The Lumi turns those into reactions, and no phone or app is involved.",
    ],
  },
  {
    id: "testing",
    short: "Tested",
    title: "Tested before it leaves",
    text: [
      "The software that decides how a Lumi looks and behaves has hundreds of automatic tests. Each Lumi is also checked by hand: screen, motion sensor, charging and waking up.",
    ],
  },
  {
    id: "packing",
    short: "Packed",
    title: "Packed in Ottawa",
    text: ["Each order is packed by hand and sent from Ottawa, tracked."],
  },
];

export const inside = [
  { name: "ESP32-C3", what: "The brain. A small, low-power chip." },
  { name: "0.96 inch OLED", what: "The face. 128 by 64 pixels, drawn by the Lumi's own software." },
  { name: "Motion sensor", what: "Feels pats, shakes, tilts and being picked up." },
  { name: "USB-C", what: "Charging, on the side of the case." },
  { name: "The shell", what: "35 by 37 mm, with a keyring loop." },
];

/** The founder's own words, kept as written. */
export const founderNote = {
  name: "Levi",
  paragraphs: [
    "I'm Levi, a young entrepreneur in Ottawa learning more about tech and building awesome things.",
    "I've always loved little interactive robots, and I think they're a great way to stand out. So I'm making one small enough to hang on your keys.",
    "I'm building all of it myself: the case, the circuit board, the software and this website. That means getting the prints calibrated and troubleshooting circuit designs, over and over, until it works.",
    "Every Lumi starts as a pile of parts on my desk.",
  ],
};
