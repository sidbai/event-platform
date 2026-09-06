/**
 * The registration flow, driven through the real server actions.
 *
 * This is the layer the pure tests and the query tests both miss: the
 * operations themselves — the thing an organizer's click actually runs. It is
 * also the layer where the interesting bugs have been, because it is where
 * authorisation, validation and two tables meeting each other all happen at
 * once.
 *
 * Nothing is reimplemented here. The actions are imported and called as
 * written, against a real Postgres. Only the two things a server action gets
 * from Next are stood in for: who is signed in, and cache revalidation, which
 * needs a request context that does not exist in a test runner.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

/** Swapped per test to act as a different person. */
let signedInUserId: string | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (signedInUserId ? { user: { id: signedInUserId } } : null),
}));

// revalidatePath needs a request store. The actions call it for its effect on
// the cache, not for a value, so a no-op is a faithful stand-in here.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { eventDivisions, eventKinds, eventRegistrations, eventTeams, events, matches, teamMembers, teams, users } =
  await import("@/db/schema");
const { registerTeam, setRegistrationStatus, withdrawRegistration } = await import(
  "@/features/registration/actions"
);

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

async function makeUser(email: string) {
  const [u] = await db
    .insert(users)
    .values({ email, name: email })
    .returning({ id: users.id });
  return u.id;
}

async function makeTeam(name: string, managerId: string) {
  const [t] = await db
    .insert(teams)
    .values({ slug: name.toLowerCase().replace(/\W+/g, "-"), name, visibility: "public" })
    .returning({ id: teams.id });
  await db.insert(teamMembers).values({ teamId: t.id, userId: managerId, role: "manager" });
  return t.id;
}

async function makeLeague(organizerId: string) {
  const [e] = await db
    .insert(events)
    .values({
      slug: "wpl-fall",
      title: "WPL Fall",
      kind: "league",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: future(7),
      endsAt: future(70),
      organizerId,
    })
    .returning({ id: events.id });
  const [d] = await db
    .insert(eventDivisions)
    .values({ eventId: e.id, name: "N1 U13", birthYears: [2013, 2014], capacity: 8 })
    .returning({ id: eventDivisions.id });
  return { eventId: e.id, divisionId: d.id };
}

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "league", label: "League", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  signedInUserId = null;
});

describe("entering a team", () => {
  it("refuses when nobody is signed in", async () => {
    const organizer = await makeUser("organizer@test");
    const { divisionId } = await makeLeague(organizer);

    const res = await registerTeam("wpl-fall", {}, form({ divisionId, teamId: "x" }));
    expect(res.error).toMatch(/sign in/i);
  });

  it("refuses a team the signed-in user does not manage", async () => {
    // The id comes from the browser, so membership is what decides — not the
    // form. This is the check that stops one club entering another.
    const organizer = await makeUser("organizer@test");
    const stranger = await makeUser("stranger@test");
    const manager = await makeUser("manager@test");
    const { divisionId } = await makeLeague(organizer);
    const teamId = await makeTeam("Eagleclaw FC", manager);

    signedInUserId = stranger;
    const res = await registerTeam("wpl-fall", {}, form({ divisionId, teamId }));
    expect(res.error).toMatch(/only enter a team you manage/i);
  });

  it("records an entry for a team the user manages", async () => {
    const organizer = await makeUser("organizer@test");
    const manager = await makeUser("manager@test");
    const { divisionId } = await makeLeague(organizer);
    const teamId = await makeTeam("Eagleclaw FC", manager);

    signedInUserId = manager;
    const res = await registerTeam("wpl-fall", {}, form({ divisionId, teamId }));
    expect(res.ok).toBe(true);

    const rows = await db.select().from(eventRegistrations);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("requested");
  });

  it("refuses once the window has closed", async () => {
    const organizer = await makeUser("organizer@test");
    const manager = await makeUser("manager@test");
    const { eventId, divisionId } = await makeLeague(organizer);
    const teamId = await makeTeam("Eagleclaw FC", manager);
    await db
      .update(eventDivisions)
      .set({ registrationClosesAt: future(-1) })
      .where(eq(eventDivisions.id, divisionId));
    expect(eventId).toBeTruthy();

    signedInUserId = manager;
    const res = await registerTeam("wpl-fall", {}, form({ divisionId, teamId }));
    expect(res.error).toMatch(/closed/i);
  });
});

describe("deciding on an entry", () => {
  async function withOneEntry() {
    const organizer = await makeUser("organizer@test");
    const manager = await makeUser("manager@test");
    const { eventId, divisionId } = await makeLeague(organizer);
    const teamId = await makeTeam("Eagleclaw FC", manager);

    signedInUserId = manager;
    await registerTeam("wpl-fall", {}, form({ divisionId, teamId }));
    const [reg] = await db.select().from(eventRegistrations);
    return { organizer, manager, eventId, divisionId, teamId, regId: reg.id };
  }

  it("does nothing for someone who cannot manage the event", async () => {
    const { manager, regId } = await withOneEntry();
    signedInUserId = manager; // the team's own manager, not the organizer

    await setRegistrationStatus("wpl-fall", regId, "accepted");

    const [reg] = await db.select().from(eventRegistrations);
    expect(reg.status).toBe("requested");
    expect(await db.select().from(eventTeams)).toHaveLength(0);
  });

  it("puts an accepted team into the division", async () => {
    // The seam the whole league flow hangs on: accepting is what creates
    // participation, with the team that actually entered rather than a
    // retyped copy of it.
    const { organizer, teamId, divisionId, regId } = await withOneEntry();
    signedInUserId = organizer;

    await setRegistrationStatus("wpl-fall", regId, "accepted");

    const placed = await db.select().from(eventTeams);
    expect(placed).toHaveLength(1);
    expect(placed[0].teamId).toBe(teamId);
    expect(placed[0].divisionId).toBe(divisionId);
    // And no second team was invented along the way.
    expect(await db.select().from(teams)).toHaveLength(1);
  });

  it("takes the place back when the decision is reversed", async () => {
    const { organizer, regId } = await withOneEntry();
    signedInUserId = organizer;

    await setRegistrationStatus("wpl-fall", regId, "accepted");
    await setRegistrationStatus("wpl-fall", regId, "declined");

    expect(await db.select().from(eventTeams)).toHaveLength(0);
  });

  it("keeps a team that already has fixtures, and says so through the data", async () => {
    const { organizer, eventId, teamId, regId } = await withOneEntry();
    signedInUserId = organizer;
    await setRegistrationStatus("wpl-fall", regId, "accepted");

    await db.insert(matches).values({
      eventId,
      stage: "group",
      homeTeamId: teamId,
      status: "scheduled",
    });

    await setRegistrationStatus("wpl-fall", regId, "declined");

    // Removing it would leave a match naming a team with no standings row.
    expect(await db.select().from(eventTeams)).toHaveLength(1);
  });

  it("lets the team withdraw itself", async () => {
    const { manager, organizer, regId } = await withOneEntry();
    signedInUserId = organizer;
    await setRegistrationStatus("wpl-fall", regId, "accepted");

    signedInUserId = manager;
    await withdrawRegistration("wpl-fall", regId);

    const [reg] = await db.select().from(eventRegistrations);
    expect(reg.status).toBe("withdrawn");
    expect(await db.select().from(eventTeams)).toHaveLength(0);
  });
});

// Imported last so the mocks above are installed before drizzle-orm loads.
const { eq } = await import("drizzle-orm");
