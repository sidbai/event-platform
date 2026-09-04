/**
 * Absolute origin of the site, for metadataBase / OG image URLs.
 * Prefers an explicit NEXT_PUBLIC_SITE_URL, then Vercel's stable production
 * domain, then localhost. Tolerates the env var being set but empty.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
