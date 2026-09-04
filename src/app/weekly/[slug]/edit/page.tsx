import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { savePost } from "@/features/weekly/actions";
import { WeeklyEditForm } from "@/features/weekly/edit-form";
import { getPost } from "@/features/weekly/queries";

export const dynamic = "force-dynamic";

export default async function EditWeeklyPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();

  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Link href={`/weekly/${slug}`} className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← {post.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit issue</h1>
      <WeeklyEditForm
        action={savePost.bind(null, slug)}
        title={post.title}
        intro={post.intro}
        events={post.events.map((e) => ({ id: e.id, title: e.title }))}
      />
    </div>
  );
}
