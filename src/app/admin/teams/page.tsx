import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { confirmMerge } from "@/features/teams/merge-actions";
import { MergeButton } from "@/features/teams/merge-button";
import { duplicateTeamGroups } from "@/features/teams/merge-queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Duplicate teams" };

export default async function AdminTeamsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const groups = await duplicateTeamGroups();
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
    </div>
  );
}
