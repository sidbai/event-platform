import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { slugify } from "../src/lib/slug";

// Must run before the db module is loaded — see seed-clubs for why.
config({ path: ".env.local" });

/**
 * Senior coaching and technical staff at the largest Seattle clubs.
 *
 * These are real, named people on pages that carry reviews of them, so the
 * bar is higher than for clubs: every name and title below is copied from the
 * club's own published staff page, verbatim, and nothing is inferred.
 *
 * Only coaching and technical roles are listed. Each club's staff page also
 * names administrators, registrars, uniform coordinators, a business
 * development manager and an athletic trainer — none of them coach anybody,
 * and putting them where parents rate coaching would invite reviews of people
 * for a job they do not do.
 *
 * Rank-and-file staff are deliberately absent. Eastside publishes 41 people
 * whose title is simply "Coach", and coach_role only offers head, assistant
 * or director — filing them as "Head coach" would attach a title their club
 * never gave them. That needs an enum value, not a guess.
 */
const COACHES: {
  clubSlug: string;
  name: string;
  /** Verbatim from the club's page, for the record. */
  title: string;
  role: "head" | "assistant" | "director";
  ageGroups: string[];
}[] = [
  // --- Crossfire Premier — crossfiresoccer.org/coaches/directors ---------
  { clubSlug: "crossfire-premier", name: "Bernie James", title: "Director of Coaching", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Leo Maric", title: "Technical Director", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Kevin Legg", title: "Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Eddie Henderson", title: "Boys ECNL Director", role: "director", ageGroups: [] },

  // --- Seattle United — seattleunited.com/leadership ---------------------
  { clubSlug: "seattle-united", name: "Logan Emory", title: "ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Lauren Barnes", title: "Assistant Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Bastien Catrin", title: "Assistant Boys ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Alex Chursky", title: "Technical Director, U10-U12 Boys & Girls Premier Director", role: "director", ageGroups: ["U10-U12"] },
  { clubSlug: "seattle-united", name: "Paul Aur", title: "U13-U19 Boys & Girls Premier Director", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "seattle-united", name: "Jason McGlothern", title: "U8-U9 Boys & Girls Juniors Director", role: "director", ageGroups: ["U8-U9"] },
  { clubSlug: "seattle-united", name: "Sean Russell", title: "Director, Northwest Region", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "George Singh", title: "Director, South Region", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Ed Moore", title: "Director, Shoreline Region / Goalkeeper Director", role: "director", ageGroups: [] },

  // --- Eastside FC — eastsidefc.org/coaches ------------------------------
  { clubSlug: "eastside-fc", name: "Tom Bialek", title: "Director of Soccer", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Anderson Prestes", title: "Director of Programming", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Troy Letherman", title: "Boys ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Tim Reynolds", title: "Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Claire Knock", title: "DOC, Girls U13-U19 ECNL RL/RCL", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "eastside-fc", name: "Porter Lombard", title: "DOC, Boys U13-U19 ECNL RL/RCL", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "eastside-fc", name: "Andrew Dortch", title: "DOC, EFC West", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Sean Morris", title: "DOC, West Maroon", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Erin Vaughan", title: "DOC, Girls West Maroon", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Joe Mondello", title: "Director of Goalkeeping", role: "director", ageGroups: [] },
];

async function main() {
  const { db } = await import("../src/db");
  const { clubs, coaches, coachEdits } = await import("../src/db/schema");

  let added = 0;
  let skipped = 0;
  const missingClubs = new Set<string>();

  for (const c of COACHES) {
    const club = await db.query.clubs.findFirst({
      where: eq(clubs.slug, c.clubSlug),
      columns: { id: true },
    });
    if (!club) {
      missingClubs.add(c.clubSlug);
      continue;
    }

    // Slug carries the club, so two clubs may each have a Chris Smith.
    const slug = slugify(`${c.name} ${c.clubSlug}`).slice(0, 60);
    const existing = await db.query.coaches.findFirst({
      where: eq(coaches.slug, slug),
      columns: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const [created] = await db
      .insert(coaches)
      .values({
        slug,
        name: c.name,
        clubId: club.id,
        role: c.role,
        ageGroups: c.ageGroups,
      })
      .returning({ id: coaches.id });

    // Baseline snapshot so the entry's history is reachable from the start,
    // the same shape createCoach writes.
    await db.insert(coachEdits).values({
      coachId: created.id,
      editedBy: null,
      name: c.name,
      role: c.role,
      ageGroups: c.ageGroups,
      summary: `Seeded from the club's staff page as ${c.title}`,
    });
    added++;
  }

  console.log(`Coaches: ${added} added, ${skipped} already present.`);
  if (missingClubs.size > 0) {
    console.log(`No such club (skipped): ${[...missingClubs].join(", ")}`);
  }
  process.exit(0);
}

void main();
