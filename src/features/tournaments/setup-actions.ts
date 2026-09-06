"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  eventDivisions,
  eventRegistrations,
  eventTeams,
  events,
  matches,
} from "@/db/schema";
import { canManageEvent } from "@/features/events/can-manage";

import { parseDivision } from "./division-input";
import { parseRules, type Rules } from "./rules-input";

/**
 * The result of a setup write.
 *
 * `values` carries back exactly what was submitted when validation fails.
 * React resets an uncontrolled form once its action completes, so without
 * this the fields snap back to what is stored and the organizer reads
 * "Roster minimum is above the maximum" above a minimum that plainly is not —
 * their typed values having vanished with the error that described them.
 */
export type SetupResult = {
  error?: string;
  ok?: boolean;
  values?: Record<string, string>;
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

async function eventFor(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, timezone: true, metadata: true },
  });
}

function revalidateEvent(slug: string) {
  for (const p of ["", "/setup", "/register", "/registrations", "/table", "/scores"]) {
    revalidatePath(`/events/${slug}${p}`);
  }
}

/**
 * Create or update one division.
 *
 * The same action for both, keyed on a divisionId that is present when
 * editing. Two near-identical actions would be two places to forget the same
 * validation.
 */
export async function saveDivision(
  slug: string,
  _prev: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  if (!(await canManageEvent({ slug }))) return { error: "Not allowed." };

  const event = await eventFor(slug);
  if (!event) return { error: "Event not found." };

  const raw = {
    name: str(formData, "name"),
    label: str(formData, "label"),
    birthYears: str(formData, "birthYears"),
    format: str(formData, "format"),
    rosterMin: str(formData, "rosterMin"),
    rosterMax: str(formData, "rosterMax"),
    fee: str(formData, "fee"),
    capacity: str(formData, "capacity"),
    opensAt: str(formData, "opensAt"),
    closesAt: str(formData, "closesAt"),
  };

  const parsed = parseDivision(
    raw,
    // Falling back to Seattle rather than UTC: an unset timezone on a local
    // league is a gap in old data, and reading a Seattle deadline as UTC
    // closes registration eight hours early.
    event.timezone ?? "America/Los_Angeles",
  );
  if (!parsed.ok) return { error: parsed.error, values: raw };

  const divisionId = str(formData, "divisionId");

  if (divisionId) {
    const owned = await db.query.eventDivisions.findFirst({
      where: and(
        eq(eventDivisions.id, divisionId),
        eq(eventDivisions.eventId, event.id),
      ),
      columns: { id: true },
    });
    if (!owned) return { error: "That division is gone.", values: raw };
    await db
      .update(eventDivisions)
      .set(parsed.value)
      .where(eq(eventDivisions.id, divisionId));
  } else {
    const clash = await db.query.eventDivisions.findFirst({
      where: and(
        eq(eventDivisions.eventId, event.id),
        eq(eventDivisions.name, parsed.value.name),
      ),
      columns: { id: true },
    });
    // Caught here rather than left to the unique constraint, which would
    // surface as an unhandled error page rather than a sentence.
    if (clash) {
      return { error: "There is already a division with that name.", values: raw };
    }

    await db.insert(eventDivisions).values({ eventId: event.id, ...parsed.value });
  }

  revalidateEvent(slug);
  return { ok: true };
}

/**
 * Remove a division, if nothing has happened in it yet.
 *
 * Teams, entries and fixtures all point at a division. Deleting one out from
 * under them would cascade entries away and leave matches and standings rows
 * orphaned — so an organizer who wants a division gone has to empty it first,
 * which is a decision rather than a click.
 */
export async function deleteDivision(
  slug: string,
  divisionId: string,
): Promise<SetupResult> {
  if (!(await canManageEvent({ slug }))) return { error: "Not allowed." };

  const event = await eventFor(slug);
  if (!event) return { error: "Event not found." };

  const [division, entry, team, match] = await Promise.all([
    db.query.eventDivisions.findFirst({
      where: and(
        eq(eventDivisions.id, divisionId),
        eq(eventDivisions.eventId, event.id),
      ),
      columns: { id: true },
    }),
    db.query.eventRegistrations.findFirst({
      where: eq(eventRegistrations.divisionId, divisionId),
      columns: { id: true },
    }),
    db.query.eventTeams.findFirst({
      where: eq(eventTeams.divisionId, divisionId),
      columns: { id: true },
    }),
    db.query.matches.findFirst({
      where: eq(matches.divisionId, divisionId),
      columns: { id: true },
    }),
  ]);

  if (!division) return { error: "That division is gone." };
  if (entry) return { error: "Teams have entered this division. Decline them first." };
  if (team) return { error: "Teams are in this division. Take them out first." };
  if (match) return { error: "This division has fixtures. Delete them first." };

  await db.delete(eventDivisions).where(eq(eventDivisions.id, divisionId));
  revalidateEvent(slug);
  return { ok: true };
}

/**
 * The competition rules, stored beside whatever else lives in metadata.
 *
 * Merged rather than replaced: sponsors live in the same JSON column, and an
 * organizer saving the rules should not silently drop them.
 */
export async function saveRules(
  slug: string,
  _prev: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  if (!(await canManageEvent({ slug }))) return { error: "Not allowed." };

  const event = await eventFor(slug);
  if (!event) return { error: "Event not found." };

  const raw = {
    gameFormat: str(formData, "gameFormat"),
    advancement: str(formData, "advancement"),
    roster: str(formData, "roster"),
    goalCap: str(formData, "goalCap"),
    periods: str(formData, "periods"),
    periodMinutes: str(formData, "periodMinutes"),
  };
  const tiebreakers = formData.getAll("tiebreakers").map(String);

  const parsed = parseRules({ ...raw, tiebreakers });
  if (!parsed.ok) {
    // The chosen tiebreakers ride back as a joined string; checkboxes are the
    // one field a plain string map cannot hold.
    return { error: parsed.error, values: { ...raw, tiebreakers: tiebreakers.join(",") } };
  }

  const existing = (event.metadata ?? {}) as Record<string, unknown>;
  const rules: Rules = parsed.value;

  await db
    .update(events)
    .set({ metadata: { ...existing, rules }, updatedAt: new Date() })
    .where(eq(events.id, event.id));

  revalidateEvent(slug);
  return { ok: true };
}
