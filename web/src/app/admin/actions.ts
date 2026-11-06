"use server";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_COOKIE, LOGIN_LIMIT, SESSION_MS, passwordMatches, signSession } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-session";
import { buyLabel, createShipment, deleteShipment, getShipment, type ChitChatsShipment } from "@/lib/chitchats";
import { DEMO_PLACES, demoOrder, isDemoOrder, type DemoPlace } from "@/lib/demo-order";
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

// Demo orders, for trying packing and labels without a real checkout.
export async function makeDemoOrder(formData: FormData) {
  await requireAdmin();
  const store = getStore();
  if (!store) redirect("/admin?demo=no-db");
  const place = DEMO_PLACES.find((p) => p.id === formData.get("place"))?.id ?? "toronto";
  const order = demoOrder(place as DemoPlace);
  try {
    await store!.addDemoOrder(order);
  } catch (e) {
    console.error("make demo order failed", e);
    redirect("/admin?demo=failed");
  }
  back(order.id, "demo-made");
}

export async function removeDemoOrder(id: string) {
  const { store, order } = await orderOrFail(id);
  if (!isDemoOrder(order)) back(id, "demo-real");
  // A shipment left in Chit Chats would lose the only link to it.
  if (order.chitchatsShipmentId) back(id, "demo-has-shipment");
  await store.deleteDemoOrder(id);
  redirect("/admin?demo=deleted");
}

// Chit Chats labels. Each step shows Chit Chats' reason on the order page if it fails.
const ccProblem = (id: string, e: unknown) => {
  const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Chit Chats didn't answer within 15 seconds. Try again." : e.message) : String(e);
  return redirect(`/admin/orders/${id}?cc=${encodeURIComponent(msg.slice(0, 400))}`);
};

async function chitChatsOrder(id: string) {
  const { store, order } = await orderOrFail(id);
  const cfg = env.chitChats;
  if (!cfg) back(id, "cc-off");
  return { store, order, cfg: cfg! };
}

/** Creates an unpaid Chit Chats shipment for this order, so its rates show on the page. */
export async function createChitChatsShipment(id: string) {
  const { store, order, cfg } = await chitChatsOrder(id);
  if (order.status !== "paid" && order.status !== "review") back(id, "not-paid");
  if (order.chitchatsShipmentId) back(id, "cc-exists");
  let made: ChitChatsShipment;
  try {
    made = await createShipment(cfg, order, env.parcel, env.customs);
  } catch (e) {
    return ccProblem(id, e);
  }
  try {
    await store.updateFulfilment(id, { chitchatsShipmentId: made.id });
  } catch (e) {
    console.error("save chit chats shipment failed", e);
    return ccProblem(
      id,
      new Error(`Made Chit Chats shipment ${made.id}, but couldn't save it on this order. Run supabase/migrations/0004_chitchats.sql in Supabase's SQL editor, delete shipment ${made.id} in Chit Chats, then try again.`),
    );
  }
  back(id, "cc-created");
}

/** Buys the rate picked on the page, and puts Chit Chats' tracking on the order (it isn't marked shipped yet). */
export async function buyChitChatsLabel(id: string, formData: FormData) {
  const { store, order, cfg } = await chitChatsOrder(id);
  const postageType = z.string().regex(/^[a-z0-9_]{1,60}$/).safeParse(formData.get("postageType"));
  if (!postageType.success || !order.chitchatsShipmentId) back(id, "cc-missing");
  const shipmentId = order.chitchatsShipmentId!;
  let current: ChitChatsShipment;
  try {
    current = await getShipment(cfg, shipmentId);
  } catch (e) {
    return ccProblem(id, e);
  }
  // Only an unpaid shipment can be bought, and only at a rate it still offers: a second click can't buy twice.
  if (current.status !== "unpaid" && current.status !== "postage_purchase_failed") back(id, "cc-not-unpaid");
  if (!current.rates.some((r) => r.postageType === postageType.data)) back(id, "cc-missing");
  try {
    await buyLabel(cfg, shipmentId, postageType.data!);
  } catch (e) {
    return ccProblem(id, e);
  }
  await store.updateFulfilment(id, { carrier: "chit_chats", trackingNumber: shipmentId });
  back(id, "cc-bought");
}

/** Deletes the unpaid shipment (to change the address or parcel, say). A bought label is refunded in Chit Chats. */
export async function deleteChitChatsShipment(id: string) {
  const { store, order, cfg } = await chitChatsOrder(id);
  const shipmentId = order.chitchatsShipmentId;
  if (!shipmentId) back(id, "cc-missing");
  try {
    await deleteShipment(cfg, shipmentId!);
  } catch (e) {
    // Already gone from Chit Chats: just forget it here.
    if (!(e instanceof Error && e.message.includes("(404)"))) return ccProblem(id, e);
  }
  const ours = order.carrier === "chit_chats" && order.trackingNumber === shipmentId;
  await store.updateFulfilment(id, { chitchatsShipmentId: null, ...(ours ? { trackingNumber: null } : {}) });
  back(id, "cc-deleted");
}

export async function resendShipped(id: string, formData: FormData) {
  const { order } = await orderOrFail(id);
  if (order.fulfilmentStatus !== "shipped") back(id, "not-shipped");
  back(id, (await sendShipped(id, formData.get("includeNames") === "1")) ? "emailed" : "no-email");
}
