import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { eventOffers, eventRegistrations, eventTeams, matches, teamAliases, teams } from "@/db/schema";
import { slugify } from "@/lib/slug";

import { normaliseTeamName } from "./merge-plan";

export type SplitTarget = { teamId: string } | { name: string };

/**
 * What to move: an event, and within it a division.
 *
 * By division and not by event alone, because a merge that folded two
 * sides entered in the same event kept one entry and dropped the other —
 * the A side's Red-flight games and the B side's Blue-flight games then
 * sit under one team, and "move the event" would take both. A null
 * division is the games that have none.
 */
export type SplitPick = { eventId: string; divisionId: string | null };

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
  picks: SplitPick[],
  target: SplitTarget,
): Promise<SplitResult> {
  const keyOf = (p: SplitPick) => `${p.eventId}:${p.divisionId ?? ""}`;
  const chosen = new Map(picks.map((p) => [keyOf(p), p]));
  if (chosen.size === 0) throw new Error("Pick at least one event to move.");
  const ids = [...new Set(picks.map((p) => p.eventId))];

  const source = await db.query.teams.findFirst({ where: eq(teams.id, sourceId) });
  if (!source) throw new Error("That team is gone.");

  // The team's own entries in those events, and the games it has there —
  // which may be in a division the entry is not, after a merge.
  const entries = await db.query.eventTeams.findMany({
    where: and(eq(eventTeams.teamId, sourceId), inArray(eventTeams.eventId, ids)),
  });
  const games = await db
    .select({ id: matches.id, eventId: matches.eventId, divisionId: matches.divisionId, homeTeamId: matches.homeTeamId })
    .from(matches)
    .where(and(inArray(matches.eventId, ids), or(eq(matches.homeTeamId, sourceId), eq(matches.awayTeamId, sourceId))));
  for (const p of picks) {
    const hasEntry = entries.some((e) => e.eventId === p.eventId && (e.divisionId ?? null) === p.divisionId);
    const hasGames = games.some((g) => g.eventId === p.eventId && (g.divisionId ?? null) === p.divisionId);
    if (!hasEntry && !hasGames) throw new Error("One of those is not this team's.");
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
      // …unless the pick carries no entry of its own (a merge dropped it),
      // in which case the games simply join the target's existing entry.
      const entryEvents = entries
        .filter((e) => chosen.has(keyOf({ eventId: e.eventId, divisionId: e.divisionId ?? null })))
        .map((e) => e.eventId);
      const clash = entryEvents.length
        ? await tx.query.eventTeams.findFirst({
            where: and(eq(eventTeams.teamId, existing.id), inArray(eventTeams.eventId, entryEvents)),
            with: { event: { columns: { title: true } } },
          })
        : null;
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
    for (const p of picks) {
      const key = keyOf(p);
      const entry = entries.find((e) => e.eventId === p.eventId && (e.divisionId ?? null) === p.divisionId);
      const picked = games.filter((g) => keyOf({ eventId: g.eventId, divisionId: g.divisionId ?? null }) === key);
      const pickedIds = picked.map((g) => g.id);

      if (entry) {
        await tx.update(eventTeams).set({ teamId: to.id }).where(eq(eventTeams.id, entry.id));
        moved.entries++;
      } else if (!("teamId" in target) || !(await tx.query.eventTeams.findFirst({ where: and(eq(eventTeams.eventId, p.eventId), eq(eventTeams.teamId, to.id)) }))) {
        // Games with no entry of their own — a merge dropped it. The target
        // gets one so the event's table has the side in it.
        await tx.insert(eventTeams).values({ eventId: p.eventId, teamId: to.id, divisionId: p.divisionId }).onConflictDoNothing();
        moved.entries++;
      }

      if (pickedIds.length > 0) {
        const home = await tx
          .update(matches)
          .set({ homeTeamId: to.id })
          .where(and(inArray(matches.id, pickedIds), eq(matches.homeTeamId, sourceId)))
          .returning({ id: matches.id });
        const away = await tx
          .update(matches)
          .set({ awayTeamId: to.id })
          .where(and(inArray(matches.id, pickedIds), eq(matches.awayTeamId, sourceId)))
          .returning({ id: matches.id });
        moved.matches += home.length + away.length;
      }

      // Registrations and offers are per event, not per division; they go
      // with the entry, which is to say with the pick that carries it.
      if (entry) {
        const regs = await tx
          .update(eventRegistrations)
          .set({ teamId: to.id })
          .where(and(eq(eventRegistrations.eventId, p.eventId), eq(eventRegistrations.teamId, sourceId)))
          .returning({ id: eventRegistrations.id });
        moved.registrations += regs.length;
        const offers = await tx
          .update(eventOffers)
          .set({ fromTeamId: to.id })
          .where(and(eq(eventOffers.eventId, p.eventId), eq(eventOffers.fromTeamId, sourceId)))
          .returning({ id: eventOffers.id });
        moved.offers += offers.length;
      }

      if (entry?.sourceName) {
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
