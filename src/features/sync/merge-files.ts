import { CANONICAL_HEADER } from "./paste";
import { readStandingsHeader } from "./standings-paste";

/**
 * Joining several saved files into one paste.
 *
 * A collection often arrives in pieces — one file per sitting, or per flight,
 * or fixtures saved separately from standings — and the obvious move is to
 * concatenate them. The obvious move is wrong: every file carries its own
 * header row, and the parser reads the second one as a FIXTURE. It produces a
 * game called "home v away" with no date, does not count it as skipped, and
 * nobody sees it until it is on a team's page.
 *
 * So the headers are folded down to one, and files of different kinds are
 * refused rather than mixed: the first line decides whether a paste is read
 * as a schedule or as a standings table, and a run of both is a question with
 * no right answer.
 *
 * Pure, and takes the text rather than the File objects, so the rule can be
 * tested without a browser.
 */

export type NamedText = { name: string; text: string };

export type MergeResult =
  | { ok: true; text: string; lines: number; kind: Kind }
  | { ok: false; error: string };

type Kind = "fixtures" | "standings" | "raw";

const CANONICAL = CANONICAL_HEADER.join("\t");

/** Whether a line is a header, and which kind it opens. */
function headerKind(line: string): Kind | null {
  const cells = line.split("\t").map((c) => c.trim().toLowerCase());
  if (readStandingsHeader(line)) return "standings";
  const canonical = CANONICAL_HEADER as readonly string[];
  const named = cells.filter((c) => canonical.includes(c.replace(/\s+/g, "_")));
  // Home and away are the two a fixture header cannot do without, the same
  // pair the schedule parser requires before it will trust a header at all.
  return named.includes("home") && named.includes("away") ? "fixtures" : null;
}

const lines = (text: string) =>
  text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");

export function mergeScheduleFiles(files: NamedText[]): MergeResult {
  const parsed = files
    .map((f) => ({ name: f.name, rows: lines(f.text) }))
    .filter((f) => f.rows.length > 0);

  if (parsed.length === 0) return { ok: false, error: "Those files are empty." };

  const kinds = parsed.map((f) => ({ name: f.name, kind: headerKind(f.rows[0]) ?? "raw" }));
  const first = kinds[0].kind;
  const odd = kinds.find((k) => k.kind !== first);
  if (odd) {
    /*
     * Named, not counted. "2 files do not match" leaves somebody opening each
     * of nine files to find which; the one that differs is the answer.
     */
    return {
      ok: false,
      error: `${odd.name} is a ${odd.kind === "raw" ? "plain paste" : odd.kind} table and ${kinds[0].name} is ${first === "raw" ? "a plain paste" : first} — import them separately.`,
    };
  }

  const out: string[] = [];
  parsed.forEach((file, i) => {
    file.rows.forEach((row, j) => {
      // Every file's header but the first one's: the same row, read as a game.
      if (j === 0 && i > 0 && headerKind(row)) return;
      out.push(row);
    });
  });

  return {
    ok: true,
    text: out.join("\n"),
    // What the person should recognise: rows they will import, not lines.
    lines: first === "raw" ? out.length : out.length - 1,
    kind: first,
  };
}

/** The canonical schedule header, for callers that want to show it. */
export const CANONICAL_LINE = CANONICAL;
