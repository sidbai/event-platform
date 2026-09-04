import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How King Juan Soccer collects, uses, and shares your information.",
};

const UPDATED = "September 4, 2026";
const CONTACT = "admin@kingjuansoccer.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
        <p>
          King Juan Soccer (&ldquo;we&rdquo;, &ldquo;the platform&rdquo;) is a
          website at <strong>kingjuansoccer.com</strong> for discovering and
          organizing youth soccer events in the Seattle area, operated by the
          organizers of the King Juan Cup. This policy explains what information
          we collect, why, and how it is shared. It applies to the website only.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Information we collect
        </h2>
        <p>
          <strong>From your Google Account, when you sign in.</strong> We use
          &ldquo;Sign in with Google&rdquo; for accounts. With your permission,
          Google shares your <strong>name</strong>, <strong>email address</strong>,
          and <strong>profile picture</strong> with us. We do not receive your
          password and we request no other Google data (no access to Gmail,
          Drive, Contacts, Calendar, or similar).
        </p>
        <p>
          <strong>Information you provide.</strong> When you use signed-in
          features you may create: events you submit or host; teams you create,
          claim, or manage, and the people you add as team managers; team
          rosters (player name, birth year, and gender); RSVPs and event
          registrations; &ldquo;looking for an opponent&rdquo; offers and
          messages; and comments in event or team discussions.
        </p>
        <p>
          <strong>Technical information.</strong> Our hosting provider records
          standard server logs (IP address, browser type, pages requested,
          timestamps) for security and reliability. We set one cookie to keep
          you signed in. We do not use advertising or cross-site tracking
          cookies.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          How we use it
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>To create and secure your account and keep you signed in.</li>
          <li>
            To attribute the events, teams, rosters, and comments you create to
            you, and to show your name (or a display name you choose) alongside
            them.
          </li>
          <li>
            To let event organizers and other coaches identify and contact you
            about events you are involved in.
          </li>
          <li>To operate features such as standings, schedules, and the weekly roundup.</li>
          <li>To detect abuse, enforce our terms, and respond to reports.</li>
        </ul>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Youth player information
        </h2>
        <p>
          Team rosters contain limited information about youth players (name,
          birth year, gender) entered by a team&rsquo;s coach or manager. Roster
          details are visible only to that team&rsquo;s managers and to the
          organizer of the event the roster is for &mdash; they are not shown on
          public pages. The platform is intended for use by coaches, parents,
          and organizers; children do not create accounts.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          How information is shared
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Publicly.</strong> Content you choose to publish &mdash;
            event details, public team profiles, match results, standings, and
            discussion comments &mdash; is visible to anyone, along with the name
            or display name of whoever created it. Event and match results are
            also available through a public read-only data feed used by
            kingjuancup.org.
          </li>
          <li>
            <strong>Service providers.</strong> We use Vercel for hosting, Neon
            for database storage, and Google for sign-in. They process data only
            to provide these services.
          </li>
          <li>
            <strong>Legal.</strong> We may disclose information if required by
            law or to protect the safety of users.
          </li>
          <li>
            We do <strong>not</strong> sell your personal information or share it
            for advertising.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Retention and deletion
        </h2>
        <p>
          We keep your account information while your account is active. You can
          delete your own discussion comments at any time. To delete your
          account and associated personal data, email us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
            {CONTACT}
          </a>{" "}
          and we will remove it, except where we must retain limited records to
          comply with the law or resolve disputes. Content you posted publicly
          (such as a comment) may be anonymized rather than deleted where others
          have relied on it.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Your Google data
        </h2>
        <p>
          You can review or revoke the platform&rsquo;s access to your Google
          Account at any time at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Changes
        </h2>
        <p>
          We may update this policy. Material changes will be noted by updating
          the date above.
        </p>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Contact
        </h2>
        <p>
          Questions about this policy or your data:{" "}
          <a href={`mailto:${CONTACT}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
            {CONTACT}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
