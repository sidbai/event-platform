import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventInvites } from "@/db/schema";
import { publicName } from "@/features/auth";

export type EventInvite = {
  id: string;
  token: string;
  status: "pending" | "accepted" | "declined";
  /** Who it is for — a display name for a user invite, the address otherwise. */
  label: string;
  isEmail: boolean;
  createdAt: Date;
};

export async function listEventInvites(eventId: string): Promise<EventInvite[]> {
  const rows = await db.query.eventInvites.findMany({
    where: eq(eventInvites.eventId, eventId),
    orderBy: [asc(eventInvites.createdAt)],
    with: {
      invitedUser: {
        columns: { displayName: true, name: true, username: true, email: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    status: r.status,
    label: r.invitedUser ? publicName(r.invitedUser) : (r.email ?? "someone"),
    isEmail: !r.invitedUser,
    createdAt: r.createdAt,
  }));
}
