/**
 * A team adding a result nobody here carries, against a real Postgres.
 *
 * The interesting parts are all about what gets written where: a competition
 * we do not have becomes a draft event standing in for it, an opponent we do
 * not have becomes a team, and an opponent we do have becomes a proposal that
 * writes nothing until somebody on that side agrees. None of that can be seen
 * without the constraints — matches.event_id is not null, team slugs are
 * unique, and the proposal is a row or it is nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

let viewer: { id: string; email: string } | null = null;
let admin = false;

vi.mock("@/features/auth", () => ({
  getCurrentUser: async () => viewer,
  publicName: () => "Someone",
}));
vi.mock("@/features/auth/admin", () => ({ isAdmin: () => admin }));

const { db } = await import("@/db");
const { eventKinds, events, matchProposals, matches, teamMembers, teams, users } =
  await import("@/db/schema");
const { addTeamResult, decideMatchProposal, searchOpponents } = await import(
  "@/features/teams/add-result-actions"
);
const { eq } = await import("drizzle-orm");

const GOOD = {
  playedOn: "2026-07-12",
  opponent: "FC Dallas B12 Red",
  ourScore: "3",
  theirScore: "1",
  competition: "Dallas Cup",
};

function formOf(over: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...GOOD, ...over })) fd.set(k, v);
  return fd;
}

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email }).returning({ id: users.id });
  return u.id;
}

async function makeTeam(slug: string, over: Record<string, unknown> = {}) {
  const [t] = await db
    .insert(teams)
    .values({ slug, name: slug, visibility: "public", ...over })
    .returning({ id: teams.id });
  return t.id;
}

/** The manager, since only they may add a result. */
async function manage(teamId: string, userId: string) {
  await db.insert(teamMembers).values({ teamId, userId, role: "manager" });
}

beforeEach(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
  admin = false;
  viewer = null;
});

describe("adding a result for a competition nobody here carries", () => {
  it("stands a draft event in for the cup, and makes the opponent a team", async () => {
    const userId = await makeUser("parent@example.com");
    viewer = { id: userId, email: "parent@example.com" };
    const teamId = await makeTeam("ours");
    await manage(teamId, userId);

    expect(await addTeamResult("ours", {}, formOf())).toMatchObject({ ok: true });

    const [event] = await db.select().from(events);
    // Draft, because it is a placeholder — and because /events already lists
    // only published and completed ones, so nothing has to hide it.
    expect(event).toMatchObject({ title: "Dallas Cup", status: "draft" });

    // A row, not a string: two sides who both played FC Dallas should end up
    // sharing an opponent rather than two names that will never meet.
    const opponent = await db.query.teams.findFirst({
      where: eq(teams.name, "FC Dallas B12 Red"),
    });
    expect(opponent).toBeTruthy();

    const [match] = await db.select().from(matches);
    expect(match).toMatchObject({
      eventId: event.id,
      awayTeamId: teamId,
      homeTeamId: opponent!.id,
      homeScore: 1,
      awayScore: 3,
      // No source id: a person entered this, and no connector may touch it.
      sourceMatchId: null,
    });
    expect(match.scoreSetBy).toBe(userId);
  });

  it("files a second game from the same trip under the same placeholder", async () => {
    const userId = await makeUser("parent@example.com");
    viewer = { id: userId, email: "parent@example.com" };
    const teamId = await makeTeam("ours");
    await manage(teamId, userId);

    await addTeamResult("ours", {}, formOf());
    await addTeamResult("ours", {}, formOf({ playedOn: "2026-07-13", opponent: "Solar SC" }));

    // Five games from one trip should not be five events.
    expect(await db.select().from(events)).toHaveLength(1);
    expect(await db.select().from(matches)).toHaveLength(2);
  });

  it("refuses to write into a tournament we already carry", async () => {
    // Its schedule came from the organizer; slipping a game in would put a
    // fixture on a public schedule they never published.
    const userId = await makeUser("parent@example.com");
    viewer = { id: userId, email: "parent@example.com" };
    const teamId = await makeTeam("ours");
    await manage(teamId, userId);
    await db.insert(events).values({
      slug: "dallas-cup",
      title: "Dallas Cup",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      startsAt: new Date("2026-07-10T16:00:00Z"),
    });

    const out = await addTeamResult("ours", {}, formOf());
    expect(out.error).toMatch(/already have Dallas Cup/);
    expect(await db.select().from(matches)).toHaveLength(0);
  });

  it("is refused to anyone who does not manage the team", async () => {
    const userId = await makeUser("stranger@example.com");
    viewer = { id: userId, email: "stranger@example.com" };
    await makeTeam("ours");

    const out = await addTeamResult("ours", {}, formOf());
    expect(out.error).toMatch(/manage this team/);
    expect(await db.select().from(matches)).toHaveLength(0);
  });
});

describe("a result against a team we already carry", () => {
  async function setUp() {
    const userId = await makeUser("parent@example.com");
    viewer = { id: userId, email: "parent@example.com" };
    const teamId = await makeTeam("ours");
    await manage(teamId, userId);
    const rivalId = await makeTeam("rival", { name: "Seattle Celtic B12" });
    return { userId, teamId, rivalId };
  }

  it("waits, rather than writing onto somebody else's page", async () => {
    const { teamId, rivalId, userId } = await setUp();

    const out = await addTeamResult(
      "ours",
      {},
      formOf({ opponent: "Seattle Celtic B12", opponentTeamId: rivalId }),
    );
    expect(out.ok).toBe(true);
    expect(out.note).toMatch(/confirm/);

    // Nothing on either page yet, and no event invented for it either.
    expect(await db.select().from(matches)).toHaveLength(0);
    expect(await db.select().from(events)).toHaveLength(0);

    const [proposal] = await db.select().from(matchProposals);
    expect(proposal).toMatchObject({
      teamId,
      opponentTeamId: rivalId,
      proposedBy: userId,
      ourScore: 3,
      theirScore: 1,
      status: "pending",
      matchId: null,
    });
  });

  it("writes the match onto both sides once it is confirmed", async () => {
    const { teamId, rivalId, userId } = await setUp();
    await addTeamResult("ours", {}, formOf({ opponentTeamId: rivalId }));
    const [proposal] = await db.select().from(matchProposals);

    const deciderId = await makeUser("admin@example.com");
    viewer = { id: deciderId, email: "admin@example.com" };
    admin = true;
    expect(await decideMatchProposal(proposal.id, true)).toMatchObject({ ok: true });

    const [match] = await db.select().from(matches);
    expect(match).toMatchObject({ awayTeamId: teamId, homeTeamId: rivalId });
    // Attributed to whoever said it happened, not to whoever agreed.
    expect(match.scoreSetBy).toBe(userId);

    const [after] = await db.select().from(matchProposals);
    expect(after).toMatchObject({ status: "approved", decidedBy: deciderId });
    expect(after.matchId).toBe(match.id);
  });

  it("writes nothing when it is rejected", async () => {
    const { rivalId } = await setUp();
    await addTeamResult("ours", {}, formOf({ opponentTeamId: rivalId }));
    const [proposal] = await db.select().from(matchProposals);

    viewer = { id: await makeUser("admin@example.com"), email: "admin@example.com" };
    admin = true;
    await decideMatchProposal(proposal.id, false);

    expect(await db.select().from(matches)).toHaveLength(0);
    const [after] = await db.select().from(matchProposals);
    expect(after.status).toBe("rejected");
  });

  it("cannot be decided twice", async () => {
    const { rivalId } = await setUp();
    await addTeamResult("ours", {}, formOf({ opponentTeamId: rivalId }));
    const [proposal] = await db.select().from(matchProposals);

    viewer = { id: await makeUser("admin@example.com"), email: "admin@example.com" };
    admin = true;
    await decideMatchProposal(proposal.id, true);
    const second = await decideMatchProposal(proposal.id, true);

    expect(second.error).toMatch(/already decided/);
    expect(await db.select().from(matches)).toHaveLength(1);
  });

  it("is not for a passer-by to decide", async () => {
    const { rivalId } = await setUp();
    await addTeamResult("ours", {}, formOf({ opponentTeamId: rivalId }));
    const [proposal] = await db.select().from(matchProposals);

    viewer = { id: await makeUser("nobody@example.com"), email: "nobody@example.com" };
    admin = false;
    expect(await decideMatchProposal(proposal.id, true)).toMatchObject({
      error: "Not allowed.",
    });
    expect(await db.select().from(matches)).toHaveLength(0);
  });

  it("lets the other side's own manager decide it", async () => {
    // The rule is written for the platform being built rather than the one we
    // have: one team of 2,350 has an owner today.
    const { rivalId } = await setUp();
    await addTeamResult("ours", {}, formOf({ opponentTeamId: rivalId }));
    const [proposal] = await db.select().from(matchProposals);

    const theirManager = await makeUser("theirs@example.com");
    await manage(rivalId, theirManager);
    viewer = { id: theirManager, email: "theirs@example.com" };
    admin = false;

    expect(await decideMatchProposal(proposal.id, true)).toMatchObject({ ok: true });
    expect(await db.select().from(matches)).toHaveLength(1);
  });
});

describe("searchOpponents", () => {
  it("offers teams whose name contains what was typed", async () => {
    const mine = await makeTeam("mine", { name: "Crossfire Select B15" });
    await makeTeam("celtic", { name: "Seattle Celtic B12" });

    const hits = await searchOpponents(mine, "celtic");
    expect(hits.map((h) => h.name)).toEqual(["Seattle Celtic B12"]);
  });

  it("never offers the team back to itself", async () => {
    const mine = await makeTeam("mine", { name: "Seattle Celtic B12" });
    expect(await searchOpponents(mine, "celtic")).toEqual([]);
  });

  it("says nothing to two letters, which match everything", async () => {
    const mine = await makeTeam("mine", { name: "Crossfire" });
    await makeTeam("celtic", { name: "Seattle Celtic B12" });
    expect(await searchOpponents(mine, "ce")).toEqual([]);
  });
});
