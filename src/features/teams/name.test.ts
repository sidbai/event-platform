import { describe, expect, it } from "vitest";

import { checkTeamName } from "./name";

describe("checkTeamName", () => {
  it("accepts an ordinary name", () => {
    expect(checkTeamName("Marymoor United")).toEqual({
      ok: true,
      name: "Marymoor United",
    });
  });

  it("tidies the spacing a paste brings with it", () => {
    // Imported names arrive with the platform's own spacing, and a rename is
    // usually an edit of one — "XF,  U14,   B12" pasted back in.
    expect(checkTeamName("  Crossfire   U14  Plackov ")).toEqual({
      ok: true,
      name: "Crossfire U14 Plackov",
    });
  });

  it("refuses a name that is not one", () => {
    expect(checkTeamName("")).toEqual({ ok: false, error: "Give the team a name." });
    expect(checkTeamName("   ")).toEqual({ ok: false, error: "Give the team a name." });
    expect(checkTeamName("X").ok).toBe(false);
    expect(checkTeamName(null).ok).toBe(false);
  });

  it("refuses a name longer than the column expects", () => {
    expect(checkTeamName("a".repeat(81)).ok).toBe(false);
    expect(checkTeamName("a".repeat(80)).ok).toBe(true);
  });

  it("keeps a name written in any script", () => {
    // 烙饼FC is a real team here, and a length rule counting bytes or ASCII
    // would refuse it.
    expect(checkTeamName("烙饼FC")).toEqual({ ok: true, name: "烙饼FC" });
  });
});
