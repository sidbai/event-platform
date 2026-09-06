/**
 * The tournament shape, driven through the real actions.
 *
 * A league is one table: everyone plays everyone, and the league walkthrough
 * covered that. A tournament is groups that each play themselves and then a
 * knockout on top, and none of that was exercised by anything — which is how
 * a division of eight came to generate one round-robin of twenty-eight games
 * instead of two of six, with no way to say which team was in which group.
 *
 * Written against the real King Juan Cup draw: two groups of four per age
 * band, six games each, then a semifinal.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

let signedInUserId: string | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (signedInUserId ? { user: { id: signedInUserId } } : null),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { eventDivisions, eventKinds, eventTeams, events, matches, teams, users } =
  await import("@/db/schema");
const { addMatch, clearFixtures, generateFixtures, setTeamGroup } = await import(
  "@/features/tournaments/score-actions"
);
const { eq } = await import("drizzle-orm");

/** The real Grande draw. */
const GROUP_1 = ["喂饼FC", "SPFC", "Niu Lai", "Warriors GU12"];
const GROUP_2 = ["烙饼FC", "Incredible Warriors", "Green Devils", "Attack Girls"];

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

let organizerId: string;

async function makeCup() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "king-juan-cup",
      title: "King Juan Cup",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2027-08-28T16:00:00Z"),
      endsAt: new Date("2027-08-29T01:00:00Z"),
      organizerId,
    })
    .returning({ id: events.id });
  const [division] = await db
    .insert(eventDivisions)
    .values({ eventId: event.id, name: "Grande", birthYears: [2015, 2016] })
    .returning({ id: eventDivisions.id });
  return { eventId: event.id, divisionId: division.id };
}

/** Teams already accepted into the division, with no bracket — as entering leaves them. */
async function enterTeams(eventId: string, divisionId: string, names: string[]) {
  const ids: Record<string, string> = {};
  for (const name of names) {
    const [team] = await db
      .insert(teams)
      .values({ slug: `t-${Object.keys(ids).length}-${Date.now()}`, name, visibility: "public" })
      .returning({ id: teams.id });
    const [et] = await db
      .insert(eventTeams)
      .values({ eventId, teamId: team.id, divisionId })
      .returning({ id: eventTeams.id });
    ids[name] = et.id;
  }
  return ids;
}

const generate = (divisionId: string) =>
  generateFixtures(
    "king-juan-cup",
    {},
    form({ divisionId, startDate: "2027-08-28", time: "09:00", everyDays: "1", legs: "1" }),
  );

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  const [u] = await db
    .insert(users)
    .values({ email: "organizer@test", name: "Organizer" })
    .returning({ id: users.id });
  organizerId = u.id;
  signedInUserId = u.id;
});

describe("brackets", () => {
  it("puts a team in a group and takes it out again", async () => {
    const { eventId, divisionId } = await makeCup();
    const ids = await enterTeams(eventId, divisionId, ["喂饼FC"]);

    await setTeamGroup("king-juan-cup", ids["喂饼FC"], {}, form({ groupLabel: "1" }));
    let [row] = await db.select().from(eventTeams);
    expect(row.groupLabel).toBe("1");

    // Blank clears it, which is what a division with no groups wants.
    await setTeamGroup("king-juan-cup", ids["喂饼FC"], {}, form({ groupLabel: "  " }));
    [row] = await db.select().from(eventTeams);
    expect(row.groupLabel).toBeNull();
  });

  it("refuses someone who cannot manage the event", async () => {
    const { eventId, divisionId } = await makeCup();
    const ids = await enterTeams(eventId, divisionId, ["SPFC"]);
    const [stranger] = await db
      .insert(users)
      .values({ email: "stranger@test", name: "Stranger" })
      .returning({ id: users.id });

    signedInUserId = stranger.id;
    const res = await setTeamGroup("king-juan-cup", ids["SPFC"], {}, form({ groupLabel: "1" }));
    expect(res.error).toBeTruthy();
    const [row] = await db.select().from(eventTeams);
    expect(row.groupLabel).toBeNull();
  });
});

describe("generating a tournament's fixtures", () => {
  it("plays each group within itself, and never across them", async () => {
    // The bug this covers: with no brackets an eight-team division generated
    // one round-robin of 28 instead of the two of six a cup actually plays.
    const { eventId, divisionId } = await makeCup();
    const ids = await enterTeams(eventId, divisionId, [...GROUP_1, ...GROUP_2]);
    for (const [name, id] of Object.entries(ids)) {
      await setTeamGroup(
        "king-juan-cup",
        id,
        {},
        form({ groupLabel: GROUP_1.includes(name) ? "1" : "2" }),
      );
    }

    const res = await generate(divisionId);
    expect(res.ok).toBe(true);

    const rows = await db.select().from(matches);
    expect(rows).toHaveLength(12);

    const groupOf = new Map(
      (await db.select().from(eventTeams)).map((et) => [et.teamId, et.groupLabel]),
    );
    for (const m of rows) {
      expect(groupOf.get(m.homeTeamId!)).toBe(groupOf.get(m.awayTeamId!));
      expect(m.groupLabel).toBe(groupOf.get(m.homeTeamId!));
    }
    expect(rows.filter((m) => m.groupLabel === "1")).toHaveLength(6);
    expect(rows.filter((m) => m.groupLabel === "2")).toHaveLength(6);
  });

  it("treats a division with no brackets as one group", async () => {
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);

    await generate(divisionId);
    // Four teams, everyone plays everyone: six games.
    expect(await db.select().from(matches)).toHaveLength(6);
  });

  it("refuses to build a second season on top of the first", async () => {
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);

    await generate(divisionId);
    const again = await generate(divisionId);
    expect(again.error).toMatch(/already has fixtures/i);
    expect(await db.select().from(matches)).toHaveLength(6);
  });
});

describe("clearing fixtures", () => {
  it("undoes a draw made before the groups were set", async () => {
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, [...GROUP_1, ...GROUP_2]);

    await generate(divisionId);
    expect(await db.select().from(matches)).toHaveLength(28);

    const res = await clearFixtures("king-juan-cup", divisionId);
    expect(res.ok).toBe(true);
    expect(await db.select().from(matches)).toHaveLength(0);
  });

  it("refuses once anything has been played", async () => {
    // A schedule with results in it is not a mistake to undo; rebuilding it
    // would throw the scores away.
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);
    await generate(divisionId);

    const [first] = await db.select().from(matches);
    await db
      .update(matches)
      .set({ homeScore: 3, awayScore: 1, status: "final" })
      .where(eq(matches.id, first.id));

    const res = await clearFixtures("king-juan-cup", divisionId);
    expect(res.error).toMatch(/scores/i);
    expect(await db.select().from(matches)).toHaveLength(6);
  });

  it("refuses someone who cannot manage the event", async () => {
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);
    await generate(divisionId);

    const [stranger] = await db
      .insert(users)
      .values({ email: "stranger@test", name: "Stranger" })
      .returning({ id: users.id });
    signedInUserId = stranger.id;

    expect((await clearFixtures("king-juan-cup", divisionId)).error).toBeTruthy();
    expect(await db.select().from(matches)).toHaveLength(6);
  });
});

describe("the knockout stage", () => {
  it("schedules a semifinal by naming the slots, not the teams", async () => {
    // A knockout game is scheduled before anyone knows who is in it, and a
    // printed schedule needs to say which group's winner turns up where.
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);

    const res = await addMatch(
      "king-juan-cup",
      {},
      form({
        divisionId,
        round: "semi",
        field: "Field 1",
        time: "15:00",
        homePlaceholder: "Winner Group 1",
        awayPlaceholder: "Winner Group 2",
      }),
    );
    expect(res.ok).toBe(true);

    const [m] = await db.select().from(matches);
    expect(m.stage).toBe("ko");
    expect(m.round).toBe("semi");
    expect(m.homeTeamId).toBeNull();
    expect(m.homePlaceholder).toBe("Winner Group 1");
    expect(m.awayPlaceholder).toBe("Winner Group 2");
    expect(eventId).toBeTruthy();
  });

  it("falls back to TBD when a slot is left blank", async () => {
    const { divisionId } = await makeCup();

    await addMatch("king-juan-cup", {}, form({ divisionId, round: "final", time: "17:00" }));

    const [m] = await db.select().from(matches);
    expect(m.stage).toBe("ko");
    expect(m.round).toBe("final");
    expect(m.homePlaceholder).toBe("TBD");
  });

  it("does not let a scheduled final block the group stage", async () => {
    // Pencilling the final in first is a sensible thing to do. Only group
    // games mean "this season has already been generated".
    const { eventId, divisionId } = await makeCup();
    await enterTeams(eventId, divisionId, GROUP_1);
    await addMatch(
      "king-juan-cup",
      {},
      form({ divisionId, round: "final", time: "15:00", homePlaceholder: "Winner Group 1" }),
    );

    const res = await generate(divisionId);
    expect(res.ok).toBe(true);
    // Six group games plus the final that was already there.
    expect(await db.select().from(matches)).toHaveLength(7);
    expect(eventId).toBeTruthy();
  });
});
