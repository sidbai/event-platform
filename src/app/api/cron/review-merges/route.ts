import { reviewProposals } from "@/features/teams/suggest/review";

export const dynamic = "force-dynamic";

/**
 * Long enough to work through a few hundred pairs, twelve to a call.
 *
 * The pairs are read from the database in one pass and then asked about in
 * batches, each of which is a round trip to somebody else's model. Three
 * hundred seconds is roughly four hundred pairs at the pace this runs.
 */
export const maxDuration = 300;

/**
 * The nightly read of the merge queue.
 *
 * Separate from the sync cron on purpose. A tournament import must not fail,
 * slow down or cost money because a model's API is having an afternoon, and
 * this must not be skipped because a sync ran long.
 *
 * Scheduled at 11:40 UTC, which is a bit before five in the morning here —
 * off the hour so it never lands on a sync tick, and early enough that a
 * night's recommendations are waiting rather than arriving while somebody is
 * working down the queue.
 *
 * It writes recommendations. It does not merge, rename or bind anything: the
 * admin page is where a pair becomes a decision, and it stays that way.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit")) || 400;
  const out = await reviewProposals({ limit: Math.min(limit, 1000) });

  return Response.json(out);
}
