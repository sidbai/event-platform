import Link from "next/link";
import { notFound } from "next/navigation";
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

  const admin = isAdmin(user);
  const mine = !!user && post.authorId === user.id;
  const canModerate = admin || mine;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link
        href={`/discussions?c=${post.category}`}
        className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
      >
        ← {CATEGORY_LABELS[post.category]}
      </Link>

      <article className="mt-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {post.pinned && <span className="text-emerald-700 dark:text-emerald-400">📌 Pinned</span>}
          {post.locked && <span>Locked</span>}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{post.title}</h1>

        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
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

        <p className="mt-4 whitespace-pre-wrap leading-relaxed text-neutral-800 dark:text-neutral-100">
          {post.body}
        </p>

        {canModerate && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-400">
            {admin && (
              <>
                <form action={setForumPostFlag.bind(null, slug, "pinned", !post.pinned)}>
                  <button className="hover:text-emerald-700 dark:hover:text-emerald-400">
                    {post.pinned ? "Unpin" : "Pin"}
                  </button>
                </form>
                <form action={setForumPostFlag.bind(null, slug, "locked", !post.locked)}>
                  <button className="hover:text-neutral-600 dark:hover:text-neutral-200">
                    {post.locked ? "Unlock" : "Lock"}
                  </button>
                </form>
              </>
            )}
            <form action={deleteForumPost.bind(null, slug)}>
              <button className="hover:text-red-600 dark:hover:text-red-400">Delete</button>
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
