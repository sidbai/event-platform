/**
 * The event query layer, against a real Postgres.
 *
 * These exist because of a bug that shipped past everything else: the
 * upcoming/past filter compared against a raw sql`` fragment and passed a JS
 * Date into it. It built, it typechecked, it linted, and all 363 unit tests
 * passed — and it threw the moment a driver saw it, taking the home feed down.
 *
 * Nothing pure could have caught that. Only a query reaching an actual server
 * can.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

// Imported after the URL is in place: src/db reads DATABASE_URL when the
// module is first evaluated.
const { db } = await import("@/db");
const { eventKinds, events, venues } = await import("@/db/schema");
const { listEvents, listEventsByTime } = await import("@/features/events/queries");

const NOW = new Date();
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

async function makeEvent(over: {
  slug: string;
  title: string;
  kind?: string;
  startsAt: Date | null;
  endsAt?: Date | null;
}) {
  await db.insert(events).values({
    slug: over.slug,
    title: over.title,
    kind: over.kind ?? "league",
    modules: [],
    status: "published",
    visibility: "public",
    locationType: "in_person",
    timezone: "America/Los_Angeles",
    startsAt: over.startsAt,
    endsAt: over.endsAt ?? null,
  });
}

beforeAll(async () => {
  await truncateAll(db);
  // events.kind is a foreign key into event_kinds, which a freshly migrated
  // database has none of — the rows are seeded, not part of the schema. Only
  // the kinds these tests name, so a missing one fails loudly here rather than
  // silently widening what the suite covers.
  await db
    .insert(eventKinds)
    .values([
      { slug: "league", label: "League", sort: 1 },
      { slug: "tournament", label: "Tournament", sort: 2 },
      { slug: "pickup", label: "Pickup", sort: 3 },
    ])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(events);
  await db.delete(venues);
});

describe("listEvents time filters", () => {
  it("runs at all", async () => {
    // The regression itself. A Date passed into a raw sql`` fragment has no
    // column to infer a type mapper from, so it reached the driver
    // unserialised and threw ERR_INVALID_ARG_TYPE. Anything that gets a row
    // list back rather than an exception would have caught it.
    await expect(listEvents({ when: "upcoming" })).resolves.toBeInstanceOf(Array);
    await expect(listEvents({ when: "past" })).resolves.toBeInstanceOf(Array);
    await expect(listEvents({ when: "weekend" })).resolves.toBeInstanceOf(Array);
    await expect(listEvents({})).resolves.toBeInstanceOf(Array);
  });

  it("keeps a season that is being played in upcoming, not past", async () => {
    // A league that kicked off last month and runs for another five is the
    // case the filter exists for.
    await makeEvent({
      slug: "season-underway",
      title: "Season underway",
      startsAt: days(-30),
      endsAt: days(150),
    });

    const upcoming = await listEvents({ when: "upcoming" });
    const past = await listEvents({ when: "past" });
    expect(upcoming.map((e) => e.slug)).toContain("season-underway");
    expect(past.map((e) => e.slug)).not.toContain("season-underway");
  });

  it("moves a finished season to past", async () => {
    await makeEvent({
      slug: "season-over",
      title: "Season over",
      startsAt: days(-300),
      endsAt: days(-10),
    });

    expect((await listEvents({ when: "past" })).map((e) => e.slug)).toContain(
      "season-over",
    );
    expect((await listEvents({ when: "upcoming" })).map((e) => e.slug)).not.toContain(
      "season-over",
    );
  });

  it("falls back to the start date for a one-day event", async () => {
    await makeEvent({
      slug: "yesterday",
      title: "Yesterday",
      kind: "pickup",
      startsAt: days(-1),
    });
    await makeEvent({
      slug: "tomorrow",
      title: "Tomorrow",
      kind: "pickup",
      startsAt: days(1),
    });

    expect((await listEvents({ when: "past" })).map((e) => e.slug)).toEqual(["yesterday"]);
    expect((await listEvents({ when: "upcoming" })).map((e) => e.slug)).toEqual([
      "tomorrow",
    ]);
  });
});

describe("listEventsByTime", () => {
  it("splits the same way the events page renders it", async () => {
    await makeEvent({
      slug: "running-league",
      title: "Running league",
      startsAt: days(-20),
      endsAt: days(90),
    });
    await makeEvent({
      slug: "old-cup",
      title: "Old cup",
      kind: "tournament",
      startsAt: days(-40),
      endsAt: days(-38),
    });

    const { ongoing, upcoming, past, total } = await listEventsByTime();
    expect(total).toBe(2);
    // Started twenty days ago and runs for another ninety: being played, not
    // something to plan for.
    expect(ongoing.map((e) => e.slug)).toEqual(["running-league"]);
    expect(upcoming.map((e) => e.slug)).toEqual([]);
    expect(past.map((e) => e.slug)).toEqual(["old-cup"]);
  });

  it("treats an event with no date as still to come", async () => {
    await makeEvent({ slug: "date-tbd", title: "Date TBD", startsAt: null });
    const { upcoming } = await listEventsByTime();
    expect(upcoming.map((e) => e.slug)).toContain("date-tbd");
  });
});
