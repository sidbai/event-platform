/**
 * Importing the same schedule twice.
 *
 * The whole point of a saved file is that it can be imported again — after a
 * refusal, after a correction, or because somebody was not sure it worked the
 * first time. Every one of those is a second run over the same rows, and the
 * failure they are afraid of is a fixture list with everything in it twice.
 *
 * The design says it cannot happen: a pasted fixture carries a synthetic id
 * made of division, date and the two teams, and the writer updates the row
 * that id already names. This is the test that says so too.
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
const { eventDivisions, eventKinds, eventTeams, events, matches, teams } =
  await import("@/db/schema");
const { applySync } = await import("@/features/sync/apply");
const { parsePastedSchedule, toSyncedEvent } = await import("@/features/sync/paste");

const HEAD = [
  "date", "time", "slot", "division",
  "home", "home_score", "away_score", "away", "field", "venue",
].join("\t");

const game = (
  division: string,
  home: string,
  away: string,
  score = "2\t1",
  time = "09:10 AM",
) =>
  `Aug 21, 2026\t${time}\t\t${division}\t${home}\t${score}\t${away}\tField 1\tStarfire`;

/** One flight, as a saved file holds it. */
const FLIGHT_A = [
  HEAD,
  game("GU08 - GU8 Red", "Alpha FC", "Bravo FC"),
  game("GU08 - GU8 Red", "Charlie FC", "Delta FC"),
].join("\n");

const FLIGHT_B = [
  HEAD,
  game("BU12 - BU12 Grey", "Echo FC", "Foxtrot FC"),
].join("\n");

const NOW = new Date("2026-08-25T12:00:00Z");

async function paste(eventId: string, text: string) {
  const { matches: rows } = parsePastedSchedule(text, {
    division: "Unassigned",
    year: 2026,
  });
  return applySync(eventId, toSyncedEvent(rows), NOW, { prune: false });
}

async function counts() {
  return {
    matches: (await db.select().from(matches)).length,
    teams: (await db.select().from(teams)).length,
    divisions: (await db.select().from(eventDivisions)).length,
    entries: (await db.select().from(eventTeams)).length,
  };
}

async function makeEvent() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "import-twice",
      title: "Import Twice Cup",
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

describe("importing the same file twice", () => {
  it("changes nothing the second time", async () => {
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);
    const first = await counts();

    await paste(eventId, FLIGHT_A);

    expect(await counts()).toEqual(first);
    expect(first.matches).toBe(2);
    expect(first.teams).toBe(4);
  });

  it("does not double the teams either", async () => {
    // The other half of the fear: four clubs becoming twelve, which the
    // directory would then offer somebody to merge back by hand.
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);
    await paste(eventId, FLIGHT_A);
    await paste(eventId, FLIGHT_A);

    const names = (await db.select().from(teams)).map((t) => t.name).sort();
    expect(names).toEqual(["Alpha FC", "Bravo FC", "Charlie FC", "Delta FC"]);
  });
});

describe("importing the rest of the collection", () => {
  it("adds the second flight without touching the first", async () => {
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);
    await paste(eventId, FLIGHT_B);

    const all = await counts();
    expect(all.matches).toBe(3);
    expect(all.divisions).toBe(2);
    expect(all.teams).toBe(6);
  });

  it("survives the files being imported in one go afterwards", async () => {
    /*
     * What somebody does when they are not sure the first attempts worked:
     * select every file and import the lot. It has to land on the same
     * fixtures rather than beside them.
     */
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);
    await paste(eventId, FLIGHT_B);
    const separate = await counts();

    await paste(eventId, [FLIGHT_A, FLIGHT_B.split("\n").slice(1).join("\n")].join("\n"));

    expect(await counts()).toEqual(separate);
  });

  it("leaves the flights it does not mention alone", async () => {
    /*
     * A paste is never pruned, and this is why: somebody importing flight B
     * has not cancelled flight A. A connector sees a whole event each time
     * and may remove what vanished; a person with one file has said nothing
     * about the rest.
     */
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);
    await paste(eventId, FLIGHT_B);

    // Re-import only the first flight, as somebody fixing one score would.
    await paste(eventId, FLIGHT_A);

    expect((await db.select().from(matches)).length).toBe(3);
  });
});

describe("importing a corrected file", () => {
  it("updates the score in place", async () => {
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);

    const corrected = [
      HEAD,
      game("GU08 - GU8 Red", "Alpha FC", "Bravo FC", "5\t0"),
      game("GU08 - GU8 Red", "Charlie FC", "Delta FC"),
    ].join("\n");
    await paste(eventId, corrected);

    const rows = await db.select().from(matches);
    expect(rows).toHaveLength(2);
    const alpha = rows.find((m) => m.homeScore === 5);
    expect(alpha?.awayScore).toBe(0);
  });

  it("treats a moved kick-off as the same fixture", async () => {
    // The synthetic id leaves the time out on purpose: a game pushed an hour
    // is the same game, and re-keying it would leave the old row behind.
    const eventId = await makeEvent();
    await paste(eventId, FLIGHT_A);

    const moved = [
      HEAD,
      game("GU08 - GU8 Red", "Alpha FC", "Bravo FC", "2\t1", "04:30 PM"),
      game("GU08 - GU8 Red", "Charlie FC", "Delta FC"),
    ].join("\n");
    await paste(eventId, moved);

    expect((await db.select().from(matches)).length).toBe(2);
  });
});
