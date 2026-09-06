/**
 * Refresh one listing from the platform that hosts it, by hand.
 *
 *   pnpm sync:event <slug>
 *
 * The same code path the cron uses, runnable on its own — because the first
 * question about a connector is always "what does it actually pull", and the
 * answer should not require waiting for a schedule.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("usage: pnpm sync:event <slug>");

  const { db } = await import("../src/db");
  const { events } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { syncEvent } = await import("../src/features/sync/run");

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, title: true, sourcePlatform: true },
  });
  if (!event) throw new Error(`no event with slug "${slug}"`);
  if (!event.sourcePlatform) throw new Error(`"${event.title}" is not a synced listing`);

  console.log(`syncing ${event.title} from ${event.sourcePlatform}…`);
  const report = await syncEvent(event.id);
  console.log(report.ok ? `✓ ${report.detail}` : `✗ ${report.detail}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
