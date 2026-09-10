/**
 * Folding duplicate team rows into one, against a real Postgres.
 *
 * The interesting parts of a merge are all constraints: a team may appear once
 * per event, once per division's registrations, once per event's offers. Two
 * rows of the same real side landing in the same event is exactly when those
 * bite, and no pure test can see them — the planner is tested separately and
 * happily proposes merges the database would reject.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { eventKinds, eventTeams, events, matches, teamMerges, teamSlugs, teams, users } =
  await import("@/db/schema");
const { mergeTeams, teamBySoleOldSlug } = await import("@/features/teams/merge");
const { planUnmerge, unmergeTeam } = await import("@/features/teams/unmerge");
const { duplicateTeamGroups } = await import("@/features/teams/merge-queries");
const { teamAliases } = await import("@/db/schema");
const { eq, sql } = await import("drizzle-orm");

async function makeEvent(slug: string) {
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
      startsAt: new Date("2026-06-20T16:00:00Z"),
    })
    .returning({ id: events.id });
  return e.id;
}

async function makeTeam(slug: string, over: Record<string, unknown> = {}) {
  const [t] = await db
    .insert(teams)
    .values({ slug, name: slug, visibility: "private", ...over })
    .returning({ id: teams.id });
  return t.id;
}

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
  await db.delete(teamSlugs);
});

describe("mergeTeams", () => {
  it("brings a team's history together under one row", async () => {
    const june = await makeEvent("june-cup");
    const august = await makeEvent("august-cup");
    const keep = await makeTeam("xf-u12");
    const dupe = await makeTeam("xf-u12-2");
    const rival = await makeTeam("rival");

    await db.insert(eventTeams).values([
      { eventId: june, teamId: keep },
      { eventId: august, teamId: dupe },
    ]);
    await db.insert(matches).values([
      { eventId: june, stage: "group", homeTeamId: keep, awayTeamId: rival, homeScore: 3, awayScore: 1, status: "final" },
      { eventId: august, stage: "group", homeTeamId: rival, awayTeamId: dupe, homeScore: 0, awayScore: 2, status: "final" },
    ]);

    const out = await mergeTeams(keep, [dupe]);

    expect(out).toMatchObject({ merged: 1, matchesMoved: 1, entriesMoved: 1 });
    const mine = await db.select().from(matches).where(eq(matches.awayTeamId, keep));
    expect(mine).toHaveLength(1);
    expect(await db.select().from(teams).where(eq(teams.id, dupe))).toEqual([]);
  });

  it("gives the merged team the cleanest of the addresses", async () => {
    /*
     * uniqueTeamSlug suffixes each copy, and the survivor is chosen by how
     * much history it holds — unrelated to which suffix it drew. Left alone a
     * merged team settles on /teams/xf-u12-4 while the bare slug, the one most
     * likely to be linked and indexed, redirects to it.
     */
    const keep = await makeTeam("xf-u12-4");
    const dupe = await makeTeam("xf-u12");
    await db.insert(eventTeams).values([
      { eventId: await makeEvent("a"), teamId: keep },
      { eventId: await makeEvent("b"), teamId: dupe },
    ]);

    const out = await mergeTeams(keep, [dupe]);

    expect(out.survivorSlug).toBe("xf-u12");
    const [row] = await db.select().from(teams).where(eq(teams.id, keep));
    expect(row.slug).toBe("xf-u12");
    // And the address it used to have still finds it.
    expect(await teamBySoleOldSlug("xf-u12-4")).toBe("xf-u12");
  });

  it("keeps the old address working", async () => {
    // Every fixture on the site links to a team by slug. Merging without this
    // turns thousands of links, and whatever search has indexed, into 404s.
    const keep = await makeTeam("xf-u12");
    const dupe = await makeTeam("xf-u12-4");
    await db.insert(eventTeams).values({ eventId: await makeEvent("cup"), teamId: dupe });

    await mergeTeams(keep, [dupe]);

    expect(await teamBySoleOldSlug("xf-u12-4")).toBe("xf-u12");
    expect(await teamBySoleOldSlug("xf-u12")).toBe("xf-u12");
  });

  it("drops a duplicate entry rather than breaking the one-per-event rule", async () => {
    // Both rows entered the same tournament. event_teams allows one.
    const cup = await makeEvent("cup");
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe");
    await db.insert(eventTeams).values([
      { eventId: cup, teamId: keep, groupLabel: "A" },
      { eventId: cup, teamId: dupe, groupLabel: "A" },
    ]);

    const out = await mergeTeams(keep, [dupe]);

    expect(out.entriesDropped).toBe(1);
    expect(out.entriesMoved).toBe(0);
    const left = await db.select().from(eventTeams).where(eq(eventTeams.eventId, cup));
    expect(left).toHaveLength(1);
    expect(left[0].teamId).toBe(keep);
  });

  it("refuses to absorb a team somebody owns", async () => {
    /*
     * The one mistake with no way back. A coach's team folded into a shell
     * cannot be told apart afterwards, so this is checked here as well as in
     * the planner rather than trusted from upstream.
     */
    const [u] = await db
      .insert(users)
      .values({ email: "coach@test", name: "Coach" })
      .returning({ id: users.id });
    const shell = await makeTeam("shell");
    const claimed = await makeTeam("claimed", { ownerId: u.id, visibility: "public" });

    await expect(mergeTeams(shell, [claimed])).rejects.toThrow(/claimed team/);
    expect(await db.select().from(teams).where(eq(teams.id, claimed))).toHaveLength(1);
  });

  it("refuses a merge with nothing in it", async () => {
    const only = await makeTeam("only");
    await expect(mergeTeams(only, [only])).rejects.toThrow(/nothing to merge/);
  });
});

describe("a team that played two brackets of one event", () => {
  /*
   * The paste importer used to key teams "<division>|<name>", so a side that
   * played a group stage and then the championship arrived twice and became
   * two rows in the same event — 54 groups in production, every one a
   * bracket. The importer now keys on the name; this is the recovery path for
   * rows already written the old way.
   */
  it("groups as one team once the ids drop their division, and merges", async () => {
    const cup = await makeEvent("spring-classic");
    const first = await makeTeam("lwpfc-bu10-white-bichirs", {
      name: "LWPFC BU10 White Bichirs",
      originEventId: cup,
    });
    const second = await makeTeam("lwpfc-bu10-white-bichirs-2", {
      name: "LWPFC BU10 White Bichirs",
      originEventId: cup,
    });
    const rival = await makeTeam("nsc-bu10d", { name: "NSC BU10D", originEventId: cup });

    // As the old importer wrote them: one team, two divisions, two ids.
    await db.insert(eventTeams).values([
      { eventId: cup, teamId: first, sourceTeamId: "boys u10|lwpfc bu10 white bichirs" },
      {
        eventId: cup,
        teamId: second,
        sourceTeamId: "boys u10 championships|lwpfc bu10 white bichirs",
      },
      { eventId: cup, teamId: rival, sourceTeamId: "boys u10|nsc bu10d" },
    ]);
    await db.insert(matches).values([
      { eventId: cup, stage: "group", homeTeamId: first, awayTeamId: rival, homeScore: 3, awayScore: 1, status: "final" },
      { eventId: cup, stage: "ko", homeTeamId: second, awayTeamId: rival, homeScore: 2, awayScore: 0, status: "final" },
    ]);

    // What migration 0050 does.
    await db.execute(
      sql`update event_teams set source_team_id = split_part(source_team_id, '|', 2) where source_team_id like '%|%'`,
    );

    const groups = (await duplicateTeamGroups()).filter(
      (g) => g.because === "same source id",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].losers).toHaveLength(1);

    const out = await mergeTeams(
      groups[0].survivor.id,
      groups[0].losers.map((l) => l.id),
    );
    // Both games follow the surviving row; the second entry cannot come with
    // it, since event_teams is unique on (event, team).
    expect(out).toMatchObject({ merged: 1, matchesMoved: 1, entriesDropped: 1 });

    const left = await db.query.teams.findMany({
      where: eq(teams.name, "LWPFC BU10 White Bichirs"),
      columns: { id: true },
    });
    expect(left).toHaveLength(1);

    const played = await db.query.matches.findMany({
      where: eq(matches.eventId, cup),
      columns: { homeTeamId: true },
    });
    expect(new Set(played.map((m) => m.homeTeamId))).toEqual(new Set([left[0].id]));
  });
});

describe("a merge teaches the next import", () => {
  it("records the folded-in name against the survivor", async () => {
    /*
     * The point of the whole exercise: a platform that called a side "Little
     * Warriors B15 B" this September will call it that next September, and
     * without somewhere to write the answer down, every tournament re-poses
     * a question an admin already answered.
     */
    const keep = await makeTeam("warriors-b14-15-ea", { name: "Warriors B14/15 EA" });
    const dupe = await makeTeam("little-warriors-b15-b", {
      name: "Little Warriors B15 B",
    });
    await mergeTeams(keep, [dupe]);

    const alias = await db.query.teamAliases.findFirst({
      where: eq(teamAliases.alias, "littlewarriorsb15b"),
      columns: { teamId: true },
    });
    expect(alias?.teamId).toBe(keep);
  });

  it("does not record the survivor's own name", async () => {
    /*
     * It needs no help — a row arriving under it groups by name in the queue
     * already — and an alias binds without asking, which is more than a name
     * two clubs in one region might both use has earned.
     */
    const keep = await makeTeam("warriors", { name: "Warriors" });
    const dupe = await makeTeam("warriors-b14", { name: "Warriors B14 Red" });
    await mergeTeams(keep, [dupe]);

    const own = await db.query.teamAliases.findFirst({
      where: eq(teamAliases.alias, "warriors"),
    });
    expect(own).toBeUndefined();
  });

  it("re-points an alias when a later merge moves the team", async () => {
    const first = await makeTeam("first", { name: "First Team" });
    const second = await makeTeam("second", { name: "Second Team" });
    const dupe = await makeTeam("shared", { name: "Shared Name FC" });

    await mergeTeams(first, [dupe]);
    const again = await makeTeam("shared-2", { name: "Shared Name FC" });
    await mergeTeams(second, [again]);

    const alias = await db.query.teamAliases.findFirst({
      where: eq(teamAliases.alias, "sharednamefc"),
      columns: { teamId: true },
    });
    expect(alias?.teamId).toBe(second);
  });

  it("keeps a name too short to identify anyone out of it", async () => {
    // Same bar the duplicate finder uses: "FC" is not a name.
    const keep = await makeTeam("keeper", { name: "Keeper FC" });
    const dupe = await makeTeam("fc", { name: "FC" });
    await mergeTeams(keep, [dupe]);
    expect(await db.query.teamAliases.findFirst({ where: eq(teamAliases.alias, "fc") }))
      .toBeUndefined();
  });
});

describe("which address the surviving team keeps", () => {
  it("drops the numbered suffix a connector gave it", async () => {
    // What the rule is for: xf-gu13-rcl1-4 settling back onto xf-gu13-rcl1.
    const numbered = await makeTeam("xf-gu13-rcl1-4", { name: "XF GU13 RCL1" });
    const bare = await makeTeam("xf-gu13-rcl1", { name: "XF GU13 RCL1" });
    const out = await mergeTeams(numbered, [bare]);
    expect(out.survivorSlug).toBe("xf-gu13-rcl1");
  });

  it("keeps its own address when the other team is a different team", async () => {
    /*
     * The bug the manual merge found: folding "Warriors BU11 Bravo" into
     * "Warriors BU11 Attack" moved the survivor to /teams/warriors-bu11-bravo
     * because bravo is the shorter string. The page said Attack and the URL
     * said Bravo.
     */
    const keep = await makeTeam("warriors-bu11-attack", {
      name: "Warriors BU11 Attack",
    });
    const fold = await makeTeam("warriors-bu11-bravo", { name: "Warriors BU11 Bravo" });
    const out = await mergeTeams(keep, [fold]);
    expect(out.survivorSlug).toBe("warriors-bu11-attack");

    // And the folded-in address still redirects, as it always did.
    expect(await teamBySoleOldSlug("warriors-bu11-bravo")).toBe("warriors-bu11-attack");
  });
});

/**
 * Undoing one.
 *
 * A merge is the one cleanup here with no way back on its own: fixtures move
 * to the survivor with nothing saying which moved, and an entry the survivor
 * already had is deleted outright. team_merges is what makes it reversible,
 * so what is worth testing is a real merge undone from the record alone.
 */
describe("the record a merge leaves", () => {
  it("holds the row it deleted, whole", async () => {
    const cup = await makeEvent("cup");
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe", {
      name: "XF B13/14 ECNL 1",
      tier: "ECNL 1",
      birthYears: [2013, 2014],
      gender: "boys",
    });
    await db.insert(eventTeams).values({ eventId: cup, teamId: dupe });

    await mergeTeams(keep, [dupe]);

    const [record] = await db.select().from(teamMerges);
    expect(record.survivorId).toBe(keep);
    expect(record.undoneAt).toBeNull();
    expect(record.team).toMatchObject({
      id: dupe,
      name: "XF B13/14 ECNL 1",
      tier: "ECNL 1",
      birthYears: [2013, 2014],
    });
    expect(record.moved).toMatchObject({ eventTeams: [expect.any(String)] });
  });

  it("keeps an entry it dropped, since nothing else does", async () => {
    // Both rows were in the same event, so the loser's entry was deleted
    // rather than moved. This is the one thing an archive flag could not
    // bring back.
    const cup = await makeEvent("cup");
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe");
    await db.insert(eventTeams).values([
      { eventId: cup, teamId: keep, groupLabel: "A" },
      { eventId: cup, teamId: dupe, groupLabel: "B" },
    ]);

    await mergeTeams(keep, [dupe]);

    const [record] = await db.select().from(teamMerges);
    const dropped = record.dropped as { eventTeams: { groupLabel: string }[] };
    expect(dropped.eventTeams).toHaveLength(1);
    expect(dropped.eventTeams[0].groupLabel).toBe("B");
  });

  it("says which side of a fixture the team was on", async () => {
    // A team is home in one game and away in the next, and putting a fixture
    // back means knowing which column it came out of.
    const cup = await makeEvent("cup");
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe");
    const rival = await makeTeam("rival");
    await db.insert(matches).values([
      { eventId: cup, stage: "group", homeTeamId: dupe, awayTeamId: rival, status: "scheduled" },
      { eventId: cup, stage: "group", homeTeamId: rival, awayTeamId: dupe, status: "scheduled" },
    ]);

    await mergeTeams(keep, [dupe]);

    const [record] = await db.select().from(teamMerges);
    const moved = record.moved as { matchesHome: string[]; matchesAway: string[] };
    expect(moved.matchesHome).toHaveLength(1);
    expect(moved.matchesAway).toHaveLength(1);
    expect(moved.matchesHome[0]).not.toBe(moved.matchesAway[0]);
  });

  it("is enough to put the team back, fixtures and all", async () => {
    const june = await makeEvent("june-cup");
    const cup = await makeEvent("shared-cup");
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe", { name: "Little Warriors B15 B" });
    const rival = await makeTeam("rival");
    await db.insert(eventTeams).values([
      { eventId: june, teamId: dupe },
      // Both in this one, so the loser's entry is deleted rather than moved.
      { eventId: cup, teamId: keep, groupLabel: "A" },
      { eventId: cup, teamId: dupe, groupLabel: "B" },
    ]);
    await db.insert(matches).values({
      eventId: june,
      stage: "group",
      homeTeamId: dupe,
      awayTeamId: rival,
      homeScore: 2,
      awayScore: 1,
      status: "final",
    });

    await mergeTeams(keep, [dupe]);
    const [record] = await db.select().from(teamMerges);

    const plan = await planUnmerge(record.id);
    expect(plan).toMatchObject({
      team: { name: "Little Warriors B15 B" },
      matches: 1,
      entriesMoved: 1,
      entriesRestored: 1,
    });
    await unmergeTeam(record.id);

    const back = await db.query.teams.findFirst({ where: eq(teams.id, dupe) });
    expect(back?.name).toBe("Little Warriors B15 B");

    // Its fixture, with the score it was played under.
    const fixtures = await db.select().from(matches).where(eq(matches.homeTeamId, dupe));
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].homeScore).toBe(2);

    // Both entries in the shared event, including the one that was deleted.
    const entries = await db.select().from(eventTeams).where(eq(eventTeams.eventId, cup));
    expect(entries.map((e) => e.groupLabel).sort()).toEqual(["A", "B"]);

    // And the survivor is left with only what was its own.
    const keepsFixtures = await db.select().from(matches).where(eq(matches.homeTeamId, keep));
    expect(keepsFixtures).toHaveLength(0);
  });

  it("refuses to undo the same merge twice", async () => {
    const keep = await makeTeam("keep");
    const dupe = await makeTeam("dupe");
    await mergeTeams(keep, [dupe]);
    const [record] = await db.select().from(teamMerges);

    await unmergeTeam(record.id);

    // Stamped, so a second run cannot double-restore into a unique index.
    const [after] = await db.select().from(teamMerges);
    expect(after.undoneAt).not.toBeNull();
    await expect(unmergeTeam(record.id)).rejects.toThrow(/already undone/);
  });

  it("refuses when the survivor has itself been merged away", async () => {
    // Its fixtures have moved on again, so there is no row to take them off.
    const first = await makeTeam("first");
    const middle = await makeTeam("middle");
    const dupe = await makeTeam("dupe");
    await mergeTeams(middle, [dupe]);
    const [record] = await db.select().from(teamMerges);
    await mergeTeams(first, [middle]);

    await expect(unmergeTeam(record.id)).rejects.toThrow(/undo that one first/);
  });
});
