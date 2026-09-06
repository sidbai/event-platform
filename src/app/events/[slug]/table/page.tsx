import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { canViewEvent } from "@/features/events/can-view";
import { getLeague } from "@/features/tournaments/league-queries";
import { byMatchday, currentMatchday } from "@/features/tournaments/matchdays";
import { computeStandings, rankStandings } from "@/features/tournaments/standings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Table and schedule" };

function fmtDay(key: string, timeZone: string) {
  if (!key) return "Date to be confirmed";
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function fmtTime(d: Date | null, timeZone: string) {
  if (!d) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

function shortDay(key: string, timeZone: string) {
  if (!key) return "TBD";
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export default async function LeagueTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ division?: string; day?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [league, user] = await Promise.all([getLeague(slug), getCurrentUser()]);
  if (!league) notFound();
  if (!(await canViewEvent(league, user))) notFound();

  const tz = league.timezone ?? "America/Los_Angeles";

  /*
   * One division at a time, the way GotSport does it. A league can carry a
   * dozen age groups; showing every table at once is a page nobody reads and
   * a query that grows with the season.
   */
  const divisions = league.divisions;
  const division =
    divisions.find((d) => d.id === sp.division) ?? divisions[0] ?? null;

  const teams = league.eventTeams.filter(
    (et) => !division || et.divisionId === division.id,
  );
  const matches = league.matches.filter(
    (m) => !division || m.divisionId === division.id,
  );

  /*
   * Brackets within a division. GotSport calls them brackets, the schema calls
   * the column groupLabel, and a division with none is one unlabelled bracket
   * rather than a special case.
   */
  const brackets = [...new Set(teams.map((t) => t.groupLabel ?? ""))].sort();

  const days = byMatchday(matches, tz);
  const day = sp.day ?? currentMatchday(days, new Date(), tz) ?? "";
  const shown = days.find((d) => d.key === day) ?? days[0] ?? null;

  const href = (next: { division?: string; day?: string }) => {
    const q = new URLSearchParams();
    const dv = next.division ?? division?.id;
    if (dv) q.set("division", dv);
    // Changing division resets the day: a matchday from one age group is
    // rarely a matchday in another, and carrying it over lands on nothing.
    if (next.division === undefined && next.day) q.set("day", next.day);
    const s = q.toString();
    return s ? `/events/${slug}/table?${s}` : `/events/${slug}/table`;
  };

  const pill = "rounded-full px-2.5 py-1 text-xs";
  const on = `${pill} bg-ink text-page`;
  const off = `${pill} bg-elevated text-muted hover:bg-line`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {league.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Table and schedule
      </h1>

      {divisions.length > 1 && (
        <nav aria-label="Divisions" className="mt-4 flex flex-wrap gap-1.5">
          {divisions.map((d) => (
            <Link
              key={d.id}
              href={href({ division: d.id })}
              aria-current={d.id === division?.id ? "page" : undefined}
              className={d.id === division?.id ? on : off}
            >
              {d.label ?? d.name}
            </Link>
          ))}
        </nav>
      )}

      {teams.length === 0 ? (
        <p className="mt-8 text-muted">No teams in this division yet.</p>
      ) : (
        brackets.map((bracket) => {
          const bracketTeams = teams.filter((t) => (t.groupLabel ?? "") === bracket);
          const ids = new Set(bracketTeams.map((t) => t.teamId));
          /*
           * Only matches between two teams of this bracket count. A cross
           * bracket friendly would otherwise move a table it has no business
           * in, and knockout games would be counted twice.
           */
          const bracketMatches = matches.filter(
            (m) =>
              m.homeTeamId &&
              m.awayTeamId &&
              ids.has(m.homeTeamId) &&
              ids.has(m.awayTeamId),
          );
          const rows = rankStandings(
            [
              ...computeStandings(
                bracketMatches,
                bracketTeams.map((t) => t.teamId),
              ).values(),
            ],
            bracketMatches,
          );
          const nameOf = (id: string) =>
            bracketTeams.find((t) => t.teamId === id)?.team?.name ?? "—";

          return (
            <section key={bracket || "all"} className="mt-8">
              {bracket && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Bracket {bracket}
                </h2>
              )}
              {/* Nine columns will not fit a phone, so the table scrolls in its
                  own box rather than widening the page around it. */}
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-2 text-left font-medium">Team</th>
                      {["MP", "W", "D", "L", "GF", "GA", "GD", "PTS"].map((h) => (
                        <th key={h} className="px-2 py-2 text-right font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.teamId} className="border-b border-line">
                        <td className="py-2">
                          <span className="mr-2 tabular-nums text-muted">{i + 1}</span>
                          {nameOf(r.teamId)}
                        </td>
                        {[r.played, r.won, r.drawn, r.lost, r.gf, r.ga].map((n, j) => (
                          <td key={j} className="px-2 py-2 text-right tabular-nums">
                            {n}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.gd > 0 ? `+${r.gd}` : r.gd}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">
                          {r.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <section className="mt-10">
        <h2 className="font-semibold">Schedule</h2>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No fixtures yet.</p>
        ) : (
          <>
            <nav aria-label="Matchdays" className="mt-3 flex flex-wrap gap-1.5">
              {days.map((d) => (
                <Link
                  key={d.key || "tbd"}
                  href={href({ day: d.key })}
                  aria-current={d.key === shown?.key ? "page" : undefined}
                  className={d.key === shown?.key ? on : off}
                >
                  {shortDay(d.key, tz)}
                </Link>
              ))}
            </nav>

            {shown && (
              <>
                <h3 className="mt-5 text-sm font-medium">
                  {fmtDay(shown.key, tz)}
                </h3>
                <ul className="mt-2 divide-y divide-line">
                  {shown.matches.map((m) => (
                    <li key={m.id} className="py-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {m.homeTeam?.name ?? m.homePlaceholder ?? "TBD"}
                          <span className="mx-2 tabular-nums text-muted">
                            {m.homeScore !== null && m.awayScore !== null
                              ? `${m.homeScore} – ${m.awayScore}`
                              : "v"}
                          </span>
                          {m.awayTeam?.name ?? m.awayPlaceholder ?? "TBD"}
                        </span>
                        <span className="text-xs text-muted">
                          {fmtTime(m.kickoffAt, tz)}
                          {m.field && ` · ${m.field}`}
                          {m.groupLabel && ` · Bracket ${m.groupLabel}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
