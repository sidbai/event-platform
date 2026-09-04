import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using King Juan Soccer.",
};

const UPDATED = "September 4, 2026";
const CONTACT = "admin@kingjuansoccer.com";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
        <p>
          These terms govern your use of King Juan Soccer at{" "}
          <strong>kingjuansoccer.com</strong>, a free platform for organizing and
          discovering youth soccer events, operated by the organizers of the King
          Juan Cup. By using the site you agree to them.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Accounts
        </h2>
        <p>
          You sign in with a Google Account. You are responsible for activity
          under your account. Provide accurate information and keep it current.
          You must be old enough to consent to this agreement; the platform is
          intended for coaches, parents, and organizers, not for use by children
          directly.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Acceptable use
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Post only content you have the right to share. Do not post content
            that is unlawful, harassing, hateful, or that endangers a child.
          </li>
          <li>
            Only add teams, rosters, or events you are authorized to manage, and
            only add player information with the appropriate parent or guardian
            consent.
          </li>
          <li>
            Do not misrepresent your identity or your affiliation with a team,
            club, or event.
          </li>
          <li>
            Do not scrape, overload, or attempt to disrupt the service, or use it
            to send spam.
          </li>
        </ul>
        <p>
          We may remove content, lock discussions, or suspend accounts that
          break these rules or the{" "}
          <a href="/privacy" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Privacy Policy
          </a>
          .
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Your content
        </h2>
        <p>
          You keep ownership of what you post. You grant us permission to store,
          display, and distribute it as needed to operate the platform &mdash;
          including showing event and match results through the public read-only
          feed used by kingjuancup.org.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Events are run by their organizers
        </h2>
        <p>
          King Juan Soccer is a listing and coordination tool. Each event,
          tournament, scrimmage, or camp is organized and run by the person or
          group who posted it, not by us. We are not responsible for the conduct,
          safety, cancellation, fees, or outcome of any event. Verify details
          with the organizer.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Disclaimer and liability
        </h2>
        <p>
          The service is provided &ldquo;as is&rdquo;, without warranties. To the
          fullest extent permitted by law, we are not liable for indirect or
          consequential damages, or for any amount greater than what you paid to
          use the service (which is nothing).
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Changes and termination
        </h2>
        <p>
          We may change these terms or the service, or stop offering it, at any
          time. You can stop using the site and request account deletion at any
          time.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Contact
        </h2>
        <p>
          <a href={`mailto:${CONTACT}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
            {CONTACT}
          </a>
        </p>
      </div>
    </main>
  );
}
