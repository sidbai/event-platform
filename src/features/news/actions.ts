"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { newsPosts } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { checkRateLimit } from "@/features/rate-limit";
import { isOurBlobUrl } from "@/features/uploads/blob";
import { slugify } from "@/lib/slug";

import {
  canDeleteNewsPost,
  canEditNewsPost,
  nextStatus,
  type NewsViewer,
} from "./access";
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
  const cover = coverRaw && isOurBlobUrl(coverRaw) ? coverRaw : null;
  // Measured in the browser, so treated as a hint rather than a fact: anything
  // absent, unparseable or absurd becomes null and the article falls back to a
  // fixed shape instead of laying out around a bogus number.
  const dimension = (k: string) => {
    const n = Number(get(k));
    return cover && Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
  };

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
      coverUrl: cover,
      coverWidth: dimension("coverWidth"),
      coverHeight: dimension("coverHeight"),
    },
  };
}

export async function createNewsPost(
  _prev: NewsResult,
  formData: FormData,
): Promise<NewsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a post." };

  const gate = await checkRateLimit("news:create", user);
  if (!gate.ok) return { error: gate.message };
  const viewer: NewsViewer = { id: user.id, admin: isAdmin(user) };

  const { fieldErrors, values } = read(formData);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const intent = formData.get("publish") === "on" ? "submit" : "save";
  const status = nextStatus(intent, viewer);
  const slug = await uniqueSlug(slugify(values.title).slice(0, 70));

  await db.insert(newsPosts).values({
    slug,
    ...values,
    authorId: user.id,
    status,
    publishedAt: status === "published" ? new Date() : null,
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
  if (!user) return { error: "Sign in to edit." };
  const viewer: NewsViewer = { id: user.id, admin: isAdmin(user) };

  const existing = await db.query.newsPosts.findFirst({
    where: eq(newsPosts.slug, slug),
    columns: { id: true, publishedAt: true, status: true, authorId: true },
  });
  if (!existing) return { error: "That post is gone." };
  if (!canEditNewsPost(existing, viewer))
    return { error: "You can't edit that post." };

  const { fieldErrors, values } = read(formData);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const intent = formData.get("publish") === "on" ? "submit" : "save";
  const status = nextStatus(intent, viewer, existing.status);

  await db
    .update(newsPosts)
    .set({
      ...values,
      status,
      // Keep the original publication date across later edits; only stamp it
      // the first time it goes live, or the article keeps jumping to the top
      // of the index every time a typo is fixed.
      publishedAt:
        status === "published" ? (existing.publishedAt ?? new Date()) : null,
      // A resubmission clears the last rejection, so stale feedback does not
      // sit on a post the author has already fixed.
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(eq(newsPosts.id, existing.id));

  revalidatePath("/news");
  revalidatePath(`/news/${slug}`);
  return { ok: true };
}

export async function deleteNewsPost(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const existing = await db.query.newsPosts.findFirst({
    where: eq(newsPosts.slug, slug),
    columns: { status: true, authorId: true },
  });
  if (!existing) return;
  if (!canDeleteNewsPost(existing, { id: user.id, admin: isAdmin(user) })) return;

  await db.delete(newsPosts).where(eq(newsPosts.slug, slug));
  revalidatePath("/news");
  redirect("/news");
}

/** Admin review: put a submission live. */
export async function approveNewsPost(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const existing = await db.query.newsPosts.findFirst({
    where: eq(newsPosts.slug, slug),
    columns: { id: true, publishedAt: true },
  });
  if (!existing) return;

  await db
    .update(newsPosts)
    .set({
      status: "published",
      publishedAt: existing.publishedAt ?? new Date(),
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(eq(newsPosts.id, existing.id));

  revalidatePath("/news");
  revalidatePath(`/news/${slug}`);
  revalidatePath("/admin");
}

/**
 * Admin review: send a submission back to its author.
 *
 * Back to draft rather than a terminal 'rejected' state — the author fixes it
 * and resubmits, which is the outcome we actually want from feedback.
 */
export async function rejectNewsPost(
  slug: string,
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  await db
    .update(newsPosts)
    .set({
      status: "draft",
      publishedAt: null,
      reviewNote: note || "Sent back without a note.",
      updatedAt: new Date(),
    })
    .where(eq(newsPosts.slug, slug));

  revalidatePath("/news");
  revalidatePath(`/news/${slug}`);
  revalidatePath("/admin");
}
