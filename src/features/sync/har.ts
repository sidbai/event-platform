/**
 * Reading what a browser already fetched, out of a HAR export.
 *
 * The third route, beside the connector and the bookmarklet. A platform whose
 * schedule is client-rendered and whose API refuses anyone but its own widget
 * — AthleteOne answers a plain request with 403, "you do not have permission
 * to perform this operation" — cannot be read by us at all. But the person
 * looking at the page already has the answer: their browser fetched it, as a
 * visitor, and DevTools will hand the whole exchange over as a file.
 *
 * That keeps the line where it was. Every request in a HAR was made by a
 * person's own browsing; nothing here asks the platform for anything, and
 * there is nothing to identify ourselves as, because we never speak to them.
 *
 * Deliberately generic: a HAR is a HAR, and what somebody wants out of one —
 * which host, which path, which content type, and the bodies — does not
 * change per site. What does change is how a platform's payload becomes
 * fixtures, and that belongs in a reader per platform rather than here.
 */

export type HarResponse = {
  url: string;
  host: string;
  path: string;
  method: string;
  status: number;
  mimeType: string;
  /** What the export says the body weighed, which survives the body itself. */
  bytes: number;
  /**
   * The body, or null where the export saved none.
   *
   * Worth its own state rather than an empty string. "The browser copied the
   * HAR without contents" and "the response was empty" look identical
   * downstream and have completely different fixes — and the first is the one
   * that actually happens, because the menu offers both and only one of them
   * says which is which.
   */
  text: string | null;
};

type RawContent = {
  mimeType?: unknown;
  size?: unknown;
  text?: unknown;
  encoding?: unknown;
};

type RawEntry = {
  request?: { url?: unknown; method?: unknown };
  response?: { status?: unknown; content?: RawContent };
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** base64 where the export said so, and left alone where it did not. */
function decode(content: RawContent): string | null {
  const text = content.text;
  if (typeof text !== "string") return null;
  if (str(content.encoding).toLowerCase() !== "base64") return text;
  try {
    return Buffer.from(text, "base64").toString("utf8");
  } catch {
    /*
     * A body we cannot decode is not a body we have. Saying so beats handing
     * a parser mojibake and letting it fail somewhere further along, where
     * the cause is no longer anywhere near the symptom.
     */
    return null;
  }
}

/**
 * Every response a HAR recorded, in the order the browser made them.
 *
 * Tolerant on purpose: exports differ between browsers and between versions,
 * and an entry missing a field is one entry to skip rather than a reason to
 * refuse the file. The alternative is a reader that works on Chrome and not
 * on Firefox and says "invalid HAR" about both.
 */
export function readHar(json: unknown): HarResponse[] {
  const entries = (json as { log?: { entries?: unknown } })?.log?.entries;
  if (!Array.isArray(entries)) return [];

  const out: HarResponse[] = [];
  for (const raw of entries as RawEntry[]) {
    const url = str(raw?.request?.url);
    if (!url) continue;

    let host = "";
    let path = "";
    try {
      const parsed = new URL(url);
      /*
       * The scheme is the test, not whether the URL parses. A HAR records
       * data: and blob: entries, and those parse perfectly well — they just
       * have no host, so a filter on one silently matches every last inline
       * image in the file.
       */
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      host = parsed.host;
      path = parsed.pathname + parsed.search;
    } catch {
      continue;
    }

    const content: RawContent = raw?.response?.content ?? {};
    const text = decode(content);
    out.push({
      url,
      host,
      path,
      method: str(raw?.request?.method, "GET").toUpperCase(),
      status: typeof raw?.response?.status === "number" ? raw.response.status : 0,
      mimeType: str(content.mimeType).split(";")[0].trim(),
      bytes:
        typeof content.size === "number" && content.size >= 0
          ? content.size
          : (text?.length ?? 0),
      text,
    });
  }
  return out;
}

export type Filter = {
  /** Substring of the host, so "athleteone" finds api.athleteone.com. */
  host?: string;
  /** Substring of the path, so "conference-schedules" finds those calls. */
  path?: string;
  /** Substring of the content type, so "json" finds application/json. */
  mime?: string;
  /** Default: only responses that succeeded. */
  status?: "ok" | "any";
  /** Default: only responses whose body the export kept. */
  withBody?: boolean;
};

export function matching(responses: HarResponse[], filter: Filter = {}): HarResponse[] {
  const has = (haystack: string, needle?: string) =>
    !needle || haystack.toLowerCase().includes(needle.toLowerCase());
  return responses.filter(
    (r) =>
      has(r.host, filter.host) &&
      has(r.path, filter.path) &&
      has(r.mimeType, filter.mime) &&
      (filter.status === "any" || (r.status >= 200 && r.status < 300)) &&
      (filter.withBody === false || r.text !== null),
  );
}

export type HostSummary = {
  host: string;
  mimeType: string;
  count: number;
  bytes: number;
  /** How many of these the export kept a body for. */
  withBody: number;
};

/**
 * What is in the file, by host and content type, heaviest first.
 *
 * The first question about a HAR is always "what is even in here" — a page
 * load is three hundred requests and four of them matter.
 */
export function summarise(responses: HarResponse[]): HostSummary[] {
  const by = new Map<string, HostSummary>();
  for (const r of responses) {
    const key = `${r.host} ${r.mimeType}`;
    const row = by.get(key) ?? {
      host: r.host,
      mimeType: r.mimeType,
      count: 0,
      bytes: 0,
      withBody: 0,
    };
    row.count++;
    row.bytes += r.bytes;
    if (r.text !== null) row.withBody++;
    by.set(key, row);
  }
  return [...by.values()].sort(
    (a, b) => b.bytes - a.bytes || a.host.localeCompare(b.host),
  );
}

/**
 * The HTML in any JSON, wherever somebody put it.
 *
 * A HAR is one way a browser hands over what it fetched; a few lines pasted
 * into the console is another, and that one produces whatever shape the
 * person writing it chose — `{divisions: {BU13: "<table…"}}` today. Rather
 * than name a schema and have it be wrong next time, this walks the whole
 * document and takes the strings that look like markup, labelled by where
 * they were found.
 *
 * The label matters: `divisions.BU13` is the age group, and it is the only
 * place that survives a fragment which does not name itself.
 */
export function htmlIn(json: unknown, path: string[] = []): { label: string; html: string }[] {
  if (typeof json === "string") {
    return /<t(?:able|body|r)\b/i.test(json)
      ? [{ label: path.join(".") || "(root)", html: json }]
      : [];
  }
  if (Array.isArray(json)) {
    return json.flatMap((v, i) => htmlIn(v, [...path, String(i)]));
  }
  if (json && typeof json === "object") {
    return Object.entries(json).flatMap(([k, v]) => htmlIn(v, [...path, k]));
  }
  return [];
}

/** A filename for one response, stable enough to diff two exports. */
export function fileNameFor(r: HarResponse, index: number): string {
  const tail =
    r.path.split("?")[0].split("/").filter(Boolean).slice(-3).join("-") || "root";
  const ext = r.mimeType.includes("json")
    ? "json"
    : r.mimeType.includes("html")
      ? "html"
      : "txt";
  const stem = `${String(index).padStart(3, "0")}-${r.host}-${tail}`.replace(
    /[^A-Za-z0-9.-]+/g,
    "_",
  );
  return `${stem}.${ext}`;
}
