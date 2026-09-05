import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canEditNewsPost } from "@/features/news/access";
import { deleteNewsPost, updateNewsPost } from "@/features/news/actions";
import { NewsPostForm } from "@/features/news/post-form";
import { getNewsPost } from "@/features/news/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit post" };

export default async function EditNewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/news/${slug}/edit`);
  const admin = isAdmin(user);

  const post = await getNewsPost(slug);
  if (!post) notFound();
  // Authors edit their own work up to the moment it goes live; after that it
  // is the site's article, not theirs.
  if (!canEditNewsPost(post, { id: user.id, admin })) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/news/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {post.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit post</h1>

      <NewsPostForm
        action={updateNewsPost.bind(null, slug)}
        admin={admin}
        submitLabel="Save changes"
        existing={{
          title: post.title,
          summary: post.summary,
          body: post.body,
          category: post.category,
          coverUrl: post.coverUrl,
          coverWidth: post.coverWidth,
          coverHeight: post.coverHeight,
          published: post.status === "published",
        }}
      />

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="text-lg font-semibold">Delete post</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Removes the article and its comments. Unpublishing instead keeps both.
        </p>
        <form action={deleteNewsPost.bind(null, slug)}>
          <button className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
            Delete this post
          </button>
        </form>
      </section>
    </div>
  );
}
