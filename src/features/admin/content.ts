import "server-only";

import { asc, desc } from "drizzle-orm";

import { db } from "@/db";
import { clubs, events, forumPosts } from "@/db/schema";
import { publicName } from "@/features/auth";

/**
 * Recent posts and events for the admin content list.
 *
 * Deliberately shows hidden ones too, and says which: the queues elsewhere are
 * for things awaiting a decision, but banning something requires FINDING it
 * first, and lifting a ban requires seeing what is currently down.
 */
export async function recentForumPosts(limit = 20) {
  const rows = await db.query.forumPosts.findMany({
    orderBy: [desc(forumPosts.lastActivityAt)],
    limit,
    with: {
      author: { columns: { displayName: true, name: true, username: true } },
    },
  });
  return rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    hidden: p.hiddenAt !== null,
    author: p.author ? publicName(p.author) : "Someone",
    at: p.lastActivityAt,
  }));
}

export async function recentEvents(limit = 20) {
  const rows = await db.query.events.findMany({
    orderBy: [desc(events.createdAt)],
    limit,
    columns: {
      slug: true,
      title: true,
      status: true,
      visibility: true,
      hiddenAt: true,
      createdAt: true,
    },
  });
  return rows.map((e) => ({
    slug: e.slug,
    title: e.title,
    status: e.status,
    visibility: e.visibility,
    hidden: e.hiddenAt !== null,
    at: e.createdAt,
  }));
}

/** Clubs for the admin pin list, pinned ones first. */
export async function allClubs() {
  const rows = await db.query.clubs.findMany({
    orderBy: [desc(clubs.pinned), asc(clubs.name)],
    columns: { slug: true, name: true, city: true, pinned: true },
  });
  return rows;
}
