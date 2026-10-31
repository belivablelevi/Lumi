import { tbc, type Maybe } from "@/lib/placeholder";

export interface Launch {
  id: string;
  name: string;
  description: string;
  image?: { src: string; alt: string; width: number; height: number };
  /** ISO 8601 with offset, e.g. "2027-03-01T10:00:00-05:00". The countdown only shows when this is set. */
  launchAt: Maybe<string>;
  preorderOpensAt: Maybe<string>;
  /** IANA zone the times were set in, shown next to them. */
  timeZone: Maybe<string>;
  productSlugs: string[];
}

export const launches: Launch[] = [
  {
    id: "pocket-first-run",
    name: "Pocket Lumi: the first run",
    description:
      "The first Pocket Lumis, each made with its own look and temperament. Sign up and we'll email you when pre-orders open.",
    image: { src: "/renders/three-quarter.png", alt: "Pocket Lumi render", width: 2000, height: 2000 },
    launchAt: tbc("Launch date and time"),
    preorderOpensAt: tbc("When pre-orders open"),
    timeZone: tbc("Time zone for launch times, e.g. America/Toronto"),
    productSlugs: ["pocket-lumi"],
  },
  {
    id: "desk-lumi",
    name: "Desk Lumi",
    description: "A Lumi made to live on your desk. Still being designed.",
    launchAt: tbc("Not scheduled"),
    preorderOpensAt: tbc("Not scheduled"),
    timeZone: tbc("Not scheduled"),
    productSlugs: ["desk-lumi"],
  },
];

export const launchTopics = launches.map((l) => ({ id: l.id, name: l.name }));
