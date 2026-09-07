/**
 * What the team directory lists, against a real Postgres.
 *
 * The rule it encodes is the whole reason the page existed and showed
 * nothing: teams.visibility means both "keep out of the directory" and
 * "members only", and only one of those should hide a team from here. Getting
 * it wrong in either direction is invisible in a unit test and obvious to a
 * user — an empty directory, or somebody's private team on a public page.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { clubs, eventKinds, events, teams } = await import("@/db/schema");
const { listTeams, teamCounts } = await import("@/features/teams/queries");

let eventId: string;

async function makeTeam(over: {
  slug: string;
  name: string;
  visibility?: "public" | "private";
  fromEvent?: boolean;
  city?: string;
  clubId?: string;
}) {
  const [t] = await db
    .insert(teams)
    .values({
      slug: over.slug,
      name: over.name,
      city: over.city ?? null,
      visibility: over.visibility ?? "private",
      originEventId: over.fromEvent === false ? null : eventId,
      ...(over.clubId
        ? { clubId: over.clubId, affiliation: "club" as const }
        : {}),
    })
    .returning({ id: teams.id });
  return t.id;
}

const names = async (filter = {}) =>
  (await listTeams(filter)).rows.map((t) => t.name);

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(teams);
  await db.delete(clubs);
  await db.delete(events);
  const [e] = await db
    .insert(events)
    .values({
      slug: "labor-day-cup",
      title: "Labor Day Cup",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
    })
    .returning({ id: events.id });
  eventId = e.id;
});

describe("who is listed", () => {
  it("lists a team a tournament schedule created", async () => {
    /*
     * The regression that made this page useless: every imported team is
     * 'private', so the directory filtered all 966 of them out and said "No
     * public teams yet" while linking to them from public standings.
     */
    await makeTeam({ slug: "xf-bu14", name: "XF BU14" });
    expect(await names()).toEqual(["XF BU14"]);
  });

  it("keeps out a team somebody created and marked private", async () => {
    // That one was a promise: "only people you invite will see it".
    await makeTeam({
      slug: "secret-side",
      name: "Secret Side",
      visibility: "private",
      fromEvent: false,
    });
    expect(await names()).toEqual([]);
  });

  it("lists a team somebody created and made public", async () => {
    await makeTeam({
      slug: "marymoor-united",
      name: "Marymoor United",
      visibility: "public",
      fromEvent: false,
    });
    expect(await names()).toEqual(["Marymoor United"]);
  });
});

describe("searching", () => {
  beforeEach(async () => {
    await makeTeam({ slug: "xf-bu14", name: "XF BU14", city: "Redmond" });
    await makeTeam({ slug: "celtic-b12", name: "Seattle Celtic B12", city: "Seattle" });
  });

  it("matches on name and on city", async () => {
    expect(await names({ q: "celtic" })).toEqual(["Seattle Celtic B12"]);
    expect(await names({ q: "redmond" })).toEqual(["XF BU14"]);
  });

  it("treats a wildcard as text, not as a wildcard", async () => {
    // % unescaped would match everything and look like a working search.
    expect(await names({ q: "%" })).toEqual([]);
  });

  it("ignores an all-whitespace search rather than matching nothing", async () => {
    expect((await names({ q: "   " })).length).toBe(2);
  });
});

describe("the categories", () => {
  it("splits club teams from teams with no club", async () => {
    const [club] = await db
      .insert(clubs)
      .values({ slug: "crossfire-premier", name: "Crossfire Premier" })
      .returning({ id: clubs.id });
    await makeTeam({ slug: "xf-bu14", name: "XF BU14", clubId: club.id });
    await makeTeam({ slug: "unplaced", name: "Unplaced Team" });
    await db.insert(teams).values({
      slug: "kjc-side",
      name: "King Juan Cup side",
      visibility: "private",
      originEventId: eventId,
      affiliation: "independent",
    });

    expect(await names({ affiliation: "club" })).toEqual(["XF BU14"]);
    expect(await names({ affiliation: "independent" })).toEqual([
      "King Juan Cup side",
    ]);
    // A team nobody has placed is in neither category but still in the
    // directory, which is why "All" has to be the default.
    expect((await names()).length).toBe(3);
    expect(await teamCounts()).toEqual({ all: 3, club: 1, independent: 1 });
  });

  it("counts within the search, not across the whole directory", async () => {
    /*
     * A chip reading "All 939" beside two results describes a page nobody is
     * looking at, and reads as if clicking it would keep the search.
     */
    const [club] = await db
      .insert(clubs)
      .values({ slug: "crossfire-premier", name: "Crossfire Premier" })
      .returning({ id: clubs.id });
    await makeTeam({ slug: "xf-bu14", name: "XF BU14", clubId: club.id });
    await makeTeam({ slug: "celtic-b12", name: "Seattle Celtic B12" });

    expect(await teamCounts("celtic")).toEqual({ all: 1, club: 0, independent: 0 });
    expect(await teamCounts()).toEqual({ all: 2, club: 1, independent: 0 });
  });

  it("ignores a category it does not have", async () => {
    await makeTeam({ slug: "xf-bu14", name: "XF BU14" });
    expect(await names({ affiliation: "nonsense" })).toEqual(["XF BU14"]);
  });
});

describe("paging", () => {
  it("counts the whole result, not the page", async () => {
    for (let i = 0; i < 5; i++) {
      await makeTeam({ slug: `team-${i}`, name: `Team ${i}` });
    }
    const page = await listTeams({ window: { limit: 2, offset: 0 } });
    expect(page.rows).toHaveLength(2);
    // The pager sizes itself from this; a page-sized total means one page.
    expect(page.total).toBe(5);
  });
});
