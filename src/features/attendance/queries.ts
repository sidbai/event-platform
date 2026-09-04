import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventAttendees } from "@/db/schema";
import { publicName } from "@/features/auth";

export type Attendee = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  status: "going" | "maybe";
  guests: number;
};

export type Attendance = {
  going: Attendee[];
  maybe: Attendee[];
  /** Heads, counting the guests people are bringing. */
  headcount: number;
  mine: { status: "going" | "maybe"; guests: number } | null;
};

export async function getAttendance(
  eventId: string,
  userId?: string | null,
): Promise<Attendance> {
  const rows = await db.query.eventAttendees.findMany({
    where: eq(eventAttendees.eventId, eventId),
    orderBy: [asc(eventAttendees.createdAt)],
    with: {
      user: {
        columns: {
          id: true,
          displayName: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  const all: Attendee[] = rows.map((r) => ({
    userId: r.userId,
    name: r.user ? publicName(r.user) : "Someone",
    username: r.user?.username ?? null,
    avatarUrl: r.user?.avatarUrl ?? null,
    status: r.status,
    guests: r.guests,
  }));

  const going = all.filter((a) => a.status === "going");
  const mineRow = userId ? rows.find((r) => r.userId === userId) : undefined;

  return {
    going,
    maybe: all.filter((a) => a.status === "maybe"),
    headcount: going.reduce((n, a) => n + 1 + a.guests, 0),
    mine: mineRow ? { status: mineRow.status, guests: mineRow.guests } : null,
  };
}
