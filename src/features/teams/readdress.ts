import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, events, teamSlugs, teams } from "@/db/schema";
import { slugify } from "@/lib/slug";

import { uniqueTeamSlug } from "./slug";

/**
 * Giving a team the address its name asks for.
 *
 * A synced team's name is written when its row is created, and the address is
 * made from that name at the same moment. Rename it afterwards — because the
 * gender arrived late, because the club's prefix changed — and the address
 * stays as it was: "Harbor Soccer Club B13/14" living at /teams/harbor-sc-7,
 * and thirteen Regional Club League teams at addresses spelling out an age
 * group nobody calls them any more.
 *
 * Not cosmetic. The address is what a parent sends to another parent and what
 * a search engine keeps, and one that disagrees with the name on the page
 * reads as the wrong page.
 *
 * The old address goes on answering. Every fixture on this site links a team
 * by slug and the merge flow already retires addresses this way — a row in
 * team_slugs, and /teams/[slug] redirects rather than 404s when it finds one.
 */

export type Readdress = {
  id: string;
  name: string;
  from: string;
  to: string;
};

export type ReaddressPlan = {
  scope: string;
  moving: Readdress[];
  /** Teams left alone, and why — a claimed team's address is not ours. */
  keeping: { name: string; slug: string; because: string }[];
};

/**
 * What the address would be if it were made from the name today.
 *
 * The same two steps a row is created by, in the same order, so a team this
 * says nothing about is one whose address genuinely still comes from its name.
 */
function wantedSlug(name: string): string {
  return slugify(name).slice(0, 60);
}

export async function planReaddress(eventSlug: string): Promise<ReaddressPlan | null> {
  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true, title: true },
  });
  if (!event) return null;

  const rows = await db
    .selectDistinct({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      claimed: sql<boolean>`${teams.ownerId} is not null`,
    })
    .from(eventTeams)
    .innerJoin(teams, eq(teams.id, eventTeams.teamId))
    .where(eq(eventTeams.eventId, event.id));

  const moving: Readdress[] = [];
  const keeping: ReaddressPlan["keeping"] = [];

  for (const row of rows) {
    const wanted = wantedSlug(row.name);
    /*
     * A numbered address is not wrong on its own: two teams can genuinely
     * want the same one, and the second gets a number. Only an address whose
     * stem is no longer the name's is stale.
     */
    if (row.slug === wanted || row.slug.replace(/-\d+$/, "") === wanted) continue;
    if (row.claimed) {
      keeping.push({
        name: row.name,
        slug: row.slug,
        because: "somebody has claimed it — their page, their address",
      });
      continue;
    }
    moving.push({ id: row.id, name: row.name, from: row.slug, to: wanted });
  }

  return { scope: event.title, moving, keeping };
}

/**
 * One team at a time, each in its own transaction.
 *
 * A slug is unique and picking a free one is a read followed by a write, so a
 * batch that fails halfway would leave some teams moved and some not with no
 * way to tell which — whereas one at a time either moves a team and retires
 * its old address together, or does neither.
 */
export async function readdress(plan: ReaddressPlan): Promise<number> {
  let moved = 0;
  for (const team of plan.moving) {
    await db.transaction(async (tx) => {
      const free = await uniqueTeamSlug(team.to);
      /*
       * The address it is leaving keeps answering. onConflictDoNothing
       * because a team that has moved before already has the row, and the
       * redirect only resolves when a retired address names exactly one team.
       */
      await tx
        .insert(teamSlugs)
        .values({ slug: team.from, teamId: team.id })
        .onConflictDoNothing();
      await tx
        .update(teams)
        .set({ slug: free, updatedAt: new Date() })
        .where(and(eq(teams.id, team.id), isNull(teams.ownerId)));
    });
    moved++;
  }
  return moved;
}
