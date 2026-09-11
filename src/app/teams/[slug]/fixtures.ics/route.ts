import { eq } from "drizzle-orm";

import { db } from "@/db";
import { teams } from "@/db/schema";
import { teamFixtures } from "@/features/calendar/queries";
import { calendar } from "@/features/calendar/ics";

export const dynamic = "force-dynamic";

/**
 * A team's fixtures, as a calendar to subscribe to.
 *
 * The thing a parent actually wants from a fixture list is for it not to be a
 * fixture list — for the game to be in the same place as the dentist and the
 * school concert, and to move when the league moves it.
 *
 * No account, because a subscription is a URL a phone fetches on its own
 * schedule with nothing to sign in with. Everything here is on a public page
 * already; this is the same thing in a format a calendar reads.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, name: true, visibility: true },
  });
  if (!team || team.visibility !== "public") {
    return new Response("Not found", { status: 404 });
  }

  const body = calendar(await teamFixtures(team.id), {
    name: team.name,
    timeZone: "America/Los_Angeles",
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Phones re-fetch on their own cadence, mostly hourly at best. An hour
      // of cache costs nobody a kick-off and saves every subscriber a query.
      "cache-control": "public, max-age=3600",
      "content-disposition": `inline; filename="${slug}.ics"`,
    },
  });
}
