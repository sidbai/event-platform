import Link from "next/link";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { listDraftPosts, listPublishedPosts } from "@/features/weekly/queries";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function WeeklyPage() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const [published, drafts] = await Promise.all([
    listPublishedPosts(),
    admin ? listDraftPosts() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Youth Soccer Weekly</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What&rsquo;s happening around Seattle youth soccer.
      </p>

      {admin && drafts.length > 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Drafts
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {drafts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/weekly/${post.slug}`}
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {published.length === 0 ? (
        <p className="mt-8 text-neutral-500">No issues yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-neutral-200 dark:divide-neutral-800">
          {published.map((post) => (
            <li key={post.id} className="py-4">
              <Link
                href={`/weekly/${post.slug}`}
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {post.title}
              </Link>
              <div className="text-sm text-neutral-500">{fmt(post.publishedAt)}</div>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">
                {post.intro}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
