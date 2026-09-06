"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { safeSourceUrl } from "@/features/events/listing";

import { detect, syncEvent } from "./run";

export type ConnectResult = {
  error?: string;
  /** What the sync did, when it worked: "128 matches, 34 new teams, 0 removed". */
  detail?: string;
};

/**
 * Connect a listing to the platform that publishes its schedule.
 *
 * A URL somebody pastes, rather than a platform picker and an id field. The
 * id is already in the link an organizer sends you, and asking a person to
 * copy a number out of a URL into a form is asking them to get it wrong.
 *
 * Admin only. Connecting an event makes this application fetch somebody
 * else's server on a schedule, which is not a thing a signed-in stranger
 * should be able to point wherever they like.
 */
export async function connectSchedule(
  _prev: ConnectResult,
  formData: FormData,
): Promise<ConnectResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  const eventId = String(formData.get("eventId") ?? "");
  const url = safeSourceUrl(String(formData.get("url") ?? "").trim());
  if (!url) return { error: "That needs to be a full http(s) address." };

  const ref = detect(url);
  if (!ref) {
    return {
      error: "We cannot read schedules from that site yet. Athletes2Events only, for now.",
    };
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, slug: true, sourceName: true },
  });
  if (!event) return { error: "That event is gone." };
  // The same guard the seeder has. An event we run has its own schedule,
  // entered by its organizer, and pointing a connector at it would start
  // deleting fixtures that were never ours to delete.
  if (!event.sourceName) {
    return { error: "That is an event we run, not a listing. It has no upstream." };
  }

  await db
    .update(events)
    .set({
      sourcePlatform: ref.platform,
      sourceEventId: ref.eventId,
      // Where it was read from, and where the sync recovers the club
      // subdomain that is the other half of the identity.
      scheduleUrl: url,
      // Due now: somebody just asked for this, and waiting for a cron tick to
      // show them whether it worked would make the form feel broken.
      nextSyncAt: null,
      lastSyncedAt: null,
      lastSyncError: null,
      lastContentHash: null,
    })
    .where(eq(events.id, eventId));

  const report = await syncEvent(eventId);
  revalidatePath("/admin/sync");
  revalidatePath(`/events/${event.slug}/table`);

  return report.ok
    ? { detail: report.detail }
    : { error: `Connected, but reading it failed: ${report.detail}` };
}

/**
 * Read a connected event now, whatever its cadence says.
 *
 * Deliberately not through the claim: an admin asking for this is asking
 * because something looks wrong, and "not due yet" is not a useful answer to
 * a person staring at a schedule they know is out of date.
 */
export async function refreshNow(
  _prev: ConnectResult,
  formData: FormData,
): Promise<ConnectResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  const eventId = String(formData.get("eventId") ?? "");
  const report = await syncEvent(eventId);
  revalidatePath("/admin/sync");

  return report.ok ? { detail: report.detail } : { error: report.detail };
}
