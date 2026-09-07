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
export function parseBirthYears(name: string): number[] {
  const pair = PAIR.exec(name);
  if (pair) {
    const a = fullYear(pair[1]);
    const b = fullYear(pair[2]);
    // Consecutive years only. "U18/19" is an age range and "RCL 1/2" is a
    // tier; both would otherwise arrive here as a birth cohort.
    if (b - a === 1 && a >= 1950 && a <= 2100) return [a, b];
  }
  const full = FULL.exec(name);
  if (full) return [fullYear(full[1])];
  const short = SHORT.exec(name);
  if (short) return [fullYear(short[1])];
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
