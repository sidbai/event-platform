import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Avatar } from "@/components/avatar";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { DiscussionThread } from "@/features/discussion/thread";
import {
  deleteForumPost,
  setForumPostFlag,
} from "@/features/forum/actions";
import { CATEGORY_LABELS } from "@/features/forum/constants";
import { getForumPost } from "@/features/forum/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getForumPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.body.slice(0, 160),
  };
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function ForumPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, user] = await Promise.all([getForumPost(slug), getCurrentUser()]);
  if (!post) notFound();

  // The thread moved to the event; keep shared links working.
  if (post.convertedEvent) redirect(`/events/${post.convertedEvent.slug}`);

  const admin = isAdmin(user);
  const mine = !!user && post.authorId === user.id;
  const canModerate = admin || mine;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link
        href={`/discussions?c=${post.category}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {CATEGORY_LABELS[post.category]}
      </Link>

      <article className="mt-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          {post.pinned && <span className="text-brand-text">📌 Pinned</span>}
          {post.locked && <span>Locked</span>}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{post.title}</h1>

        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Avatar src={post.authorAvatar} name={post.authorName} size={22} />
          {post.authorUsername ? (
            <Link href={`/people/${post.authorUsername}`} className="hover:underline">
              {post.authorName}
            </Link>
          ) : (
            <span>{post.authorName}</span>
          )}
          <span>·</span>
          <span>{fmt(post.createdAt)}</span>
        </div>

        <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink">
          {post.body}
        </p>

        {canModerate && (
          <Link
            href={`/discussions/${slug}/convert`}
            className="mt-5 inline-block rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated"
          >
            Turn into an event →
          </Link>
        )}

        {canModerate && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
            {admin && (
              <>
                <form action={setForumPostFlag.bind(null, slug, "pinned", !post.pinned)}>
                  <button className="hover:text-brand-text">
                    {post.pinned ? "Unpin" : "Pin"}
                  </button>
                </form>
                <form action={setForumPostFlag.bind(null, slug, "locked", !post.locked)}>
                  <button className="hover:text-ink">
                    {post.locked ? "Unlock" : "Lock"}
                  </button>
                </form>
              </>
            )}
            <form action={deleteForumPost.bind(null, slug)}>
              <button className="hover:text-red-600">Delete</button>
            </form>
          </div>
        )}
      </article>

      <DiscussionThread
        subjectType="forum_post"
        subjectId={post.id}
        revalidate={`/discussions/${slug}`}
        canModerate={canModerate}
      />
    </div>
  );
}
