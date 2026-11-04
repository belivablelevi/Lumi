import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySession } from "./admin-auth";
import { env } from "./env";

/** Whether this request carries a valid admin session. Server only. */
export async function isAdmin(): Promise<boolean> {
  if (!env.adminPassword) return false;
  return verifySession((await cookies()).get(ADMIN_COOKIE)?.value, env.adminPassword);
}

/**
 * Every admin page, action and route calls this first. The admin doesn't exist
 * (404) until ADMIN_PASSWORD is set; without a session it sends you to log in.
 */
export async function requireAdmin(): Promise<void> {
  if (!env.adminPassword) notFound();
  if (!(await isAdmin())) redirect("/admin/login");
}
