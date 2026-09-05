import Link from "next/link";
import type { Metadata } from "next";

import { Avatar } from "@/components/avatar";
import {
  CATEGORY_LABELS,
  FORUM_CATEGORIES,
  type ForumCategory,
} from "@/features/forum/constants";
import { listForumPosts } from "@/features/forum/queries";
import { CommentIcon, LikeButton } from "@/features/likes/like-button";
import { likeStates } from "@/features/likes/queries";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { includeHiddenInFeed } from "@/features/forum/visibility";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Community",
  description: "The King Juan Soccer community forum.",
};

function timeAgo(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const active = FORUM_CATEGORIES.includes(c as ForumCategory)
    ? (c as ForumCategory)
    : undefined;
  const user = await getCurrentUser();
  const viewer = user ? { id: user.id, admin: isAdmin(user) } : null;
  const posts = await listForumPosts(active, includeHiddenInFeed(viewer));
  const likes = await likeStates(
    "forum_post",
    posts.map((p) => p.id),
    user?.id ?? null,
  );
  const backTo = active ? `/community?c=${active}` : "/community";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Community</h1>
        <Link
          href="/community/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          New post
        </Link>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1.5 text-sm">
        <Link
          href="/community"
          className={`rounded-full px-2.5 py-1 ${
            !active
              ? "bg-ink text-page"
              : "bg-elevated text-muted hover:bg-line"
          }`}
        >
          All
        </Link>
        {FORUM_CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/community?c=${cat}`}
            className={`rounded-full px-2.5 py-1 ${
              active === cat
                ? "bg-ink text-page"
                : "bg-elevated text-muted hover:bg-line"
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing here yet.{" "}
          <Link href="/community/new" className="text-brand-text hover:underline">
            Start the first discussion
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {posts.map((post) => (
            /* The card is no longer one big link: a heart is a real button and
               cannot be nested inside an anchor. The link wraps the reading
               part, the actions sit beside it. */
            <li
              key={post.slug}
              className="rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <Link href={post.href} className="block px-4 pb-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted">
                  {post.pinned && <span className="text-brand-text">📌</span>}
                  <span className="rounded-full bg-elevated px-2 py-0.5">
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  {post.convertedEvent && (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-soft-text">
                      Now an event
                    </span>
                  )}
                  {post.locked && <span>· locked</span>}
                  {post.hiddenAt && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      Hidden
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 font-medium leading-snug">{post.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{post.body}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <Avatar src={post.authorAvatar} name={post.authorName} size={18} />
                  <span>{post.authorName}</span>
                  <span aria-hidden>·</span>
                  <span>{timeAgo(post.lastActivityAt)}</span>
                </div>
              </Link>

              <div className="flex items-center gap-1 px-3 pb-2.5">
                <LikeButton
                  subjectType="forum_post"
                  subjectId={post.id}
                  state={likes.get(post.id) ?? { count: 0, mine: false }}
                  revalidate={backTo}
                  signedIn={Boolean(user)}
                />
                <Link
                  href={post.href}
                  aria-label={`${post.replies} ${post.replies === 1 ? "reply" : "replies"}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  <CommentIcon />
                  {post.replies > 0 && (
                    <span className="tabular-nums">{post.replies}</span>
                  )}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
