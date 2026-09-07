import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { confirmClubLink, markIndependent } from "@/features/clubs/link-actions";
import { LinkButton } from "@/features/clubs/link-button";
import { clubProposals, unplacedTeams } from "@/features/clubs/link-queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams and clubs" };

export default async function AdminClubsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const [{ proposals, unmatched }, tail] = await Promise.all([
    clubProposals(),
    unplacedTeams(),
  ]);
  const placeable = proposals.reduce((n, p) => n + p.teams.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Teams and clubs</h1>
      <p className="mt-2 text-sm text-muted">
        A connector knows a team&rsquo;s name and nothing else, so nothing it
        imports is filed under a club. Confirming a group files these teams and
        saves what matched, so the next sync places the same names on its own.
        A club page carries reviews about named coaches &mdash; which is why
        the last step is you reading the names.
      </p>

      <p className="mt-6 text-sm text-muted">
        {placeable} team{placeable === 1 ? "" : "s"} in {proposals.length} group
        {proposals.length === 1 ? "" : "s"}, {unmatched} that nothing matches.
      </p>

      {proposals.length === 0 ? (
        <p className="mt-8 text-muted">Nothing left to place.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {proposals.map((p) => (
            <li key={p.clubId} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/clubs/${p.clubSlug}`}
                  className="font-medium hover:underline"
                >
                  {p.clubName}
                </Link>
                {/* Why these were put together: an alias is a decision
                    somebody already made, a name is this page's guess. */}
                <span className="text-xs text-muted">
                  {p.because === "alias"
                    ? `alias "${p.key}"`
                    : `their names start like the club's`}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-muted">
                {p.teams.length} team{p.teams.length === 1 ? "" : "s"} · saving
                this makes <span className="font-mono">{p.key}</span> mean{" "}
                {p.clubName}
              </p>

              <ul className="mt-2 space-y-1">
                {p.teams.slice(0, 8).map((t) => (
                  <li key={t.id} className="text-xs text-muted">
                    <Link href={`/teams/${t.slug}`} className="hover:underline">
                      {t.name}
                    </Link>{" "}
                    · {t.events} event{t.events === 1 ? "" : "s"}
                  </li>
                ))}
                {p.teams.length > 8 && (
                  <li className="text-xs text-muted">
                    and {p.teams.length - 8} more
                  </li>
                )}
              </ul>

              <div className="mt-2">
                <LinkButton
                  action={confirmClubLink.bind(
                    null,
                    p.clubId,
                    p.key,
                    p.teams.map((t) => t.id),
                  )}
                  label={`File ${p.teams.length} under ${p.clubName}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {tail.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Nothing matches these</h2>
          <p className="mt-1 text-sm text-muted">
            Either their club is not in the directory yet, or they belong to no
            club at all. Add the club first if it should exist &mdash; marking a
            club team as independent is the one answer that is hard to notice
            later.
          </p>
          <ul className="mt-3 space-y-1">
            {tail.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                <Link href={`/teams/${t.slug}`} className="hover:underline">
                  {t.name}
                </Link>
                <span className="text-muted">
                  · {t.events} event{t.events === 1 ? "" : "s"}
                </span>
                <LinkButton
                  action={markIndependent.bind(null, [t.id])}
                  label="not with a club"
                  tone="quiet"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
