/**
 * Which games were group games, read off the schedule itself.
 *
 * AthleteOne's fixture rows never say which group a game belongs to; the
 * groups live on its standings page, which the copier did not carry across.
 * Six tournaments arrived that way, and every flight with two groups of
 * four rendered as one table of eight with the placement games mixed in.
 *
 * A round robin leaves a shape, though. Two groups of four are two sets of
 * four teams that each played every other one exactly once, and then a few
 * games between the sets on the last day. This finds that shape where it is
 * unambiguous and says nothing where it is not — a tournament that plays
 * three games each across a pool of six has groups on its standings page
 * that no schedule can recover, and guessing would be worse than the single
 * table. Those need the standings page copied, which the copier now keeps
 * the group heading from.
 */

export type Fixture = {
  id: string;
  /** Keys for the two sides — team ids, or the placeholder text where a side never resolved. */
  home: string;
  away: string;
  /** Kick-off as a timestamp, or null when the schedule has no date. */
  at: number | null;
};

export type Inference =
  | {
      ok: true;
      /** Team keys per group, in the order the groups first kick off. */
      groups: string[][];
      /** Fixture id → "A" | "B" | … for group games, "Final" or "Placement" for the rest. */
      labels: Map<string, string>;
      note: string;
    }
  | { ok: false; reason: string };

const LETTERS = "ABCDEFGH";

/** Every way to split `items` into `k` non-empty unordered groups. */
function* partitions<T>(items: T[], k: number): Generator<T[][]> {
  const groups: T[][] = [];
  function* rec(i: number): Generator<T[][]> {
    if (i === items.length) {
      if (groups.length === k) yield groups.map((g) => [...g]);
      return;
    }
    for (const g of groups) {
      g.push(items[i]);
      yield* rec(i + 1);
      g.pop();
    }
    if (groups.length < k) {
      groups.push([items[i]]);
      yield* rec(i + 1);
      groups.pop();
    }
  }
  yield* rec(0);
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

type Fit = { groups: string[][]; cross: Fixture[]; lastGroupAt: number };

/**
 * Whether a partition is the shape of a group stage: every group a complete
 * round robin played once, every cross-group game after the last group game,
 * and no more cross-group games than a placement round would have.
 */
function fit(fixtures: Fixture[], groups: string[][]): Fit | null {
  const index = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((t) => index.set(t, i)));
  const seen = new Map<string, number>();
  const cross: Fixture[] = [];
  let lastGroupAt = -Infinity;
  for (const f of fixtures) {
    if (index.get(f.home) === index.get(f.away)) {
      const key = pairKey(f.home, f.away);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (f.at !== null) lastGroupAt = Math.max(lastGroupAt, f.at);
    } else {
      cross.push(f);
    }
  }
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (seen.get(pairKey(g[i], g[j])) !== 1) return null;
      }
    }
  }
  const largest = Math.max(...groups.map((g) => g.length));
  if (cross.length > largest) return null;
  if (cross.some((f) => f.at === null || f.at < lastGroupAt)) return null;
  return { groups, cross, lastGroupAt };
}

export function inferGroups(fixtures: Fixture[]): Inference {
  const teams = [...new Set(fixtures.flatMap((f) => [f.home, f.away]))].sort();
  const n = teams.length;
  if (n < 3) return { ok: false, reason: "fewer than three teams" };
  if (n > 14) return { ok: false, reason: `${n} teams is more than this will search` };

  /*
   * One group with a final: a four-team round robin and then the top two
   * again. The repeated pair is the final if it is the last game; anything
   * else repeated is a schedule this cannot read.
   */
  const counts = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = pairKey(f.home, f.away);
    counts.set(key, [...(counts.get(key) ?? []), f]);
  }
  const repeated = [...counts.values()].filter((fs) => fs.length > 1);
  if (repeated.length > 1 || repeated.some((fs) => fs.length > 2)) {
    return { ok: false, reason: "pairs meet more than once in a way that is not one final" };
  }
  const allPairs = (n * (n - 1)) / 2;
  if (counts.size === allPairs) {
    const labels = new Map<string, string>();
    if (repeated.length === 1) {
      const [a, b] = repeated[0].sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
      const others = fixtures.filter((f) => f.id !== b.id);
      if (b.at === null || others.some((f) => f.at !== null && f.at > b.at!)) {
        return { ok: false, reason: "a pair meets twice but the rematch is not the last game" };
      }
      void a;
      labels.set(b.id, "Final");
    }
    return { ok: true, groups: [teams], labels, note: repeated.length ? "one round robin and a final" : "one round robin" };
  }

  /*
   * Several groups. Sizes within one of each other, at least three a side —
   * a "group" of two is a single game, not a table.
   */
  const fits: Fit[] = [];
  for (let k = 2; k <= Math.min(4, Math.floor(n / 3)); k++) {
    for (const p of partitions(teams, k)) {
      const sizes = p.map((g) => g.length);
      if (Math.min(...sizes) < 3 || Math.max(...sizes) - Math.min(...sizes) > 1) continue;
      const f = fit(fixtures, p);
      if (f) fits.push(f);
    }
  }
  if (fits.length === 0) return { ok: false, reason: "no split into complete round-robin groups" };
  fits.sort((x, y) => x.cross.length - y.cross.length || x.groups.length - y.groups.length);
  const best = fits[0];
  const rival = fits.find(
    (f) => f !== best && f.cross.length === best.cross.length && f.groups.length === best.groups.length,
  );
  if (rival) return { ok: false, reason: "two different splits fit equally well" };

  // Letter the groups by when they first kick off, so A is the first on the pitch.
  const firstAt = (g: string[]) =>
    Math.min(
      ...fixtures
        .filter((f) => g.includes(f.home) && g.includes(f.away) && f.at !== null)
        .map((f) => f.at!),
    );
  const groups = [...best.groups].sort((a, b) => firstAt(a) - firstAt(b));
  const letter = new Map<string, string>();
  groups.forEach((g, i) => g.forEach((t) => letter.set(t, LETTERS[i])));

  const labels = new Map<string, string>();
  for (const f of fixtures) {
    if (letter.get(f.home) === letter.get(f.away)) labels.set(f.id, letter.get(f.home)!);
  }
  const cross = [...best.cross].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  cross.forEach((f, i) => labels.set(f.id, i === cross.length - 1 ? "Final" : "Placement"));

  return {
    ok: true,
    groups,
    labels,
    note: `${groups.length} groups of ${groups.map((g) => g.length).join("/")}, ${cross.length} placement game${cross.length === 1 ? "" : "s"}`,
  };
}
