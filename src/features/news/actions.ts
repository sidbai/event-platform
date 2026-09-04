"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { newsPosts } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { isOurBlobUrl } from "@/features/uploads/blob";
import { slugify } from "@/lib/slug";

import { parseCategory, type NewsResult } from "./constants";

const TITLE_MAX = 160;
const SUMMARY_MAX = 300;

async function uniqueSlug(base: string, exceptId?: string) {
  const root = base || "post";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.newsPosts.findFirst({
      where: eq(newsPosts.slug, candidate),
      columns: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function read(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const title = get("title");
  const summary = get("summary");
  const body = get("body");
  const category = parseCategory(formData.get("category"));
  const coverRaw = get("coverUrl");

  const fieldErrors: Record<string, string> = {};
  if (title.length < 4) fieldErrors.title = "Give it a headline.";
  if (title.length > TITLE_MAX) fieldErrors.title = "That headline is too long.";
  if (summary.length < 10)
    fieldErrors.summary = "Add a one-line summary — it's what shows on the index.";
  if (summary.length > SUMMARY_MAX) fieldErrors.summary = "Keep the summary short.";
  if (body.length < 40) fieldErrors.body = "There's not much of an article here yet.";
  if (!category) fieldErrors.category = "Pick a category.";

  return {
    fieldErrors,
    values: {
      title,
      summary,
      body,
      category: category ?? "news",
      // The browser reports this URL after uploading, so it is checked.
      coverUrl: coverRaw && isOurBlobUrl(coverRaw) ? coverRaw : null,
    },
  };
}

export async function createNewsPost(
  _prev: NewsResult,
  formData: FormData,
): Promise<NewsResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Only admins can write news." };

  const { fieldErrors, values } = read(formData);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const publish = formData.get("publish") === "on";
  const slug = await uniqueSlug(slugify(values.title).slice(0, 70));

  await db.insert(newsPosts).values({
    slug,
    ...values,
    authorId: user.id,
    status: publish ? "published" : "draft",
    publishedAt: publish ? new Date() : null,
  });

  revalidatePath("/news");
  redirect(`/news/${slug}`);
}

export async function updateNewsPost(
  slug: string,
  _prev: NewsResult,
  formData: FormData,
): Promise<NewsResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Only admins can edit news." };

  const existing = await db.query.newsPosts.findFirst({
    where: eq(newsPosts.slug, slug),
    columns: { id: true, publishedAt: true },
  });
  if (!existing) return { error: "That post is gone." };

  const { fieldErrors, values } = read(formData);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const publish = formData.get("publish") === "on";

  await db
    .update(newsPosts)
    .set({
      ...values,
      status: publish ? "published" : "draft",
      // Keep the original publication date across later edits; only stamp it
      // the first time it goes live, or the article keeps jumping to the top
      // of the index every time a typo is fixed.
      publishedAt: publish ? (existing.publishedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(newsPosts.id, existing.id));

  revalidatePath("/news");
  revalidatePath(`/news/${slug}`);
  return { ok: true };
}

export async function deleteNewsPost(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db.delete(newsPosts).where(eq(newsPosts.slug, slug));
  revalidatePath("/news");
  redirect("/news");
}
