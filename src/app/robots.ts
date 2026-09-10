import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

/**
 * What we ask of other people's crawlers.
 *
 * Written after reading rather a lot of these. The connector work turned on
 * exactly this file on two other platforms — one that says come in, one that
 * says stay out — and it decided what we would and would not do with each. So
 * this is the answer to somebody standing where we stood: unambiguous, and
 * generous about the part that is worth finding.
 *
 * Allow what is ours, because being found is the point for that part: the
 * events we run, the clubs and their reviews, the writing.
 *
 * Not what is somebody else's. The owner's decision on 2026-09-10 is that
 * what other organizers publish belongs to them and this directory should not
 * be the copy a search engine indexes. Team pages are the whole of that by
 * count, so /teams/ is closed here; the events read off another platform
 * carry noindex on the page itself, because which ones those are is a fact
 * in the database and not something a static file can name.
 *
 * None of it is hidden. Every page stays readable to anyone with the address,
 * and a parent following a link to their child's fixture is the entire reason
 * to hold it. The ask is only that it not be crawled and republished.
 *
 * The rest of the exceptions are not secrets either — every one already
 * refuses a stranger — they are pages with nothing in them for a reader who
 * is not signed in, and a crawl trap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          /*
           * Somebody else's teams, which is nearly all of them: a club's
           * squads, named by the club, published on the league's own pages.
           * The sitemap agrees — it stopped listing them on the same day —
           * because a sitemap offering a page this file forbids teaches a
           * crawler to trust neither.
           */
          "/teams/",
          // Signed-in surfaces. They redirect or 404 for anyone else, so
          // crawling them spends a budget to arrive nowhere.
          "/admin",
          "/api/",
          "/settings",
          "/messages",
          "/signin",
          // Organizer tools on an event: entries, rosters, scores, the
          // check-in sheets. An event we run is very much crawlable — these
          // are the pages behind it. One read off another platform carries
          // noindex on the page itself, which a static file cannot do.
          "/events/*/registrations",
          "/events/*/roster",
          "/events/*/scores",
          "/events/*/setup",
          "/events/*/checklist",
          "/events/*/invite",
          "/events/*/print/",
          "/teams/*/settings",
          // A crawl trap rather than a private page: every query is a new
          // URL, and none of them is a page anybody links to.
          "/search",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
