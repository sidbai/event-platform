import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canEditNewsPost, canViewNewsPost } from "@/features/news/access";
import { DiscussionThread } from "@/features/discussion/thread";
import {
  categoryEmoji,
  categoryLabel,
  readingMinutes,
} from "@/features/news/constants";
import { getNewsPost } from "@/features/news/queries";
import { Markdown } from "@/features/news/markdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.summary,
    openGraph: post.coverUrl ? { images: [post.coverUrl] } : undefined,
  };
}

function fmt(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function NewsPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, user] = await Promise.all([getNewsPost(slug), getCurrentUser()]);
  if (!post) notFound();

  const admin = isAdmin(user);
  const viewer = user ? { id: user.id, admin } : null;
  // Unpublished posts are for admins and the author — an author who could not
  // see their own submission would have no idea it existed.
  if (!canViewNewsPost(post, viewer)) notFound();
  const canEdit = canEditNewsPost(post, viewer);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/news" className="text-sm text-brand-text hover:underline">
        ← News
      </Link>

      {post.status === "pending" && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {admin
            ? "Waiting for review — approve it from the admin queue."
            : "Sent for review. An editor will take a look before it appears on News."}
        </p>
      )}

      {post.status === "draft" && (
        <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p>Draft — only you and the editors can see this.</p>
          {post.reviewNote && (
            <p className="mt-1">
              <span className="font-medium">Sent back:</span> {post.reviewNote}
            </p>
          )}
        </div>
      )}

      <article className="mt-4">
        <span className="text-xs font-medium text-brand-text">
          <span aria-hidden>{categoryEmoji(post.category)}</span>{" "}
          {categoryLabel(post.category)}
        </span>
        <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">
          {post.title}
        </h1>
        <p className="mt-2 text-lg text-muted">{post.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>{post.authorName}</span>
          <span aria-hidden>·</span>
          <span>{fmt(post.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{readingMinutes(post.body)} min read</span>
          {canEdit && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/news/${slug}/edit`}
                className="text-brand-text hover:underline"
              >
                Edit
              </Link>
            </>
          )}
        </div>

        {post.coverUrl &&
          (post.coverWidth && post.coverHeight ? (
            /* Its own shape, since we know it. A portrait photo stays a
               portrait photo instead of being cropped through the middle to
               fit one ratio that suited the first cover anyone uploaded. */
            <Image
              src={post.coverUrl}
              alt=""
              width={post.coverWidth}
              height={post.coverHeight}
              sizes="(max-width: 768px) 100vw, 768px"
              /* Capped so a very tall photo cannot push the article itself off
                 the first screen. The cap is on the box rather than on how the
                 picture fills it: the element shrinks to the shape of the
                 image, so a portrait cover is centred at its own proportions
                 instead of sitting in a full-width strip between two bars. */
              className="mx-auto mt-6 block h-auto w-auto max-w-full rounded-xl"
              style={{ maxHeight: "80vh" }}
              priority
            />
          ) : (
            /* Size unknown: a fixed box is the only safe assumption about the
               shape, but the image is fitted inside it rather than cropped to
               fill it. Letterboxing a portrait photo looks worse than a crop
               and shows all of it, which is the right way round — cropping
               silently threw away most of a 960x1200 cover.

               Running `pnpm db:backfill:covers` measures these and they stop
               taking this path. */
            <div className="relative mt-6 aspect-[16/8] w-full overflow-hidden rounded-xl bg-elevated">
              <Image
                src={post.coverUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-contain"
                priority
              />
            </div>
          ))}

        <div className="mt-6">
          <Markdown>{post.body}</Markdown>
        </div>
      </article>

      <DiscussionThread
        subjectType="news_post"
        subjectId={post.id}
        revalidate={`/news/${slug}`}
        canModerate={admin}
      />
    </div>
  );
}
