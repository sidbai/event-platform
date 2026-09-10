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
 * Deciding how many leading words a group of names has in common, and whether
 * that prefix is one club or several.
 *
 * The prefix grows while every name agrees. Where they stop agreeing, the
 * question is what they disagree *about*: thirty-nine MRFC teams differ at the
 * second word because that is where the age group starts, and no two of them
 * share it. "Oregon Surf" and "Oregon Premier" differ at the second word
 * because they are two clubs, and each side of the split is a crowd.
 *
 * So: if one of the things they split into is large enough to be a group of
 * its own, they are separate clubs and are taken apart. Otherwise the words
 * they already agree on are the club, and the rest is squad numbering.
 *
 * This errs long: a club fielding twelve ECNL sides and eight Pre-ECNL ones
 * arrives as two groups keyed "…fcecnl" and "…fcpre" rather than one. Both
 * get filed under the same club in two clicks, and the aliases they save are
 * narrower than they could be. That is the cheap direction to be wrong in —
 * a prefix that reaches too far only fails to match next time, while one that
 * does not reach far enough files another club's teams.
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
    // "Capital FC - Capital FC G15" says it twice; an alias of
    // "capitalfccapitalfc" matches the group and nothing else ever again.
    !members[0].w.slice(0, depth).includes(members[0].w[depth]) &&
    members.every((m) => m.w[depth] === members[0].w[depth]);
  while (depth < MAX_WORDS && agreed()) depth++;

  const emit = (): void => {
    groups.push({
      key: members[0].w.slice(0, depth).join(""),
      label: tokens(members[0].team.name).slice(0, depth).join(" "),
      teams: members.map((m) => m.team),
    });
  };

  if (depth >= MAX_WORDS) return emit();

  const buckets = by(members, depth);
  // Every name says the same thing here and the prefix still would not take
  // it — a repeat. There is nothing left to split on.
  if (buckets.size === 1) return emit();
  const biggest = Math.max(...[...buckets.values()].map((b) => b.length));
  if (biggest < min) {
    // Nothing agreed on even the first word, so there is no group here at
    // all — these are the strays the caller lists one by one.
    if (depth === 0) {
      rest.push(...members.map((m) => m.team));
      return;
    }
    return emit();
  }

  for (const [word, bucket] of buckets) {
    // A name that simply stops here is already the prefix and cannot grow.
    if (word === "") rest.push(...bucket.map((m) => m.team));
    else collect(bucket, depth, min, groups, rest);
  }
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
    teams.map((team) => ({ team, w: words(team.name) })),
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
