import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { eventFixtures } from "@/features/calendar/queries";
import { calendar } from "@/features/calendar/ics";

export const dynamic = "force-dynamic";

/**
 * A whole event's fixtures, as a calendar to subscribe to.
 *
 * For the coach with four teams in a tournament and the parent with two
 * children in one — the team feed answers a narrower question, and this one
 * is what a club's own weekend looks like.
 *
 * No account, for the same reason as the team feed: a subscription is a URL a
 * phone fetches on its own with nothing to sign in with, and everything in it
 * is on a public page already.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, title: true, visibility: true, timezone: true },
  });
  if (!event || event.visibility !== "public") {
    return new Response("Not found", { status: 404 });
  }

  const body = calendar(await eventFixtures(event.id), {
    name: event.title,
    timeZone: event.timezone ?? "America/Los_Angeles",
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "content-disposition": `inline; filename="${slug}.ics"`,
    },
  });
}
