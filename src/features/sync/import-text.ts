import "server-only";

import type { ConnectResult } from "./result";
import { applySync } from "./apply";
import { datesLookWrong, mismatchMessage } from "./date-guard";
import { holdsBothKinds } from "./merge-files";
import { parsePastedSchedule, toSyncedEvent } from "./paste";
import { applyPastedStandings } from "./standings-apply";
import { parsePastedStandings, readStandingsHeader } from "./standings-paste";

/**
 * Bringing a schedule in from text, with no form and no session around it.
 *
 * Split out of actions.ts so something other than a form can call it. A
 * "use server" file is reachable from a browser and pulls next/navigation in
 * behind it, which is a runtime a script does not have — and the weekly
 * import is a script now, because collecting the fixtures needs a person but
 * nothing after that does.
 *
 * The same rules either way, deliberately: the date guard, the standings
 * detection, the team binder and the idempotent write are here rather than in
 * the action, so the CLI cannot quietly have looser ones.
 */

/**
 * The import itself, with no form and no session around it.
 *
 * Its own function because a schedule now arrives two ways — pasted onto an
 * event that exists, and handed over while the event is being created — and
 * two copies of this would be two sets of guards, one of which would quietly
 * stop matching the other. Callers do their own permission check; this does
 * the reading and the writing.
 */
export async function applyPastedText(
  event: { id: string; slug: string; startsAt: Date | null; endsAt: Date | null },
  input: { text: string; division?: string; confirmed?: boolean },
): Promise<ConnectResult> {
  const text = input.text.trim();
  if (!text) return { error: "Nothing pasted." };

  /*
   * Both tables in one paste is refused, not guessed at.
   *
   * The first line decides how the whole thing is read, so a schedule
   * followed by a standings table is read entirely as fixtures — and the
   * standings header becomes a game called "l v pts" with no date, followed
   * by one per team. The parser reports none of it as skipped, which is why
   * this is a guard and not a note in the interface.
   */
  if (holdsBothKinds(text)) {
    return {
      error:
        "That holds both a schedule and a standings table. Import them separately — the first line decides how the whole paste is read.",
    };
  }

  // Most schedules print "Sep 5" without a year, and the event's own start
  // date is a better guess than today's — a January tournament pasted in
  // December would otherwise land eleven months early.
  const year = (event.startsAt ?? new Date()).getUTCFullYear();
  const division = (input.division ?? "").trim() || "Unassigned";
  // Set by the tick-box the date guard below asks for, and only by that.
  const confirmed = input.confirmed === true;

  /*
   * A standings table and a fixture list arrive through the same box, because
   * asking somebody to say which they just copied is asking them to get it
   * wrong. The header tells us: a table naming a team column and a points
   * column is a standing, and nothing else is.
   */
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (readStandingsHeader(firstLine)) {
    const { rows, skipped: dropped } = parsePastedStandings(text);
    if (rows.length === 0) {
      return { error: "That looks like a standings table, but no rows came out of it." };
    }

    const out = await applyPastedStandings(event.id, rows);

    if (out.updated === 0) {
      return {
        error: `None of those ${rows.length} teams are on this event. Is the schedule imported first, and is this the right division?`,
      };
    }

    const missed = [...out.unmatched, ...dropped];
    return {
      detail:
        `${out.updated} teams updated with the organizer's own table` +
        (out.labelled > 0 ? `, ${out.labelled} game(s) put in their groups` : "") +
        (missed.length > 0 ? ` — ${missed.length} row(s) matched nothing here` : ""),
    };
  }

  const { matches, skipped } = parsePastedSchedule(text, { division, year });
  if (matches.length === 0) {
    return {
      error: `No fixtures found in that. ${skipped.length} line(s) did not look like games.`,
    };
  }

  /*
   * The one check that the paste is this event's.
   *
   * Nothing else compares the two: the box takes whatever is on a clipboard
   * and writes it to whichever form was on screen. A Labor Day schedule went
   * into a June tournament this way, and 421 fixtures were listed under both
   * events until somebody noticed by eye.
   */
  if (!confirmed) {
    const wrong = datesLookWrong(
      matches.map((m) => m.date),
      event,
    );
    if (wrong) return { error: mismatchMessage(wrong), confirmDates: true };
  }

  const out = await applySync(event.id, toSyncedEvent(matches), new Date(), {
    prune: false,
  });


  const detail = `${matches.length} fixtures, ${out.teams} new teams, ${out.divisions} divisions`;
  return {
    // Skipped lines are the headline when there are any: a row we could not
    // read looks exactly like a game that was never scheduled.
    detail: skipped.length > 0 ? `${detail} — ${skipped.length} line(s) skipped` : detail,
  };
}
