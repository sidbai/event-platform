/**
 * Interleaving the three things that happen on this site into one list.
 *
 * Kept pure and separate from the queries so the ordering — the part that is
 * easy to get subtly wrong and impossible to eyeball on a live page — can be
 * tested without a database.
 */

/** The only fields the ordering cares about. */
export type Feedable = { id: string; at: Date };

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
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
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
 * scanning the feed needs. Only posts whose event is actually IN this feed are
 * dropped, so one converted to a private or already-started event still shows
 * up rather than vanishing from the front page.
 */
export function dropSupersededPosts<T extends { convertedEventId: string | null }>(
  posts: T[],
  eventIds: Set<string>,
): T[] {
  return posts.filter(
    (p) => p.convertedEventId === null || !eventIds.has(p.convertedEventId),
  );
}
