import Link from "next/link";
import type { Metadata } from "next";

import { Avatar } from "@/components/avatar";
import {
  CATEGORY_LABELS,
  FORUM_CATEGORIES,
  type ForumCategory,
} from "@/features/forum/constants";
import { listForumPosts } from "@/features/forum/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discussions",
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

export default async function DiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const active = FORUM_CATEGORIES.includes(c as ForumCategory)
    ? (c as ForumCategory)
    : undefined;
  const posts = await listForumPosts(active);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Discussions</h1>
        <Link
          href="/discussions/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          New post
        </Link>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1.5 text-sm">
        <Link
          href="/discussions"
          className={`rounded-full px-2.5 py-1 ${
            !active
              ? "bg-ink text-page"
              : "bg-elevated text-muted hover:bg-line dark:text-muted"
          }`}
        >
          All
        </Link>
        {FORUM_CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/discussions?c=${cat}`}
            className={`rounded-full px-2.5 py-1 ${
              active === cat
                ? "bg-ink text-page"
                : "bg-elevated text-muted hover:bg-line dark:text-muted"
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing here yet.{" "}
          <Link href="/discussions/new" className="text-brand-text hover:underline">
            Start the first discussion
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/discussions/${post.slug}`}
                className="block rounded-xl border border-line bg-card p-4 transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-center gap-2 text-xs text-muted">
                  {post.pinned && <span className="text-brand-text">📌</span>}
                  <span className="rounded-full bg-elevated px-2 py-0.5">
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  {post.locked && <span>· locked</span>}
                </div>
                <h2 className="mt-1.5 font-medium leading-snug">{post.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{post.body}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <Avatar src={post.authorAvatar} name={post.authorName} size={18} />
                  <span>{post.authorName}</span>
                  <span>·</span>
                  <span>{timeAgo(post.lastActivityAt)}</span>
                  <span>·</span>
                  <span>
                    {post.replies} {post.replies === 1 ? "reply" : "replies"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
