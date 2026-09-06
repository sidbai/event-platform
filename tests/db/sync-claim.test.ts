/**
 * Who gets to go and fetch, when several callers want the same event.
 *
 * The cron tick and every reader of a schedule page both ask for a refresh.
 * Whether that produces one fetch or forty is decided by a `update ... where
 * still due` against a real Postgres, so it is tested against a real one:
 * a mock would agree with whatever this code believes about row locking,
 * which is the belief under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

/** A provider that publishes one fixture and counts how often it is asked. */
const fetches = vi.fn();
vi.mock("@/features/sync/athletes2events", () => ({
  athletes2events: {
    platform: "athletes2events",
    matches: () => true,
    parseUrl: () => ({ platform: "athletes2events", eventId: "130" }),
    fetch: (...args: unknown[]) => {
      fetches(...args);
      return Promise.resolve({
        ok: true,
        data: {
          source: { platform: "athletes2events", eventId: "130" },
          teams: [
            { sourceTeamId: "1", name: "Crossfire B10", division: "Boys-U10", group: "A" },
            { sourceTeamId: "2", name: "Leon FC U10", division: "Boys-U10", group: "A" },
          ],
          matches: [
            {
              sourceMatchId: "377",
              division: "Boys-U10",
              group: "A",
              date: "2026-09-05",
              time: "09:05",
              homeTeamId: "1",
              awayTeamId: "2",
              homeName: "Crossfire B10",
              awayName: "Leon FC U10",
              homeScore: null,
              awayScore: null,
              field: "60A #17",
              venue: null,
            },
          ],
        },
      });
    },
  },
}));

const { db } = await import("@/db");
const { eventKinds, events, matches } = await import("@/db/schema");
const { syncDueEvents, syncIfDue } = await import("@/features/sync/run");
const { eq } = await import("drizzle-orm");

const NOW = new Date("2026-09-05T17:00:00Z");
const at = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000);

async function makeListing(overrides: Record<string, unknown> = {}) {
  const [event] = await db
    .insert(events)
    .values({
      slug: `listing-${Math.random().toString(36).slice(2, 9)}`,
      title: "Labor Day ZF Challenge",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-09-05T16:00:00Z"),
      endsAt: new Date("2026-09-08T06:59:00Z"),
      sourcePlatform: "athletes2events",
      sourceEventId: "130",
      ...overrides,
    })
    .returning({ id: events.id });
  return event.id;
}

beforeEach(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
  fetches.mockClear();
});

describe("syncIfDue", () => {
  it("refreshes a listing that has never been read", async () => {
    const id = await makeListing();
    const report = await syncIfDue(id, NOW);

    expect(report?.ok).toBe(true);
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(await db.select().from(matches).where(eq(matches.eventId, id))).toHaveLength(1);
  });

  it("leaves an event alone until its next check is due", async () => {
    // Every page view would otherwise be a fetch against somebody else's
    // server, which is how a directory gets itself blocked.
    const id = await makeListing({
      lastSyncedAt: at(-5),
      nextSyncAt: at(15),
    });

    expect(await syncIfDue(id, NOW)).toBeNull();
    expect(fetches).not.toHaveBeenCalled();
  });

  it("does not poll an event whose schedule has stopped changing", async () => {
    // nextSyncAt null after a synced run means the cadence gave up on it.
    const id = await makeListing({ lastSyncedAt: at(-60 * 24 * 30), nextSyncAt: null });

    expect(await syncIfDue(id, NOW)).toBeNull();
    expect(fetches).not.toHaveBeenCalled();
  });

  it("ignores an event we run ourselves", async () => {
    const id = await makeListing({ sourcePlatform: null, sourceEventId: null });

    expect(await syncIfDue(id, NOW)).toBeNull();
    expect(fetches).not.toHaveBeenCalled();
  });

  it("sends one fetch when a crowd arrives at once", async () => {
    // A Saturday morning: the cron tick and every parent opening the schedule
    // all ask at the same moment. Postgres decides who goes.
    const id = await makeListing();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => syncIfDue(id, NOW)),
    );

    expect(fetches).toHaveBeenCalledTimes(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(matches).where(eq(matches.eventId, id))).toHaveLength(1);
  });

  it("lets the next caller through once the claim has expired", async () => {
    // A process killed mid-sync must not freeze a schedule for the afternoon.
    const id = await makeListing();
    await syncIfDue(id, NOW);
    fetches.mockClear();

    expect(await syncIfDue(id, at(1))).toBeNull();
    // The sync itself set the cadence — being played, that is 20 minutes.
    expect((await syncIfDue(id, at(21)))?.ok).toBe(true);
    expect(fetches).toHaveBeenCalledTimes(1);
  });
});

describe("syncDueEvents", () => {
  it("works through the due listings and stops at the limit", async () => {
    await Promise.all([makeListing(), makeListing(), makeListing()]);

    const reports = await syncDueEvents(2, NOW);
    expect(reports).toHaveLength(2);
    expect(fetches).toHaveBeenCalledTimes(2);
  });

  it("skips what is not due yet", async () => {
    await makeListing({ lastSyncedAt: at(-5), nextSyncAt: at(30) });
    await makeListing();

    expect(await syncDueEvents(5, NOW)).toHaveLength(1);
  });
});
