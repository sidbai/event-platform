/**
 * A badge from the bundle lands on the team that has none, and on no other.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

// The store is not part of what is being tested; what goes in it is.
const puts: { pathname: string; bytes: number; type: string }[] = [];
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: Buffer, opts: { contentType: string }) => {
    puts.push({ pathname, bytes: body.length, type: opts.contentType });
    return { url: `https://test.public.blob.vercel-storage.com/${pathname}` };
  },
}));

const { db } = await import("@/db");
const { events, eventTeams, teams } = await import("@/db/schema");
const { applyBundleLogos } = await import("@/features/sync/team-logos");

const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

beforeEach(async () => {
  await truncateAll(db);
  puts.length = 0;
});

describe("applyBundleLogos", () => {
  it("copies a badge to the crestless team the platform named, and leaves the rest", async () => {
    const [event] = await db
      .insert(events)
      .values({
        slug: "wpl-test",
        title: "WPL",
        kind: "league",
        modules: [],
        status: "published",
        visibility: "public",
        locationType: "in_person",
        timezone: "America/Los_Angeles",
        startsAt: new Date("2026-09-12T16:00:00Z"),
      })
      .returning({ id: events.id });
    const [bare, crested] = await db
      .insert(teams)
      .values([
        { name: "RMG Panthers B15", slug: "rmg-panthers-b15", visibility: "public" },
        { name: "Legends FC B15", slug: "legends-fc-b15", visibility: "public", crestUrl: "https://own/crest.png" },
      ])
      .returning({ id: teams.id });
    await db.insert(eventTeams).values([
      { eventId: event.id, teamId: bare.id, sourceName: "RMG Soccer Academy Panthers B15" },
      { eventId: event.id, teamId: crested.id, sourceName: "Legends FC Washington WA B15/16 Gold" },
    ]);

    const report = await applyBundleLogos(
      event.id,
      new Map([
        ["RMG Soccer Academy Panthers B15", PNG],
        ["Legends FC Washington WA B15/16 Gold", PNG],
        ["Nobody FC B15", PNG],
        ["Mukilteo Youth SC FC B15/16 Navy", "data:image/svg+xml;base64,PHN2Zz4="],
      ]),
    );

    expect(report).toEqual({ set: 1, kept: 1, unmatched: 2, refused: 0 });
    expect(puts).toEqual([{ pathname: "crests/rmg-panthers-b15/badge.png", bytes: 4, type: "image/png" }]);
    const rows = await db.select({ slug: teams.slug, crestUrl: teams.crestUrl }).from(teams).orderBy(teams.slug);
    expect(rows).toEqual([
      { slug: "legends-fc-b15", crestUrl: "https://own/crest.png" },
      { slug: "rmg-panthers-b15", crestUrl: "https://test.public.blob.vercel-storage.com/crests/rmg-panthers-b15/badge.png" },
    ]);
  });
});
