import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { confirmClubLink, markIndependent } from "@/features/clubs/link-actions";
import { LinkButton } from "@/features/clubs/link-button";
import {
  clubOptions,
  clubProposals,
  unplacedGroups,
} from "@/features/clubs/link-queries";
import { PlaceGroup } from "@/features/clubs/place-group";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams and clubs" };

export default async function AdminClubsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const [{ proposals, unmatched }, { groups, rest, restTotal }, clubs] =
    await Promise.all([clubProposals(), unplacedGroups(), clubOptions()]);
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
        {proposals.length === 1 ? "" : "s"} the directory can name, {unmatched}{" "}
        it cannot.
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

      {groups.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">
            Nothing matches these
          </h2>
          <p className="mt-1 text-sm text-muted">
            Their club is not in the directory, so nothing can propose one
            &mdash; but their names group themselves. Add the club first if it
            should exist, then file the whole group under it and the alias will
            place these names on its own next sync. Marking a club team as
            independent is the one answer that is hard to notice later.
          </p>
          <p className="mt-3 text-sm text-muted">
            {unmatched} team{unmatched === 1 ? "" : "s"} in {groups.length}{" "}
            group{groups.length === 1 ? "" : "s"}
            {restTotal > 0 && ` and ${restTotal} on their own`}.
          </p>

          <ul className="mt-3 divide-y divide-line">
            {groups.map((g) => (
              <li key={g.key} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{g.label}</span>
                  <span className="text-xs text-muted">
                    filing this makes{" "}
                    <span className="font-mono">{g.key}</span> mean that club
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {g.teams.length} team{g.teams.length === 1 ? "" : "s"}
                </p>

                <ul className="mt-2 space-y-1">
                  {g.teams.slice(0, 6).map((t) => (
                    <li key={t.id} className="text-xs text-muted">
                      <Link href={`/teams/${t.slug}`} className="hover:underline">
                        {t.name}
                      </Link>{" "}
                      · {t.events} event{t.events === 1 ? "" : "s"}
                    </li>
                  ))}
                  {g.teams.length > 6 && (
                    <li className="text-xs text-muted">
                      and {g.teams.length - 6} more
                    </li>
                  )}
                </ul>

                <PlaceGroup
                  clubs={clubs}
                  groupKey={g.key}
                  label={g.label}
                  teamIds={g.teams.map((t) => t.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">On their own</h2>
          <p className="mt-1 text-sm text-muted">
            One name each, so there is no group to file &mdash; a club with a
            single team here, or a side put together for one tournament.
            {restTotal > rest.length &&
              ` Showing ${rest.length} of ${restTotal}.`}
          </p>
          <ul className="mt-3 space-y-1">
            {rest.map((t) => (
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
