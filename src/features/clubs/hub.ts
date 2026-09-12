import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, events, teams } from "@/db/schema";

/**
 * What a club page says about a club beyond its reviews.
 *
 * The leagues come from the schedules: a club is "in the ECNL" because its
 * teams have entries in the ECNL season here, which is a fact the site can
 * stand behind, unlike a line on a website. The tiers and the naming come
 * from the club's own website via the knowledge base, and are labelled as
 * such where they show.
 */

/** "ECNL League - Northwest Conference" → "ECNL". The short name a parent uses. */
export function leagueLabel(title: string): string {
  const t = title.toLowerCase();
  if (/pre-?ecnl/.test(t)) return "Pre-ECNL";
  if (/ecnl[ -]?rl|regional league/.test(t)) return "ECNL RL";
  if (/ecnl/.test(t)) return "ECNL";
  if (/elite academy|\bea\b/.test(t)) return "Elite Academy";
  if (/\brcl\b|regional club league/.test(t)) return "RCL";
  if (/\bwpl\b|washington premier league/.test(t)) return "WPL";
  if (/girls academy|\bga\b/.test(t)) return "Girls Academy";
  if (/npsl|north puget sound/.test(t)) return "NPSL";
  if (/mls next/.test(t)) return "MLS NEXT";
  return title;
}

export type ClubLeague = { slug: string; title: string; label: string; teams: number };

/** The league seasons each club has teams in, by club id, most teams first. */
export async function leaguesByClub(clubIds: string[]): Promise<Map<string, ClubLeague[]>> {
  const out = new Map<string, ClubLeague[]>();
  if (clubIds.length === 0) return out;
  const rows = await db
    .select({
      clubId: teams.clubId,
      slug: events.slug,
      title: events.title,
      n: sql<number>`count(distinct ${teams.id})::int`,
    })
    .from(eventTeams)
    .innerJoin(events, eq(events.id, eventTeams.eventId))
    .innerJoin(teams, eq(teams.id, eventTeams.teamId))
    .where(and(eq(events.kind, "league"), inArray(teams.clubId, clubIds)))
    .groupBy(teams.clubId, events.slug, events.title)
    .orderBy(desc(sql`count(distinct ${teams.id})`), asc(events.title));
  for (const r of rows) {
    if (!r.clubId) continue;
    const list = out.get(r.clubId) ?? [];
    list.push({ slug: r.slug, title: r.title, label: leagueLabel(r.title), teams: r.n });
    out.set(r.clubId, list);
  }
  return out;
}

/** How many teams each club has here, by club id. */
export async function teamCountsByClub(clubIds: string[]): Promise<Map<string, number>> {
  if (clubIds.length === 0) return new Map();
  const rows = await db
    .select({ clubId: teams.clubId, n: sql<number>`count(*)::int` })
    .from(teams)
    .where(inArray(teams.clubId, clubIds))
    .groupBy(teams.clubId);
  return new Map(rows.flatMap((r) => (r.clubId ? [[r.clubId, r.n] as const] : [])));
}

export type ClubTeam = {
  id: string;
  slug: string;
  name: string;
  gender: string | null;
  birthYears: number[];
  tier: string | null;
  program: string | null;
  /** The head coach the latest league listing named, where one did. */
  coach: string | null;
  events: number;
};

/**
 * A club's teams with what the site knows about each: the cohort, the tier,
 * the head coach a league last listed, and how many events they have been
 * seen in. Youngest cohort last, as a club's own list reads.
 */
export async function clubTeamsDetailed(clubId: string): Promise<ClubTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      gender: teams.gender,
      birthYears: teams.birthYears,
      tier: teams.tier,
      program: teams.program,
      events: sql<number>`(select count(*) from ${eventTeams} et where et.team_id = ${teams.id})::int`,
    })
    .from(teams)
    .where(eq(teams.clubId, clubId))
    .orderBy(asc(teams.gender), desc(sql`${teams.birthYears}[1]`), asc(teams.name));

  if (rows.length === 0) return [];
  const listed = await db
    .select({ teamId: eventTeams.teamId, coach: eventTeams.coach, startsAt: events.startsAt })
    .from(eventTeams)
    .innerJoin(events, eq(events.id, eventTeams.eventId))
    .where(and(inArray(eventTeams.teamId, rows.map((r) => r.id)), isNotNull(eventTeams.coach)))
    .orderBy(desc(events.startsAt));
  const coachByTeam = new Map<string, string>();
  for (const l of listed) if (l.coach && !coachByTeam.has(l.teamId)) coachByTeam.set(l.teamId, l.coach);

  return rows.map((r) => ({ ...r, coach: coachByTeam.get(r.id) ?? null }));
}
