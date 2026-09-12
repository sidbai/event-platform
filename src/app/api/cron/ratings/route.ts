import { rebuildRatings } from "@/features/predict/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The nightly rebuild of the team ratings.
 *
 * After the syncs of the day and before anybody is up: 10:20 UTC is a
 * little after three in the morning here. Off the hour so it never shares
 * a tick with a sync. It replaces one table of estimates and touches
 * nothing else.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const out = await rebuildRatings();
  return Response.json(out);
}
