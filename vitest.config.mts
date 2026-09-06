import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // tests/db needs a real Postgres and runs as its own project
    // (vitest.db.config.mts, `pnpm test:db`). Left in, it would fail for
    // anyone running `pnpm test` without a database — which is most of the
    // time, and the reason the default run is worth keeping dependency-free.
    exclude: ["**/node_modules/**", "tests/db/**"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
