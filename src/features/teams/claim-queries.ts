import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { teamClaims, teamNameProposals } from "@/db/schema";
import { publicName } from "@/features/auth";

/**
 * Claims waiting for a decision, with what an admin needs to make one.
 *
 * The account behind the request is shown in full here, deliberately: this is
 * the one screen where a real identity is the whole point, and a pseudonym
 * would leave nothing to judge the note against.
 */
export async function pendingTeamClaims() {
  const rows = await db.query.teamClaims.findMany({
    where: eq(teamClaims.status, "pending"),
    orderBy: [desc(teamClaims.createdAt)],
    with: {
      team: {
        columns: { name: true, slug: true, affiliation: true },
        with: { club: { columns: { name: true } } },
      },
      user: { columns: { displayName: true, name: true, username: true, email: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    note: c.note,
    createdAt: c.createdAt,
    team: c.team,
    who: c.user ? publicName(c.user) : "Someone",
    email: c.user?.email ?? null,
  }));
}

/** Proposed names waiting for a decision, with the name they would replace. */
export async function pendingTeamNames() {
  const rows = await db.query.teamNameProposals.findMany({
    where: eq(teamNameProposals.status, "pending"),
    orderBy: [desc(teamNameProposals.createdAt)],
    with: {
      team: {
        columns: { name: true, slug: true },
        with: { club: { columns: { name: true } } },
      },
      proposer: { columns: { displayName: true, name: true, username: true } },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    // The name as it was when the proposal was written, so a decision made a
    // week later can still be read against what was in front of them.
    currentName: p.currentName,
    proposedName: p.proposedName,
    createdAt: p.createdAt,
    team: p.team,
    who: p.proposer ? publicName(p.proposer) : "Someone",
  }));
}

/** This person's standing claim on this team, if they have made one. */
export async function myTeamClaim(teamId: string, userId: string) {
  return db.query.teamClaims.findFirst({
    where: and(eq(teamClaims.teamId, teamId), eq(teamClaims.userId, userId)),
    columns: { status: true },
  });
}

/** The team's open name proposal, if one is waiting. */
export async function openNameProposal(teamId: string) {
  return db.query.teamNameProposals.findFirst({
    where: and(
      eq(teamNameProposals.teamId, teamId),
      eq(teamNameProposals.status, "pending"),
    ),
    columns: { proposedName: true, createdAt: true },
  });
}
