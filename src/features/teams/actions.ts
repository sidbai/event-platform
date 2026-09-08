"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { parseAffiliation } from "@/features/clubs/affiliation";
import { clubOptions } from "@/features/clubs/link-queries";
import {
  eventOffers,
  eventTeams,
  matches,
  teamMembers,
  teams,
  users,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { canManageTeam } from "./access";
import { parseBirthYearsInput } from "./age";
import { policyFor, type Editor, type TeamField } from "./editable";
import { checkTeamName } from "./name";

export type TeamFormResult = {
  error?: string;
  ok?: boolean;
  fieldErrors?: Record<string, string>;
};

async function ownerOnly(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, ownerId: true },
  });
  if (!team) return null;
  if (team.ownerId !== user.id && !isAdmin(user)) return null;
  return { user, team };
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return;
  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, ctx.team.id),
        eq(teamMembers.userId, userId),
        ne(teamMembers.role, "owner"),
      ),
    );
  revalidatePath(`/teams/${slug}/settings`);
}

export async function updateTeam(
  slug: string,
  _prev: TeamFormResult,
  formData: FormData,
): Promise<TeamFormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    // affiliation decides which fields are the club's rather than this
    // person's — see editable.ts.
    columns: { id: true, affiliation: true },
  });
  if (!team) return { error: "Not found." };
  // Owner/manager only — being on the roster is not the same as running it.
  if (!(await canManageTeam(team.id)))
    return { error: "You don't manage this team." };

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  /*
   * Which fields this person may write is one rule, in editable.ts, so the
   * form, this action and the admin screen cannot disagree about it.
   *
   * A club's team keeps its identity with the club — Eastside FC GU12 Red is
   * the same team when every player has moved on — so its club, birth years,
   * gender, tier and the rest are not the season's manager's to restate. The
   * name is the exception and goes through proposeTeamName, because imported
   * names are platform output somebody has to be able to fix. And visibility
   * is nobody's but an admin's: taking a team with a season of results out of
   * the directory looks, from outside, exactly like it never existed.
   */
  const editor: Editor = isAdmin(user) ? { kind: "admin" } : { kind: "claimant" };
  const mayWrite = (field: TeamField) => policyFor(field, team, editor) === "free";

  const years = parseBirthYearsInput(String(formData.get("birthYears") ?? ""));
  if (!years.ok) return { fieldErrors: { birthYears: years.error } };

  const clubIds = (await clubOptions()).map((c) => c.id);

  let name: string | undefined;
  if (mayWrite("name")) {
    const checked = checkTeamName(String(formData.get("name") ?? ""));
    if (!checked.ok) return { fieldErrors: { name: checked.error } };
    name = checked.name;
  }

  /*
   * Absent, not null. A field this person may not write is left off the
   * update entirely — writing `undefined` past drizzle would blank the
   * column, which is the same damage as letting them edit it.
   */
  const identity = mayWrite("club")
    ? {
        birthYears: years.years,
        tier: get("tier"),
        program: get("program"),
        ...parseAffiliation(get("club"), clubIds),
        city: get("city"),
        ageGroup: get("ageGroup"),
        gender: get("gender"),
      }
    : {};

  await db
    .update(teams)
    .set({
      ...(name === undefined ? {} : { name }),
      ...identity,
      bio: get("bio"),
      ...(mayWrite("visibility")
        ? { visibility: get("visibility") === "private" ? "private" : ("public" as const) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(teams.id, team.id));

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  return { ok: true };
}

/**
 * Delete a team outright. Owner or admin.
 *
 * Refused while anything competitive still points at the team. The database
 * would block it anyway — event_teams, matches and event_offers all reference
 * teams with NO ACTION — but a raw foreign-key error is not an answer, and
 * silently deleting a King Juan Cup side would take its standings with it.
 * team_members and team_invites cascade; events.host_team_id nulls itself.
 */
export async function deleteTeam(slug: string): Promise<TeamFormResult> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return { error: "Only the owner can delete this team." };

  const inEvent = await db.query.eventTeams.findFirst({
    where: eq(eventTeams.teamId, ctx.team.id),
    columns: { id: true },
    with: { event: { columns: { title: true } } },
  });
  if (inEvent) {
    return {
      error: `This team is registered for ${inEvent.event?.title ?? "an event"}, so it can't be deleted. Deleting it would take that event's results with it.`,
    };
  }

  const played = await db.query.matches.findFirst({
    where: or(
      eq(matches.homeTeamId, ctx.team.id),
      eq(matches.awayTeamId, ctx.team.id),
    ),
    columns: { id: true },
  });
  if (played) return { error: "This team has matches on record, so it can't be deleted." };

  const offered = await db.query.eventOffers.findFirst({
    where: eq(eventOffers.fromTeamId, ctx.team.id),
    columns: { id: true },
  });
  if (offered) {
    return { error: "This team has offered to play an event, so it can't be deleted." };
  }

  await db.delete(teams).where(eq(teams.id, ctx.team.id));
  revalidatePath("/teams");
  redirect("/teams");
}

/**
 * Hand the team to someone else.
 *
 * Owner or admin. This is how a team an admin created on a coach's behalf —
 * or one auto-created for a tournament — reaches the person who actually runs
 * it, now that there is no self-serve claim.
 *
 * The new owner is written into team_members as `owner`, and the outgoing
 * owner is demoted to `manager` rather than dropped: they were running the
 * team a moment ago, and silently removing them is how people lose access to
 * their own roster.
 */
export async function transferOwnership(
  slug: string,
  _prev: TeamFormResult,
  formData: FormData,
): Promise<TeamFormResult> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return { error: "Only the owner can hand this team over." };

  const raw = String(formData.get("who") ?? "").trim();
  if (!raw) return { error: "Enter a username or email." };

  const handle = raw.replace(/^@/, "").toLowerCase();
  const next = await db.query.users.findFirst({
    where: or(eq(users.username, handle), eq(users.email, raw.toLowerCase())),
    columns: { id: true, username: true },
  });
  if (!next) {
    return {
      error: `No account for "${raw}". They need to sign in once before a team can be handed to them.`,
    };
  }
  if (next.id === ctx.team.ownerId) return { error: "They already own it." };

  await db
    .update(teams)
    .set({ ownerId: next.id, updatedAt: new Date() })
    .where(eq(teams.id, ctx.team.id));

  if (ctx.team.ownerId) {
    await db
      .update(teamMembers)
      .set({ role: "manager" })
      .where(
        and(
          eq(teamMembers.teamId, ctx.team.id),
          eq(teamMembers.userId, ctx.team.ownerId),
        ),
      );
  }

  await db
    .insert(teamMembers)
    .values({ teamId: ctx.team.id, userId: next.id, role: "owner" })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: "owner" },
    });

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  return { ok: true };
}
