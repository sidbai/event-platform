import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Turning what somebody typed into something a query can match.
 *
 * The box used to look for the whole phrase in one piece, so "crossfire ecnl"
 * found nothing: the team is called "Crossfire Premier B13/14 ECNL 2" and
 * those two words are four words apart. Anybody typing a club and then
 * narrowing it — which is what a search box is for — got an empty list at the
 * exact moment they gave it more to go on.
 *
 * So: every word has to match, each on its own, and where they sit relative to
 * each other does not matter.
 *
 * Each word matches at the start of a word, not anywhere inside one.
 *
 * It used to match anywhere, on the grounds that "ecnl" should still find the
 * four teams whose tier was written "PreECNL" with no space. That reason is
 * gone — the canonical rename spells them "Pre-ECNL", and a hyphen is a word
 * boundary — and the cost was not free after all: searching "cross" returned
 * two tournaments whose summaries say "across", matched in a field the page
 * does not show. A result nobody can explain is worse than a result missing.
 */

/** % and _ are LIKE wildcards; a search for "50%" must not match everything. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The same for a regular expression, where far more characters mean something.
 *
 * A club called "St. Mary's (North)" is typed as it is written, and every one
 * of those characters is an operator to a regex engine.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Past this many words the query is a sentence, and every one of them is
 * another set of ILIKEs across every column. Six is more than anybody types
 * at a search box and far fewer than a paste of a whole team name costs.
 */
const MAX_WORDS = 6;

/**
 * The LIKE patterns a query has to match, all of them.
 *
 * Empty when there is nothing to search for, which callers read as "no filter"
 * rather than "match nothing".
 */
export function searchTerms(q: string | null | undefined): string[] {
  const words = (q ?? "").trim().split(/\s+/).filter(Boolean);
  // \m is Postgres for "start of a word", which is what a search box means by
  // typing the beginning of something.
  return words.slice(0, MAX_WORDS).map((w) => `\\m${escapeRegex(w)}`);
}

/**
 * Where a result should sit, given what was typed: 0 if the name begins with
 * it, 1 if a word inside it does, 2 otherwise.
 *
 * For the suggestion list under the box, where four rows is the whole budget
 * and "cross" ought to offer Crossfire before Northcross. The directories
 * keep their own order — a page of results is read differently from a list
 * of guesses.
 */
export function prefixRank(label: string, q: string): number {
  const text = label.toLowerCase();
  const term = q.trim().toLowerCase();
  if (!term) return 2;
  if (text.startsWith(term)) return 0;
  // A word boundary rather than any position, or "surf" ranks "Chuckanut
  // Tide" and "WW Surf" the same way.
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)
    ? 1
    : 2;
}

/** The suggestions, best guesses first, with ties left as they arrived. */
export function byRelevance<T extends { label: string }>(rows: T[], q: string): T[] {
  return rows
    .map((row, i) => ({ row, i, rank: prefixRank(row.label, q) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.row);
}

/**
 * One column against one term, as the condition the callers need.
 *
 * `~*` rather than ILIKE, because only a regular expression can say "at the
 * start of a word" — which is what somebody typing the first few letters of a
 * club means, and what ILIKE cannot express at all.
 *
 * Here rather than in each query file so the seven places that search cannot
 * drift into asking seven slightly different questions.
 */
export function startsWord(column: AnyColumn | SQL, term: string): SQL {
  return sql`${column} ~* ${term}`;
}
