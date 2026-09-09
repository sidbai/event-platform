"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canImportSchedule } from "@/features/events/can-manage";
import { safeSourceUrl } from "@/features/events/listing";

import { parsePastedSchedule, toSyncedEvent } from "./paste";
import { applyPastedStandings } from "./standings-apply";
import { parsePastedStandings, readStandingsHeader } from "./standings-paste";
import { applySync } from "./apply";
import { datesLookWrong, mismatchMessage } from "./date-guard";
import { mayPoll, platformOf } from "./policy";
import { detect, syncEvent } from "./run";

export type ConnectResult = {
  error?: string;
  /** What the sync did, when it worked: "128 matches, 34 new teams, 0 removed". */
  detail?: string;
  /**
   * The paste was refused only because its dates are not this event's, and
   * saying so again would get it in. The form turns this into a tick-box:
   * an admin who knows better is one click away, and an admin who pasted
   * into the wrong form is told before it writes anything.
   */
  confirmDates?: boolean;
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
 * The import itself, with no form and no session around it.
 *
 * Its own function because a schedule now arrives two ways — pasted onto an
 * event that exists, and handed over while the event is being created — and
 * two copies of this would be two sets of guards, one of which would quietly
 * stop matching the other. Callers do their own permission check; this does
 * the reading and the writing.
 */
export async function applyPastedText(
  event: { id: string; slug: string; startsAt: Date | null; endsAt: Date | null },
  input: { text: string; division?: string; confirmed?: boolean },
): Promise<ConnectResult> {
  const text = input.text.trim();
  if (!text) return { error: "Nothing pasted." };

  // Most schedules print "Sep 5" without a year, and the event's own start
  // date is a better guess than today's — a January tournament pasted in
  // December would otherwise land eleven months early.
  const year = (event.startsAt ?? new Date()).getUTCFullYear();
  const division = (input.division ?? "").trim() || "Unassigned";
  // Set by the tick-box the date guard below asks for, and only by that.
  const confirmed = input.confirmed === true;

  /*
   * A standings table and a fixture list arrive through the same box, because
   * asking somebody to say which they just copied is asking them to get it
   * wrong. The header tells us: a table naming a team column and a points
   * column is a standing, and nothing else is.
   */
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (readStandingsHeader(firstLine)) {
    const { rows, skipped: dropped } = parsePastedStandings(text);
    if (rows.length === 0) {
      return { error: "That looks like a standings table, but no rows came out of it." };
    }

    const out = await applyPastedStandings(event.id, rows);
    revalidatePath("/admin/sync");
    revalidatePath(`/events/${event.slug}`);

    if (out.updated === 0) {
      return {
        error: `None of those ${rows.length} teams are on this event. Is the schedule imported first, and is this the right division?`,
      };
    }

    const missed = [...out.unmatched, ...dropped];
    return {
      detail:
        `${out.updated} teams updated with the organizer's own table` +
        (missed.length > 0 ? ` — ${missed.length} row(s) matched nothing here` : ""),
    };
  }

  const { matches, skipped } = parsePastedSchedule(text, { division, year });
  if (matches.length === 0) {
    return {
      error: `No fixtures found in that. ${skipped.length} line(s) did not look like games.`,
    };
  }

  /*
   * The one check that the paste is this event's.
   *
   * Nothing else compares the two: the box takes whatever is on a clipboard
   * and writes it to whichever form was on screen. A Labor Day schedule went
   * into a June tournament this way, and 421 fixtures were listed under both
   * events until somebody noticed by eye.
   */
  if (!confirmed) {
    const wrong = datesLookWrong(
      matches.map((m) => m.date),
      event,
    );
    if (wrong) return { error: mismatchMessage(wrong), confirmDates: true };
  }

  const out = await applySync(event.id, toSyncedEvent(matches), new Date(), {
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
