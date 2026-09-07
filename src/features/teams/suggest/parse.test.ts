import { describe, expect, it } from "vitest";

import { parseSuggestions } from "./parse";

const known = {
  newIds: new Set(["new-1", "new-2"]),
  existingIds: new Set(["old-1", "old-2"]),
};

const wrap = (matches: unknown) => JSON.stringify({ matches });

describe("parseSuggestions", () => {
  it("takes a well-formed answer", () => {
    expect(
      parseSuggestions(
        wrap([
          { newId: "new-1", existingId: "old-1", confidence: "high", why: "Junior side" },
        ]),
        known,
      ),
    ).toEqual([
      { newId: "new-1", existingId: "old-1", confidence: "high", why: "Junior side" },
    ]);
  });

  it("reads JSON out of a code fence or a sentence", () => {
    // Which is how models answer, whatever the instructions said.
    const body = '{"matches":[{"newId":"new-1","existingId":"old-1","confidence":"medium","why":"x"}]}';
    expect(parseSuggestions("```json\n" + body + "\n```", known)).toHaveLength(1);
    expect(parseSuggestions("Sure! Here you go:\n" + body + "\nHope that helps.", known)).toHaveLength(1);
  });

  it("drops an id nobody sent", () => {
    /*
     * The one that matters: a hallucinated id is a foreign key violation at
     * best, and a merge of an unrelated team at worst.
     */
    expect(
      parseSuggestions(
        wrap([{ newId: "made-up", existingId: "old-1", confidence: "high", why: "x" }]),
        known,
      ),
    ).toEqual([]);
    expect(
      parseSuggestions(
        wrap([{ newId: "new-1", existingId: "also-made-up", confidence: "high", why: "x" }]),
        known,
      ),
    ).toEqual([]);
  });

  it("refuses to pair a team with itself", () => {
    const same = { newIds: new Set(["a"]), existingIds: new Set(["a"]) };
    expect(
      parseSuggestions(
        wrap([{ newId: "a", existingId: "a", confidence: "high", why: "x" }]),
        same,
      ),
    ).toEqual([]);
  });

  it("keeps a pair once, whichever way round it is repeated", () => {
    const both = { newIds: new Set(["a", "b"]), existingIds: new Set(["a", "b"]) };
    expect(
      parseSuggestions(
        wrap([
          { newId: "a", existingId: "b", confidence: "high", why: "one" },
          { newId: "b", existingId: "a", confidence: "medium", why: "two" },
        ]),
        both,
      ),
    ).toHaveLength(1);
  });

  it("refuses a confidence nobody offered", () => {
    // "certain" and "100%" are not levels this queue knows how to show.
    for (const confidence of ["certain", "very high", "", "100%"]) {
      expect(
        parseSuggestions(
          wrap([{ newId: "new-1", existingId: "old-1", confidence, why: "x" }]),
          known,
        ),
      ).toEqual([]);
    }
  });

  it("caps the answer, however long it is", () => {
    const many = Array.from({ length: 200 }, () => ({
      newId: "new-1",
      existingId: "old-1",
      confidence: "high",
      why: "x",
    }));
    // Deduping leaves one here; the cap is what stops a runaway answer from
    // filling the queue in the first place.
    expect(parseSuggestions(wrap(many), known, 5).length).toBeLessThanOrEqual(5);
  });

  it("trims a rationale down to a sentence", () => {
    // Shown beside the pair; a paragraph reads as authority it has not earned.
    const long = "x".repeat(500);
    const [s] = parseSuggestions(
      wrap([{ newId: "new-1", existingId: "old-1", confidence: "high", why: long }]),
      known,
    );
    expect(s.why.length).toBeLessThanOrEqual(200);
  });

  it("says nothing for anything that is not an answer", () => {
    for (const raw of ["", "no", "{}", '{"matches":"soon"}', "null", "<html>"]) {
      expect(parseSuggestions(raw, known)).toEqual([]);
    }
  });
});
