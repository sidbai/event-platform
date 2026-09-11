import Link from "next/link";

import type { getCurrentUser } from "@/features/auth";
import { followedEvents } from "@/features/events/follow-queries";
import { myWeek } from "@/features/events/my-week";
import { MyWeekGrid } from "@/features/events/my-week-grid";
import { weekStart } from "@/features/events/week";
import { homeFeed } from "@/features/feed/queries";
import { CalendarLink } from "@/features/me/calendar-link";
import { FeedList } from "@/features/me/feed-list";
import { myFeedToken, rotateFeedToken } from "@/features/me/feed-token";
import { NextCard } from "@/features/me/next-card";
import { waitingOn, written, type Written } from "@/features/me/queries";
import { MeSidebar } from "@/features/me/sidebar";
import { whatsNext } from "@/features/me/whats-next";
import { unreadCount } from "@/features/messages/queries";
import { followedTeams, lastResults } from "@/features/teams/follow-queries";
import { siteUrl } from "@/lib/site-url";

type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Enough to fill a scroll without turning the page into the archive. Each
 * kind has its own page for going further back.
 */
const FEED_SIZE = 24;

const WHAT = { post: "Post", comment: "Comment", review: "Review" } as const;

function when(at: Date) {
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(at);
}

/**
 * The front page, once you are signed in.
 *
 * Two columns, the way a forum lays itself out: what you follow on the left,
 * permanently, and a single column on the right that starts with what is
 * yours — what is next, and your week — and continues into what everybody
 * else is doing, as rows. There is no "Me" to press any more; the logo is
 * the way home, and home is this.
 *
 * Ordered by question rather than by table, and a section with nothing to
 * say is not rendered. A page that lists every table with your id in it is
 * a page of empty boxes, which is what it would be for almost everybody
 * here today.
 */
export async function MeHome({ user, weekParam }: { user: User; weekParam?: string }) {
  const now = new Date();
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : weekStart(now);

  const teams = await followedTeams(user.id);
  const ids = teams.map((t) => t.id);
  const [week, waiting, mine, next, last, events, feed, unread] = await Promise.all([
    myWeek(user.id, monday),
    waitingOn(user.id),
    written(user.id),
    whatsNext(user.id, ids),
    lastResults(ids).then((rows) => new Map(rows.map((r) => [r.teamId, r]))),
    followedEvents(user.id),
    homeFeed(FEED_SIZE),
    unreadCount(user.id),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-5 py-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      {/* Under the feed on a phone, beside it from lg: the things you follow
          are worth a column when there is room for one and a footer when
          there is not. */}
      <aside className="order-last mt-10 lg:order-first lg:mt-0">
        <div className="lg:sticky lg:top-20">
          <MeSidebar teams={teams} last={last} events={events} unread={unread} />
        </div>
      </aside>

      <div className="min-w-0">
        <section>
          <h1 className="text-xl font-semibold tracking-tight">What is next</h1>
          {next.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing on the way.{" "}
              <Link href="/teams" className="text-brand-text hover:underline">
                Follow a team
              </Link>{" "}
              and its next game shows up here, with anything you say you are going to.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {next.slice(0, 12).map((item, i) => (
                <NextCard key={`${item.kind}-${i}`} item={item} now={now} />
              ))}
            </ul>
          )}
          {/* Under the list, because the best outcome of this section is that
              somebody subscribes and stops opening the page at all. */}
          <CalendarLink
            origin={siteUrl().replace(/\/$/, "")}
            reveal={myFeedToken}
            rotate={rotateFeedToken}
          />
        </section>

        {(week.length > 0 || weekParam) && (
          <section id="week" className="mt-8">
            <h2 className="text-lg font-semibold">Your week</h2>
            <p className="mt-1 text-sm text-muted">
              What you run, what you are going to, and your teams&rsquo; games, by day.{" "}
              <Link href="/events/new" className="text-brand-text hover:underline">
                Add a session &rarr;
              </Link>
            </p>
            <div className="mt-3">
              <MyWeekGrid monday={monday} items={week} now={now} />
            </div>
          </section>
        )}

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

        <FeedList events={feed.featured} mode={feed.featuredMode} items={feed.items} now={feed.now} />

        {mine.length > 0 && (
          <section id="written" className="mt-8">
            <h2 className="text-lg font-semibold">What you have written</h2>
            {/* There is no other way to find your own review of a club except
                by remembering which club it was. */}
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
          </section>
        )}

        <p className="mt-10 text-xs text-muted">
          Only you can see this page. Anything you post shows the handle{" "}
          <span className="font-mono">@{user.username}</span> and nothing else.
        </p>
      </div>
    </main>
  );
}
