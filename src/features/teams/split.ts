import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { eventOffers, eventRegistrations, eventTeams, matches, teamAliases, teams } from "@/db/schema";
import { slugify } from "@/lib/slug";

import { normaliseTeamName } from "./merge-plan";

export type SplitTarget = { teamId: string } | { name: string };

export type SplitResult = {
  target: { id: string; slug: string; name: string; created: boolean };
  moved: { entries: number; matches: number; registrations: number; offers: number; aliases: number };
};

/**
 * Take some of a team's events — entries, fixtures, results — and give them
 * to another team, or to a new one.
 *
 * The other half of merging. A merge that folded two sides into one is
 * undone by the journal (unmerge.ts) only while it is the last thing that
 * happened to them; a season later, with new events landed on the merged
 * row, the way apart is by event: these tournaments were the B team's, the
 * rest stay. Nothing is deleted. The entry moves with its roster, the games
 * in that event move with it, and the row that had them keeps everything
 * else.
 *
 * The name each moved event published for the side is aliased to the
 * target, so the next import of a name like it lands there and not back on
 * the row it was just taken off. That is the one write here that is a
 * decision rather than a move, and it is the admin's, made by choosing.
 */
export async function splitTeam(
  sourceId: string,
  eventIds: string[],
  target: SplitTarget,
): Promise<SplitResult> {
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) throw new Error("Pick at least one event to move.");

  const source = await db.query.teams.findFirst({ where: eq(teams.id, sourceId) });
  if (!source) throw new Error("That team is gone.");

  const entries = await db.query.eventTeams.findMany({
    where: and(eq(eventTeams.teamId, sourceId), inArray(eventTeams.eventId, ids)),
  });
  if (entries.length !== ids.length) {
    throw new Error("One of those events is not this team's.");
  }

  return db.transaction(async (tx) => {
    let to: { id: string; slug: string; name: string; created: boolean };
    if ("teamId" in target) {
      if (target.teamId === sourceId) throw new Error("That is the same team.");
      const existing = await tx.query.teams.findFirst({ where: eq(teams.id, target.teamId) });
      if (!existing) throw new Error("That team is gone.");
      // One entry per team per event: a target already in one of these
      // events would need two, and which of the two rosters and records to
      // keep is not a question a move can answer.
      const clash = await tx.query.eventTeams.findFirst({
        where: and(eq(eventTeams.teamId, existing.id), inArray(eventTeams.eventId, ids)),
        with: { event: { columns: { title: true } } },
      });
      if (clash) throw new Error(`${existing.name} is already entered in ${clash.event.title}.`);
      to = { id: existing.id, slug: existing.slug, name: existing.name, created: false };
    } else {
      const name = target.name.trim();
      if (name.length < 3) throw new Error("Give the new team a name.");
      const slug = await freeSlug(slugify(name) || "team");
      // The facts the two halves share — club, age, gender, tier — carry
      // over; they were one row because they matched on exactly these.
      const [made] = await tx
        .insert(teams)
        .values({
          name,
          slug,
          clubId: source.clubId,
          affiliation: source.affiliation,
          birthYears: source.birthYears,
          ageGroup: source.ageGroup,
          tier: source.tier,
          program: source.program,
          gender: source.gender,
          city: source.city,
          visibility: source.visibility,
          originEventId: ids[0],
        })
        .returning({ id: teams.id, slug: teams.slug, name: teams.name });
      to = { ...made, created: true };
    }

    const moved = { entries: 0, matches: 0, registrations: 0, offers: 0, aliases: 0 };
    for (const entry of entries) {
      await tx.update(eventTeams).set({ teamId: to.id }).where(eq(eventTeams.id, entry.id));
      moved.entries++;

      const home = await tx
        .update(matches)
        .set({ homeTeamId: to.id })
        .where(and(eq(matches.eventId, entry.eventId), eq(matches.homeTeamId, sourceId)))
        .returning({ id: matches.id });
      const away = await tx
        .update(matches)
        .set({ awayTeamId: to.id })
        .where(and(eq(matches.eventId, entry.eventId), eq(matches.awayTeamId, sourceId)))
        .returning({ id: matches.id });
      moved.matches += home.length + away.length;

      const regs = await tx
        .update(eventRegistrations)
        .set({ teamId: to.id })
        .where(and(eq(eventRegistrations.eventId, entry.eventId), eq(eventRegistrations.teamId, sourceId)))
        .returning({ id: eventRegistrations.id });
      moved.registrations += regs.length;

      const offers = await tx
        .update(eventOffers)
        .set({ fromTeamId: to.id })
        .where(and(eq(eventOffers.eventId, entry.eventId), eq(eventOffers.fromTeamId, sourceId)))
        .returning({ id: eventOffers.id });
      moved.offers += offers.length;

      if (entry.sourceName) {
        const alias = normaliseTeamName(entry.sourceName);
        if (alias) {
          await tx
            .insert(teamAliases)
            .values({ alias, teamId: to.id })
            .onConflictDoUpdate({ target: teamAliases.alias, set: { teamId: to.id } });
          moved.aliases++;
        }
      }
    }
    return { target: to, moved };
  });
}

async function freeSlug(base: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.query.teams.findFirst({ where: eq(teams.slug, candidate), columns: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}
