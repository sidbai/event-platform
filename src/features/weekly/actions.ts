"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { posts } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { upcomingEventsForDigest } from "./queries";

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d)
    : "";

export async function generateWeeklyDraft(): Promise<{ error?: string; slug?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Admins only." };

  const events = await upcomingEventsForDigest(14);
  if (events.length === 0) return { error: "No upcoming events to feature." };

  const today = new Date();
  const slug = `weekly-${today.toISOString().slice(0, 10)}`;
  const rangeEnd = new Date(today.getTime() + 14 * 86_400_000);
  const title = `Youth Soccer Weekly — ${fmt(today)}–${fmt(rangeEnd)}`;
  const intro =
    `${events.length} youth soccer event${events.length > 1 ? "s" : ""} around the Seattle area ` +
    `over the next two weeks. Details on each below — tap through to RSVP or find an opponent.`;

  await db
    .insert(posts)
    .values({
      slug,
      title,
      intro,
      status: "draft",
      featuredEventIds: events.map((e) => e.id),
      authorId: user.id,
    })
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        title,
        intro,
        featuredEventIds: events.map((e) => e.id),
        updatedAt: new Date(),
      },
    });

  revalidatePath("/admin");
  return { slug };
}

export async function savePost(
  slug: string,
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Admins only." };

  const title = String(formData.get("title") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (!title) return { error: "Needs a title." };

  const keep = new Set(formData.getAll("keep").map(String));
  const existing = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  if (!existing) return { error: "Not found." };

  const featuredEventIds = existing.featuredEventIds.filter((id) => keep.has(id));

  await db
    .update(posts)
    .set({ title, intro, featuredEventIds, updatedAt: new Date() })
    .where(eq(posts.slug, slug));

  revalidatePath(`/weekly/${slug}`);
  return { ok: true };
}

export async function publishPost(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(posts)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(posts.slug, slug));
  revalidatePath("/weekly");
  revalidatePath(`/weekly/${slug}`);
}

export async function unpublishPost(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(posts)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(posts.slug, slug));
  revalidatePath("/weekly");
  revalidatePath(`/weekly/${slug}`);
}
