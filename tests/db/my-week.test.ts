/**
 * One person's week, against a real Postgres.
 *
 * Three sources meet in one grid — what they run, what they RSVP'd to, and
 * their followed teams' games — and the first cut only had the first. What
 * the database has to say: each source lands, the window holds, and running
 * something outranks going to it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventAttendees, events, matches, teamFollows, teams, users } =
  await import("@/db/schema");
const { myWeek } = await import("@/features/events/my-week");

const at = (iso: string) => new Date(iso);
const MONDAY = "2026-09-07";

let me: string;
let coach: string;

beforeEach(async () => {
  await truncateAll(db);
  const made = await db
    .insert(users)
    .values([{ email: "me@example.com" }, { email: "coach@example.com" }])
    .returning({ id: users.id, email: users.email });
  me = made.find((u) => u.email === "me@example.com")!.id;
  coach = made.find((u) => u.email === "coach@example.com")!.id;
});

async function event(
  over: Partial<typeof events.$inferInsert> & { slug: string },
) {
  const [row] = await db
    .insert(events)
    .values({
      title: over.slug,
      kind: "training",
      status: "published",
      modules: ["attendance"],
      startsAt: at("2026-09-13T21:30:00Z"),
      endsAt: at("2026-09-13T22:30:00Z"),
      organizerId: coach,
      ...over,
    })
    .returning({ id: events.id });
  return row.id;
}

describe("myWeek", () => {
  it("shows what you RSVP'd to, with what you said", async () => {
    const id = await event({ slug: "ej-sunday" });
    await db
      .insert(eventAttendees)
      .values({ eventId: id, userId: me, status: "going" });
    const week = await myWeek(me, MONDAY);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({
      role: "attending",
      mine: "going",
      title: "ej-sunday",
    });
  });

  it("shows what you run, with the headcount, and running outranks going", async () => {
    const id = await event({ slug: "mine", organizerId: me, capacity: 4 });
    await db.insert(eventAttendees).values([
      { eventId: id, userId: me, status: "going" },
      { eventId: id, userId: coach, status: "going", guests: 1 },
    ]);
    const week = await myWeek(me, MONDAY);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ role: "organizer", going: 3, capacity: 4 });
  });

  it("shows a followed team's game as a fixture", async () => {
    const eventId = await event({ slug: "rcl", kind: "league", modules: [] });
    const [us, them] = await db
      .insert(teams)
      .values([
        { name: "Us", slug: "us", visibility: "public" },
        { name: "Them", slug: "them", visibility: "public" },
      ])
      .returning({ id: teams.id });
    await db.insert(teamFollows).values({ userId: me, teamId: us.id });
    await db.insert(matches).values({
      eventId,
      homeTeamId: us.id,
      awayTeamId: them.id,
      kickoffAt: at("2026-09-12T16:00:00Z"),
    });
    const week = await myWeek(me, MONDAY);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({
      role: "fixture",
      title: "Us v Them",
      endsAt: null,
    });
  });

  it("keeps to the week, in the zone", async () => {
    const inside = await event({
      slug: "sat-late",
      startsAt: at("2026-09-13T06:00:00Z"),
      endsAt: null,
    });
    const outside = await event({
      slug: "next-week",
      startsAt: at("2026-09-20T21:30:00Z"),
      endsAt: null,
    });
    await db.insert(eventAttendees).values([
      { eventId: inside, userId: me, status: "maybe" },
      { eventId: outside, userId: me, status: "going" },
    ]);
    const week = await myWeek(me, MONDAY);
    expect(week.map((w) => w.title)).toEqual(["sat-late"]);
    expect(week[0].mine).toBe("maybe");
  });
});
