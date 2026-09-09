import { describe, expect, it } from "vitest";

import { CANONICAL_HEADER, parsePastedSchedule } from "./paste";
import { parsePastedStandings, readStandingsHeader } from "./standings-paste";

import { copierBookmarklet, copierSource, STANDINGS_HEADER } from "./copier";

/** The tool's own code, which the bookmark now loads rather than carries. */
const body = () => copierSource();

const bookmark = () => copierBookmarklet("https://kingjuansoccer.com");

/**
 * The bookmarklet's own functions, taken out of the artifact a person clicks.
 *
 * Not a second copy of the logic: this evaluates the exact string that ends
 * up in the bookmark, and with no document present it hands its functions
 * back instead of reading a page. A test against a copy would pass while the
 * bookmark was broken, which is the failure this file already exists for.
 */
type Basket = Record<string, { kind: string; lines: string[]; missing?: number }>;

function artifact(): {
  a1Fixture: (meta: string[], who: string[], tail: string[]) => string[];
  colWith: (head: string[], words: string[]) => number;
  tableRows: (table: unknown) => string[];
  missingFrom: (pageText: string, got: number) => number;
  collected: (
    basket: Basket,
    kind: string,
  ) => { lines: string[]; pages: number; missing: number };
  fileName: (host: string, now: number) => string;
} {
  return new Function(`return ${body()}`)();
}

/** Enough of a DOM for tableRows: rows of cells, each with innerText. */
function fakeTable(rows: string[][]) {
  const cell = (t: string) => ({ innerText: t });
  const trs = rows.map((r) => ({ children: r.map(cell) }));
  return { querySelectorAll: (sel: string) => (sel === "tr" ? trs : []) };
}

describe("the copier bookmarklet", () => {
  it("is valid JavaScript", () => {
    /*
     * The test the first version did not have, and the bug it would have
     * caught: minifying stripped the newlines but left the trailing `//`
     * comments, so each one swallowed the statement that followed it onto the
     * same line. The source was verified in a browser; the artifact was not,
     * and the artifact is what a person clicks.
     */
    expect(() => new Function(body())).not.toThrow();
  });

  it("carries no comment that has eaten the code after it", () => {
    for (const line of body().split("\n")) {
      const comment = line.indexOf("//");
      if (comment === -1) continue;
      expect(line.slice(comment)).not.toMatch(/\bvar\b|\breturn\b/);
    }
  });

  it("emits the columns the importer reads", () => {
    // The two halves have to agree on the header or every paste is skipped.
    expect(body()).toContain(JSON.stringify(CANONICAL_HEADER));
  });

  it("is short enough to live in a bookmark", () => {
    /*
     * The ceiling went 8,000, then 16,000, and then a browser refused the
     * address anyway — with no error, just a bookmark that did not work.
     * So the bookmark carries a loader now and the tool is served. A few
     * hundred characters is inside every limit anybody has ever hit.
     */
    expect(bookmark().length).toBeLessThan(2000);
  });

  it("loads the tool from this site, and says so when it cannot", () => {
    const url = bookmark();
    expect(url).toContain(encodeURIComponent("kingjuansoccer.com/copier.js"));
    // Silence is the alternative: a bookmark that does nothing at all.
    expect(decodeURIComponent(url)).toContain("alert(");
  });

  it("does not claim to know why the load failed", () => {
    /*
     * onerror reports that a script did not load, never why. The first
     * version of this said "its content policy blocks outside scripts",
     * which sent somebody looking at the wrong site entirely when the real
     * answer was our own server answering with a bot-protection challenge.
     */
    const message = decodeURIComponent(bookmark());
    expect(message).toMatch(/unreachable or refusing/);
    expect(message).toContain("kingjuansoccer.com");
    // Both candidates named, and a way to tell them apart.
    expect(message).toMatch(/Opening the address in a tab/);
  });

  it("asks the site being read for nothing", () => {
    /*
     * The property that makes this not a crawler. The loader fetches OUR
     * code from OUR origin; the tool it loads makes no request at all.
     */
    expect(body()).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|import\s*\(/);
  });

  it("asks for nothing from the network", () => {
    // The one property that makes this not a crawler: it reads what is
    // already on the screen.
    expect(body()).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|import\s*\(/);
  });

  it("emits the standings columns the standings importer reads", () => {
    // Both halves look these up by name. A column this emits under a name the
    // importer does not know is a column silently dropped.
    expect(readStandingsHeader(STANDINGS_HEADER.join("\t"))).not.toBeNull();
  });
});

/**
 * The same table, reached two ways.
 *
 * AthleteOne's own site prints "Teams & Venues" over three columns. The widget
 * it lends to a league's site prints "Team & Venue" over four, with the game
 * number first — theecnl.com loads that widget, and it calls the same API.
 * Fixed positions read the first and quietly mangled the second, putting the
 * game number where the date goes.
 */
describe("finding the columns", () => {
  const col = (head: string[], words: string[]) => artifact().colWith(head, words);

  it("finds them on AthleteOne's own three-column table", () => {
    const head = ["game info", "teams & venues", "details"];
    expect(col(head, ["game", "info"])).toBe(0);
    expect(col(head, ["team", "venue"])).toBe(1);
  });

  it("finds them past the game number, on the league-site widget", () => {
    // Live from theecnl.com, ECNL Boys Northwest BU15.
    const head = ["gm#", "game info", "team & venue", "details"];
    expect(col(head, ["game", "info"])).toBe(1);
    expect(col(head, ["team", "venue"])).toBe(2);
  });

  it("says so when a table is not one of these at all", () => {
    // The generic reader takes it instead, which is what the -1 is for.
    expect(col(["date", "home", "away", "score"], ["team", "venue"])).toBe(-1);
  });
});

describe("reading an AthleteOne fixture", () => {
  const a1 = (meta: string[], who: string[], tail: string[]) =>
    artifact().a1Fixture(meta, who, tail);

  it("pulls a played game out of three stacked cells", () => {
    // A real row from the 2026 Eastside FC Cup. Read generically, both teams
    // land in one field and the date and score are lost entirely.
    expect(
      a1(
        ["Aug 21, 2026", "09:10 AM", "GU08 - GU8 Red"],
        [
          "Washington Premier - G18 Black U8",
          "Eastside FC (WA) - Eastside FC GU8 White",
          "Starfire Sports Complex - Field 2B",
        ],
        ["11", "0", "Box Score"],
      ),
    ).toEqual([
      "Aug 21, 2026",
      "09:10 AM",
      "",
      "GU08 - GU8 Red",
      "Washington Premier - G18 Black U8",
      "11",
      "0",
      "Eastside FC (WA) - Eastside FC GU8 White",
      "Field 2B",
      "Starfire Sports Complex",
    ]);
  });

  it("leaves the score blank for a game not yet played", () => {
    const row = a1(
      ["Aug 21, 2026", "09:10 AM", "GU08 - GU8 Red"],
      ["Home FC", "Away FC", "Starfire Sports Complex - Field 2B"],
      ["Box Score"],
    );
    expect(row[5]).toBe("");
    expect(row[6]).toBe("");
  });

  it("splits the venue at the last dash, because club names contain them", () => {
    const row = a1(
      ["Aug 21, 2026", "09:10 AM", "BU12 - BU12 Grey"],
      ["Home FC", "Away FC", "Starfire Sports - Complex B - Field 11A"],
      [],
    );
    expect(row[8]).toBe("Field 11A");
    expect(row[9]).toBe("Starfire Sports - Complex B");
  });

  it("survives a venue cell with no field in it", () => {
    const row = a1(["Aug 21, 2026", "09:10 AM", "d"], ["H", "A", "Marymoor Park"], []);
    expect(row[8]).toBe("");
    expect(row[9]).toBe("Marymoor Park");
  });

  it("hands the importer rows it reads as real fixtures", () => {
    // The round trip that matters: what the bookmarklet writes is what the
    // paste box parses, with the date, the kick-off and the score intact.
    const lines = [
      CANONICAL_HEADER.join("\t"),
      a1(
        ["Aug 21, 2026", "09:10 AM", "GU08 - GU8 Red"],
        ["Washington Premier - G18 Black U8", "Eastside FC - GU8 White", "Starfire - Field 2B"],
        ["11", "0", "Box Score"],
      ).join("\t"),
    ].join("\n");

    const { matches, skipped } = parsePastedSchedule(lines, {
      division: "Unassigned",
      year: 2026,
    });
    expect(skipped).toEqual([]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      date: "2026-08-21",
      time: "09:10",
      division: "GU08 - GU8 Red",
      home: "Washington Premier - G18 Black U8",
      away: "Eastside FC - GU8 White",
      homeScore: 11,
      awayScore: 0,
    });
  });
});

describe("reading a standings table", () => {
  /** The header AthleteOne prints, verbatim. */
  const HEAD = ["Pos", "Teams", "GP", "Wins", "Losses", "Draws", "GF", "GA", "GD", "PPG", "PTS", ""];

  it("reads its columns by name, not by position", () => {
    // GD and PPG sit between the columns we want, and Teams is plural — read
    // by position, every number would be one column out.
    // Distinct wins, draws and losses on purpose: AthleteOne prints them as
    // Wins, Losses, Draws and this emits w, d, l, so a row of zeroes would
    // pass whether or not the two agree.
    const rows = artifact().tableRows(
      fakeTable([
        HEAD,
        ["3", "Eastside FC (WA) - GU8 White", "3", "0", "2", "1", "0", "14", "-14", "0.33", "1", "View Results"],
      ]),
    );
    // team, gp, w, d, l, gf, ga, pts
    expect(rows).toEqual(["Eastside FC (WA) - GU8 White\t3\t0\t1\t2\t0\t14\t1"]);
  });

  it("ignores a table that is not a standing", () => {
    // A schedule has neither a team column nor points, and reading one as a
    // table would invent a league nobody played.
    expect(
      artifact().tableRows(
        fakeTable([
          ["Game Info", "Teams & Venues", "Game #"],
          ["Aug 21, 2026", "Home FC Away FC", "1126771"],
        ]),
      ),
    ).toEqual([]);
  });

  it("drops a row with no team on it", () => {
    expect(
      artifact().tableRows(fakeTable([HEAD, ["", "", "", "", "", "", "", "", "", "", "", ""]])),
    ).toEqual([]);
  });

  it("hands the importer rows it reads as a real table", () => {
    const rows = artifact().tableRows(
      fakeTable([
        HEAD,
        ["1", "Eastside FC - GU8 Red", "3", "3", "0", "0", "17", "1", "16", "3.00", "9", "View Results"],
        ["2", "Seattle United - G18 Copa", "3", "2", "0", "1", "12", "1", "11", "2.33", "7", "View Results"],
      ]),
    );
    const { rows: parsed, skipped } = parsePastedStandings(
      [STANDINGS_HEADER.join("\t"), ...rows].join("\n"),
    );
    expect(skipped).toEqual([]);
    expect(parsed).toEqual([
      {
        team: "Eastside FC - GU8 Red",
        played: 3,
        won: 3,
        drawn: 0,
        lost: 0,
        gf: 17,
        ga: 1,
        points: 9,
      },
      {
        team: "Seattle United - G18 Copa",
        played: 3,
        won: 2,
        drawn: 1,
        lost: 0,
        gf: 12,
        ga: 1,
        points: 7,
      },
    ]);
  });
});

describe("collecting across flights", () => {
  it("counts what the page says is not on screen", () => {
    /*
     * AthleteOne paginates at ten. A basket holding ten of thirty-four is
     * the worst outcome available here — it looks complete — so the shortfall
     * is read off the pager and said out loud.
     */
    const { missingFrom } = artifact();
    expect(missingFrom("Lines per page 1–10 of 34", 10)).toBe(24);
    // An ordinary hyphen, because that is what the next platform will print.
    expect(missingFrom("Lines per page 1-10 of 34", 10)).toBe(24);
  });

  it("says nothing is missing when the page is whole", () => {
    const { missingFrom } = artifact();
    expect(missingFrom("Lines per page 1–10 of 10", 10)).toBe(0);
    expect(missingFrom("Lines per page 1–200 of 34", 34)).toBe(0);
    // A page with no pager at all is not a page missing rows.
    expect(missingFrom("just a schedule", 7)).toBe(0);
  });

  it("keeps fixtures and standings in separate piles", () => {
    // They go into different paste boxes, and one header cannot describe both.
    const { collected } = artifact();
    const basket = {
      "/schedules/1": { kind: "fixtures", lines: ["a", "b"] },
      "/standings/1": { kind: "standings", lines: ["s"] },
      "/schedules/2": { kind: "fixtures", lines: ["c"] },
    };
    expect(collected(basket, "fixtures")).toEqual({
      lines: ["a", "b", "c"],
      pages: 2,
      missing: 0,
    });
    expect(collected(basket, "standings")).toEqual({
      lines: ["s"],
      pages: 1,
      missing: 0,
    });
  });

  it("adds up what was missed across every page", () => {
    const { collected } = artifact();
    const basket = {
      "/schedules/1": { kind: "fixtures", lines: ["a"], missing: 24 },
      "/schedules/2": { kind: "fixtures", lines: ["b"], missing: 6 },
    };
    expect(collected(basket, "fixtures").missing).toBe(30);
  });

  it("is empty rather than undefined for a kind nobody collected", () => {
    const { collected } = artifact();
    expect(collected({}, "fixtures")).toEqual({ lines: [], pages: 0, missing: 0 });
  });
});

describe("saving what was collected", () => {
  const day = Date.parse("2026-09-08T19:30:00Z");

  it("names the file after where it came from and when", () => {
    // The two questions asked of a file found a week later.
    expect(artifact().fileName("app.athleteone.com", day)).toBe(
      "schedule-app.athleteone.com-2026-09-08.txt",
    );
  });

  it("is .txt, not .csv", () => {
    /*
     * These rows carry team names like "XF, U14, B12 - 13, RCL 1". A
     * spreadsheet opening that as CSV splits one team across four columns,
     * and the person doing the importing would never see it happen.
     */
    expect(artifact().fileName("x.test", day)).toMatch(/\.txt$/);
  });

  it("drops www, which is not part of where it came from", () => {
    expect(artifact().fileName("www.crossfiresoccer.org", day)).toBe(
      "schedule-crossfiresoccer.org-2026-09-08.txt",
    );
  });

  it("never builds a name out of characters a filesystem refuses", () => {
    const name = artifact().fileName("../../etc/pa ss wd", day);
    expect(name).not.toMatch(/[/\\ ]/);
    expect(name).toBe("schedule-....etcpasswd-2026-09-08.txt");
  });

  it("still names something when the page has no host", () => {
    expect(artifact().fileName("", 0)).toBe("schedule-source-1970-01-01.txt");
  });
});
