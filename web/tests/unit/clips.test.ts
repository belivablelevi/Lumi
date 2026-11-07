import { describe, expect, it } from "vitest";
import { inkFor, segmentAt, segmentState, spinAngle, timeline, wrap } from "@/components/clips/overlay";
import { pickFormat } from "@/lib/clip-recorder";
import { CLIP_FEATURES } from "@/content/clip-features";
import { manifest } from "@/lib/lumi-frames";

describe("Clip maker timeline", () => {
  const tl = timeline([{ text: "One", anim: "pat_giggle" }, { text: "  " }, { text: "Two" }], { intro: 1, perLine: 2, endCard: 3 });

  it("shows the lines in order, skips blank ones, and ends on the end card", () => {
    expect(tl.segments.map((s) => [s.kind, s.text, s.start, s.end])).toEqual([
      ["line", "One", 1, 3],
      ["line", "Two", 3, 5],
      ["end", "", 5, 8],
    ]);
    expect(tl.total).toBe(8);
    expect(tl.settleAt).toBe(5);
    for (let i = 1; i < tl.segments.length; i++) expect(tl.segments[i]!.start).toBe(tl.segments[i - 1]!.end);
  });

  it("opens on the Lumi alone, then one segment at a time, holding the end card at the end", () => {
    expect(segmentAt(tl, 0.5)).toBeUndefined();
    expect(segmentAt(tl, 1.5)?.text).toBe("One");
    expect(segmentAt(tl, 3)?.text).toBe("Two");
    expect(segmentAt(tl, 9)?.kind).toBe("end");
  });

  it("fades lines in and out, but never fades the end card out", () => {
    const [one, , end] = tl.segments;
    expect(segmentState(one!, 1).opacity).toBe(0);
    expect(segmentState(one!, 2).opacity).toBe(1);
    expect(segmentState(one!, 2.99).opacity).toBeLessThan(0.1);
    expect(segmentState(end!, 7.99).opacity).toBe(1);
  });

  it("spins whole turns and faces the camera when the end card comes up", () => {
    expect(spinAngle(0, 5, 2)).toBe(0);
    expect(spinAngle(2.5, 5, 2)).toBeCloseTo(Math.PI * 2, 5);
    expect(Math.abs(spinAngle(4.999, 5, 2) - Math.PI * 4)).toBeLessThan(0.01);
    expect(spinAngle(6, 5, 2)).toBe(0);
    expect(Math.abs(spinAngle(2, 5, 0))).toBeLessThan(0.36);
  });

  it("only uses animations every personality has", () => {
    for (const p of manifest.personas) for (const f of CLIP_FEATURES) if (f.anim) expect(p.animations[f.anim], `${p.id} ${f.anim}`).toBeDefined();
  });
});

describe("Clip maker text and recording", () => {
  it("wraps by words to the width", () => {
    expect(wrap((s) => s.length, "Play Tilt Pong with a friend", 10)).toEqual(["Play Tilt", "Pong with", "a friend"]);
  });

  it("uses dark ink on light backgrounds and white on dark ones", () => {
    expect(inkFor("shell", "#dcddda")).toBe("#30263a");
    expect(inkFor("shell", "#26272b")).toBe("#ffffff");
    expect(inkFor("night", "#dcddda")).toBe("#ffffff");
  });

  it("records MP4 when it can, WebM otherwise, and says when it can't", () => {
    expect(pickFormat(() => true)).toEqual({ mimeType: "video/mp4;codecs=avc1", ext: "mp4" });
    expect(pickFormat((t) => t.startsWith("video/webm"))?.ext).toBe("webm");
    expect(pickFormat(() => false)).toBeNull();
  });
});
