import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { isAdmin } from "@/lib/admin-session";
import { LOGIN_LIMIT } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { login } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  limit: `Too many tries. Wait ${LOGIN_LIMIT.windowMinutes} minutes and try again.`,
  unavailable: "Signing in isn't available right now: the database can't be reached.",
};

export default async function Page({ searchParams }: PageProps<"/admin/login">) {
  if (!env.adminPassword) notFound();
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <div className="mx-auto max-w-sm rounded-panel bg-white p-8 ring-1 ring-line">
      <h1 className="text-h3 font-bold">Orders</h1>
      <p className="mt-1 text-sm text-muted">Sign in to see and ship orders.</p>
      <form action={login} className="mt-6 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-12 w-full rounded-chip border border-line bg-white px-4 text-[0.9375rem] outline-none focus:border-ink/40"
        />
        {message ? <p role="alert" className="text-sm font-semibold text-[#b3261e]">{message}</p> : null}
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </div>
  );
}
