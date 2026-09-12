import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

import { eq } from "drizzle-orm";

import { slugify } from "../src/lib/slug";

/**
 * The knowledge base, written into the clubs as revision one.
 *
 *   pnpm db:seed:club-knowledge            # dry run
 *   pnpm db:seed:club-knowledge --apply
 *
 * For each club the file knows: the tiers, squad words, colours, age bands,
 * branches, sources and — as Markdown bullets, one sentence each — the
 * summary, written to the club row and recorded in club_edits with no
 * editor and a line saying it was read from the website and when. Only
 * clubs nobody has written anything into: a person's edit is never
 * overwritten by a machine's reading, however fresh.
 *
 * And the coaches the sites publish, into the coaches table with the same
 * baseline history a seeded coach gets — only names the club does not
 * already list, and only coaching and technical roles, for the reason
 * seed-coaches.ts gives: a registrar does not coach anybody, and a review
 * page for one would be a page for a job they do not do.
 */

const APPLY = process.argv.includes("--apply");

type Coach = { name: string; role: string | null; ageGroups: string[] };
type Profile = {
  slug: string;
  tiers: string[];
  squadMarkers: string[];
  colours: string;
  ageBands: string;
  branches: string[];
  coaches: Coach[];
  summary: string;
  sources: string[];
  readAt: string;
};

function bullets(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) => `- ${p}`).join("\n");
}

const NOT_A_COACH = /registrar|admin|operations|apparel|social media|marketing|treasurer|president|scheduler|athletic trainer|performance coach|mental skills|coordinator|contact/i;

function coachRole(role: string | null): "director" | "coach" | "assistant" | "head" {
  if (!role) return "coach";
  if (/director|technical|doc\b|head of|executive|manager/i.test(role)) return "director";
  if (/assistant/i.test(role)) return "assistant";
  if (/head coach/i.test(role)) return "head";
  return "coach";
}

async function main() {
  const { db } = await import("../src/db");
  const { clubEdits, clubs, coaches, coachEdits } = await import("../src/db/schema");
  const { allProfiles } = await import("../src/features/clubs/knowledge/store");

  let seeded = 0;
  let kept = 0;
  let unknown = 0;
  let coachesAdded = 0;
  let coachesPresent = 0;

  for (const profile of allProfiles() as Profile[]) {
    const club = await db.query.clubs.findFirst({
      where: eq(clubs.slug, profile.slug),
      columns: { id: true, name: true, city: true, website: true, crestUrl: true, tiers: true, branches: true, about: true },
    });
    if (!club) {
      unknown++;
      continue;
    }
    const held = club.tiers.length > 0 || club.branches.length > 0 || club.about;
    const readAt = new Date(profile.readAt);
    const day = profile.readAt.slice(0, 10);

    if (held) {
      kept++;
    } else if (profile.tiers.length > 0 || profile.summary) {
      seeded++;
      console.log(`  ${profile.slug}: ${profile.tiers.length} tiers, ${profile.summary ? "about" : "no about"}, ${profile.sources.length} sources`);
      if (APPLY) {
        const next = {
          tiers: profile.tiers,
          squadMarkers: profile.squadMarkers,
          colours: ["tier", "squad", "mixed", "none"].includes(profile.colours) ? profile.colours : null,
          ageBands: ["single-year", "two-year", "both"].includes(profile.ageBands) ? profile.ageBands : null,
          branches: profile.branches,
          about: profile.summary ? bullets(profile.summary) : null,
          sources: profile.sources,
        };
        await db
          .update(clubs)
          .set({ ...next, knowledgeReadAt: readAt })
          .where(eq(clubs.id, club.id));
        await db.insert(clubEdits).values({
          clubId: club.id,
          editedBy: null,
          name: club.name,
          city: club.city,
          website: club.website,
          crestUrl: club.crestUrl,
          ...next,
          summary: `Read from the club's website on ${day}`,
        });
      }
    }

    const listed = await db.query.coaches.findMany({
      where: eq(coaches.clubId, club.id),
      columns: { name: true },
    });
    const have = new Set(listed.map((c) => c.name.toLowerCase().replace(/[^a-z ]/g, "").trim()));
    for (const c of profile.coaches) {
      if (c.role && NOT_A_COACH.test(c.role) && !/coach|director/i.test(c.role)) continue;
      const key = c.name.toLowerCase().replace(/[^a-z ]/g, "").trim();
      if (!key || key.split(" ").length < 2 || have.has(key)) {
        if (have.has(key)) coachesPresent++;
        continue;
      }
      have.add(key);
      coachesAdded++;
      if (!APPLY) continue;
      const role = coachRole(c.role);
      const slug = slugify(`${c.name} ${profile.slug}`).slice(0, 60);
      const clash = await db.query.coaches.findFirst({ where: eq(coaches.slug, slug), columns: { id: true } });
      if (clash) continue;
      const [created] = await db
        .insert(coaches)
        .values({ slug, name: c.name, clubId: club.id, role, ageGroups: c.ageGroups })
        .returning({ id: coaches.id });
      await db.insert(coachEdits).values({
        coachId: created.id,
        editedBy: null,
        name: c.name,
        role,
        ageGroups: c.ageGroups,
        summary: `Listed on the club's website on ${day}${c.role ? ` as ${c.role}` : ""}`,
      });
    }
  }

  console.log(
    `\nClubs: ${seeded} to seed, ${kept} already written by a person or seeded, ${unknown} not in the directory.` +
      `\nCoaches: ${coachesAdded} to add, ${coachesPresent} already listed.` +
      (APPLY ? "\nApplied." : "\nDry run — pass --apply to write."),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
