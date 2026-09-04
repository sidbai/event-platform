"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { forumPosts } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { slugify } from "@/lib/slug";

import { FORUM_CATEGORIES, type ForumResult } from "./constants";

const TITLE_MAX = 140;
const BODY_MAX = 8000;

export async function createForumPost(
  _prev: ForumResult,
  formData: FormData,
): Promise<ForumResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to post." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "general");

  const fieldErrors: Record<string, string> = {};
  if (title.length < 4) fieldErrors.title = "Give it a title.";
  if (title.length > TITLE_MAX) fieldErrors.title = "Title is too long.";
  if (body.length < 2) fieldErrors.body = "Add some detail.";
  if (body.length > BODY_MAX) fieldErrors.body = "That's too long.";
  if (!FORUM_CATEGORIES.includes(category as (typeof FORUM_CATEGORIES)[number]))
    fieldErrors.category = "Pick a category.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const base = slugify(title) || "post";
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.query.forumPosts.findFirst({
      where: eq(forumPosts.slug, candidate),
      columns: { id: true },
    });
    if (!clash) {
      slug = candidate;
      break;
    }
  }

  await db.insert(forumPosts).values({
    slug,
    title,
    body,
    category: category as (typeof FORUM_CATEGORIES)[number],
    authorId: user.id,
  });

  revalidatePath("/discussions");
  redirect(`/discussions/${slug}`);
}

async function canModerate(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const post = await db.query.forumPosts.findFirst({
    where: eq(forumPosts.slug, slug),
    columns: { id: true, authorId: true },
  });
  if (!post) return null;
  if (post.authorId !== user.id && !isAdmin(user)) return null;
  return post;
}

export async function setForumPostFlag(
  slug: string,
  flag: "pinned" | "locked",
  value: boolean,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return; // pin/lock is admin-only
  await db
    .update(forumPosts)
    .set({ [flag]: value })
    .where(eq(forumPosts.slug, slug));
  revalidatePath(`/discussions/${slug}`);
  revalidatePath("/discussions");
}

export async function deleteForumPost(slug: string): Promise<void> {
  const post = await canModerate(slug);
  if (!post) return;
  await db.delete(forumPosts).where(eq(forumPosts.id, post.id));
  revalidatePath("/discussions");
  redirect("/discussions");
}
