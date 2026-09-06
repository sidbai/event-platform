import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Guidelines",
  description:
    "What belongs in a review of a club or coach on King Juan Soccer, and how reviews are moderated.",
};

const UPDATED = "September 6, 2026";
const CONTACT = "admin@kingjuancup.org";

/**
 * The rules reviews are held to, written down.
 *
 * Needed because reviews can be posted without an account and are about named
 * people. "We remove content that breaks our guidelines" is only a defensible
 * position if the guidelines exist somewhere a coach can read them — otherwise
 * every removal is an improvisation, and every refusal to remove looks like
 * one too.
 */
export default function GuidelinesPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Review Guidelines
      </h1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink">
        <p>
          Reviews on King Juan Soccer exist so families can find out what a club
          or a coach is actually like before committing a season to them. They
          work when they are honest, specific, and about the experience. These
          are the rules they are held to.
        </p>

        <h2 className="text-lg font-semibold text-ink">Reviews are anonymous</h2>
        <p>
          Readers never see who wrote a review. You can also post without an
          account at all, in which case <strong>we cannot see who wrote it
          either</strong> &mdash; there is nothing stored that connects the
          review to a person.
        </p>
        <p>
          That has a consequence worth understanding before you write one. An
          anonymous review cannot be edited or deleted afterwards, by you or by
          us, because there is no way to confirm it was yours. If you want to be
          able to change or remove what you wrote, sign in first. Either way,
          your name is never shown.
        </p>

        <h2 className="text-lg font-semibold text-ink">Write about the experience</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Base it on something you or your player actually experienced, at the
            club or with the coach you are reviewing.
          </li>
          <li>
            Be specific. &ldquo;Training was well organized but playing time was
            uneven&rdquo; helps a parent decide; &ldquo;terrible club&rdquo; does
            not.
          </li>
          <li>
            Say when it was. A club can change a great deal in two seasons, and a
            review that does not say which one is hard to weigh.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-ink">What is not allowed</h2>
        <p>Reviews are removed if they include:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Personal attacks, insults, name-calling, or comments about someone&rsquo;s
            appearance, family, or personal life.
          </li>
          <li>Harassment, threats, or hatred of any kind.</li>
          <li>
            Anything about a child other than your own, by name or in a way that
            identifies them. This applies to players on the team as much as to
            anyone else.
          </li>
          <li>
            Private personal information &mdash; phone numbers, home addresses,
            employers, or anything else not already public.
          </li>
          <li>
            Accusations of criminal conduct. If something serious happened,
            report it to the club, the league, or the police. A review page is
            not the right place and cannot act on it.
          </li>
          <li>
            Reviews written by someone with a stake in the rating: a coach
            reviewing themselves or a rival, a club organizing reviews of itself,
            or the same person reviewing repeatedly to move an average.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-ink">
          If a review is about you
        </h2>
        <p>
          Coaches can claim their own page and reply to reviews. A reply sits
          with the review rather than replacing it, and is shown under your
          name. Claiming grants the right to answer and nothing more &mdash; not
          to edit a review, hide one, or review yourself.
        </p>
        <p>
          You can also report a review. Reports are read by a person, and a
          reported review may be held out of sight while that happens.{" "}
          <strong>
            A review is not removed for being negative, or for being wrong in
            your view.
          </strong>{" "}
          It is removed if it breaks the rules above. Where a review was posted
          anonymously we cannot tell you who wrote it, because we do not know.
        </p>

        <h2 className="text-lg font-semibold text-ink">How ratings are shown</h2>
        <p>
          A club or coach with only a handful of reviews shows how few, rather
          than an average presented as if it were settled. Coach pages show a
          review count and never a leaderboard: a column of scores against named
          people invites comparison the underlying numbers cannot support.
        </p>

        <h2 className="text-lg font-semibold text-ink">Questions</h2>
        <p>
          Reports and questions about a specific review go to{" "}
          <a href={`mailto:${CONTACT}`} className="text-brand-text hover:underline">
            {CONTACT}
          </a>
          . These guidelines sit alongside the{" "}
          <a href="/terms" className="text-brand-text hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-brand-text hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
