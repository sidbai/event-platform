import { describe, expect, it } from "vitest";

import { capitalize, hhmm, logoBasename } from "./feed-format";

describe("logoBasename", () => {
  it("pulls the filename from a raw URL", () => {
    expect(
      logoBasename("https://raw.githubusercontent.com/x/y/main/logos/weibing-fc.png"),
    ).toBe("weibing-fc.png");
  });
  it("strips a query string", () => {
    expect(logoBasename("https://cdn.example.com/a/b.PNG?v=2")).toBe("b.PNG");
  });
  it("passes null through", () => {
    expect(logoBasename(null)).toBeNull();
  });
});

describe("hhmm", () => {
  it("formats to 24h HH:MM in the given timezone", () => {
    const d = new Date("2026-08-29T16:00:00Z"); // 09:00 PT
    expect(hhmm(d, "America/Los_Angeles")).toBe("09:00");
  });
});

describe("capitalize", () => {
  it("capitalizes knockout round labels", () => {
    expect(capitalize("semi")).toBe("Semi");
    expect(capitalize("final")).toBe("Final");
    expect(capitalize("")).toBe("");
  });
});
