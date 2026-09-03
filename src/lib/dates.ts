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
