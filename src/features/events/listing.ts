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
/**
 * Query parameters that belong to whoever copied the link, not to the page.
 *
 * A schedule URL is pasted from an admin's own browser, where they are signed
 * in to the platform. EventConnect hands out `registration_id`; analytics
 * hands out utm_*; a dozen others hand out a click id. Stored as-is, every
 * visitor who follows that button arrives carrying one person's session.
 *
 * Not a security hole — none of these is a credential — but it is somebody's
 * identifier published on a public page, and the link works without it.
 */
const PERSONAL_PARAMS = [
  /^registration_id$/i,
  /^utm_/i,
  /^(fbclid|gclid|msclkid|mc_eid|_hs(enc|mi))$/i,
  /^(session|sid|token|auth|user_?id|member_?id)$/i,
];

export function safeSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    for (const key of [...url.searchParams.keys()]) {
      if (PERSONAL_PARAMS.some((p) => p.test(key))) url.searchParams.delete(key);
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The organizer's own schedule, as a button.
 *
 * Whose tournament it is decides where the last word on it lives. Even when
 * we hold the fixtures — synced, or pasted in — ours is a copy that was
 * current when we last read it, and a parent standing on a field at 8am
 * wants the page the organizer changes, not our copy of it. So every listing
 * carries this, and only an event we run has nothing to point at.
 *
 * The label says where the button goes rather than what the reader hopes to
 * find, because the two are only the same when we have a schedule link:
 *
 *   with a schedule URL   "Schedule & standings on Starfire Sports"
 *   with only the event   "View on Starfire Sports"
 *
 * Never a "Schedule & standings" button that lands on a front page. A promise
 * that leaves you hunting is worse than no promise, because it was believed.
 */
export function scheduleActionOf(
  event: Listing,
): { label: string; href: string; external: boolean } | null {
  if (isRunHere(event)) return null;

  const where = event.sourceName ? ` on ${event.sourceName}` : "";

  const schedule = safeSourceUrl(event.scheduleUrl);
  if (schedule) {
    return { label: `Schedule & standings${where}`, href: schedule, external: true };
  }

  /*
   * No schedule link, so the event's own page is the most specific thing we
   * can offer — and it is still worth a button: it is where entries, times
   * and any late change live. Named for what it is, so nobody presses it
   * expecting a table.
   */
  const source = safeSourceUrl(event.sourceUrl);
  if (source) {
    return {
      label: event.sourceName ? `View on ${event.sourceName}` : "View the organizer's page",
      href: source,
      external: true,
    };
  }

  return null;
}
