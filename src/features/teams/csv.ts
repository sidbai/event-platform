/**
 * Reading and writing the spreadsheet an admin fills in.
 *
 * Written by hand rather than pulled in, because the whole job is one rule
 * and the data walks straight into it: team names here are full of commas —
 * "XF, U14, B12 - 13, RCL 1, Plackov" — and several carry quotes and
 * non-ASCII. A split on "," loses columns on the first row it meets.
 */

/** A field needs quoting if it holds a comma, a quote, or a line break. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(quote).join(",")).join("\n") + "\n";
}

/**
 * Rows as objects, keyed by the header.
 *
 * Tolerant where a spreadsheet is careless — a trailing newline, \r\n from
 * Excel, a short row — and strict about nothing else, since the file comes
 * back from a person rather than a machine.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!headers) return [];
  return body.map((values) =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()])),
  );
}
