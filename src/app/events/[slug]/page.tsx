import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { DiscussionThread } from "@/features/discussion/thread";
import { OpponentSection } from "@/features/events/opponent-section";
import { getEventBySlug, type EventDetail } from "@/features/events/queries";
import { managedEntry } from "@/features/tournaments/roster-queries";
import {
  computeStandings,
  rankStandings,
  type StandingRow,
  type StandingsConfig,
} from "@/features/tournaments/standings";

export const dynamic = "force-dynamic";

type Champion = { division: string; champion: string; finalist: string; finalScore: string };
type Sponsor = { name: string; url: string | null; tier: string };
type Rules = {
  gameFormat: string;
  advancement: string;
  roster: string;
  tiebreakers: string[];
  goalCapPerGame?: number;
};

type TeamMeta = Map<string, { name: string; seed: number | null }>;

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [event, user] = await Promise.all([getEventBySlug(slug), getCurrentUser()]);
  if (!event) notFound();

  const canManage =
    !!user && (event.organizerId === user.id || isAdmin(user));
  const notPublic = event.status === "pending" || event.status === "cancelled";
  if (notPublic && !canManage) notFound();

  const champions = (event.result as { champions?: Champion[] } | null)?.champions ?? [];
  const meta = event.metadata as { sponsors?: Sponsor[]; rules?: Rules } | null;
  const sponsors = meta?.sponsors ?? [];
  const rules = meta?.rules;
  const hasRoster = event.modules.includes("roster");
  const myEntry =
    user && hasRoster ? await managedEntry(event.id, user.id) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/events" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← All events
      </Link>

      {notPublic && canManage && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          {event.status === "pending"
            ? "This event is awaiting review — only you can see it."
            : "This event was declined."}
        </p>
      )}

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
            {event.kind}
          </span>
          <span>{event.status}</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
        {event.titleZh && (
          <p className="mt-1 text-lg text-neutral-500">{event.titleZh}</p>
        )}
        {event.summary && <p className="mt-3 text-neutral-600 dark:text-neutral-300">{event.summary}</p>}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Date</dt>
          <dd>{fmtDate(event.startsAt, event.timezone)}</dd>
          {event.venue && (
            <>
              <dt className="text-neutral-500">Venue</dt>
              <dd>
                {event.venue.mapUrl ? (
                  <a href={event.venue.mapUrl} className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {event.venue.name}
                  </a>
                ) : (
                  event.venue.name
                )}
                {event.venue.address && (
                  <span className="text-neutral-500">
                    {" — "}
                    {event.venue.address}, {event.venue.city}
                  </span>
                )}
              </dd>
            </>
          )}
          {event.host && (
            <>
              <dt className="text-neutral-500">Host</dt>
              <dd>{event.host}</dd>
            </>
          )}
          {event.format && (
            <>
              <dt className="text-neutral-500">Format</dt>
              <dd>{event.format}</dd>
            </>
          )}
        </dl>
        {event.venue?.notes && (
          <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {event.venue.notes}
          </p>
        )}
      </header>

      <OpponentSection event={event} />

      {champions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Champions</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {champions.map((c) => (
              <div key={c.division} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="text-xs uppercase tracking-wide text-neutral-500">{c.division}</div>
                <div className="mt-1 font-semibold">🏆 {c.champion}</div>
                <div className="text-sm text-neutral-500">
                  def. {c.finalist} ({c.finalScore})
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {myEntry && (
        <p className="mt-8 text-sm">
          <Link
            href={`/events/${event.slug}/roster`}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Submit {myEntry.teamName}&rsquo;s roster →
          </Link>
        </p>
      )}

      {event.divisions.length > 0 && (
        <p className="mt-8 text-sm text-neutral-500">
          Organizer tools:{" "}
          <Link
            href={`/events/${event.slug}/print/check-in`}
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            check-in sheet
          </Link>{" "}
          ·{" "}
          <Link
            href={`/events/${event.slug}/print/score-cards`}
            className="text-emerald-700 hover:underline dark:text-emerald-400"
          >
            referee score cards
          </Link>
        </p>
      )}

      {event.divisions.map((division) => (
        <DivisionBlock
          key={division.id}
          division={division}
          event={event}
          config={{
            goalCap: rules?.goalCapPerGame,
            tiebreakers: rules?.tiebreakers,
          }}
        />
      ))}

      {rules && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Rules</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Format</dt>
              <dd>{rules.gameFormat}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Advancement</dt>
              <dd>{rules.advancement}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Roster</dt>
              <dd>{rules.roster}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Tiebreakers</dt>
              <dd>{rules.tiebreakers.join(" → ").replace(/_/g, " ")}</dd>
            </div>
          </dl>
        </section>
      )}

      {sponsors.length > 0 && (
        <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sponsors</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sponsors.map((s) => (
              <li key={s.name}>
                {s.url ? (
                  <a href={s.url} className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <DiscussionThread
        subjectType="event"
        subjectId={event.id}
        revalidate={`/events/${event.slug}`}
        canModerate={canManage}
      />
    </div>
  );
}

function DivisionBlock({
  division,
  event,
  config,
}: {
  division: EventDetail["divisions"][number];
  event: EventDetail;
  config: StandingsConfig;
}) {
  const teamsInDiv = event.eventTeams.filter((et) => et.divisionId === division.id);
  const knockouts = event.matches.filter(
    (m) => m.divisionId === division.id && m.stage === "ko",
  );

  const teamMeta: TeamMeta = new Map(
    teamsInDiv.map((et) => [et.team.id, { name: et.team.name, seed: et.seed }]),
  );

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
    const table = computeStandings(groupMatches, ids, config);
    return { label, ranked: rankStandings([...table.values()], groupMatches, config) };
  });

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">
        {division.label ?? division.name}
        {division.birthYears.length > 0 && (
          <span className="ml-2 text-sm font-normal text-neutral-500">
            born {division.birthYears.join("/")}
          </span>
        )}
      </h2>

      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {groupLabels.length > 1 && (
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Group {group.label}
              </div>
            )}
            <StandingsTable rows={group.ranked} teamMeta={teamMeta} />
          </div>
        ))}
      </div>

      {knockouts.length > 0 && (
        <div className="mt-4 space-y-1 text-sm">
          {knockouts.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-14 text-xs uppercase tracking-wide text-neutral-400">
                {m.round}
              </span>
              <span className="flex-1 text-right">{m.homeTeam?.name ?? m.homePlaceholder}</span>
              <span className="font-semibold tabular-nums">
                {m.homeScore}–{m.awayScore}
              </span>
              <span className="flex-1">{m.awayTeam?.name ?? m.awayPlaceholder}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StandingsTable({
  rows,
  teamMeta,
}: {
  rows: StandingRow[];
  teamMeta: TeamMeta;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">Team</th>
            <th className="px-2 py-1.5 text-right font-medium">P</th>
            <th className="px-2 py-1.5 text-right font-medium">W</th>
            <th className="px-2 py-1.5 text-right font-medium">D</th>
            <th className="px-2 py-1.5 text-right font-medium">L</th>
            <th className="px-2 py-1.5 text-right font-medium">GF</th>
            <th className="px-2 py-1.5 text-right font-medium">GA</th>
            <th className="py-1.5 pl-2 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const meta = teamMeta.get(row.teamId);
            return (
              <tr key={row.teamId} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1.5 pr-2 text-neutral-400">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  {meta?.seed === 1 && "🏆 "}
                  {meta?.name ?? "—"}
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
