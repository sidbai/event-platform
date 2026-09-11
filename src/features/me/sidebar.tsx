import Link from "next/link";

import { EventLogo } from "@/components/event-logo";
import { TeamCrest } from "@/components/team-crest";
import type { followedEvents } from "@/features/events/follow-queries";
import { formatEventWhen } from "@/features/events/when";
import type { followedTeams, lastResults } from "@/features/teams/follow-queries";
import { crestOf } from "@/features/teams/crest";

type Team = Awaited<ReturnType<typeof followedTeams>>[number];
type Result = Awaited<ReturnType<typeof lastResults>>[number];
type FollowedEvent = Awaited<ReturnType<typeof followedEvents>>[number];

const TZ = "America/Los_Angeles";

const WORD = { won: "W", drawn: "D", lost: "L" } as const;

/*
 * Colour carries none of the meaning — the letter does. A parent reading this
 * on a phone in sunlight, or with any of the several kinds of colour
 * blindness, gets the same result either way.
 */
const OUTCOME = {
  won: "text-emerald-700 dark:text-emerald-400",
  drawn: "text-muted",
  lost: "text-muted",
} as const;

/**
 * The left column of your page: where you go, and what you follow.
 *
 * Modelled on the way a forum lays out its channels — the things you have
 * chosen to follow sit beside the feed, permanently, rather than as sections
 * you scroll past to reach it. Management lives here (follow more, find
 * events); news of those teams and events is in the feed and in What is
 * next, not repeated in the list.
 */
export function MeSidebar({
  teams,
  last,
  events,
  unread,
}: {
  teams: Team[];
  last: Map<string, Result>;
  events: FollowedEvent[];
  unread: number;
}) {
  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-elevated";
  return (
    <nav aria-label="Your page" className="text-sm">
      <ul className="space-y-0.5">
        <li>
          <Link href="/" className={`${item} bg-elevated font-medium`}>
            <span aria-hidden>📰</span> Feed
          </Link>
        </li>
        <li>
          <Link href="/messages" className={item}>
            <span aria-hidden>✉️</span> Messages
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-brand px-1.5 text-xs font-medium text-on-brand tabular-nums">
                {unread}
              </span>
            )}
          </Link>
        </li>
        <li>
          <Link href="/#written" className={item}>
            <span aria-hidden>✍️</span> What you wrote
          </Link>
        </li>
        <li>
          <Link href="/settings" className={item}>
            <span aria-hidden>⚙️</span> Settings
          </Link>
        </li>
      </ul>

      <h2 className="mt-6 px-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Teams you follow
      </h2>
      <ul className="mt-2 space-y-0.5">
        {teams.map((team) => {
          const result = last.get(team.id);
          return (
            <li key={team.id}>
              <Link href={`/teams/${team.slug}`} className={item}>
                <TeamCrest src={crestOf(team)} size={24} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {/* The last result as one letter and a score: the other half
                    of a Sunday evening, and the reason to open the team. */}
                {result && (
                  <span className={`shrink-0 text-xs tabular-nums ${OUTCOME[result.outcome]}`}>
                    {WORD[result.outcome]} {result.for}–{result.against}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/teams" className={`${item} text-brand-text`}>
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line text-xs">+</span>
            {teams.length === 0 ? "Follow a team" : "Follow more"}
          </Link>
        </li>
      </ul>

      <h2 className="mt-6 px-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Events you follow
      </h2>
      <ul className="mt-2 space-y-0.5">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/events/${event.slug}`} className={item}>
              <EventLogo src={event.logoUrl} kind={event.kind} size={24} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{event.title}</span>
                <span className="block truncate text-xs text-muted">
                  {formatEventWhen(event.startsAt, event.endsAt, TZ, "short", event.kind)}
                </span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/events" className={`${item} text-brand-text`}>
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line text-xs">+</span>
            {events.length === 0 ? "Find an event" : "Find more"}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
