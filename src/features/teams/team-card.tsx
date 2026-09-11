import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { formatBirthYears } from "@/features/teams/age";
import { crestOf } from "@/features/teams/crest";

/**
 * One team in a list of them.
 *
 * Lifted out of the directory page so the admin's merge picker can show the
 * same row rather than a second one that drifts — it is the same teams, read
 * the same way, and a picker that looked different would be a second design
 * of the same thing.
 */
export type Card = {
  id: string;
  slug: string;
  name: string;
  crestUrl: string | null;
  ageGroup: string | null;
  birthYears?: number[];
  tier?: string | null;
  program?: string | null;
  city: string | null;
  club?: { name: string; crestUrl: string | null } | null;
};

export function TeamCard({ team, note }: { team: Card; note?: string }) {
  // Birth years where we have them, the printed age group where we do not.
  const meta = [
    [team.club?.name, team.program].filter(Boolean).join(" ") || null,
    formatBirthYears(team.birthYears) ?? team.ageGroup,
    team.tier,
    team.city,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/teams/${team.slug}`}
        className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-elevated"
      >
        {/*
         * A team's own crest, else its club's.
         *
         * 22 of 966 teams have a crest and every club has one, so falling
         * back is the difference between a directory of grey squares and a
         * directory that looks like the clubs it lists. Read at render rather
         * than copied into the row: a club changing its crest changes these
         * with it, and re-filing a team under the right club fixes its badge
         * with no backfill to remember.
         */}
        <TeamCrest src={crestOf(team)} size={36} />
        <div className="min-w-0">
          <div className="truncate font-medium">{team.name}</div>
          <div className="truncate text-xs text-muted">
            {[meta, note].filter(Boolean).join(" · ")}
          </div>
        </div>
      </Link>
    </li>
  );
}
