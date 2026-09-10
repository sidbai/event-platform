"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clubs } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { createClubRow } from "./create";
import { linkTeamsToClub, setIndependent } from "./link";

export type LinkResult = { error?: string; detail?: string };

/**
 * Place a group of imported teams under a club, and remember why.
 *
 * The alias is the point. Without it the same names arrive next sync and the
 * queue asks again, and the answer would live only in whoever last read it.
 * With it, "xf" means Crossfire Premier from then on and the teams that
 * follow are placed without anybody being asked.
 *
 * Admin only, and never automatic: a club page carries reviews about named
 * coaches, so filing a team under the wrong club puts a stranger's name
 * beside somebody's complaint.
 */
export async function confirmClubLink(
  clubId: string,
  key: string,
  teamIds: string[],
): Promise<LinkResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (teamIds.length === 0) return { error: "Nothing to link." };

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: { id: true, name: true, slug: true },
  });
  if (!club) return { error: "That club no longer exists." };

  const { alias } = await linkTeamsToClub(club.id, key, teamIds, user.id);

  revalidatePath("/admin/clubs");
  revalidatePath(`/clubs/${club.slug}`);
  return {
    detail: `${teamIds.length} team${teamIds.length === 1 ? "" : "s"} filed under ${club.name}${alias ? ` — "${alias}" now means this club` : ""}.`,
  };
}

/**
 * Add the club these teams belong to, and file them under it at once.
 *
 * The queue's other two buttons both assume the club is already in the
 * directory. For the nine hundred teams whose club has never been added,
 * that assumption is the whole problem: an admin looking at thirty-three
 * Sparta Tacoma teams had to leave, add the club, find the group again and
 * then file it. Most of those groups are one club with an obvious name, and
 * the name is sitting in the heading.
 *
 * Same alias as confirming an existing club, because the point is identical:
 * "spartatacoma" means this club from now on, and the next sync places those
 * names without asking again.
 */
export async function createClubAndLink(
  key: string,
  teamIds: string[],
  _prev: LinkResult,
  formData: FormData,
): Promise<LinkResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (teamIds.length === 0) return { error: "Nothing to link." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the club a name." };
  if (name.length > 80) return { error: "That name is too long." };

  // A club that already answers to this name is the one to file under, not a
  // second row beside it — the duplicate would split its teams in two.
  const existing = await db.query.clubs.findFirst({
    where: eq(sql`lower(${clubs.name})`, name.toLowerCase()),
    columns: { id: true, name: true, slug: true },
  });
  const club = existing ?? (await createClubRow({ name }, user.id));

  const { alias } = await linkTeamsToClub(club.id, key, teamIds, user.id);

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  revalidatePath(`/clubs/${club.slug}`);
  return {
    detail:
      `${existing ? "Filed" : "Added " + club.name + " and filed"} ` +
      `${teamIds.length} team${teamIds.length === 1 ? "" : "s"}` +
      `${existing ? ` under ${club.name}, which already existed` : ""}` +
      `${alias ? ` — "${alias}" now means this club` : ""}.`,
  };
}

/**
 * Record that a team belongs to no club at all.
 *
 * A King Juan Cup side, a parent-organised team, a pickup crew. Without this
 * it is indistinguishable from an imported team nobody has looked at, and the
 * queue would offer it again every time.
 */
export async function markIndependent(teamIds: string[]): Promise<LinkResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (teamIds.length === 0) return { error: "Nothing to mark." };

  await setIndependent(teamIds);

  revalidatePath("/admin/clubs");
  return {
    detail: `${teamIds.length} team${teamIds.length === 1 ? "" : "s"} marked as not with a club.`,
  };
}
