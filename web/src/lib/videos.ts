// Written by Documents/Lumi film/scripts/publish_videos.py from RTP/Captions.txt. Edit the captions there and run it again.
export type Video = { title: string; slug: string; group: "any" | "soon" | "launch"; note: string; seconds: number | null; caption: string };

export const VIDEO_GROUPS: { id: Video["group"]; title: string; note: string }[] = [
  {
    "id": "any",
    "title": "Post any time",
    "note": "No date and no pre-order line, on screen or in the caption."
  },
  {
    "id": "soon",
    "title": "Says \"Pre-orders opening soon\"",
    "note": "On screen, in the caption, or both. Fine to post, but they point at a launch."
  },
  {
    "id": "launch",
    "title": "Launch day only",
    "note": "Says pre-orders are open."
  }
];

export const VIDEOS: Video[] = [
  {
    "title": "Pocket Lumi launch film, short cut",
    "slug": "pocket-lumi-launch-film-short-cut",
    "group": "soon",
    "note": "first post, teaser",
    "seconds": 8,
    "caption": "A keychain with feelings.\n\nMeet Lumi. It reacts when you pat it, tilt it or pick it up.\n\nPre-orders opening soon. Link in bio.\n(Sound added. Lumi is silent in real life.)\n#lumi #keychain"
  },
  {
    "title": "Snaggo brand sting",
    "slug": "snaggo-brand-sting",
    "group": "any",
    "note": "story, or the start of your intro video",
    "seconds": 5.0,
    "caption": "Hi, we're Snaggo.\n\nLittle companions. Big personality. Made in Ottawa."
  },
  {
    "title": "Meet Yotos",
    "slug": "meet-yotos",
    "group": "soon",
    "note": "",
    "seconds": 9.0,
    "caption": "Meet Yotos.\n\nCheerful. Uncommon. Pat it and it giggles.\n\nEvery Lumi gets its own face and temperament when it's made.\n(Sound added.)\n#lumi #meetlumi"
  },
  {
    "title": "Meet Ni",
    "slug": "meet-ni",
    "group": "soon",
    "note": "",
    "seconds": 9.0,
    "caption": "Meet Ni.\n\nSleepy. Always first to nod off. Honestly, same.\n\nWhich one are you so far, Yotos or Ni?\n(Sound added.)\n#lumi #meetlumi"
  },
  {
    "title": "Meet Katos",
    "slug": "meet-katos",
    "group": "soon",
    "note": "",
    "seconds": 9.0,
    "caption": "Meet Katos.\n\nShy. Legendary. Two pats and it melts.\n\nLegendary is the rarest kind of Lumi.\n(Sound added.)\n#lumi #meetlumi"
  },
  {
    "title": "Meet Mimox",
    "slug": "meet-mimox",
    "group": "soon",
    "note": "",
    "seconds": 9.0,
    "caption": "Meet Mimox.\n\nHyper. Can't sit still.\n\nThat's all four. Which one would you keep on your keys?\n(Sound added.)\n#lumi #meetlumi"
  },
  {
    "title": "Same pat, four Lumis",
    "slug": "same-pat-four-lumis",
    "group": "soon",
    "note": "",
    "seconds": 12.5,
    "caption": "Same pat. Four different faces.\n\nNo two Lumis look quite the same.\n\nPre-orders opening soon. Link in bio.\n(Sound added.)\n#lumi #keychain"
  },
  {
    "title": "Pick your colour",
    "slug": "pick-your-colour",
    "group": "soon",
    "note": "post as a poll if the app offers one",
    "seconds": 10.0,
    "caption": "Black, light grey or milky green?\n\nMilky green is a limited run.\n\nTell me your pick in the comments.\n(Sound added.)\n#lumi #keychain"
  },
  {
    "title": "Army of Lumis",
    "slug": "army-of-lumis",
    "group": "soon",
    "note": "",
    "seconds": 11.0,
    "caption": "One Lumi is cute. Sixty is a lot.\n\n108,000 possible combinations. Which one is yours?\n\nPre-orders opening soon. Link in bio.\n(Sound added.)\n#lumi #keychain"
  },
  {
    "title": "One face, every mood",
    "slug": "one-face-every-mood",
    "group": "soon",
    "note": "",
    "seconds": 11.0,
    "caption": "One little face. Every mood.\n\nHappy, sleepy, smug, dizzy. It has 29 of them.\n\n(Sound added.)\n#lumi #keychain"
  },
  {
    "title": "Everything it does",
    "slug": "everything-it-does",
    "group": "soon",
    "note": "",
    "seconds": 16.0,
    "caption": "It wakes up. It giggles. It melts. It notices. It nods off.\n\nAll from a pat, a pick-up, or being left alone.\n\nPre-orders opening soon. Link in bio.\n(Sound added.)\n#lumi #keychain"
  },
  {
    "title": "Pocket Lumi launch film",
    "slug": "pocket-lumi-launch-film",
    "group": "launch",
    "note": "launch day, pinned",
    "seconds": 21,
    "caption": "Pre-orders are open.\n\nMeet Lumi, the keychain with feelings.\n\nLink in bio.\n(Music added. Lumi is silent in real life.)\n#lumi #keychain"
  },
  {
    "title": "Is this a new Tamagotchi",
    "slug": "is-this-a-new-tamagotchi",
    "group": "any",
    "note": "",
    "seconds": 10.0,
    "caption": "nope. you don't feed me. you don't clean up after me. i just have feelings.\n\nA keychain that reacts when you pat it.\n(3D render, sound added. Real footage soon.)\n#keychain #virtualpet"
  },
  {
    "title": "We need to talk",
    "slug": "we-need-to-talk",
    "group": "any",
    "note": "",
    "seconds": 6.0,
    "caption": "what did i do\n\nSend this to the person who texts like that.\n(3D render, sound added.)\n#lumi #keychain"
  },
  {
    "title": "Pat loop",
    "slug": "pat-loop",
    "group": "any",
    "note": "",
    "seconds": 5.0,
    "caption": "i could do this all day.\n\n(3D render, sound added.)\n#lumi #deskpet"
  },
  {
    "title": "It's time",
    "slug": "it-s-time",
    "group": "any",
    "note": "post in November",
    "seconds": 7.0,
    "caption": "holiday mode: on.\n\nLumi is a keychain with feelings. Coming soon.\n(3D render, sound added.)\n#lumi #bagcharm"
  },
  {
    "title": "Five minutes into studying",
    "slug": "five-minutes-into-studying",
    "group": "any",
    "note": "",
    "seconds": 8.0,
    "caption": "i was resting my eyes.\n\nSend this to someone who does this.\n(3D render, sound added.)\n#lumi #studytok"
  },
  {
    "title": "AI might replace you",
    "slug": "ai-might-replace-you",
    "group": "any",
    "note": "",
    "seconds": 8.0,
    "caption": "not me. i'm busy.\n\nLumi is a keychain with feelings. It doesn't do anything useful.\n(3D render, sound added.)\n#lumi #keychain"
  },
  {
    "title": "And suddenly",
    "slug": "and-suddenly",
    "group": "any",
    "note": "",
    "seconds": 7.5,
    "caption": "29 moods. zero responsibilities. living the dream.\n\n(3D render, sound added.)\n#lumi #bagcharm"
  },
  {
    "title": "Which Lumi will you get",
    "slug": "which-lumi-will-you-get",
    "group": "any",
    "note": "",
    "seconds": 10.0,
    "caption": "Every Lumi is a surprise. Common, uncommon, rare or legendary.\n\nWhich one are you hoping for?\n(3D render, sound added.)\n#lumi #blindbox"
  },
  {
    "title": "Ranking my moods",
    "slug": "ranking-my-moods",
    "group": "any",
    "note": "",
    "seconds": 12.0,
    "caption": "number one was never in doubt.\n\nWhich one are you today?\n(3D render, sound added.)\n#lumi #keychain"
  },
  {
    "title": "Made of Lumis",
    "slug": "made-of-lumis",
    "group": "any",
    "note": "",
    "seconds": 10.0,
    "caption": "zoom out.\n\n(3D render, sound added.)\n#lumi #pixelart"
  },
  {
    "title": "Loading Lumi",
    "slug": "loading-lumi",
    "group": "any",
    "note": "",
    "seconds": 9.0,
    "caption": "loading... please wait... ok I'm here.\n\n(3D render, sound added.)\n#lumi #dither"
  },
  {
    "title": "Every pixel is a Lumi",
    "slug": "every-pixel-is-a-lumi",
    "group": "any",
    "note": "",
    "seconds": 9.0,
    "caption": "every light in this picture is one of us.\n\n(3D render, sound added.)\n#lumi #pixelart"
  },
  {
    "title": "Every mood I have",
    "slug": "every-mood-i-have",
    "group": "any",
    "note": "",
    "seconds": 9.0,
    "caption": "it took every mood I have to make this.\n\nHow many faces can you count?\n(Sound added.)\n#lumi #dither"
  },
  {
    "title": "Lumi love",
    "slug": "lumi-love",
    "group": "any",
    "note": "",
    "seconds": 8.3,
    "caption": "made you something.\n\nSend this to your favourite person.\n(3D render, sound added.)\n#lumi #pixelart"
  },
  {
    "title": "Hi, I'm Lumi",
    "slug": "hi-i-m-lumi",
    "group": "any",
    "note": "",
    "seconds": 10.0,
    "caption": "hi.\n\nA keychain with feelings.\n(3D render, sound added.)\n#lumi #keychain"
  },
  {
    "title": "One big mood",
    "slug": "one-big-mood",
    "group": "any",
    "note": "",
    "seconds": 11.5,
    "caption": "it takes about two thousand of us to make one face.\n\n(3D render, sound added.)\n#lumi #pixelart"
  },
  {
    "title": "Lumi in ASCII",
    "slug": "lumi-in-ascii",
    "group": "any",
    "note": "",
    "seconds": 5.0,
    "caption": "pat. giggle. repeat. now in plain text.\n\n(3D render, sound added.)\n#lumi #asciiart"
  },
  {
    "title": "Spelled L U M I",
    "slug": "spelled-l-u-m-i",
    "group": "any",
    "note": "",
    "seconds": 7.5,
    "caption": "29 moods, four letters.\n\n(3D render, sound added.)\n#lumi #asciiart"
  },
  {
    "title": "Wake up, Lumi",
    "slug": "wake-up-lumi",
    "group": "any",
    "note": "",
    "seconds": 7.0,
    "caption": "good morning.\n\n(3D render, sound added.)\n#lumi #asciiart"
  }
];
