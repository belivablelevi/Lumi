import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// The order admin's login. There's one admin and one password (ADMIN_PASSWORD).
// A session is a cookie holding "<expiry ms>.<HMAC of the expiry>", keyed from the
// password, so changing the password signs every session out.

export const ADMIN_COOKIE = "lumi_admin";
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const LOGIN_LIMIT = { max: 5, windowMinutes: 15 };

const sessionKey = (password: string) => createHash("sha256").update(`lumi-admin-session:${password}`).digest();
const mac = (password: string, expiry: string) => createHmac("sha256", sessionKey(password)).update(expiry).digest();

export function signSession(password: string, now = Date.now()): string {
  const expiry = String(now + SESSION_MS);
  return `${expiry}.${mac(password, expiry).toString("base64url")}`;
}

export function verifySession(token: string | undefined, password: string | undefined, now = Date.now()): boolean {
  if (!token || !password) return false;
  const [expiry, sig, extra] = token.split(".");
  if (extra !== undefined || !expiry || !sig || !/^\d{1,15}$/.test(expiry)) return false;
  const exp = Number(expiry);
  if (exp <= now || exp > now + SESSION_MS + 60_000) return false;
  const want = mac(password, expiry);
  const got = Buffer.from(sig, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Compares in constant time, whatever the lengths. */
export function passwordMatches(given: string, password: string | undefined): boolean {
  if (!password) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}
