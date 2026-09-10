import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { candidateBandPairs } from "@/features/teams/age-band-queries";
import { dismissProposal } from "@/features/teams/dismiss-actions";
import { confirmMerge } from "@/features/teams/merge-actions";
import { ProposalRow } from "@/features/teams/proposal-row";

export const metadata: Metadata = { title: "The school-year split" };
export const dynamic = "force-dynamic";

/**
 * The teams the school-year change split in two.
 *
 * Youth soccer here moved its age groups from a calendar year to a school
 * year in the summer of 2026, so a side that was "B14" became "B14/15" — and
 * a directory holding four seasons of imports now holds both, as two teams
 * with one history between them.
 *
 * Deliberately its own page rather than a section of the duplicate queue.
 * This is a list about one summer: when it is empty, delete the page, the
 * query and the rule. A rule about 2026 living in the binder is a rule that
 * has to keep being right in 2030.
 *
 * The pairs are offered, not applied. Every one of these is two teams with
 * real fixtures behind them, a merge is a person's decision, and the queue's
 * own machinery — merge, swap which one survives, or say they are different
 * and never be asked again — is what does the work here too.
 */
export default async function AgeBandsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const pairs = await candidateBandPairs();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin/teams" className="text-sm text-brand-text hover:underline">
        ← Duplicate teams
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">The school-year split</h1>
      <p className="mt-2 text-sm text-muted">
        Age groups moved from a calendar year to a school year in the summer of
        2026, so a side that was <span className="font-mono">B14</span> is now{" "}
        <span className="font-mono">B14/15</span> &mdash; and this directory,
        holding four seasons of imports, has both. The band is kept, because it
        is what the club calls the side now.
      </p>
      <p className="mt-2 text-sm text-muted">
        Only where everything else agrees: the same club, the same gender, the
        same tier and programme, and the same words left over once those come
        out of the name. A side with two bands that both fit is not offered
        &mdash; Eastside&rsquo;s <span className="font-mono">B11 Red Bellevue Song</span>{" "}
        sits between two of them, and picking one automatically is how a team
        ends up merged into its own club&rsquo;s other side.
      </p>

      {pairs.length === 0 ? (
        <p className="mt-8 text-muted">
          Nothing left to fold in. This page has done its job &mdash; delete it.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {pairs.length} pair{pairs.length === 1 ? "" : "s"} to decide.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {pairs.map(({ single, band }) => (
              /*
               * The band leads, so it is the one kept unless somebody presses
               * swap. Both directions are bound here rather than sent up from
               * the browser.
               */
              <ProposalRow
                key={`${band.id}-${single.id}`}
                a={band}
                b={single}
                because="school-year band"
                mergeAB={confirmMerge.bind(null, band.id, [single.id])}
                mergeBA={confirmMerge.bind(null, single.id, [band.id])}
                dismiss={dismissProposal.bind(null, band.id, single.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
