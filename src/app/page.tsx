import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">King Juan Soccer</h1>
      <p className="mt-3 text-lg text-muted">
        A community platform for Seattle-area youth soccer events. More soccer,
        less logistics.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/events"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
        >
          Browse events
        </Link>
        <Link
          href="/events/new"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-elevated"
        >
          Submit an event
        </Link>
      </div>

      <section className="mt-14 grid gap-6 sm:grid-cols-3">
        <div>
          <h2 className="font-semibold">Find what&rsquo;s happening</h2>
          <p className="mt-1 text-sm text-muted">
            Games, scrimmages, pickup, tournaments, camps and clinics around
            Bellevue, Redmond, Seattle and nearby. Filter by age, format and
            weekend.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Find your next game</h2>
          <p className="mt-1 text-sm text-muted">
            A coach with players, a field and an open slot can post
            &ldquo;looking for an opponent&rdquo; and let other teams answer.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Run your tournament</h2>
          <p className="mt-1 text-sm text-muted">
            Divisions, rosters, a schedule, live scores and standings with real
            tiebreakers &mdash; and printable check-in and referee sheets.
          </p>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="font-semibold">The King Juan Cup</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          King Juan Soccer grew out of the King Juan Cup, a one-day 5v5 youth
          tournament in Bellevue. The Cup is now hosted here &mdash;{" "}
          <Link
            href="/events/king-juan-cup-2026"
            className="text-brand-text hover:underline"
          >
            see the 2026 results
          </Link>
          .
        </p>
      </section>

      <section className="mt-10 text-sm text-muted">
        Browsing is open to everyone. You only need to{" "}
        <Link href="/signin" className="text-brand-text hover:underline">
          sign in
        </Link>{" "}
        to submit an event, manage a team, RSVP, or join a discussion.
      </section>
    </main>
  );
}
