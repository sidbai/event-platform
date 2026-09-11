import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeLogo, extensionFor, logosIn, MAX_LOGO_BYTES, readGotSportLogos } from "./bundle-logos";

const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

describe("logosIn", () => {
  it("reads league → team → data URL from the reserved key, and nothing else", () => {
    const bundle = {
      "WPL U11-U14 Fall": { "BU11 Premier 1": "<table></table>" },
      __logos: { "WPL U11-U14 Fall": { "RMG Soccer Academy Panthers B15": PNG, junk: "https://x/y.png" } },
    };
    const logos = logosIn(bundle);
    expect([...logos.keys()]).toEqual(["WPL U11-U14 Fall"]);
    expect([...logos.get("WPL U11-U14 Fall")!.keys()]).toEqual(["RMG Soccer Academy Panthers B15"]);
  });

  it("is empty for a bundle that carries none", () => {
    expect(logosIn({ "GA League": { "Pacific-Northwest U13": "<table></table>" } }).size).toBe(0);
    expect(logosIn(null).size).toBe(0);
  });
});

describe("decodeLogo", () => {
  it("accepts the image types an upload form accepts", () => {
    const out = decodeLogo(PNG)!;
    expect(out.type).toBe("image/png");
    expect([...out.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(extensionFor(out.type)).toBe("png");
    expect(decodeLogo("data:image/jpeg;base64,/9j/4A==")?.type).toBe("image/jpeg");
  });

  it("refuses what is not a badge", () => {
    expect(decodeLogo("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(decodeLogo("https://system.gotsport.com/x.png")).toBeNull();
    expect(decodeLogo("data:image/png;base64,")).toBeNull();
    const big = "data:image/png;base64," + Buffer.alloc(MAX_LOGO_BYTES + 1).toString("base64");
    expect(decodeLogo(big)).toBeNull();
  });
});

describe("readGotSportLogos", () => {
  it("pairs each badge with the team beside it, off the saved page", () => {
    const html = readFileSync(join(process.cwd(), "tests/fixtures/gotsport/schedule-55357-bu11.html"), "utf8");
    const logos = readGotSportLogos(html);
    expect(logos.size).toBeGreaterThan(3);
    expect(logos.get("RMG Soccer Academy Panthers B15")).toMatch(/RMG_Logo/);
  });
});
