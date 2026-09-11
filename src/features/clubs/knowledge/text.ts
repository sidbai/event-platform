/**
 * A club page reduced to the words a person would have read.
 *
 * These pages are 350KB to 950KB of Wix and Squarespace, and perhaps 4KB of
 * it is the club telling us anything. Sending the rest to a model costs money
 * to deliver noise, so the markup comes off here.
 *
 * Pure, and deliberately not a parser. `node-html-parser` is already a
 * dependency and would build a tree, but nothing downstream wants a tree —
 * it wants the text in reading order with the headings still visible, and a
 * regex sweep does that on a megabyte of Wix without allocating a DOM for it.
 */

/** Elements whose contents are never prose. */
const MUTE = /<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Where a line break belongs, so a list of coaches does not become a paragraph. */
const BREAK = /<\/?(p|div|br|li|tr|h[1-6]|section|article|header|footer|nav|td|th)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
  "#x27": "'", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", hellip: "…",
};

function unescapeHtml(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const known = ENTITIES[name.toLowerCase()];
    if (known) return known;
    const numeric = /^#x/i.test(name)
      ? Number.parseInt(name.slice(2), 16)
      : /^#/.test(name)
        ? Number.parseInt(name.slice(1), 10)
        : NaN;
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : whole;
  });
}

/**
 * Visible text, one line per block, capped.
 *
 * The cap is per page and generous: a coach list is long and is exactly what
 * we came for, but nothing useful lies past eight thousand characters of a
 * club's home page, and an uncapped read is an uncapped bill.
 */
export function readable(html: string, limit = 8000): string {
  const text = unescapeHtml(
    html
      .replace(MUTE, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BREAK, "\n")
      .replace(/<[^>]+>/g, " "),
  );

  const lines: string[] = [];
  let length = 0;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").trim();
    /*
     * A line of one character is a bullet or a stray glyph, and there are
     * thousands of them in a Wix export. Two is "GK", which is a role.
     */
    if (line.length < 2) continue;
    // Wix and Squarespace repeat the whole nav on every page.
    if (lines.length && lines[lines.length - 1] === line) continue;
    lines.push(line);
    length += line.length + 1;
    if (length >= limit) break;
  }
  return lines.join("\n");
}

/**
 * The same pages with each club's navigation said once.
 *
 * `readable` drops a line that repeats itself, which handles a menu rendered
 * twice in one document. It cannot see across pages, and a club site puts the
 * whole menu on every page — so Western WA Surf's thirteen pages carried
 * thirteen copies of ACADEMY OVERVIEW / PREMIER / JOIN A TEAM, and two thirds
 * of a 67KB read was furniture.
 *
 * A line kept once is still evidence: grounding only ever asks whether a
 * phrase appears somewhere, and a reader only needs to be told once. What is
 * cut is the repetition, which costs tokens and buries the six lines per club
 * that actually say something.
 *
 * The first page keeps everything. It is the only page some clubs have, and
 * on a site with one page there is no repetition to find.
 */
export function withoutRepeatedFurniture(
  pages: { url: string; text: string }[],
): { url: string; text: string }[] {
  const seen = new Set<string>();
  return pages.map((page, index) => {
    const lines = page.text.split("\n");
    if (index === 0) {
      for (const line of lines) seen.add(line);
      return page;
    }
    const kept = lines.filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    return { ...page, text: kept.join("\n") };
  });
}

/**
 * Lines that mention how the club is organised, for when a page is mostly nav.
 *
 * Used to decide whether a fetched page said anything: a Squarespace page
 * that yields nothing but the menu should not be paid for twice, once to
 * fetch and once to send.
 */
const TELLING =
  /\b(u-?\d{1,2}|20[01]\d|b\d{2}|g\d{2}|boys|girls|coach|director|tier|elite|premier|select|academy|classic|division|squad|roster|team)\b/i;

export function tellsUsSomething(text: string): boolean {
  const lines = text.split("\n").filter((l) => TELLING.test(l));
  return lines.length >= 4;
}
