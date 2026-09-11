import Link from "next/link";
import type { Metadata } from "next";

import { anonymousReviewsEnabled } from "@/features/reviews/anon-gate";

export const metadata: Metadata = {
  title: "Why an account",
  description:
    "Reading King Juan Soccer takes no account. An account is for putting something in — and it stays anonymous.",
};

/**
 * The line between reading and taking part, at an address somebody can link to.
 *
 * Written because the line existed and was invisible: it was enforced in
 * twenty-odd server actions, each of which said "Sign in to…" at the moment
 * somebody was already trying to do the thing. Finding out what an account is
 * for by being refused is a bad way to find out.
 *
 * Only what the site does today. A page like this is the first thing a coach
 * checks the product against, and one row that turns out to be a plan is
 * worth more doubt than every true row is worth trust — so nothing here is
 * marked "coming soon", and things get added the day they ship.
 *
 * The anonymous-review row reads the same switch the review form does, rather
 * than restating it, because a deployment without a rate-limit secret does not
 * offer that and this page would otherwise be quietly wrong on exactly the
 * point it is making.
 */

const CAN_READ = [
  "Every event, its schedule, its results and its table",
  "Team pages — fixtures and results gathered across events, not trapped in one",
  "Club and coach pages, and the reviews on them",
  "Training slots coaches have opened up, by day",
  "The community, and the news",
];

const CAN_DO = [
  {
    who: "As a parent or player",
    items: [
      "Follow a team, and see when it next plays — yours alone, never counted or shown",
      "Ask and answer in the community, and reply to a discussion",
      "Message another family directly",
      "Write a review under a handle, so people can see your other posts",
      "Say you are going to an event",
      "Ask a coach for a training slot, and have it land in your calendar once they confirm",
    ],
  },
  {
    who: "If you coach",
    items: [
      "Publish the slots you have — private or group, by day and place — under the name parents know you by",
      "Confirm or decline each request, from one view of your week",
    ],
  },
  {
    who: "For your team",
    items: [
      "Create a team, or claim one this directory already holds",
      "Upload a crest, correct the name, add a result we do not have",
      "Register a team for an event, and answer an invitation",
    ],
  },
  {
    who: "If you run events",
    items: [
      "Submit an event to the directory",
      "Run your own: fixtures, scores, rosters, check-in sheets, invitations",
    ],
  },
];

export default function WhyAnAccountPage() {
  const anonymousReviews = anonymousReviewsEnabled();

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Why an account</h1>

      <p className="mt-6 text-lg leading-relaxed text-ink">
        Reading takes no account, and always will. An account is for putting
        something in.
      </p>

      <div className="mt-10 grid items-start gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-elevated p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Without an account
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-ink">
            {CAN_READ.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-muted">
                  &middot;
                </span>
                <span>{line}</span>
              </li>
            ))}
            {anonymousReviews && (
              <li className="flex gap-2">
                <span aria-hidden className="text-muted">
                  &middot;
                </span>
                <span>
                  Write a review of a club or a coach without signing in at all
                </span>
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-text">
            With one
          </h2>
          <div className="mt-4 space-y-5">
            {CAN_DO.map((group) => (
              <div key={group.who}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.who}
                </h3>
                <ul className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink">
                  {group.items.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="text-muted">
                        &middot;
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/*
        The part people actually want to know before they hand over an address,
        and the reason it is stated here rather than left to the privacy page:
        somebody deciding whether to sign in is deciding it on this page.
      */}
      <section className="mt-10 space-y-4 text-sm leading-relaxed text-ink">
        <h2 className="text-lg font-semibold">What an account is not</h2>
        <p>
          <strong>It is not your name.</strong> What appears beside anything you
          post is a handle we generate &mdash; not your email, and not the name
          your sign-in provider holds. Change it in settings whenever you like.
        </p>
        <p>
          <strong>It is not a profile.</strong> Your email address is stored,
          because it is how you sign in and how we reach you about something you
          asked for. Nothing else about you is, and nobody else sees the address.
          There is no password to store either &mdash; signing in is a link sent
          to your inbox.
        </p>
        <p>
          <strong>Reviews never carry a name.</strong>{" "}
          {anonymousReviews
            ? "Signed in or not, readers see the rating and the words and nothing about who wrote them."
            : "Readers see the rating and the words and nothing about who wrote them."}
        </p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/signin"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          Sign in
        </Link>
        <Link href="/privacy" className="text-sm text-brand-text hover:underline">
          What we store
        </Link>
        <Link href="/about" className="text-sm text-brand-text hover:underline">
          About this site
        </Link>
      </div>
    </main>
  );
}
