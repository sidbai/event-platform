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
 * Allow everything, because being found is the point. A directory nobody can
 * index is a directory of things nobody can discover, and the whole reason
 * these tournaments are worth listing is that a parent searching for "U12
 * Eastside September" currently gets nothing.
 *
 * The exceptions are not secrets — every one of them already refuses a
 * stranger — they are pages with nothing in them for a reader who is not
 * signed in, and a crawl trap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Signed-in surfaces. They redirect or 404 for anyone else, so
          // crawling them spends a budget to arrive nowhere.
          "/admin",
          "/api/",
          "/settings",
          "/messages",
          "/signin",
          // Organizer tools on an event: entries, rosters, scores, the
          // check-in sheets. The event itself is very much crawlable — these
          // are the pages behind it.
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
