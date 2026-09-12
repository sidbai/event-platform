import Link from "next/link";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { listClubs } from "@/features/clubs/queries";
import { leaguesByClub, teamCountsByClub } from "@/features/clubs/hub";
import { Pager } from "@/features/pagination/pager";
import { paginate, parsePage, PER_PAGE } from "@/features/pagination/paginate";
import { ReviewsHeader } from "@/features/reviews/reviews-header";
import { Stars } from "@/features/clubs/stars";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Clubs",
  description:
    "Seattle-area youth soccer clubs: leagues, tiers, teams and coaches, with anonymous reviews from the families who play there.",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const first = await listClubs(q, { limit: PER_PAGE, offset: 0 });
  const pagination = paginate(first.total, parsePage(sp.page));
  const { rows: clubs } =
    pagination.offset === 0
      ? first
      : await listClubs(q, { limit: PER_PAGE, offset: pagination.offset });
  const ids = clubs.map((c) => c.id);
  const [leagues, teamCounts] = await Promise.all([leaguesByClub(ids), teamCountsByClub(ids)]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <ReviewsHeader
        active="clubs"
        action={{ href: "/clubs/new", label: "Add a club" }}
        q={q}
      />

      {clubs.length === 0 ? (
        <p className="mt-10 text-muted">
          {q ? "No clubs match that. " : "No clubs yet. "}
          <Link href="/clubs/new" className="text-brand-text hover:underline">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.slug}`}
                className="flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-card p-5 text-center transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                <TeamCrest src={club.crestUrl} size={56} />
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{club.name}</div>
                  {club.city && (
                    <div className="text-xs text-muted">{club.city}</div>
                  )}
                </div>

                {/* What the club is, before what people think of it: the
                    leagues its teams are entered in here, and how many. */}
                {(() => {
                  const inLeagues = leagues.get(club.id) ?? [];
                  const n = teamCounts.get(club.id) ?? 0;
                  return (
                    <div className="text-xs text-muted">
                      {inLeagues.length > 0 && (
                        <ul className="flex flex-wrap justify-center gap-1">
                          {inLeagues.slice(0, 4).map((l) => (
                            <li key={l.slug} className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-soft-text">
                              {l.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      {n > 0 && <div className="mt-1">{n} team{n === 1 ? "" : "s"}</div>}
                    </div>
                  );
                })()}

                {/* Pushed to the bottom so ratings line up across a row even
                    when club names wrap to two lines. */}
                <div className="mt-auto pt-1">
                  {club.summary?.rated ? (
                    <>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-lg font-semibold tabular-nums">
                          {club.summary.overall.toFixed(1)}
                        </span>
                        <span className="text-amber-500">
                          <Stars value={club.summary.overall} />
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {club.summary.count} review
                        {club.summary.count === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : club.summary ? (
                    // Reviews exist but too few to average — say so rather
                    // than showing a number one person decided.
                    <>
                      <div className="text-sm text-muted">Not rated yet</div>
                      <div className="text-xs text-muted">
                        {club.summary.count} review
                        {club.summary.count === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted">No reviews yet</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pager basePath="/clubs" params={{ q }} pagination={pagination} noun="clubs" />
    </div>
  );
}
