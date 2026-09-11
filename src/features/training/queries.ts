import "server-only";

import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { sessionBookings, trainingSessions, users } from "@/db/schema";

import { addDays, zonedInstant } from "./week";

/**
 * Reads for the two calendars — the coach's and everybody else's.
 *
 * Every read here takes a window, because "all sessions" is a table scan
 * that grows with every Sunday, and the pages only ever ask about a week or
 * the next few. A slot's bookings come with it in one query rather than one
 * per slot: a coach's week is a few dozen slots, and a few dozen round trips
 * to draw a grid is how a page gets slow without anybody deciding it should.
 */

export type CoachProfile = {
  userId: string;
  name: string;
  blurb: string | null;
};

/**
 * Whether this person coaches, and under what name.
 *
 * A coach is a user with `coach_name` filled in — not a role, not a table.
 * Null for everybody else, which is most people.
 */
export async function coachProfile(userId: string): Promise<CoachProfile | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, coachName: true, coachBlurb: true },
  });
  if (!row?.coachName) return null;
  return { userId: row.id, name: row.coachName, blurb: row.coachBlurb };
}

export type SlotWithBookings = {
  id: string;
  coachId: string;
  coachName: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  capacity: number;
  birthYearFrom: number | null;
  birthYearTo: number | null;
  notes: string | null;
  cancelledAt: Date | null;
  bookings: {
    id: string;
    sessionId: string;
    bookedBy: string;
    playerName: string;
    playerBirthYear: number | null;
    note: string | null;
    status: "requested" | "confirmed" | "declined" | "cancelled";
    createdAt: Date;
  }[];
};

const SLOT_COLUMNS = {
  id: true,
  coachId: true,
  startsAt: true,
  endsAt: true,
  location: true,
  capacity: true,
  birthYearFrom: true,
  birthYearTo: true,
  notes: true,
  cancelledAt: true,
} as const;

const BOOKING_COLUMNS = {
  id: true,
  sessionId: true,
  bookedBy: true,
  playerName: true,
  playerBirthYear: true,
  note: true,
  status: true,
  createdAt: true,
} as const;

/**
 * A coach's own week, Monday to Sunday in the zone, cancelled slots included.
 *
 * Cancelled ones stay on the coach's grid, struck through, because the
 * coach is the one person for whom "I took that down" is information and
 * not clutter. The window is padded a day each side so a late Sunday slot
 * is not lost to the zone; `week()` drops what falls outside.
 */
export async function coachWeek(coachId: string, monday: string): Promise<SlotWithBookings[]> {
  const from = zonedInstant(addDays(monday, -1), "00:00");
  const to = zonedInstant(addDays(monday, 8), "00:00");
  const rows = await db.query.trainingSessions.findMany({
    where: and(
      eq(trainingSessions.coachId, coachId),
      gte(trainingSessions.startsAt, from),
      lt(trainingSessions.startsAt, to),
    ),
    columns: SLOT_COLUMNS,
    with: { coach: { columns: { coachName: true } }, bookings: { columns: BOOKING_COLUMNS } },
    orderBy: [asc(trainingSessions.startsAt)],
  });
  return rows.map(withCoachName);
}

/**
 * What anybody can book: upcoming, not cancelled, for the next `days`.
 *
 * A parent's page is "what is on this weekend", so this is short and
 * forward-looking. Nothing here is filtered by room left — a full slot is
 * shown as full, which tells a parent who was too late that they were, and
 * that the coach is worth asking about next week.
 */
export async function upcomingSlots(now: Date, days = 21): Promise<SlotWithBookings[]> {
  const to = new Date(now.getTime() + days * 24 * 3_600_000);
  const rows = await db.query.trainingSessions.findMany({
    where: and(
      isNull(trainingSessions.cancelledAt),
      gte(trainingSessions.endsAt, now),
      lt(trainingSessions.startsAt, to),
    ),
    columns: SLOT_COLUMNS,
    with: { coach: { columns: { coachName: true } }, bookings: { columns: BOOKING_COLUMNS } },
    orderBy: [asc(trainingSessions.startsAt)],
  });
  return rows.map(withCoachName);
}

export async function slotById(id: string): Promise<SlotWithBookings | null> {
  const row = await db.query.trainingSessions.findFirst({
    where: eq(trainingSessions.id, id),
    columns: SLOT_COLUMNS,
    with: { coach: { columns: { coachName: true } }, bookings: { columns: BOOKING_COLUMNS } },
  });
  return row ? withCoachName(row) : null;
}

/**
 * A parent's own bookings, requested or confirmed, from today on.
 *
 * Declined and cancelled ones are not listed: the answer was no, or they
 * took it back, and a list of every no is not what anybody opens their own
 * page to read.
 */
export async function myBookings(userId: string, now: Date) {
  const rows = await db
    .select({
      id: sessionBookings.id,
      status: sessionBookings.status,
      playerName: sessionBookings.playerName,
      sessionId: trainingSessions.id,
      startsAt: trainingSessions.startsAt,
      endsAt: trainingSessions.endsAt,
      location: trainingSessions.location,
      capacity: trainingSessions.capacity,
      cancelledAt: trainingSessions.cancelledAt,
      coachName: users.coachName,
    })
    .from(sessionBookings)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionBookings.sessionId))
    .innerJoin(users, eq(users.id, trainingSessions.coachId))
    .where(
      and(
        eq(sessionBookings.bookedBy, userId),
        inArray(sessionBookings.status, ["requested", "confirmed"]),
        gte(trainingSessions.endsAt, now),
      ),
    )
    .orderBy(asc(trainingSessions.startsAt));
  return rows;
}

/** Requests a coach has not answered, on slots that have not started. */
export async function requestsWaitingFor(coachId: string, now: Date) {
  return db
    .select({
      id: sessionBookings.id,
      playerName: sessionBookings.playerName,
      sessionId: trainingSessions.id,
      startsAt: trainingSessions.startsAt,
      location: trainingSessions.location,
    })
    .from(sessionBookings)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionBookings.sessionId))
    .where(
      and(
        eq(trainingSessions.coachId, coachId),
        eq(sessionBookings.status, "requested"),
        gte(trainingSessions.startsAt, now),
      ),
    )
    .orderBy(asc(trainingSessions.startsAt));
}

/**
 * Everything of this person's that belongs in their calendar feed.
 *
 * Two lists in one: the slots they coach (all live ones — a coach's own
 * calendar should show the open two o'clock as much as the booked one) and
 * the bookings they made that a coach confirmed. Only confirmed, because a
 * request is a question and a calendar is for answers.
 */
export async function calendarSessions(userId: string, since: Date) {
  const [coaching, booked] = await Promise.all([
    db.query.trainingSessions.findMany({
      where: and(
        eq(trainingSessions.coachId, userId),
        isNull(trainingSessions.cancelledAt),
        gte(trainingSessions.endsAt, since),
      ),
      columns: SLOT_COLUMNS,
      with: { coach: { columns: { coachName: true } }, bookings: { columns: BOOKING_COLUMNS } },
    }),
    db
      .select({
        bookingId: sessionBookings.id,
        playerName: sessionBookings.playerName,
        sessionId: trainingSessions.id,
        startsAt: trainingSessions.startsAt,
        endsAt: trainingSessions.endsAt,
        location: trainingSessions.location,
        notes: trainingSessions.notes,
        coachName: users.coachName,
      })
      .from(sessionBookings)
      .innerJoin(trainingSessions, eq(trainingSessions.id, sessionBookings.sessionId))
      .innerJoin(users, eq(users.id, trainingSessions.coachId))
      .where(
        and(
          eq(sessionBookings.bookedBy, userId),
          eq(sessionBookings.status, "confirmed"),
          isNull(trainingSessions.cancelledAt),
          gte(trainingSessions.endsAt, since),
        ),
      ),
  ]);
  return { coaching: coaching.map(withCoachName), booked };
}

type Row = Omit<SlotWithBookings, "coachName"> & { coach: { coachName: string | null } | null };

function withCoachName(row: Row): SlotWithBookings {
  const { coach, ...rest } = row;
  // A coach who cleared their name keeps one on their slots; the alternative
  // is a blank line on a parent's page next to a real booking.
  return { ...rest, coachName: coach?.coachName ?? "A coach" };
}

/** Parents' handles, for the coach's list of who asked. */
export async function parentHandles(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.displayName ?? r.username ?? "Someone"]));
}
