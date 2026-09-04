"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  discussions,
  eventKinds,
  events,
  forumPosts,
  venues,
} from "@/db/schema";
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

  revalidatePath("/community");
  redirect(`/community/${slug}`);
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
  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
}

export async function deleteForumPost(slug: string): Promise<void> {
  const post = await canModerate(slug);
  if (!post) return;
  await db.delete(forumPosts).where(eq(forumPosts.id, post.id));
  revalidatePath("/community");
  redirect("/community");
}

async function uniqueEventSlug(base: string) {
  const root = base || "event";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.events.findFirst({
      where: eq(events.slug, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * Turn a discussion into a real event, carrying the thread with it.
 *
 * The discussion row is re-pointed from the post to the new event rather than
 * copied, so every reply (and its pinned/locked state) follows in one write.
 * The post then redirects to the event, so links people already shared still
 * land on the conversation.
 */
export async function convertPostToEvent(
  slug: string,
  _prev: ForumResult,
  formData: FormData,
): Promise<ForumResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const post = await db.query.forumPosts.findFirst({
    where: eq(forumPosts.slug, slug),
  });
  if (!post) return { error: "That post is gone." };
  if (post.authorId !== user.id && !isAdmin(user))
    return { error: "Only the author can turn this into an event." };
  if (post.convertedEventId) return { error: "This is already an event." };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const kind = get("kind");
  const title = get("title") || post.title;
  const locationType = get("locationType") || "in_person";
  const date = get("date");
  const time = get("time");
  const venueName = get("venueName");
  const onlineUrl = get("onlineUrl");

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Give the event a name.";
  if (!kind) fieldErrors.kind = "Pick a kind.";
  if (!date) fieldErrors.date = "Pick a date.";
  if (locationType === "in_person" && !venueName)
    fieldErrors.venueName = "Where is it?";
  if (locationType === "online" && !onlineUrl) fieldErrors.onlineUrl = "Add a link.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const kindRow = await db.query.eventKinds.findFirst({
    where: eq(eventKinds.slug, kind),
  });
  if (!kindRow) return { fieldErrors: { kind: "Unknown kind." } };

  let venueId: string | null = null;
  if (locationType === "in_person") {
    const existing = await db.query.venues.findFirst({
      where: eq(venues.name, venueName),
    });
    venueId =
      existing?.id ??
      (
        await db
          .insert(venues)
          .values({ name: venueName, city: get("venueCity") || null })
          .returning({ id: venues.id })
      )[0].id;
  }

  const eventSlug = await uniqueEventSlug(slugify(title).slice(0, 60));

  const [event] = await db
    .insert(events)
    .values({
      slug: eventSlug,
      kind,
      modules: kindRow.defaultModules,
      title,
      summary: post.body,
      // A post with a thread has already been vetted by the people replying to
      // it, and a pickup game is worthless if it waits in a queue.
      status: "published",
      visibility: "public",
      locationType: locationType as "in_person" | "online" | "hybrid",
      venueId,
      onlineUrl: locationType === "online" ? onlineUrl : null,
      startsAt: new Date(`${date}T${time || "00:00"}`),
      timezone: "America/Los_Angeles",
      organizerId: post.authorId,
    })
    .returning({ id: events.id });

  // Move the thread. There is a unique key on (subject_type, subject_id) and
  // the event is brand new, so this cannot collide.
  await db
    .update(discussions)
    .set({ subjectType: "event", subjectId: event.id })
    .where(
      and(
        eq(discussions.subjectType, "forum_post"),
        eq(discussions.subjectId, post.id),
      ),
    );

  await db
    .update(forumPosts)
    .set({ convertedEventId: event.id })
    .where(eq(forumPosts.id, post.id));

  revalidatePath("/community");
  revalidatePath("/events");
  redirect(`/events/${eventSlug}`);
}
