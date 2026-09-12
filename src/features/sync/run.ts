import "server-only";

import { and, eq, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

import { applySync, recordSyncFailure } from "./apply";
import { advanceJob, advanceOpenJobs, enqueueSync } from "./jobs";
import { mayPoll } from "./policy";
import { providerFor, sourceRefFor } from "./providers";

export { detect, providerFor } from "./providers";

export type SyncReport = {
  slug: string;
  ok: boolean;
  detail: string;
  /** Set when the read continues in the background — see jobs.ts. */
  jobId?: string;
};

/**
 * How much of an invocation a read may use before putting its job down.
 *
 * Under the five minutes a route declares, with room for the write at the
 * end: assembling a season and applying it is a minute of its own.
 */
export const READ_BUDGET_MS = 200_000;

/**
 * Refresh one event from the platform that hosts it.
 *
 * A failure records itself and leaves the existing schedule untouched. The
 * alternative — treating "we could not read it" as "there is nothing" —
 * would empty a schedule on a Saturday morning because of one timeout.
 */
export async function syncEvent(
  eventId: string,
  now = new Date(),
  options: { budgetMs?: number; requestedBy?: string | null } = {},
): Promise<SyncReport> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      id: true,
      slug: true,
      sourcePlatform: true,
      sourceEventId: true,
      sourceUrl: true,
      scheduleUrl: true,
    },
  });
  if (!event) return { slug: eventId, ok: false, detail: "event not found" };
  if (!event.sourcePlatform || !event.sourceEventId) {
    return { slug: event.slug, ok: false, detail: "not a synced listing" };
  }

  /*
   * Asked before anything else, including whether a connector even exists.
   * "We are not allowed to read this" is a stronger and more useful answer
   * than "we have not built it yet", and this is the single place every fetch
   * passes through — the cron, a page view and an admin pressing refresh all
   * arrive here. A rule enforced in one of those and not the others holds
   * only until somebody uses the fourth door.
   */
  const decision = mayPoll(event.sourcePlatform);
  if (!decision.may) {
    return { slug: event.slug, ok: false, detail: `not permitted — ${decision.reason}` };
  }

  const provider = providerFor(event.sourcePlatform);
  if (!provider) {
    return { slug: event.slug, ok: false, detail: `no provider for ${event.sourcePlatform}` };
  }

  const ref = sourceRefFor({ ...event, sourceEventId: event.sourceEventId }, provider);

  /*
   * A read that does not fit one invocation is a job: as many pages as the
   * budget allows now, the rest on the next tick or the next Refresh. The
   * report says how far it got; the schedule is written only when the last
   * page is in, so nothing below sees half a season.
   */
  if (provider.step) {
    const job = await enqueueSync(event.id, options.requestedBy ?? null, now);
    const budget = options.budgetMs ?? READ_BUDGET_MS;
    if (budget <= 0) {
      return { slug: event.slug, ok: true, detail: "queued", jobId: job.id };
    }
    const outcome = await advanceJob(job.id, budget, now);
    return {
      slug: event.slug,
      ok: outcome.ok,
      detail: outcome.detail,
      ...(outcome.finished ? {} : { jobId: job.id }),
    };
  }

  const result = await provider.fetch({ ...ref, eventId: event.sourceEventId });
  if (!result.ok) {
    await recordSyncFailure(event.id, `${result.error.kind}: ${result.error.detail}`, now);
    return { slug: event.slug, ok: false, detail: result.error.kind };
  }

  /*
   * A refusal from the writer is a failure of this sync, not of the process.
   *
   * applySync throws when what it was handed would delete most of a schedule
   * — a page that did not arrive, read as a league that shrank. Letting that
   * escape would leave the event with no error recorded and its last-synced
   * time untouched, which reads on the admin screen as a sync that has not
   * run rather than one that refused. Written down, and the next poll tries
   * again.
   */
  let applied;
  try {
    applied = await applySync(event.id, result.data, now);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await recordSyncFailure(event.id, detail, now);
    return { slug: event.slug, ok: false, detail };
  }

  return {
    slug: event.slug,
    ok: true,
    detail: applied.unchanged
      ? "unchanged"
      : `${applied.matches} matches, ${applied.teams} new teams, ${applied.removed} removed`,
  };
}

/**
 * How long a claim holds before another caller may try again.
 *
 * Long enough that two readers arriving together do not both go and fetch the
 * same tournament, short enough that a process killed mid-sync does not leave
 * a schedule frozen for the rest of the afternoon.
 */
const LEASE_MS = 5 * 60_000;

/**
 * Refresh one listing, but only if it is due and nobody else is already on it.
 *
 * The claim is the `update ... where still due` itself: Postgres decides who
 * gets the row, so a Saturday morning where forty parents open the same
 * schedule at once produces one fetch, not forty. Whoever wins moves
 * `nextSyncAt` out by the lease before doing any work; the sync then sets it
 * properly, and a failure sets it from the cadence.
 */
export async function syncIfDue(
  eventId: string,
  now = new Date(),
  budgetMs = READ_BUDGET_MS,
): Promise<SyncReport | null> {
  const claimed = await db
    .update(events)
    .set({ nextSyncAt: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(events.id, eventId), isNotNull(events.sourcePlatform), due(now)))
    .returning({ id: events.id });

  if (claimed.length === 0) return null;
  return syncEvent(eventId, now, { budgetMs });
}

/**
 * Due for a check: the moment it was given has passed, or it has never been
 * read and nobody is reading it right now.
 *
 * The second half is what makes the claim work. "Never synced" on its own
 * stays true no matter how many callers claim the row, so eight readers
 * arriving together would all have gone and fetched; a claim moves
 * `nextSyncAt` into the future, and that is what the losers now see.
 */
export function due(now: Date) {
  return and(
    /*
     * Never on an event somebody has closed.
     *
     * The cadence already writes a null next-check for these, which stops one
     * that has synced before — but a listing connected AFTER it was marked
     * completed has never synced, and the second clause below would otherwise
     * treat it as new work forever. "Refresh now" is how a person asks for it
     * anyway, and that path does not come through here.
     */
    sql`${events.status} not in ('completed','cancelled')`,
    or(
      sql`${events.nextSyncAt} <= ${now.toISOString()}::timestamptz`,
      and(sql`${events.lastSyncedAt} is null`, sql`${events.nextSyncAt} is null`),
    ),
  );
}

/**
 * Every listing whose next check has come due.
 *
 * Bounded, because this runs inside one serverless invocation and a queue
 * that cannot finish is a queue whose tail never syncs. Anything left over is
 * still due on the next tick.
 */
export async function syncDueEvents(
  limit = 5,
  now = new Date(),
  budgetMs = READ_BUDGET_MS,
): Promise<SyncReport[]> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);

  /*
   * Reads already under way come first: a job put down by the last tick, or
   * by an admin's Refresh that ran out of time, is closer to done than
   * anything due, and a queue that keeps starting reads and never finishes
   * one is the failure this exists to end.
   */
  const reports: SyncReport[] = await advanceOpenJobs(left(), now);

  const candidates = await db.query.events.findMany({
    where: and(isNotNull(events.sourcePlatform), due(now)),
    columns: { id: true },
    limit,
  });

  for (const e of candidates) {
    if (left() <= 0) break;
    // Through the same claim as a page-triggered refresh, so a cron tick and a
    // reader arriving at the same moment cannot both fetch the same event.
    const report = await syncIfDue(e.id, now, left());
    if (report) reports.push(report);
  }
  return reports;
}
