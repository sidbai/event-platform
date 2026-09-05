import Link from "next/link";

import { EventTags } from "@/features/events/event-tags";
import { listEvents, listEventsByTime } from "@/features/events/queries";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

type Row = Awaited<ReturnType<typeof listEvents>>[number];

function EventList({
  events,
  heading,
}: {
  events: Row[];
  heading: string | null;
}) {
  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      {heading && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {heading}
        </h2>
      )}
      <ul className="mt-1 divide-y divide-line">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.slug}`}
              className="block py-4 transition-colors hover:bg-elevated"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{event.title}</span>
                <span className="shrink-0 text-sm text-muted">
                  {fmtDate(event.startsAt, event.timezone)}
                </span>
              </div>
              {event.venue && (
                <div className="mt-0.5 text-sm text-muted">{event.venue.name}</div>
              )}
              <EventTags event={event} className="mt-2" />
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

  /*
   * Everything, upcoming and past, both when browsing and when searching.
   *
   * Hiding past events made the page read as empty whenever nothing was
   * scheduled — and a finished tournament here is not an expired listing, it
   * is a destination with results, standings and rosters. They are split into
   * two sections instead, so what you can still turn up to stays on top.
   */
  const { upcoming, past, total } = await listEventsByTime(q ? { q } : {});

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <Link
          href="/events/new"
          className="text-sm font-medium text-brand-text hover:underline"
        >
          Submit an event →
        </Link>
      </div>

      {/* method="get" alone gives submit-on-Enter, a shareable ?q= URL and
          working back/forward, with no client JavaScript. */}
      <form method="get" role="search" className="mt-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search events"
          placeholder="Search events, venues and cities"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          Search
        </button>
      </form>

      {q && (
        <p className="mt-3 text-sm text-muted">
          {total} {total === 1 ? "result" : "results"} for{" "}
          <span className="text-ink">&ldquo;{q}&rdquo;</span> ·{" "}
          <Link href="/events" className="text-brand-text hover:underline">
            Clear
          </Link>
        </p>
      )}

      {total === 0 ? (
        <p className="mt-6 text-muted">
          {q ? "Nothing matches that." : "No events yet."}
        </p>
      ) : (
        <>
          <EventList
            events={upcoming}
            // Only worth labelling when there is something to tell it apart from.
            heading={past.length > 0 ? "Upcoming" : null}
          />
          <EventList
            events={past}
            heading={upcoming.length > 0 ? "Past" : null}
          />
        </>
      )}
    </div>
  );
}
