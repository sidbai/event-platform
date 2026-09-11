import { describe, expect, it } from "vitest";

import { readable, tellsUsSomething, withoutRepeatedFurniture } from "./text";

describe("readable", () => {
  it("drops script and style, keeps the prose", () => {
    const html = `
      <style>.a{color:red}</style>
      <script>var teams = ["nonsense"];</script>
      <div><h2>Boys Teams</h2><p>B13 Elite</p></div>`;
    expect(readable(html)).toBe("Boys Teams\nB13 Elite");
  });

  it("keeps one line per block, so a coach list stays a list", () => {
    const html = "<ul><li>Ana Ruiz — B13 Elite</li><li>Sam Cole — G14 Premier</li></ul>";
    expect(readable(html).split("\n")).toEqual(["Ana Ruiz — B13 Elite", "Sam Cole — G14 Premier"]);
  });

  it("unescapes entities, including numeric ones", () => {
    expect(readable("<p>Boys &amp; Girls &#8212; U13&nbsp;Elite</p>")).toBe("Boys & Girls — U13 Elite");
  });

  it("collapses a repeated nav line", () => {
    expect(readable("<div>Teams</div><div>Teams</div><div>Coaches</div>")).toBe("Teams\nCoaches");
  });

  it("stops at the cap", () => {
    const html = Array.from({ length: 500 }, (_, i) => `<p>Line number ${i}</p>`).join("");
    expect(readable(html, 200).length).toBeLessThanOrEqual(220);
  });
});

describe("tellsUsSomething", () => {
  it("is false for a page that is only navigation", () => {
    expect(tellsUsSomething("Home\nAbout\nContact\nDonate")).toBe(false);
  });

  it("is true once a page starts naming teams", () => {
    expect(
      tellsUsSomething("B13 Elite\nG14 Premier\nU12 Select\nHead Coach Ana Ruiz"),
    ).toBe(true);
  });
});

describe("withoutRepeatedFurniture", () => {
  const page = (url: string, text: string) => ({ url, text });

  it("says a club's menu once", () => {
    const out = withoutRepeatedFurniture([
      page("/a", "ACADEMY\nPREMIER\nOur academy runs U8 to U12."),
      page("/b", "ACADEMY\nPREMIER\nPremier plays RCL."),
    ]);
    expect(out[1].text).toBe("Premier plays RCL.");
  });

  it("keeps the first page whole", () => {
    const out = withoutRepeatedFurniture([page("/a", "ACADEMY\nACADEMY")]);
    expect(out[0].text).toBe("ACADEMY\nACADEMY");
  });

  it("keeps a line that is only repeated within one later page", () => {
    // Deduplication is across pages; a genuine repeat inside one page was
    // already handled when the page was read.
    const out = withoutRepeatedFurniture([page("/a", "Home"), page("/b", "B13 Red\nB13 Red")]);
    expect(out[1].text).toBe("B13 Red");
  });

  it("leaves a single page alone", () => {
    const out = withoutRepeatedFurniture([page("/a", "Anything at all")]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Anything at all");
  });
});
