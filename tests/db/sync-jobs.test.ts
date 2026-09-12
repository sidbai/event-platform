import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

/**
 * A connector that reads in three steps: the list, then two pages.
 *
 * Stands in for athletes2events because the runner's provider table is
 * fixed; what matters is that it offers `step`, which makes the runner
 * treat it as a job.
 */
let failAt: number | null = null;
const steps = vi.fn();
vi.mock("@/features/sync/athletes2events", () => ({
  athletes2events: {
    platform: "athletes2events",
    matches: () => true,
    parseUrl: () => null,
    fetch: () => Promise.reject(new Error("the job runner should use step, not fetch")),
    step: async (_ref: unknown, cursor: { i: number } | null) => {
      const i = cursor ? cursor.i + 1 : 0;
      steps(i);
      if (failAt === i) return { ok: false, error: { kind: "unreachable", detail: "503 at the gate" } };
      const team = (id: string, name: string) => ({ sourceTeamId: id, name, division: "Boys-U10", group: "A" });
      const game = (id: string, home: string, away: string) => ({
        sourceMatchId: id,
        division: "Boys-U10",
        group: "A",
        date: "2026-09-05",
        time: "09:05",
        homeTeamId: home,
        awayTeamId: away,
        homeName: home,
        awayName: away,
        homeScore: null,
        awayScore: null,
        field: null,
        venue: null,
      });
      const parts = [
        { teams: [], matches: [] },
        { teams: [team("1", "Crossfire B10"), team("2", "Leon FC U10")], matches: [game("377", "1", "2")] },
        { teams: [team("3", "PacNW B10")], matches: [game("378", "2", "3")] },
      ];
      return {
        ok: true,
        step: { cursor: { i }, part: parts[i], done: i === 2, index: i, total: 2, label: `page ${i}` },
      };
    },
  },
}));

const { db } = await import("@/db");
const { eventKinds, events, matches, syncJobParts, syncJobs } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { syncEvent, syncDueEvents } = await import("@/features/sync/run");
const { advanceJob, enqueueSync } = await import("@/features/sync/jobs");

const NOW = new Date("2026-08-22T18:00:00Z");
let eventId = "";

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(syncJobs);
  await db.delete(matches);
  await db.delete(events);
  steps.mockClear();
  failAt = null;
  const [e] = await db
    .insert(events)
    .values({
      slug: "rcl-test",
      title: "RCL",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-21T16:00:00Z"),
      endsAt: new Date("2026-11-24T06:00:00Z"),
      sourcePlatform: "athletes2events",
      sourceEventId: "130",
    })
    .returning({ id: events.id });
  eventId = e.id;
});

describe("a read done in pages", () => {
  it("is queued at once and answers with the job, given no budget", async () => {
    const report = await syncEvent(eventId, NOW, { budgetMs: 0 });
    expect(report.ok).toBe(true);
    expect(report.jobId).toBeDefined();
    expect(steps).not.toHaveBeenCalled();
    const [job] = await db.select().from(syncJobs);
    expect(job.status).toBe("queued");
  });

  it("makes one job for an event, however many ask", async () => {
    const a = await enqueueSync(eventId, null, NOW);
    const b = await enqueueSync(eventId, null, NOW);
    expect(b.id).toBe(a.id);
    expect(b.fresh).toBe(false);
  });

  it("reads at least one page per call, files it, and puts the job down", async () => {
    const { id } = await enqueueSync(eventId, null, NOW);
    const first = await advanceJob(id, 0, NOW);
    expect(first.finished).toBe(false);
    expect(steps).toHaveBeenCalledTimes(1);
    const [job] = await db.select().from(syncJobs);
    expect(job.status).toBe("running");
    expect(job.leasedUntil).toBeNull();
    expect(job.stepsTotal).toBe(2);
    expect(await db.$count(syncJobParts)).toBe(1);
    // Nothing written to the schedule until the last page is in.
    expect(await db.$count(matches)).toBe(0);
  });

  it("assembles the pages into one schedule when the last is in", async () => {
    const { id } = await enqueueSync(eventId, null, NOW);
    await advanceJob(id, 0, NOW);
    await advanceJob(id, 0, NOW);
    const last = await advanceJob(id, 0, NOW);
    expect(last.finished).toBe(true);
    expect(last.ok).toBe(true);
    expect(await db.$count(matches)).toBe(2);
    expect(await db.$count(syncJobParts)).toBe(0);
    const [job] = await db.select().from(syncJobs);
    expect(job.status).toBe("done");
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    expect(event.lastSyncedAt).not.toBeNull();
    expect(event.lastSyncError).toBeNull();
  });

  it("reads the whole thing in one call given the budget", async () => {
    const report = await syncEvent(eventId, NOW, { budgetMs: 60_000 });
    expect(report.jobId).toBeUndefined();
    expect(report.ok).toBe(true);
    expect(steps).toHaveBeenCalledTimes(3);
    expect(await db.$count(matches)).toBe(2);
  });

  it("leaves a job somebody else holds alone", async () => {
    const { id } = await enqueueSync(eventId, null, NOW);
    await db
      .update(syncJobs)
      .set({ status: "running", leasedUntil: new Date(NOW.getTime() + 60_000) })
      .where(eq(syncJobs.id, id));
    const outcome = await advanceJob(id, 60_000, NOW);
    expect(outcome.finished).toBe(false);
    expect(steps).not.toHaveBeenCalled();
  });

  it("picks up a job whose holder was killed, once the lease lapses", async () => {
    const { id } = await enqueueSync(eventId, null, NOW);
    await db
      .update(syncJobs)
      .set({ status: "running", leasedUntil: new Date(NOW.getTime() - 1) })
      .where(eq(syncJobs.id, id));
    const outcome = await advanceJob(id, 0, NOW);
    expect(outcome.finished).toBe(false);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("fails the job and says why when a page does not come", async () => {
    failAt = 1;
    const { id } = await enqueueSync(eventId, null, NOW);
    await advanceJob(id, 0, NOW);
    const outcome = await advanceJob(id, 0, NOW);
    expect(outcome.finished).toBe(true);
    expect(outcome.ok).toBe(false);
    const [job] = await db.select().from(syncJobs);
    expect(job.status).toBe("failed");
    expect(job.detail).toContain("503 at the gate");
    expect(await db.$count(syncJobParts)).toBe(0);
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    expect(event.lastSyncError).toContain("503 at the gate");
  });

  it("is what the cron picks up first", async () => {
    const { id } = await enqueueSync(eventId, null, NOW);
    await advanceJob(id, 0, NOW);
    const reports = await syncDueEvents(5, NOW, 60_000);
    expect(reports.map((r) => r.slug)).toContain("rcl-test");
    const [job] = await db.select().from(syncJobs);
    expect(job.status).toBe("done");
  });
});
