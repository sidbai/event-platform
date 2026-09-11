import { config } from "dotenv";

config({ path: ".env.local" });

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Turn what the club websites said into a knowledge base a person can review.
 *
 *   pnpm clubs:profile                     everything in the cache
 *   pnpm clubs:profile --club=atletico-futbol-club
 *   pnpm clubs:profile --force             re-read clubs already profiled
 *
 * Reads .cache/clubs/ and writes src/features/clubs/knowledge/profiles.json,
 * which is committed. The diff is the review: a model's account of how a club
 * names its teams is exactly the sort of claim that should be read by somebody
 * before it starts arguing for merges.
 *
 * Touches no database at all.
 */

const CACHE = path.join(process.cwd(), ".cache", "clubs");
const OUT = path.join(process.cwd(), "src", "features", "clubs", "knowledge", "profiles.json");

const MODEL = process.env.CLUB_PROFILE_MODEL ?? "openai/gpt-4o-mini";

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

type Cached = {
  slug: string;
  name: string;
  website: string;
  pages: { url: string; text: string }[];
};

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.log("AI_GATEWAY_API_KEY is not set.");
    process.exit(0);
  }

  const { generateText } = await import("ai");
  const { isRateLimited } = await import("../src/features/teams/suggest/rate-limit");
  const { buildReadPrompt, parseProfile, READ_SYSTEM } = await import(
    "../src/features/clubs/knowledge/read-prompt"
  );
  const { saysSomething } = await import("../src/features/clubs/knowledge/profile");
  const { ground } = await import("../src/features/clubs/knowledge/grounding");
  type ClubProfile = import("../src/features/clubs/knowledge/profile").ClubProfile;

  const only = flag("club");
  const force = process.argv.includes("--force");

  let held: Record<string, ClubProfile> = {};
  try {
    held = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    // First run.
  }

  const files = (await readdir(CACHE)).filter((f) => f.endsWith(".json"));
  const wanted = only ? files.filter((f) => f === `${only}.json`) : files;
  if (wanted.length === 0) {
    console.log(only ? `Nothing cached for "${only}". Run pnpm clubs:crawl first.` : "Cache is empty. Run pnpm clubs:crawl first.");
    process.exit(0);
  }

  /*
   * The free gateway tier refuses a handful of calls a minute, and a club is
   * one call. Waiting it out is the whole job — the alternative, which this
   * script did on its first run, is to sprint through forty clubs printing
   * the same rate-limit error and write nothing.
   */
  const WAIT_MS = 65_000;
  const PAUSE_MS = 2000;
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let wrote = 0;
  let quiet = 0;
  let waited = 0;
  const ungrounded: string[] = [];
  for (const file of wanted.sort()) {
    const club = JSON.parse(await readFile(path.join(CACHE, file), "utf8")) as Cached;
    if (!club.pages?.length) continue;
    if (held[club.slug] && !force) {
      console.log(`  ${club.slug.padEnd(38)} already profiled`);
      continue;
    }

    process.stdout.write(`  ${club.slug.padEnd(38)} `);
    const ask = () =>
      generateText({
        model: MODEL,
        system: READ_SYSTEM,
        prompt: buildReadPrompt({ name: club.name, website: club.website }, club.pages),
        // Same pages, same profile, so a re-run does not churn the diff.
        temperature: 0,
      });

    let text: string;
    try {
      text = (await ask()).text;
    } catch (error) {
      if (!isRateLimited(error)) {
        console.log(`failed: ${error instanceof Error ? error.message.slice(0, 90) : "unknown"}`);
        continue;
      }
      // Once, and only once per club: a minute is the window, and a second
      // refusal means the window is not the problem.
      process.stdout.write(`rate-limited, waiting ${WAIT_MS / 1000}s… `);
      waited++;
      await pause(WAIT_MS);
      try {
        text = (await ask()).text;
      } catch (again) {
        console.log(
          isRateLimited(again)
            ? "still rate-limited — stopping. What is written is kept.\n" +
              "    The free AI Gateway tier is account-wide and is spent. Reading all " +
              "43 clubs costs about three cents:\n    https://vercel.com/[team]/~/ai"
            : `failed: ${again instanceof Error ? again.message.slice(0, 90) : "unknown"}`,
        );
        break;
      }
    }

    /*
     * Everything the pages did not actually say is thrown away here.
     *
     * The first run of this recorded that Atletico Futbol Club runs "MLS
     * NEXT" and "Elite Academy" tiers, from a home page that is a mission
     * statement and a jamboree flyer. Neither phrase is on it. An entry like
     * that would have gone on to argue about merges under the authority of
     * "their own website says so", which is worse than knowing nothing.
     */
    const { profile, dropped } = ground(
      parseProfile(text, {
        slug: club.slug,
        sources: club.pages.map((p) => p.url),
        model: MODEL,
        readAt: new Date().toISOString(),
      }),
      club.pages,
    );
    if (dropped.length) ungrounded.push(`${club.slug}: ${dropped.join("; ")}`);

    /*
     * A club whose site we could not really read yields empty lists and
     * "unknown", and writing that down is worse than writing nothing: in a
     * diff it reads as a finding, and in a prompt it reads as a club that has
     * no tiers rather than one we failed to read.
     */
    if (!saysSomething(profile)) {
      console.log("nothing legible");
      quiet++;
      await pause(PAUSE_MS);
      continue;
    }

    held[club.slug] = profile;
    wrote++;
    // Written as we go, so a run that is interrupted keeps what it paid for.
    await flush(held);
    console.log(
      [
        profile.tiers.length ? `${profile.tiers.length} tiers` : null,
        profile.branches.length ? `${profile.branches.length} branches` : null,
        profile.coaches.length ? `${profile.coaches.length} coaches` : null,
        `colours=${profile.colours}`,
        `ages=${profile.ageBands}`,
      ]
        .filter(Boolean)
        .join(", "),
    );
    await pause(PAUSE_MS);
  }

  await flush(held);

  /*
   * Said out loud rather than swallowed. A run that silently discards half of
   * what it was told looks exactly like a set of clubs that said very little,
   * and the difference is the only warning that a model is confabulating.
   */
  if (ungrounded.length) {
    console.log(`\nNot on the page, so dropped:`);
    for (const line of ungrounded) console.log(`  ${line}`);
  }

  console.log(
    `\n${wrote} profile(s) written, ${quiet} club(s) said nothing legible, ` +
      `${waited} rate-limit wait(s). ${Object.keys(held).length} in the knowledge base.` +
      "\nRead the diff before committing it.",
  );
  process.exit(0);
}

/**
 * Sorted, so the file's order never depends on the order of a directory read
 * and a re-run of one club is a one-club diff.
 */
async function flush(held: Record<string, unknown>) {
  const sorted = Object.fromEntries(Object.entries(held).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
