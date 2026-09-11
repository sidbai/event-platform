import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import type { EventDetail } from "@/features/events/queries";
import { safeSourceUrl } from "@/features/events/listing";
import { syncNote } from "@/features/sync/freshness";
import { SubscribeLink } from "@/features/calendar/subscribe-link";
import { PROVIDER_POLICIES } from "@/features/sync/policy";


import { NavSelect } from "@/components/nav-select";
import { timeAnnounced, whereAnnounced } from "@/features/events/kickoff";

import {
  byCluster,
  byMatchday,
  byWeek,
  currentMatchday,
  currentWeek,
  hasWeeks,
} from "./matchdays";
import { crestOf } from "@/features/teams/crest";
import {
  computeStandings,
  POINTS_SYSTEMS,
  rankStandings,
  type StandingRow,
  type StandingsConfig,
} from "./standings";

/**
 * The fixtures and the table, on the event's own page.
 *
 * This used to be a page of its own, which meant the thing a parent came for
 * — when does my team play — was a click behind a link they had to notice. A
 * tournament page that does not show its own schedule is a poster for a
 * tournament, not the tournament.
 *
 * One division at a time. A club tournament carries thirty-odd flights, and
 * thirty-odd standings tables stacked down the page is not a page anyone
 * reads; "All divisions" is there for whoever actually wants that.
 */

export type ScheduleParams = {
  view?: string;
  division?: string;
  team?: string;
  day?: string;
  /** What an import that ran on creation did, or why it did not. */
  imported?: string;
  import?: string;
};

/** The division dropdown's value for "do not narrow to one". */
export const ALL_DIVISIONS = "all";

/**
 * Past this many rounds the chips become a dropdown.
 *
 * Six is a long weekend at the top end and well short of any season. The
 * number only decides which control is drawn, so a tournament that lands
 * just over it gets a dropdown rather than a wrong answer.
 */
const MANY_ROUNDS = 6;

/** "Week 5", or the days it is played over where there is no week. */
function fmtGroup(key: string, timeZone: string, numbered: boolean, through?: string) {
  if (numbered) return key ? `Week ${key}` : "Round to be confirmed";
  const first = fmtDay(key, timeZone);
  if (!through || through === key) return first;
  /*
   * The range, and not a number for it. Which round a league calls this is
   * something only the league knows, and a "Week 19" that disagrees with its
   * own page is worse than no number — somebody would take ours and go and
   * check.
   */
  return `${first} – ${fmtDay(through, timeZone)}`;
}

function shortGroup(key: string, timeZone: string, numbered: boolean, through?: string) {
  if (numbered) return key ? `W${key}` : "TBD";
  const first = shortDay(key, timeZone);
  if (!through || through === key) return first;
  return `${first}–${shortDay(through, timeZone)}`;
}

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

function shortDay(key: string, timeZone: string) {
  if (!key) return "TBD";
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * The kickoff, with its day where the heading covers more than one.
 *
 * A league round is played over a Saturday and a Sunday, and under a heading
 * reading "Saturday, September 26 – Sunday, September 27" a row saying only
 * "11:00 AM" does not say which of them it is. Left off where the heading is
 * a single day, since there it would repeat what is already above.
 */
function fmtTime(d: Date | null, timeZone: string, withDay = false) {
  if (!d) return "Time TBD";
  /*
   * A league publishes its season before it has times, and a fixture with no
   * time arrives as the date at midnight — which we were printing as
   * "12:00 AM", our own placeholder in the clothes of a fact.
   *
   * The day is still worth saying where the heading covers two of them.
   */
  if (!timeAnnounced(d, timeZone)) {
    if (!withDay) return "Time TBD";
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone,
    }).format(d);
    return `${day}, time TBD`;
  }
  return new Intl.DateTimeFormat("en-US", {
    ...(withDay ? { weekday: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

const pill = "rounded-full px-2.5 py-1 text-xs";
const on = `${pill} bg-ink text-page`;
const off = `${pill} bg-elevated text-muted hover:bg-line`;

export function ScheduleSection({
  event,
  sp,
  config,
}: {
  event: EventDetail;
  sp: ScheduleParams;
  config: StandingsConfig;
}) {
  const divisions = event.divisions;
  // Nothing to show for a kickabout with no divisions and no fixtures.
  if (divisions.length === 0 && event.matches.length === 0) return null;

  const tz = event.timezone ?? "America/Los_Angeles";

  const showAll = sp.division === ALL_DIVISIONS;
  const division = showAll
    ? null
    : (divisions.find((d) => d.id === sp.division) ?? divisions[0] ?? null);

  const teams = event.eventTeams.filter(
    (et) => !division || et.divisionId === division.id,
  );
  const matches = event.matches.filter(
    (m) => !division || m.divisionId === division.id,
  );

  /*
   * Which half opens depends on whether the thing has finished. A running
   * tournament is asked "when do we play"; a finished one is asked "who won".
   */
  const finished =
    event.status === "completed" ||
    (matches.length > 0 && matches.every((m) => m.homeScore !== null));
  const view =
    sp.view === "standings" || sp.view === "schedule"
      ? sp.view
      : finished
        ? "standings"
        : "schedule";

  const team = teams.find((t) => t.team.id === sp.team) ?? null;
  const teamMatches = team
    ? matches.filter(
        (m) => m.homeTeamId === team.team.id || m.awayTeamId === team.team.id,
      )
    : matches;

  /*
   * By round where the league counts in rounds, and by date otherwise.
   *
   * The two are not the same list. A round spread over Saturday and Sunday is
   * one week and two matchdays; a game postponed for weather is played a
   * fortnight after the round it belongs to, and by date it turns up alone
   * under a heading in the middle of the season with nothing to say what it
   * was. A tournament has no rounds at all and reads by the day it is played,
   * which is what this always did.
   */
  const numbered = hasWeeks(teamMatches);
  /*
   * A league whose source publishes no rounds is read by the dates instead,
   * with days that run into each other treated as one round — a Saturday and
   * a Sunday are one weekend of football and split apart they are two
   * headings with half a fixture list under each. Only a league: three days
   * running is one round to a league and three matchdays to a tournament,
   * which is what its day tabs are for.
   */
  const season = event.kind === "league";
  const days = numbered
    ? byWeek(teamMatches)
    : season
      ? byCluster(teamMatches, tz)
      : byMatchday(teamMatches, tz);
  const day =
    sp.day ??
    (numbered ? currentWeek(days, new Date()) : currentMatchday(days, new Date(), tz)) ??
    "";
  /*
   * A chosen team shows its whole season, not one matchday of it. "When does
   * my team play" is a question about the fixture list, and answering it one
   * Saturday at a time makes the reader click through every week.
   */
  const shownDays = team ? days : days.filter((d) => d.key === day);

  // `team: null` clears it, which `undefined` cannot say — undefined means
  // "leave whatever is there".
  const href = (next: {
    view?: string;
    division?: string;
    team?: string | null;
    day?: string;
  }) => {
    const q = new URLSearchParams();
    const vw = next.view ?? view;
    if (vw !== (finished ? "standings" : "schedule")) q.set("view", vw);
    const dv = next.division ?? sp.division;
    if (dv) q.set("division", dv);
    /*
     * Changing division drops the team and the day. A team belongs to one
     * division and a matchday in one age group is rarely a matchday in
     * another, so carrying either across lands the reader on nothing.
     */
    if (next.division === undefined) {
      const tm = next.team === null ? undefined : (next.team ?? team?.team.id);
      if (tm) q.set("team", tm);
      const dy = next.day ?? (next.team === undefined ? sp.day : undefined);
      if (dy) q.set("day", dy);
    }
    const s = q.toString();
    // The anchor, so picking a division does not bounce the reader back to
    // the top of a long event page to find where they were.
    return s ? `/events/${event.slug}?${s}#schedule` : `/events/${event.slug}#schedule`;
  };

  const inScope = showAll ? divisions : division ? [division] : [];

  /*
   * Where this came from, and how long ago.
   *
   * A schedule we copied is only as good as the last time we managed to read
   * it, and a page that hides that is worse than one with no schedule: a
   * parent trusts a fixture list precisely because it looks authoritative. The
   * link goes with it — ours is the readable copy, theirs is the one that
   * settles an argument about a kick-off time.
   */
  const note = syncNote(event, new Date());
  const source = safeSourceUrl(event.scheduleUrl);
  const platform = event.sourcePlatform
    ? (PROVIDER_POLICIES[event.sourcePlatform as keyof typeof PROVIDER_POLICIES]?.label ??
      null)
    : null;

  return (
    <section id="schedule" className="mt-10 scroll-mt-4">
      <h2 className="text-lg font-semibold">Schedule and standings</h2>
      {/*
        Beside the freshness note rather than at the foot of a schedule that
        can run to four thousand fixtures — somebody who wants this wants it
        before they start scrolling, not after.
      */}
      <SubscribeLink path={`/events/${event.slug}/fixtures.ics`} what="this schedule" />

      {note && (
        <p className={`mt-1 text-xs ${note.stale ? "text-amber-700" : "text-muted"}`}>
          {note.text}
          {source && (
            <>
              {" · "}
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-text hover:underline"
              >
                {platform ? `View on ${platform}` : "View the original"} ↗
              </a>
            </>
          )}
        </p>
      )}

      {divisions.length > 1 && (
        <NavSelect
          label="Division"
          value={showAll ? ALL_DIVISIONS : (division?.id ?? ALL_DIVISIONS)}
          options={[
            ...divisions.map((d) => ({
              id: d.id,
              label: d.label ?? d.name,
              href: href({ division: d.id }),
            })),
            // Last, not first: it is the answer to "show me everything", which
            // is a rarer question than "show me my child's age group".
            {
              id: ALL_DIVISIONS,
              label: "All divisions",
              href: href({ division: ALL_DIVISIONS }),
            },
          ]}
        />
      )}

      <nav
        aria-label="View"
        className="mt-4 inline-flex rounded-lg border border-line bg-elevated p-0.5 text-sm"
      >
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

      {/* Only within one division. Across all of them it is a wall of names
          nobody scans, and the division dropdown is the way in. */}
      {!showAll && teams.length > 1 && (
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
            .sort((a, b) => a.team.name.localeCompare(b.team.name))
            .map((t) => (
              <Link
                key={t.team.id}
                href={href({ team: t.team.id })}
                aria-current={t.team.id === team?.team.id ? "page" : undefined}
                className={`${t.team.id === team?.team.id ? on : off} inline-flex items-center gap-1.5`}
              >
                <TeamCrest src={crestOf(t.team)} size={14} />
                {t.team.name}
              </Link>
            ))}
        </nav>
      )}

      {view === "standings" ? (
        inScope.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No divisions yet.</p>
        ) : (
          inScope.map((d) => (
            <DivisionStandings
              key={d.id}
              division={d}
              event={event}
              config={config}
              // With one division picked its name is already in the dropdown
              // above; repeating it as a heading says nothing.
              showHeading={showAll}
              highlightTeamId={team?.team.id ?? null}
            />
          ))
        )
      ) : days.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No fixtures yet.</p>
      ) : (
        <div className="mt-4">
          {/*
            Chips for a weekend, a dropdown for a season.
            
            A tournament has two or three matchdays and they read at a glance.
            A league has twenty-odd, and as chips they are a wall of dates
            above the fixtures somebody came for — the same reason the division
            picker beside them is a dropdown. The labels are the wide kind
            here, "Sep 12 – Sep 13" rather than a number, which is what makes
            the wall.
          */}
          {!team &&
            (days.length > MANY_ROUNDS ? (
              <NavSelect
                className="mb-1"
                label={numbered ? "Week" : "Matchday"}
                value={day}
                options={days.map((d) => ({
                  id: d.key,
                  label: fmtGroup(d.key, tz, numbered, d.through),
                  href: href({ day: d.key }),
                }))}
              />
            ) : (
              <nav
                aria-label={numbered ? "Weeks" : "Matchdays"}
                className="flex flex-wrap gap-1.5"
              >
                {days.map((d) => (
                  <Link
                    key={d.key || "tbd"}
                    href={href({ day: d.key })}
                    aria-current={d.key === day ? "page" : undefined}
                    className={d.key === day ? on : off}
                  >
                    {shortGroup(d.key, tz, numbered, d.through)}
                  </Link>
                ))}
              </nav>
            ))}

          {shownDays.map((sd) => (
            <div key={sd.key || "tbd"}>
              <h3 className="mt-5 text-sm font-medium">
                {fmtGroup(sd.key, tz, numbered, sd.through)}
              </h3>
              <ul className="mt-2 divide-y divide-line">
                {sd.matches.map((m) => (
                  <li key={m.id} className="py-3 text-sm">
                    {/* Where and when leads, then who is playing: the first
                        thing a parent needs is which pitch to walk to. */}
                    <div className="text-xs text-muted">
                      {[
                        showAll ? (m.division?.label ?? m.division?.name) : null,
                        m.groupLabel ? `Bracket ${m.groupLabel}` : null,
                        [
                          fmtTime(m.kickoffAt, tz, sd.through !== undefined),
                          whereAnnounced(m.venue, m.field),
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </div>
                    {/* Three columns, so the score sits in the same place on
                        every row and a column of fixtures can be scanned. */}
                    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 font-medium">
                      <span className="flex items-center justify-end gap-2 text-right">
                        <TeamLink team={m.homeTeam} fallback={m.homePlaceholder} />
                        <TeamCrest src={crestOf(m.homeTeam)} size={18} />
                      </span>
                      <span className="min-w-14 text-center tabular-nums text-muted">
                        {m.homeScore !== null && m.awayScore !== null
                          ? `${m.homeScore} – ${m.awayScore}`
                          : "v"}
                      </span>
                      <span className="flex items-center gap-2">
                        <TeamCrest src={crestOf(m.awayTeam)} size={18} />
                        <TeamLink team={m.awayTeam} fallback={m.awayPlaceholder} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A team's name on a fixture, as a way into that team's own page.
 *
 * These rows are the biggest surface on the site — a couple of thousand of
 * them — and every name was flat text, so a parent reading their child's
 * Saturday fixture had no route to the team's record or its other
 * tournaments. A placeholder for a final nobody has qualified for yet stays
 * flat, because there is nothing behind it to reach.
 */
function TeamLink({
  team,
  fallback,
}: {
  team: { name: string; slug?: string | null } | null;
  fallback: string | null;
}) {
  if (!team) return <>{fallback ?? "TBD"}</>;
  if (!team.slug) return <>{team.name}</>;
  return (
    <Link href={`/teams/${team.slug}`} className="hover:underline">
      {team.name}
    </Link>
  );
}

type TeamMeta = Map<
  string,
  { name: string; seed: number | null; crestUrl: string | null }
>;

/** One division's tables, a bracket at a time, and its knockout rounds. */
function DivisionStandings({
  division,
  event,
  config,
  showHeading,
  highlightTeamId,
}: {
  division: EventDetail["divisions"][number];
  event: EventDetail;
  config: StandingsConfig;
  showHeading: boolean;
  highlightTeamId: string | null;
}) {
  const teamsInDiv = event.eventTeams.filter((et) => et.divisionId === division.id);
  const knockouts = event.matches.filter(
    (m) => m.divisionId === division.id && m.stage === "ko",
  );

  const teamMeta: TeamMeta = new Map(
    teamsInDiv.map((et) => [
      et.team.id,
      { name: et.team.name, seed: et.seed, crestUrl: crestOf(et.team) },
    ]),
  );

  /*
   * Whose arithmetic this is.
   *
   * Computing a table from results is right for an event we run — they are
   * our rules. For somebody else's tournament it is a guess: three points a
   * win, goal difference capped at six, our tiebreaker order. A tournament
   * that awards a bonus for a shutout produces a different table from the
   * same results, and ours would be wrong in a way nobody on the page could
   * see. So when the organizer's own table has been brought in, that is the
   * one to show — and either way the page says which it is holding.
   */
  const official = teamsInDiv.some((et) => et.points > 0 || et.played > 0);

  const groupLabels = [...new Set(teamsInDiv.map((et) => et.groupLabel ?? ""))].sort();
  const groups = groupLabels.map((label) => {
    const ids = teamsInDiv
      .filter((et) => (et.groupLabel ?? "") === label)
      .map((et) => et.team.id);
    const groupMatches = event.matches
      .filter(
        (m) =>
          m.divisionId === division.id &&
          m.stage === "group" &&
          (m.groupLabel ?? "") === label &&
          m.homeTeamId != null &&
          m.awayTeamId != null,
      )
      .map((m) => ({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      }));
    if (official) {
      // Their order, kept as published — it encodes their tiebreakers, which
      // is the whole reason for preferring their table over ours.
      const ranked = teamsInDiv
        .filter((et) => ids.includes(et.team.id))
        .sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga))
        .map((et) => ({
          teamId: et.team.id,
          played: et.played,
          won: et.won,
          drawn: et.drawn,
          lost: et.lost,
          gf: et.gf,
          ga: et.ga,
          gd: et.gf - et.ga,
          points: et.points,
          /*
           * The capped figures exist so our own tiebreakers can clamp a 9–0
           * without rewarding it. An imported table has already been ordered
           * by whoever published it, so nothing here re-sorts on them — they
           * carry the plain numbers rather than pretending to a cap we did
           * not apply.
           */
          capGf: et.gf,
          capGa: et.ga,
          capGd: et.gf - et.ga,
        }));
      return { label, ranked };
    }

    const table = computeStandings(groupMatches, ids, config);
    return { label, ranked: rankStandings([...table.values()], groupMatches, config) };
  });

  if (teamsInDiv.length === 0) return null;

  return (
    <div className="mt-6">
      {showHeading && (
        <h3 className="text-base font-semibold">
          {division.label ?? division.name}
          {division.birthYears.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">
              born {division.birthYears.join("/")}
            </span>
          )}
        </h3>
      )}

      {/* Said plainly, because a table is the most authoritative-looking
          thing on a page and a reader has no way to tell one from the other. */}
      <p className="mt-1 text-xs text-muted">
        {official ? (
          "The organizer's own table."
        ) : (
          <>
            Worked out from the results here — the organizer&rsquo;s own table may
            order it differently.{" "}
            {/* Which arithmetic, in the organizer's own terms. A ten-point
                table and a three-point one differ by more than the numbers in
                the column, and a coach checking whether we got it right needs
                to see the rule we used. */}
            {POINTS_SYSTEMS[config.system ?? "standard"].describe}
          </>
        )}
      </p>

      <div className="mt-2 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {groupLabels.length > 1 && (
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Bracket {group.label}
              </div>
            )}
            <StandingsTable
              rows={group.ranked}
              teamMeta={teamMeta}
              highlightTeamId={highlightTeamId}
            />
          </div>
        ))}
      </div>

      {knockouts.length > 0 && (
        <div className="mt-4 space-y-1.5 text-sm">
          {knockouts.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-muted">
                {m.round}
              </span>
              <span className="flex flex-1 items-center justify-end gap-1.5 text-right">
                {m.homeTeam?.name ?? m.homePlaceholder}
                <TeamCrest src={crestOf(m.homeTeam)} size={18} />
              </span>
              <span className="font-semibold tabular-nums">
                {m.homeScore}–{m.awayScore}
              </span>
              <span className="flex flex-1 items-center gap-1.5">
                <TeamCrest src={crestOf(m.awayTeam)} size={18} />
                {m.awayTeam?.name ?? m.awayPlaceholder}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StandingsTable({
  rows,
  teamMeta,
  highlightTeamId,
}: {
  rows: StandingRow[];
  teamMeta: TeamMeta;
  highlightTeamId: string | null;
}) {
  return (
    // Nine columns will not fit a phone, so the table scrolls in its own box
    // rather than widening the page around it.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">Team</th>
            {["P", "W", "D", "L", "GF", "GA"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-right font-medium">
                {h}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const meta = teamMeta.get(row.teamId);
            return (
              <tr
                key={row.teamId}
                className={
                  row.teamId === highlightTeamId
                    ? "border-b border-line bg-brand-soft/40"
                    : "border-b border-line"
                }
              >
                <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    <TeamCrest src={meta?.crestUrl} size={20} />
                    <span>
                      {meta?.seed === 1 && "🏆 "}
                      {meta?.name ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">{row.played}</td>
                <td className="px-2 py-1.5 text-right">{row.won}</td>
                <td className="px-2 py-1.5 text-right">{row.drawn}</td>
                <td className="px-2 py-1.5 text-right">{row.lost}</td>
                <td className="px-2 py-1.5 text-right">{row.gf}</td>
                <td className="px-2 py-1.5 text-right">{row.ga}</td>
                <td className="py-1.5 pl-2 text-right font-semibold">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
