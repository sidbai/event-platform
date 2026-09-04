const RESERVED = new Set([
  "about", "admin", "api", "auth", "event", "events", "help", "me", "new",
  "people", "person", "privacy", "root", "settings", "signin", "signout",
  "staff", "support", "system", "team", "teams", "terms", "u", "user", "users",
  "weekly", "you", "discussions", "discussion", "forum",
]);

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
