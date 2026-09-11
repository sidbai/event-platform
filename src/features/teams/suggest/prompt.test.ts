import { vocabularyFor } from "@/features/clubs/knowledge/store";
import { describe, expect, it } from "vitest";

import { buildPrompt, shortlist, type SuggestTeam } from "./prompt";

let n = 0;
const team = (over: Partial<SuggestTeam> & { name: string }): SuggestTeam => {
  n += 1;
  return {
    id: `t${n}`,
    club: "Warriors",
    birthYears: [2014, 2015],
    gender: "boys",
    tier: null,
    events: ["Labor Day Cup"],
    ...over,
  };
};

describe("shortlist", () => {
  it("keeps the candidates that share words with the name", () => {
    /*
     * Asking about one team against the whole directory cost 66,460 input
     * tokens and returned nothing. A thousand candidates in one prompt is a
     * haystack, not a question.
     */
    const target = team({ name: "Little Warriors B15 B" });
    const pool = [
      team({ name: "Warriors B14/15 EA" }),
      team({ name: "Crossfire Select BU12 A", club: "Crossfire Premier" }),
      team({ name: "Seattle Celtic G14 White", club: "Seattle Celtic" }),
    ];
    const out = shortlist(target, pool).map((t) => t.name);
    expect(out).toContain("Warriors B14/15 EA");
    expect(out).not.toContain("Seattle Celtic G14 White");
  });

  it("keeps a clubmate whose name shares nothing", () => {
    // How a rebranded side stays in view: the club is the only link left.
    const target = team({ name: "Thunder 2014" });
    const out = shortlist(target, [team({ name: "Lightning 2014" })]);
    expect(out).toHaveLength(1);
  });

  it("never offers the team itself", () => {
    const target = team({ name: "Warriors B14/15 EA" });
    expect(shortlist(target, [target])).toEqual([]);
  });

  it("caps the pool, so one question stays one question", () => {
    const target = team({ name: "Warriors Blue 2014" });
    const many = Array.from({ length: 40 }, (_, i) =>
      team({ name: `Warriors Blue ${i}` }),
    );
    expect(shortlist(target, many, 12)).toHaveLength(12);
  });

  it("says nothing rather than offering the unrelated", () => {
    const target = team({ name: "Thunder 2014", club: null });
    expect(shortlist(target, [team({ name: "Lightning 2016", club: null })])).toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("names every team it asks about, and asks for JSON only", () => {
    const prompt = buildPrompt(
      [team({ name: "Little Warriors B15 B" })],
      [team({ name: "Warriors B14/15 EA" })],
    );
    expect(prompt).toContain("Little Warriors B15 B");
    expect(prompt).toContain("Warriors B14/15 EA");
    expect(prompt).toContain('{"matches":[]}');
  });

  it("says what it does not know, rather than leaving a gap", () => {
    // "birth years unknown" is a fact about our data; a blank is an invitation
    // to invent one.
    const prompt = buildPrompt(
      [team({ name: "Mystery FC", club: null, birthYears: [], gender: null })],
      [team({ name: "Other FC" })],
    );
    expect(prompt).toContain("club unknown");
    expect(prompt).toContain("birth years unknown");
    expect(prompt).toContain("gender unknown");
  });
});

describe("what the club says, on the import path", () => {
  const team = (name: string, over: Partial<SuggestTeam> = {}): SuggestTeam => ({
    id: name,
    name,
    club: "Eastside FC",
    clubSlug: "eastside-fc",
    birthYears: [2014],
    gender: "boys",
    tier: null,
    events: [],
    ...over,
  });

  const eastside = vocabularyFor("eastside-fc");

  it("does not ask about a pair the club itself separates", () => {
    const arriving = team("Eastside FC BU12 Red");
    const known = [team("Eastside FC BU12 Grey"), team("Eastside FC BU12")];
    expect(shortlist(arriving, known, 12, eastside).map((t) => t.name)).toEqual([
      "Eastside FC BU12",
    ]);
  });

  it("asks as before when nothing has been read about the club", () => {
    const arriving = team("Some Club B14 Red", { club: "Some Club", clubSlug: "unread" });
    const known = [team("Some Club B14 Grey", { club: "Some Club", clubSlug: "unread" })];
    expect(shortlist(arriving, known, 12, vocabularyFor("unread"))).toHaveLength(1);
  });

  it("carries the club's conventions into the question", () => {
    const prompt = buildPrompt(
      [team("Eastside FC BU12 Red")],
      [team("Eastside FC BU12")],
      "a colour in a name is a tier",
    );
    expect(prompt).toContain("a colour in a name is a tier");
  });

  it("says plainly when we have read nothing, rather than saying nothing", () => {
    expect(buildPrompt([team("A")], [team("B")], null)).toContain("We have read nothing");
  });
});
