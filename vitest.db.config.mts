import { defineConfig } from "vitest/config";

/**
 * Tests that need a real Postgres.
 *
 * Separate from the default suite on purpose: `pnpm test` stays a fast,
 * dependency-free run that anyone can do offline, and this one is the slower
 * pass that catches what pure functions cannot — SQL that typechecks, lints
 * and passes every unit test, and then throws the moment a driver sees it.
 *
 * Runs single-file at a time: these share one database, and parallel suites
 * writing the same tables would fail on each other rather than on the code.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./tests/db/server-only-stub.ts", import.meta.url).pathname,
    },
  },
});
