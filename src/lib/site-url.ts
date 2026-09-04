/**
 * Absolute origin of the site, for metadataBase / OG image URLs (server-only).
 * Prefers an explicit SITE_URL, then Vercel's stable production domain, then
 * localhost. Tolerates the env var being set but empty.
 */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
