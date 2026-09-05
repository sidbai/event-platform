import Link from "next/link";

import { EventTags } from "@/features/events/event-tags";
import { listEvents } from "@/features/events/queries";
import { categoryEmoji, categoryLabel } from "@/features/news/constants";
import { listNews } from "@/features/news/queries";
import { CreateLink } from "@/components/create-link";

// Both feeds are live content, so this cannot be a static landing page.
export const dynamic = "force-dynamic";

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

export default async function Home() {
  const [events, news] = await Promise.all([
    listEvents({ when: "upcoming" }),
    listNews(),
  ]);

  const upcoming = events.slice(0, 6);
  const latest = news.rows.slice(0, 3);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      {/* Kept a step above the section headings below it so the page outline
          still reads, but small enough not to shout over the feeds. */}
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        King Juan Soccer: A community platform for Seattle-area youth soccer.
        More soccer, less effort!
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/events"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          Browse events
        </Link>
        <CreateLink href="/events/new">Start an event</CreateLink>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Upcoming events</h2>
          <Link href="/events" className="text-sm text-brand-text hover:underline">
            All events
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing on the calendar yet.{" "}
            <Link href="/events/new" className="text-brand-text hover:underline">
              Submit the first event
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {upcoming.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.slug}`}
                  className="block py-3 transition-colors hover:bg-elevated"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{event.title}</span>
                    <span className="shrink-0 text-sm text-muted">
                      {fmtDate(event.startsAt, event.timezone)}
                    </span>
                  </div>
                  {event.venue && (
                    <div className="mt-0.5 text-sm text-muted">
                      {event.venue.name}
                    </div>
                  )}
                  <EventTags event={event} className="mt-2" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {latest.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Latest news</h2>
            <Link href="/news" className="text-sm text-brand-text hover:underline">
              All news
            </Link>
          </div>

          <ul className="mt-2 divide-y divide-line">
            {latest.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/news/${post.slug}`}
                  className="block py-3 transition-colors hover:bg-elevated"
                >
                  <span className="text-xs font-medium text-brand-text">
                    <span aria-hidden>{categoryEmoji(post.category)}</span>{" "}
                    {categoryLabel(post.category)}
                  </span>
                  <div className="mt-0.5 font-medium">{post.title}</div>
                  <p className="mt-0.5 text-sm text-muted">{post.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 border-t border-line pt-6 text-sm text-muted">
        Browsing is open to everyone. You only need to{" "}
        <Link href="/signin" className="text-brand-text hover:underline">
          sign in
        </Link>{" "}
        to submit an event, manage a team, RSVP, or join a discussion.
      </section>
    </main>
  );
}
