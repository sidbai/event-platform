import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { calendar } from "@/features/calendar/ics";
import { myCalendar } from "@/features/me/calendar";

export const dynamic = "force-dynamic";

/**
 * One person's calendar: the teams they follow and the events they said they
 * would be at.
 *
 * The token in the address is the whole of the authentication, because a
 * calendar reader has nothing else — no session, no header anybody can set.
 * So it is long, random, and rotatable, and it is the reason this route
 * exists rather than /me/calendar.ics with a cookie: a cookie is exactly what
 * a phone subscribing to a URL does not send.
 *
 * The address is /calendar/<token>/fixtures.ics because Next reads a folder
 * called [token].ics as a literal, not as a parameter — the dot has to be in
 * the leaf.
 *
 * A token that matches nothing is a 404 and not a 401. There is nothing to
 * log in to here, and saying "wrong password" to a calendar reader tells an
 * address-guesser they are close.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token.length < 20) return new Response("Not found", { status: 404 });

  const user = await db.query.users.findFirst({
    where: eq(users.feedToken, token),
    columns: { id: true, displayName: true, username: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  const body = calendar(await myCalendar(user.id), {
    name: "King Juan Soccer",
    timeZone: "America/Los_Angeles",
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=3600",
      // Nothing about a person's own calendar belongs in a search index or a
      // shared cache, and the header costs nothing to say.
      "x-robots-tag": "noindex",
    },
  });
}
