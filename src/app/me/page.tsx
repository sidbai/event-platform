import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { waitingOn, written, type Written } from "@/features/me/queries";

export const metadata: Metadata = {
  title: "Your page",
  // Nobody else can open it, so nothing should be trying to index it either.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The page that is yours, and nobody else's.
 *
 * There is no public counterpart any more — a handle beside a post is
 * attribution, and a page collecting everything one person has written is a
 * different thing this site does not do. So this one needs no sentence
 * explaining which half strangers can read: none of it.
 *
 * Ordered by question rather than by table, and a section with nothing to say
 * is not rendered. A personal page that lists every table with your id in it
 * is a page of empty boxes, which is what it would be for almost everybody
 * here today.
 *
 * Two sections so far. What is next — the fixtures of teams you follow and
 * the events you said you would be at — goes above both, and waits on the
 * follow table.
 */

const WHAT = { post: "Post", comment: "Comment", review: "Review" } as const;

function when(at: Date) {
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(at);
}

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/me")}`);

  const [waiting, mine] = await Promise.all([waitingOn(user.id), written(user.id)]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your page</h1>
      <p className="mt-1 text-sm text-muted">
        Only you can see this. Anything you post shows the handle{" "}
        <span className="font-mono">@{user.username}</span> and nothing else.
      </p>

      {waiting.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Waiting on you</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-elevated">
            {waiting.map((item, i) => (
              <li key={`${item.kind}-${i}`} className="px-4 py-3 text-sm">
                <Link href={item.href} className="font-medium hover:underline">
                  {item.what}
                </Link>
                {item.detail && <p className="text-xs text-muted">{item.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">What you have written</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing yet. A question in the{" "}
            <Link href="/community" className="text-brand-text hover:underline">
              community
            </Link>{" "}
            is the usual place to start.
          </p>
        ) : (
          <>
            {/*
              The reason this exists is narrower than it looks: there is no way
              to find your own review of a club except by remembering which
              club it was.
            */}
            <ul className="mt-3 space-y-2 text-sm">
              {mine.map((item: Written, i) => (
                <li key={`${item.kind}-${i}`}>
                  <Link href={item.href} className="hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {WHAT[item.kind]} · {item.where} · {when(item.at)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/messages" className="text-brand-text hover:underline">
          Messages
        </Link>
        <Link href="/settings" className="text-brand-text hover:underline">
          Settings
        </Link>
      </div>
    </main>
  );
}
