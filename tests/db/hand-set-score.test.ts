/**
 * A score set here, against an import that does not have one.
 *
 * The case: a tournament's last game is the final, both teams walk off
 * knowing the result, and the organizer's platform is never updated. The
 * score we imported is blank and stays blank, so somebody fills it in — and
 * the next import must not write that nothing straight back over it.
 *
 * Silently, is the part that matters. Nothing would error; the only sign
 * would be a champion who had stopped being one.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { eventKinds, events, matches } = await import("@/db/schema");
const { applySync } = await import("@/features/sync/apply");
const { parsePastedSchedule, toSyncedEvent } = await import("@/features/sync/paste");
const { eq } = await import("drizzle-orm");

const HEAD = [
  "date", "time", "slot", "division",
  "home", "home_score", "away_score", "away", "field", "venue",
].join("\t");

/** The final, as the organizer publishes it: no score, and never updated. */
const unscored = (time = "02:10 PM") =>
  [
    HEAD,
    `Aug 24, 2026\t${time}\t\tGU08 Championships\tAlpha FC\t\t\tBravo FC\tField 1\tStarfire`,
  ].join("\n");

const NOW = new Date("2026-08-25T12:00:00Z");

async function paste(eventId: string, text: string) {
  const { matches: rows } = parsePastedSchedule(text, {
    division: "Unassigned",
    year: 2026,
  });
  return applySync(eventId, toSyncedEvent(rows), NOW, { prune: false });
}

async function makeEvent() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "final-not-posted",
      title: "Final Not Posted Cup",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-21T16:00:00Z"),
      endsAt: new Date("2026-08-25T06:59:00Z"),
    })
    .returning({ id: events.id });
  return event.id;
}

/** What an admin pressing Save does, without the form around it. */
async function setByHand(matchId: string, home: number, away: number) {
  await db
    .update(matches)
    .set({
      homeScore: home,
      awayScore: away,
      status: "final",
      scoreSetAt: new Date(),
    })
    .where(eq(matches.id, matchId));
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
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

describe("a score somebody filled in", () => {
  it("survives the next import", async () => {
    const eventId = await makeEvent();
    await paste(eventId, unscored());
    const [before] = await db.select().from(matches);
    expect(before.homeScore).toBeNull();

    await setByHand(before.id, 3, 1);
    await paste(eventId, unscored());

    const [after] = await db.select().from(matches);
    expect(after.homeScore).toBe(3);
    expect(after.awayScore).toBe(1);
    expect(after.status).toBe("final");
  });

  it("still lets the source move the kick-off and the field", async () => {
    // The score is ours; everything else about the fixture is still theirs.
    const eventId = await makeEvent();
    await paste(eventId, unscored());
    const [row] = await db.select().from(matches);
    await setByHand(row.id, 3, 1);

    const moved = [
      HEAD,
      "Aug 24, 2026\t04:45 PM\t\tGU08 Championships\tAlpha FC\t\t\tBravo FC\tField 9\tStarfire",
    ].join("\n");
    await paste(eventId, moved);

    const [after] = await db.select().from(matches);
    expect(after.homeScore).toBe(3);
    expect(after.field).toContain("Field 9");
  });

  it("goes back to the source once the mark is cleared", async () => {
    /*
     * The other direction: a correction made from the touchline, and then the
     * organizer posts the real thing. Releasing the fixture has to actually
     * hand it back, or a hand-set number wins forever and nobody can tell why
     * the page disagrees with the tournament's own site.
     */
    const eventId = await makeEvent();
    await paste(eventId, unscored());
    const [row] = await db.select().from(matches);
    await setByHand(row.id, 3, 1);

    await db
      .update(matches)
      .set({ scoreSetBy: null, scoreSetAt: null })
      .where(eq(matches.id, row.id));

    const published = [
      HEAD,
      "Aug 24, 2026\t02:10 PM\t\tGU08 Championships\tAlpha FC\t2\t2\tBravo FC\tField 1\tStarfire",
    ].join("\n");
    await paste(eventId, published);

    const [after] = await db.select().from(matches);
    expect(after.homeScore).toBe(2);
    expect(after.awayScore).toBe(2);
  });

  it("does not hold a fixture nobody has touched", async () => {
    // The default has to stay "the source decides", or every import would
    // stop updating scores the moment this shipped.
    const eventId = await makeEvent();
    await paste(eventId, unscored());

    const published = [
      HEAD,
      "Aug 24, 2026\t02:10 PM\t\tGU08 Championships\tAlpha FC\t4\t0\tBravo FC\tField 1\tStarfire",
    ].join("\n");
    await paste(eventId, published);

    const [after] = await db.select().from(matches);
    expect(after.homeScore).toBe(4);
  });
});
