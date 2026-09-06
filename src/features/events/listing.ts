/**
 * What a listing may claim, and what it must not.
 *
 * Most of what makes this platform useful to a family is discovery, and on
 * day one there is almost nothing to discover — a calendar of Seattle youth
 * soccer that only contains what people have typed in here is empty for
 * months. So events can be listed from elsewhere: someone reads an
 * organizer's own page and enters the tournament so it turns up in a search
 * for "U12 Eastside September".
 *
 * That is only honest if a listing is visibly a listing. It has to say whose
 * event it is, link to the page that actually takes entries, and stop short
 * of offering the things it cannot do — entries, rosters, standings all live
 * with the organizer, not here. A directory that looks like the system of
 * record sends a parent to register somewhere nothing is listening.
 *
 * Pure, because these are the rules that keep the distinction visible and
 * every one of them is a thing a page might otherwise quietly offer.
 */

export type Listing = {
  sourceName: string | null;
  sourceUrl: string | null;
  scheduleUrl?: string | null;
  organizerId?: string | null;
};

/** An event that happens somewhere else and is listed here so it can be found. */
export function isExternalListing(event: Listing): boolean {
  return Boolean(event.sourceName);
}

/**
 * Whether this platform runs the event, and may therefore offer to take
 * entries, collect rosters and keep the table.
 *
 * A listing someone has since claimed is still run here — claiming is exactly
 * the act of taking it over — so ownership wins over provenance.
 */
export function isRunHere(event: Listing): boolean {
  return !isExternalListing(event) || Boolean(event.organizerId);
}

export type Attribution = { text: string; href: string | null };

/**
 * The line a listing has to carry.
 *
 * Null when we run the event, because there is nothing to attribute. Named
 * "Listed from" rather than "Source" — a parent reading it should understand
 * the sentence without knowing what we mean by source.
 */
export function attributionOf(event: Listing): Attribution | null {
  if (!isExternalListing(event)) return null;
  return {
    text: `Listed from ${event.sourceName}`,
    href: safeSourceUrl(event.sourceUrl),
  };
}

/**
 * A source link we are willing to send someone to.
 *
 * Only http(s), and only absolute. A listing is typed in by hand, and a
 * relative or javascript: URL in that field would either go nowhere or be a
 * way to hand a visitor something we did not intend — this field is the one
 * place on the page where a stranger chooses the destination.
 */
export function safeSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * What the page should offer as its main action.
 *
 * A listing sends people to the organizer. Anything else we run ourselves, so
 * the answer is null and the page keeps its own buttons.
 */
export function primaryActionOf(
  event: Listing,
): { label: string; href: string } | null {
  if (isRunHere(event)) return null;
  const href = safeSourceUrl(event.sourceUrl);
  // No usable link is still a listing — it just cannot promise a destination.
  if (!href) return null;
  return { label: "Details & registration", href };
}

/**
 * Where to see the fixtures and the table.
 *
 * The thing a parent actually came for. An event this platform runs keeps
 * both itself, at /events/<slug>/table, and needs nothing here; a listing
 * points wherever the organizer keeps them — usually a different system from
 * the one that took the entries.
 *
 * Null rather than falling back to the organizer's homepage. "Schedule &
 * standings" that lands on a front page and leaves you hunting is a worse
 * promise than no link, because it was believed.
 */
export function scheduleActionOf(
  event: Listing,
): { label: string; href: string; external: boolean } | null {
  if (isRunHere(event)) return null;
  const href = safeSourceUrl(event.scheduleUrl);
  if (!href) return null;
  return { label: "Schedule & standings", href, external: true };
}
