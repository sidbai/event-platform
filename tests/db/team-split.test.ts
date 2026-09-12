/**
 * Splitting a team by event: what moves, what stays, what is refused.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventDivisions, eventTeams, events, matches, teamAliases, teams } = await import("@/db/schema");
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

    const out = await splitTeam(us, [{ eventId: cup, divisionId: null }], { name: "XF B13 Blue B" });
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
    const out = await splitTeam(us, [{ eventId: cup, divisionId: null }], { teamId: other });
    expect(out.target).toMatchObject({ id: other, created: false });
    const holders = (await db.select({ teamId: eventTeams.teamId }).from(eventTeams).where(eq(eventTeams.eventId, cup))).map((e) => e.teamId);
    expect(holders).toContain(other);
    expect(holders).not.toContain(us);

    // Now B holds the cup entry; moving it "to" C, who is already entered, is refused.
    await expect(splitTeam(other, [{ eventId: cup, divisionId: null }], { teamId: them })).rejects.toThrow(/already entered/);
  });

  it("refuses an event that is not the team's, and an empty pick", async () => {
    const cup = await event("cup");
    const [us, other] = [await team("A", "a"), await team("B", "b")];
    await db.insert(eventTeams).values([{ eventId: cup, teamId: other }]);
    await expect(splitTeam(us, [{ eventId: cup, divisionId: null }], { name: "New" })).rejects.toThrow(/not this team/);
    await expect(splitTeam(us, [], { name: "New" })).rejects.toThrow(/at least one/);
  });

  it("moves one flight's games out of an event where a merge left two sides under one entry", async () => {
    const cup = await event("cup");
    const [red, blue] = await Promise.all([
      db.insert(eventDivisions).values({ eventId: cup, name: "Boys U12 Red" }).returning({ id: eventDivisions.id }),
      db.insert(eventDivisions).values({ eventId: cup, name: "Boys U12 Blue" }).returning({ id: eventDivisions.id }),
    ]);
    const [us, them] = [await team("MRFC B14/15", "mrfc-b14-15"), await team("Them", "them")];
    // The entry is in Red; the Blue games arrived with a merge and have no entry.
    await db.insert(eventTeams).values([{ eventId: cup, teamId: us, divisionId: red[0].id, sourceName: "MRFC Academy" }]);
    await db.insert(matches).values([
      { eventId: cup, divisionId: red[0].id, homeTeamId: us, awayTeamId: them, homeScore: 1, awayScore: 0, sourceMatchId: "r1" },
      { eventId: cup, divisionId: blue[0].id, homeTeamId: them, awayTeamId: us, homeScore: 10, awayScore: 0, sourceMatchId: "b1" },
      { eventId: cup, divisionId: blue[0].id, homeTeamId: us, awayTeamId: them, homeScore: 0, awayScore: 3, sourceMatchId: "b2" },
    ]);

    const out = await splitTeam(us, [{ eventId: cup, divisionId: blue[0].id }], { name: "MRFC B14/15 Blue" });
    expect(out.moved).toMatchObject({ entries: 1, matches: 2, aliases: 0 });
    // Red stayed with its entry; Blue went, and the new team got an entry in the Blue flight.
    const redGame = await db.query.matches.findFirst({ where: eq(matches.sourceMatchId, "r1") });
    expect(redGame?.homeTeamId).toBe(us);
    const blueGames = await db.select().from(matches).where(eq(matches.divisionId, blue[0].id));
    expect(blueGames.every((m) => m.homeTeamId === out.target.id || m.awayTeamId === out.target.id)).toBe(true);
    const newEntry = await db.query.eventTeams.findFirst({ where: eq(eventTeams.teamId, out.target.id) });
    expect(newEntry?.divisionId).toBe(blue[0].id);
    const ourEntry = await db.query.eventTeams.findFirst({ where: eq(eventTeams.teamId, us) });
    expect(ourEntry?.divisionId).toBe(red[0].id);
  });
});
