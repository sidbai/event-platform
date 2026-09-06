import { describe, expect, it } from "vitest";

import {
  parseBirthYears,
  parseDivision,
  parseFeeCents,
  parseLocalDateTime,
  toLocalInput,
} from "./division-input";

const SEATTLE = "America/Los_Angeles";

const form = (over: Partial<Parameters<typeof parseDivision>[0]> = {}) => ({
  name: "B2013 Premier",
  label: "",
  birthYears: "",
  format: "",
  rosterMin: "",
  rosterMax: "",
  fee: "",
  capacity: "",
  opensAt: "",
  closesAt: "",
  ...over,
});

describe("parseFeeCents", () => {
  it("reads plain dollars", () => {
    expect(parseFeeCents("850")).toEqual({ ok: true, value: 85000 });
  });

  it("takes the dollar sign and thousands separators organizers type", () => {
    expect(parseFeeCents("$1,200")).toEqual({ ok: true, value: 120000 });
  });

  it("does not lose a cent to floating point", () => {
    // 1200.50 * 100 is 120050.00000000001; truncating gives $1,200.49.
    expect(parseFeeCents("1200.50")).toEqual({ ok: true, value: 120050 });
    expect(parseFeeCents("850.29")).toEqual({ ok: true, value: 85029 });
  });

  it("treats blank and zero alike, as free", () => {
    // formatFee renders null as "Free". A $0 division is free; showing "$0"
    // would be a second way to say the same thing.
    expect(parseFeeCents("")).toEqual({ ok: true, value: null });
    expect(parseFeeCents("0")).toEqual({ ok: true, value: null });
    expect(parseFeeCents("0.00")).toEqual({ ok: true, value: null });
  });

  it("refuses what is not money", () => {
    for (const bad of ["eight fifty", "850.123", "-50", "8 5 0", "1.2.3"]) {
      expect(parseFeeCents(bad).ok).toBe(false);
    }
  });

  it("refuses a fee that is off by a factor of a hundred", () => {
    expect(parseFeeCents("85000").ok).toBe(false);
  });
});

describe("parseBirthYears", () => {
  it("takes the separators flyers use", () => {
    for (const raw of ["2013 2014", "2013,2014", "2013/2014", "2013, 2014"]) {
      expect(parseBirthYears(raw)).toEqual({ ok: true, value: [2013, 2014] });
    }
  });

  it("sorts and de-duplicates, so two spellings compare equal", () => {
    expect(parseBirthYears("2014/2013/2014")).toEqual({
      ok: true,
      value: [2013, 2014],
    });
  });

  it("has no years when nothing was typed", () => {
    expect(parseBirthYears("  ")).toEqual({ ok: true, value: [] });
  });

  it("catches a typed year that cannot be one", () => {
    expect(parseBirthYears("1013").ok).toBe(false);
    expect(parseBirthYears("13").ok).toBe(false);
    expect(parseBirthYears("U13").ok).toBe(false);
  });
});

describe("parseLocalDateTime", () => {
  it("reads the time as the organizer's own, not UTC", () => {
    // 6pm in Seattle in September is 01:00 UTC the next day. Reading the
    // string as UTC would close registration eight hours early.
    const r = parseLocalDateTime("2026-09-12T18:00", SEATTLE);
    expect(r.ok && r.value?.toISOString()).toBe("2026-09-13T01:00:00.000Z");
  });

  it("handles a date on the other side of a daylight-saving change", () => {
    // Seattle is UTC-8 in January, UTC-7 in September. A fixed offset would
    // put one of these an hour out.
    const winter = parseLocalDateTime("2026-01-12T18:00", SEATTLE);
    expect(winter.ok && winter.value?.toISOString()).toBe("2026-01-13T02:00:00.000Z");
  });

  it("is nothing when nothing was set", () => {
    expect(parseLocalDateTime("", SEATTLE)).toEqual({ ok: true, value: null });
  });

  it("refuses a value it cannot read", () => {
    expect(parseLocalDateTime("September 12th", SEATTLE).ok).toBe(false);
  });
});

describe("parseDivision", () => {
  it("builds a division from the least an organizer can type", () => {
    const r = parseDivision(form(), SEATTLE);
    expect(r).toEqual({
      ok: true,
      value: {
        name: "B2013 Premier",
        label: null,
        birthYears: [],
        format: null,
        rosterMin: null,
        rosterMax: null,
        feeCents: null,
        capacity: null,
        registrationOpensAt: null,
        registrationClosesAt: null,
      },
    });
  });

  it("insists on a name", () => {
    expect(parseDivision(form({ name: "   " }), SEATTLE)).toEqual({
      ok: false,
      error: "Give the division a name.",
    });
  });

  it("only takes a format it knows how to play", () => {
    expect(parseDivision(form({ format: "9v9" }), SEATTLE).ok).toBe(true);
    expect(parseDivision(form({ format: "8v8" }), SEATTLE).ok).toBe(false);
  });

  it("catches a roster minimum above its maximum", () => {
    const r = parseDivision(form({ rosterMin: "14", rosterMax: "12" }), SEATTLE);
    expect(r).toEqual({ ok: false, error: "Roster minimum is above the maximum." });
  });

  it("allows a minimum equal to the maximum", () => {
    // A division that wants exactly twelve is a real thing to want.
    expect(parseDivision(form({ rosterMin: "12", rosterMax: "12" }), SEATTLE).ok).toBe(
      true,
    );
  });

  it("catches a registration window that closes before it opens", () => {
    const r = parseDivision(
      form({ opensAt: "2026-09-12T09:00", closesAt: "2026-09-01T09:00" }),
      SEATTLE,
    );
    expect(r).toEqual({ ok: false, error: "Registration closes before it opens." });
  });

  it("refuses a window that opens and closes at the same moment", () => {
    const r = parseDivision(
      form({ opensAt: "2026-09-12T09:00", closesAt: "2026-09-12T09:00" }),
      SEATTLE,
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a window with only one end set", () => {
    expect(parseDivision(form({ closesAt: "2026-09-12T09:00" }), SEATTLE).ok).toBe(true);
    expect(parseDivision(form({ opensAt: "2026-09-12T09:00" }), SEATTLE).ok).toBe(true);
  });

  it("carries every field through when they are all filled in", () => {
    const r = parseDivision(
      form({
        label: "Boys 2013 Premier",
        birthYears: "2013/2014",
        format: "9v9",
        rosterMin: "9",
        rosterMax: "16",
        fee: "$1,200.50",
        capacity: "8",
        opensAt: "2026-06-01T09:00",
        closesAt: "2026-08-15T23:59",
      }),
      SEATTLE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.birthYears).toEqual([2013, 2014]);
    expect(r.value.feeCents).toBe(120050);
    expect(r.value.capacity).toBe(8);
    expect(r.value.rosterMin).toBe(9);
    expect(r.value.registrationClosesAt?.toISOString()).toBe("2026-08-16T06:59:00.000Z");
  });
});

describe("toLocalInput", () => {
  it("round-trips a value through the parser unchanged", () => {
    for (const local of ["2026-09-12T18:00", "2026-01-05T07:30", "2026-08-15T23:59"]) {
      const parsed = parseLocalDateTime(local, SEATTLE);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(toLocalInput(parsed.value, SEATTLE)).toBe(local);
    }
  });

  it("renders in the event's zone, not the server's", () => {
    // 01:00 UTC is 6pm the previous day in Seattle.
    expect(toLocalInput(new Date("2026-09-13T01:00:00.000Z"), SEATTLE)).toBe(
      "2026-09-12T18:00",
    );
  });

  it("has nothing to render for an unset date", () => {
    expect(toLocalInput(null, SEATTLE)).toBe("");
  });
});
