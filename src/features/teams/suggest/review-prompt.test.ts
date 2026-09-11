import { describe, expect, it } from "vitest";

import {
  buildReviewPrompt,
  mergeDirection,
  parseVerdicts,
  type ReviewPair,
} from "./review-prompt";

const pair = (key: string, a: string, b: string): ReviewPair => ({
  key,
  a: { name: a, events: 1, matches: 8 },
  b: { name: b, events: 2, matches: 14 },
});

describe("buildReviewPrompt", () => {
  it("carries what the club's website said", () => {
    const prompt = buildReviewPrompt(
      { name: "Atletico FC", context: "a colour in a name is a squad, not a tier" },
      [pair("k1", "Atletico B13 Oro", "Atletico B13 Gold")],
    );
    expect(prompt).toContain("a colour in a name is a squad");
    expect(prompt).toContain("Atletico B13 Oro");
  });

  it("says plainly when we have read nothing, rather than saying nothing", () => {
    // Silence would read as "this club has no conventions", which is a
    // different claim from "we never looked".
    const prompt = buildReviewPrompt({ name: "Some FC", context: null }, [pair("k1", "A", "B")]);
    expect(prompt).toContain("We have read nothing");
    expect(prompt).toContain("prefer 'unsure'");
  });
});

describe("parseVerdicts", () => {
  const sent = new Set(["k1", "k2"]);

  it("reads a well-formed answer", () => {
    const out = parseVerdicts(
      '{"verdicts":[{"key":"k1","verdict":"same","why":"Academy is the same programme"}]}',
      sent,
    );
    expect(out).toEqual([{ key: "k1", verdict: "same", why: "Academy is the same programme" }]);
  });

  it("drops a key we never sent", () => {
    expect(parseVerdicts('{"verdicts":[{"key":"k9","verdict":"same","why":"x"}]}', sent)).toEqual([]);
  });

  it("drops a verdict nobody offered", () => {
    expect(parseVerdicts('{"verdicts":[{"key":"k1","verdict":"probably","why":"x"}]}', sent)).toEqual([]);
  });

  it("keeps the first answer when a key comes back twice", () => {
    const out = parseVerdicts(
      '{"verdicts":[{"key":"k1","verdict":"same","why":"first"},{"key":"k1","verdict":"different","why":"second"}]}',
      sent,
    );
    expect(out).toEqual([{ key: "k1", verdict: "same", why: "first" }]);
  });

  it("survives prose instead of an answer", () => {
    expect(parseVerdicts("I think the first pair is the same team.", sent)).toEqual([]);
  });

  it("accepts a verdict with no reason, since the verdict is the answer", () => {
    expect(parseVerdicts('{"verdicts":[{"key":"k2","verdict":"unsure"}]}', sent)).toEqual([
      { key: "k2", verdict: "unsure", why: "" },
    ]);
  });
});

describe("mergeDirection", () => {
  const row = (id: string, matches: number, events = 1) => ({ id, matches, events });

  it("keeps the row with more games", () => {
    expect(mergeDirection(row("a", 2), row("b", 30)).thick.id).toBe("b");
    expect(mergeDirection(row("b", 30), row("a", 2)).thick.id).toBe("b");
  });

  it("falls back to events when neither has played", () => {
    expect(mergeDirection(row("a", 0, 3), row("b", 0, 1)).thick.id).toBe("a");
  });

  it("is stable when the two are indistinguishable", () => {
    // Otherwise a nightly re-run writes the other half of the same pair, and
    // the queue fills with both directions of every question.
    expect(mergeDirection(row("a", 0, 0), row("b", 0, 0)).thick.id).toBe("b");
    expect(mergeDirection(row("b", 0, 0), row("a", 0, 0)).thick.id).toBe("b");
  });
});
