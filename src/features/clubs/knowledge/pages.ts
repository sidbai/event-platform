/**
 * Which of a club's pages are worth reading, out of the several hundred it has.
 *
 * Crossfire's sitemap is 579 URLs; Western WA Surf's is 288. Almost all of it
 * is news posts, tournament check-in details and image attachments. What we
 * are after is the handful of pages where a club states how it organises
 * itself — its tiers, its age groups, its coaches — because that is the fact
 * nothing in our database records and the one that keeps making the merge
 * queue wrong.
 *
 * Pure and scored rather than filtered, because the interesting pages are not
 * spelled the same anywhere: Eastside publishes `/teams-coaches`, PacNW
 * `/meet-your-coaches`, Crossfire `/coaches/team-coaches/`, and Surf hides the
 * whole structure in `/premier-outline-bellevue-2025/`. A keyword list would
 * have to guess all four; a ranking only has to put them above the news.
 */

/** Worth a page fetch, most telling first. */
const WORTH: [RegExp, number][] = [
  // A page that is *about* the club's teams or coaches, at the top level.
  [/\/(teams?|coaches|staff|roster)s?\/?$/i, 10],
  [/\/(teams?|coaches|staff)[a-z-]*\/?$/i, 8],
  [/team-?(coach|staff)/i, 9],
  [/coach(ing|es)?-(staff|director|list)/i, 8],
  [/meet-(your|our)-coach/i, 8],
  // How the club lays its programmes out — tiers, pathways, age groups.
  [/program-chart|player-?development-?pathway|playing-for/i, 9],
  [/season-outline|premier-outline/i, 7],
  [/\/(programs?|academy|pathways?)\/?$/i, 6],
  [/(boys|girls)-?u\d/i, 6],
  [/\b(elite|premier|select|academy|classic|recreational)\b/i, 3],
  [/tryout/i, 2],
];

/** Never worth a fetch, whatever else matches. */
const NEVER = [
  /\/attachment\//i,
  /\.(jpe?g|png|gif|svg|webp|pdf|docx?|xlsx?|zip|ics)$/i,
  /\/(news|blog|latest-news|post|20\d\d\/\d\d)\//i,
  /\/(shop|store|product|cart|checkout|account|login|register|donate)\b/i,
  /\/(privacy|terms|refund|policy|bylaws|waiver|financial-aid)/i,
  /\/(camps?|clinics?|tournaments?|sponsors?|contact|calendar|events?)\//i,
  /\?/,
];

export function scoreUrl(url: string): number {
  if (NEVER.some((r) => r.test(url))) return 0;
  let score = 0;
  for (const [pattern, points] of WORTH) if (pattern.test(url)) score += points;
  /*
   * A shallow path beats a deep one at the same score.
   *
   * `/coaches/` is the club's coaching page; `/tryouts/boys/attachment/...`
   * merely contains the word. Depth is the cheapest signal that separates a
   * section from something filed under it.
   */
  if (score > 0) score += Math.max(0, 4 - (url.split("/").length - 3));
  return score;
}

/**
 * The pages to read for one club, best first.
 *
 * Capped, because this runs across forty-three clubs and the point is a
 * profile, not an archive. Twelve pages is enough to see a club's tiers and
 * its coach list, and the twelfth is already well down the ranking.
 */
export function interestingUrls(urls: string[], limit = 12): string[] {
  const seen = new Set<string>();
  return urls
    .map((url) => ({ url, score: scoreUrl(url) }))
    .filter((u) => {
      // A club that publishes both `/coaches` and `/coaches/` has one page.
      const key = u.url.replace(/\/+$/, "");
      if (u.score <= 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, limit)
    .map((u) => u.url);
}
