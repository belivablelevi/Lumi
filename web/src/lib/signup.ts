import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { brand } from "@/config/brand";
import { CONSENT_VERSION, consentText } from "@/config/consent";
import { launches } from "@/content/launches";
import { signupConfirmEmail, type Mailer } from "./email";
import type { Store } from "./store/types";

export const TOPICS = ["newsletter", ...launches.map((l) => l.id)] as const;
export const topicName = (t: string) => (t === "newsletter" ? `${brand.name} news and launches` : launches.find((l) => l.id === t)?.name ?? t);

export const signupRequest = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  consent: z.literal(true),
  topic: z.enum(TOPICS),
  website: z.string().max(200).optional().nullable(), // honeypot
  elapsedMs: z.number().nonnegative().optional(),
});

export const RATE_LIMIT = { max: 5, windowMinutes: 10 };
export const MIN_FILL_MS = 1200;
/** The same reply for every accepted signup, so the form doesn't reveal who is already subscribed. */
export const ACCEPTED = "Thanks! Check your inbox for a link to confirm.";

export const hash = (s: string, salt = "") => createHash("sha256").update(salt + s).digest("hex");
const token = () => randomBytes(24).toString("base64url");

export type SignupOutcome = { status: number; body: { message?: string; error?: string } };

export async function handleSignup(
  input: unknown,
  deps: { store: Store; mailer: Mailer; siteUrl: string; ip: string; salt: string },
): Promise<SignupOutcome> {
  const parsed = signupRequest.safeParse(input);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return { status: 400, body: { error: consentMissing ? "Tick the box so we know you'd like these emails." : "Please enter a valid email address." } };
  }
  const { email, topic, website, elapsedMs } = parsed.data;

  // Bots: fill the hidden field or submit instantly. Pretend it worked, store nothing.
  if (website || (elapsedMs !== undefined && elapsedMs < MIN_FILL_MS)) return { status: 200, body: { message: ACCEPTED } };

  const key = hash(deps.ip, deps.salt);
  const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString();
  if ((await deps.store.countAttempts(key, since)) >= RATE_LIMIT.max) {
    return { status: 429, body: { error: "Too many tries. Please wait a few minutes and try again." } };
  }
  await deps.store.recordAttempt(key);

  const confirm = token();
  const unsubscribe = token();
  const result = await deps.store.saveSignup({
    email,
    topic,
    consentText: consentText(brand.name),
    consentVersion: CONSENT_VERSION,
    confirmTokenHash: hash(confirm),
    unsubscribeTokenHash: hash(unsubscribe),
  });
  if (result !== "confirmed") {
    await deps.mailer.send(
      signupConfirmEmail(
        email,
        topicName(topic),
        `${deps.siteUrl}/signup/confirm?token=${confirm}`,
        `${deps.siteUrl}/unsubscribe?token=${unsubscribe}`,
      ),
    );
  }
  return { status: 200, body: { message: ACCEPTED } };
}
