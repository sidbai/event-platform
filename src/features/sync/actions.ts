"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canImportSchedule } from "@/features/events/can-manage";
import { safeSourceUrl } from "@/features/events/listing";

import { applyPastedText as importPastedText } from "./import-text";
import { mayPoll, platformOf } from "./policy";
import { READ_BUDGET_MS, detect, syncEvent } from "./run";
import { advanceJob } from "./jobs";

export type { ConnectResult } from "./result";
import type { ConnectResult } from "./result";

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
   * One box, two outcomes, and robots.txt picks between them.
   *
   * A platform whose robots.txt lets us in gets connected and read on a
   * schedule. One that refuses — or one nobody has assessed — still leaves us
   * something worth having: the link itself, as the Schedule & standings
   * button on the event page. Sending a parent straight to the fixtures beats
   * sending them to an organizer's front page to hunt.
   *
   * Asked of the policy rather than of the provider registry. "We have no
   * connector for this" and "this site refuses crawlers" are different
   * answers, they were only ever the same by coincidence, and the admin
   * deserves to be told which one they got.
   */
  const platform = platformOf(url);
  const decision = platform ? mayPoll(platform) : null;

  if (!ref || !decision?.may) {
    await db.update(events).set({ scheduleUrl: url }).where(eq(events.id, eventId));
    revalidatePath("/admin/sync");
    revalidatePath(`/events/${event.slug}`);

    const why = decision
      ? `${decision.may ? "We have no connector for it yet" : decision.reason}.`
      : "We have not assessed that site.";
    return {
      detail: `Saved as a link — the event page will send people straight to it. ${why} It will not refresh by itself.`,
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
  /*
   * A short read answers here. A long one — a league read a page at a
   * time — is queued and answered at once, and the pages are read after
   * this response has gone, for as long as this invocation is allowed to
   * run; whatever is left, the next cron tick picks up. The admin screen
   * shows the count going up. Nobody sits on a spinner for five minutes to
   * be told the function was killed at four.
   */
  const report = await syncEvent(eventId, new Date(), { budgetMs: 0, requestedBy: user.id });
  if (report.jobId) {
    const jobId = report.jobId;
    after(async () => {
      await advanceJob(jobId, READ_BUDGET_MS);
    });
    revalidatePath("/admin/sync");
    return { detail: "Reading in the background — the count below goes up as pages come in." };
  }
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
  const eventId = String(formData.get("eventId") ?? "");
  /*
   * Whoever may bring a schedule to THIS event, rather than an admin.
   *
   * The person who listed somebody else's tournament is the person holding
   * its fixtures, and this used to refuse them — while the create form, which
   * imports whatever files came with it, did not. One rule now, and it is the
   * narrow one: see canImportSchedule.
   */
  if (!(await canImportSchedule({ id: eventId }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, slug: true, startsAt: true, endsAt: true },
  });
  if (!event) return { error: "That event is gone." };

  return applyPastedText(event, {
    text: String(formData.get("schedule") ?? ""),
    division: String(formData.get("division") ?? ""),
    confirmed: formData.get("confirmDates") != null,
  });
}

/**
 * The import, for a form: the work is in import-text.ts, and this adds what
 * only a request has — the pages to refresh once it lands.
 */
export async function applyPastedText(
  event: { id: string; slug: string; startsAt: Date | null; endsAt: Date | null },
  input: { text: string; division?: string; confirmed?: boolean },
): Promise<ConnectResult> {
  const out = await importPastedText(event, input);
  if (!out.error) {
    revalidatePath("/admin/sync");
    revalidatePath(`/events/${event.slug}`);
  }
  return out;
}
