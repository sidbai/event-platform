"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventTeams, rosters } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

export type RosterResult = { error?: string; ok?: boolean };

export async function saveRoster(
  ctx: { eventSlug: string; eventTeamId: string },
  _prev: RosterResult,
  formData: FormData,
): Promise<RosterResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const entry = await db.query.eventTeams.findFirst({
    where: eq(eventTeams.id, ctx.eventTeamId),
    with: { team: { columns: { claimedBy: true } }, division: true },
  });
  if (!entry) return { error: "Team not found in this event." };
  if (entry.team.claimedBy !== user.id && !isAdmin(user)) {
    return { error: "Only the team's manager can edit the roster." };
  }

  const names = formData.getAll("name").map((v) => String(v).trim());
  const years = formData.getAll("birthYear").map((v) => String(v).trim());
  const genders = formData.getAll("gender").map((v) => String(v).trim());

  const players = names
    .map((name, i) => ({
      name,
      birthYear: years[i] ? Number(years[i]) : null,
      gender: genders[i] || null,
    }))
    .filter((p) => p.name.length > 0);

  const min = entry.division?.rosterMin ?? 0;
  const max = entry.division?.rosterMax ?? 99;
  if (players.length < min) return { error: `At least ${min} players.` };
  if (players.length > max) return { error: `At most ${max} players.` };
  if (players.some((p) => p.birthYear != null && (p.birthYear < 2000 || p.birthYear > 2025))) {
    return { error: "Check the birth years." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(rosters).where(eq(rosters.eventTeamId, ctx.eventTeamId));
    if (players.length > 0) {
      await tx.insert(rosters).values(
        players.map((p) => ({
          eventTeamId: ctx.eventTeamId,
          playerName: p.name,
          birthYear: p.birthYear,
          gender: p.gender,
        })),
      );
    }
  });

  revalidatePath(`/events/${ctx.eventSlug}/roster`);
  return { ok: true };
}
