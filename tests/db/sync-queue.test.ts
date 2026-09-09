/**
 * Which listings the cron picks up.
 *
 * The cadence decides when to look again and writes it on the row; this is
 * the query that reads those rows back, and the two can disagree. A listing
 * connected AFTER it was marked completed has never synced and carries no
 * next-check, which the "never synced" clause would otherwise treat as new
 * work on every tick, forever.
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
const { eventKinds, events } = await import("@/db/schema");
const { and, isNotNull } = await import("drizzle-orm");
// The cron's own predicate, not a copy of it: a second version of this rule
// would pass its own tests while the real queue did something else.
const { due } = await import("@/features/sync/run");

const NOW = new Date("2026-08-22T18:00:00Z");

async function picked() {
  const rows = await db.query.events.findMany({
    where: and(isNotNull(events.sourcePlatform), due(NOW)),
    columns: { slug: true },
  });
  return rows.map((r) => r.slug).sort();
}

async function makeEvent(
  slug: string,
  over: Partial<{
    status: "published" | "completed" | "cancelled";
    lastSyncedAt: Date | null;
    nextSyncAt: Date | null;
  }> = {},
) {
  await db.insert(events).values({
    slug,
    title: slug,
    kind: "tournament",
    modules: [],
    status: over.status ?? "published",
    visibility: "public",
    locationType: "in_person",
    timezone: "America/Los_Angeles",
    startsAt: new Date("2026-08-21T16:00:00Z"),
    endsAt: new Date("2026-08-24T06:00:00Z"),
    sourcePlatform: "athletes2events",
    sourceEventId: "1",
    lastSyncedAt: over.lastSyncedAt ?? null,
    nextSyncAt: over.nextSyncAt ?? null,
  });
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

describe("the cron's queue", () => {
  it("takes a listing that has never synced", async () => {
    await makeEvent("new-listing");
    expect(await picked()).toEqual(["new-listing"]);
  });

  it("takes one whose next check has come round", async () => {
    await makeEvent("due-now", {
      lastSyncedAt: new Date("2026-08-22T17:00:00Z"),
      nextSyncAt: new Date("2026-08-22T17:30:00Z"),
    });
    expect(await picked()).toEqual(["due-now"]);
  });

  it("leaves one whose next check is still ahead", async () => {
    await makeEvent("not-yet", {
      lastSyncedAt: new Date("2026-08-22T17:55:00Z"),
      nextSyncAt: new Date("2026-08-22T18:15:00Z"),
    });
    expect(await picked()).toEqual([]);
  });

  it("never takes a completed listing, even one that has never synced", async () => {
    /*
     * The case the status check is for. Without it this row matches "never
     * synced and no next check" on every tick for the rest of time.
     */
    await makeEvent("finished", { status: "completed" });
    await makeEvent("finished-and-was-syncing", {
      status: "completed",
      lastSyncedAt: new Date("2026-08-22T17:00:00Z"),
      nextSyncAt: new Date("2026-08-22T17:30:00Z"),
    });
    expect(await picked()).toEqual([]);
  });

  it("never takes a cancelled listing", async () => {
    await makeEvent("called-off", { status: "cancelled" });
    expect(await picked()).toEqual([]);
  });

  it("still takes the live ones beside them", async () => {
    // The guard must narrow the queue, not empty it.
    await makeEvent("finished", { status: "completed" });
    await makeEvent("still-on");
    expect(await picked()).toEqual(["still-on"]);
  });
});
