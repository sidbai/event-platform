"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isPendingCrestUrl } from "@/features/uploads/blob";
import { slugify } from "@/lib/slug";

export type TeamFormResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function uniqueTeamSlug(base: string) {
  const root = base || "team";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.teams.findFirst({
      where: eq(teams.slug, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function createTeam(
  _prev: TeamFormResult,
  formData: FormData,
): Promise<TeamFormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to create a team." };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  if (name.length < 2) return { fieldErrors: { name: "Give the team a name." } };
  if (name.length > 80) return { fieldErrors: { name: "That name is too long." } };

  const visibility = get("visibility") === "private" ? "private" : "public";

  // Only a crest this form just staged. Anything else is dropped rather than
  // rejected — a bad URL shouldn't cost someone the rest of the form.
  const crest = get("crestUrl");
  const crestUrl = crest && isPendingCrestUrl(crest) ? crest : null;
  const slug = await uniqueTeamSlug(slugify(name).slice(0, 60));

  const [team] = await db
    .insert(teams)
    .values({
      slug,
      name,
      club: get("club") || null,
      ageGroup: get("ageGroup") || null,
      gender: get("gender") || null,
      city: get("city") || null,
      crestUrl,
      bio: get("bio") || null,
      visibility,
      // The creator owns it outright — no claim flow needed for a team that
      // was never auto-created by a tournament.
      ownerId: user.id,
    })
    .returning({ id: teams.id });

  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  revalidatePath("/teams");
  redirect(`/teams/${slug}`);
}
