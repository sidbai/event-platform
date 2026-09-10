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
 * One side recorded twice — once as a year, once as a band.
 *
 * The school-year change in the summer of 2026 is what filled this page the
 * first time; it is not what keeps filling it. A club enters its own
 * tournaments under one convention and a league enters the same squad under
 * the other, so the two spellings keep arriving from different sources. An
 * empty list here means the imports are caught up, not that the job is over.
 *
 * Its own page rather than a section of the duplicate queue, because it
 * answers a different question. The queue asks whether two rows are the same
 * side and has to be careful about it; here that much is given by the rule,
 * and what is left to decide is whether these particular two are.
 *
 * The pairs are offered, not applied. Every one is two teams with real
 * fixtures behind them, a merge is a person's decision, and the queue's own
 * machinery — merge, swap which one survives, or say they are different and
 * never be asked again — does the work.
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
        One side, recorded twice: once as a year and once as a band. A club
        enters its own tournaments as <span className="font-mono">B14</span>{" "}
        and a league enters the same squad as{" "}
        <span className="font-mono">B14/15</span>, so both arrive and neither
        is wrong. The band is kept &mdash; it is the form that carries the age
        a season is played at.
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
          Nothing to fold in. The imports are caught up &mdash; the next one
          that spells a side the other way will show up here.
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
