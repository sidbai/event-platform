"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  eventTeams,
  events,
  matches,
  matchStage,
  matchStatus,
  teams,
} from "@/db/schema";
import { canManageEvent } from "@/features/events/can-manage";
import { zonedDate } from "@/lib/dates";
import { slugify } from "@/lib/slug";

export type ScoreResult = { error?: string; ok?: boolean };

const STATUSES = new Set<string>(matchStatus.enumValues);

function parseScore(v: FormDataEntryValue | null): number | null | "bad" {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : "bad";
}

async function touchEvent(eventId: string, slug: string) {
  await db
    .update(events)
    .set({ updatedAt: new Date() })
    .where(eq(events.id, eventId));
  revalidatePath(`/events/${slug}`);
  revalidatePath(`/events/${slug}/scores`);
}

export async function saveMatch(
  eventSlug: string,
  matchId: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { event: { columns: { slug: true } } },
  });
  if (!match || match.event.slug !== eventSlug) return { error: "Match not found." };

  const home = parseScore(formData.get("homeScore"));
  const away = parseScore(formData.get("awayScore"));
  if (home === "bad" || away === "bad") return { error: "Scores are whole numbers 0–99." };
  if ((home === null) !== (away === null)) return { error: "Enter both scores or neither." };

  const status = String(formData.get("status") ?? "scheduled");
  const homeTeamId = (formData.get("homeTeamId") as string) || null;
  const awayTeamId = (formData.get("awayTeamId") as string) || null;
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    return { error: "Home and away can't be the same team." };
  }

  await db
    .update(matches)
    .set({
      homeScore: home,
      awayScore: away,
      status: STATUSES.has(status)
        ? (status as (typeof matchStatus.enumValues)[number])
        : "scheduled",
      ...(formData.has("homeTeamId") ? { homeTeamId } : {}),
      ...(formData.has("awayTeamId") ? { awayTeamId } : {}),
    })
    .where(eq(matches.id, matchId));

  await touchEvent(match.eventId, eventSlug);
  return { ok: true };
}

export async function addMatch(
  eventSlug: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true, startsAt: true, timezone: true },
  });
  if (!event) return { error: "Event not found." };

  const roundKey = String(formData.get("round") ?? "group");
  const stage: (typeof matchStage.enumValues)[number] =
    roundKey === "group" ? "group" : "ko";
  const groupLabel =
    roundKey === "group"
      ? String(formData.get("groupLabel") ?? "").trim() || null
      : null;

  const homeTeamId = (formData.get("homeTeamId") as string) || null;
  const awayTeamId = (formData.get("awayTeamId") as string) || null;
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    return { error: "Pick two different teams." };
  }

  const time = String(formData.get("time") ?? "").trim();
  const dateISO = event.startsAt
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: event.timezone ?? undefined,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(event.startsAt)
    : null;

  await db.insert(matches).values({
    eventId: event.id,
    divisionId: (formData.get("divisionId") as string) || null,
    stage,
    round: roundKey,
    groupLabel,
    field: String(formData.get("field") ?? "").trim() || null,
    kickoffAt: time && dateISO ? zonedDate(dateISO, time, event.timezone) : null,
    homeTeamId,
    awayTeamId,
    homePlaceholder: homeTeamId ? null : String(formData.get("homePlaceholder") ?? "").trim() || "TBD",
    awayPlaceholder: awayTeamId ? null : String(formData.get("awayPlaceholder") ?? "").trim() || "TBD",
    status: "scheduled",
  });

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}

export async function addTeamToEvent(
  eventSlug: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Team name?" };
  const divisionId = (formData.get("divisionId") as string) || null;
  const groupLabel = String(formData.get("groupLabel") ?? "").trim() || null;

  const base = slugify(name) || "team";
  let slug = base;
  for (let i = 0; i < 60; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.query.teams.findFirst({
      where: eq(teams.slug, candidate),
      columns: { id: true },
    });
    if (!clash) {
      slug = candidate;
      break;
    }
  }

  const [team] = await db
    .insert(teams)
    .values({
      slug,
      name,
      visibility: "private",
      originEventId: event.id,
    })
    .returning({ id: teams.id });

  await db
    .insert(eventTeams)
    .values({ eventId: event.id, teamId: team.id, divisionId, groupLabel })
    .onConflictDoNothing();

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}

export async function deleteMatch(
  eventSlug: string,
  matchId: string,
): Promise<void> {
  if (!(await canManageEvent({ slug: eventSlug }))) return;

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { event: { columns: { slug: true, id: true } } },
  });
  if (!match || match.event.slug !== eventSlug) return;

  await db.delete(matches).where(eq(matches.id, matchId));
  await touchEvent(match.event.id, eventSlug);
}
