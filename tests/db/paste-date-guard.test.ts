/**
 * The paste box refusing a schedule that is not this event's.
 *
 * The unit tests next to the guard cover which ranges it objects to; this
 * covers the thing that actually cost a day, which is whether anything was
 * written. A September schedule pasted into a June tournament put 421
 * fixtures under both events, and every layer below the action was working
 * exactly as designed while it happened.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

// The action is admin-only, and this suite has no session to be admin in.
vi.mock("@/features/auth", () => ({ getCurrentUser: async () => ({ id: "admin" }) }));
vi.mock("@/features/auth/admin", () => ({ isAdmin: () => true }));

const { db } = await import("@/db");
const { eventKinds, events, matches } = await import("@/db/schema");
const { importPastedSchedule } = await import("@/features/sync/actions");

/** Two games from the Labor Day Cup, as a browser copies them out. */
const SEPTEMBER = [
  "Sat, Sep 5, 2026",
  "8:00 AM\tField 1\tCrossfire BU12 Gold\t2\tSeattle United BU12\t1",
  "10:00 AM\tField 2\tWashington Premier BU12\t0\tEastside FC BU12\t3",
].join("\n");

function paste(eventId: string, text: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("schedule", text);
  form.set("division", "Boys U12");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return importPastedSchedule({}, form);
}

/** A tournament in June, which is not when those fixtures were played. */
async function makeJuneEvent() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "spring-classic",
      title: "Spring Classic",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-06-12T16:00:00Z"),
      endsAt: new Date("2026-06-15T06:59:00Z"),
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

describe("pasting a schedule into the wrong event", () => {
  it("writes nothing, and says why", async () => {
    const eventId = await makeJuneEvent();

    const out = await paste(eventId, SEPTEMBER);

    expect(out.confirmDates).toBe(true);
    expect(out.error).toContain("2026-06-12");
    expect(out.detail).toBeUndefined();
    expect(await db.select().from(matches)).toHaveLength(0);
  });

  it("goes in when the admin says it really is this event", async () => {
    const eventId = await makeJuneEvent();

    await paste(eventId, SEPTEMBER);
    const out = await paste(eventId, SEPTEMBER, { confirmDates: "on" });

    expect(out.error).toBeUndefined();
    expect(await db.select().from(matches)).toHaveLength(2);
  });

  it("leaves a schedule that is this event's alone", async () => {
    const eventId = await makeJuneEvent();

    const out = await paste(
      eventId,
      SEPTEMBER.replace("Sat, Sep 5, 2026", "Sat, Jun 13, 2026"),
    );

    expect(out.confirmDates).toBeUndefined();
    expect(out.error).toBeUndefined();
    expect(await db.select().from(matches)).toHaveLength(2);
  });
});
