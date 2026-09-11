import { config } from "dotenv";

config({ path: ".env.local" });

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Does the knowledge base still only say what the pages said?
 *
 *   pnpm clubs:verify
 *
 * The grounding check runs when a profile is written, which protects entries
 * that arrive that way. It does not protect an entry edited by hand, or one
 * written by a reader other than the profiling script — and the whole point
 * of a file in the repo is that a person can edit it.
 *
 * So the same check is runnable over the whole file, against the same cached
 * pages, at any time. Read-only, calls no model, and exits non-zero when
 * something in the file is not in the evidence.
 */

const CACHE = path.join(process.cwd(), ".cache", "clubs");
const FILE = path.join(process.cwd(), "src", "features", "clubs", "knowledge", "profiles.json");

async function main() {
  const { ground } = await import("../src/features/clubs/knowledge/grounding");
  type ClubProfile = import("../src/features/clubs/knowledge/profile").ClubProfile;

  const profiles = JSON.parse(await readFile(FILE, "utf8")) as Record<string, ClubProfile>;
  const cached = new Set((await readdir(CACHE)).filter((f) => f.endsWith(".json")));

  let checked = 0;
  let faults = 0;
  let uncheckable = 0;

  for (const [slug, profile] of Object.entries(profiles)) {
    if (!cached.has(`${slug}.json`)) {
      /*
       * Not a fault. The cache is gitignored, so a fresh clone has an entry
       * with nothing to check it against — which is a reason to re-crawl, not
       * a reason to distrust the entry.
       */
      console.log(`?? ${slug.padEnd(38)} nothing cached to check against`);
      uncheckable++;
      continue;
    }

    const pages = (JSON.parse(await readFile(path.join(CACHE, `${slug}.json`), "utf8")) as {
      pages: { text: string }[];
    }).pages;

    const { dropped } = ground(profile, pages);
    checked++;
    if (dropped.length === 0) continue;
    faults++;
    console.log(`!! ${slug}`);
    for (const claim of dropped) console.log(`     ${claim}`);
  }

  console.log(
    `\n${checked} profile(s) checked against the pages they came from, ` +
      `${faults} with something the pages do not say` +
      (uncheckable ? `, ${uncheckable} with no cache (run pnpm clubs:crawl)` : "") +
      ".",
  );
  process.exit(faults > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
