/**
 * Rosters: who may submit one, for which team, and who can read it back.
 *
 * The last step of running a tournament, and the least examined. Two things
 * were wrong and both were invisible from the code alone — you had to own
 * several teams, or be a coach rather than an owner, to meet them.
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
const { eventDivisions, eventKinds, eventTeams, events, rosters, teamMembers, teams, users } =
  await import("@/db/schema");
const { saveRoster } = await import("@/features/tournaments/roster-actions");
const { managedEntries, rostersForEvent } = await import(
  "@/features/tournaments/roster-queries"
);

const roster = (names: string[]) => {
  const fd = new FormData();
  for (const n of names) {
    fd.append("name", n);
    fd.append("birthYear", "2015");
    fd.append("gender", "");
  }
  return fd;
};

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email, name: email }).returning({ id: users.id });
  return u.id;
}

async function makeCup(organizerId: string) {
  const [event] = await db
    .insert(events)
    .values({
      slug: "king-juan-cup",
      title: "King Juan Cup",
      kind: "tournament",
      modules: ["roster"],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date("2027-08-28T16:00:00Z"),
      organizerId,
    })
    .returning({ id: events.id });
  const [division] = await db
    .insert(eventDivisions)
    .values({ eventId: event.id, name: "Grande", birthYears: [2015, 2016], rosterMin: 5, rosterMax: 8 })
    .returning({ id: eventDivisions.id });
  return { eventId: event.id, divisionId: division.id };
}

/** A team in the event, optionally owned by someone. */
async function addTeam(
  eventId: string,
  divisionId: string,
  name: string,
  ownerId: string | null,
) {
  const [team] = await db
    .insert(teams)
    .values({ slug: name.toLowerCase().replace(/\W+/g, "-"), name, visibility: "public", ownerId })
    .returning({ id: teams.id });
  const [et] = await db
    .insert(eventTeams)
    .values({ eventId, teamId: team.id, divisionId })
    .returning({ id: eventTeams.id });
  return { teamId: team.id, eventTeamId: et.id };
}

let organizerId: string;

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  organizerId = await makeUser("organizer@test");
  signedInUserId = organizerId;
});

describe("finding the teams someone can submit for", () => {
  it("returns every team they own, not just the first", async () => {
    // The bug: a club entering two age groups in one Cup could reach only one
    // of its rosters. The other had no route to it at all.
    const { eventId, divisionId } = await makeCup(organizerId);
    const manager = await makeUser("club@test");
    await addTeam(eventId, divisionId, "Alpha", manager);
    await addTeam(eventId, divisionId, "Bravo", manager);
    await addTeam(eventId, divisionId, "Someone Else", null);

    const entries = await managedEntries(eventId, manager);
    expect(entries.map((e) => e.teamName).sort()).toEqual(["Alpha", "Bravo"]);
  });

  it("counts a coach, not only the owner", async () => {
    // The people who may enter a team are its owner, managers and coaches. A
    // coach who put the team in could not then say who was playing.
    const { eventId, divisionId } = await makeCup(organizerId);
    const owner = await makeUser("owner@test");
    const coach = await makeUser("coach@test");
    const { teamId } = await addTeam(eventId, divisionId, "Alpha", owner);
    await db.insert(teamMembers).values({ teamId, userId: coach, role: "coach" });

    expect((await managedEntries(eventId, coach)).map((e) => e.teamName)).toEqual(["Alpha"]);
  });

  it("returns one entry per team however many roles someone holds", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const person = await makeUser("both@test");
    const { teamId } = await addTeam(eventId, divisionId, "Alpha", person);
    await db.insert(teamMembers).values({ teamId, userId: person, role: "manager" });

    expect(await managedEntries(eventId, person)).toHaveLength(1);
  });

  it("gives a stranger nothing", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const stranger = await makeUser("stranger@test");
    await addTeam(eventId, divisionId, "Alpha", await makeUser("owner@test"));

    expect(await managedEntries(eventId, stranger)).toEqual([]);
  });

  it("ignores a player, who is a member but not staff", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const player = await makeUser("player@test");
    const { teamId } = await addTeam(eventId, divisionId, "Alpha", await makeUser("o@test"));
    await db.insert(teamMembers).values({ teamId, userId: player, role: "player" });

    expect(await managedEntries(eventId, player)).toEqual([]);
  });
});

describe("submitting a roster", () => {
  it("lets a coach submit, not only the owner", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const coach = await makeUser("coach@test");
    const { teamId, eventTeamId } = await addTeam(
      eventId,
      divisionId,
      "Alpha",
      await makeUser("owner@test"),
    );
    await db.insert(teamMembers).values({ teamId, userId: coach, role: "coach" });

    signedInUserId = coach;
    const res = await saveRoster(
      { eventSlug: "king-juan-cup", eventTeamId },
      {},
      roster(["Ava", "Mia", "Sofia", "Leah", "Zoe"]),
    );
    expect(res.ok).toBe(true);
    expect(await db.select().from(rosters)).toHaveLength(5);
  });

  it("refuses a stranger", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const { eventTeamId } = await addTeam(
      eventId,
      divisionId,
      "Alpha",
      await makeUser("owner@test"),
    );

    signedInUserId = await makeUser("stranger@test");
    const res = await saveRoster(
      { eventSlug: "king-juan-cup", eventTeamId },
      {},
      roster(["Ava", "Mia", "Sofia", "Leah", "Zoe"]),
    );
    expect(res.error).toBeTruthy();
    expect(await db.select().from(rosters)).toHaveLength(0);
  });

  it("holds the division's roster bounds", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const owner = await makeUser("owner@test");
    const { eventTeamId } = await addTeam(eventId, divisionId, "Alpha", owner);
    signedInUserId = owner;
    const ctx = { eventSlug: "king-juan-cup", eventTeamId };

    expect((await saveRoster(ctx, {}, roster(["A", "B", "C"]))).error).toMatch(/at least 5/i);
    expect(
      (await saveRoster(ctx, {}, roster(["A", "B", "C", "D", "E", "F", "G", "H", "I"]))).error,
    ).toMatch(/at most 8/i);
    expect(await db.select().from(rosters)).toHaveLength(0);
  });

  it("replaces the roster rather than adding to it", async () => {
    // Saving twice should leave one squad, not eleven.
    const { eventId, divisionId } = await makeCup(organizerId);
    const owner = await makeUser("owner@test");
    const { eventTeamId } = await addTeam(eventId, divisionId, "Alpha", owner);
    signedInUserId = owner;
    const ctx = { eventSlug: "king-juan-cup", eventTeamId };

    await saveRoster(ctx, {}, roster(["Ava", "Mia", "Sofia", "Leah", "Zoe"]));
    await saveRoster(ctx, {}, roster(["Ada", "Bea", "Cleo", "Dot", "Eve", "Fay"]));

    const rows = await db.select().from(rosters);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.playerName)).not.toContain("Ava");
  });
});

describe("reading rosters back", () => {
  it("hands the organizer every squad in the event, keyed by team", async () => {
    // Nothing read these before the check-in sheet did: teams submitted
    // players and the organizer had no way to see them.
    const { eventId, divisionId } = await makeCup(organizerId);
    const owner = await makeUser("owner@test");
    const a = await addTeam(eventId, divisionId, "Alpha", owner);
    const b = await addTeam(eventId, divisionId, "Bravo", owner);
    signedInUserId = owner;

    await saveRoster(
      { eventSlug: "king-juan-cup", eventTeamId: a.eventTeamId },
      {},
      roster(["Ava", "Mia", "Sofia", "Leah", "Zoe"]),
    );

    const byTeam = await rostersForEvent(eventId);
    expect(byTeam.get(a.eventTeamId)).toHaveLength(5);
    // A team that has not sent one in is absent, which is what the sheet
    // turns into "No roster submitted".
    expect(byTeam.get(b.eventTeamId)).toBeUndefined();
  });

  it("does not reach into another event", async () => {
    const { eventId, divisionId } = await makeCup(organizerId);
    const owner = await makeUser("owner@test");
    const a = await addTeam(eventId, divisionId, "Alpha", owner);
    signedInUserId = owner;
    await saveRoster(
      { eventSlug: "king-juan-cup", eventTeamId: a.eventTeamId },
      {},
      roster(["Ava", "Mia", "Sofia", "Leah", "Zoe"]),
    );

    const [other] = await db
      .insert(events)
      .values({
        slug: "other-cup",
        title: "Other Cup",
        kind: "tournament",
        modules: [],
        status: "published",
        visibility: "public",
        locationType: "in_person",
        timezone: "America/Los_Angeles",
        organizerId,
      })
      .returning({ id: events.id });

    expect((await rostersForEvent(other.id)).size).toBe(0);
  });
});
