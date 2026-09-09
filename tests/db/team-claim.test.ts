/**
 * Claiming a team, against a real Postgres.
 *
 * The whole point of the feature is what an approval writes and what it does
 * not: a manager row, no owner, and nothing about the team's identity. Those
 * are the assertions here, because getting them wrong is not a bug somebody
 * notices — it is a stranger quietly holding a squad of children.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

let viewer: { id: string; email: string; admin: boolean } | null = null;

// A plain factory, not importActual: the real module pulls in next-auth,
// which does not load outside a Next runtime.
vi.mock("@/features/auth", () => ({
  getCurrentUser: async () => (viewer ? { id: viewer.id, email: viewer.email } : null),
  publicName: (u: { name?: string | null }) => u.name ?? "Someone",
}));
vi.mock("@/features/auth/admin", () => ({ isAdmin: () => Boolean(viewer?.admin) }));

/** Set by a test that wants the mail service to fall over. */
let mailThrows = false;
const sent: { to: string; subject: string }[] = [];

vi.mock("@/features/email/send", () => ({
  emailConfigured: () => true,
  sendEmail: async (to: string, message: { subject: string }) => {
    if (mailThrows) throw new Error("resend is down");
    sent.push({ to, subject: message.subject });
    return { sent: true };
  },
}));

const { db } = await import("@/db");
const { clubs, eventKinds, teamClaims, teamMembers, teamNameProposals, teams, users } =
  await import("@/db/schema");
const { approveTeamClaim, proposeTeamName, rejectTeamClaim, requestTeamClaim, approveTeamName } =
  await import("@/features/teams/claim-actions");
const { eq } = await import("drizzle-orm");

async function makeUser(email: string) {
  const [row] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], username: email.split("@")[0] })
    .returning({ id: users.id });
  return row.id;
}

async function makeTeam(over: Partial<{ name: string; affiliation: "unknown" | "club" | "independent"; visibility: "public" | "private" }> = {}) {
  const affiliation = over.affiliation ?? "unknown";
  /*
   * A club team needs a club: affiliation and club_id are one fact in two
   * columns, and teams_affiliation_club_ck refuses either without the other.
   */
  let clubId: string | null = null;
  if (affiliation === "club") {
    const [club] = await db
      .insert(clubs)
      .values({ slug: "eastside-fc", name: "Eastside FC" })
      .returning({ id: clubs.id });
    clubId = club.id;
  }

  const [row] = await db
    .insert(teams)
    .values({
      slug: "xf-bu14",
      name: over.name ?? "XF, U14, B12 - 13, RCL 1",
      affiliation,
      ...(clubId ? { clubId } : {}),
      visibility: over.visibility ?? "public",
    })
    .returning({ id: teams.id });
  return row.id;
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const NOTE = "I coach this team at Eastside FC; the club office can confirm it.";

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  viewer = null;
  mailThrows = false;
  sent.length = 0;
});

describe("asking for a team", () => {
  it("records the request and touches nothing else", async () => {
    const coach = await makeUser("coach@example.com");
    const teamId = await makeTeam();
    viewer = { id: coach, email: "coach@example.com", admin: false };

    const out = await requestTeamClaim("xf-bu14", {}, form({ note: NOTE }));
    expect(out.ok).toBe(true);

    const [claim] = await db.select().from(teamClaims);
    expect(claim).toMatchObject({ teamId, userId: coach, status: "pending" });
    // Nothing about the team moves until an admin says so.
    expect(await db.select().from(teamMembers)).toHaveLength(0);
    const [team] = await db.select().from(teams);
    expect(team.ownerId).toBeNull();
  });

  it("refuses a note too short to check anything against", async () => {
    viewer = { id: await makeUser("coach@example.com"), email: "c@e.com", admin: false };
    await makeTeam();
    const out = await requestTeamClaim("xf-bu14", {}, form({ note: "mine" }));
    expect(out.fieldErrors?.note).toBeTruthy();
    expect(await db.select().from(teamClaims)).toHaveLength(0);
  });

  it("refuses a second ask from the same person", async () => {
    viewer = { id: await makeUser("coach@example.com"), email: "c@e.com", admin: false };
    await makeTeam();
    await requestTeamClaim("xf-bu14", {}, form({ note: NOTE }));
    const again = await requestTeamClaim("xf-bu14", {}, form({ note: NOTE }));
    expect(again.error).toMatch(/waiting for review/);
    expect(await db.select().from(teamClaims)).toHaveLength(1);
  });

  it("refuses a private team", async () => {
    viewer = { id: await makeUser("coach@example.com"), email: "c@e.com", admin: false };
    await makeTeam({ visibility: "private" });
    const out = await requestTeamClaim("xf-bu14", {}, form({ note: NOTE }));
    expect(out.error).toMatch(/private/);
  });
});

describe("deciding a claim", () => {
  async function pending() {
    const coach = await makeUser("coach@example.com");
    const teamId = await makeTeam();
    viewer = { id: coach, email: "coach@example.com", admin: false };
    await requestTeamClaim("xf-bu14", {}, form({ note: NOTE }));
    const [claim] = await db.select().from(teamClaims);
    return { coach, teamId, claimId: claim.id };
  }

  it("makes the claimant a manager, and nothing more", async () => {
    const { coach, teamId, claimId } = await pending();
    viewer = { id: await makeUser("admin@example.com"), email: "a@e.com", admin: true };

    await approveTeamClaim(claimId);

    const [member] = await db.select().from(teamMembers);
    expect(member).toMatchObject({ teamId, userId: coach, role: "manager" });
    // Not owner: the owner can delete the team and remove people, and a
    // wrong approval has to stay recoverable.
    const [team] = await db.select().from(teams);
    expect(team.ownerId).toBeNull();
    const [claim] = await db.select().from(teamClaims);
    expect(claim.status).toBe("approved");
  });

  it("ignores an approval from somebody who is not an admin", async () => {
    const { claimId } = await pending();
    viewer = { id: await makeUser("stranger@example.com"), email: "s@e.com", admin: false };

    await approveTeamClaim(claimId);

    expect(await db.select().from(teamMembers)).toHaveLength(0);
    const [claim] = await db.select().from(teamClaims);
    expect(claim.status).toBe("pending");
  });

  it("tells the person what was decided", async () => {
    const { claimId } = await pending();
    viewer = { id: await makeUser("admin@example.com"), email: "a@e.com", admin: true };

    await approveTeamClaim(claimId);

    expect(sent).toEqual([
      { to: "coach@example.com", subject: "You can now manage XF, U14, B12 - 13, RCL 1" },
    ]);
  });

  it("stands even when the mail service falls over", async () => {
    /*
     * The guarantee worth having. Without it an admin presses Approve, sees
     * an error, presses it again, and has no way to know which of those two
     * actually wrote anything.
     */
    const { coach, teamId, claimId } = await pending();
    viewer = { id: await makeUser("admin@example.com"), email: "a@e.com", admin: true };
    mailThrows = true;

    await expect(approveTeamClaim(claimId)).resolves.toBeUndefined();

    const [member] = await db.select().from(teamMembers);
    expect(member).toMatchObject({ teamId, userId: coach, role: "manager" });
    const [claim] = await db.select().from(teamClaims);
    expect(claim.status).toBe("approved");
  });

  it("keeps a rejection on the record", async () => {
    // So that somebody working through a club's teams one by one is visible.
    const { claimId } = await pending();
    viewer = { id: await makeUser("admin@example.com"), email: "a@e.com", admin: true };

    await rejectTeamClaim(claimId);

    const [claim] = await db.select().from(teamClaims);
    expect(claim.status).toBe("rejected");
    // Told, too: somebody left on silence asks again through whatever channel
    // they can find, and that lands in the queue anyway.
    expect(sent[0]?.subject).toMatch(/^About your request to manage/);
  });
});

describe("renaming a team", () => {
  async function managed() {
    const coach = await makeUser("coach@example.com");
    const teamId = await makeTeam({ affiliation: "club" });
    await db.insert(teamMembers).values({ teamId, userId: coach, role: "manager" });
    viewer = { id: coach, email: "coach@example.com", admin: false };
    return { coach, teamId };
  }

  it("proposes rather than renames", async () => {
    const { teamId } = await managed();

    const out = await proposeTeamName("xf-bu14", {}, form({ name: "Crossfire BU14 Red" }));
    expect(out.ok).toBe(true);

    const [proposal] = await db.select().from(teamNameProposals);
    expect(proposal).toMatchObject({
      teamId,
      proposedName: "Crossfire BU14 Red",
      currentName: "XF, U14, B12 - 13, RCL 1",
      status: "pending",
    });
    // The team still has the name it had.
    const [team] = await db.select().from(teams);
    expect(team.name).toBe("XF, U14, B12 - 13, RCL 1");
  });

  it("keeps one standing proposal per team", async () => {
    // Two would put an admin in front of two answers to one question.
    await managed();
    await proposeTeamName("xf-bu14", {}, form({ name: "Crossfire BU14 Red" }));
    await proposeTeamName("xf-bu14", {}, form({ name: "Crossfire BU14 Gold" }));

    const rows = await db.select().from(teamNameProposals);
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedName).toBe("Crossfire BU14 Gold");
  });

  it("refuses somebody who does not manage the team", async () => {
    await makeTeam({ affiliation: "club" });
    viewer = { id: await makeUser("stranger@example.com"), email: "s@e.com", admin: false };

    const out = await proposeTeamName("xf-bu14", {}, form({ name: "Anything" }));
    expect(out.error).toMatch(/don't manage/);
    expect(await db.select().from(teamNameProposals)).toHaveLength(0);
  });

  it("renames on approval, and leaves the address alone", async () => {
    const { teamId } = await managed();
    await proposeTeamName("xf-bu14", {}, form({ name: "Crossfire BU14 Red" }));
    const [proposal] = await db.select().from(teamNameProposals);
    viewer = { id: await makeUser("admin@example.com"), email: "a@e.com", admin: true };

    await approveTeamName(proposal.id);

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(team.name).toBe("Crossfire BU14 Red");
    // Every fixture and standings row points at the team by slug.
    expect(team.slug).toBe("xf-bu14");
  });
});
