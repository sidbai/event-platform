const RESERVED = new Set([
  "about", "admin", "api", "auth", "event", "events", "help", "me", "new",
  "people", "person", "privacy", "root", "settings", "signin", "signout",
  "staff", "support", "system", "team", "teams", "terms", "u", "user", "users",
  "weekly", "you", "discussions", "discussion", "forum",
]);

/**
 * The shape of a username nobody chose.
 *
 * Signing in should not publish who you are. The old default was the local
 * part of the email address — sid.umn@gmail.com became "sidumn" — which put
 * a person's address on every comment they wrote, in a field they never
 * filled in.
 *
 * "member" rather than "player" or "coach": most people here are a parent or
 * a manager, and a handle that guesses wrong is worse than one that says
 * nothing. Kept separate from the "anon-" pseudonym reviews use, so the two
 * are not mistaken for each other and nobody reads a link between them that
 * does not exist.
 */
export function generatedUsername(token: string): string {
  return `member_${token.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 30);
}

export function normalizeUsername(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 30);
}

/** null = valid; otherwise a human-readable reason. Assumes already normalized. */
export function validateUsername(u: string): string | null {
  if (u.length < 3) return "At least 3 characters.";
  if (u.length > 30) return "At most 30 characters.";
  if (!/^[a-z0-9_]+$/.test(u)) return "Use letters, numbers and underscores only.";
  if (/^\d+$/.test(u)) return "Needs at least one letter.";
  if (RESERVED.has(u)) return "That username is reserved.";
  return null;
}
