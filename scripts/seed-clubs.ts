import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

import { slugify } from "../src/lib/slug";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call. Hence the dynamic import
// inside main(), same as seed-kjc.
config({ path: ".env.local" });

const B = "https://cxmq9bef2phfq3rd.public.blob.vercel-storage.com/clubs";

/**
 * The Seattle-area ECNL clubs, so Club Experience isn't an empty page.
 *
 * Scope is deliberately ECNL / RCL: those are the clubs families actually
 * choose between, and a directory that tries to list every rec club is one
 * nobody can maintain.
 *
 * Every field here was checked against the club's own site. Logos were fetched
 * from those sites and eyeballed one by one before being stored — the naive
 * "grab the image with 'logo' in its name" picked a Toyota dealership's badge
 * off one club's sponsor strip, which would have been worse than no logo at
 * all on a page that hosts reviews of that club.
 *
 * Showing a club's own mark on its own review page is nominative use, the same
 * basis Glassdoor and Blind display employer logos.
 *
 * Blank means unverified, not unimportant: a wrong city or a wrong link on a
 * real organisation's page is worse than an empty field. Fill them in from the
 * app.
 */
const SEATTLE_CLUBS: {
  name: string;
  city: string | null;
  website: string | null;
  logo: string | null;
}[] = [
  {
    name: "Seattle United",
    city: "Seattle",
    website: "https://www.seattleunited.com",
    logo: `${B}/seattle-united/logo-PBEqEPw5ALIar2IBrmLsg2u7LpoLX2.png`,
  },
  {
    name: "Crossfire Premier",
    city: "Redmond",
    website: "https://www.crossfiresoccer.org",
    logo: `${B}/crossfire-premier/logo-qYF7ZpbE8BjMcVbwDrOxzB6EEypC6R.png`,
  },
  {
    name: "Eastside FC",
    city: "Issaquah",
    website: "https://www.eastsidefc.org",
    logo: `${B}/eastside-fc/logo-Hgp7ZrwaD3jEBn1sT8f0jfY95VbkQD.png`,
  },
  {
    name: "Washington Premier FC",
    city: "Puyallup",
    website: "https://www.washingtonpremierfc.com",
    logo: `${B}/washington-premier-fc/logo-it5kyASFH20AneECYGLHNNMaTOIUlD.png`,
  },
  {
    name: "PacNW SC",
    city: "Tukwila",
    website: "https://www.pacificnorthwestsoccerclub.org",
    logo: `${B}/pacnw/logo-jHGHMTfseW78RDlfEtWHzTegbQGvZO.png`,
  },
  {
    name: "Snohomish United",
    city: "Snohomish",
    website: "https://www.snohomishunited.com",
    logo: `${B}/snohomish-united/logo-Kx4tsB2L34XohwA5Kl6czWO93UyXkN.png`,
  },
  // --- The rest of the RCL full membership, added Sep 2026. -------------
  //
  // Source is Washington Youth Soccer's own member list, not recollection:
  // https://washingtonyouthsoccer.org/leagues/regional-club-league/
  //
  // "RCL full member" is the scope because it is a definition someone else
  // maintains — a radius around Seattle would be arguable and would need
  // re-litigating every time a club is added.
  //
  // Cities come from each club's own site. Two deliberate near-misses caught
  // here: a search confidently placed Washington Rush in the South Sound when
  // it is the North County (Snohomish) club, and "Sound FC" is also the name
  // of a men's USL League Two side in Tacoma — unrelated to this youth club in
  // Woodinville. Both would have been wrong on a page that hosts reviews of a
  // real organisation.
  {
    name: "Blackhills FC",
    city: "Olympia",
    website: "https://www.blackhillsfc.org",
    logo: null,
  },
  {
    name: "Cascade FC",
    city: "Snoqualmie",
    website: "https://www.cascadefc.org",
    logo: null,
  },
  {
    name: "Harbor Soccer Club",
    city: "Gig Harbor",
    website: "https://www.harborsoccerclub.com",
    logo: null,
  },
  {
    name: "Highline Premier FC",
    city: "Burien",
    website: "https://www.highlinepremier.com",
    logo: null,
  },
  {
    // Kitsap, Mason and Jefferson counties; the club names no single city.
    name: "Kitsap Alliance FC",
    city: null,
    website: "https://www.kitsapalliancefc.com",
    logo: null,
  },
  {
    name: "Northwest United FC",
    city: "Burlington",
    website: "https://www.nwunited.org",
    logo: null,
  },
  {
    name: "Sound Football Club",
    city: "Woodinville",
    website: "https://soundfc.org",
    logo: null,
  },
  {
    name: "Valor Soccer",
    city: "Maple Valley",
    website: "https://www.valorsoccer.com",
    logo: null,
  },
  {
    // Their own site states no city, only "North County", so this stays blank
    // rather than borrowing one from a third-party directory.
    name: "Washington Rush",
    city: null,
    website: "https://www.washingtonrush.com",
    logo: null,
  },
  {
    name: "Whatcom FC Rangers",
    city: "Bellingham",
    website: "https://whatcomfcrangers.org",
    logo: null,
  },
];

/**
 * Slugs seeded in error. "Northwest Nationals" turned out to be a baseball
 * club; "Issaquah Soccer Club" is really Issaquah FC and got a new slug.
 * Removed only when nobody has reviewed them, so this can never delete
 * somebody's writing.
 */
const RETIRED_SLUGS = [
  "northwest-nationals",
  "issaquah-soccer-club",
  // Out of scope: the directory covers ECNL / RCL clubs.
  "emerald-city-fc",
  "issaquah-fc",
  "seattle-celtic",
];

async function main() {
  const { db } = await import("../src/db");
  const { clubs, reviews } = await import("../src/db/schema");

  let added = 0;
  let filled = 0;

  for (const club of SEATTLE_CLUBS) {
    const slug = slugify(club.name).slice(0, 60);
    const existing = await db.query.clubs.findFirst({
      where: eq(clubs.slug, slug),
      columns: { id: true, city: true, website: true, crestUrl: true },
    });

    if (!existing) {
      await db.insert(clubs).values({
        slug,
        name: club.name,
        city: club.city,
        website: club.website,
        crestUrl: club.logo,
      });
      added++;
      continue;
    }

    // Fill blanks only. Anything an admin has already set in the app stays.
    const patch = {
      city: existing.city ?? club.city,
      website: existing.website ?? club.website,
      crestUrl: existing.crestUrl ?? club.logo,
    };
    if (
      patch.city !== existing.city ||
      patch.website !== existing.website ||
      patch.crestUrl !== existing.crestUrl
    ) {
      await db.update(clubs).set(patch).where(eq(clubs.id, existing.id));
      filled++;
    }
  }

  const retired = await db.query.clubs.findMany({
    where: inArray(clubs.slug, RETIRED_SLUGS),
    columns: { id: true, slug: true },
  });
  let removed = 0;
  for (const r of retired) {
    const review = await db.query.reviews.findFirst({
      where: and(eq(reviews.subjectType, "club"), eq(reviews.subjectId, r.id)),
      columns: { id: true },
    });
    if (review) {
      console.log(`Kept ${r.slug}: it has reviews, so it needs a human.`);
      continue;
    }
    await db.delete(clubs).where(eq(clubs.id, r.id));
    removed++;
  }

  const incomplete = SEATTLE_CLUBS.filter((c) => !c.city || !c.website || !c.logo);
  console.log(
    `Clubs: ${added} added, ${filled} updated, ${removed} seeded-in-error removed.`,
  );
  if (incomplete.length > 0) {
    console.log(
      `Still incomplete (fill in from the app): ${incomplete
        .map((c) => c.name)
        .join(", ")}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
