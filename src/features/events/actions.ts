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

import { canManageEvent } from "./can-manage";

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

  const kind = get("kind");
  const title = get("title");
  const locationType = get("locationType") || "in_person";
  const date = get("date");
  const time = get("time");
  const venueName = get("venueName");
  const onlineUrl = get("onlineUrl");

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Give the event a name.";
  if (!kind) fieldErrors.kind = "Pick a kind.";
  if (!date) fieldErrors.date = "Pick a date.";
  if (locationType === "in_person" && !venueName)
    fieldErrors.venueName = "Where is it?";
  if (locationType === "online" && !onlineUrl)
    fieldErrors.onlineUrl = "Add a link.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const kindRow = await db.query.eventKinds.findFirst({
    where: eq(eventKinds.slug, kind),
  });
  if (!kindRow) return { fieldErrors: { kind: "Unknown kind." } };

  const startsAt = time
    ? new Date(`${date}T${time}`)
    : new Date(`${date}T00:00`);

  let venueId: string | null = null;
  if (locationType === "in_person") {
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
  let hostTeamId: string | null = null;
  const hostTeamSlug = get("hostTeam");
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
  const picked = get("visibility");
  const visibility = (
    ["public", "unlisted", "private"].includes(picked) ? picked : "public"
  ) as "public" | "unlisted" | "private";

  // Review exists to gate what reaches the public list. An unlisted or private
  // event isn't going there, so it would be pointless to make the organizer
  // wait for approval before they can even invite anyone.
  const needsReview = visibility === "public" && !admin;
  const slug = await uniqueSlug(slugify(title));

  await db.insert(events).values({
    slug,
    kind,
    modules: kindRow.defaultModules,
    title,
    summary: get("summary") || null,
    status: needsReview ? "pending" : "published",
    visibility,
    locationType: locationType as "in_person" | "online" | "hybrid",
    venueId,
    onlineUrl: locationType === "online" ? onlineUrl : null,
    startsAt,
    timezone: get("timezone") || "America/Los_Angeles",
    ageGroup: get("ageGroup") || null,
    gender: get("gender") || null,
    level: get("level") || null,
    format: get("format") || null,
    needsOpponent: formData.get("needsOpponent") === "on",
    organizerId: user.id,
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
