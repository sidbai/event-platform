import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { eventKinds } from "@/db/schema";
import { listEvents, type EventFilters } from "@/features/events/queries";

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

const selectClass =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters: EventFilters = {
    kind: sp.kind || undefined,
    when: (sp.when as EventFilters["when"]) || undefined,
    needsOpponent: sp.opponent === "1",
    q: sp.q || undefined,
  };

  const [events, kinds] = await Promise.all([
    listEvents(filters),
    db.query.eventKinds.findMany({
      orderBy: [asc(eventKinds.sort)],
      columns: { slug: true, label: true },
    }),
  ]);

  const activeFilters = Boolean(
    filters.kind || filters.when || filters.needsOpponent || filters.q,
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <Link
          href="/events/new"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Submit an event →
        </Link>
      </div>

      <form method="get" className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search"
          className={selectClass}
        />
        <select name="kind" defaultValue={filters.kind ?? ""} className={selectClass}>
          <option value="">Any kind</option>
          {kinds.map((k) => (
            <option key={k.slug} value={k.slug}>
              {k.label}
            </option>
          ))}
        </select>
        <select name="when" defaultValue={filters.when ?? ""} className={selectClass}>
          <option value="">Any time</option>
          <option value="weekend">This weekend</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="opponent"
            value="1"
            defaultChecked={filters.needsOpponent}
          />
          Looking for opponent
        </label>
        <button
          type="submit"
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Filter
        </button>
        {activeFilters && (
          <Link href="/events" className="text-sm text-neutral-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {events.length === 0 ? (
        <p className="mt-6 text-neutral-500">No events match.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.slug}`}
                className="block py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{event.title}</span>
                  <span className="shrink-0 text-sm text-neutral-500">
                    {fmtDate(event.startsAt, event.timezone)}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-neutral-500">
                  <span className="capitalize">{event.kind}</span>
                  {event.venue && <span> · {event.venue.name}</span>}
                  {event.needsOpponent && (
                    <span className="text-amber-700 dark:text-amber-500"> · looking for opponent</span>
                  )}
                  {event.status === "completed" && <span> · final results</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
