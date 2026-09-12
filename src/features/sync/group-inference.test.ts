import { describe, expect, it } from "vitest";

import { inferGroups, type Fixture } from "./group-inference";

const day = (d: number, h = 10) => Date.UTC(2026, 5, 26 + d, h);
let n = 0;
const game = (home: string, away: string, at: number | null): Fixture => ({ id: `g${++n}`, home, away, at });

describe("inferGroups", () => {
  it("finds two groups of four and the placement round after them", () => {
    // The Rainier Challenge BU12 Silver shape: 12 group games over three
    // days, then three placement games on the fourth.
    const A = ["a1", "a2", "a3", "a4"];
    const B = ["b1", "b2", "b3", "b4"];
    const rr = (g: string[], d0: number) =>
      [
        [0, 1, 0],
        [2, 3, 0],
        [0, 2, 1],
        [1, 3, 1],
        [0, 3, 2],
        [1, 2, 2],
      ].map(([i, j, d]) => game(g[i], g[j], day(d0 + d)));
    const fixtures = [
      ...rr(A, 0),
      ...rr(B, 0),
      game("a3", "b3", day(3, 9)),
      game("a2", "b2", day(3, 9)),
      game("a1", "b1", day(3, 14)),
    ];
    const out = inferGroups(fixtures);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.groups.map((g) => g.sort())).toEqual([A, B]);
    expect(out.labels.get(fixtures[0].id)).toBe("A");
    expect(out.labels.get(fixtures[6].id)).toBe("B");
    expect(out.labels.get(fixtures[12].id)).toBe("Placement");
    expect(out.labels.get(fixtures[14].id)).toBe("Final");
  });

  it("reads a four-team round robin with a rematch at the end as one group and a final", () => {
    const t = ["a", "b", "c", "d"];
    const fixtures = [
      game("a", "b", day(0)),
      game("c", "d", day(0)),
      game("a", "c", day(1)),
      game("b", "d", day(1)),
      game("a", "d", day(2)),
      game("b", "c", day(2)),
      game("a", "b", day(3)),
    ];
    const out = inferGroups(fixtures);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.groups[0].sort()).toEqual(t);
    expect([...out.labels.values()]).toEqual(["Final"]);
    expect(out.labels.get(fixtures[6].id)).toBe("Final");
  });

  it("says nothing about a pool where every team plays three of five others", () => {
    // Six teams, three games each, no complete round robin anywhere: the
    // groups are on the standings page and nowhere else.
    const fixtures = [
      game("1", "2", day(0)),
      game("3", "4", day(0)),
      game("5", "6", day(0)),
      game("4", "5", day(1)),
      game("1", "3", day(1)),
      game("6", "2", day(1)),
      game("2", "4", day(2)),
      game("3", "6", day(2)),
      game("5", "1", day(2)),
      game("2", "6", day(3)),
    ];
    const out = inferGroups(fixtures);
    expect(out.ok).toBe(false);
  });

  it("refuses when placement games come before the group stage has finished", () => {
    const A = ["a1", "a2", "a3"];
    const B = ["b1", "b2", "b3"];
    const fixtures = [
      game("a1", "a2", day(0)),
      game("a1", "a3", day(1)),
      game("a2", "a3", day(2)),
      game("b1", "b2", day(0)),
      game("b1", "b3", day(1)),
      game("b2", "b3", day(2)),
      game("a1", "b1", day(1)), // a "final" on day two is not a final
    ];
    expect(inferGroups(fixtures).ok).toBe(false);
  });
});
