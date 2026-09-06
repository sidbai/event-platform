/**
 * Does the database have everything the code is about to ask it for?
 *
 *   DATABASE_URL='postgresql://…' pnpm db:check
 *
 * Written after shipping a deploy whose migration had not actually reached
 * production. The code selected a column that did not exist, every page that
 * reads events returned 500, and nothing found out until a smoke test did —
 * by which point it was live.
 *
 * The gap it closes is specific. CI cannot catch this: it builds its database
 * from the same files as the code, so they always agree. Only the real target
 * can answer, and until now the only way to ask was to deploy and see.
 *
 * Read-only. It runs one query against information_schema and writes nothing.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { sql } = await import("drizzle-orm");
  const schema = await import("../src/db/schema");
  const { db } = await import("../src/db");

  // What the code believes exists.
  const expected = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    let table;
    try {
      table = getTableConfig(value as never);
    } catch {
      continue; // enums, relations, types — not tables
    }
    expected.set(table.name, new Set(table.columns.map((c) => c.name)));
  }

  const rows = (await db.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `)) as unknown as { table_name: string; column_name: string }[];

  const actual = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
    actual.get(r.table_name)!.add(r.column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  let columnCount = 0;

  for (const [table, columns] of expected) {
    const there = actual.get(table);
    if (!there) {
      missingTables.push(table);
      continue;
    }
    for (const column of columns) {
      columnCount++;
      if (!there.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  const host = new URL(url).host;

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log(
      `✓ ${host} has everything the code expects — ${expected.size} tables, ${columnCount} columns.`,
    );
    // Deliberately silent about columns the database has and the code does not.
    // That is a rolled-back deploy or a dropped feature, and it breaks nothing:
    // the code never asks for them.
    process.exit(0);
  }

  console.error(`✗ ${host} is behind the code.\n`);
  for (const t of missingTables) console.error(`  table  ${t}  missing`);
  for (const c of missingColumns) console.error(`  column ${c}  missing`);
  console.error(
    `\nEvery page that reads one of these will fail. Run the migrations against this database before deploying:\n\n  DATABASE_URL='${url.replace(/:[^:@]+@/, ":****@")}' pnpm db:migrate\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
