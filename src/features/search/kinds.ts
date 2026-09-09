/**
 * What a suggestion is, kept out of the "use server" file beside it.
 *
 * A file marked "use server" may export nothing but async functions — a plain
 * constant makes the whole module export nothing at all, and since this one is
 * reached from the layout, that takes every page down with it. Neither tsc nor
 * eslint says a word about it; the page does.
 */

export type Suggestion = {
  kind: "event" | "team" | "club";
  label: string;
  detail: string | null;
  href: string;
};

/** Below this, a term matches so much that the list says nothing. */
export const MIN_QUERY = 2;
/** Three or four of each kind fits under a box without becoming a page. */
export const PER_KIND = 4;
