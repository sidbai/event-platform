import { interestingUrls } from "./pages";
import { readable, tellsUsSomething } from "./text";

/**
 * Reading a club's website, slowly and once.
 *
 * These are small clubs on shared hosting, and this walks forty-three of
 * them. So: one connection at a time, a real pause between pages, an agent
 * string that says who we are and where to complain, and a cache on disk so
 * that re-running the extraction — which is the part we actually iterate on —
 * costs nobody a second fetch.
 */

const AGENT =
  "KingJuanSoccerBot/1.0 (+https://kingjuansoccer.com; youth soccer club directory)";

/** Between page fetches of the same club. */
const PAUSE_MS = 1500;
const TIMEOUT_MS = 20_000;

export type ClubPages = {
  slug: string;
  website: string;
  pages: { url: string; text: string }[];
  /** Why a club yielded nothing, when it did. */
  note?: string;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": AGENT, accept: "text/html,application/xhtml+xml,application/xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

const LOCS = /<loc>([^<]+)<\/loc>/g;

/**
 * Every URL the club publishes, from whichever sitemap it has.
 *
 * A sitemap beats following links, and not only for politeness: Squarespace
 * and Wix render their navigation in JavaScript, so a club's home page can be
 * four kilobytes with no anchors in it at all — Seattle Celtic's is — while
 * its sitemap lists the site.
 */
export async function siteUrls(website: string): Promise<string[]> {
  const origin = new URL(website).origin;
  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/robots.txt"]) {
    let body: string;
    try {
      body = await get(origin + path);
    } catch {
      continue;
    }

    // robots.txt is only consulted for where it says the sitemap is.
    if (path === "/robots.txt") {
      const declared = [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
      for (const url of declared.slice(0, 3)) {
        try {
          const xml = await get(url);
          const found = await expand(xml);
          if (found.length) return found;
        } catch {
          continue;
        }
      }
      continue;
    }

    if (!body.includes("<loc>")) continue;
    const found = await expand(body);
    if (found.length) return found;
  }
  return [];
}

/** A sitemap index is a sitemap of sitemaps; one level down is enough. */
async function expand(xml: string): Promise<string[]> {
  const locs = [...xml.matchAll(LOCS)].map((m) => m[1].trim());
  if (!xml.includes("<sitemapindex")) return locs;
  const out: string[] = [];
  for (const child of locs.slice(0, 10)) {
    try {
      out.push(...[...(await get(child)).matchAll(LOCS)].map((m) => m[1].trim()));
    } catch {
      continue;
    }
    await pause(400);
  }
  return out;
}

/**
 * One club, read.
 *
 * The home page is always read, whatever the ranking thinks, because a club
 * with no sitemap still has one page and it is often the page that lists the
 * programmes.
 */
export async function readClub(
  club: { slug: string; website: string },
  options: { pages?: number; onPage?: (url: string, ok: boolean) => void } = {},
): Promise<ClubPages> {
  const out: ClubPages = { slug: club.slug, website: club.website, pages: [] };

  let urls: string[] = [];
  try {
    urls = await siteUrls(club.website);
  } catch {
    urls = [];
  }

  const wanted = [club.website, ...interestingUrls(urls, options.pages ?? 12)];
  const seen = new Set<string>();

  for (const url of wanted) {
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const text = readable(await get(url));
      /*
       * A page that is all navigation is not evidence, and paying to send it
       * is paying for the club's menu twice. The home page is kept either
       * way — it is the only page some clubs have.
       */
      if (url === club.website || tellsUsSomething(text)) out.pages.push({ url, text });
      options.onPage?.(url, true);
    } catch {
      options.onPage?.(url, false);
    }
    await pause(PAUSE_MS);
  }

  if (out.pages.length === 0) out.note = urls.length ? "no readable pages" : "no sitemap and no home page";
  return out;
}
