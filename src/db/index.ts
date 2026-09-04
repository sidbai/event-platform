import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV !== "production") {
  // Not fatal at build time (pages are dynamic; the adapter only needs the
  // driver shape) — but every query will fail until this is set.
  console.warn("DATABASE_URL is not set — database calls will fail.");
}

const globalForDb = globalThis as unknown as { __sql?: postgres.Sql };

// postgres-js connects lazily, so an unset URL only bites on the first query.
const client =
  globalForDb.__sql ??
  postgres(connectionString ?? "postgresql://invalid", { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__sql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Db = typeof db;
