import { NextResponse } from "next/server";
import { getMailer } from "@/lib/email";
import { env, serviceStatus } from "@/lib/env";
import { handleSignup } from "@/lib/signup";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const store = getStore();
  const mailer = getMailer();
  if (!serviceStatus().signup || !store || !mailer) {
    return NextResponse.json({ error: "Launch emails aren't set up yet." }, { status: 503 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const body = await req.json().catch(() => null);
  try {
    const r = await handleSignup(body, { store, mailer, siteUrl: env.siteUrl, ip, salt: env.hashSalt });
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("signup failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
