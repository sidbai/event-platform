import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { crestOf } from "@/features/teams/crest";
import { getCurrentUser } from "@/features/auth";
import { siteUrl } from "@/lib/site-url";
import { formatEventWhen } from "@/features/events/when";
import { kickoffLabel } from "@/features/events/kickoff";
import { waitingOn, written, type Written } from "@/features/me/queries";
import { CalendarLink } from "@/features/me/calendar-link";
import { myFeedToken, rotateFeedToken } from "@/features/me/feed-token";
import { whatsNext } from "@/features/me/whats-next";
import { followedEvents } from "@/features/events/follow-queries";
import { followedTeams, lastResults } from "@/features/teams/follow-queries";

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
 * What is next leads, and it is one list rather than two. A parent does not
 * hold their child's fixtures and the sessions they said they would attend as
 * separate things; they hold "Saturday, and what time". So the two are merged
 * and sorted by when, and what each one is becomes a label.
 */

const TZ = "America/Los_Angeles";

const WORD = { won: "Won", drawn: "Drew", lost: "Lost" } as const;

/*
 * Colour carries none of the meaning — the word does. A parent reading this
 * on a phone in sunlight, or with any of the several kinds of colour
 * blindness, gets the same sentence either way.
 */
const OUTCOME = {
  won: "font-medium text-emerald-700 dark:text-emerald-400",
  drawn: "font-medium text-ink",
  lost: "font-medium text-ink",
} as const;

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

  const teams = await followedTeams(user.id);
  const ids = teams.map((t) => t.id);
  const [waiting, mine, next, last, events] = await Promise.all([
    waitingOn(user.id),
    written(user.id),
    whatsNext(user.id, ids),
    lastResults(ids).then((rows) => new Map(rows.map((r) => [r.teamId, r]))),
    followedEvents(user.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your page</h1>
      <p className="mt-1 text-sm text-muted">
        Only you can see this. Anything you post shows the handle{" "}
        <span className="font-mono">@{user.username}</span> and nothing else.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">What is next</h2>
        {next.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing on the way.{" "}
            <Link href="/teams" className="text-brand-text hover:underline">
              Follow a team
            </Link>{" "}
            and its next game shows up here, with anything you say you are
            going to.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5 text-sm">
            {next.slice(0, 12).map((item, i) => (
              <li key={`${item.kind}-${i}`}>
                <Link href={item.href} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <p className="text-xs text-muted">
                  {item.timed
                    ? kickoffLabel(item.at, TZ)
                    : `${kickoffLabel(item.at, TZ)?.split(",").slice(0, 2).join(",")}`}
                  {item.detail && <> &middot; {item.detail}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
        {/*
          Under the list, because the best outcome of this section is that
          somebody subscribes and stops opening the page at all.
        */}
        <CalendarLink
          origin={siteUrl().replace(/\/$/, "")}
          reveal={myFeedToken}
          rotate={rotateFeedToken}
        />
      </section>

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

      {teams.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Teams you follow</h2>
          {/*
            Management rather than news — the next game is above. What this
            adds is the last one, which is the other half of a Sunday evening.
          */}
          <ul className="mt-3 divide-y divide-line">
            {teams.map((team) => {
              const result = last.get(team.id);
              return (
                <li key={team.id} className="flex items-center gap-3 py-3">
                  <TeamCrest src={crestOf(team)} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/teams/${team.slug}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {team.name}
                    </Link>
                    {result ? (
                      <p className="text-xs text-muted">
                        <span className={OUTCOME[result.outcome]}>
                          {WORD[result.outcome]} {result.for}&ndash;{result.against}
                        </span>
                        {result.opponent && <> v {result.opponent.name}</>}
                      </p>
                    ) : (
                      <p className="text-xs text-muted">No result yet</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Events you follow</h2>
          {/*
            A season under way is not in "what is next" — nothing about it is —
            so this is where a league lives once it has started.
          */}
          <ul className="mt-3 space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={`/events/${event.slug}`} className="font-medium hover:underline">
                  {event.title}
                </Link>
                <p className="text-xs text-muted">
                  {formatEventWhen(event.startsAt, event.endsAt, TZ, "short", event.kind)}
                  {event.venueName && <> &middot; {event.venueName}</>}
                </p>
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
