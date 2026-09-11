/**
 * The headcount capacity is checked against, against a real Postgres.
 *
 * The capacity rule itself is pure (attendance/room.ts); what only the
 * database can say is that the count includes guests and excludes maybes,
 * and that the RSVP note round-trips through the upsert the action uses.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventAttendees, events, users } = await import("@/db/schema");
const { countGoing } = await import("@/features/attendance/headcount");

let eventId: string;
let hu: string;
let li: string;

beforeEach(async () => {
  await truncateAll(db);
  const [event] = await db
    .insert(events)
    .values({
      slug: "ej-sunday-230",
      title: "1-on-1 with EJ",
      kind: "training",
      status: "published",
      modules: ["attendance"],
      capacity: 1,
      startsAt: new Date("2026-09-13T21:30:00Z"),
      endsAt: new Date("2026-09-13T22:30:00Z"),
    })
    .returning({ id: events.id });
  eventId = event.id;
  const made = await db
    .insert(users)
    .values([{ email: "hu@example.com" }, { email: "li@example.com" }])
    .returning({ id: users.id, email: users.email });
  hu = made.find((u) => u.email === "hu@example.com")!.id;
  li = made.find((u) => u.email === "li@example.com")!.id;
});

describe("an RSVP's note", () => {
  it("survives the upsert the action uses, as one row", async () => {
    const upsert = (note: string) =>
      db
        .insert(eventAttendees)
        .values({ eventId, userId: hu, status: "going", note })
        .onConflictDoUpdate({
          target: [eventAttendees.eventId, eventAttendees.userId],
          set: { status: "going", note },
        });
    await upsert("Joshua, 2015 — he's a keeper");
    await upsert("Joshua, 2015");
    const rows = await db.select({ note: eventAttendees.note }).from(eventAttendees);
    expect(rows).toEqual([{ note: "Joshua, 2015" }]);
  });
});

describe("countGoing", () => {
  it("counts people and their guests, and not the maybes", async () => {
    await db.insert(eventAttendees).values([
      { eventId, userId: hu, status: "going", guests: 2 },
      { eventId, userId: li, status: "maybe", guests: 4 },
    ]);
    expect(await countGoing(eventId)).toEqual({ headcount: 3 });
  });
});
