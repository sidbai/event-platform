"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { normalizeUsername, validateUsername } from "@/lib/username";

import { PROFILE_TAGS, type ProfileResult } from "./constants";
import { usernameAvailable } from "./username";

export async function updateProfile(
  _prev: ProfileResult,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const fieldErrors: Record<string, string> = {};

  const rawUsername = normalizeUsername(String(formData.get("username") ?? ""));
  const usernameError = validateUsername(rawUsername);
  if (usernameError) fieldErrors.username = usernameError;
  else if (
    rawUsername !== user.username &&
    !(await usernameAvailable(rawUsername, user.id))
  ) {
    fieldErrors.username = "That username is taken.";
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length > 60) fieldErrors.displayName = "Keep it under 60 characters.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const tags = PROFILE_TAGS.filter((t) => formData.get(`tag_${t}`) === "on");
  const clean = (k: string, max: number) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? v.slice(0, max) : null;
  };

  await db
    .update(users)
    .set({
      username: rawUsername,
      displayName: displayName || rawUsername,
      tags,
      club: clean("club", 80),
      city: clean("city", 80),
      bio: clean("bio", 500),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/settings");
  revalidatePath(`/people/${rawUsername}`);
  return { ok: true };
}
