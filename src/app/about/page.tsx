import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "King Juan Soccer is an open community built by soccer families, for soccer families.",
};

/**
 * What this site is for, in the owner's own words.
 *
 * A mission belongs at a fixed address rather than only at the bottom of the
 * home page: it is the thing somebody links to when they explain the site to
 * a club, and a paragraph that only exists inside a feed cannot be linked to.
 *
 * Deliberately short, and deliberately only claims things the site actually
 * does. An about page that promises more than the product delivers is the
 * first thing a coach checks it against.
 */
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">About</h1>

      <p className="mt-6 text-lg leading-relaxed text-ink">
        King Juan Soccer is an open community built by soccer families, for
        soccer families &mdash; making information, opportunities, and the joy
        of playing more accessible to everyone.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink">
        <h2 className="text-lg font-semibold">What is here</h2>
        <p>
          Tournaments, leagues, scrimmages, pickup games and camps around
          Seattle &mdash; the ones we run and the ones other people run, in one
          place. Where an organizer publishes a schedule elsewhere, the{" "}
          <Link href="/events" className="text-brand-text hover:underline">
            event page
          </Link>{" "}
          brings the fixtures and results in, or sends you straight to theirs.
        </p>
        <p>
          Every team that plays gets a{" "}
          <Link href="/teams" className="text-brand-text hover:underline">
            page
          </Link>{" "}
          with its games, results and the tournaments it has won, gathered from
          across events rather than trapped inside one. If you run a team, you
          can ask to manage its page.
        </p>
        <p>
          And a{" "}
          <Link href="/community" className="text-brand-text hover:underline">
            place to ask
          </Link>{" "}
          &mdash; for players, for opponents, for a keeper coach, for which
          fields are dry in November.
        </p>

        <h2 className="text-lg font-semibold">Open by default</h2>
        <p>
          Reading takes no account. Browsing events, teams, results and
          discussions is open to everyone, and always will be &mdash; an
          account is only needed to put something in.
        </p>
        <p>
          When you do sign in, you are anonymous <em>to other readers</em>
          unless you choose otherwise. Your email address is stored &mdash; it
          is how you sign in, and how we reach you about something you asked
          for &mdash; and nobody else sees it. What appears beside anything you
          post is a handle we generate, not your email and not the name your
          sign-in provider holds; you can change it in settings whenever you
          like. There is no password to store, because signing in is a link
          sent to your inbox.
        </p>

        <h2 className="text-lg font-semibold">Who runs it</h2>
        <p>
          The same people who run{" "}
          <a
            href="https://kingjuancup.org"
            className="text-brand-text hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            King Juan Cup
          </a>{" "}
          &mdash; a Seattle youth soccer tournament. This site started as the
          tooling that event needed, and grew into the one we wanted as
          families ourselves.
        </p>
      </div>
    </main>
  );
}
