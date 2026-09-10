/**
 * A fixture published before its grounds are booked, against a real Postgres.
 *
 * The league prints the day in a heading and leaves the time as "--" until
 * the fields are allocated. Wanting both threw the day away with the hour:
 * 3,549 of the Regional Club League's 4,275 fixtures arrived with no date at
 * all, and a team page listed seventeen of them in a row with nothing to say.
 */
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { events } = await import("@/db/schema");
const { applySync } = await import("@/features/sync/apply");
const { timeAnnounced } = await import("@/features/events/kickoff");

const PT = "America/Los_Angeles";
const NOW = new Date("2026-09-10T12:00:00Z");
let eventId: string;

const fixture = (over: { date: string | null; time: string | null }) => ({
  source: { platform: "sportsaffinity" as const, eventId: "x" },
  teams: [
    { sourceTeamId: "A", name: "Alpha", division: "U13", group: null },
    { sourceTeamId: "B", name: "Beta", division: "U13", group: null },
  ],
  matches: [
    {
      sourceMatchId: "1",
      division: "U13",
      group: null,
      homeTeamId: "A",
      awayTeamId: "B",
      homeName: "Alpha",
      awayName: "Beta",
      homeScore: null,
      awayScore: null,
      field: null,
      venue: null,
      ...over,
    },
  ],
});

const kickoff = async () =>
  (await db.query.matches.findFirst({ columns: { kickoffAt: true } }))!.kickoffAt;

beforeEach(async () => {
  await truncateAll(db);
  const [event] = await db
    .insert(events)
    .values({
      slug: "league",
      title: "A League",
      kind: "league",
      status: "published",
      timezone: PT,
      sourcePlatform: "sportsaffinity",
      sourceEventId: "x",
    })
    .returning({ id: events.id });
  eventId = event.id;
});

describe("a date with no time", () => {
  it("keeps the day, and says the time is not known", async () => {
    await applySync(eventId, fixture({ date: "2026-09-19", time: null }), NOW);
    const at = await kickoff();

    expect(at).not.toBeNull();
    // Midnight local, which is how this codebase has always said "no time":
    // timeAnnounced reads it back, and everything that prints a kick-off says
    // "time TBD" rather than "12:00 AM".
    expect(timeAnnounced(at, PT)).toBe(false);
    expect(
      new Intl.DateTimeFormat("en-CA", { timeZone: PT, dateStyle: "short" }).format(at!),
    ).toBe("2026-09-19");
  });

  it("still writes the time when there is one", async () => {
    await applySync(eventId, fixture({ date: "2026-09-19", time: "09:00" }), NOW);
    expect(timeAnnounced(await kickoff(), PT)).toBe(true);
  });

  it("has nothing to record when there is no date either", async () => {
    // A different fact, and one this must not invent a day for.
    await applySync(eventId, fixture({ date: null, time: null }), NOW);
    expect(await kickoff()).toBeNull();
  });
});

describe("the digest", () => {
  it("does not call a fetch unchanged when the writer has changed", async () => {
    /*
     * The digest is of what the platform published, which answers "has
     * anything changed over there" and not "would we write this differently
     * now". A fix to how a fetch becomes rows is invisible to it, so the same
     * fetch keeps returning "unchanged" and the fix never lands — which is
     * how a date-keeping fix would have left three and a half thousand
     * fixtures null forever.
     */
    const { contentHash } = await import("@/features/sync/apply");
    const data = fixture({ date: "2026-09-19", time: null });

    // Same fetch, same digest — that part still has to hold.
    expect(contentHash(data)).toBe(contentHash(fixture({ date: "2026-09-19", time: null })));
    // And the version is in it, so bumping it moves every event once.
    expect(contentHash(data)).not.toBe(
      createHash("sha256")
        .update(JSON.stringify({ teams: data.teams, matches: data.matches }))
        .digest("hex"),
    );
  });
});
