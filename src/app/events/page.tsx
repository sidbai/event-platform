import Link from "next/link";

import { listEvents } from "@/features/events/queries";

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

export default async function EventsPage() {
  const events = await listEvents();

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

      {events.length === 0 ? (
        <p className="mt-6 text-neutral-500">No events yet.</p>
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
