import "server-only";

import { and, eq, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

import { applySync, recordSyncFailure } from "./apply";
import { athletes2events } from "./athletes2events";
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
const PROVIDERS: ExternalEventProvider[] = [athletes2events];

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
    columns: { id: true, slug: true, sourcePlatform: true, sourceEventId: true, sourceUrl: true },
  });
  if (!event) return { slug: eventId, ok: false, detail: "event not found" };
  if (!event.sourcePlatform || !event.sourceEventId) {
    return { slug: event.slug, ok: false, detail: "not a synced listing" };
  }

  const provider = providerFor(event.sourcePlatform);
  if (!provider) {
    return { slug: event.slug, ok: false, detail: `no provider for ${event.sourcePlatform}` };
  }

  // The subdomain is part of the identity on platforms that give each club
  // one, and it is recoverable from the URL the importer already stored.
  const ref = (event.sourceUrl && provider.parseUrl(event.sourceUrl)) || {
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
 * Every listing whose next check has come due.
 *
 * Bounded, because this runs inside one serverless invocation and a queue
 * that cannot finish is a queue whose tail never syncs. Anything left over is
 * still due on the next tick.
 */
export async function syncDueEvents(limit = 5, now = new Date()): Promise<SyncReport[]> {
  const due = await db.query.events.findMany({
    where: and(
      isNotNull(events.sourcePlatform),
      // Never synced, or scheduled for a moment that has passed.
      or(sql`${events.lastSyncedAt} is null`, sql`${events.nextSyncAt} <= ${now.toISOString()}::timestamptz`),
    ),
    columns: { id: true },
    limit,
  });

  const reports: SyncReport[] = [];
  for (const e of due) reports.push(await syncEvent(e.id, now));
  return reports;
}
