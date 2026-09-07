import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { describeConnectionProblem } from "./connection-string";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

/*
 * Say what is wrong with the variable, rather than letting the driver say
 * ERR_INVALID_URL against a redacted value on the line below.
 *
 * A missing URL is only a warning: the build renders pages that never query,
 * and failing here would stop a checkout from building at all. A malformed
 * one is fatal, because it is always a mistake in the value and every query
 * will fail — better at module load, named, than as a 500 per request.
 */
const problem = describeConnectionProblem(connectionString);
if (problem) {
  if (connectionString === undefined || connectionString.trim() === "") {
    console.warn(`${problem} Database calls will fail.`);
  } else {
    throw new Error(problem);
  }
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
