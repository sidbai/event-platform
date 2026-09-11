import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { CreateLink } from "@/components/create-link";
import { EventLogo } from "@/components/event-logo";
import { getCurrentUser } from "@/features/auth";
import { EventTags } from "@/features/events/event-tags";
import { formatEventWhen } from "@/features/events/when";
import type { FeaturedMode } from "@/features/feed/featured";
import { KindChip } from "@/features/feed/kind-chip";
import { homeFeed, type FeaturedEvent } from "@/features/feed/queries";
import { timeAgo } from "@/features/feed/time-ago";
import { CATEGORY_LABELS } from "@/features/forum/constants";
import { CommentIcon, LikeButton } from "@/features/likes/like-button";
import { likeStates } from "@/features/likes/queries";
import { MeHome } from "@/features/me/home";
import { categoryEmoji, categoryLabel } from "@/features/news/constants";

// A feed of live content, so this cannot be a static landing page.
export const dynamic = "force-dynamic";

/**
 * Enough to fill a scroll without turning the front page into the archive.
 * Each kind has its own page for going further back.
 */
const FEED_SIZE = 24;

/**
 * The events band: what is on, above everything anyone has written.
 *
 * Cards rather than feed rows, and its own heading, because this is the
 * question most people arrive with. Four at most — past that it stops being
 * a highlight and becomes the events page, which is one link away and better
 * at the job.
 */
function EventBand({
  events,
  mode,
}: {
  events: FeaturedEvent[];
  mode: FeaturedMode;
}) {
  if (events.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">
          {/* Said plainly, because the band means three different things:
              games to turn up to, results to look up, or the next thing on a
              quiet calendar. A heading that claimed "What's on" over a
              tournament in January would be the page lying to a visitor. */}
          {mode === "now"
            ? "What's on"
            : mode === "recent"
              ? "Just finished"
              : "Coming up"}
        </h2>
        <Link href="/events" className="text-sm text-brand-text hover:underline">
          All events →
        </Link>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          >
            <Link href={`/events/${event.slug}`} className="flex gap-3 p-4">
              <EventLogo src={event.logoUrl} kind={event.kind} size={44} />
              {/* min-w-0 so a long title truncates instead of stretching the
                  card out of the grid. */}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-ink">
                  {formatEventWhen(
                    event.startsAt,
                    event.endsAt,
                    event.timezone,
                    "short",
                    event.kind,
                  )}
                </div>
                <h3 className="mt-0.5 truncate font-medium leading-snug">
                  {event.title}
                </h3>
                {event.venue && (
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {event.venue.name}
                  </p>
                )}
                <EventTags event={event} className="mt-2" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getCurrentUser();
  // Signed in, the front page is yours. See features/me/home.tsx.
  if (user) {
    const { week } = await searchParams;
    return <MeHome user={user} weekParam={week} />;
  }
  const { featured, featuredMode, recent, items, now } = await homeFeed(FEED_SIZE);

  // Only forum posts can be liked today, so only they need the state fetched
  // — and from here on nobody is signed in, so only the counts.
  const likes = await likeStates(
    "forum_post",
    items.filter((i) => i.kind === "post").map((i) => i.id),
    null,
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* Kept a step above the cards below it so the page outline still reads,
          but small enough not to shout over the feed. */}
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        Discover. Create. Play.
      </h1>
      <p className="mt-2 text-sm text-muted">More information. More opportunities. More soccer.</p>

      {/*
        Discover, then the three things a person can make. Until recently all
        of these were Create and someone arriving to find a game had nothing to
        press, which is the wrong half of the product to leave without a door.

        The three creates sit at one weight because they are one decision — "I
        have something to put here" — and burying two of them in small grey
        text answered that decision on the reader's behalf.

        Equal weight with Discover for now. Discover deserves to be the primary
        action once there is enough to discover; making it louder while the
        calendar is nearly empty would just send more people to a short list.
      */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/events"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm font-medium text-brand-text hover:bg-elevated"
        >
          <span aria-hidden>🔎</span> Find an event
        </Link>
        <CreateLink href="/events/new">Create an event</CreateLink>
        <CreateLink href="/community/new">Create a community post</CreateLink>
        {/* Not gated on being signed in, the way the other two are not: each
            of these pages asks for a sign-in and returns you to it, so hiding
            the door only makes the site look smaller than it is. */}
        <CreateLink href="/news/new">Write a news post</CreateLink>
      </div>

      <EventBand events={featured} mode={featuredMode} />

      {/*
        A second band, and only while the first one is showing something else.
        
        These used to appear in that band whenever nothing was being played,
        which held while every event was a weekend. A league runs to next May,
        so from the day it was listed the front page had something on every
        day of the season and four tournaments people had just played in
        dropped off it altogether.
      */}
      {recent.length > 0 && <EventBand events={recent} mode="recent" />}

      {featured.length === 0 && items.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing posted yet.{" "}
          <Link href="/events/new" className="text-brand-text hover:underline">
            Start the first event
          </Link>
          .
        </p>
      ) : items.length === 0 ? null : (
        <>
          {/* A heading only because there is now a band above it. Two lists
              of cards running into each other reads as one list that changed
              its mind halfway down. */}
          <h2 className="mt-8 text-sm font-semibold tracking-tight">Latest</h2>
          <ul className="mt-3 space-y-2">
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
                        signedIn={false}
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
                      <KindChip kind="news" />
                      <span>
                        <span aria-hidden>{categoryEmoji(item.category)}</span>{" "}
                        {categoryLabel(item.category)}
                      </span>
                    </div>

                    <h2 className="mt-1.5 font-medium leading-snug">{item.title}</h2>

                    {item.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{item.summary}</p>
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
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        At the bottom, not the top. Somebody who has just scrolled a page of
        real fixtures and results is in a position to believe a sentence about
        what this is for; the same sentence above the fold is a leaflet handed
        to somebody who came to check a kick-off time.
      */}
      <section className="mt-10 border-t border-line pt-6">
        <p className="leading-relaxed text-ink">
          King Juan Soccer is an open community built by soccer families, for
          soccer families &mdash; making information, opportunities, and the joy
          of playing more accessible to everyone.
        </p>
        <Link
          href="/about"
          className="mt-2 inline-block text-sm text-brand-text hover:underline"
        >
          More about the site &rarr;
        </Link>
      </section>

      <section className="mt-6 text-sm text-muted">
        Browsing is open to everyone. You only need to{" "}
        <Link href="/signin" className="text-brand-text hover:underline">
          sign in
        </Link>{" "}
        to submit an event, manage a team, RSVP, or join a discussion.
      </section>
    </main>
  );
}
