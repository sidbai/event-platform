"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { splitTeam } from "./split";

export type SplitActionResult = {
  error?: string;
  detail?: string;
  /** Where the events went, for the link under the message. */
  target?: { slug: string; name: string };
};

/**
 * Move some of a team's events to another team, or to a new one.
 *
 * Admin only: this reshapes rows other people's pages are built on, and the
 * merge queue it undoes is admin work too. The form names the events by id,
 * the target by team id or by a new name, and the action does no guessing
 * of its own — see split.ts for what moves.
 */
export async function splitTeamAction(
  teamSlug: string,
  _prev: SplitActionResult,
  formData: FormData,
): Promise<SplitActionResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, teamSlug),
    columns: { id: true, slug: true },
  });
  if (!team) return { error: "That team is gone." };

  const eventIds = formData.getAll("eventId").map(String).filter(Boolean);
  const mode = String(formData.get("mode") ?? "new");
  const target =
    mode === "existing"
      ? { teamId: String(formData.get("targetTeamId") ?? "") }
      : { name: String(formData.get("newName") ?? "") };
  if ("teamId" in target && !target.teamId) return { error: "Pick the team to move them to." };

  try {
    const out = await splitTeam(team.id, eventIds, target);
    // Both team pages, and every event whose schedule now names the other side.
    revalidatePath(`/teams/${team.slug}`);
    revalidatePath(`/teams/${out.target.slug}`);
    const touched = await db.query.events.findMany({
      where: (e, { inArray }) => inArray(e.id, eventIds),
      columns: { slug: true },
    });
    for (const e of touched) revalidatePath(`/events/${e.slug}`);
    revalidatePath("/teams");
    const m = out.moved;
    return {
      detail: `${m.entries} event${m.entries === 1 ? "" : "s"} and ${m.matches} game${m.matches === 1 ? "" : "s"} moved to ${out.target.name}${out.target.created ? " (new)" : ""}.`,
      target: { slug: out.target.slug, name: out.target.name },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That didn't work." };
  }
}
