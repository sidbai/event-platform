/**
 * Asking a model about the pairs the rules could not decide.
 *
 * The deterministic matcher is good at ruling pairs out and has nothing left
 * to say about what remains. Against the directory it gets 1,625 candidate
 * pairs down to 259, and every one of those 259 is a genuine question: is
 * "Mt. Rainier FC Academy B12/13" the same side as "Mt. Rainier FC B12/13"?
 * No regular expression can answer that. It depends on whether this club runs
 * an Academy as a separate programme or as a word it sometimes drops — which
 * is a fact about the club, published on the club's own website, and now
 * collected in the knowledge base.
 *
 * So the question carries that context, and is asked one club at a time: a
 * club's pairs all turn on the same handful of facts, and repeating those
 * facts per pair pays for them once per pair.
 */

export type ReviewPair = {
  /** Stable, and checked against what was sent when the answer comes back. */
  key: string;
  a: { name: string; events: number; matches: number };
  b: { name: string; events: number; matches: number };
};

export type Verdict = {
  key: string;
  /** "same" is a recommendation; "different" is a pair worth not asking again. */
  verdict: "same" | "different" | "unsure";
  why: string;
};

export const REVIEW_SYSTEM = [
  "You decide whether two youth soccer team records describe the same real team.",
  "Answer from the names and the club facts you are given, and say 'unsure' whenever they do not settle it.",
  "A club's A team is not its B team; its second squad is not its first; its ECNL side is not its league side.",
  "Different birth years are different children. A colour may name a squad or a tier — the club facts say which.",
  "A merge cannot be undone, so 'unsure' is a good answer and a wrong 'same' is an expensive one.",
].join(" ");

function line(p: ReviewPair): string {
  const held = (t: ReviewPair["a"]) => `${t.matches} games across ${t.events} event(s)`;
  return [
    `- ${p.key}`,
    `    A: ${p.a.name}  (${held(p.a)})`,
    `    B: ${p.b.name}  (${held(p.b)})`,
  ].join("\n");
}

export function buildReviewPrompt(
  club: { name: string; context: string | null },
  pairs: ReviewPair[],
): string {
  return [
    `Club: ${club.name}`,
    club.context
      ? `What this club's own website says about how it names teams: ${club.context}`
      : "We have read nothing about how this club names its teams. Judge from the names alone, and prefer 'unsure'.",
    "",
    "These pairs of records are from that club. For each, is it one team recorded twice?",
    "",
    ...pairs.map(line),
    "",
    'Answer with JSON only: {"verdicts":[{"key":"…","verdict":"same|different|unsure","why":"one short sentence"}]}',
    "Give a verdict for every key above and invent no others.",
  ].join("\n");
}

/**
 * Which of the two rows the other should fold into.
 *
 * The richer row survives, so a pair is stored with the thinner side as the
 * one being merged away. Getting this backwards proposes folding a season of
 * fixtures into a row that has none — recoverable, but only by somebody who
 * notices, and the queue is read quickly.
 *
 * Ties break on the id so the direction is stable: the same pair asked about
 * on two nights must produce the same row, or the queue fills with both
 * halves of every pair.
 */
export function mergeDirection<T extends { id: string; matches: number; events: number }>(
  a: T,
  b: T,
): { thin: T; thick: T } {
  const weight = (t: T) => [t.matches, t.events] as const;
  const [wa, wb] = [weight(a), weight(b)];
  if (wa[0] !== wb[0]) return wa[0] < wb[0] ? { thin: a, thick: b } : { thin: b, thick: a };
  if (wa[1] !== wb[1]) return wa[1] < wb[1] ? { thin: a, thick: b } : { thin: b, thick: a };
  return a.id < b.id ? { thin: a, thick: b } : { thin: b, thick: a };
}

const VERDICTS = new Set(["same", "different", "unsure"]);

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The answer, read on the assumption that it is wrong.
 *
 * A key we did not send is dropped rather than repaired: the alternative is
 * guessing which pair a model meant, and a wrong guess here writes a
 * recommendation to merge two real teams' histories.
 */
export function parseVerdicts(raw: string, sent: ReadonlySet<string>): Verdict[] {
  const value = extractJson(raw);
  const list = (value as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: Verdict[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const key = typeof v.key === "string" ? v.key.trim() : "";
    const verdict = typeof v.verdict === "string" ? v.verdict.toLowerCase().trim() : "";
    if (!sent.has(key) || seen.has(key) || !VERDICTS.has(verdict)) continue;
    seen.add(key);
    out.push({
      key,
      verdict: verdict as Verdict["verdict"],
      // Kept short: it is shown beside the pair, and a paragraph of reasoning
      // reads as authority the verdict has not earned.
      why: (typeof v.why === "string" ? v.why.trim() : "").replace(/\s+/g, " ").slice(0, 200),
    });
  }
  return out;
}
