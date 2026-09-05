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
    logo: `${B}/blackhills-fc/logo-2EDdm0L9l8U1vTz6bdp4uXRhGXo88w.png`,
  },
  {
    name: "Cascade FC",
    city: "Snoqualmie",
    website: "https://www.cascadefc.org",
    logo: `${B}/cascade-fc/logo-AwHaz7Fy7cP8xtGczR78sONUcxlo3n.png`,
  },
  {
    name: "Harbor Soccer Club",
    city: "Gig Harbor",
    website: "https://www.harborsoccerclub.com",
    logo: `${B}/harbor-soccer-club/logo-H7aUCzXawit0g30rsm2skl6PeKfqyW.png`,
  },
  {
    name: "Highline Premier FC",
    city: "Burien",
    website: "https://www.highlinepremier.com",
    logo: `${B}/highline-premier-fc/logo-QynnoIBTubTJIJQcil8XSIGSihPxv2.png`,
  },
  {
    // Kitsap, Mason and Jefferson counties; the club names no single city.
    name: "Kitsap Alliance FC",
    city: null,
    website: "https://www.kitsapalliancefc.com",
    logo: `${B}/kitsap-alliance-fc/logo-CQDsdnILjLhf5pYoDHMEzB2EOsHNTZ.png`,
  },
  {
    name: "Northwest United FC",
    city: "Burlington",
    website: "https://www.nwunited.org",
    logo: `${B}/northwest-united-fc/logo-0G2etQnE6Jx9JtbEj9izX1YTI8T5qS.png`,
  },
  {
    name: "Sound Football Club",
    city: "Woodinville",
    website: "https://soundfc.org",
    logo: `${B}/sound-football-club/logo-l3oxNKf10dL7zBkv5mAauBH4n7KOqM.png`,
  },
  {
    name: "Valor Soccer",
    city: "Maple Valley",
    website: "https://www.valorsoccer.com",
    logo: `${B}/valor-soccer/logo-S6FcTG5RTSngh80hmsKr4aSxb5M9na.png`,
  },
  {
    // Their own site states no city, only "North County", so this stays blank
    // rather than borrowing one from a third-party directory.
    name: "Washington Rush",
    city: null,
    website: "https://www.washingtonrush.com",
    logo: `${B}/washington-rush/logo-rMP6FDPmFY1boEUnZYQDIRCNh7KGOI.png`,
  },
  {
    name: "Whatcom FC Rangers",
    city: "Bellingham",
    website: "https://whatcomfcrangers.org",
    logo: `${B}/whatcom-fc-rangers/logo-lI7P4PBOZaDyL9Q4YHH8HpfToafLfS.png`,
  },
  // --- Seattle-area Washington Premier League clubs, added Sep 2026. -----
  //
  // WPL is a different kind of list from the RCL: 89 clubs across Washington,
  // Idaho and Oregon, spanning elite N1 down to recreational. So this is a
  // chosen subset, not the membership — the Puget Sound clubs families
  // actually pick between, each checked against its own site.
  //
  // Directory: https://system.gotsport.com/org_event/events/20169/clubs
  //
  // Left out on purpose: Sno-King Youth Club, which runs the FC Edmonds
  // programme and would double-count one organisation; Terrace Brier SC,
  // which describes itself as recreational; and Normandy Park FC, which could
  // not be verified at all.
  {
    name: "Eagleclaw FC",
    city: "Tukwila",
    website: "https://www.eagleclawfc.org",
    logo: `${B}/eagleclaw-fc/logo-1f3Dfqahp9WmbXKKI53jhTRYZqr8m8.png`,
  },
  {
    // Restored: dropped when the directory narrowed to ECNL/RCL, and back now
    // that WPL clubs are in scope.
    name: "Emerald City FC",
    city: "Seattle",
    website: "https://emeraldcityfc.org",
    logo: `${B}/emerald-city-fc/logo-81dowANSuevkv30frASpiZNrprp2Fd.png`,
  },
  {
    name: "Everett Youth Soccer Club",
    city: "Everett",
    website: "https://www.everettyouthsoccerclub.com",
    logo: `${B}/everett-youth-soccer-club/logo-6msGCj8qTBZEOjx0nAFQwjWGtEKIFS.png`,
  },
  {
    name: "Lake Washington Premier FC",
    city: "Kirkland",
    website: "https://www.lwpfc.org",
    logo: `${B}/lake-washington-premier-fc/logo-PfypW8l4360eI91Ax2pzEhphRvIGd8.png`,
  },
  {
    name: "Mukilteo Youth Soccer Club",
    city: "Mukilteo",
    website: "https://mysc.org",
    logo: `${B}/mukilteo-youth-soccer-club/logo-qKbfNlTYMEWTjK5BYrBlRgELmixat7.webp`,
  },
  {
    name: "Northlake Soccer Club",
    city: "Kenmore",
    website: "https://www.northlakesoccerclub.com",
    logo: `${B}/northlake-soccer-club/logo-tKgv5eJ5lnD27GZvDvS88k492ykCWt.png`,
  },
  {
    name: "Pilchuck Soccer Alliance",
    city: "Marysville",
    website: "https://www.pilchucksocceralliance.com",
    logo: `${B}/pilchuck-soccer-alliance/logo-V1k1vpaJVYDfOh6m23swPee88lrwJp.png`,
  },
  {
    // Restored alongside Emerald City, for the same reason.
    name: "Seattle Celtic",
    city: "Seattle",
    website: "https://seattleceltic.com",
    logo: `${B}/seattle-celtic/logo-97O3eg3sdGlzUiMzoJuZ7uFtcly8wT.png`,
  },
  // --- A second pass of Seattle-area WPL clubs, Sep 2026. ---------------
  //
  // Left out again with the reasons recorded: Sparta Tacoma is North Tacoma
  // SC's premier programme, its own page 500s, and the only marks on that site
  // are the parent club's and the CMS vendor's. Southlake FC, Mt. Rainier FC,
  // Puget Sound SC, Granite Falls YSC and South Tacoma United could not be
  // placed or verified at all.
  {
    name: "Seattle Reign Academy",
    city: "Seattle",
    website: "https://www.reignacademy.com",
    logo: `${B}/seattle-reign-academy/logo-wTwRsJXb79r3TtWo0LFVkvWR6zkMgb.png`,
  },
  {
    // Their site names the North Kitsap region rather than a home city.
    name: "North Kitsap Soccer Club",
    city: null,
    website: "https://northkitsapsoccer.org",
    logo: `${B}/north-kitsap-soccer-club/logo-B3o4A1Dt0KfMt1bw6XKhPBv7EiQo4A.png`,
  },
  {
    // The site titles itself "Association", but the crest and the WPL
    // directory both say Club.
    name: "Norpoint Soccer Club",
    city: "Tacoma",
    website: "https://norpointsoccer.org",
    logo: `${B}/norpoint-soccer-club/logo-dZSCXeljE02cJXPJqJnKfhUfHDgizY.jpg`,
  },
  {
    name: "South Kitsap Soccer Club",
    city: "Port Orchard",
    website: "https://www.sksoccer.com",
    logo: `${B}/south-kitsap-soccer-club/logo-1UzP4GvP7XTr7p31k1TXXQvdjMVhsw.png`,
  },
  {
    // Serves Bainbridge Island, Kitsap and the Olympic Peninsula; no home city.
    name: "West Sound Soccer Academy",
    city: null,
    website: "https://westsoundsoccer.org",
    logo: `${B}/west-sound-soccer-academy/logo-RKNvNk32APxlpIntGrlXvGltji9V65.png`,
  },
  {
    name: "Stanwood Camano Youth Soccer Club",
    city: "Stanwood",
    website: "https://scysc.com",
    logo: `${B}/stanwood-camano-youth-soccer-club/logo-t3fPSZr1VVxENOy7Nc4xuRGCrijdXA.jpg`,
  },
  // --- Surf, Atletico and the international academies, Sep 2026. --------
  //
  // The academies carry a foreign parent club's mark. Showing it on that
  // academy's own review page is the same nominative use as any other club
  // logo here — it identifies the organisation being reviewed.
  //
  // One row per organisation, not per location: the WPL directory lists BVB
  // twice (Seattle, Eastside) and Nido Aguila four times, but a reviewer is
  // reviewing the club, not the training site.
  {
    name: "Western Washington Surf",
    city: "Bellevue",
    website: "https://westernwasurf.com",
    logo: `${B}/western-washington-surf/logo-2UZrIt2CgZx3hmaZUMWCDqa7wlupzx.jpg`,
  },
  {
    // Eastern Washington, not Puget Sound, and added on request. Formerly
    // Eastern Washington Surf SC — ewsurfsc.com is the old site and points
    // here, so listing both would have been one club twice.
    name: "Washington East Surf Soccer Club",
    city: null,
    website: "https://www.wesurfsc.com",
    logo: `${B}/washington-east-surf-soccer-club/logo-b4HNOz5YJDyq8zyYdDuFKi2sF8tkZd.png`,
  },
  {
    // Still its own club. It joined forces with ALBION SC and Bellevue United
    // in Nov 2025 for operational infrastructure, which is a partnership
    // rather than the merger it first reads as.
    name: "Atletico Futbol Club",
    city: null,
    website: "https://atleticofutbol.com",
    logo: `${B}/atletico-futbol-club/logo-MLskqpAbmSvQGTVWOexXSuPr9iIOFn.png`,
  },
  {
    name: "BVB International Academy Washington",
    city: null,
    website: "https://www.bvbia-washington.com",
    logo: `${B}/bvb-international-academy-washington/logo-yZvJH3SuxnmOCzYWW9JfMHdtQZO7nX.png`,
  },
  {
    name: "Pumas Seattle",
    city: "Seattle",
    website: "https://pumasseattle.com",
    logo: `${B}/pumas-seattle/logo-jVZsXFxRvqOCMna2iG1yP4OtFcOKB4.png`,
  },
  {
    name: "Rayados Soccer Academy Northwest",
    city: "Issaquah",
    website: "https://www.rayadosnw.com",
    logo: `${B}/rayados-soccer-academy-northwest/logo-hPHenNZIz1Ye2BJLDkBGa0Mm3L9xCf.png`,
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
  // Out of scope: Issaquah FC is neither an RCL full member nor in the WPL
  // directory. Emerald City FC and Seattle Celtic used to sit here too and
  // were restored when WPL clubs came into scope — they must stay out of this
  // list or the seeder would delete them again on the next run.
  "issaquah-fc",
  // Removed Sep 2026. Liverpool FC IA Washington has closed; the other two
  // are gone at the club's request. FC Edmonds was always the thinnest entry
  // here — its domain only ever redirected to Sno-King, which runs it.
  "liverpool-fc-international-academy-washington",
  "nido-aguila-club-america-seattle",
  "fc-edmonds",
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
