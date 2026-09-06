/**
 * Stands in for the `server-only` package under vitest.
 *
 * That package exists to make a build fail if server code is pulled into a
 * client bundle, and it does that by throwing on import outside a React Server
 * Component. Vitest is neither, so importing a query module to test it trips
 * the guard. Aliased away here rather than dropped from the source, where it
 * is doing a real job.
 */
export {};
