/**
 * Example units shown on the site. Their looks come from real genes
 * (public/lumi/manifest.json); every manufactured Lumi is different.
 */
export interface PersonaStory {
  id: string;
  line: string;
  shell: "lavender" | "mint" | "peach";
  render: string;
}

export const temperamentLine: Record<string, string> = {
  cheerful: "Wakes up happy and bounces back fast.",
  sleepy: "A little daydreamer with a sleepy side.",
  shy: "Quiet, thoughtful, and always observing.",
  grumpy: "Needs a few pats before it warms up.",
  hyper: "Tiny chaos. Surprisingly good company.",
};

export const personaStories: PersonaStory[] = [
  { id: "yotos", line: temperamentLine.cheerful!, shell: "lavender", render: "front-lavender.png" },
  { id: "ni", line: temperamentLine.sleepy!, shell: "mint", render: "front-mint.png" },
  { id: "katos", line: temperamentLine.shy!, shell: "peach", render: "front-peach.png" },
  { id: "mimox", line: temperamentLine.hyper!, shell: "lavender", render: "front-lavender.png" },
];

/** "Find your kind of Lumi": each emotion is a real firmware animation. */
export const emotions = [
  { id: "happy", label: "Happy", animation: "pat_giggle", text: "Pat it and it giggles. Happy Lumis smile with their whole face." },
  { id: "sleepy", label: "Sleepy", animation: "yawn", text: "Left alone for a while, it yawns, droops and eventually drifts off." },
  { id: "curious", label: "Curious", animation: "curious", text: "Every so often it peers around, as if it heard something." },
  { id: "surprised", label: "Surprised", animation: "pickup_surprised", text: "Pick it up after a rest and it jumps, then says hi." },
  { id: "mischievous", label: "Mischievous", animation: "smug", text: "Sometimes it just looks very pleased with itself." },
  { id: "calm", label: "Calm", animation: "daydream", text: "Some moments it simply daydreams, eyes drifting." },
] as const;
