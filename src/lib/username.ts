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
 * No word in front of it. Every account is a member, so "member_" cost seven
 * characters on every byline and said nothing. What the leading letter IS for
 * is validateUsername, which refuses an all-digit name: a bare hex token is
 * all digits about six times in a hundred, and that one would be a username
 * its owner could not save.
 *
 * Short and opaque on purpose. It reads as generated rather than chosen,
 * which is the signal worth keeping, and it looks nothing like the "anon-"
 * pseudonym reviews use, so nobody reads a link between the two that does not
 * exist.
 */
export function generatedUsername(token: string): string {
  // Padded, because three characters is the floor and a caller passing a
  // short token should still get a name its owner can save.
  const body = token.toLowerCase().replace(/[^a-z0-9]/g, "").padStart(2, "0");
  // The first character decides validity, so it is not left to the token.
  const lead = LEAD_LETTERS[body.charCodeAt(0) % LEAD_LETTERS.length] ?? "k";
  return `${lead}${body}`.slice(0, 30);
}

/**
 * Letters a handle can start with.
 *
 * Missing i, l and o: next to 1 and 0 in most fonts, and this is a string
 * people will read off a screen and type back into a URL.
 */
const LEAD_LETTERS = "abcdefghjkmnpqrstuvwxyz";

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
