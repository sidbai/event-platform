/**
 * Why a connection string will not work, in words.
 *
 * A malformed DATABASE_URL reaches the driver as `ERR_INVALID_URL` with the
 * value redacted, pointing at the line that constructs the client — which
 * says nothing about the variable, the shape it wanted, or which of the
 * likely mistakes was made. That error once failed a deploy and read as a
 * bug in this file.
 *
 * Every message here names the mistake and never the value: the string holds
 * a password, and build logs are kept.
 */

const SCHEMES = ["postgres://", "postgresql://"];

export function describeConnectionProblem(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") {
    return "DATABASE_URL is not set.";
  }
  const value = raw.trim();

  // The three ways a connection string arrives mangled, in the order they
  // actually happen: pasted with the command in front of it, pasted with the
  // shell quotes around it, or pasted as the host on its own.
  if (/^psql\s/i.test(value)) {
    return 'DATABASE_URL starts with "psql " — copy only the connection string, not the command.';
  }
  if (/^["']|["']$/.test(value)) {
    return "DATABASE_URL is wrapped in quotes — the value itself should not include them.";
  }
  if (!SCHEMES.some((s) => value.toLowerCase().startsWith(s))) {
    return "DATABASE_URL has no scheme — it must start with postgresql:// and include the user, host and database, not the host alone.";
  }

  try {
    new URL(value);
  } catch {
    return "DATABASE_URL is not a valid URL — check for a stray space or bracket in the host.";
  }
  return null;
}
