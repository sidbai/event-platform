/**
 * Telling a kick-off time from a date somebody filed under one.
 *
 * ECNL publishes a league's whole season at once and fills the time in later,
 * and a fixture with no time arrives as the date at midnight. So 746 of the
 * two leagues' fixtures read "12:00 AM · -", which is not what the league
 * said — it said nothing yet, and "12:00 AM" is our own placeholder wearing
 * the clothes of a fact.
 *
 * Midnight is the signal because it is the one the import leaves. It is an
 * inference and worth stating as one: no kick-off at midnight exists anywhere
 * in the data outside those two leagues, and none is going to — a youth game
 * is not played at midnight, and the leagues that do publish times publish
 * them between 8am and 8pm. The trade is that a real midnight fixture, if one
 * ever existed, would read as unannounced rather than being written down
 * wrongly, which is the safer of the two mistakes.
 *
 * The same fixtures carry "-" for the field, from the same cause.
 */

/** Whether the time on this kick-off is one the organizer actually gave. */
export function timeAnnounced(
  kickoffAt: Date | null | undefined,
  timeZone: string,
): boolean {
  if (!kickoffAt) return false;
  const at = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(kickoffAt);
  return at !== "00:00";
}

/**
 * The field as something to print, or null where the source is standing in
 * for one. A platform writes "-" or an empty cell; neither names a pitch.
 */
export function fieldAnnounced(field: string | null | undefined): string | null {
  const text = (field ?? "").trim();
  if (text === "" || text === "-" || text === "—" || text === "TBD") return null;
  return text;
}
