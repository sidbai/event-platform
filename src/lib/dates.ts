/**
 * The current-or-upcoming weekend as a Sat 00:00 → Mon 00:00 window
 * (local time of the given date). On a Sunday this still covers the weekend
 * in progress (start = the day before).
 */
export function weekendRange(now: Date = new Date()): { start: Date; end: Date } {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const daysToSat = day === 0 ? -1 : 6 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + daysToSat);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  return { start, end };
}

/**
 * Combine a calendar date and a wall-clock time in a given IANA timezone into
 * an absolute Date. e.g. zonedDate("2026-08-29", "14:30", "America/Los_Angeles").
 */
export function zonedDate(dateISO: string, time: string, tz: string | null): Date {
  const [h = "0", m = "0"] = time.split(":");
  const hh = h.trim().padStart(2, "0");
  const mm = m.trim().padStart(2, "0");
  if (!tz) return new Date(`${dateISO}T${hh}:${mm}:00`);

  const guess = new Date(`${dateISO}T${hh}:${mm}:00Z`);
  const offsetName =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(guess)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(offsetName);
  const sign = match?.[1] ?? "+";
  const oh = (match?.[2] ?? "0").padStart(2, "0");
  const om = (match?.[3] ?? "00").padStart(2, "0");
  return new Date(`${dateISO}T${hh}:${mm}:00${sign}${oh}:${om}`);
}
