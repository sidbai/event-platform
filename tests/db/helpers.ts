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

/** The tables this suite writes, children before parents. */
const TABLES = [
  "event_tasks",
  "event_registrations",
  "matches",
  "rosters",
  "event_teams",
  "event_divisions",
  "team_members",
  "events",
  "teams",
  "venues",
  "users",
];

/**
 * Empty everything this suite writes.
 *
 * Only the tables that actually exist. This helper sits on a branch where
 * event_tasks does not, and naming a missing table fails the whole statement —
 * so the list is filtered against the catalogue rather than assumed. It also
 * means a table added later needs no change here beyond its name.
 */
export async function truncateAll(db: {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
}) {
  const rows = (await db.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ${sql`(${sql.join(
      TABLES.map((t) => sql`${t}`),
      sql`, `,
    )})`}
  `)) as unknown as { table_name: string }[];

  const present = TABLES.filter((t) => rows.some((r) => r.table_name === t));
  if (present.length === 0) {
    throw new Error(
      "No known tables found — is the schema built? See the db job in .github/workflows/ci.yml.",
    );
  }

  await db.execute(
    sql`truncate table ${sql.join(
      present.map((t) => sql.identifier(t)),
      sql`, `,
    )} restart identity cascade`,
  );
}
