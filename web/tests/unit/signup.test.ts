import { describe, expect, it } from "vitest";
import type { Mail } from "@/lib/email";
import { ACCEPTED, handleSignup, hash, RATE_LIMIT } from "@/lib/signup";
import { MemoryStore } from "@/lib/store/memory";

function setup() {
  const store = new MemoryStore();
  const sent: Mail[] = [];
  const deps = { store, mailer: { send: async (m: Mail) => { sent.push(m); } }, siteUrl: "https://lumi.test", ip: "203.0.113.9", salt: "s" };
  return { store, sent, deps };
}
const ok = { email: " Sam@Example.com ", consent: true, topic: "pocket-first-run", elapsedMs: 5000 };

describe("launch signup", () => {
  it("stores consent and sends a confirmation with confirm and unsubscribe links", async () => {
    const { store, sent, deps } = setup();
    expect(await handleSignup(ok, deps)).toEqual({ status: 200, body: { message: ACCEPTED } });
    const s = store.signups.get("sam@example.com|pocket-first-run")!;
    expect(s.consentText).toMatch(/unsubscribe at any time/);
    expect(sent).toHaveLength(1);
    const confirm = sent[0]!.text.match(/signup\/confirm\?token=(\S+)/)![1]!;
    const unsub = sent[0]!.text.match(/unsubscribe\?token=(\S+)/)![1]!;
    expect(s.confirmTokenHash).toBe(hash(confirm));
    expect(await store.confirmSignup(hash(confirm))).toBe(true);
    expect(await store.unsubscribe(hash(unsub))).toBe(true);
    expect(await store.confirmSignup(hash("forged-token-value"))).toBe(false);
  });

  it("requires consent and a real email", async () => {
    const { deps } = setup();
    expect((await handleSignup({ ...ok, consent: false }, deps)).body.error).toMatch(/Tick the box/);
    expect((await handleSignup({ ...ok, email: "nope" }, deps)).status).toBe(400);
    expect((await handleSignup({ ...ok, topic: "anything" }, deps)).status).toBe(400);
  });

  it("drops bots quietly", async () => {
    const { store, sent, deps } = setup();
    expect((await handleSignup({ ...ok, website: "http://spam" }, deps)).status).toBe(200);
    expect((await handleSignup({ ...ok, elapsedMs: 200 }, deps)).status).toBe(200);
    expect(store.signups.size).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("answers the same way for repeat and confirmed signups, without emailing confirmed people again", async () => {
    const { store, sent, deps } = setup();
    await handleSignup(ok, deps);
    await handleSignup(ok, deps);
    expect(sent).toHaveLength(2); // still pending: a fresh link
    const latest = sent[1]!.text.match(/token=(\S+)/)![1]!;
    await store.confirmSignup(hash(latest));
    expect((await handleSignup(ok, deps)).body.message).toBe(ACCEPTED);
    expect(sent).toHaveLength(2);
  });

  it("rate-limits by address", async () => {
    const { deps } = setup();
    for (let i = 0; i < RATE_LIMIT.max; i++) expect((await handleSignup({ ...ok, email: `p${i}@example.com` }, deps)).status).toBe(200);
    expect((await handleSignup(ok, deps)).status).toBe(429);
    expect((await handleSignup(ok, { ...deps, ip: "198.51.100.1" })).status).toBe(200);
  });
});
