import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { CreateLink } from "@/components/create-link";
import { getCurrentUser } from "@/features/auth";
import { EventTags } from "@/features/events/event-tags";
import { homeFeed, type FeedItem } from "@/features/feed/queries";
import { CATEGORY_LABELS } from "@/features/forum/constants";
import { CommentIcon, LikeButton } from "@/features/likes/like-button";
import { likeStates } from "@/features/likes/queries";
import { categoryEmoji, categoryLabel } from "@/features/news/constants";

// A feed of live content, so this cannot be a static landing page.
export const dynamic = "force-dynamic";

/**
 * Enough to fill a scroll without turning the front page into the archive.
 * Each kind has its own page for going further back.
 */
const FEED_SIZE = 24;

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

function timeAgo(d: Date, now: number) {
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

/**
 * What kind of thing this is, said once per card.
 *
 * The feed mixes three sources, so without this the only clue would be the
 * shape of the card underneath — which is exactly the sort of thing that reads
 * fine to whoever built it and to nobody else.
 */
const KIND: Record<FeedItem["kind"], { label: string; className: string }> = {
  news: { label: "News", className: "bg-brand-soft text-brand-soft-text" },
  event: { label: "Event", className: "bg-brand-soft text-brand-soft-text" },
  post: { label: "Community", className: "bg-elevated text-muted" },
};

function KindChip({ kind }: { kind: FeedItem["kind"] }) {
  const k = KIND[kind];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.className}`}>
      {k.label}
    </span>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const { items, now } = await homeFeed(FEED_SIZE);

  // Only forum posts can be liked today, so only they need the state fetched.
  const likes = await likeStates(
    "forum_post",
    items.filter((i) => i.kind === "post").map((i) => i.id),
    user?.id ?? null,
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* Kept a step above the cards below it so the page outline still reads,
          but small enough not to shout over the feed. */}
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        King Juan Soccer: A community platform for Seattle-area youth soccer.
        More soccer, less effort!
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <CreateLink href="/events/new">Start an event</CreateLink>
        <CreateLink href="/community/new">Start a post</CreateLink>
        {user && <CreateLink href="/news/new">Write a post</CreateLink>}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing posted yet.{" "}
          <Link href="/events/new" className="text-brand-text hover:underline">
            Start the first event
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              {item.kind === "post" ? (
                /* The card is not one big link: a heart is a real button and
                   cannot be nested inside an anchor. The link wraps the
                   reading part, the actions sit beside it. */
                <>
                  <Link href={item.href} className="block px-4 pb-2 pt-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <KindChip kind="post" />
                      <span className="rounded-full bg-elevated px-2 py-0.5">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      {item.convertedToEvent && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-soft-text">
                          Now an event
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1.5 font-medium leading-snug">{item.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{item.body}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <Avatar src={item.authorAvatar} name={item.author} size={18} />
                      <span>{item.author}</span>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(item.at, now)}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 px-3 pb-2.5">
                    <LikeButton
                      subjectType="forum_post"
                      subjectId={item.id}
                      state={likes.get(item.id) ?? { count: 0, mine: false }}
                      revalidate="/"
                      signedIn={Boolean(user)}
                    />
                    <Link
                      href={item.href}
                      aria-label={`${item.replies} ${item.replies === 1 ? "reply" : "replies"}`}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-ink"
                    >
                      <CommentIcon />
                      {item.replies > 0 && (
                        <span className="tabular-nums">{item.replies}</span>
                      )}
                    </Link>
                  </div>
                </>
              ) : (
                <Link href={item.href} className="block px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <KindChip kind={item.kind} />
                    {item.kind === "news" ? (
                      <span>
                        <span aria-hidden>{categoryEmoji(item.category)}</span>{" "}
                        {categoryLabel(item.category)}
                      </span>
                    ) : (
                      <span className="font-medium text-ink">
                        {fmtDate(item.startsAt, item.timezone)}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-1.5 font-medium leading-snug">{item.title}</h2>

                  {item.kind === "news" ? (
                    <>
                      {item.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {item.summary}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                        <span>{item.author}</span>
                        <span aria-hidden>·</span>
                        <span>{timeAgo(item.at, now)}</span>
                        {item.comments > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1">
                              <CommentIcon />
                              <span className="tabular-nums">{item.comments}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {item.venue && (
                        <p className="mt-1 text-sm text-muted">{item.venue}</p>
                      )}
                      <EventTags event={item.event} className="mt-2" />
                    </>
                  )}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 border-t border-line pt-6 text-sm text-muted">
        Browsing is open to everyone. You only need to{" "}
        <Link href="/signin" className="text-brand-text hover:underline">
          sign in
        </Link>{" "}
        to submit an event, manage a team, RSVP, or join a discussion.
      </section>
    </main>
  );
}
