import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { clubs } from "@/db/schema";

import { forPrompt, type ClubProfile } from "./profile";
import { profileFor } from "./store";

/**
 * What we know about a club, from wherever it now lives.
 *
 * The community's copy in the clubs table is the authority once it has
 * anything in it; the knowledge file is the fallback for a club nobody has
 * seeded or edited yet. Shaped as a ClubProfile so the prompt builder and
 * the vocabulary rule need not know which it came from.
 */
export async function clubKnowledge(slug: string | null | undefined): Promise<ClubProfile | null> {
  if (!slug) return null;
  const row = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: {
      tiers: true,
      squadMarkers: true,
      colours: true,
      ageBands: true,
      branches: true,
      about: true,
      sources: true,
      knowledgeReadAt: true,
      updatedAt: true,
    },
  });
  const held = row && (row.tiers.length > 0 || row.branches.length > 0 || row.about);
  if (!row || !held) return profileFor(slug);
  const colours = row.colours as ClubProfile["colours"] | null;
  const ageBands = row.ageBands as ClubProfile["ageBands"] | null;
  return {
    slug,
    tiers: row.tiers,
    squadMarkers: row.squadMarkers,
    colours: colours ?? "unknown",
    ageBands: ageBands ?? "unknown",
    branches: row.branches,
    coaches: [],
    summary: row.about ?? "",
    sources: row.sources,
    readAt: (row.knowledgeReadAt ?? row.updatedAt).toISOString(),
    model: row.knowledgeReadAt ? "read from the club website" : "community",
  };
}

/** The one-line context the merge prompts carry, from the database. */
export async function clubContextFromDb(slug: string | null | undefined): Promise<string | null> {
  const profile = await clubKnowledge(slug);
  if (!profile) return null;
  return forPrompt(profile) || null;
}
