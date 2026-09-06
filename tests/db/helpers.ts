/**
 * Shared setup for the database-backed suite.
 *
 * Every test here runs against a real Postgres, because the whole point is the
 * layer pure tests cannot reach: what the driver does with a value, what a
 * constraint rejects, what a raw sql`` fragment actually compiles to.
 *
 * The database is emptied between files rather than mocked. A fake would agree
 * with whatever the code believes, which is exactly the belief under test.
 */
import { sql } from "drizzle-orm";

export function requireTestDatabase(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests need a real Postgres — see the db job in .github/workflows/ci.yml, or point it at a scratch local database.",
    );
  }
  // Guard rather than trust: this suite truncates tables, and a developer with
  // one shell variable set wrongly would otherwise wipe their own dev data or,
  // far worse, something further away.
  if (/neon\.tech|amazonaws|supabase|render\.com/i.test(url)) {
    throw new Error("Refusing to run destructive tests against a hosted database.");
  }
  process.env.DATABASE_URL = url;
  return url;
}

/** Everything this suite writes, emptied in one statement. */
export async function truncateAll(db: {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
}) {
  await db.execute(sql`
    truncate table
      event_tasks,
      event_registrations,
      matches,
      rosters,
      event_teams,
      event_divisions,
      team_members,
      events,
      teams,
      venues,
      users
    restart identity cascade
  `);
}
