/**
 * A coach's slots and a parent's bookings, against a real Postgres.
 *
 * Three things only the database can say: whether the week window catches a
 * late-Saturday slot that is Sunday in UTC, whether the unique key really
 * stops a double submit, and whether "only confirmed" reaches the calendar
 * and nothing else does.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { sessionBookings, trainingSessions, users } = await import("@/db/schema");
const { calendarSessions, coachWeek, myBookings, requestsWaitingFor, upcomingSlots } =
  await import("@/features/training/queries");

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-10T12:00:00Z");

let ej: string;
let hu: string;

beforeEach(async () => {
  await truncateAll(db);
  const made = await db
    .insert(users)
    .values([
      { email: "ej@example.com", coachName: "EJ — EJ Futball Training" },
      { email: "hu@example.com" },
    ])
    .returning({ id: users.id, email: users.email });
  ej = made.find((u) => u.email === "ej@example.com")!.id;
  hu = made.find((u) => u.email === "hu@example.com")!.id;
});

async function slot(over: Partial<typeof trainingSessions.$inferInsert> = {}) {
  const [row] = await db
    .insert(trainingSessions)
    .values({
      coachId: ej,
      startsAt: at("2026-09-13T21:30:00Z"), // Sun 2:30 pm Pacific
      endsAt: at("2026-09-13T22:30:00Z"),
      location: "Evergreen Playfield",
      capacity: 1,
      ...over,
    })
    .returning({ id: trainingSessions.id });
  return row.id;
}

describe("coachWeek", () => {
  it("keeps a late Saturday slot in Saturday's week, though it is Sunday in UTC", async () => {
    // 11 pm Saturday Pacific = 06:00 Sunday UTC.
    await slot({ startsAt: at("2026-09-13T06:00:00Z"), endsAt: at("2026-09-13T07:00:00Z") });
    const rows = await coachWeek(ej, "2026-09-07");
    expect(rows).toHaveLength(1);
    expect(rows[0].coachName).toBe("EJ — EJ Futball Training");
  });

  it("is only this coach's, cancelled ones included", async () => {
    await slot();
    await slot({ cancelledAt: NOW });
    const [other] = await db
      .insert(users)
      .values({ email: "other@example.com", coachName: "Other" })
      .returning({ id: users.id });
    await slot({ coachId: other.id });
    expect(await coachWeek(ej, "2026-09-07")).toHaveLength(2);
  });
});

describe("upcomingSlots", () => {
  it("shows what anybody can book: live, upcoming, with its bookings", async () => {
    const live = await slot();
    await slot({ cancelledAt: NOW });
    await slot({ startsAt: at("2026-09-01T21:30:00Z"), endsAt: at("2026-09-01T22:30:00Z") });
    await db.insert(sessionBookings).values({ sessionId: live, bookedBy: hu, playerName: "Joshua" });

    const rows = await upcomingSlots(NOW);
    expect(rows.map((r) => r.id)).toEqual([live]);
    expect(rows[0].bookings).toHaveLength(1);
  });
});

describe("a booking", () => {
  it("is one row per player per parent per slot, whatever the form does", async () => {
    const id = await slot({ capacity: 4 });
    const twice = () =>
      db
        .insert(sessionBookings)
        .values({ sessionId: id, bookedBy: hu, playerName: "Joshua" })
        .onConflictDoNothing();
    await twice();
    await twice();
    await db.insert(sessionBookings).values({ sessionId: id, bookedBy: hu, playerName: "Ava" });
    expect(await db.select().from(sessionBookings)).toHaveLength(2);
  });

  it("waits for the coach, and stops waiting once the slot has started", async () => {
    const soon = await slot();
    const gone = await slot({ startsAt: at("2026-09-01T21:30:00Z"), endsAt: at("2026-09-01T22:30:00Z") });
    await db.insert(sessionBookings).values([
      { sessionId: soon, bookedBy: hu, playerName: "Joshua" },
      { sessionId: gone, bookedBy: hu, playerName: "Joshua" },
    ]);
    const waiting = await requestsWaitingFor(ej, NOW);
    expect(waiting.map((w) => w.sessionId)).toEqual([soon]);
  });
});

describe("calendarSessions", () => {
  it("gives the coach every live slot and the parent only what was confirmed", async () => {
    const yes = await slot();
    const asked = await slot({ startsAt: at("2026-09-13T22:30:00Z"), endsAt: at("2026-09-13T23:30:00Z") });
    await db.insert(sessionBookings).values([
      { sessionId: yes, bookedBy: hu, playerName: "Joshua", status: "confirmed" },
      { sessionId: asked, bookedBy: hu, playerName: "Joshua", status: "requested" },
    ]);

    const coach = await calendarSessions(ej, NOW);
    expect(coach.coaching.map((s) => s.id).sort()).toEqual([yes, asked].sort());
    expect(coach.booked).toEqual([]);

    const parent = await calendarSessions(hu, NOW);
    expect(parent.coaching).toEqual([]);
    expect(parent.booked.map((b) => b.sessionId)).toEqual([yes]);
    expect(parent.booked[0].coachName).toBe("EJ — EJ Futball Training");
  });

  it("drops a cancelled slot from both calendars", async () => {
    const id = await slot({ cancelledAt: NOW });
    await db.insert(sessionBookings).values({ sessionId: id, bookedBy: hu, playerName: "Joshua", status: "confirmed" });
    expect((await calendarSessions(ej, NOW)).coaching).toEqual([]);
    expect((await calendarSessions(hu, NOW)).booked).toEqual([]);
  });
});

describe("myBookings", () => {
  it("lists what is still live, requested or confirmed, and not the noes", async () => {
    const id = await slot({ capacity: 3 });
    await db.insert(sessionBookings).values([
      { sessionId: id, bookedBy: hu, playerName: "Joshua", status: "confirmed" },
      { sessionId: id, bookedBy: hu, playerName: "Ava", status: "requested" },
      { sessionId: id, bookedBy: hu, playerName: "Max", status: "declined" },
    ]);
    const mine = await myBookings(hu, NOW);
    expect(mine.map((m) => m.playerName).sort()).toEqual(["Ava", "Joshua"]);
    expect(mine[0].coachName).toBe("EJ — EJ Futball Training");
  });
});
