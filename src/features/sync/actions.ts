"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { safeSourceUrl } from "@/features/events/listing";

import { parsePastedSchedule, toSyncedEvent } from "./paste";
import { applySync } from "./apply";
import { detect, syncEvent } from "./run";

export type ConnectResult = {
  error?: string;
  /** What the sync did, when it worked: "128 matches, 34 new teams, 0 removed". */
  detail?: string;
};

/**
 * Point a listing at wherever its schedule is published.
 *
 * A URL somebody pastes, rather than a platform picker and an id field. The
 * id is already in the link an organizer sends you, and asking a person to
 * copy a number out of a URL into a form is asking them to get it wrong.
 *
 * Two outcomes, and the difference is not the admin's problem to work out
 * beforehand: a platform we can read is connected and pulled in on the spot;
 * anything else is kept as a link the event page can offer.
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

  /*
   * A platform we cannot read still leaves us something worth having: the
   * link itself, as a button on the event page. EventConnect answers
   * robots.txt with `Disallow: /` and sells an API, so their schedules are
   * not ours to fetch — but sending a parent straight to the fixtures beats
   * sending them to an organizer's front page to hunt.
   */
  if (!ref) {
    await db.update(events).set({ scheduleUrl: url }).where(eq(events.id, eventId));
    revalidatePath("/admin/sync");
    revalidatePath(`/events/${event.slug}`);
    return {
      detail:
        "Saved as a link. We cannot read schedules from that site, so it will not refresh by itself.",
    };
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
  revalidatePath(`/events/${event.slug}`);

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

/**
 * Import a schedule somebody copied out of their browser.
 *
 * The way in for a platform we cannot read: EventConnect refuses crawlers,
 * A2E's terms require permission first, and some pages render their fixtures
 * in JavaScript that never reaches an HTTP client at all. A person can see
 * all of it, so a person can bring it here, and it lands in the same tables
 * through the same writer as a connector's output.
 *
 * Never prunes. A connector sees the whole event each time; somebody pasting
 * one flight has not cancelled the other thirty-three.
 */
export async function importPastedSchedule(
  _prev: ConnectResult,
  formData: FormData,
): Promise<ConnectResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  const eventId = String(formData.get("eventId") ?? "");
  const text = String(formData.get("schedule") ?? "").trim();
  if (!text) return { error: "Nothing pasted." };

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, slug: true, startsAt: true },
  });
  if (!event) return { error: "That event is gone." };

  // Most schedules print "Sep 5" without a year, and the event's own start
  // date is a better guess than today's — a January tournament pasted in
  // December would otherwise land eleven months early.
  const year = (event.startsAt ?? new Date()).getUTCFullYear();
  const division = String(formData.get("division") ?? "").trim() || "Unassigned";

  const { matches, skipped } = parsePastedSchedule(text, { division, year });
  if (matches.length === 0) {
    return {
      error: `No fixtures found in that. ${skipped.length} line(s) did not look like games.`,
    };
  }

  const out = await applySync(eventId, toSyncedEvent(matches), new Date(), {
    prune: false,
  });

  revalidatePath("/admin/sync");
  revalidatePath(`/events/${event.slug}`);

  const detail = `${matches.length} fixtures, ${out.teams} new teams, ${out.divisions} divisions`;
  return {
    // Skipped lines are the headline when there are any: a row we could not
    // read looks exactly like a game that was never scheduled.
    detail: skipped.length > 0 ? `${detail} — ${skipped.length} line(s) skipped` : detail,
  };
}
