import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/features/auth";
import { canManageEvent } from "@/features/events/can-manage";
import { AddMatchForm } from "@/features/tournaments/add-match-form";
import { AddTeamForm } from "@/features/tournaments/add-team-form";
import { MatchScoreRow } from "@/features/tournaments/match-score-row";
import {
  addMatch,
  addTeamToEvent,
  deleteMatch,
  saveMatch,
} from "@/features/tournaments/score-actions";
import { getEventForScoring } from "@/features/tournaments/score-queries";

export const dynamic = "force-dynamic";

function hhmm(d: Date | null, tz: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz ?? undefined,
  }).format(d);
}

export default async function ScoresPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUser(`/events/${slug}/scores`);
  if (!(await canManageEvent({ slug }))) notFound();

  const event = await getEventForScoring(slug);
  if (!event) notFound();

  const allTeams = event.eventTeams.map((et) => et.team);
  const teamsByDivision: Record<string, { id: string; name: string }[]> = {};
  for (const et of event.eventTeams) {
    const key = et.division?.id ?? "none";
    (teamsByDivision[key] ??= []).push(et.team);
  }

  const groups: { id: string; name: string; label: string | null }[] =
    event.divisions.length > 0
      ? event.divisions.map((d) => ({ id: d.id, name: d.name, label: d.label }))
      : [{ id: "none", name: "Matches", label: null }];

  const matchesByGroup = new Map<string, typeof event.matches>();
  for (const m of event.matches) {
    const key = event.divisions.length > 0 ? (m.division?.id ?? "none") : "none";
    const list = matchesByGroup.get(key) ?? [];
    list.push(m);
    matchesByGroup.set(key, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/events/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Scores</h1>
      <p className="mt-1 text-sm text-muted">
        Enter results as games finish. Standings recompute automatically; the
        public feed (kingjuancup.org) refreshes within ~30 seconds.
      </p>

      <details className="mt-6 rounded-lg border border-dashed border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Teams ({event.eventTeams.length})
        </summary>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
          {event.eventTeams.map((et) => (
            <li key={et.id}>
              {et.team.name}
              <span className="text-xs text-muted">
                {" "}
                {et.division?.name}
                {et.groupLabel ? ` G${et.groupLabel}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <AddTeamForm action={addTeamToEvent.bind(null, slug)} divisions={groups} />
      </details>

      {groups.map((division) => {
        const matches = (matchesByGroup.get(division.id) ?? []).slice().sort((a, b) => {
          const at = a.kickoffAt?.getTime() ?? 0;
          const bt = b.kickoffAt?.getTime() ?? 0;
          return (
            Number(a.stage === "ko") - Number(b.stage === "ko") ||
            at - bt ||
            (a.field ?? "").localeCompare(b.field ?? "")
          );
        });
        const divTeams = teamsByDivision[division.id] ?? allTeams;

        return (
          <section key={division.id} className="mt-8">
            <h2 className="text-lg font-semibold">
              {division.label ?? division.name}
            </h2>
            {matches.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No matches yet.</p>
            ) : (
              <div className="mt-2">
                {matches.map((m) => (
                  <MatchScoreRow
                    key={m.id}
                    action={saveMatch.bind(null, slug, m.id)}
                    deleteAction={deleteMatch.bind(null, slug, m.id)}
                    meta={`${hhmm(m.kickoffAt, event.timezone)} · ${m.field ?? "—"} · ${
                      m.stage === "ko" ? (m.round ?? "ko") : `G${m.groupLabel ?? "?"}`
                    }`}
                    home={m.homeTeam}
                    away={m.awayTeam}
                    homePlaceholder={m.homePlaceholder}
                    awayPlaceholder={m.awayPlaceholder}
                    homeScore={m.homeScore}
                    awayScore={m.awayScore}
                    status={m.status}
                    divisionTeams={divTeams}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <AddMatchForm
        action={addMatch.bind(null, slug)}
        divisions={groups}
        teamsByDivision={
          Object.keys(teamsByDivision).length > 0
            ? teamsByDivision
            : { none: allTeams }
        }
      />
    </div>
  );
}
