"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { parseAffiliation } from "@/features/clubs/affiliation";
import { clubOptions } from "@/features/clubs/link-queries";
import { teamMembers, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isPendingCrestUrl } from "@/features/uploads/blob";
import { slugify } from "@/lib/slug";

import { uniqueTeamSlug } from "./slug";

export type TeamFormResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
};


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
  // The club is chosen from the directory, so what arrives is an id, the word
  // "independent", or nothing. Checked against the real list here rather than
  // trusted: club_id is a foreign key and affiliation is bound to it by a
  // CHECK, so a stale option in an open tab would otherwise throw.
  const clubIds = (await clubOptions()).map((c) => c.id);

  const [team] = await db
    .insert(teams)
    .values({
      slug,
      name,
      ...parseAffiliation(get("club"), clubIds),
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
