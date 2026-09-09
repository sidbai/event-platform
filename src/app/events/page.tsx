import Link from "next/link";

import { SearchBar } from "@/components/search-bar";

import { EventLogo } from "@/components/event-logo";
import { EventTags } from "@/features/events/event-tags";
import {
  listEventKindFacets,
  listEvents,
  listEventsByTime,
} from "@/features/events/queries";
import { CreateLink } from "@/components/create-link";
import {
  DEFAULT_PAST_RANGE,
  PAST_RANGES,
  pastRangesAreUseful,
  readPastRange,
  withinPastRange,
} from "@/features/events/past-range";
import { formatEventWhen } from "@/features/events/when";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof listEvents>>[number];

function EventList({
  events,
  heading,
  controls,
  empty,
}: {
  events: Row[];
  heading: string | null;
  /** Sits on the heading row — the Past section's range chips. */
  controls?: React.ReactNode;
  /** What to say when the controls have narrowed the list to nothing. */
  empty?: string;
}) {
  // A section with controls stays even when it is empty: the chips are the
  // only way back to a wider window, and taking them away with the last row
  // would strand whoever pressed them.
  if (events.length === 0 && !controls) return null;

  return (
    <section className="mt-6">
      {(heading || controls) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {heading ? (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {heading}
            </h2>
          ) : (
            <span />
          )}
          {controls}
        </div>
      )}
      {events.length === 0 && <p className="mt-2 text-sm text-muted">{empty}</p>}
      <ul className="mt-1 divide-y divide-line">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.slug}`}
              className="flex gap-3 py-4 transition-colors hover:bg-elevated"
            >
              <EventLogo src={event.logoUrl} kind={event.kind} className="mt-0.5" />
              {/* min-w-0 so a long title truncates instead of shoving the
                  date off the row. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{event.title}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {formatEventWhen(event.startsAt, event.endsAt, event.timezone, "short", event.kind)}
                  </span>
                </div>
                {event.venue && (
                  <div className="mt-0.5 text-sm text-muted">{event.venue.name}</div>
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

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const kind = (sp.kind ?? "").trim() || undefined;
  const range = readPastRange(sp.past);

  /** Keeps the search when a chip is picked, and the chip when searching. */
  const href = (next: { kind?: string; past?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next.kind) params.set("kind", next.kind);
    /*
     * Only when it is not the default, so the ordinary URL stays clean and
     * shareable — and so a link somebody sent last month still means what it
     * said rather than pinning them to a window they never chose.
     *
     * Read from the constant, not written out again: this was a literal "3m"
     * until the default moved, and a second copy of a default is a rule that
     * goes quietly wrong the day somebody changes the first one.
     */
    if (next.past && next.past !== DEFAULT_PAST_RANGE) params.set("past", next.past);
    const s = params.toString();
    return s ? `/events?${s}` : "/events";
  };

  /*
   * Everything, upcoming and past, both when browsing and when searching.
   *
   * Hiding past events made the page read as empty whenever nothing was
   * scheduled — and a finished tournament here is not an expired listing, it
   * is a destination with results, standings and rosters. They are split into
   * two sections instead, so what you can still turn up to stays on top.
   */
  const [{ ongoing, upcoming, past, future, total }, kinds] = await Promise.all([
    listEventsByTime({ ...(q ? { q } : {}), kind }),
    listEventKindFacets(q ? { q } : {}),
  ]);

  /*
   * The archive is the only section that grows without limit, so it is the
   * only one with a window on it. Everything else is bounded by the calendar.
   *
   * One clock for both decisions: reading it twice could put an event in the
   * list and out of the count that decides whether the chips are worth
   * showing at all.
   */
  const now = new Date();
  const shownPast = withinPastRange(past, now, range);
  const showRanges = pastRangesAreUseful(past, now);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <CreateLink href="/events/new">Create an event</CreateLink>
      </div>

      <SearchBar
        className="mt-5"
        defaultValue={q}
        label="Search events"
        placeholder="Search events, venues and cities"
      />

      {/* Only worth showing when there is a choice to make: a single chip
          filters to everything already on screen. */}
      {kinds.length > 1 && (
        <nav aria-label="Filter by kind" className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={href({ past: range })}
            aria-current={kind ? undefined : "page"}
            className={
              kind
                ? "rounded-full bg-elevated px-2.5 py-1 text-xs text-muted hover:bg-line"
                : "rounded-full bg-ink px-2.5 py-1 text-xs text-page"
            }
          >
            All
          </Link>
          {kinds.map((k) => {
            const on = k.slug === kind;
            return (
              <Link
                key={k.slug}
                // Picking the chip you are already on clears it, so the row
                // works as a toggle rather than a trap.
                href={href({ kind: on ? undefined : k.slug, past: range })}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "rounded-full bg-ink px-2.5 py-1 text-xs text-page"
                    : "rounded-full bg-elevated px-2.5 py-1 text-xs text-muted hover:bg-line"
                }
              >
                <span aria-hidden>{k.emoji}</span> {k.label}{" "}
                <span className="tabular-nums opacity-70">{k.count}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {q && (
        <p className="mt-3 text-sm text-muted">
          {total} {total === 1 ? "result" : "results"} for{" "}
          <span className="text-ink">&ldquo;{q}&rdquo;</span> ·{" "}
          {/* Clears the search only. It sits inside the sentence about the
              search, so taking the chip with it would be a surprise. */}
          <Link
            href={href({ kind, past: range })}
            className="text-brand-text hover:underline"
          >
            Clear
          </Link>
        </p>
      )}

      {total === 0 ? (
        <p className="mt-6 text-muted">
          {/* A chip can only be picked when it has events, but a hand-typed
              ?kind= can land here, and "No events yet" would be a lie. */}
          {q || kind ? "Nothing matches that." : "No events yet."}
        </p>
      ) : (
        <>
          {/*
            Ongoing, then Upcoming, then Past, then Later on.

            Being played right now goes first because it is the only one that
            changes what somebody does this afternoon. Past sits above Later on
            for the same kind of reason in reverse: a tournament that finished
            last weekend has results somebody is looking for, one in January is
            browsing, and sorting strictly by date would bury the first under
            the second.
          */}
          {(() => {
            // A heading earns its place only when there is another section to
            // tell it apart from; one section on its own needs no label.
            const filled = [ongoing, upcoming, shownPast, future].filter(
              (s) => s.length > 0,
            ).length;
            const label = (name: string) => (filled > 1 ? name : null);
            const active = PAST_RANGES.find((r) => r.key === range)!;
            return (
              <>
                {/* The same word the chip uses. A section called "Happening
                    now" full of chips reading "Ongoing" is a translation the
                    reader has to do. */}
                <EventList events={ongoing} heading={label("Ongoing")} />
                <EventList events={upcoming} heading={label("Upcoming")} />
                <EventList
                  events={shownPast}
                  // With chips beside it the heading is no longer optional:
                  // a row of date ranges floating above a list of events
                  // does not say which list it narrows.
                  heading={showRanges ? "Past" : label("Past")}
                  empty={`Nothing finished in the ${active.label.toLowerCase()}.`}
                  controls={
                    showRanges ? (
                      <nav
                        aria-label="How far back"
                        className="flex flex-wrap gap-1.5"
                      >
                        {PAST_RANGES.map((r) => {
                          const on = r.key === range;
                          return (
                            <Link
                              key={r.key}
                              href={href({ kind, past: r.key })}
                              aria-current={on ? "page" : undefined}
                              className={
                                on
                                  ? "rounded-full bg-ink px-2.5 py-1 text-xs text-page"
                                  : "rounded-full bg-elevated px-2.5 py-1 text-xs text-muted hover:bg-line"
                              }
                            >
                              {r.label}
                            </Link>
                          );
                        })}
                      </nav>
                    ) : null
                  }
                />
                <EventList events={future} heading={label("Later on")} />
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
