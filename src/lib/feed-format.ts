/** Pure formatters for the public event feed (kingjuancup.org compatibility). */

export function logoBasename(url: string | null): string | null {
  if (!url) return null;
  const path = url.split("?")[0];
  return path.split("/").pop() || null;
}

export function hhmm(d: Date, tz: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz ?? undefined,
  }).format(d);
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
