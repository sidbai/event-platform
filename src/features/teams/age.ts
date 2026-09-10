/**
 * A team's birth years and gender, read off the name a platform published.
 *
 * "U13" is not a fact about a team, it is a fact about a team in a season:
 * next year's U13 is a different set of children. The birth years are the
 * durable thing, which is why they are what gets stored and why the age group
 * a tournament printed is left as the label it is.
 *
 * Every notation below is one the imports actually use. There is no agreed
 * format — "B13-14", "2013/14", "B2013-2014", "(18-19)" and "2015" all appear
 * in the same directory — so the parse normalises them to years and display
 * puts them back together one way.
 */

/**
 * Whether a number can be somebody's birth year at all.
 *
 * The youngest bracket anywhere in this data is U4, so a year within four of
 * the present is not a birth year — it is a season. "26/27 Portland Thorns
 * Academy U10" is the 2026/27 season's U10 side, and read as a cohort it made
 * five teams of children born next year.
 */
export function looksLikeBirthYear(year: number, now: Date = new Date()): boolean {
  return year >= 1950 && year <= now.getUTCFullYear() - 4;
}

/** A two-digit year, in the range youth soccer birth years actually fall in. */
function fullYear(raw: string): number {
  const n = Number(raw);
  if (n > 1900) return n;
  // 26 is 2026, not 1926: nobody in this data was born before 1950.
  return n < 50 ? 2000 + n : 1900 + n;
}

/*
 * A pair — "B13-14", "2013/2014", "(18-19)", "G09/10".
 *
 * The digit lookbehind stops "2013" being read as "20" and "13"; a leading B
 * or G is consumed because it is the gender marker, not part of the year.
 *
 * The U lookbehind is the load-bearing one: "U18/19" is a team playing two
 * age groups, and read as years it makes a 2018/2019 side out of teenagers.
 */
const PAIR =
  /(?<![0-9])(?<![Uu])[BG]?((?:19|20)?\d{2})\s*[/-]\s*((?:19|20)?\d{2})(?![0-9])/i;
/** A single four-digit year — "B2013", "2015 Spuraways". */
const FULL = /(?<![0-9])[BG]?(20[0-2]\d)(?![0-9])/i;
/** A single two-digit year, only when a B or G marks it — "B09", "G12". */
const SHORT = /(?<![0-9A-Za-z])[BG]([0-2]\d)(?![0-9])/;

/**
 * The birth years a name states, or an empty array when it states none.
 *
 * Never derived from a U-number. U13 means a different pair of years in a
 * summer tournament than in an autumn league, because organizers disagree
 * about which season a June fixture belongs to — and a guess written into
 * this column would be read as something somebody checked.
 */
export function parseBirthYears(name: string, now: Date = new Date()): number[] {
  const pair = PAIR.exec(name);
  if (pair) {
    const a = fullYear(pair[1]);
    const b = fullYear(pair[2]);
    // Consecutive years only. "U18/19" is an age range and "RCL 1/2" is a
    // tier; both would otherwise arrive here as a birth cohort.
    //
    // Either order: "Olympus 2010/09" and "MRFC B16/15 RED" write the older
    // year second, and read strictly ascending they fell through to the
    // single-year rule and lost a year each.
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (hi - lo === 1 && looksLikeBirthYear(lo, now) && looksLikeBirthYear(hi, now)) {
      return [lo, hi];
    }
  }
  const full = FULL.exec(name);
  if (full && looksLikeBirthYear(fullYear(full[1]), now)) return [fullYear(full[1])];
  const short = SHORT.exec(name);
  if (short && looksLikeBirthYear(fullYear(short[1]), now)) return [fullYear(short[1])];
  return [];
}

/** "2013/2014", "2013", or nothing to say. */
export function formatBirthYears(years: number[] | null | undefined): string | null {
  if (!years || years.length === 0) return null;
  return years.join("/");
}

export type Gender = "boys" | "girls";

/*
 * A B or G that is marking a team, not starting a word: immediately before a
 * U-number or a year, or the word itself. "Blackhills FC" and "Green Devils"
 * must not read as boys and girls.
 */
const BOYS = /(?<![A-Za-z])(?:B(?:U-?\d{1,2}|\d{2}(?![0-9])|20\d\d)|boys?\b)/i;
const GIRLS = /(?<![A-Za-z])(?:G(?:U-?\d{1,2}|\d{2}(?![0-9])|20\d\d)|girls?\b)/i;

/** The gender a name states, or null when it states none or says both. */
export function parseGender(name: string): Gender | null {
  const boys = BOYS.test(name);
  const girls = GIRLS.test(name);
  if (boys === girls) return null;
  return boys ? "boys" : "girls";
}

export type BirthYearsInput =
  | { ok: true; years: number[] }
  | { ok: false; error: string };

/**
 * Birth years typed by a person, rather than read off an imported name.
 *
 * Stricter than the name parser, and it can afford to be: a name is evidence
 * we are interpreting, while this is somebody telling us. So it takes exactly
 * the two shapes the cycle produces and rejects the rest with a reason,
 * instead of quietly finding a year somewhere in the string.
 */
export function parseBirthYearsInput(raw: string | null | undefined): BirthYearsInput {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, years: [] };

  const parts = text.split(/\s*[/-]\s*/);
  if (parts.length > 2 || !parts.every((p) => /^\d{4}$/.test(p))) {
    return { ok: false, error: "Write birth years as 2013/2014, or 2013." };
  }

  const years = parts.map(Number);
  if (years.some((y) => y < 1950 || y > 2100)) {
    return { ok: false, error: "That is not a birth year." };
  }
  if (years.length === 2 && years[1] - years[0] !== 1) {
    // An age group spans one school year, so its two years are consecutive.
    // "2013/2015" is a typo, and stored it would quietly widen the group.
    return { ok: false, error: "Two birth years have to run consecutively." };
  }
  return { ok: true, years };
}

/** The U-number a name states — 13 for "XF U13 B13-14", null for none. */
export function parseAgeGroup(name: string): number | null {
  const m = /(?<![A-Za-z])[BG]?U-?(\d{1,2})(?![0-9])/i.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 4 && n <= 23 ? n : null;
}

/**
 * Which season an event's age groups belong to.
 *
 * Not the calendar year. An age group belongs to a season, and clubs move to
 * the next season's groups in the spring — a June tournament is already
 * playing next season's U12, not this season's.
 *
 * Checked against every event here: across six tournaments from May to
 * September 2026, 182 of the 185 teams that name both a U-number and their
 * birth years agree on the same season, 2026. The cutoff below sits before
 * all of them; where it belongs exactly, between January and May, this data
 * cannot say and no event here falls there.
 */
export function seasonYearOf(startsAt: Date): number {
  const year = startsAt.getUTCFullYear();
  return startsAt.getUTCMonth() + 1 >= 5 ? year : year - 1;
}

/**
 * The birth years a U-number means in a given season.
 *
 * U12 in the 2026 season is 2014/2015, because the cycle here runs August to
 * July and a group therefore spans two calendar years. This is derived rather
 * than stated, which is why the caller records it as such.
 */
export function birthYearsForAgeGroup(u: number, seasonYear: number): number[] {
  const first = seasonYear - u;
  return [first, first + 1];
}

/**
 * The age group a team is in this season — "BU12", "GU14", or null.
 *
 * Computed, never stored. That is the whole reason birth years are the
 * column: the same team is BU12 this season and BU13 the next, and a stored
 * label would have to be rewritten every August or quietly go wrong.
 *
 * Keyed on the first birth year, which makes {2014} and {2014, 2015} the same
 * group. Both appear in the data — a name saying "B2014" and one saying
 * "B14-15" describe the same children — and a rule matching whole arrays
 * would put them in different groups.
 */
export function ageGroupOf(
  birthYears: number[] | null | undefined,
  gender: string | null | undefined,
  seasonYear: number,
): string | null {
  if (!birthYears || birthYears.length === 0) return null;
  if (gender !== "boys" && gender !== "girls") return null;
  const u = seasonYear - birthYears[0];
  if (u < 4 || u > 23) return null;
  return `${gender === "boys" ? "B" : "G"}U${u}`;
}

export type AgeGroupFilter = { gender: "boys" | "girls"; firstBirthYear: number };

/** "BU12" from a query string, as the years it means this season. */
export function parseAgeGroupFilter(
  raw: string | null | undefined,
  seasonYear: number,
): AgeGroupFilter | null {
  const m = /^([BG])U(\d{1,2})$/i.exec((raw ?? "").trim());
  if (!m) return null;
  const u = Number(m[2]);
  if (u < 4 || u > 23) return null;
  return {
    gender: m[1].toUpperCase() === "B" ? "boys" : "girls",
    firstBirthYear: seasonYear - u,
  };
}

/**
 * Whether two cohorts are the same one.
 *
 * Not "share a year". An age group here is a two-year band and every band
 * overlaps the one above it by exactly a year — U11 is 2015 and 2016, U12 is
 * 2014 and 2015, U13 is 2013 and 2014 — so "shares a year" is true of every
 * pair of adjacent age groups a club fields.
 *
 * The same set is the same cohort, and one inside the other is too: a club
 * that names a single-year side, "Seattle Celtic B14", against a band that
 * contains it is naming a team within that age group rather than a different
 * one. Two different bands are two different sides.
 */
export function sameCohort(a: number[], b: number[]): boolean {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.every((y) => large.includes(y));
}
