import "server-only";

import { and, eq, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

import { applySync, recordSyncFailure } from "./apply";
import { athletes2events } from "./athletes2events";
import { modular11 } from "./modular11";
import { mayPoll } from "./policy";
import type { ExternalEventProvider, SourceRef } from "./provider";

/**
 * Every platform this application can read.
 *
 * One entry per platform, not per organizer — tournament hosting is
 * concentrated, so this list grows slowly and stops. EventConnect is absent
 * on purpose: their app host answers robots.txt with `Disallow: /` and they
 * sell an API, so that connector waits on an answer from them rather than on
 * an engineering decision.
 */
const PROVIDERS: ExternalEventProvider[] = [athletes2events, modular11];

export function providerFor(platform: string): ExternalEventProvider | null {
  return PROVIDERS.find((p) => p.platform === platform) ?? null;
}

/** The provider that recognises a URL somebody pasted, and what it read from it. */
export function detect(url: string): SourceRef | null {
  for (const p of PROVIDERS) {
    if (!p.matches(url)) continue;
    const ref = p.parseUrl(url);
    if (ref) return ref;
  }
  return null;
}

export type SyncReport = {
  slug: string;
  ok: boolean;
  detail: string;
};

/**
 * Refresh one event from the platform that hosts it.
 *
 * A failure records itself and leaves the existing schedule untouched. The
 * alternative — treating "we could not read it" as "there is nothing" —
 * would empty a schedule on a Saturday morning because of one timeout.
 */
export async function syncEvent(eventId: string, now = new Date()): Promise<SyncReport> {
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

  /*
   * The subdomain is part of the identity on platforms that give each club
   * one, and it is recoverable from the URL that was pasted to connect this
   * event. scheduleUrl first, because that is the platform's own page;
   * sourceUrl is usually the organizer's website, which is a different system
   * and parses to nothing.
   */
  const ref = (event.scheduleUrl && provider.parseUrl(event.scheduleUrl)) ||
    (event.sourceUrl && provider.parseUrl(event.sourceUrl)) || {
      platform: provider.platform,
      eventId: event.sourceEventId,
    };

  const result = await provider.fetch({ ...ref, eventId: event.sourceEventId });
  if (!result.ok) {
    await recordSyncFailure(event.id, `${result.error.kind}: ${result.error.detail}`, now);
    return { slug: event.slug, ok: false, detail: result.error.kind };
  }

  const applied = await applySync(event.id, result.data, now);
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
export async function syncIfDue(eventId: string, now = new Date()): Promise<SyncReport | null> {
  const claimed = await db
    .update(events)
    .set({ nextSyncAt: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(events.id, eventId), isNotNull(events.sourcePlatform), due(now)))
    .returning({ id: events.id });

  if (claimed.length === 0) return null;
  return syncEvent(eventId, now);
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
export async function syncDueEvents(limit = 5, now = new Date()): Promise<SyncReport[]> {
  const candidates = await db.query.events.findMany({
    where: and(isNotNull(events.sourcePlatform), due(now)),
    columns: { id: true },
    limit,
  });

  const reports: SyncReport[] = [];
  for (const e of candidates) {
    // Through the same claim as a page-triggered refresh, so a cron tick and a
    // reader arriving at the same moment cannot both fetch the same event.
    const report = await syncIfDue(e.id, now);
    if (report) reports.push(report);
  }
  return reports;
}
