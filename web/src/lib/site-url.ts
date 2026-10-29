/**
 * The site's public address. NEXT_PUBLIC_SITE_URL wins; on Vercel without it,
 * production uses the project's domain and previews use their own branch URL.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const get = (k: string) => env[k]?.trim() || undefined;
  const explicit = get("NEXT_PUBLIC_SITE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const host =
    (get("VERCEL_ENV") === "production" && get("VERCEL_PROJECT_PRODUCTION_URL")) ||
    get("VERCEL_BRANCH_URL") ||
    get("VERCEL_URL");
  return host ? `https://${host}` : "http://localhost:3000";
}
