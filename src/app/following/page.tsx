import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { kickoffLabel } from "@/features/events/kickoff";
import { followedTeams, nextGames } from "@/features/teams/follow-queries";

export const metadata: Metadata = { title: "Following" };
export const dynamic = "force-dynamic";

/*
 * The zone every event here is played in. Carried on the event row too, and
 * this list crosses events — when a Seattle directory starts holding games in
 * another zone, this is the line that has to read it per fixture.
 */
const TZ = "America/Los_Angeles";

/**
 * The teams you follow, and when they next play.
 *
 * The next game is the whole reason to keep this list — a page of names would
 * be a bookmark folder. So the date leads, and a team with nothing scheduled
 * says so rather than being hidden: "no fixture yet" is the answer a parent
 * came for as much as a date is.
 *
 * Yours alone. Nobody else can see this page, and no team page says how many
 * people are on one.
 */
export default async function FollowingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/following")}`);

  const teams = await followedTeams(user.id);
  const next = new Map((await nextGames(teams.map((t) => t.id))).map((g) => [g.teamId, g]));

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Following</h1>

      {teams.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-elevated p-6">
          <p className="text-sm text-ink">
            Nothing yet. Open a team and press Follow, and its next game shows
            up here.
          </p>
          <Link
            href="/teams"
            className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            Find a team
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {teams.map((team) => {
            const game = next.get(team.id);
            return (
              <li key={team.id} className="flex items-center gap-3 py-4">
                <TeamCrest src={team.crestUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/teams/${team.slug}`}
                    className="font-medium hover:underline"
                  >
                    {team.name}
                  </Link>
                  {game ? (
                    <p className="text-sm text-muted">
                      {kickoffLabel(game.kickoffAt, TZ) ?? "Date to be confirmed"}
                      {game.opponent && (
                        <>
                          {" · v "}
                          <Link
                            href={`/teams/${game.opponent.slug}`}
                            className="hover:underline"
                          >
                            {game.opponent.name}
                          </Link>
                        </>
                      )}
                      {" · "}
                      <Link
                        href={`/events/${game.eventSlug}`}
                        className="hover:underline"
                      >
                        {game.eventTitle}
                      </Link>
                    </p>
                  ) : (
                    <p className="text-sm text-muted">No fixture scheduled yet</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
