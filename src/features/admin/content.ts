import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/db";
import { clubs, events, forumPosts } from "@/db/schema";
import { publicName } from "@/features/auth";
import { clubDirectoryOrder } from "@/features/clubs/order";
import { paginate } from "@/features/pagination/paginate";

/**
 * The browse lists on /admin: everything there is, a page at a time.
 *
 * Unlike the queues above them these never empty — they are how an admin FINDS
 * something to act on — so each takes a page number and hands back the
 * pagination alongside the rows. Counting first lets the page be clamped
 * before the window is read, so ?posts=99 shows the last page rather than a
 * pager pointing at rows that were never fetched.
 */
/**
 * Recent posts for the admin content list.
 *
 * Deliberately shows hidden ones too, and says which: the queues elsewhere are
 * for things awaiting a decision, but banning something requires FINDING it
 * first, and lifting a ban requires seeing what is currently down.
 */
export async function recentForumPosts(page: number, perPage: number) {
  const pagination = paginate(await db.$count(forumPosts), page, perPage);
  const rows = await db.query.forumPosts.findMany({
    orderBy: [desc(forumPosts.lastActivityAt)],
    limit: pagination.perPage,
    offset: pagination.offset,
    with: {
      author: { columns: { displayName: true, name: true, username: true } },
    },
  });
  return {
    pagination,
    rows: rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      hidden: p.hiddenAt !== null,
      author: p.author ? publicName(p.author) : "Someone",
      at: p.lastActivityAt,
    })),
  };
}

export async function recentEvents(page: number, perPage: number) {
  const pagination = paginate(await db.$count(events), page, perPage);
  const rows = await db.query.events.findMany({
    orderBy: [desc(events.createdAt)],
    limit: pagination.perPage,
    offset: pagination.offset,
    columns: {
      slug: true,
      title: true,
      status: true,
      visibility: true,
      hiddenAt: true,
      createdAt: true,
    },
  });
  return {
    pagination,
    rows: rows.map((e) => ({
      slug: e.slug,
      title: e.title,
      status: e.status,
      visibility: e.visibility,
      hidden: e.hiddenAt !== null,
      at: e.createdAt,
    })),
  };
}

/**
 * Clubs for the admin pin list, in the order /clubs will show them.
 *
 * Matching that order matters more here than anywhere else: this is the screen
 * where someone decides what to pin, so it should show what pinning will do.
 */
export async function allClubs(page: number, perPage: number) {
  const pagination = paginate(await db.$count(clubs), page, perPage);
  const rows = await db.query.clubs.findMany({
    orderBy: clubDirectoryOrder,
    columns: {
      slug: true,
      name: true,
      city: true,
      pinned: true,
      league: true,
    },
    limit: pagination.perPage,
    offset: pagination.offset,
  });
  return { pagination, rows };
}
