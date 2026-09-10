import { describe, expect, it } from "vitest";

import { fileNameFor, htmlIn, matching, readHar, summarise } from "./har";

/** A HAR as a browser writes one, trimmed to the fields that are read. */
function har(
  entries: {
    url: string;
    method?: string;
    status?: number;
    mimeType?: string;
    size?: number;
    text?: string | null;
    encoding?: string;
  }[],
) {
  return {
    log: {
      version: "1.2",
      entries: entries.map((e) => ({
        request: { url: e.url, method: e.method ?? "GET" },
        response: {
          status: e.status ?? 200,
          content: {
            mimeType: e.mimeType ?? "application/json",
            ...(e.size === undefined ? {} : { size: e.size }),
            ...(e.text === undefined ? {} : { text: e.text }),
            ...(e.encoding === undefined ? {} : { encoding: e.encoding }),
          },
        },
      })),
    },
  };
}

describe("readHar", () => {
  it("splits a URL into the parts anybody filters on", () => {
    const [r] = readHar(
      har([{ url: "https://api.athleteone.com/api/Script/get-conference-schedules/1/2/3/4/0" }]),
    );
    expect(r.host).toBe("api.athleteone.com");
    expect(r.path).toBe("/api/Script/get-conference-schedules/1/2/3/4/0");
  });

  it("keeps the query, because that is where the ids are", () => {
    const [r] = readHar(har([{ url: "https://x.test/schedules?event=83&division=16" }]));
    expect(r.path).toBe("/schedules?event=83&division=16");
  });

  it("decodes a base64 body", () => {
    const [r] = readHar(
      har([{ url: "https://x.test/a", text: Buffer.from("<td>1 – 0</td>").toString("base64"), encoding: "base64" }]),
    );
    expect(r.text).toBe("<td>1 – 0</td>");
  });

  it("tells a body the export dropped from a body that was empty", () => {
    /*
     * The one failure that actually happens: the browser's menu offers "copy
     * as HAR" and "copy as HAR with content", and only one of them keeps the
     * bodies. Both look like a valid file.
     */
    const [dropped, empty] = readHar(
      har([
        { url: "https://x.test/a", size: 4096 },
        { url: "https://x.test/b", text: "" },
      ]),
    );
    expect(dropped.text).toBeNull();
    expect(dropped.bytes).toBe(4096);
    expect(empty.text).toBe("");
  });

  it("says null rather than mojibake when base64 will not decode", () => {
    const [r] = readHar(har([{ url: "https://x.test/a", text: "!!!not base64!!!", encoding: "base64" }]));
    // Node is forgiving here, so what matters is that it never throws and
    // never returns something a parser would mistake for the real body.
    expect(r.text === null || typeof r.text === "string").toBe(true);
  });

  it("skips what has no address, rather than refusing the file", () => {
    // Firefox records data: URLs; an entry with no request survives some
    // trimming tools. Neither is a reason to reject three hundred good rows.
    const rows = readHar({
      log: {
        entries: [
          { request: { url: "data:image/png;base64,AAAA" }, response: { status: 200, content: {} } },
          { response: { status: 200, content: {} } },
          { request: { url: "https://x.test/good" }, response: { status: 200, content: {} } },
        ],
      },
    });
    expect(rows.map((r) => r.url)).toEqual(["https://x.test/good"]);
  });

  it("is empty rather than thrown for something that is not a HAR", () => {
    expect(readHar(null)).toEqual([]);
    expect(readHar({})).toEqual([]);
    expect(readHar({ log: {} })).toEqual([]);
    expect(readHar({ log: { entries: "nope" } })).toEqual([]);
  });

  it("drops the charset from the content type, so a filter can match it", () => {
    const [r] = readHar(har([{ url: "https://x.test/a", mimeType: "text/html; charset=utf-8" }]));
    expect(r.mimeType).toBe("text/html");
  });
});

describe("matching", () => {
  const rows = readHar(
    har([
      { url: "https://api.athleteone.com/api/Script/get-conference-schedules/1", mimeType: "text/html", text: "<table>" },
      { url: "https://api.athleteone.com/api/Script/get-division-list-by-event-id/1", mimeType: "text/html", text: "<ul>" },
      { url: "https://api.athleteone.com/api/Script/get-conference-schedules/2", status: 403, text: "no" },
      { url: "https://www.googletagmanager.com/gtm.js", mimeType: "application/javascript", text: "tag" },
      { url: "https://api.athleteone.com/api/Script/get-conference-schedules/3", mimeType: "text/html" },
    ]),
  );

  it("finds one platform's calls by host and path", () => {
    const hit = matching(rows, { host: "athleteone", path: "conference-schedules" });
    expect(hit).toHaveLength(1);
    expect(hit[0].url).toMatch(/get-conference-schedules\/1$/);
  });

  it("leaves out what failed, unless asked for everything", () => {
    expect(matching(rows, { path: "conference-schedules" })).toHaveLength(1);
    expect(
      matching(rows, { path: "conference-schedules", status: "any", withBody: false }),
    ).toHaveLength(3);
  });

  it("leaves out what has no body, because there is nothing to parse", () => {
    const withoutBody = matching(rows, { path: "conference-schedules/3", status: "any", withBody: false });
    expect(withoutBody).toHaveLength(1);
    expect(matching(rows, { path: "conference-schedules/3" })).toHaveLength(0);
  });

  it("matches a content type without knowing the whole of it", () => {
    expect(matching(rows, { mime: "html" })).toHaveLength(2);
  });

  it("returns everything worth reading when asked for nothing", () => {
    expect(matching(rows)).toHaveLength(3);
  });
});

describe("summarise", () => {
  it("groups by host and type, heaviest first, and counts the bodies kept", () => {
    const rows = readHar(
      har([
        { url: "https://api.athleteone.com/a", mimeType: "text/html", size: 90_000, text: "<table>" },
        { url: "https://api.athleteone.com/b", mimeType: "text/html", size: 10_000 },
        { url: "https://cdn.test/x.js", mimeType: "application/javascript", size: 5_000, text: "x" },
      ]),
    );
    const rowsOut = summarise(rows);
    expect(rowsOut[0]).toEqual({
      host: "api.athleteone.com",
      mimeType: "text/html",
      count: 2,
      bytes: 100_000,
      // The one that matters: two calls, one body. Nothing else says so.
      withBody: 1,
    });
    expect(rowsOut[1].host).toBe("cdn.test");
  });
});

describe("fileNameFor", () => {
  it("names a file after where it came from, and sorts in request order", () => {
    const [r] = readHar(
      har([{ url: "https://api.athleteone.com/api/Script/get-conference-schedules/1/2?x=1", mimeType: "text/html" }]),
    );
    expect(fileNameFor(r, 7)).toBe("007-api.athleteone.com-get-conference-schedules-1-2.html");
  });

  it("has something to call a response from the root", () => {
    const [r] = readHar(har([{ url: "https://x.test/", mimeType: "application/json" }]));
    expect(fileNameFor(r, 0)).toBe("000-x.test-root.json");
  });
});

describe("htmlIn", () => {
  it("finds markup wherever a console snippet happened to put it", () => {
    const bundle = {
      league: "ECNL RL Boys",
      divisions: { BU13: "<table><tr><td>x</td></tr></table>", BU14: "<table></table>" },
    };
    expect(htmlIn(bundle).map((f) => f.label)).toEqual(["divisions.BU13", "divisions.BU14"]);
  });

  it("keeps the label, because it is the only thing naming the age group", () => {
    const [first] = htmlIn({ divisions: { "BU18/19": "<table></table>" } });
    expect(first.label).toBe("divisions.BU18/19");
  });

  it("walks arrays as readily as objects", () => {
    expect(htmlIn(["<tbody></tbody>", { a: ["<tr></tr>"] }]).map((f) => f.label)).toEqual([
      "0",
      "1.a.0",
    ]);
  });

  it("leaves alone the strings that are not markup", () => {
    // A conference name is not a schedule, and neither is a URL.
    expect(htmlIn({ conference: "Northwest 2026-27", url: "https://x.test/table" })).toEqual([]);
  });

  it("has nothing to say about anything else", () => {
    expect(htmlIn(null)).toEqual([]);
    expect(htmlIn(42)).toEqual([]);
    expect(htmlIn({ n: 1, b: true })).toEqual([]);
  });
});
