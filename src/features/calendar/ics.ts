/**
 * Fixtures as a calendar somebody's phone can subscribe to.
 *
 * The format is old and fussy and every part of that fussiness is
 * load-bearing, so it is built here rather than assembled inline: a feed a
 * phone silently refuses is indistinguishable from one nobody subscribed to.
 *
 * Pure, and tested against the rules rather than against a library, because
 * the rules are the whole of the risk.
 */

export type CalendarFixture = {
  /** Stable for the life of the fixture: a reader matches on it. */
  id: string;
  kickoffAt: Date | null;
  /** Whether the hour is known, or only the day — see events/kickoff.ts. */
  timed: boolean;
  home: string;
  away: string;
  /** Where, as one line: "Field 1 · Starfire Complex". */
  where: string | null;
  /** The competition, for the description. */
  event: string;
  division: string | null;
  /** Where a reader can go and see it. */
  url: string | null;
};

/**
 * Text in this format is escaped, not quoted.
 *
 * A club called "Eastside FC, West" ends a line early without this and the
 * rest of its name becomes a property the reader does not know — usually
 * dropping the event, sometimes the whole feed.
 */
function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Lines fold at 75 octets, and octets is the word that matters.
 *
 * Two of the clubs in this directory are written in Chinese, where one
 * character is three octets. Counting characters would fold in the wrong
 * place and split one down the middle. The continuation is a CRLF and one
 * leading space, which the reader takes back out.
 */
export function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // 75 on the first line and 74 after, because the space counts.
    const room = out.length === 0 ? 75 : 74;
    let end = Math.min(start + room, bytes.length);
    // Never split a character: back off to a boundary byte.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return out.join("\r\n ");
}

/** 2026-09-12T16:00:00.000Z → 20260912T160000Z. */
function stamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The local day, for a fixture whose hour nobody has published. */
function day(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(at)
    .replace(/-/g, "");
}

/** A day later, which is where a whole-day event ends. */
function nextDay(yyyymmdd: string): string {
  const at = new Date(
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`,
  );
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10).replace(/-/g, "");
}

export type CalendarOptions = {
  /** The calendar's own name, once somebody has subscribed. */
  name: string;
  timeZone: string;
  /** The moment this was built. Every event carries it. */
  now?: Date;
};

export function calendar(
  fixtures: CalendarFixture[],
  { name, timeZone, now = new Date() }: CalendarOptions,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//King Juan Soccer//Fixtures//EN",
    "CALSCALE:GREGORIAN",
    // Subscribed calendars are read-only; saying so stops a reader offering
    // to edit a fixture it cannot change.
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-TIMEZONE:${timeZone}`,
  ];

  for (const fixture of fixtures) {
    if (!fixture.kickoffAt) continue;

    lines.push("BEGIN:VEVENT");
    /*
     * Stable for the life of the fixture. A reader matches on this to decide
     * whether a game moved or is a new one, so a UID built from the kick-off
     * would leave the old entry behind every time one was rescheduled.
     */
    lines.push(`UID:${fixture.id}@kingjuansoccer.com`);
    lines.push(`DTSTAMP:${stamp(now)}`);

    if (fixture.timed) {
      lines.push(`DTSTART:${stamp(fixture.kickoffAt)}`);
      // Youth games run an hour or less, and an event with no end is drawn as
      // a sliver by some readers and as the rest of the day by others.
      lines.push(`DTEND:${stamp(new Date(fixture.kickoffAt.getTime() + 3_600_000))}`);
    } else {
      /*
       * The day is known and the hour is not, which this format says with a
       * whole-day event rather than with midnight. A phone drawing it at
       * 12:00 AM would be stating a kick-off nobody published.
       */
      const start = day(fixture.kickoffAt, timeZone);
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(start)}`);
    }

    lines.push(`SUMMARY:${escape(`${fixture.home} v ${fixture.away}`)}`);
    if (fixture.where) lines.push(`LOCATION:${escape(fixture.where)}`);
    if (fixture.url) lines.push(`URL:${fixture.url}`);

    const description = [
      fixture.event,
      fixture.division,
      fixture.timed ? null : "Kick-off time not published yet",
      fixture.url,
    ].filter((line): line is string => typeof line === "string" && line !== "");
    if (description.length > 0) {
      lines.push(`DESCRIPTION:${escape(description.join("\n"))}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // CRLF, which the format requires and some readers enforce.
  return lines.map(fold).join("\r\n") + "\r\n";
}
