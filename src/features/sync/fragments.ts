import { readAthleteOneFragment, type FragmentRow } from "./athleteone-fragment";
import { looksLikeGotSport, readGotSportFragment } from "./gotsport-fragment";
import { CANONICAL_HEADER } from "./paste";

/**
 * A saved page from whichever platform it came from, as fixtures.
 *
 * One bundle now carries two kinds of markup — AthleteOne's fragments for the
 * ECNL leagues and GotSport's pages for WPL and GA — because the person
 * collecting them wanted one habit, not two. Which reader applies is decided
 * by the markup itself rather than by the label somebody typed over it.
 */
export function readFragment(html: string): FragmentRow[] {
  return looksLikeGotSport(html) ? readGotSportFragment(html) : readAthleteOneFragment(html);
}

/**
 * The fragments as the paste box already takes them.
 *
 * Ending at the canonical TSV rather than at fixtures of its own: everything
 * downstream — the date guard, the team binder, the idempotent apply — is
 * already written against it, and a second way in would be a second set of
 * those to keep true.
 */
export function fragmentsToTsv(htmls: string[]): string {
  const rows = htmls.flatMap(readFragment);
  const line = (r: FragmentRow) =>
    [
      r.date,
      r.time,
      "",
      r.division,
      r.home,
      r.homeScore,
      r.awayScore,
      r.away,
      r.field,
      r.venue,
    ].join("\t");
  return [CANONICAL_HEADER.join("\t"), ...rows.map(line)].join("\n");
}
