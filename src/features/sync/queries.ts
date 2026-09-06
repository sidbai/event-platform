import "server-only";

import { desc, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

/**
 * Every event we list rather than run, with how its connector is doing.
 *
 * This is the only place a connector that has quietly stopped working shows
 * up. A sync failure is invisible on the event page by design — the schedule
 * we already have stays on screen rather than emptying — so it has to be
 * visible somewhere, and this is that somewhere.
 */
export async function listedEvents() {
  return db.query.events.findMany({
    where: isNotNull(events.sourceName),
    orderBy: [desc(events.startsAt)],
    columns: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      sourceName: true,
      sourceUrl: true,
      scheduleUrl: true,
      sourcePlatform: true,
      sourceEventId: true,
      lastSyncedAt: true,
      nextSyncAt: true,
      lastSyncError: true,
    },
  });
}

export type ListedEvent = Awaited<ReturnType<typeof listedEvents>>[number];
