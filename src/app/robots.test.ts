import { describe, expect, it } from "vitest";

import robots from "./robots";

const config = robots();
const rule = Array.isArray(config.rules) ? config.rules[0] : config.rules;
const disallow = [rule.disallow ?? []].flat();

/** robots.txt wildcards, as a crawler reads them: * is any run of characters. */
const blocks = (path: string) =>
  disallow.some((p) =>
    new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).test(
      path,
    ),
  );

describe("robots.txt", () => {
  it("lets crawlers at everything that is worth finding", () => {
    /*
     * The failure this exists for is silent. One disallow pattern a little too
     * broad — /events/ instead of /events/*\/roster — and the entire directory
     * stops being indexed, with nothing on the site looking any different. We
     * would find out from traffic, months later.
     */
    for (const path of [
      "/",
      "/events",
      "/events/labor-day-zf-challenge",
      "/events/king-juan-cup-2026",
      "/community",
      "/community/best-indoor-fields",
      "/news",
      "/news/some-post",
      "/clubs",
      "/clubs/crossfire-premier",
      "/coaches",
      // The list itself, which is ours — a page of the directory. The team
      // pages under it are not; see below.
      "/teams",
      "/guidelines",
      "/privacy",
      "/terms",
    ]) {
      expect(blocks(path), path).toBe(false);
    }
  });

  it("keeps crawlers off pages that need a sign-in to mean anything", () => {
    // Not secrets — every one already refuses a stranger. Crawling them
    // spends a budget to arrive nowhere.
    for (const path of [
      "/admin",
      "/admin/sync",
      "/api/cron/sync",
      "/settings",
      "/messages",
      "/messages/abc",
      "/signin",
      "/events/king-juan-cup-2026/registrations",
      "/events/king-juan-cup-2026/roster",
      "/events/king-juan-cup-2026/scores",
      "/events/king-juan-cup-2026/setup",
      "/events/king-juan-cup-2026/checklist",
      "/events/king-juan-cup-2026/invite",
      "/events/king-juan-cup-2026/print/check-in",
      "/teams/marymoor-united/settings",
    ]) {
      expect(blocks(path), path).toBe(true);
    }
  });

  it("keeps them off somebody else's teams, without hiding them", () => {
    /*
     * The owner's decision on 2026-09-10: a club's squads are named and
     * published by that club, and this directory should not be the copy a
     * search engine indexes. The pages stay readable to anyone with the
     * address — a parent following a link to their child's fixture is the
     * whole reason to hold them.
     *
     * The list at /teams stays crawlable. It is a page of this directory.
     */
    expect(blocks("/teams/marymoor-united")).toBe(true);
    expect(blocks("/teams")).toBe(false);
  });

  it("keeps them out of the search box, which is a trap not a page", () => {
    // Every query is a new URL and none of them is a page anybody links to.
    expect(blocks("/search")).toBe(true);
  });

  it("says allow before it says anything else", () => {
    // Being found is still the point for the part that is ours: the events we
    // run, the clubs and their reviews, the writing.
    expect(rule.allow).toBe("/");
    expect(rule.userAgent).toBe("*");
  });

  it("points at the sitemap now that there is one", () => {
    // It said nothing while there was no sitemap, because pointing a crawler
    // at a 404 is worse than pointing it at nothing.
    expect(config.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
