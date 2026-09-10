/**
 * Refusing a read that would delete most of a schedule, against a real
 * Postgres.
 *
 * The failure this exists for: Imperva served the Regional Club League's boys
 * accepted-teams page as a challenge — 200, eighty kilobytes, no flights — the
 * connector read that as an age group with no teams, kept going with the girls
 * half, and applySync deleted 3,129 of 4,288 fixtures. Nothing errored, and
 * the admin screen said it had synced.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { events, matches, teams } = await import("@/db/schema");
const { applySync } = await import("@/features/sync/apply");
const { eq } = await import("drizzle-orm");

const NOW = new Date("2026-09-10T12:00:00Z");
let eventId: string;

/** What a connector hands over: n fixtures between two teams. */
const feed = (n: number, source: { platform: "sportsaffinity"; eventId: string }) => ({
  source,
  teams: [
    { sourceTeamId: "A", name: "Alpha", division: "U13", group: null },
    { sourceTeamId: "B", name: "Beta", division: "U13", group: null },
  ],
  matches: Array.from({ length: n }, (_, i) => ({
    sourceMatchId: String(i),
    division: "U13",
    group: null,
    date: "2026-09-12",
    time: "09:00",
    homeTeamId: "A",
    awayTeamId: "B",
    homeName: "Alpha",
    awayName: "Beta",
    homeScore: null,
    awayScore: null,
    field: null,
    venue: null,
  })),
});

const ref = { platform: "sportsaffinity" as const, eventId: "x" };
const held = () => db.$count(matches, eq(matches.eventId, eventId));

beforeEach(async () => {
  await truncateAll(db);
  const [event] = await db
    .insert(events)
    .values({
      slug: "league",
      title: "A League",
      kind: "league",
      status: "published",
      sourcePlatform: "sportsaffinity",
      sourceEventId: "x",
    })
    .returning({ id: events.id });
  eventId = event.id;
  await applySync(eventId, feed(40, ref), NOW);
  expect(await held()).toBe(40);
});

describe("applySync", () => {
  it("refuses a read that would take most of the schedule", async () => {
    // The shape of a page that did not arrive.
    await expect(applySync(eventId, feed(11, ref), NOW)).rejects.toThrow(/refusing to shrink/);
    expect(await held()).toBe(40);
  });

  it("still prunes an ordinary cancellation", async () => {
    // Losing a handful is a league doing its job, not a failed read.
    const outcome = await applySync(eventId, feed(35, ref), NOW);
    expect(outcome.removed).toBe(5);
    expect(await held()).toBe(35);
  });

  it("leaves a small event alone, where the shape says nothing", async () => {
    /*
     * A five-fixture friendly losing three is a real thing an organizer does,
     * and there is no signal in the proportion either way.
     */
    await truncateAll(db);
    const [event] = await db
      .insert(events)
      .values({
        slug: "friendly",
        title: "A Friendly",
        kind: "tournament",
        status: "published",
        sourcePlatform: "sportsaffinity",
        sourceEventId: "y",
      })
      .returning({ id: events.id });
    eventId = event.id;
    await applySync(eventId, feed(5, { platform: "sportsaffinity", eventId: "y" }), NOW);
    await applySync(eventId, feed(2, { platform: "sportsaffinity", eventId: "y" }), NOW);
    expect(await held()).toBe(2);
  });

  it("does not count fixtures a person entered here", async () => {
    /*
     * A match with no source id was entered by an organizer running the event
     * here. It is not the connector's to delete, so it must not be in what
     * the connector is measured against either.
     */
    const [t] = await db
      .insert(teams)
      .values({ name: "Theirs", slug: "theirs", visibility: "public" })
      .returning({ id: teams.id });
    await db.insert(matches).values(
      Array.from({ length: 30 }, () => ({ eventId, homeTeamId: t.id })),
    );
    // 40 synced + 30 by hand. A read of 25 is a shrink of the synced ones.
    await expect(applySync(eventId, feed(11, ref), NOW)).rejects.toThrow(/refusing to shrink/);
    // And the hand-entered ones are still there.
    expect(await held()).toBe(70);
  });
});
