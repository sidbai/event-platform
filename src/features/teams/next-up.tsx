import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { kickoffLabel, timeAnnounced } from "@/features/events/kickoff";

import type { Probs } from "@/features/predict/elo";
import { Odds } from "@/features/predict/odds";

import type { Outcome, Side } from "./preview";
import type { NextUp } from "./queries";

/**
 * The next game, and what both sides bring to it.
 *
 * A comparison first. Every figure is one both columns are measured by.
 * The one forecast on the page — the bar under the names — appears only
 * when both sides have enough results here for the model to have an opinion
 * (features/predict), because a number that looks like a forecast is read
 * as one. Most pairings still get none.
 *
 * Common opponents are the part worth reading. Two sides have played each
 * other 7.5% of the time here, but 80% of pairings share a third team — what
 * each did against the same opponent says more than either one's average, and
 * a parent can check it against a game they were at.
 */

const LETTER: Record<Outcome, string> = { won: "W", drawn: "D", lost: "L" };

function Form({ form }: { form: Outcome[] }) {
  if (form.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex justify-center gap-1">
      {form.map((outcome, i) => (
        <span
          key={i}
          className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-medium ${
            outcome === "won" ? "bg-brand-soft text-brand-soft-text" : "bg-elevated text-muted"
          }`}
          title={outcome}
        >
          {LETTER[outcome]}
        </span>
      ))}
    </span>
  );
}

function Row({
  label,
  ours,
  theirs,
}: {
  label: string;
  ours: React.ReactNode;
  theirs: React.ReactNode;
}) {
  return (
    <>
      <div className="text-center tabular-nums">{ours}</div>
      <div className="text-center text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-center tabular-nums">{theirs}</div>
    </>
  );
}

const played = (side: Side) => side.performance.played;

export function NextUpPanel({
  nextUp,
  odds,
  teamName,
  timezone,
  weAreHome = true,
}: {
  nextUp: NextUp;
  /** The model's forecast for the fixture, home side first, where it has one. */
  odds?: { probs: Probs; home: string; away: string } | null;
  teamName: string;
  timezone: string | null;
  /**
   * Which side of the fixture this team is. Everything in the panel reads
   * home on the left and away on the right, as a fixture is written, so a
   * reader comparing two team pages for the same game sees the same panel.
   */
  weAreHome?: boolean;
}) {
  const { opponent, preview, fixture, opponentNames } = nextUp;
  const { ours, theirs } = preview;
  const [left, right] = weAreHome ? [ours, theirs] : [theirs, ours];
  // A head-to-head score is kept from this team's side; the panel shows it
  // home first, so it is turned around when this team is away.
  const homeFirst = (h: { for: number; against: number }) => (weAreHome ? `${h.for}–${h.against}` : `${h.against}–${h.for}`);
  const us = <span className="font-medium">{teamName}</span>;
  const them = (
    <span className="flex items-center gap-2">
      <TeamCrest src={opponent.crestUrl} size={20} />
      <Link href={`/teams/${opponent.slug}`} className="font-medium hover:underline">
        {opponent.name}
      </Link>
    </span>
  );
  const tz = timezone ?? "America/Los_Angeles";
  /*
   * The day, and the time only where the organizer has given one. A league
   * that has published its season but not its times leaves the kick-off at
   * midnight, and "12:00 AM" reads as a fact rather than as the gap it is.
   */
  const when = kickoffLabel(fixture.kickoffAt, tz);
  /*
   * Still "next" for a while after kick-off — see NEXT_GRACE_MS — and said
   * so, because a parent on the touchline reading "Sat, 1:00 PM" at 1:40
   * would take the panel for one that has not noticed. Only when a time was
   * announced: a day-only fixture at midnight is not under way at 00:01.
   */
  const underWay =
    fixture.kickoffAt !== null &&
    new Date(fixture.kickoffAt).getTime() <= Date.now() &&
    timeAnnounced(fixture.kickoffAt, tz);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Next up</h2>

      <div className="mt-3 rounded-lg border border-line p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {weAreHome ? us : them}
          <span className="text-muted">vs</span>
          {weAreHome ? them : us}
          {when && (
            <span className="ml-auto text-sm tabular-nums text-muted">
              {when}
              {underWay && " · under way"}
            </span>
          )}
        </div>
        {/* Home on the left of the bar, as the header above reads; the names
            are already there, so the bar carries only the numbers. */}
        {odds && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <span>Forecast</span>
            <Odds probs={odds.probs} home={odds.home} away={odds.away} />
            <Link href="/predictions" className="ml-auto whitespace-nowrap text-brand-text hover:underline">
              how it works
            </Link>
          </div>
        )}

        {played(ours) + played(theirs) > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line pt-4 text-sm">
            {/* The games behind each column, first — the rest of the table
                means nothing without it, and one side is often new here.
                Home on the left, like the header. */}
            <Row
              label="played"
              ours={played(left)}
              theirs={played(right)}
            />
            <Row
              label="W–D–L"
              ours={`${left.performance.won}–${left.performance.drawn}–${left.performance.lost}`}
              theirs={`${right.performance.won}–${right.performance.drawn}–${right.performance.lost}`}
            />
            <Row
              label="goals a game"
              ours={left.perGame ? left.perGame.gf : "—"}
              theirs={right.perGame ? right.perGame.gf : "—"}
            />
            <Row
              label="conceded a game"
              ours={left.perGame ? left.perGame.ga : "—"}
              theirs={right.perGame ? right.perGame.ga : "—"}
            />
            <Row
              label="clean sheets"
              ours={played(left) ? `${left.performance.cleanSheets} of ${played(left)}` : "—"}
              theirs={played(right) ? `${right.performance.cleanSheets} of ${played(right)}` : "—"}
            />
            <Row label="form" ours={<Form form={left.form} />} theirs={<Form form={right.form} />} />
          </dl>
        )}

        {preview.headToHead.length > 0 && (
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted">Met before</p>
            <p className="mt-1 tabular-nums">
              {preview.headToHead.map(homeFirst).join(" · ")}
            </p>
          </div>
        )}

        {preview.shared.length > 0 && (
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted">
              Both have played
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Each side&rsquo;s own score first; home side&rsquo;s games first.
            </p>
            <ul className="mt-2 space-y-1">
              {preview.shared.map((s) => {
                const name = opponentNames.get(s.teamId);
                return (
                  <li key={s.teamId} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular-nums">
                      {s.ours.map((o) => `${o.for}–${o.against}`).join(", ")}
                    </span>
                    <span className="text-xs text-muted">
                      {name ? (
                        <Link href={`/teams/${name.slug}`} className="hover:underline">
                          {name.name}
                        </Link>
                      ) : (
                        "a shared opponent"
                      )}
                    </span>
                    {/* Their goals first, the same way round as ours on the
                        left and as every score elsewhere on this page. Writing
                        the shared team's goals nearest its name would be neat
                        and would make one of the two read backwards. */}
                    <span className="tabular-nums">
                      {s.theirs.map((o) => `${o.for}–${o.against}`).join(", ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {played(ours) + played(theirs) === 0 && preview.shared.length === 0 && (
          // Both sides new here. Saying so is better than four empty columns.
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            Neither side has a result here yet.
          </p>
        )}
      </div>
    </section>
  );
}
