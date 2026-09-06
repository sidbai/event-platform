import { syncDueEvents } from "@/features/sync/run";

export const dynamic = "force-dynamic";
/**
 * Long enough to work through a handful of tournaments, each of which is
 * several page fetches against somebody else's server.
 */
export const maxDuration = 60;

/**
 * The scheduled refresh of every external listing that has come due.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`, and the
 * check is deliberately not optional: without it this is an unauthenticated
 * endpoint that makes this application fetch other people's servers on demand,
 * which is somebody else's outage with our name on it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit")) || 5;
  const reports = await syncDueEvents(Math.min(limit, 20));

  // The failures are the interesting half: this is the only place a connector
  // that has quietly stopped working shows up.
  return Response.json({
    checked: reports.length,
    failed: reports.filter((r) => !r.ok).length,
    reports,
  });
}
