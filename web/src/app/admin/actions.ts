"use server";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_COOKIE, LOGIN_LIMIT, SESSION_MS, passwordMatches, signSession } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-session";
import { getMailer, orderShippedEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { hash } from "@/lib/signup";
import { getStore } from "@/lib/store";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/admin",
};

export async function login(formData: FormData) {
  if (!env.adminPassword) notFound();
  const store = getStore();
  // Rate-limit by IP (hashed) in the same table as signup attempts; 0002 deletes them after 30 days.
  // If the limit can't be checked, nobody signs in (fail closed).
  if (store) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    const key = hash(`admin:${ip}`, env.hashSalt);
    const since = new Date(Date.now() - LOGIN_LIMIT.windowMinutes * 60_000).toISOString();
    let tries: number;
    try {
      tries = await store.countAttempts(key, since);
      if (tries < LOGIN_LIMIT.max) await store.recordAttempt(key);
    } catch (e) {
      console.error("admin login: rate limit check failed", e);
      redirect("/admin/login?error=unavailable");
    }
    if (tries >= LOGIN_LIMIT.max) redirect("/admin/login?error=limit");
  }
  const given = formData.get("password");
  if (typeof given !== "string" || !passwordMatches(given, env.adminPassword)) redirect("/admin/login?error=wrong");
  (await cookies()).set(ADMIN_COOKIE, signSession(env.adminPassword), { ...cookieOptions, maxAge: SESSION_MS / 1000 });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  redirect("/admin/login");
}

const Id = z.uuid();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null);

async function orderOrFail(id: string) {
  await requireAdmin();
  if (!Id.safeParse(id).success) notFound();
  const store = getStore();
  if (!store) throw new Error("The database isn't set up.");
  const order = await store.getOrder(id);
  if (!order) notFound();
  return { store, order };
}

const back = (id: string, done: string) => redirect(`/admin/orders/${id}?done=${done}`);

export async function savePacking(id: string, formData: FormData) {
  const { store, order } = await orderOrFail(id);
  const f = z.object({ unitNames: text(200), adminNote: text(2000), packed: z.string().optional() }).parse({
    unitNames: formData.get("unitNames") ?? "",
    adminNote: formData.get("adminNote") ?? "",
    packed: formData.get("packed") ?? undefined,
  });
  await store.updateFulfilment(id, {
    unitNames: f.unitNames,
    adminNote: f.adminNote,
    // Marking it packed never moves a shipped order backwards.
    ...(f.packed && order.fulfilmentStatus !== "shipped" ? { fulfilmentStatus: "packed" as const } : {}),
  });
  back(id, f.packed ? "packed" : "saved");
}

async function sendShipped(id: string, includeNames: boolean) {
  const store = getStore();
  const mailer = getMailer();
  const fresh = store ? await store.getOrder(id) : null;
  if (!store || !fresh?.email || !mailer) return false;
  await mailer.send(orderShippedEmail(fresh, { includeNames }));
  await store.markShippedEmailSent(id);
  return true;
}

export async function markShipped(id: string, formData: FormData) {
  const { store, order } = await orderOrFail(id);
  const f = z
    .object({
      carrier: z.enum(["canada_post", "chit_chats", "stallion", "ups", "other"]),
      trackingNumber: text(60),
    })
    .parse({ carrier: formData.get("carrier"), trackingNumber: formData.get("trackingNumber") ?? "" });
  if (order.status !== "paid" && order.status !== "review") back(id, "not-paid");
  await store.updateFulfilment(id, { fulfilmentStatus: "shipped", carrier: f.carrier, trackingNumber: f.trackingNumber });
  // The customer hears about it once; "Resend email" is there for corrections.
  const sent = order.shippedEmailSentAt ? false : await sendShipped(id, formData.get("includeNames") === "1");
  back(id, sent ? "shipped-emailed" : "shipped");
}

export async function resendShipped(id: string, formData: FormData) {
  const { order } = await orderOrFail(id);
  if (order.fulfilmentStatus !== "shipped") back(id, "not-shipped");
  back(id, (await sendShipped(id, formData.get("includeNames") === "1")) ? "emailed" : "no-email");
}
