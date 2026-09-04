import type { Session } from "next-auth";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

type UserLike = Session["user"] | { email?: string | null } | null | undefined;

export function isAdmin(user: UserLike): boolean {
  const email = user?.email?.toLowerCase();
  return Boolean(email && adminEmails.includes(email));
}
