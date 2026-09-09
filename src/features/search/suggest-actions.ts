"use server";

import { listClubs } from "@/features/clubs/queries";
import { listEvents } from "@/features/events/queries";
import { listTeams } from "@/features/teams/queries";

import { MIN_QUERY, PER_KIND, type Suggestion } from "./kinds";

/**
 * What somebody might be reaching for, while they are still typing it.
 *
 * Built on the section queries rather than a search of its own, so it
 * inherits their rules about who may see what — the same reason /search
 * reuses them. A suggestion list that showed a draft event, or a team its
 * owner had hidden, would be a hole in every one of those rules at once.
 *
 * Deliberately small. Three or four of each kind is what fits under a search
 * box without becoming a page in its own right, and anyone who wants the
 * whole list can press Enter, which is what the form has always done.
 */

/**
 * The same thing, narrowed to one directory.
 *
 * A section's own box should offer what that section holds: typing "crossfire"
 * on /teams wants teams, and an event three rows down is noise. The header and
 * /search are the two that reach across everything.
 */
export async function suggestTeams(q: string): Promise<Suggestion[]> {
  const text = q.trim();
  if (text.length < MIN_QUERY) return [];
  const teams = await listTeams({ q: text, window: { limit: PER_KIND * 2, offset: 0 } });
  return teams.rows.map((t) => ({
    kind: "team" as const,
    label: t.name,
    detail: t.club?.name ?? null,
    href: `/teams/${t.slug}`,
  }));
}

export async function suggestEvents(q: string): Promise<Suggestion[]> {
  const text = q.trim();
  if (text.length < MIN_QUERY) return [];
  const events = await listEvents({ q: text });
  return events.slice(0, PER_KIND * 2).map((e) => ({
    kind: "event" as const,
    label: e.title,
    detail: e.startsAt
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: e.timezone ?? undefined,
        }).format(e.startsAt)
      : null,
    href: `/events/${e.slug}`,
  }));
}

export async function suggestClubs(q: string): Promise<Suggestion[]> {
  const text = q.trim();
  if (text.length < MIN_QUERY) return [];
  const clubs = await listClubs(text, { limit: PER_KIND * 2, offset: 0 });
  return clubs.rows.map((c) => ({
    kind: "club" as const,
    label: c.name,
    detail: null,
    href: `/clubs/${c.slug}`,
  }));
}

export async function suggestAnything(q: string): Promise<Suggestion[]> {
  const text = q.trim();
  if (text.length < MIN_QUERY) return [];

  const [events, teams, clubs] = await Promise.all([
    listEvents({ q: text }),
    listTeams({ q: text, window: { limit: PER_KIND, offset: 0 } }),
    listClubs(text, { limit: PER_KIND, offset: 0 }),
  ]);

  return [
    ...events.slice(0, PER_KIND).map((e) => ({
      kind: "event" as const,
      label: e.title,
      detail: e.startsAt
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: e.timezone ?? undefined,
          }).format(e.startsAt)
        : null,
      href: `/events/${e.slug}`,
    })),
    ...teams.rows.map((t) => ({
      kind: "team" as const,
      label: t.name,
      detail: t.club?.name ?? null,
      href: `/teams/${t.slug}`,
    })),
    ...clubs.rows.map((c) => ({
      kind: "club" as const,
      label: c.name,
      detail: null,
      href: `/clubs/${c.slug}`,
    })),
  ];
}
