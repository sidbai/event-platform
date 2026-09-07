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

/*
 * One client per process, in production too.
 *
 * It used to be cached only outside production, on the reasoning that a
 * serverless instance evaluates the module once anyway. It does not always:
 * anything that re-evaluates it opens a second pool nobody closes, and those
 * connections idle until the platform reaps them.
 *
 * idle_timeout hands a connection back rather than holding it for the life of
 * an instance that may serve one request an hour. connect_timeout turns a
 * network stall into an error a page can report instead of a request that
 * hangs until the platform kills it.
 *
 * prepare: false is required by any transaction-pooling proxy — a named
 * statement prepared on one server connection is not there on the next.
 */
const client =
  globalForDb.__sql ??
  postgres(connectionString ?? "postgresql://invalid", {
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
globalForDb.__sql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Db = typeof db;
