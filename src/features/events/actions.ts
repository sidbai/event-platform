"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { eventKinds, events, teams, venues } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";
import { isAdmin } from "@/features/auth/admin";
import { canScheduleForTeam } from "@/features/teams/access";
import { zonedDate } from "@/lib/dates";

import { canManageEvent } from "./can-manage";
import { safeSourceUrl } from "./listing";
import { needsAdminReview } from "./review-rule";

export type EventFormResult = { error?: string; fieldErrors?: Record<string, string> };

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string) {
  const root = base || "event";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing = await db.query.events.findFirst({
      where: eq(events.slug, candidate),
      columns: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function submitEvent(
  _prev: EventFormResult,
  formData: FormData,
): Promise<EventFormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to submit an event." };

  const gate = await checkRateLimit("event:create", user);
  if (!gate.ok) return { error: gate.message };

  const get = (k: string) => String(formData.get(k) ?? "").trim();

  /*
   * Whether this platform runs the event, or is listing somebody else's.
   *
   * One action rather than two. The listing path started life as its own
   * function and was 69% the same code — the same rate limit, the same date
   * parsing, the same venue upsert, the same slug. This repository has been
   * bitten repeatedly by exactly that: three copies of the unique-slug loop
   * that disagreed on their retry count, two ways of adding a team that
   * produced different teams. The difference here is four fields and a
   * couple of rules, which is data, not a second code path.
   */
  const listed = get("runBy") === "someone-else";

  const kind = get("kind");
  const title = get("title");
  const locationType = listed ? "in_person" : get("locationType") || "in_person";
  const date = get("date");
  const endDate = get("endDate");
  const time = get("time");
  const venueName = get("venueName");
  const onlineUrl = get("onlineUrl");

  const sourceName = get("sourceName");
  const sourceUrl = get("sourceUrl");
  const scheduleUrl = get("scheduleUrl");

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Give the event a name.";
  if (!kind) fieldErrors.kind = "Pick a kind.";
  if (!date) fieldErrors.date = "Pick a date.";
  if (listed) {
    // The two that make it a listing rather than a claim about someone
    // else's event: whose it is, and where to actually go.
    if (!sourceName) fieldErrors.sourceName = "Say whose event this is.";
    if (!safeSourceUrl(sourceUrl)) {
      fieldErrors.sourceUrl = "Add the organizer's page, starting with https://";
    }
    // Optional, but a value that cannot be linked to is a typo worth catching
    // rather than dropping in silence.
    if (scheduleUrl && !safeSourceUrl(scheduleUrl)) {
      fieldErrors.scheduleUrl = "That link needs to start with https://";
    }
  }
  if (endDate && date && endDate < date) {
    fieldErrors.endDate = "The last day is before the first.";
  }
  if (!listed && locationType === "in_person" && !venueName)
    fieldErrors.venueName = "Where is it?";
  if (locationType === "online" && !onlineUrl)
    fieldErrors.onlineUrl = "Add a link.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const kindRow = await db.query.eventKinds.findFirst({
    where: eq(eventKinds.slug, kind),
  });
  if (!kindRow) return { fieldErrors: { kind: "Unknown kind." } };

  const timezone = get("timezone") || "America/Los_Angeles";

  // Read in the event's own zone, not the server's.
  //
  // `new Date("2026-08-29T09:00")` uses whatever timezone the process runs in.
  // That is Seattle on a laptop and UTC on Vercel, so a 9am kickoff typed by
  // an organizer was being stored as 9am UTC and shown back to them as 2am.
  // zonedDate exists for exactly this and was not being used here.
  const startsAt = zonedDate(date, time || "00:00", timezone);
  // The end of the last day rather than its start, so a range covers the day
  // it names — "August 29–31" that stopped at midnight on the 31st would end
  // before any of the 31st's games kicked off.
  const endsAt = endDate ? zonedDate(endDate, "23:59", timezone) : null;

  let venueId: string | null = null;
  if (locationType === "in_person" && venueName) {
    const existing = await db.query.venues.findFirst({
      where: eq(venues.name, venueName),
    });
    venueId =
      existing?.id ??
      (
        await db
          .insert(venues)
          .values({
            name: venueName,
            address: get("venueAddress") || null,
            city: get("venueCity") || null,
          })
          .returning({ id: venues.id })
      )[0].id;
  }

  // Hosting for a team: only its owner/manager/coach may put events on its
  // calendar, so a forged slug in the form gets dropped rather than trusted.
  // Never on a listing — nobody here hosts somebody else's tournament.
  let hostTeamId: string | null = null;
  const hostTeamSlug = listed ? "" : get("hostTeam");
  if (hostTeamSlug) {
    const team = await db.query.teams.findFirst({
      where: eq(teams.slug, hostTeamSlug),
      columns: { id: true },
    });
    if (!team || !(await canScheduleForTeam(team.id)))
      return { error: "You can't create events for that team." };
    hostTeamId = team.id;
  }

  const admin = isAdmin(user);
  // A listing is always public: it exists to be found. Offering to hide one
  // would be offering to keep somebody else's tournament secret.
  const picked = listed ? "public" : get("visibility");
  const visibility = (
    ["public", "unlisted", "private"].includes(picked) ? picked : "public"
  ) as "public" | "unlisted" | "private";

  const needsReview = needsAdminReview(kind, visibility, admin);
  const slug = await uniqueSlug(slugify(title));

  await db.insert(events).values({
    slug,
    kind,
    // A listing runs nothing here, so it gets none of the modules that offer
    // entries, rosters or a table.
    modules: listed ? [] : kindRow.defaultModules,
    title,
    summary: get("summary") || null,
    status: needsReview ? "pending" : "published",
    visibility,
    locationType: locationType as "in_person" | "online" | "hybrid",
    venueId,
    onlineUrl: locationType === "online" ? onlineUrl : null,
    startsAt,
    endsAt,
    timezone,
    ageGroup: get("ageGroup") || null,
    gender: get("gender") || null,
    level: get("level") || null,
    format: get("format") || null,
    needsOpponent: !listed && formData.get("needsOpponent") === "on",
    host: listed ? get("host") || sourceName : get("host") || null,
    sourceName: listed ? sourceName : null,
    sourceUrl: listed ? safeSourceUrl(sourceUrl) : null,
    scheduleUrl: listed ? safeSourceUrl(scheduleUrl) : null,
    listedBy: listed ? user.id : null,
    // No organizer on a listing: nobody here runs it. Claiming one later is
    // exactly what sets this.
    organizerId: listed ? null : user.id,
    hostTeamId,
  });

  redirect(`/events/${slug}`);
}

export async function approveEvent(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(events)
    // Only public events ever reach the queue, so this leaves visibility
    // alone rather than promoting whatever it finds.
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(events.slug, slug), eq(events.status, "pending")));
  redirect("/admin");
}

export async function rejectEvent(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(events)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(events.slug, slug), eq(events.status, "pending")));
  redirect("/admin");
}


/**
 * Change an event's visibility after the fact.
 *
 * It used to be write-once: whatever was chosen at submission stuck forever,
 * with no edit page, so an event posted publicly by mistake could not be
 * pulled back except by cancelling it.
 *
 * Open to whoever manages the event, not admins alone — the organizer is the
 * person who notices the mistake, and every visibility value is one they could
 * have picked at submission anyway.
 */
export async function setEventVisibility(
  slug: string,
  visibility: "public" | "unlisted" | "private",
): Promise<void> {
  if (!["public", "unlisted", "private"].includes(visibility)) return;
  if (!(await canManageEvent({ slug }))) return;

  const user = await getCurrentUser();
  const admin = isAdmin(user);

  // Making something public is the one direction that needs review, exactly as
  // it does at submission — otherwise this would be a way around the queue.
  const current = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { status: true },
  });
  if (!current) return;

  const status =
    visibility === "public" && !admin && current.status === "published"
      ? "pending"
      : current.status;

  await db
    .update(events)
    .set({ visibility, status, updatedAt: new Date() })
    .where(eq(events.slug, slug));

  revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
}


/**
 * Take an event down, or put it back. Admin only.
 *
 * Separate from visibility, which belongs to the organizer, and from
 * cancelling, which means the event is not happening rather than removed. Only
 * an admin can lift it, so an organizer cannot re-list a banned event by
 * flipping it to unlisted and passing the link around.
 */
export async function setEventHidden(
  slug: string,
  hidden: boolean,
): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  await db
    .update(events)
    .set({ hiddenAt: hidden ? new Date() : null, updatedAt: new Date() })
    .where(eq(events.slug, slug));

  revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  revalidatePath("/admin");
}

