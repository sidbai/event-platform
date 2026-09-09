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
import { isPendingEventUrl } from "@/features/uploads/blob";
import { zonedDate } from "@/lib/dates";

import { canMarkCompleted, canReopen } from "./completion";
import { canManageEvent } from "./can-manage";
import { safeSourceUrl } from "./listing";
import { needsAdminReview } from "./review-rule";

export type EventFormResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /**
   * The submission, echoed back so a rejected form still has what was typed.
   *
   * React resets an uncontrolled form when its action resolves, so without
   * this a missing date emptied every other field with it — and the second
   * attempt was somebody retyping a venue address to fix one thing.
   */
  values?: Record<string, string>;
};

/** Every text field of the submission, for handing back with an error. */
function submitted(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

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

type ParsedEvent = {
  listed: boolean;
  kind: string;
  defaultModules: string[];
  title: string;
  summary: string | null;
  locationType: "in_person" | "online" | "hybrid";
  onlineUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  venueId: string | null;
  ageGroup: string | null;
  gender: string | null;
  level: string | null;
  format: string | null;
  needsOpponent: boolean;
  host: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  scheduleUrl: string | null;
};

/**
 * Everything both making an event and editing one have to work out.
 *
 * Extracted rather than copied. The listing path was already 69% the same
 * code as the running-it path and got folded into one action for that reason;
 * an edit form reading the same fields would have been the third copy, and
 * this repository has been bitten twice by exactly that — three unique-slug
 * loops that disagreed on their retry count, two ways of adding a team that
 * produced different teams.
 *
 * What it deliberately does not decide: the slug, the status, who owns the
 * event. Those are set once when it is made and are not the form's business.
 */
async function parseEventForm(
  formData: FormData,
): Promise<{ fieldErrors: Record<string, string> } | { fields: ParsedEvent }> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

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

  /*
   * Read in the event's own zone, not the server's.
   *
   * `new Date("2026-08-29T09:00")` uses whatever timezone the process runs in.
   * That is Seattle on a laptop and UTC on Vercel, so a 9am kickoff typed by
   * an organizer was being stored as 9am UTC and shown back to them as 2am.
   */
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

  return {
    fields: {
      listed,
      kind,
      defaultModules: kindRow.defaultModules,
      title,
      summary: get("summary") || null,
      locationType: locationType as "in_person" | "online" | "hybrid",
      onlineUrl: locationType === "online" ? onlineUrl : null,
      startsAt,
      endsAt,
      timezone,
      venueId,
      ageGroup: get("ageGroup") || null,
      gender: get("gender") || null,
      level: get("level") || null,
      format: get("format") || null,
      needsOpponent: !listed && formData.get("needsOpponent") === "on",
      host: listed ? get("host") || sourceName : get("host") || null,
      sourceName: listed ? sourceName : null,
      sourceUrl: listed ? safeSourceUrl(sourceUrl) : null,
      scheduleUrl: listed ? safeSourceUrl(scheduleUrl) : null,
    },
  };
}

/**
 * Both form actions hand the submission back with whatever went wrong.
 *
 * Success redirects, so anything these return is a failure — which is what
 * makes one wrapper enough for every rejection path inside them.
 */
export async function submitEvent(
  prev: EventFormResult,
  formData: FormData,
): Promise<EventFormResult> {
  const out = await createEvent(prev, formData);
  return { ...out, values: submitted(formData) };
}

export async function updateEvent(
  slug: string,
  prev: EventFormResult,
  formData: FormData,
): Promise<EventFormResult> {
  const out = await applyEventEdit(slug, prev, formData);
  return { ...out, values: submitted(formData) };
}

async function createEvent(
  _prev: EventFormResult,
  formData: FormData,
): Promise<EventFormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to submit an event." };

  const gate = await checkRateLimit("event:create", user);
  if (!gate.ok) return { error: gate.message };

  const parsed = await parseEventForm(formData);
  if ("fieldErrors" in parsed) return parsed;
  const f = parsed.fields;

  // Hosting for a team: only its owner/manager/coach may put events on its
  // calendar, so a forged slug in the form gets dropped rather than trusted.
  // Never on a listing — nobody here hosts somebody else's tournament.
  let hostTeamId: string | null = null;
  const hostTeamSlug = f.listed ? "" : String(formData.get("hostTeam") ?? "").trim();
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
  const picked = f.listed ? "public" : String(formData.get("visibility") ?? "").trim();
  const visibility = (
    ["public", "unlisted", "private"].includes(picked) ? picked : "public"
  ) as "public" | "unlisted" | "private";

  const needsReview = needsAdminReview(f.kind, visibility, admin);
  const slug = await uniqueSlug(slugify(f.title));

  // Only a mark this form just staged. Anything else is dropped rather than
  // refused — a bad URL should not cost somebody the rest of the form, and an
  // arbitrary one would let a new event point at a live event's file.
  const staged = String(formData.get("logoUrl") ?? "").trim();
  const logoUrl = staged && isPendingEventUrl(staged) ? staged : null;

  const [created] = await db
    .insert(events)
    .values({
    slug,
    kind: f.kind,
    // A listing runs nothing here, so it gets none of the modules that offer
    // entries, rosters or a table.
    modules: f.listed ? [] : f.defaultModules,
    title: f.title,
    summary: f.summary,
    status: needsReview ? "pending" : "published",
    visibility,
    locationType: f.locationType,
    venueId: f.venueId,
    onlineUrl: f.onlineUrl,
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    timezone: f.timezone,
    ageGroup: f.ageGroup,
    gender: f.gender,
    level: f.level,
    format: f.format,
    needsOpponent: f.needsOpponent,
    host: f.host,
    sourceName: f.sourceName,
    sourceUrl: f.sourceUrl,
    scheduleUrl: f.scheduleUrl,
    logoUrl,
    listedBy: f.listed ? user.id : null,
    // No organizer on a listing: nobody here runs it. Claiming one later is
    // exactly what sets this.
    organizerId: f.listed ? null : user.id,
    hostTeamId,
    })
    .returning({ id: events.id });

  /*
   * The schedule, if one came with the form.
   *
   * After the insert, never inside it: a fixture needs an event to belong to.
   * And after the redirect target is known, so a refusal — the date guard is
   * the likely one — lands the person on the event page, where the same box
   * is waiting with the file picker rather than sending them back to build
   * the listing again.
   */
  const schedule = String(formData.get("schedule") ?? "").trim();
  if (schedule) {
    const { applyPastedText } = await import("@/features/sync/actions");
    const out = await applyPastedText(
      { id: created.id, slug, startsAt: f.startsAt, endsAt: f.endsAt },
      { text: schedule },
    );
    if (out.error) redirect(`/events/${slug}?import=${encodeURIComponent(out.error)}`);
    redirect(`/events/${slug}?imported=${encodeURIComponent(out.detail ?? "")}`);
  }

  redirect(`/events/${slug}`);
}

/**
 * Change an event's own details after the fact.
 *
 * Whoever manages it: the organizer who typed the wrong date, or an admin
 * fixing a listing somebody entered from a flyer. Until now nothing could —
 * an event's title, summary, dates and venue were written once at submission
 * and there was no page that could touch them again.
 *
 * Four things it deliberately leaves alone.
 *
 * The slug, because it is the URL: people have the link, and a title fixed
 * from "Labour" to "Labor" is not a reason to break every link to it.
 *
 * Who runs it. Turning a listing into an event we run rewrites what the page
 * offers, who owns it and which modules it has — that is claiming, which is
 * its own thing, not a field on a form.
 *
 * Visibility, which has its own control on the page with its own rule about
 * review. Two paths writing it would be two rules, and one of them would be
 * the wrong one.
 *
 * And the status. A non-admin editing a public event does not send it back to
 * the review queue: pulling a live tournament off the list because its
 * organizer fixed a typo is a worse failure than the spam it would prevent,
 * and an admin can already take an event down.
 */
async function applyEventEdit(
  slug: string,
  _prev: EventFormResult,
  formData: FormData,
): Promise<EventFormResult> {
  if (!(await canManageEvent({ slug }))) {
    return { error: "You can't edit this event." };
  }

  const current = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, sourceName: true },
  });
  if (!current) return { error: "That event is gone." };

  const parsed = await parseEventForm(formData);
  if ("fieldErrors" in parsed) return parsed;
  const f = parsed.fields;

  // What it already is, not what the form says. A listing stays a listing.
  const listed = current.sourceName !== null;

  await db
    .update(events)
    .set({
      kind: f.kind,
      title: f.title,
      summary: f.summary,
      locationType: f.locationType,
      venueId: f.venueId,
      onlineUrl: f.onlineUrl,
      startsAt: f.startsAt,
      endsAt: f.endsAt,
      timezone: f.timezone,
      ageGroup: f.ageGroup,
      gender: f.gender,
      level: f.level,
      format: f.format,
      needsOpponent: f.needsOpponent,
      host: f.host,
      ...(listed
        ? {
            sourceName: f.sourceName,
            sourceUrl: f.sourceUrl,
            scheduleUrl: f.scheduleUrl,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(events.id, current.id));

  revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
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
 * Mark an event finished, or put it back.
 *
 * "Completed" already carried meaning — a Final results tag, a page that opens
 * on the table rather than the fixture list, a listing that stays up because a
 * finished tournament is a destination rather than an expired advert. Nothing
 * could set it: only the admin review queue ever wrote a status, so every
 * event stayed "published" forever and the distinction was decorative.
 *
 * Whoever manages the event, not admins alone. The organizer is the person
 * who knows the last whistle went, and this says nothing an admin needs to
 * approve — it is a statement about the past, not a request to publish
 * something.
 *
 * Deliberately not automatic. A tournament whose last day has passed is
 * usually over, but "usually" is how a league with a rain-delayed final gets
 * archived while it is still being played. The page offers; a person decides.
 */
export async function setEventCompleted(
  slug: string,
  completed: boolean,
): Promise<void> {
  if (!(await canManageEvent({ slug }))) return;

  const current = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { status: true },
  });
  if (!current) return;

  // Only between running and finished. A draft was never announced, a pending
  // one is not approved, and a cancelled event did not finish — it did not
  // happen, which the page already says differently.
  const allowed = completed
    ? canMarkCompleted(current.status)
    : canReopen(current.status);
  if (!allowed) return;

  await db
    .update(events)
    .set({ status: completed ? "completed" : "published", updatedAt: new Date() })
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

