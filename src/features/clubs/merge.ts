import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubAliases, clubEdits, clubs, coaches, reviews, teams } from "@/db/schema";

/**
 * Folding one club row into another, where both are the same club.
 *
 * The queue asks an admin to name the club a group of teams belongs to, and
 * with a hundred of them going in by hand the same club arrives twice under
 * two of its names: "IFC" and "Issaquah FC", one with nine teams and one
 * with eight, and a pair of them the same side entered twice.
 *
 * Nothing else notices. The duplicate finder compares names, and two teams
 * under two clubs normalise to two different names, so they never converge —
 * which is why this has to happen before the rename rather than after.
 *
 * Everything that points at the absorbed row moves; the row itself goes. Not
 * journalled, unlike a team merge: what is lost is one name, one slug and one
 * logo, and the plan this prints is enough to put them back by hand.
 */

export type ClubMergePlan = {
  from: { id: string; name: string; slug: string };
  into: { id: string; name: string; slug: string };
  teams: { name: string }[];
  aliases: string[];
  edits: number;
  coaches: { name: string }[];
  reviews: number;
};

export async function planClubMerge(
  fromSlug: string,
  intoSlug: string,
): Promise<ClubMergePlan | { error: string }> {
  if (fromSlug === intoSlug) return { error: "Those are the same club." };

  const cols = { id: true, name: true, slug: true } as const;
  const [from, into] = await Promise.all([
    db.query.clubs.findFirst({ where: eq(clubs.slug, fromSlug), columns: cols }),
    db.query.clubs.findFirst({ where: eq(clubs.slug, intoSlug), columns: cols }),
  ]);
  if (!from) return { error: `No club with slug "${fromSlug}".` };
  if (!into) return { error: `No club with slug "${intoSlug}".` };

  const [teamRows, aliasRows, coachRows, editCount, reviewCount] = await Promise.all([
    db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.clubId, from.id))
      .orderBy(teams.name),
    db.select({ alias: clubAliases.alias }).from(clubAliases).where(eq(clubAliases.clubId, from.id)),
    db.select({ name: coaches.name }).from(coaches).where(eq(coaches.clubId, from.id)),
    db.$count(clubEdits, eq(clubEdits.clubId, from.id)),
    db.$count(reviews, and(eq(reviews.subjectType, "club"), eq(reviews.subjectId, from.id))),
  ]);

  return {
    from,
    into,
    teams: teamRows,
    aliases: aliasRows.map((r) => r.alias),
    edits: editCount,
    coaches: coachRows,
    reviews: reviewCount,
  };
}

export async function mergeClubs(plan: ClubMergePlan): Promise<void> {
  const { from, into } = plan;

  await db.transaction(async (tx) => {
    await tx
      .update(teams)
      .set({ clubId: into.id, updatedAt: new Date() })
      .where(eq(teams.clubId, from.id));

    /*
     * An alias the survivor already answers to would break the unique key, and
     * it is already pointing where this would send it, so it is dropped rather
     * than moved.
     */
    await tx.execute(sql`
      delete from ${clubAliases} a
      where a.club_id = ${from.id}
        and exists (
          select 1 from ${clubAliases} b
          where b.alias = a.alias and b.club_id = ${into.id}
        )
    `);
    await tx
      .update(clubAliases)
      .set({ clubId: into.id })
      .where(eq(clubAliases.clubId, from.id));

    await tx.update(coaches).set({ clubId: into.id }).where(eq(coaches.clubId, from.id));

    // The absorbed row's history is the same club's history.
    await tx.update(clubEdits).set({ clubId: into.id }).where(eq(clubEdits.clubId, from.id));

    await tx
      .update(reviews)
      .set({ subjectId: into.id })
      .where(and(eq(reviews.subjectType, "club"), eq(reviews.subjectId, from.id)));

    await tx.delete(clubs).where(eq(clubs.id, from.id));
  });
}
