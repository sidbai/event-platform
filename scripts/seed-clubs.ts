import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { slugify } from "../src/lib/slug";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call. Hence the dynamic import
// inside main(), same as seed-kjc.
config({ path: ".env.local" });

/**
 * Well-known Seattle-area youth clubs, so Club Experience isn't an empty page.
 *
 * Only details I could actually verify are filled in. A wrong city or a wrong
 * link on a real organisation's review page is worse than a blank field, so
 * anything unconfirmed is left null for an admin to complete in the UI.
 *
 * Logos are deliberately absent: club crests are their trademarks, and
 * hotlinking or copying them into our store isn't ours to do. Upload them
 * per club from the edit page.
 *
 * Idempotent — safe to re-run, and never overwrites edits made in the app.
 */
const SEATTLE_CLUBS: {
  name: string;
  city: string | null;
  website: string | null;
}[] = [
  { name: "Seattle United", city: "Seattle", website: null },
  { name: "Crossfire Premier", city: "Redmond", website: "https://www.crossfiresoccer.org" },
  { name: "Eastside FC", city: null, website: "https://www.eastsidefc.org" },
  { name: "Seattle Celtic", city: "Seattle", website: null },
  { name: "Emerald City FC", city: "Seattle", website: null },
  { name: "Issaquah Soccer Club", city: "Issaquah", website: null },
  { name: "Northwest Nationals", city: null, website: null },
  { name: "Washington Premier FC", city: null, website: null },
];

async function main() {
  const { db } = await import("../src/db");
  const { clubs } = await import("../src/db/schema");

  let added = 0;
  let skipped = 0;

  for (const club of SEATTLE_CLUBS) {
    const slug = slugify(club.name).slice(0, 60);
    const existing = await db.query.clubs.findFirst({
      where: eq(clubs.slug, slug),
      columns: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(clubs).values({ slug, name: club.name, city: club.city, website: club.website });
    added++;
  }

  const missing = SEATTLE_CLUBS.filter((c) => !c.city || !c.website).length;
  console.log(
    `Clubs: ${added} added, ${skipped} already present. ${missing} still need a city or website filling in from the app.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
