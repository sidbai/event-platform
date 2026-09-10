import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { confirmMerge } from "@/features/teams/merge-actions";
import { ManualMerge } from "@/features/teams/manual-merge";
import { MergeButton } from "@/features/teams/merge-button";
import { dismissProposal } from "@/features/teams/dismiss-actions";
import { ProposalRow } from "@/features/teams/proposal-row";
import {
  duplicateTeamGroups,
  proposedTeamMatches,
} from "@/features/teams/merge-queries";
import {
  acceptSuggestion,
  dismissSuggestion,
} from "@/features/teams/suggest/actions";
import { openSuggestions } from "@/features/teams/suggest/run";
import { SuggestionButtons } from "@/features/teams/suggest/suggestion-buttons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Duplicate teams" };

export default async function AdminTeamsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const groups = await duplicateTeamGroups();
  // Which rows are already offered together, so the section below does not
  // ask about a pair this one is already handling.
  const grouped = new Map<string, string>();
  for (const g of groups) {
    for (const member of [g.survivor, ...g.losers]) grouped.set(member.id, g.survivor.id);
  }
  const [proposals, suggestions] = await Promise.all([
    proposedTeamMatches(grouped),
    openSuggestions(),
  ]);
  const rows = groups.reduce((n, g) => n + g.losers.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Duplicate teams</h1>
      <p className="mt-2 text-sm text-muted">
        A connector makes a team row per event, so one side becomes a new row
        every tournament it enters and its record is split between them.
        Merging brings the history together and keeps the old addresses
        working. It cannot be undone, which is why nothing here happens on its
        own &mdash; the last step is you reading the names.
      </p>

      {groups.length === 0 ? (
        <p className="mt-8 text-muted">Nothing looks duplicated.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {groups.length} group{groups.length === 1 ? "" : "s"}, {rows} row
            {rows === 1 ? "" : "s"} to fold in.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {groups.map((g) => (
              <li key={g.survivor.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/teams/${g.survivor.slug}`}
                    className="font-medium hover:underline"
                  >
                    {g.survivor.name}
                  </Link>
                  {/* Why these were put together, since "same source id" is
                      the platform's own word and "same name" is a guess. */}
                  <span className="text-xs text-muted">{g.because}</span>
                </div>

                <p className="mt-0.5 text-xs text-muted">
                  keeping <span className="font-mono">{g.survivor.slug}</span> ·{" "}
                  {g.survivor.matches} matches over {g.survivor.events} event
                  {g.survivor.events === 1 ? "" : "s"}
                </p>

                <ul className="mt-2 space-y-1">
                  {g.losers.map((l) => (
                    <li key={l.id} className="text-xs text-muted">
                      <Link href={`/teams/${l.slug}`} className="hover:underline">
                        {l.name}
                      </Link>{" "}
                      <span className="font-mono">{l.slug}</span> · {l.matches}{" "}
                      matches
                      {l.name !== g.survivor.name && (
                        // The names differ, so this one deserves a longer look.
                        <span className="ml-1 text-amber-700">different name</span>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-2">
                  <MergeButton
                    action={confirmMerge.bind(
                      null,
                      g.survivor.id,
                      g.losers.map((l) => l.id),
                    )}
                    count={g.losers.length}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
       * For the two teams somebody already knows are one.
       *
       * Everything else on this page waits to be offered a pair. This does
       * not — a coach says two rows are the same side, or an admin knows a
       * club's junior programme by another name, and neither the rules nor a
       * model will ever work that out.
       */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">Merge two teams yourself</h2>
        <p className="mt-1 text-sm text-muted">
          When you already know. The team you keep holds the history; the other
          one&rsquo;s matches move across and its old address redirects. This
          cannot be undone, and the folded-in name will point at the survivor on
          every future import.
        </p>
        <ManualMerge />
      </section>

      {/*
       * A model's guesses, kept apart from everything above.
       *
       * The sections before this are facts checked here: the same id, the
       * same name, the same club and cohort. These are somebody else's
       * opinion with a sentence attached, and they read differently for that
       * reason — the rationale is shown, the model is named, and saying no is
       * as easy as saying yes.
       */}
      {suggestions.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Suggested by AI</h2>
          <p className="mt-1 text-sm text-muted">
            For teams the rules could not place. A guess, not a finding &mdash;
            read both names before agreeing.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {suggestions.map((s) => (
              <li key={s.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">
                    <Link
                      href={`/teams/${s.newTeamSlug}`}
                      className="font-medium hover:underline"
                    >
                      {s.newTeamName}
                    </Link>
                    <span className="mx-2 text-muted">is</span>
                    <Link
                      href={`/teams/${s.existingTeamSlug}`}
                      className="font-medium hover:underline"
                    >
                      {s.existingTeamName}
                    </Link>
                  </span>
                  <span className="text-xs text-muted">
                    {s.confidence} confidence · {s.model}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{s.why}</p>
                <div className="mt-2">
                  <SuggestionButtons
                    accept={acceptSuggestion.bind(null, s.id)}
                    dismiss={dismissSuggestion.bind(null, s.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
       * Pairs the platforms never spelled alike.
       *
       * The groups above are what a connector wrote twice; these are what two
       * tournaments called by different names — "LWPFC B17/18 White Sharks"
       * and "LWPFC White Sharks B17/18" are one side, and no exact rule will
       * ever see it. Proposed within a club, with the facts used to rule pairs
       * out rather than in: a club's A team is not its B team, and its ECNL
       * side is not its RCL one.
       *
       * Confirming one writes the name against the survivor, so the next
       * import lands on it instead of arriving here again.
       */}
      {/*
        Its own page because it answers a different question: this queue asks
        whether two rows are the same side, and there the rule gives that and
        the question is which of two spellings to keep.
      */}
      <section className="mt-12 rounded-xl border border-line bg-elevated p-4">
        <h2 className="text-base font-semibold">The school-year split</h2>
        <p className="mt-1 text-sm text-muted">
          One side recorded twice, once as a year and once as a band &mdash; a
          club enters <span className="font-mono">B14</span> and a league
          enters <span className="font-mono">B14/15</span> for the same squad.
        </p>
        <Link
          href="/admin/teams/age-bands"
          className="mt-3 inline-block rounded-md border border-line bg-card px-2.5 py-1 text-xs hover:bg-elevated"
        >
          Fold them in →
        </Link>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Possible matches</h2>
        <p className="mt-1 text-sm text-muted">
          Same club, same age group, same gender, and most of the name — but
          spelled differently by two tournaments. Read both names, and check
          which one is being kept: the team you keep holds the history and the
          address, and the other one&rsquo;s name is remembered against it.
          Saying they are different is remembered too, so the pair is not
          offered again.
        </p>

        {proposals.length === 0 ? (
          <p className="mt-6 text-muted">Nothing else looks alike.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {proposals.slice(0, 40).map((p) => (
              /*
               * Both directions are bound here rather than sent up from the
               * browser: the pair an admin is looking at is the pair the
               * action runs on, and nothing on the page names a team id.
               */
              <ProposalRow
                key={`${p.a.id}-${p.b.id}`}
                a={p.a}
                b={p.b}
                because={p.because}
                mergeAB={confirmMerge.bind(null, p.a.id, [p.b.id])}
                mergeBA={confirmMerge.bind(null, p.b.id, [p.a.id])}
                dismiss={dismissProposal.bind(null, p.a.id, p.b.id)}
              />
            ))}
          </ul>
        )}
        {proposals.length > 40 && (
          <p className="mt-3 text-xs text-muted">
            {proposals.length - 40} more, once these are decided.
          </p>
        )}
      </section>
    </div>
  );
}
