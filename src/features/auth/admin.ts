import type { Session } from "next-auth";

/**
 * Normalize an email for identity comparison: lowercase, drop any `+tag`,
 * and for Gmail also drop dots (Gmail treats `a.b@gmail.com` == `ab@gmail.com`).
 */
export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at === -1) return lower;

  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  local = local.split("+")[0];

  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map(normalizeEmail),
);

type UserLike = Session["user"] | { email?: string | null } | null | undefined;

export function isAdmin(user: UserLike): boolean {
  const email = user?.email;
  return Boolean(email && adminEmails.has(normalizeEmail(email)));
}
