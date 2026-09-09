import { describe, expect, it } from "vitest";

import { mergeScheduleFiles } from "./merge-files";
import { CANONICAL_HEADER, parsePastedSchedule } from "./paste";

const HEAD = CANONICAL_HEADER.join("\t");
const TABLE = ["team", "gp", "w", "d", "l", "gf", "ga", "pts"].join("\t");
const game = (home: string) =>
  `Aug 21, 2026\t09:10 AM\t\tGU08 - GU8 Red\t${home}\t2\t1\tAway FC\tField 1\tStarfire`;

describe("mergeScheduleFiles", () => {
  it("keeps one header, whatever the file count", () => {
    /*
     * The reason this module exists. Concatenated naively, the second
     * header parses as a FIXTURE — "home v away", no date, not even counted
     * as skipped — and nobody sees it until it is on a team's page.
     */
    const out = mergeScheduleFiles([
      { name: "a.txt", text: [HEAD, game("Alpha")].join("\n") },
      { name: "b.txt", text: [HEAD, game("Bravo")].join("\n") },
      { name: "c.txt", text: [HEAD, game("Charlie")].join("\n") },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.text.split("\n").filter((l) => l === HEAD)).toHaveLength(1);
    expect(out.lines).toBe(3);

    // And the proof that matters: the parser sees three real games.
    const parsed = parsePastedSchedule(out.text, { division: "X", year: 2026 });
    expect(parsed.matches.map((m) => m.home)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("refuses to mix a schedule with a standings table", () => {
    // The first line decides how the whole paste is read, so a run of both
    // is a question with no right answer.
    const out = mergeScheduleFiles([
      { name: "fixtures.txt", text: [HEAD, game("Alpha")].join("\n") },
      { name: "standings.txt", text: [TABLE, "Alpha\t3\t3\t0\t0\t9\t1\t9"].join("\n") },
    ]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    // Named, so nobody has to open nine files to find the odd one.
    expect(out.error).toContain("standings.txt");
    expect(out.error).toContain("fixtures.txt");
  });

  it("merges standings files the same way", () => {
    const out = mergeScheduleFiles([
      { name: "a.txt", text: [TABLE, "Alpha\t3\t3\t0\t0\t9\t1\t9"].join("\n") },
      { name: "b.txt", text: [TABLE, "Bravo\t3\t0\t0\t3\t1\t9\t0"].join("\n") },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.kind).toBe("standings");
    expect(out.lines).toBe(2);
    expect(out.text.split("\n").filter((l) => l === TABLE)).toHaveLength(1);
  });

  it("takes plain pastes with no header at all", () => {
    // What a person gets copying a table straight out of a page.
    const out = mergeScheduleFiles([
      { name: "a.txt", text: "9:00 AM\tAlpha\t2\t1\tBravo\tField 1" },
      { name: "b.txt", text: "11:00 AM\tCharlie\t0\t0\tDelta\tField 2" },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.kind).toBe("raw");
    expect(out.lines).toBe(2);
  });

  it("will not mix a plain paste with a canonical one", () => {
    // The header would arrive halfway down, after rows the parser has
    // already read another way.
    const out = mergeScheduleFiles([
      { name: "raw.txt", text: "9:00 AM\tAlpha\t2\t1\tBravo\tField 1" },
      { name: "saved.txt", text: [HEAD, game("Alpha")].join("\n") },
    ]);
    expect(out.ok).toBe(false);
  });

  it("ignores blank lines and files that hold nothing", () => {
    const out = mergeScheduleFiles([
      { name: "empty.txt", text: "\n\n  \n" },
      { name: "a.txt", text: [HEAD, "", game("Alpha"), ""].join("\n") },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.lines).toBe(1);
  });

  it("says so when there is nothing in any of them", () => {
    const out = mergeScheduleFiles([{ name: "empty.txt", text: "   " }]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/empty/i);
  });
});
