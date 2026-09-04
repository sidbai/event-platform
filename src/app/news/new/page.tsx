import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { createNewsPost } from "@/features/news/actions";
import { NewsPostForm } from "@/features/news/post-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write a post" };

export default async function NewNewsPage() {
  const user = await requireUser("/news/new");
  const admin = isAdmin(user);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/news" className="text-sm text-brand-text hover:underline">
        ← News
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Write a post</h1>
      {!admin && (
        <p className="mt-2 text-sm text-muted">
          Anyone can write. An editor reads it before it appears on News — you
          can keep working on it as a draft until you send it.
        </p>
      )}
      <NewsPostForm
        action={createNewsPost}
        admin={admin}
        submitLabel="Create post"
      />
    </div>
  );
}
