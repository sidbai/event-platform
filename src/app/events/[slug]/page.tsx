import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { AttendanceSection } from "@/features/attendance/section";
import { canViewEvent } from "@/features/events/can-view";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: "Event not found" };
  const desc =
    event.summary ??
    [event.kind, event.ageGroup, event.venue?.name].filter(Boolean).join(" · ");
  return {
    title: event.title,
    description: desc,
    openGraph: { title: event.title, description: desc },
  };
}

type Champion = { division: string; champion: string; finalist: string; finalScore: string };
type Sponsor = { name: string; url: string | null; tier: string };
type Rules = {
  gameFormat: string;
  advancement: string;
  roster: string;
  tiebreakers: string[];
  goalCapPerGame?: number;
};

type TeamMeta = Map<
  string,
  { name: string; seed: number | null; crestUrl: string | null }
>;

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
  if (!(await canViewEvent(event, user))) notFound();
  const notPublic = event.status === "pending" || event.status === "cancelled";

  const champions = (event.result as { champions?: Champion[] } | null)?.champions ?? [];
  const crestByName = new Map(
    event.eventTeams.map((et) => [et.team.name, et.team.crestUrl]),
  );
  const meta = event.metadata as { sponsors?: Sponsor[]; rules?: Rules } | null;
  const sponsors = meta?.sponsors ?? [];
  const rules = meta?.rules;
  const hasRoster = event.modules.includes("roster");
  const hasAttendance = event.modules.includes("attendance");
  const myEntry =
    user && hasRoster ? await managedEntry(event.id, user.id) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/events" className="text-sm text-brand-text hover:underline">
        ← All events
      </Link>

      {notPublic && canManage && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {event.status === "pending"
            ? "This event is awaiting review — only you can see it."
            : "This event was declined."}
        </p>
      )}

      {canManage && event.visibility !== "public" && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          <span>
            {event.visibility === "private"
              ? "Private — only you and the people you invite can see this."
              : "Unlisted — not in the events list, but anyone with the link can open it."}
          </span>
          <Link
            href={`/events/${event.slug}/invite`}
            className="font-medium text-brand-text hover:underline"
          >
            Invite people →
          </Link>
        </p>
      )}

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-brand-soft-text">
            {event.kind}
          </span>
          <span>{event.status}</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
        {event.titleZh && (
          <p className="mt-1 text-lg text-muted">{event.titleZh}</p>
        )}
        {event.summary && <p className="mt-3 text-muted">{event.summary}</p>}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Date</dt>
          <dd>{fmtDate(event.startsAt, event.timezone)}</dd>
          {event.venue && (
            <>
              <dt className="text-muted">Venue</dt>
              <dd>
                {event.venue.mapUrl ? (
                  <a href={event.venue.mapUrl} className="text-brand-text hover:underline">
                    {event.venue.name}
                  </a>
                ) : (
                  event.venue.name
                )}
                {event.venue.address && (
                  <span className="text-muted">
                    {" — "}
                    {event.venue.address}, {event.venue.city}
                  </span>
                )}
              </dd>
            </>
          )}
          {event.host && (
            <>
              <dt className="text-muted">Host</dt>
              <dd>{event.host}</dd>
            </>
          )}
          {event.format && (
            <>
              <dt className="text-muted">Format</dt>
              <dd>{event.format}</dd>
            </>
          )}
        </dl>
        {event.venue?.notes && (
          <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
            {event.venue.notes}
          </p>
        )}
      </header>

      <OpponentSection event={event} />

      {hasAttendance && (
        <AttendanceSection
          eventId={event.id}
          slug={event.slug}
          capacity={event.capacity}
        />
      )}

      {champions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Champions</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {champions.map((c) => (
              <div key={c.division} className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-muted">{c.division}</div>
                <div className="mt-1 flex items-center gap-2 font-semibold">
                  <TeamCrest src={crestByName.get(c.champion)} size={24} />
                  🏆 {c.champion}
                </div>
                <div className="text-sm text-muted">
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
            className="font-medium text-brand-text hover:underline"
          >
            Submit {myEntry.teamName}&rsquo;s roster →
          </Link>
        </p>
      )}

      {event.divisions.length > 0 && (
        <p className="mt-8 text-sm text-muted">
          Organizer tools:{" "}
          <Link
            href={`/events/${event.slug}/print/check-in`}
            className="text-brand-text hover:underline"
          >
            check-in sheet
          </Link>{" "}
          ·{" "}
          <Link
            href={`/events/${event.slug}/print/score-cards`}
            className="text-brand-text hover:underline"
          >
            referee score cards
          </Link>
          {canManage && (
            <>
              {" · "}
              <Link
                href={`/events/${event.slug}/scores`}
                className="font-medium text-brand-text hover:underline"
              >
                enter scores
              </Link>
            </>
          )}
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
              <dt className="text-muted">Format</dt>
              <dd>{rules.gameFormat}</dd>
            </div>
            <div>
              <dt className="text-muted">Advancement</dt>
              <dd>{rules.advancement}</dd>
            </div>
            <div>
              <dt className="text-muted">Roster</dt>
              <dd>{rules.roster}</dd>
            </div>
            <div>
              <dt className="text-muted">Tiebreakers</dt>
              <dd>{rules.tiebreakers.join(" → ").replace(/_/g, " ")}</dd>
            </div>
          </dl>
        </section>
      )}

      {sponsors.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Sponsors</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sponsors.map((s) => (
              <li key={s.name}>
                {s.url ? (
                  <a href={s.url} className="text-brand-text hover:underline">
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
    teamsInDiv.map((et) => [
      et.team.id,
      { name: et.team.name, seed: et.seed, crestUrl: et.team.crestUrl },
    ]),
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
          <span className="ml-2 text-sm font-normal text-muted">
            born {division.birthYears.join("/")}
          </span>
        )}
      </h2>

      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {groupLabels.length > 1 && (
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Group {group.label}
              </div>
            )}
            <StandingsTable rows={group.ranked} teamMeta={teamMeta} />
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
                <TeamCrest src={m.homeTeam?.crestUrl} size={18} />
              </span>
              <span className="font-semibold tabular-nums">
                {m.homeScore}–{m.awayScore}
              </span>
              <span className="flex flex-1 items-center gap-1.5">
                <TeamCrest src={m.awayTeam?.crestUrl} size={18} />
                {m.awayTeam?.name ?? m.awayPlaceholder}
              </span>
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
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
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
              <tr key={row.teamId} className="border-b border-line">
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
