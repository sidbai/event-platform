import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { listTeams } from "@/features/teams/queries";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await listTeams();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        {teams.length === 0
          ? "Teams that play year-round show up here once a coach claims them. One-off tournament teams stay with their event."
          : `${teams.length} team${teams.length === 1 ? "" : "s"}`}
      </p>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {teams.map((team) => (
          <li key={team.id}>
            <Link
              href={`/teams/${team.slug}`}
              className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-elevated"
            >
              <TeamCrest src={team.crestUrl} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{team.name}</div>
                <div className="text-xs text-muted">
                  {[team.ageGroup, team.city].filter(Boolean).join(" · ")}
                  {team.eventTeams.length > 0 &&
                    ` · ${team.eventTeams.length} event${team.eventTeams.length > 1 ? "s" : ""}`}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
