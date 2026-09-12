import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { canEditClub } from "@/features/clubs/access";
import { ClubTabs } from "@/features/clubs/club-tabs";
import { leaguesByClub, teamCountsByClub } from "@/features/clubs/hub";
import { clubSummary, getClub } from "@/features/clubs/queries";
import { coachesAtClub } from "@/features/coaches/queries";
import { Stars } from "@/features/clubs/stars";

export const dynamic = "force-dynamic";

/**
 * A club's page: who they are first, and what people say about them after.
 *
 * This used to open on the rating, because the section was called Reviews.
 * It is called Clubs now, and a club page is where a parent goes to find
 * out what a club is — which leagues it plays in, how its teams are named,
 * who coaches them — with the reviews one tab along. The header and the
 * tabs are shared; each tab is its own page and its own address.
 */
export default async function ClubLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const [club, user] = await Promise.all([getClub(slug), getCurrentUser()]);
  if (!club) notFound();

  const [summary, leagues, teamCounts, coaches, mayEdit] = await Promise.all([
    clubSummary(club.id),
    leaguesByClub([club.id]),
    teamCountsByClub([club.id]),
    coachesAtClub(club.id),
    user ? canEditClub() : Promise.resolve(false),
  ]);
  const inLeagues = leagues.get(club.id) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/clubs" className="text-sm text-brand-text hover:underline">
        ← Clubs
      </Link>

      <header className="mt-4 flex items-start gap-4">
        <TeamCrest src={club.crestUrl} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {club.city && <span>{club.city}</span>}
            {club.city && club.website && <span aria-hidden>·</span>}
            {club.website && (
              <a
                href={club.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-text hover:underline"
              >
                {club.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
          </p>
          {/* The leagues the club's teams actually have entries in here —
              a fact from the schedules, not a claim from a website. */}
          {inLeagues.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {inLeagues.map((l) => (
                <li key={l.slug}>
                  <Link
                    href={`/events/${l.slug}`}
                    className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-soft-text hover:underline"
                    title={`${l.teams} team${l.teams === 1 ? "" : "s"} in ${l.title}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {summary?.rated && (
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <span className="text-amber-500">
                <Stars value={summary.overall} />
              </span>
              <span className="tabular-nums font-medium">{summary.overall.toFixed(1)}</span>
              <span className="text-muted">
                · {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            </p>
          )}
        </div>
        {mayEdit && (
          <Link href={`/clubs/${slug}/edit`} className="shrink-0 text-xs text-muted hover:text-ink">
            Edit club details
          </Link>
        )}
      </header>

      <ClubTabs
        slug={slug}
        counts={{
          teams: teamCounts.get(club.id) ?? 0,
          coaches: coaches.length,
          reviews: summary?.count ?? 0,
        }}
      />

      {children}
    </div>
  );
}
