import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { claimTeam, unclaimTeam } from "@/features/teams/actions";
import { getTeamBySlug, type TeamDetail } from "@/features/teams/queries";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [team, user] = await Promise.all([getTeamBySlug(slug), getCurrentUser()]);
  if (!team) notFound();

  const mine = user && team.claimedBy === user.id;
  const claimable = user && !team.claimedBy;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/teams" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← All teams
      </Link>

      <header className="mt-4 flex items-center gap-4">
        {team.crestUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.crestUrl} alt="" className="h-16 w-16 rounded object-contain" />
        ) : (
          <div className="h-16 w-16 rounded bg-neutral-100 dark:bg-neutral-800" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-sm text-neutral-500">
            {[team.club, team.ageGroup, team.city].filter(Boolean).join(" · ") || "Youth soccer team"}
          </p>
        </div>
      </header>

      {team.bio && <p className="mt-4 text-neutral-600 dark:text-neutral-300">{team.bio}</p>}

      <div className="mt-4 text-sm">
        {mine ? (
          <div className="flex items-center gap-3">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
              {team.verifiedAt ? "You manage this team · verified" : "You manage this team · pending verification"}
            </span>
            <form action={unclaimTeam.bind(null, team.slug)}>
              <button type="submit" className="text-neutral-500 hover:text-red-600 dark:hover:text-red-400">
                Release
              </button>
            </form>
          </div>
        ) : team.claimedBy ? (
          <span className="text-neutral-500">
            {team.verifiedAt ? "Managed by a verified coach" : "Claimed by a coach"}
          </span>
        ) : claimable ? (
          <form action={claimTeam.bind(null, team.slug)}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Claim this team
            </button>
          </form>
        ) : (
          <Link href="/signin" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Sign in to claim this team
          </Link>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Events</h2>
        {team.eventTeams.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {team.eventTeams.map((et) => (
              <li
                key={et.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <Link
                    href={`/events/${et.event.slug}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {et.event.title}
                  </Link>
                  <span className="text-sm text-neutral-500">
                    {" — "}
                    {et.division?.label ?? et.division?.name}
                    {et.seed === 1 && " · 🏆 champion"}
                  </span>
                </div>
                <div className="text-sm tabular-nums text-neutral-500">
                  {fmtDate(et.event.startsAt)} · {et.won}W {et.drawn}D {et.lost}L ·{" "}
                  {et.gf}–{et.ga} · {et.points} pts
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {team.matches.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Matches</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {team.matches.map((m) => (
              <MatchRow key={m.id} match={m} teamId={team.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MatchRow({
  match,
  teamId,
}: {
  match: TeamDetail["matches"][number];
  teamId: string;
}) {
  const isHome = match.homeTeamId === teamId;
  const us = isHome ? match.homeScore : match.awayScore;
  const them = isHome ? match.awayScore : match.homeScore;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const opponentName = opponent?.name ?? (isHome ? match.awayPlaceholder : match.homePlaceholder);

  const result =
    us == null || them == null ? "" : us > them ? "W" : us < them ? "L" : "D";
  const resultColor =
    result === "W"
      ? "text-emerald-700 dark:text-emerald-400"
      : result === "L"
        ? "text-red-600 dark:text-red-400"
        : "text-neutral-500";

  return (
    <li className="flex items-center gap-2">
      <span className={`w-4 font-semibold ${resultColor}`}>{result}</span>
      <span className="w-16 text-xs uppercase tracking-wide text-neutral-400">
        {match.stage === "ko" ? match.round : match.division?.name}
      </span>
      <span className="tabular-nums">
        {us}–{them}
      </span>
      <span className="text-neutral-500">vs</span>
      <span>
        {opponent?.slug ? (
          <Link href={`/teams/${opponent.slug}`} className="hover:underline">
            {opponentName}
          </Link>
        ) : (
          opponentName
        )}
      </span>
    </li>
  );
}
