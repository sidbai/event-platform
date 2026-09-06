import { TeamCrest } from "@/components/team-crest";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { canViewEvent } from "@/features/events/can-view";
import { DivisionPicker } from "@/features/tournaments/division-picker";
import { getLeague } from "@/features/tournaments/league-queries";
import { byMatchday, currentMatchday } from "@/features/tournaments/matchdays";
import { computeStandings, rankStandings } from "@/features/tournaments/standings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schedule and standings" };

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
  searchParams: Promise<{
    view?: string;
    division?: string;
    team?: string;
    day?: string;
  }>;
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

  /*
   * Which half opens depends on whether the thing has finished.
   *
   * A running league is asked "when do we play"; a finished tournament is
   * asked "who won". Defaulting to the schedule of an event whose last match
   * was in August would open on a page of results nobody is looking for.
   */
  const finished =
    league.status === "completed" ||
    (matches.length > 0 && matches.every((m) => m.homeScore !== null));
  const view =
    sp.view === "standings" || sp.view === "schedule"
      ? sp.view
      : finished
        ? "standings"
        : "schedule";

  // A team the reader picked, if it is actually in this division.
  const team = teams.find((t) => t.teamId === sp.team) ?? null;

  const teamMatches = team
    ? matches.filter(
        (m) => m.homeTeamId === team.teamId || m.awayTeamId === team.teamId,
      )
    : matches;

  const days = byMatchday(teamMatches, tz);
  const day = sp.day ?? currentMatchday(days, new Date(), tz) ?? "";
  /*
   * A chosen team shows its whole season, not one matchday of it. "When does
   * my team play" is a question about the fixture list, and answering it one
   * Saturday at a time makes the reader click through every week to find out.
   */
  const shownDays = team ? days : days.filter((d) => d.key === day);

  const href = (next: {
    view?: string;
    division?: string;
    team?: string | null;
    day?: string;
  }) => {
    const q = new URLSearchParams();
    const vw = next.view ?? view;
    if (vw !== (finished ? "standings" : "schedule")) q.set("view", vw);
    const dv = next.division ?? division?.id;
    if (dv) q.set("division", dv);
    /*
     * Changing division drops the team and the day. A team belongs to one
     * division and a matchday in one age group is rarely a matchday in
     * another, so carrying either across lands the reader on nothing.
     */
    if (next.division === undefined) {
      const tm = next.team === null ? undefined : (next.team ?? team?.teamId);
      if (tm) q.set("team", tm);
      const dy = next.day ?? (next.team === undefined ? sp.day : undefined);
      if (dy) q.set("day", dy);
    }
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
        Schedule and standings
      </h1>

      {divisions.length > 1 && division && (
        <DivisionPicker
          value={division.id}
          options={divisions.map((d) => ({
            id: d.id,
            label: d.label ?? d.name,
            href: href({ division: d.id }),
          }))}
        />
      )}

      {/* Schedule or standings, then which division, then which team — the
          order a reader narrows in, and the order GotSport puts them in. */}
      <nav aria-label="View" className="mt-4 inline-flex rounded-lg border border-line bg-elevated p-0.5 text-sm">
        {(["schedule", "standings"] as const).map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            aria-current={v === view ? "page" : undefined}
            className={
              v === view
                ? "rounded-md bg-card px-3.5 py-1.5 font-medium capitalize text-ink shadow-sm"
                : "rounded-md px-3.5 py-1.5 capitalize text-muted transition-colors hover:text-ink"
            }
          >
            {v}
          </Link>
        ))}
      </nav>

      {teams.length > 1 && (
        <nav aria-label="Teams" className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={href({ team: null })}
            aria-current={team ? undefined : "page"}
            className={team ? off : on}
          >
            All teams
          </Link>
          {teams
            .slice()
            .sort((a, b) => (a.team?.name ?? "").localeCompare(b.team?.name ?? ""))
            .map((t) => (
              <Link
                key={t.teamId}
                href={href({ team: t.teamId })}
                aria-current={t.teamId === team?.teamId ? "page" : undefined}
                className={`${t.teamId === team?.teamId ? on : off} inline-flex items-center gap-1.5`}
              >
                <TeamCrest src={t.team?.crestUrl} size={14} />
                {t.team?.name}
              </Link>
            ))}
        </nav>
      )}

      {teams.length === 0 ? (
        <p className="mt-8 text-muted">No teams in this division yet.</p>
      ) : view === "standings" ? (
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
          const teamOf = (id: string) =>
            bracketTeams.find((t) => t.teamId === id)?.team ?? null;

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
                      <tr
                        key={r.teamId}
                        className={
                          r.teamId === team?.teamId
                            ? "border-b border-line bg-brand-soft/40"
                            : "border-b border-line"
                        }
                      >
                        <td className="py-2">
                          <span className="mr-2 tabular-nums text-muted">
                            {i + 1}
                          </span>
                          <span className="inline-flex items-center gap-2 align-middle">
                            <TeamCrest src={teamOf(r.teamId)?.crestUrl} size={18} />
                            {teamOf(r.teamId)?.name ?? "—"}
                          </span>
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
      ) : days.length === 0 ? (
        <p className="mt-8 text-muted">No fixtures yet.</p>
      ) : (
        <section className="mt-6">
          {/* Matchday tabs are for browsing a season. With one team picked the
              whole fixture list is shown instead, so there is nothing to tab
              between. */}
          {!team && (
            <nav aria-label="Matchdays" className="flex flex-wrap gap-1.5">
              {days.map((d) => (
                <Link
                  key={d.key || "tbd"}
                  href={href({ day: d.key })}
                  aria-current={d.key === day ? "page" : undefined}
                  className={d.key === day ? on : off}
                >
                  {shortDay(d.key, tz)}
                </Link>
              ))}
            </nav>
          )}

          {shownDays.map((sd) => (
              <div key={sd.key || "tbd"}>
                <h3 className="mt-5 text-sm font-medium">
                  {fmtDay(sd.key, tz)}
                </h3>
                <ul className="mt-2 divide-y divide-line">
                  {sd.matches.map((m) => (
                    <li key={m.id} className="py-3 text-sm">
                      {/* Where and when leads, then who is playing. Pushed to
                          the right it was the last thing read on a wide screen
                          and the second line on a narrow one, which is the
                          wrong way round for a parent working out which pitch
                          to walk to. */}
                      <div className="text-xs text-muted">
                        {[
                          m.groupLabel ? `Bracket ${m.groupLabel}` : null,
                          [fmtTime(m.kickoffAt, tz), m.field]
                            .filter(Boolean)
                            .join(" · "),
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      </div>
                      {/* Three columns, so the score sits in the same place on
                          every row. Wrapped in a flex row the score drifted
                          with the length of the home team's name, and a column
                          of fixtures could not be scanned down — which is the
                          one thing a schedule is for. Home reads toward the
                          score and away away from it, so the crests form two
                          columns either side of it. */}
                      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 font-medium">
                        <span className="flex items-center justify-end gap-2 text-right">
                          {m.homeTeam?.name ?? m.homePlaceholder ?? "TBD"}
                          <TeamCrest src={m.homeTeam?.crestUrl} size={18} />
                        </span>
                        <span className="min-w-14 text-center tabular-nums text-muted">
                          {m.homeScore !== null && m.awayScore !== null
                            ? `${m.homeScore} – ${m.awayScore}`
                            : "v"}
                        </span>
                        <span className="flex items-center gap-2">
                          <TeamCrest src={m.awayTeam?.crestUrl} size={18} />
                          {m.awayTeam?.name ?? m.awayPlaceholder ?? "TBD"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
          ))}
        </section>
      )}
    </div>
  );
}
