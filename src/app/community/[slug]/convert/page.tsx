import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { eventKinds } from "@/db/schema";
import { requireUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { convertPostToEvent } from "@/features/forum/actions";
import { ConvertForm } from "@/features/forum/convert-form";
import { getForumPost } from "@/features/forum/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turn into an event" };

export default async function ConvertPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/community/${slug}/convert`);
  const post = await getForumPost(slug);
  if (!post) notFound();

  if (post.convertedEvent) redirect(`/events/${post.convertedEvent.slug}`);
  if (post.authorId !== user.id && !isAdmin(user)) notFound();

  const kinds = await db.query.eventKinds.findMany({
    orderBy: [asc(eventKinds.sort)],
    columns: { slug: true, label: true },
  });

  const action = convertPostToEvent.bind(null, slug);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/community/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {post.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Turn this into an event
      </h1>
      <p className="mt-1 text-sm text-muted">
        The replies come with it — everyone already in this thread will find it
        on the event page, and the old link still works.
      </p>

      <ConvertForm action={action} kinds={kinds} defaultTitle={post.title} />
    </div>
  );
}
