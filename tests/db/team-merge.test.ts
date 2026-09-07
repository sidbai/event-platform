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
const { eventKinds, eventTeams, events, matches, teamSlugs, teams, users } = await import(
  "@/db/schema"
);
const { mergeTeams, teamBySoleOldSlug } = await import("@/features/teams/merge");
const { duplicateTeamGroups } = await import("@/features/teams/merge-queries");
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
