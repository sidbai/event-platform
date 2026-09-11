import { config } from "dotenv";

config({ path: ".env.local" });

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Read the websites of the clubs this directory lists, and keep what they say.
 *
 *   pnpm clubs:crawl                     every club with a website
 *   pnpm clubs:crawl --club=eastside-fc  one of them
 *   pnpm clubs:crawl --pages=20          read deeper
 *
 * Writes text to .cache/clubs/, which is gitignored. Nothing here calls a
 * model and nothing here touches the database beyond reading the club list —
 * the fetching is separated from the reading precisely because the reading is
 * the part worth iterating on, and iterating on it should not cost somebody
 * else's server another visit.
 *
 * Slow on purpose: one page at a time, a second and a half apart. Forty-three
 * clubs is about fifteen minutes. Run it and go and do something else.
 */

const CACHE = path.join(process.cwd(), ".cache", "clubs");

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const { db } = await import("../src/db");
  const { clubs } = await import("../src/db/schema");
  const { and, isNotNull, eq } = await import("drizzle-orm");
  const { readClub } = await import("../src/features/clubs/knowledge/fetch");

  const only = flag("club");
  const pages = Number(flag("pages") ?? 12);
  const fresh = process.argv.includes("--fresh");

  const rows = await db
    .select({ slug: clubs.slug, name: clubs.name, website: clubs.website })
    .from(clubs)
    .where(
      only
        ? and(isNotNull(clubs.website), eq(clubs.slug, only))
        : isNotNull(clubs.website),
    )
    .orderBy(clubs.slug);

  if (rows.length === 0) {
    console.log(only ? `No club "${only}" with a website.` : "No clubs have a website.");
    process.exit(0);
  }

  await mkdir(CACHE, { recursive: true });
  console.log(`Reading ${rows.length} club website(s), ${pages} pages each at most.\n`);

  let read = 0;
  let skipped = 0;
  for (const club of rows) {
    const file = path.join(CACHE, `${club.slug}.json`);
    if (!fresh) {
      try {
        const held = JSON.parse(await readFile(file, "utf8")) as { pages?: unknown[] };
        if (held.pages?.length) {
          console.log(`  ${club.slug.padEnd(38)} cached (${held.pages.length} pages)`);
          skipped++;
          continue;
        }
      } catch {
        // Not cached, or cached badly. Read it.
      }
    }

    process.stdout.write(`  ${club.slug.padEnd(38)} `);
    const out = await readClub({ slug: club.slug, website: club.website! }, { pages });
    const chars = out.pages.reduce((n, p) => n + p.text.length, 0);
    await writeFile(
      file,
      JSON.stringify({ ...out, name: club.name, readAt: new Date().toISOString() }, null, 1),
    );
    console.log(
      out.pages.length
        ? `${String(out.pages.length).padStart(2)} pages, ${(chars / 1000).toFixed(1)}k chars`
        : `nothing (${out.note})`,
    );
    read++;
  }

  console.log(`\n${read} club(s) read, ${skipped} already cached. Now: pnpm clubs:profile`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
