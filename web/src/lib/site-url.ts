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

/**
 * An address anyone can open, for images in emails. Preview deployments sit
 * behind Vercel's login, so they borrow the production domain.
 */
export function publicSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (env.NEXT_PUBLIC_SITE_URL?.trim() || !prod) return siteUrl(env);
  return `https://${prod}`;
}
