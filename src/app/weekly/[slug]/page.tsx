import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { DiscussionThread } from "@/features/discussion/thread";
import { publishPost, unpublishPost } from "@/features/weekly/actions";
import { getPost } from "@/features/weekly/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.intro,
    openGraph: { title: post.title, description: post.intro },
  };
}

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz ?? undefined,
  }).format(d);
}

export default async function WeeklyPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, user] = await Promise.all([getPost(slug), getCurrentUser()]);
  if (!post) notFound();

  const admin = isAdmin(user);
  if (post.status === "draft" && !admin) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/weekly" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Youth Soccer Weekly
      </Link>

      {admin && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
          <span className="text-neutral-500">{post.status}</span>
          <Link href={`/weekly/${slug}/edit`} className="text-emerald-700 hover:underline dark:text-emerald-400">
            Edit
          </Link>
          {post.status === "draft" ? (
            <form action={publishPost.bind(null, slug)}>
              <button className="text-emerald-700 hover:underline dark:text-emerald-400">Publish</button>
            </form>
          ) : (
            <form action={unpublishPost.bind(null, slug)}>
              <button className="text-neutral-500 hover:underline">Unpublish</button>
            </form>
          )}
        </div>
      )}

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{post.title}</h1>
      {post.intro && (
        <p className="mt-3 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
          {post.intro}
        </p>
      )}

      <div className="mt-8 space-y-3">
        {post.events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="block rounded-lg border border-neutral-200 p-4 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{event.title}</span>
              <span className="shrink-0 text-sm text-neutral-500">
                {fmtDate(event.startsAt, event.timezone)}
              </span>
            </div>
            <div className="mt-0.5 text-sm text-neutral-500">
              <span className="capitalize">{event.kind}</span>
              {event.venue && <span> · {event.venue.name}</span>}
              {event.needsOpponent && (
                <span className="text-amber-700 dark:text-amber-500"> · looking for opponent</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <DiscussionThread
        subjectType="post"
        subjectId={post.id}
        revalidate={`/weekly/${slug}`}
        canModerate={admin}
      />
    </div>
  );
}
