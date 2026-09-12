import "server-only";

import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { events, syncJobParts, syncJobs } from "@/db/schema";

import { applySync, recordSyncFailure } from "./apply";
import type { SyncReport } from "./run";
import { providerFor, sourceRefFor } from "./providers";
import type { SyncedMatch, SyncedTeam } from "./provider";

/**
 * A read done a page at a time, across as many invocations as it takes.
 *
 * See the sync_jobs table for why. The shape here: enqueueSync makes (or
 * finds) the one live job for an event; advanceJob takes the lease, reads
 * pages until its budget is spent or the connector says it is done, files
 * each page as a part, and either puts the job down for the next caller or
 * assembles the parts into one schedule and writes it through the same
 * applySync as a short read. Nothing is written to the schedule until the
 * last page is in, so the shrink guard and the pruning see the whole of it.
 */

/**
 * How long a caller's lease on a job lasts.
 *
 * Longer than any invocation, so a live reader is never pre-empted; short
 * enough that one killed at the platform's limit frees the job within the
 * next cron tick or two rather than the rest of the afternoon.
 */
const LEASE_MS = 6 * 60_000;

export type JobOutcome = {
  ok: boolean;
  /** True when the schedule was written (or the read failed for good). */
  finished: boolean;
  detail: string;
};

/**
 * A unique violation, wherever the driver put the code.
 *
 * Drizzle wraps the driver's error in a "Failed query" of its own and keeps
 * the original as `cause`; the SQLSTATE is on the original.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let e = error; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** The one live job for an event, made if there is none. */
export async function enqueueSync(
  eventId: string,
  requestedBy: string | null,
  now = new Date(),
): Promise<{ id: string; fresh: boolean }> {
  try {
    const [job] = await db
      .insert(syncJobs)
      .values({ eventId, requestedBy, createdAt: now })
      .returning({ id: syncJobs.id });
    return { id: job.id, fresh: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const live = await db.query.syncJobs.findFirst({
      where: and(eq(syncJobs.eventId, eventId), inArray(syncJobs.status, ["queued", "running"])),
      columns: { id: true },
    });
    if (!live) throw error;
    return { id: live.id, fresh: false };
  }
}

/** Jobs a caller may pick up: live, and nobody holding them. */
function claimable(now: Date) {
  return and(
    inArray(syncJobs.status, ["queued", "running"]),
    or(isNull(syncJobs.leasedUntil), lt(syncJobs.leasedUntil, now)),
  );
}

/**
 * Read as many pages of one job as the budget allows.
 *
 * At least one page per call, budget or no budget: a caller that makes no
 * progress is a caller that will never finish. The lease is taken in the
 * same update that checks nobody holds it, so two callers cannot both read
 * the same page — Postgres decides who has the row.
 */
export async function advanceJob(jobId: string, budgetMs: number, now = new Date()): Promise<JobOutcome> {
  const started = Date.now();
  const [job] = await db
    .update(syncJobs)
    .set({
      status: "running",
      leasedUntil: new Date(now.getTime() + LEASE_MS),
      startedAt: sql`coalesce(${syncJobs.startedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(and(eq(syncJobs.id, jobId), claimable(now)))
    .returning();
  if (!job) {
    const state = await db.query.syncJobs.findFirst({
      where: eq(syncJobs.id, jobId),
      columns: { status: true, detail: true, stepsDone: true, stepsTotal: true },
    });
    if (!state) return { ok: false, finished: true, detail: "job is gone" };
    if (state.status === "done") return { ok: true, finished: true, detail: state.detail ?? "done" };
    if (state.status === "failed") return { ok: false, finished: true, detail: state.detail ?? "failed" };
    return { ok: true, finished: false, detail: progress(state.stepsDone, state.stepsTotal) };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, job.eventId),
    columns: { id: true, slug: true, sourcePlatform: true, sourceEventId: true, sourceUrl: true, scheduleUrl: true },
  });
  const provider = event?.sourcePlatform ? providerFor(event.sourcePlatform) : null;
  if (!event || !event.sourceEventId || !provider?.step) {
    return fail(job.id, event?.id ?? null, "not a listing that can be read in pages", now);
  }
  const ref = sourceRefFor({ ...event, sourceEventId: event.sourceEventId }, provider);

  let cursor: unknown = job.cursor;
  let done = false;
  let index = job.stepsDone;
  let total = job.stepsTotal;
  do {
    const result = await provider.step(ref, cursor);
    if (!result.ok) {
      return fail(job.id, event.id, `${result.error.kind}: ${result.error.detail}`, now);
    }
    const step = result.step;
    cursor = step.cursor;
    done = step.done;
    index = step.index;
    total = step.total;
    // Filed before the cursor moves, so a caller killed between the two
    // re-reads a page rather than losing one.
    await db
      .insert(syncJobParts)
      .values({ jobId: job.id, step: index, payload: step.part })
      .onConflictDoUpdate({ target: [syncJobParts.jobId, syncJobParts.step], set: { payload: step.part } });
    await db
      .update(syncJobs)
      .set({
        cursor: cursor as object,
        stepsDone: index,
        stepsTotal: total,
        stepLabel: step.label,
        leasedUntil: new Date(Date.now() + LEASE_MS),
      })
      .where(eq(syncJobs.id, job.id));
  } while (!done && Date.now() - started < budgetMs);

  if (!done) {
    await db.update(syncJobs).set({ leasedUntil: null }).where(eq(syncJobs.id, job.id));
    return { ok: true, finished: false, detail: progress(index, total) };
  }

  /*
   * The last page is in. Everything the connector returned, in the order it
   * returned it, written as one schedule — through the same writer, with the
   * same guards, as a read that fit in one go.
   */
  const parts = await db.query.syncJobParts.findMany({
    where: eq(syncJobParts.jobId, job.id),
    orderBy: [asc(syncJobParts.step)],
  });
  const teams: SyncedTeam[] = [];
  const matches: SyncedMatch[] = [];
  for (const part of parts) {
    const payload = part.payload as { teams: SyncedTeam[]; matches: SyncedMatch[] };
    teams.push(...payload.teams);
    matches.push(...payload.matches);
  }
  if (matches.length === 0) {
    return fail(job.id, event.id, "unrecognised: pages read but no fixtures in any of them", now);
  }

  let detail: string;
  try {
    const applied = await applySync(event.id, { source: ref, teams, matches }, now);
    detail = applied.unchanged
      ? "unchanged"
      : `${applied.matches} matches, ${applied.teams} new teams, ${applied.removed} removed`;
  } catch (e) {
    return fail(job.id, event.id, e instanceof Error ? e.message : String(e), now);
  }

  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt: new Date(), leasedUntil: null, detail })
    .where(eq(syncJobs.id, job.id));
  await db.delete(syncJobParts).where(eq(syncJobParts.jobId, job.id));
  return { ok: true, finished: true, detail };
}

async function fail(jobId: string, eventId: string | null, detail: string, now: Date): Promise<JobOutcome> {
  await db
    .update(syncJobs)
    .set({ status: "failed", finishedAt: new Date(), leasedUntil: null, detail })
    .where(eq(syncJobs.id, jobId));
  await db.delete(syncJobParts).where(eq(syncJobParts.jobId, jobId));
  if (eventId) await recordSyncFailure(eventId, detail, now);
  return { ok: false, finished: true, detail };
}

function progress(done: number, total: number | null): string {
  return total ? `reading in the background — ${done} of ${total} pages` : "reading in the background";
}

/**
 * Every job nobody is holding, oldest first, within one budget.
 *
 * What the cron does before it looks for anything new to read.
 */
export async function advanceOpenJobs(budgetMs: number, now = new Date()): Promise<SyncReport[]> {
  const started = Date.now();
  const open = await db
    .select({ id: syncJobs.id, slug: events.slug })
    .from(syncJobs)
    .innerJoin(events, eq(events.id, syncJobs.eventId))
    .where(claimable(now))
    .orderBy(asc(syncJobs.createdAt));

  const reports: SyncReport[] = [];
  for (const job of open) {
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) break;
    const outcome = await advanceJob(job.id, left, now);
    reports.push({
      slug: job.slug,
      ok: outcome.ok,
      detail: outcome.detail,
      ...(outcome.finished ? {} : { jobId: job.id }),
    });
  }
  return reports;
}

/** The live job per event, for the admin screen. */
export async function liveJobsByEvent(): Promise<
  Map<string, { id: string; status: "queued" | "running"; stepsDone: number; stepsTotal: number | null; stepLabel: string | null; leasedUntil: Date | null }>
> {
  const rows = await db.query.syncJobs.findMany({
    where: inArray(syncJobs.status, ["queued", "running"]),
    columns: { id: true, eventId: true, status: true, stepsDone: true, stepsTotal: true, stepLabel: true, leasedUntil: true },
  });
  return new Map(
    rows.map((r) => [r.eventId, { ...r, status: r.status as "queued" | "running" }]),
  );
}
