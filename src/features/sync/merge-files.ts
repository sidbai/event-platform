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

/**
 * Whether one run of text holds both a schedule and a standings table.
 *
 * The copier collects both kinds into one basket, and its overlay puts both
 * in one box — so a person who collected fixtures and standings in the same
 * sitting can paste, or save and load, a file holding both.
 *
 * Read as a schedule, the standings header becomes a fixture: "l v pts", no
 * date, followed by a game for every team in the table. Nothing is reported
 * as skipped, which is what makes it worth a guard rather than a comment.
 */
export function holdsBothKinds(text: string): boolean {
  const rows = lines(text);
  const kinds = new Set(rows.map(headerKind).filter(Boolean));
  return kinds.has("fixtures") && kinds.has("standings");
}

export function mergeScheduleFiles(files: NamedText[]): MergeResult {
  const parsed = files
    .map((f) => ({ name: f.name, rows: lines(f.text) }))
    .filter((f) => f.rows.length > 0);

  if (parsed.length === 0) return { ok: false, error: "Those files are empty." };

  // A file holding both is the same mistake as two files holding one each,
  // and reaches the same wrong place, so it is caught in the same breath.
  const mixed = parsed.find((f) => holdsBothKinds(f.rows.join("\n")));
  if (mixed) {
    return {
      ok: false,
      error: `${mixed.name} holds both a schedule and a standings table — save or paste them separately.`,
    };
  }

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
