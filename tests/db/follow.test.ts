/**
 * What a followed team's row says, against a real Postgres.
 *
 * Both of these are "the first row in an ordered set, per team", which is the
 * shape that silently returns the wrong row: an unscored fixture read as a
 * nil-nil, a fixture with no kick-off time sorted as though it had one.
 * Neither is visible without the database.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventTeams, events, matches, teams } = await import("@/db/schema");
const { lastResults, nextGames } = await import("@/features/teams/follow-queries");

let eventId: string;
let us: string;
let them: string;

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-10T12:00:00Z");

beforeEach(async () => {
  await truncateAll(db);
  const [event] = await db
    .insert(events)
    .values({ slug: "cup", title: "A Cup", kind: "tournament", status: "published" })
    .returning({ id: events.id });
  eventId = event.id;

  const made = await db
    .insert(teams)
    .values([
      { name: "Us", slug: "us", visibility: "public" },
      { name: "Them", slug: "them", visibility: "public" },
    ])
    .returning({ id: teams.id, slug: teams.slug });
  us = made.find((t) => t.slug === "us")!.id;
  them = made.find((t) => t.slug === "them")!.id;
  await db.insert(eventTeams).values([
    { eventId, teamId: us },
    { eventId, teamId: them },
  ]);
});

describe("nextGames", () => {
  it("takes the earliest still to come, not the earliest there is", async () => {
    await db.insert(matches).values([
      { eventId, homeTeamId: us, awayTeamId: them, kickoffAt: at("2026-09-01T16:00:00Z") },
      { eventId, homeTeamId: us, awayTeamId: them, kickoffAt: at("2026-09-20T16:00:00Z") },
      { eventId, homeTeamId: them, awayTeamId: us, kickoffAt: at("2026-09-13T16:00:00Z") },
    ]);

    const [game] = await nextGames([us], NOW);
    expect(game.kickoffAt).toEqual(at("2026-09-13T16:00:00Z"));
    expect(game.opponent?.name).toBe("Them");
    expect(game.eventTitle).toBe("A Cup");
  });

  it("does not treat a fixture with no time as the next one", async () => {
    /*
     * Most of a league's season is published before the fields are booked. A
     * row with no kick-off cannot be ordered against one that has it, and
     * sorting it first would answer "when do they next play" with a shrug.
     */
    await db.insert(matches).values([
      { eventId, homeTeamId: us, awayTeamId: them, kickoffAt: null },
      { eventId, homeTeamId: us, awayTeamId: them, kickoffAt: at("2026-09-20T16:00:00Z") },
    ]);

    const [game] = await nextGames([us], NOW);
    expect(game.kickoffAt).toEqual(at("2026-09-20T16:00:00Z"));
  });

  it("says nothing for a team with nothing coming", async () => {
    await db.insert(matches).values({
      eventId,
      homeTeamId: us,
      awayTeamId: them,
      kickoffAt: at("2026-09-01T16:00:00Z"),
    });
    expect(await nextGames([us], NOW)).toEqual([]);
  });
});

describe("lastResults", () => {
  it("reads the scoreline from the followed team's side", async () => {
    await db.insert(matches).values({
      eventId,
      homeTeamId: them,
      awayTeamId: us,
      homeScore: 1,
      awayScore: 4,
      kickoffAt: at("2026-09-05T16:00:00Z"),
    });

    const [result] = await lastResults([us], NOW);
    expect(result).toMatchObject({ outcome: "won", for: 4, against: 1 });
    expect(result.opponent?.name).toBe("Them");

    const [theirs] = await lastResults([them], NOW);
    expect(theirs).toMatchObject({ outcome: "lost", for: 1, against: 4 });
  });

  it("does not read a game nobody has scored as a nil-nil", async () => {
    // A fixture whose date has passed with no score is a game nobody has
    // entered yet — counting it would hand both sides a draw they never had.
    await db.insert(matches).values({
      eventId,
      homeTeamId: us,
      awayTeamId: them,
      kickoffAt: at("2026-09-08T16:00:00Z"),
    });
    expect(await lastResults([us], NOW)).toEqual([]);
  });

  it("takes the most recent scored game, past an unscored one after it", async () => {
    await db.insert(matches).values([
      {
        eventId,
        homeTeamId: us,
        awayTeamId: them,
        homeScore: 2,
        awayScore: 2,
        kickoffAt: at("2026-09-06T16:00:00Z"),
      },
      { eventId, homeTeamId: us, awayTeamId: them, kickoffAt: at("2026-09-08T16:00:00Z") },
    ]);

    const [result] = await lastResults([us], NOW);
    expect(result).toMatchObject({ outcome: "drawn", for: 2, against: 2 });
    expect(result.kickoffAt).toEqual(at("2026-09-06T16:00:00Z"));
  });
});
