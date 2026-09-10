import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Look inside a HAR export, and pull the responses worth parsing out of it.
 *
 *   pnpm har <file.har>                        # what is in here
 *   pnpm har <bundle.json> --out=./tmp         # fragments pasted from a console
 *   pnpm har <file.har> --host=athleteone      # narrow it
 *   pnpm har <file.har> --host=athleteone --path=schedules --out=./tmp/ecnl
 *
 * For a platform we may not fetch from: AthleteOne's schedule API answers a
 * plain request with 403, and its robots.txt refuses crawlers anyway. But the
 * person reading the page already has the answer — their own browser fetched
 * it — and a HAR is that exchange as a file. Nothing here talks to anybody.
 *
 * How to make one, in Chrome: open DevTools → Network before loading the
 * schedule, click through the divisions you want, then right-click the list
 * and choose **"Save all as HAR with content"**. The plain "Copy all as HAR"
 * leaves the bodies out, which produces a file that looks complete and parses
 * to nothing — this reports that case rather than saying it found no matches.
 */

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("-"));
const arg = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}M`
    : `${Math.max(1, Math.round(bytes / 1024))}K`;
}

async function main() {
  if (!file) {
    console.log("Usage: pnpm har <file.har> [--host=] [--path=] [--mime=] [--out=dir] [--all]");
    process.exit(1);
  }

  const { readHar, matching, summarise, fileNameFor, htmlIn } = await import(
    "../src/features/sync/har"
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.log(`Could not read ${file} as JSON: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const all = readHar(parsed);

  /*
   * Not a HAR, but JSON with markup in it — what a few lines pasted into the
   * console produce, and the only route left for a platform that answers us
   * 403 and whose bulk collection this tool is not permitted to drive.
   * Handled here rather than as a second command: the question is the same
   * one, and the answer ends at the same TSV.
   */
  if (all.length === 0) {
    const found = htmlIn(parsed);
    if (found.length === 0) {
      console.log("No requests and no markup in that file. Is it a HAR, or a bundle of fragments?");
      process.exit(1);
    }
    console.log(`${found.length} fragment(s) of markup in ${file}\n`);
    for (const f of found) console.log(`  ${kb(f.html.length).padStart(5)}  ${f.label}`);

    const { fragmentsToTsv } = await import("../src/features/sync/athleteone-fragment");
    const tsv = fragmentsToTsv(found.map((f) => f.html));
    const lines = tsv.split("\n").length - 1;
    if (lines === 0) {
      console.log("\nNone of those look like an AthleteOne schedule table.");
      process.exit(1);
    }
    const to = arg("out");
    if (to) {
      mkdirSync(to, { recursive: true });
      const name = basename(file).replace(/\.[^.]+$/, "") + ".tsv";
      writeFileSync(join(to, name), tsv, "utf8");
      console.log(`\n${lines} fixture(s) → ${join(to, name)}`);
      console.log("Paste that into the event's box on /admin/sync.");
    } else {
      console.log(`\n${lines} fixture(s). Pass --out=<dir> to write the TSV.`);
    }
    process.exit(0);
  }

  const filter = {
    host: arg("host"),
    path: arg("path"),
    mime: arg("mime"),
    status: args.includes("--all") ? ("any" as const) : ("ok" as const),
    withBody: !args.includes("--all"),
  };
  const narrowed = arg("host") || arg("path") || arg("mime");

  if (!narrowed) {
    console.log(`${all.length} request(s) in ${file}\n`);
    console.log("  count  body   size  host and type");
    for (const row of summarise(all).slice(0, 20)) {
      const body = row.withBody === row.count ? "all" : `${row.withBody}/${row.count}`;
      console.log(
        `  ${String(row.count).padStart(5)}  ${body.padStart(4)}  ${kb(row.bytes).padStart(5)}  ${row.host} ${row.mimeType}`,
      );
    }
    console.log("\nNarrow it with --host= and --path=, then --out= to write the bodies.");
    process.exit(0);
  }

  const hits = matching(all, filter);
  console.log(`${hits.length} of ${all.length} response(s) match\n`);

  /*
   * The failure this exists to catch. A HAR saved without contents matches
   * exactly as many requests and yields nothing, and "0 found" sends somebody
   * looking at their filter when the file is the problem.
   */
  const bodiless = matching(all, { ...filter, status: "any", withBody: false }).filter(
    (r) => r.text === null,
  );
  if (hits.length === 0 && bodiless.length > 0) {
    console.log(
      `  ${bodiless.length} match the filter but the export kept no body for them.\n` +
        `  In Chrome that means "Copy all as HAR" rather than "Save all as HAR\n` +
        `  with content" — the second one is the one with the data in it.`,
    );
    process.exit(1);
  }

  for (const [i, r] of hits.slice(0, 25).entries()) {
    console.log(`  ${String(i).padStart(3)}  ${kb(r.bytes).padStart(5)}  ${r.status}  ${r.method} ${r.url}`);
  }
  if (hits.length > 25) console.log(`  and ${hits.length - 25} more`);

  /*
   * The one platform there is a reader for. Everything above is generic and
   * stays that way; this is the step that knows what AthleteOne's markup
   * means, and it stops at the TSV the paste box already takes.
   */
  if (args.includes("--tsv")) {
    const { fragmentsToTsv } = await import("../src/features/sync/athleteone-fragment");
    const tsv = fragmentsToTsv(hits.map((r) => r.text ?? ""));
    const lines = tsv.split("\n").length - 1;
    if (lines === 0) {
      console.log("\nNone of those look like an AthleteOne schedule table.");
      process.exit(1);
    }
    const to = arg("out");
    if (to) {
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, "schedule.tsv"), tsv, "utf8");
      console.log(`\n${lines} fixture(s) → ${join(to, "schedule.tsv")}`);
      console.log("Paste that into the event's box on /admin/sync.");
    } else {
      console.log(`\n${lines} fixture(s):\n`);
      console.log(tsv);
    }
    process.exit(0);
  }

  const out = arg("out");
  if (!out) {
    console.log("\nPass --out=<dir> to write the bodies out, or --tsv to read");
    console.log("an AthleteOne schedule out of them.");
    process.exit(0);
  }

  mkdirSync(out, { recursive: true });
  let written = 0;
  for (const [i, r] of hits.entries()) {
    if (r.text === null) continue;
    writeFileSync(join(out, fileNameFor(r, i)), r.text, "utf8");
    written++;
  }
  console.log(`\nWrote ${written} file(s) to ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
