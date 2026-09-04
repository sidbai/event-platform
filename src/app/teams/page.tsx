import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { listTeams, myTeams } from "@/features/teams/queries";

export const dynamic = "force-dynamic";

type Card = {
  id: string;
  slug: string;
  name: string;
  crestUrl: string | null;
  ageGroup: string | null;
  city: string | null;
};

function TeamCard({ team, note }: { team: Card; note?: string }) {
  const meta = [team.ageGroup, team.city].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/teams/${team.slug}`}
        className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-elevated"
      >
        <TeamCrest src={team.crestUrl} size={36} />
        <div className="min-w-0">
          <div className="truncate font-medium">{team.name}</div>
          <div className="text-xs text-muted">
            {[meta, note].filter(Boolean).join(" · ")}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const [teams, mine] = await Promise.all([
    listTeams(),
    user ? myTeams(user.id) : Promise.resolve([]),
  ]);

  const mineIds = new Set(mine.map((t) => t.id));
  const others = teams.filter((t) => !mineIds.has(t.id));

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <Link
          href="/teams/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          Create a team
        </Link>
      </div>

      {mine.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your teams
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {mine.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                // A private team is listed nowhere else, so say so here rather
                // than leaving the owner wondering why nobody can find it.
                note={
                  team.visibility === "private"
                    ? `${team.role} · private`
                    : team.role
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        {mine.length > 0 && (
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            All teams
          </h2>
        )}
        <p className={mine.length > 0 ? "mt-2 text-sm text-muted" : "mt-1 text-sm text-muted"}>
          {others.length === 0
            ? "Teams that play year-round show up here once a coach claims them. One-off tournament teams stay with their event."
            : `${others.length} public team${others.length === 1 ? "" : "s"}`}
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {others.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              note={
                team.eventTeams.length > 0
                  ? `${team.eventTeams.length} event${team.eventTeams.length > 1 ? "s" : ""}`
                  : undefined
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
