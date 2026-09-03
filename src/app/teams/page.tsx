import Link from "next/link";

import { listTeams } from "@/features/teams/queries";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await listTeams();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
      <p className="mt-1 text-sm text-neutral-500">{teams.length} teams</p>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {teams.map((team) => (
          <li key={team.id}>
            <Link
              href={`/teams/${team.slug}`}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              {team.crestUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={team.crestUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-contain"
                />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded bg-neutral-100 dark:bg-neutral-800" />
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{team.name}</div>
                <div className="text-xs text-neutral-500">
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
