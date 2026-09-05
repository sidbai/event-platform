import Link from "next/link";
import type { Metadata } from "next";

import { SearchBar } from "@/components/search-bar";
import { EventTags } from "@/features/events/event-tags";
import { listEvents } from "@/features/events/queries";
import { CATEGORY_LABELS } from "@/features/forum/constants";
import { searchForumPosts } from "@/features/forum/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").trim();

  // Both halves reuse the section queries, so search inherits their visibility
  // rules rather than re-deriving who may see what.
  const [events, posts] = q
    ? await Promise.all([listEvents({ q }), searchForumPosts(q)])
    : [[], []];
  const total = events.length + posts.length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>

      <SearchBar
        className="mt-4"
        action="/search"
        defaultValue={q}
        label="Search events and community posts"
        placeholder="Search events and community posts"
      />

      {!q ? (
        <p className="mt-8 text-muted">
          Search across events and community posts.
        </p>
      ) : total === 0 ? (
        <p className="mt-8 text-muted">
          Nothing matches <span className="text-ink">&ldquo;{q}&rdquo;</span>.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {total} {total === 1 ? "result" : "results"} for{" "}
            <span className="text-ink">&ldquo;{q}&rdquo;</span>
          </p>

          {events.length > 0 && (
            <section className="mt-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Events
                </h2>
                <Link
                  href={`/events?q=${encodeURIComponent(q)}`}
                  className="text-xs text-brand-text hover:underline"
                >
                  All matching events
                </Link>
              </div>
              <ul className="mt-1 divide-y divide-line">
                {events.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.slug}`}
                      className="block py-3 transition-colors hover:bg-elevated"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{event.title}</span>
                        <span className="shrink-0 text-sm text-muted">
                          {fmtDate(event.startsAt, event.timezone)}
                        </span>
                      </div>
                      {event.venue && (
                        <div className="mt-0.5 text-sm text-muted">
                          {event.venue.name}
                        </div>
                      )}
                      <EventTags event={event} className="mt-2" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {posts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Community
              </h2>
              <ul className="mt-1 divide-y divide-line">
                {posts.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/community/${post.slug}`}
                      className="block py-3 transition-colors hover:bg-elevated"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="rounded-full bg-elevated px-2 py-0.5">
                          {CATEGORY_LABELS[post.category]}
                        </span>
                        <span>{post.authorName}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {post.replies}{" "}
                          {post.replies === 1 ? "reply" : "replies"}
                        </span>
                      </div>
                      <div className="mt-1 font-medium leading-snug">
                        {post.title}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                        {post.body}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
