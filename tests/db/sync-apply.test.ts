/**
 * Writing a synced schedule into this application's own tables.
 *
 * Runs the real parser over a saved copy of a real Athletes2Events page and
 * feeds the result to the real write layer, so what is under test is the
 * whole path from somebody else's markup to the tables our schedule page
 * reads.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const {
  clubAliases,
  clubs,
  eventDivisions,
  eventKinds,
  eventTeams,
  events,
  matches,
  teamAliases,
  teams,
} = await import("@/db/schema");
const { applySync, contentHash, recordSyncFailure } = await import(
  "@/features/sync/apply"
);
const { parseFlightPage } = await import("@/features/sync/athletes2events");
const { eq } = await import("drizzle-orm");

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/athletes2events", name), "utf8");

/** The real ZF Labor Day Challenge flights, parsed. */
function syncedFromFixtures() {
  const a = parseFlightPage(fixture("flight-2029.html"));
  const b = parseFlightPage(fixture("flight-2027.html"));
  const teamsById = new Map(
    [...a.teams, ...b.teams].map((t) => [t.sourceTeamId, t] as const),
  );
  return {
    source: { platform: "athletes2events" as const, eventId: "130" },
    teams: [...teamsById.values()],
    matches: [...a.matches, ...b.matches],
  };
}

const NOW = new Date("2026-09-06T12:00:00Z");

async function makeListing() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "zf-labor-day-challenge",
      title: "Labor Day ZF Challenge",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-09-05T16:00:00Z"),
      endsAt: new Date("2026-09-08T06:59:00Z"),
      sourceName: "Crossfire Premier Soccer",
      sourceUrl: "https://www.crossfiresoccer.org/tournaments/ldc/",
      sourcePlatform: "athletes2events",
      sourceEventId: "130",
    })
    .returning({ id: events.id });
  return event.id;
}

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
});

describe("applying a sync", () => {
  it("creates the divisions, teams and matches the platform publishes", async () => {
    const eventId = await makeListing();
    const data = syncedFromFixtures();

    const out = await applySync(eventId, data, NOW);
    expect(out.unchanged).toBe(false);

    const divisions = await db.select().from(eventDivisions);
    const entries = await db.select().from(eventTeams);
    const games = await db.select().from(matches);

    expect(divisions.length).toBe(2); // Boys-U19 Gold, Boys-U17 Gold
    expect(entries.length).toBe(data.teams.length);
    expect(games.length).toBe(data.matches.length);
  });

  it("stores kick-off as an instant in the event's own timezone", async () => {
    // The page publishes a wall clock in Redmond. 09:05 on 5 September is
    // 16:05 UTC; storing it as 09:05 UTC would show every game seven hours
    // early.
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);

    const [game] = await db.select().from(matches).where(eq(matches.sourceMatchId, "377"));
    expect(game.kickoffAt?.toISOString()).toBe("2026-09-05T16:05:00.000Z");
  });

  it("carries scores through, and marks a played game final", async () => {
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);

    const [game] = await db.select().from(matches).where(eq(matches.sourceMatchId, "377"));
    expect([game.homeScore, game.awayScore]).toEqual([7, 0]);
    expect(game.status).toBe("final");
  });

  it("links both sides to real team rows, not placeholders", async () => {
    // The whole point is that our standings table can compute from these.
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);

    const [game] = await db.select().from(matches).where(eq(matches.sourceMatchId, "377"));
    expect(game.homeTeamId).not.toBeNull();
    expect(game.awayTeamId).not.toBeNull();
    expect(game.homePlaceholder).toBeNull();
  });

  it("makes the teams private, since nobody here has claimed them", async () => {
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);

    const rows = await db.select().from(teams);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.visibility === "private")).toBe(true);
    expect(rows.every((t) => t.originEventId === eventId)).toBe(true);
  });

  it("is idempotent: syncing twice changes nothing and writes nothing", async () => {
    const eventId = await makeListing();
    const data = syncedFromFixtures();

    await applySync(eventId, data, NOW);
    const before = await db.select().from(matches);

    const second = await applySync(eventId, data, new Date(NOW.getTime() + 60_000));
    expect(second.unchanged).toBe(true);

    const after = await db.select().from(matches);
    expect(after.length).toBe(before.length);
    expect(await db.select().from(teams)).toHaveLength(data.teams.length);
  });

  it("updates a score that changed rather than adding a second game", async () => {
    const eventId = await makeListing();
    const data = syncedFromFixtures();
    await applySync(eventId, data, NOW);

    const revised = {
      ...data,
      matches: data.matches.map((m) =>
        m.sourceMatchId === "377" ? { ...m, homeScore: 5, awayScore: 5 } : m,
      ),
    };
    await applySync(eventId, revised, new Date(NOW.getTime() + 60_000));

    const rows = await db.select().from(matches).where(eq(matches.sourceMatchId, "377"));
    expect(rows).toHaveLength(1);
    expect([rows[0].homeScore, rows[0].awayScore]).toEqual([5, 5]);
  });

  it("removes a fixture the platform has dropped", async () => {
    const eventId = await makeListing();
    const data = syncedFromFixtures();
    await applySync(eventId, data, NOW);

    const fewer = {
      ...data,
      matches: data.matches.filter((m) => m.sourceMatchId !== "377"),
    };
    const out = await applySync(eventId, fewer, new Date(NOW.getTime() + 60_000));

    expect(out.removed).toBe(1);
    expect(await db.select().from(matches).where(eq(matches.sourceMatchId, "377"))).toEqual(
      [],
    );
  });

  it("never touches a match somebody entered by hand", async () => {
    // An organizer who claims the event and starts running it here must not
    // have their own fixtures deleted by a connector that no longer sees them.
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);

    await db.insert(matches).values({
      eventId,
      stage: "ko",
      round: "final",
      homePlaceholder: "Winner Group A",
      awayPlaceholder: "Winner Group B",
      status: "scheduled",
    });

    await applySync(
      eventId,
      { ...syncedFromFixtures(), matches: [] },
      new Date(NOW.getTime() + 60_000),
    );

    const byHand = await db
      .select()
      .from(matches)
      .where(eq(matches.round, "final"));
    expect(byHand).toHaveLength(1);
  });

  it("schedules the next check and clears the last error", async () => {
    const eventId = await makeListing();
    await recordSyncFailure(eventId, "HTTP 503", NOW);
    expect(
      (await db.select().from(events).where(eq(events.id, eventId)))[0].lastSyncError,
    ).toBe("HTTP 503");

    await applySync(eventId, syncedFromFixtures(), NOW);
    const [row] = await db.select().from(events).where(eq(events.id, eventId));
    expect(row.lastSyncError).toBeNull();
    expect(row.lastSyncedAt).not.toBeNull();
    // Being played on this date, so the live cadence applies.
    expect(row.nextSyncAt!.getTime() - NOW.getTime()).toBe(20 * 60_000);
  });
});

describe("a failed sync", () => {
  it("leaves the schedule alone and keeps retrying", async () => {
    // A platform being briefly unreachable is the ordinary case. Wiping a
    // schedule because one fetch failed would be the worst possible reading
    // of "no data".
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), NOW);
    const before = await db.select().from(matches);

    await recordSyncFailure(eventId, "connect ETIMEDOUT", new Date(NOW.getTime() + 60_000));

    expect(await db.select().from(matches)).toHaveLength(before.length);
    const [row] = await db.select().from(events).where(eq(events.id, eventId));
    expect(row.lastSyncError).toContain("ETIMEDOUT");
    expect(row.nextSyncAt).not.toBeNull();
  });
});

describe("contentHash", () => {
  it("ignores the order a platform happens to return rows in", async () => {
    // Without this every poll looks like a change and rewrites the schedule.
    const data = syncedFromFixtures();
    const shuffled = {
      ...data,
      matches: [...data.matches].reverse(),
      teams: [...data.teams].reverse(),
    };
    expect(contentHash(shuffled)).toBe(contentHash(data));
  });

  it("notices a score that changed", async () => {
    const data = syncedFromFixtures();
    const revised = {
      ...data,
      matches: data.matches.map((m, i) => (i === 0 ? { ...m, homeScore: 99 } : m)),
    };
    expect(contentHash(revised)).not.toBe(contentHash(data));
  });
});

describe("what a synced team knows about itself", () => {
  /*
   * These used to arrive only from backfill scripts, so a team imported
   * after the last run had no club, no birth years and no gender — and the
   * duplicate finder, which matches on exactly those, had nothing to work
   * with for the newest rows. 173 teams were in that state in one day.
   */
  it("files the team under its club and reads its name as it writes the row", async () => {
    const [club] = await db
      .insert(clubs)
      .values({ slug: "crossfire-premier", name: "Crossfire Premier" })
      .returning({ id: clubs.id });
    // The alias the admin queue would have saved: no XF team is called
    // "Crossfire Premier", so nothing reaches the club without it.
    await db.insert(clubAliases).values({ alias: "xf", clubId: club.id });

    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), new Date());

    const xf = await db.query.teams.findFirst({
      where: eq(teams.name, "XF B09/10 ECNL 1"),
      columns: {
        clubId: true,
        affiliation: true,
        birthYears: true,
        gender: true,
        tier: true,
      },
    });
    expect(xf).toMatchObject({
      clubId: club.id,
      affiliation: "club",
      birthYears: [2009, 2010],
      gender: "boys",
      tier: "ECNL 1",
    });
  });

  it("derives the cohort from the age group and the event's season", async () => {
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), new Date());

    // A name with a U-number and no years of its own. The event starts in
    // September 2026, so U17 is 2009/2010 — and the same team's sibling row
    // "XF B09/10 ECNL 1" states those years outright, which is the check.
    const byAge = await db.query.teams.findFirst({
      where: eq(teams.name, "XF BU17 ECNL 2 - Heimbigner"),
      columns: { birthYears: true, gender: true, tier: true },
    });
    expect(byAge).toMatchObject({
      birthYears: [2009, 2010],
      gender: "boys",
      tier: "ECNL 2",
    });
  });

  it("leaves a team no club matches unfiled rather than guessing", async () => {
    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), new Date());

    const unplaced = await db.query.teams.findFirst({
      where: eq(teams.affiliation, "unknown"),
      columns: { clubId: true, affiliation: true },
    });
    expect(unplaced?.clubId).toBeNull();
  });
});

describe("a name an admin already bound", () => {
  it("lands on the existing team instead of making another", async () => {
    /*
     * The merge queue paying for itself. An admin folded this platform's
     * name into an existing team once; every import after that should reach
     * the same row rather than minting one for them to fold in again.
     */
    const [existing] = await db
      .insert(teams)
      .values({ slug: "xf-b0910-ecnl-1", name: "Crossfire B2009/10 ECNL I", visibility: "private" })
      .returning({ id: teams.id });
    await db
      .insert(teamAliases)
      .values({ alias: "xfb0910ecnl1", teamId: existing.id });

    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), new Date());

    // No second row under the platform's spelling.
    const minted = await db.query.teams.findMany({
      where: eq(teams.name, "XF B09/10 ECNL 1"),
      columns: { id: true },
    });
    expect(minted).toHaveLength(0);

    // And the event entry points at the team the admin chose.
    const entry = await db.query.eventTeams.findFirst({
      where: eq(eventTeams.teamId, existing.id),
      columns: { teamId: true, eventId: true, sourceTeamId: true },
    });
    expect(entry?.eventId).toBe(eventId);
    expect(entry?.sourceTeamId).toBeTruthy();
  });

  it("still carries the team's fixtures", async () => {
    const [existing] = await db
      .insert(teams)
      .values({ slug: "kept", name: "Kept Team", visibility: "private" })
      .returning({ id: teams.id });
    await db.insert(teamAliases).values({ alias: "xfb0910ecnl1", teamId: existing.id });

    const eventId = await makeListing();
    await applySync(eventId, syncedFromFixtures(), new Date());

    const played = await db.query.matches.findMany({
      where: eq(matches.eventId, eventId),
      columns: { homeTeamId: true, awayTeamId: true },
    });
    const ids = new Set(played.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    expect(ids.has(existing.id)).toBe(true);
  });
});
