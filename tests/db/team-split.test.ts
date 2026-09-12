/**
 * Splitting a team by event: what moves, what stays, what is refused.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventTeams, events, matches, teamAliases, teams } = await import("@/db/schema");
const { splitTeam } = await import("@/features/teams/split");
const { normaliseTeamName } = await import("@/features/teams/merge-plan");
const { eq } = await import("drizzle-orm");

async function event(slug: string) {
  const [e] = await db
    .insert(events)
    .values({
      slug,
      title: slug,
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-01T16:00:00Z"),
    })
    .returning({ id: events.id });
  return e.id;
}
async function team(name: string, slug: string) {
  const [t] = await db.insert(teams).values({ name, slug, visibility: "public" }).returning({ id: teams.id });
  return t.id;
}

beforeEach(async () => {
  await truncateAll(db);
});

describe("splitTeam", () => {
  it("moves the ticked event's entry, games and published name to a new team, and leaves the rest", async () => {
    const [cup, league] = [await event("cup"), await event("league")];
    const [us, them] = [await team("XF B13 Blue", "xf-b13-blue"), await team("Them", "them")];
    await db.insert(eventTeams).values([
      { eventId: cup, teamId: us, sourceName: "XF B13 Blue B" },
      { eventId: league, teamId: us, sourceName: "XF B13 Blue" },
      { eventId: cup, teamId: them },
    ]);
    await db.insert(matches).values([
      { eventId: cup, homeTeamId: us, awayTeamId: them, homeScore: 2, awayScore: 1, sourceMatchId: "c1" },
      { eventId: cup, homeTeamId: them, awayTeamId: us, homeScore: 0, awayScore: 0, sourceMatchId: "c2" },
      { eventId: league, homeTeamId: us, awayTeamId: them, sourceMatchId: "l1" },
    ]);

    const out = await splitTeam(us, [cup], { name: "XF B13 Blue B" });
    expect(out.target.created).toBe(true);
    expect(out.target.slug).toBe("xf-b13-blue-b");
    expect(out.moved).toEqual({ entries: 1, matches: 2, registrations: 0, offers: 0, aliases: 1 });

    const cupEntries = await db.select({ teamId: eventTeams.teamId }).from(eventTeams).where(eq(eventTeams.eventId, cup));
    expect(cupEntries.map((e) => e.teamId).sort()).toEqual([out.target.id, them].sort());
    const cupGames = await db.select().from(matches).where(eq(matches.eventId, cup));
    expect(cupGames.every((m) => m.homeTeamId === out.target.id || m.awayTeamId === out.target.id)).toBe(true);
    expect(cupGames.some((m) => m.homeTeamId === us || m.awayTeamId === us)).toBe(false);
    // The league stayed.
    const leagueGame = await db.query.matches.findFirst({ where: eq(matches.eventId, league) });
    expect(leagueGame?.homeTeamId).toBe(us);
    // The name the cup published now means the new team.
    const alias = await db.query.teamAliases.findFirst({ where: eq(teamAliases.teamId, out.target.id) });
    expect(alias?.alias).toBe(normaliseTeamName("XF B13 Blue B"));
  });

  it("moves to an existing team, and refuses one already entered in that event", async () => {
    const cup = await event("cup");
    const [us, other, them] = [await team("A", "a"), await team("B", "b"), await team("C", "c")];
    await db.insert(eventTeams).values([
      { eventId: cup, teamId: us },
      { eventId: cup, teamId: them },
    ]);
    const out = await splitTeam(us, [cup], { teamId: other });
    expect(out.target).toMatchObject({ id: other, created: false });
    const holders = (await db.select({ teamId: eventTeams.teamId }).from(eventTeams).where(eq(eventTeams.eventId, cup))).map((e) => e.teamId);
    expect(holders).toContain(other);
    expect(holders).not.toContain(us);

    // Now B holds the cup entry; moving it "to" C, who is already entered, is refused.
    await expect(splitTeam(other, [cup], { teamId: them })).rejects.toThrow(/already entered/);
  });

  it("refuses an event that is not the team's, and an empty pick", async () => {
    const cup = await event("cup");
    const [us, other] = [await team("A", "a"), await team("B", "b")];
    await db.insert(eventTeams).values([{ eventId: cup, teamId: other }]);
    await expect(splitTeam(us, [cup], { name: "New" })).rejects.toThrow(/not this team/);
    await expect(splitTeam(us, [], { name: "New" })).rejects.toThrow(/at least one/);
  });
});
