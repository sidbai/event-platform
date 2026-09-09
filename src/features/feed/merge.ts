/**
 * Interleaving what people write here into one list.
 *
 * News and community posts, ordered by what they are about rather than by
 * when somebody got round to writing them. Four recaps typed in one sitting
 * carry four different dates — a cup in July, a tournament three weeks ago —
 * and filed by publication they come out shuffled against the season they
 * describe. Events are not in this list: they belong on the timeline by when
 * they are PLAYED, one order cannot serve both, and trying made the events
 * lose — see featured.ts.
 *
 * Kept pure and separate from the queries so the ordering — the part that is
 * easy to get subtly wrong and impossible to eyeball on a live page — can be
 * tested without a database.
 */

/**
 * The only fields the ordering cares about.
 *
 * `at` is what the card shows — when it was posted. `sortAt` is what it is
 * about, where those differ: a recap of a cup played in July, written in
 * September, sorts under July and still says it was posted four days ago.
 * The news page has drawn this line for a while, ordering on
 * `coalesce(event_date, published_at)` while printing both.
 */
export type Feedable = { id: string; at: Date; sortAt?: Date | null };

const when = (item: Feedable) => (item.sortAt ?? item.at).getTime();

/**
 * Newest first, across every source.
 *
 * Ties break on id rather than being left to sort stability. Two items posted
 * in the same second are common — a seeder writes a batch at once — and
 * without a tiebreak their order could differ between two renders of the same
 * page, which reads as the feed shuffling itself while you look at it.
 */
export function mergeFeed<T extends Feedable>(groups: T[][], limit: number): T[] {
  return groups
    .flat()
    .sort((a, b) => when(b) - when(a) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * A post that has become an event appears once, as the event.
 *
 * Converting a post creates a second row for one thing: the discussion that
 * started it and the event it became. Both pages are worth keeping — /community
 * still lists the thread — but side by side in one feed they read as a bug,
 * because the titles are identical.
 *
 * The event wins: it carries the date and place, which is what a reader
 * scanning the page needs, and it sits in the band above. Only posts whose
 * event is actually ON the page are dropped, so one converted to a private
 * event, or to a tournament too far off to be featured, still shows up rather
 * than vanishing from the front page.
 */
export function dropSupersededPosts<T extends { convertedEventId: string | null }>(
  posts: T[],
  eventIds: Set<string>,
): T[] {
  return posts.filter(
    (p) => p.convertedEventId === null || !eventIds.has(p.convertedEventId),
  );
}
