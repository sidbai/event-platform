import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes a name with commas in it", () => {
    // Real, and the reason this is not a join on ",".
    const csv = toCsv(["slug", "name"], [["xf-u14", "XF, U14, B12 - 13, RCL 1, Plackov"]]);
    expect(csv).toBe('slug,name\nxf-u14,"XF, U14, B12 - 13, RCL 1, Plackov"\n');
  });

  it("doubles a quote inside a field, as a spreadsheet expects", () => {
    expect(toCsv(["name"], [['Team "Blue"']])).toBe('name\n"Team ""Blue"""\n');
  });

  it("leaves an ordinary field alone", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\n1,2\n");
  });
});

describe("parseCsv", () => {
  it("round-trips what toCsv wrote", () => {
    const name = 'XF, U14, "B12-13", Plackov';
    const csv = toCsv(["slug", "name"], [["xf-u14", name]]);
    expect(parseCsv(csv)).toEqual([{ slug: "xf-u14", name }]);
  });

  it("reads a file a spreadsheet saved", () => {
    // CRLF, a trailing newline, and a row that stops early.
    const csv = "slug,gender,tier\r\nalpha,boys,ECNL 1\r\nbravo,girls\r\n";
    expect(parseCsv(csv)).toEqual([
      { slug: "alpha", gender: "boys", tier: "ECNL 1" },
      { slug: "bravo", gender: "girls", tier: "" },
    ]);
  });

  it("keeps a field that is only spaces as empty, and trims the rest", () => {
    expect(parseCsv("slug,gender\n alpha ,  \n")).toEqual([{ slug: "alpha", gender: "" }]);
  });

  it("ignores blank lines rather than reading them as teams", () => {
    expect(parseCsv("slug,gender\n\nalpha,boys\n\n")).toEqual([
      { slug: "alpha", gender: "boys" },
    ]);
  });

  it("has nothing to say about an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("keeps names outside ASCII intact", () => {
    const csv = toCsv(["slug", "name"], [["chibing-fc", "吃饼FC"]]);
    expect(parseCsv(csv)[0].name).toBe("吃饼FC");
  });
});
