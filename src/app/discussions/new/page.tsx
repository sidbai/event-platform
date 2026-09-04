import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { createForumPost } from "@/features/forum/actions";
import { FORUM_CATEGORIES } from "@/features/forum/constants";
import { PostForm } from "@/features/forum/post-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New discussion" };

export default async function NewDiscussionPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  await requireUser("/discussions/new");
  const { c } = await searchParams;
  const defaultCategory = FORUM_CATEGORIES.includes(
    c as (typeof FORUM_CATEGORIES)[number],
  )
    ? c!
    : "general";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link
        href="/discussions"
        className="text-sm text-brand-text hover:underline"
      >
        ← Discussions
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">New post</h1>
      <PostForm action={createForumPost} defaultCategory={defaultCategory} />
    </div>
  );
}
