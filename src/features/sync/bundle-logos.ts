import { parse } from "node-html-parser";

import { IMAGE_TYPES } from "@/features/uploads/blob";

/**
 * Team logos, riding along in the weekly bundle.
 *
 * GotSport prints a small badge beside every team in a schedule, served
 * from its own host. Hotlinking those would have our image optimizer fetch
 * from a platform that refuses automated access, on every render. So the
 * bookmark — a person's browser, a visitor — fetches each badge once and
 * puts it in the bundle as a data URL, keyed by league and by the team's
 * published name; the import then copies it into our own store, for the
 * teams that have no crest of their own. Nothing here ever asks GotSport
 * for anything.
 *
 * The bundle's schedule pages are found by walking every string that looks
 * like a table (har.ts); a data URL looks like none, so the logos sit under
 * one reserved key and are read by name.
 */
export const LOGOS_KEY = "__logos";

/** A badge is a small thing; anything past this is a photo somebody uploaded. */
export const MAX_LOGO_BYTES = 512 * 1024;

export type Logos = Map<string, Map<string, string>>;

/** league → team name → data URL, from a bundle that carries them. */
export function logosIn(json: unknown): Logos {
  const out: Logos = new Map();
  const bag = (json as Record<string, unknown> | null)?.[LOGOS_KEY];
  if (!bag || typeof bag !== "object") return out;
  for (const [league, teams] of Object.entries(bag as Record<string, unknown>)) {
    if (!teams || typeof teams !== "object") continue;
    const byName = new Map<string, string>();
    for (const [name, url] of Object.entries(teams as Record<string, unknown>)) {
      if (typeof url === "string" && url.startsWith("data:")) byName.set(name, url);
    }
    if (byName.size > 0) out.set(league, byName);
  }
  return out;
}

export type Decoded = { type: (typeof IMAGE_TYPES)[number]; bytes: Uint8Array };

/**
 * A data URL as bytes, or null where it is not an image we would accept
 * from an upload form either — same types, and a size a badge never needs.
 */
export function decodeLogo(dataUrl: string): Decoded | null {
  const m = dataUrl.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const type = m[1].toLowerCase() as Decoded["type"];
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
  return { type, bytes: new Uint8Array(bytes) };
}

/** The file extension a stored copy gets. */
export function extensionFor(type: Decoded["type"]): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[type];
}

/**
 * Team name → badge path, off a GotSport schedule page.
 *
 * The bookmark does the same in the browser — an `img.match-img-sm`
 * followed by the team's link — so this is the version a test can hold
 * against the saved page, and what a bundle without logos can be checked
 * against.
 */
export function readGotSportLogos(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const img of parse(html).querySelectorAll("img.match-img-sm")) {
    const src = img.getAttribute("src");
    const name = img.parentNode?.querySelector('a[href*="team="]')?.text.replace(/\s+/g, " ").trim();
    if (src && name && !out.has(name)) out.set(name, src);
  }
  return out;
}
