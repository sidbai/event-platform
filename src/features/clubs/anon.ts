import { randomBytes } from "node:crypto";

/**
 * A stable pseudonym for club reviews.
 *
 * Deliberately opaque: no adjective-animal pairing that people start treating
 * as a nickname, and nothing derived from the account, so it cannot be
 * reversed. Generated once per user and reused, which means one person's
 * reviews are linkable to each other but not to their identity.
 */
export function generateAnonHandle(): string {
  return `anon-${randomBytes(4).toString("hex")}`;
}
