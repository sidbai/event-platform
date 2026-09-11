import Link from "next/link";

import { EventLogo } from "@/components/event-logo";
import { formatEventWhen } from "@/features/events/when";
import type { FeaturedMode } from "@/features/feed/featured";
import { KindChip } from "@/features/feed/kind-chip";
import type { FeaturedEvent, FeedItem } from "@/features/feed/queries";
import { timeAgo } from "@/features/feed/time-ago";
import { CATEGORY_LABELS } from "@/features/forum/constants";
import { categoryEmoji, categoryLabel } from "@/features/news/constants";
import { CommentIcon } from "@/features/likes/like-button";

/**
 * The feed on your page: events, news and community, as rows.
 *
 * Rows rather than the front page's cards, because this sits under What is
 * next and the week — the things that are yours — and a column of cards
 * after those reads as a second page. Two lists with two clocks, as the
 * front page has them: an event matters because of when it is played, a
 * post because of when it was written, and one order cannot serve both.
 */
export function FeedList({
  events,
  mode,
  items,
  now,
}: {
  events: FeaturedEvent[];
  mode: FeaturedMode;
  items: FeedItem[];
  now: number;
}) {
  const row =
    "flex items-start gap-3 rounded-lg border border-line bg-card px-3 py-2.5 hover:bg-elevated";
  return (
    <>
      {events.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {mode === "now" ? "What's on" : mode === "recent" ? "Just finished" : "Coming up"}
            </h2>
            <Link href="/events" className="text-sm text-brand-text hover:underline">
              All events →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={`/events/${event.slug}`} className={row}>
                  <EventLogo src={event.logoUrl} kind={event.kind} size={32} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{event.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatEventWhen(
                        event.startsAt,
                        event.endsAt,
                        event.timezone,
                        "short",
                        event.kind,
                      )}
                      {event.venue && <> · {event.venue.name}</>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Latest</h2>
            <span className="text-sm text-muted">
              <Link href="/news" className="text-brand-text hover:underline">
                News
              </Link>{" "}
              ·{" "}
              <Link href="/community" className="text-brand-text hover:underline">
                Community
              </Link>
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <KindChip kind={item.kind} />
                      {item.kind === "post" ? (
                        <span>{CATEGORY_LABELS[item.category]}</span>
                      ) : (
                        <span>
                          <span aria-hidden>{categoryEmoji(item.category)}</span>{" "}
                          {categoryLabel(item.category)}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-snug">{item.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span>{item.author}</span>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(item.at, now)}</span>
                      {(item.kind === "post" ? item.replies : item.comments) > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <CommentIcon />
                            <span className="tabular-nums">
                              {item.kind === "post" ? item.replies : item.comments}
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
