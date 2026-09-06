/**
 * Reading what an organizer typed into a division.
 *
 * Every field here is a small parse that is easy to get almost right: money
 * typed as "$1,200.50", birth years typed with a slash because that is how
 * flyers write them, a roster minimum above its maximum, a registration window
 * that closes before it opens. None of these fail loudly at the database — a
 * fee off by a factor of a hundred, or a window nobody can register in, just
 * quietly runs the event wrong.
 *
 * Pure, so the edges can be asserted instead of clicked through.
 */

/** The formats youth soccer is actually played in. */
export const GAME_FORMATS = ["4v4", "5v5", "7v7", "9v9", "11v11"] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

export type DivisionInput = {
  name: string;
  label: string | null;
  birthYears: number[];
  format: string | null;
  rosterMin: number | null;
  rosterMax: number | null;
  feeCents: number | null;
  capacity: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A fee an organizer would recognise as one they typed. */
const MAX_FEE_CENTS = 10_000_00;

/**
 * Money as typed, in cents.
 *
 * Blank means free, and so does zero — a division that costs nothing should
 * read "Free" rather than "$0", so both collapse to null and formatFee has one
 * case to handle rather than two that look different for no reason.
 *
 * Rounded rather than truncated because 1200.50 * 100 is 120050.00000000001 in
 * binary floating point, and truncating that gives $1,200.49.
 */
export function parseFeeCents(raw: string): Parsed<number | null> {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: "Fee looks like 850 or 850.00." };
  }
  const cents = Math.round(Number(s) * 100);
  if (cents > MAX_FEE_CENTS) return { ok: false, error: "That fee looks too high." };
  return { ok: true, value: cents === 0 ? null : cents };
}

/**
 * The birth years a division is for.
 *
 * Accepts the separators flyers use — "2013/2014", "2013, 2014", "2013 2014" —
 * because insisting on one of them only teaches organizers that the field is
 * fussy. Sorted and de-duplicated so two divisions written differently compare
 * equal.
 */
export function parseBirthYears(raw: string): Parsed<number[]> {
  const s = raw.trim();
  if (s === "") return { ok: true, value: [] };
  const parts = s.split(/[\s,/]+/).filter(Boolean);
  const years: number[] = [];
  for (const p of parts) {
    if (!/^\d{4}$/.test(p)) return { ok: false, error: "Birth years are four digits." };
    const n = Number(p);
    // Wide on purpose: this is a sanity check against a typo like 1013, not a
    // rule about who may play.
    if (n < 1950 || n > 2100) return { ok: false, error: `${p} isn't a birth year.` };
    years.push(n);
  }
  return { ok: true, value: [...new Set(years)].sort((a, b) => a - b) };
}

/** A whole number an organizer typed, or nothing. */
function parseCount(raw: string, label: string, max: number): Parsed<number | null> {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, error: `${label} is a whole number.` };
  const n = Number(s);
  if (n < 1 || n > max) return { ok: false, error: `${label} is between 1 and ${max}.` };
  return { ok: true, value: n };
}

/**
 * A datetime-local value, read in the event's own timezone.
 *
 * The browser sends "2026-09-12T18:00" with no zone. Reading that as UTC would
 * put a Seattle registration deadline eight hours early — closing entries at
 * 10am on a day the organizer meant to run to 6pm.
 */
export function parseLocalDateTime(raw: string, timeZone: string): Parsed<Date | null> {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return { ok: false, error: "That date and time didn't parse." };

  const [, y, mo, d, h, mi] = m;
  const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // Find the offset that zone was at around that moment, then correct for it.
  const offset = zoneOffsetMs(new Date(asUTC), timeZone);
  return { ok: true, value: new Date(asUTC - offset) };
}

/** How far a zone was from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asIfUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asIfUTC - at.getTime();
}

/**
 * A whole division, or the first thing wrong with it.
 *
 * One error at a time rather than a field-by-field map: these forms are short,
 * and the alternative is a component that renders six error slots to show one.
 */
export function parseDivision(
  form: {
    name: string;
    label: string;
    birthYears: string;
    format: string;
    rosterMin: string;
    rosterMax: string;
    fee: string;
    capacity: string;
    opensAt: string;
    closesAt: string;
  },
  timeZone: string,
): Parsed<DivisionInput> {
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Give the division a name." };
  if (name.length > 80) return { ok: false, error: "That name is too long." };

  const years = parseBirthYears(form.birthYears);
  if (!years.ok) return years;

  const format = form.format.trim();
  if (format && !GAME_FORMATS.includes(format as GameFormat)) {
    return { ok: false, error: "Pick a format from the list." };
  }

  const min = parseCount(form.rosterMin, "Roster minimum", 99);
  if (!min.ok) return min;
  const max = parseCount(form.rosterMax, "Roster maximum", 99);
  if (!max.ok) return max;
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, error: "Roster minimum is above the maximum." };
  }

  const fee = parseFeeCents(form.fee);
  if (!fee.ok) return fee;

  const capacity = parseCount(form.capacity, "Team limit", 999);
  if (!capacity.ok) return capacity;

  const opens = parseLocalDateTime(form.opensAt, timeZone);
  if (!opens.ok) return opens;
  const closes = parseLocalDateTime(form.closesAt, timeZone);
  if (!closes.ok) return closes;
  if (opens.value && closes.value && opens.value >= closes.value) {
    return { ok: false, error: "Registration closes before it opens." };
  }

  return {
    ok: true,
    value: {
      name,
      label: form.label.trim() || null,
      birthYears: years.value,
      format: format || null,
      rosterMin: min.value,
      rosterMax: max.value,
      feeCents: fee.value,
      capacity: capacity.value,
      registrationOpensAt: opens.value,
      registrationClosesAt: closes.value,
    },
  };
}

/**
 * A stored instant as a datetime-local input wants it, in the event's zone.
 *
 * The inverse of parseLocalDateTime, and the reason the pair is tested for
 * round-tripping: an editor that renders a deadline an hour off from what was
 * saved will have the organizer "fix" it on every visit.
 */
export function toLocalInput(at: Date | null, timeZone: string): string {
  if (!at) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
