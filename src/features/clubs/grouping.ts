/**
 * Gathering the teams no club matches into the clubs they came from.
 *
 * `matchClub` answers "which club in the directory is this", and for 900-odd
 * imported teams the answer is none: their club has never been added. What is
 * left is a flat alphabetical list, and working it by hand means recognising
 * "MRFC B09/10 Academy 2" thirty-nine separate times, scattered between
 * "Missoula Surf" and "Nido Aguila".
 *
 * The teams already know how to group themselves. Thirty-nine names begin
 * "MRFC", thirty-three begin "Sparta Tacoma" — so group on the leading words
 * they share and let an admin place a club in one decision rather than forty.
 *
 * Nothing here decides *which* club a group belongs to. That is the part that
 * needs a person, because a club page carries reviews about named coaches.
 */

import { words } from "./matching";

export type Groupable = { id: string; name: string };

export type UnplacedGroup<T> = {
  /**
   * The alias this group would save, which is the leading words its members
   * all share: "mrfc", "spartatacoma".
   */
  key: string;
  /** Those same words as a team actually spells them, for reading. */
  label: string;
  teams: T[];
};

/** Past four words a name is describing an age group and a coach. */
const MAX_WORDS = 4;

/** The original tokens, so a label can keep the capitals a name was given. */
function tokens(name: string): string[] {
  return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The part of a name that could be a club's, and no further.
 *
 * Three things end it, and all three are the same observation: a club's name
 * does not carry them.
 *
 *   - a word with a digit in it, which is an age group or a birth year.
 *     "MRFC B09/10 Academy" is one club and its under-nines. The first word
 *     is exempt, because 3RSC is a club.
 *   - a word already used, from a platform that prints the club twice:
 *     "Capital FC - Capital FC G15 Pre-ECNL 1".
 *   - the fourth word, past which a name is describing a coach.
 *
 * Cutting here rather than while comparing is what keeps the comparison
 * simple: what is left is what the names actually claim to be called, and
 * two of those either agree or they do not.
 */
function clubPart(name: string): string[] {
  const w = words(name);
  const out: string[] = [];
  for (const word of w.slice(0, MAX_WORDS)) {
    if (out.length > 0 && (/\d/.test(word) || out.includes(word))) break;
    out.push(word);
  }
  return out;
}

type Entry<T> = { team: T; w: string[] };

function by<T>(members: Entry<T>[], depth: number): Map<string, Entry<T>[]> {
  const out = new Map<string, Entry<T>[]>();
  for (const m of members) {
    const k = m.w[depth] ?? "";
    out.set(k, [...(out.get(k) ?? []), m]);
  }
  return out;
}

/**
 * Deciding how many leading words a group of names has in common.
 *
 * The prefix grows while every name agrees. Where they stop agreeing, the
 * question is whether that is two clubs or one club written down two ways —
 * and the answer is whether there is a crowd on both sides of it.
 *
 * "Oregon Surf" and "Oregon Premier" are twenty-nine and twenty-one, so they
 * are two clubs. "WFC Rangers Boys U13" and "WFC Rangers U15 Boys" are four
 * and a scattering of ones, so they are one club with untidy names, and the
 * words they all share are what it is called.
 *
 * A name that simply stops at the prefix — "Chuckanut Tide GU9" where the
 * others say "Chuckanut Tide FC" — is never a side of a split. It is the
 * shortest way the club writes itself down, which is evidence that the
 * prefix is already the whole name.
 */
function collect<T extends Groupable>(
  members: Entry<T>[],
  from: number,
  min: number,
  groups: UnplacedGroup<T>[],
  rest: T[],
): void {
  if (members.length < min) {
    rest.push(...members.map((m) => m.team));
    return;
  }

  let depth = from;
  const agreed = () =>
    members[0].w[depth] !== undefined &&
    members.every((m) => m.w[depth] === members[0].w[depth]);
  while (depth < MAX_WORDS && agreed()) depth++;

  const emit = (): void => {
    groups.push({
      key: members[0].w.slice(0, depth).join(""),
      label: tokens(members[0].team.name).slice(0, depth).join(" "),
      teams: members.map((m) => m.team),
    });
  };

  const buckets = by(members, depth);
  const split = () => {
    for (const [word, bucket] of buckets) {
      // A name that stops here is already the prefix and cannot grow.
      if (word === "") rest.push(...bucket.map((m) => m.team));
      else collect(bucket, depth, min, groups, rest);
    }
  };

  // Nothing is agreed yet, so there is no prefix to call a club. Whatever
  // does not become a group below is a stray the caller lists on its own.
  if (depth === 0) return split();

  const crowds = [...buckets].filter(([w, b]) => w !== "" && b.length >= min);
  if (crowds.length >= 2) return split();
  emit();
}

/**
 * Teams no club matches, gathered by the words their names begin with.
 *
 * Groups below `min` are not worth a row of their own — a single stray name
 * is quicker to read in the tail than as a heading — and they come back in
 * `rest` so the caller can still show them.
 */
export function groupUnplaced<T extends Groupable>(
  teams: T[],
  min = 3,
): { groups: UnplacedGroup<T>[]; rest: T[] } {
  const groups: UnplacedGroup<T>[] = [];
  const rest: T[] = [];
  collect(
    teams.map((team) => ({ team, w: clubPart(team.name) })),
    0,
    min,
    groups,
    rest,
  );
  groups.sort(
    (a, b) => b.teams.length - a.teams.length || a.label.localeCompare(b.label),
  );
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return { groups, rest };
}
