/**
 * What the team directory lists, against a real Postgres.
 *
 * One rule now: a team is listed unless somebody chose to hide it. It used to
 * be two, because teams.visibility meant both "keep out of the directory" and
 * "members only" — imported teams were written 'private' meaning the first,
 * and the page filtered all 966 of them out while linking to them from public
 * standings. Teams are created listed instead, so getting this wrong now
 * means somebody's private team on a public page, and nothing else.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { clubs, eventKinds, events, teams } = await import("@/db/schema");
const { listTeams, pinnedClubs, teamCounts } = await import(
  "@/features/teams/queries"
);

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
      // Listed, which is what every team-creating path now writes.
      visibility: over.visibility ?? "public",
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
     * The regression that made this page useless: every imported team was
     * written 'private', so the directory filtered all 966 of them out and
     * said "No public teams yet" while linking to them from public standings.
     */
    await makeTeam({ slug: "xf-bu14", name: "XF BU14" });
    expect(await names()).toEqual(["XF BU14"]);
  });

  it("keeps out a private team, however it was created", async () => {
    // "Only people you invite will see it" is a promise on the create form,
    // and the same promise when the owner of an imported team makes it.
    await makeTeam({
      slug: "secret-side",
      name: "Secret Side",
      visibility: "private",
      fromEvent: false,
    });
    await makeTeam({
      slug: "hidden-import",
      name: "Hidden Import",
      visibility: "private",
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
      visibility: "public",
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

    expect(await teamCounts({ q: "celtic" })).toEqual({ all: 1, club: 0, independent: 0 });
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

describe("finding a team by its club", () => {
  let crossfire: string;

  beforeEach(async () => {
    const [c] = await db
      .insert(clubs)
      .values({ slug: "crossfire-premier", name: "Crossfire Premier", pinned: true })
      .returning({ id: clubs.id });
    crossfire = c.id;
    await makeTeam({ slug: "xf-bu14", name: "XF BU14", clubId: crossfire });
    await makeTeam({ slug: "celtic-b12", name: "Seattle Celtic B12" });
  });

  it("searches the club's name, not only the team's", () => {
    /*
     * "Crossfire" is what somebody types, and no Crossfire team is called
     * that — they are "XF, U14, B12 - 13, RCL 1, Plackov". A search box
     * offering to find teams by club has to actually look there.
     */
    return expect(names({ q: "crossfire" })).resolves.toEqual(["XF BU14"]);
  });

  it("filters to one club by slug, for the chips", async () => {
    expect(await names({ club: "crossfire-premier" })).toEqual(["XF BU14"]);
    expect(await names({ club: "seattle-united" })).toEqual([]);
  });

  it("counts the categories within the club filter too", async () => {
    expect(await teamCounts({ club: "crossfire-premier" })).toEqual({
      all: 1,
      club: 1,
      independent: 0,
    });
  });

  it("offers only pinned clubs as chips", async () => {
    await db
      .insert(clubs)
      .values({ slug: "valor-soccer", name: "Valor Soccer", pinned: false });
    expect((await pinnedClubs()).map((c) => c.name)).toEqual(["Crossfire Premier"]);
  });
});

describe("the order teams come back in", () => {
  it("leads with pinned clubs, then any club, then the rest", async () => {
    /*
     * 966 rows alphabetical opens on "2015 Spuraways" and "90+ B17-18
     * Valdez", which tells a stranger nothing about whether this site knows
     * their league. The names here are chosen so alphabetical order would be
     * the exact reverse of the right one.
     */
    const [pinnedClub] = await db
      .insert(clubs)
      .values({ slug: "crossfire-premier", name: "Crossfire Premier", pinned: true })
      .returning({ id: clubs.id });
    const [plainClub] = await db
      .insert(clubs)
      .values({ slug: "valor-soccer", name: "Valor Soccer", pinned: false })
      .returning({ id: clubs.id });

    await makeTeam({ slug: "aaa", name: "AAA Unplaced" });
    await makeTeam({ slug: "mmm", name: "MMM Valor", clubId: plainClub.id });
    await makeTeam({ slug: "zzz", name: "ZZZ Crossfire", clubId: pinnedClub.id });

    expect(await names()).toEqual(["ZZZ Crossfire", "MMM Valor", "AAA Unplaced"]);
  });

  it("stays alphabetical inside a band, so a page link keeps its meaning", async () => {
    await makeTeam({ slug: "b", name: "Bravo" });
    await makeTeam({ slug: "a", name: "Alpha" });
    expect(await names()).toEqual(["Alpha", "Bravo"]);
  });
});
