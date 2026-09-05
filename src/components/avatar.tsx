import { AvatarImage, AvatarPlaceholder } from "./avatar-image";

/**
 * Stays a server component on purpose: avatarOf is called from server
 * components all over the app, and marking this file "use client" makes that
 * a runtime error the build does not catch. Only the <img>, which needs an
 * error handler, lives on the client.
 */
export function Avatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  void name;

  if (src) return <AvatarImage src={src} size={size} className={className} />;

  // Neutral placeholder — no photo by default.
  return <AvatarPlaceholder size={size} className={className} />;
}

/** The avatar URL to display — a custom upload only, never the Google photo. */
export function avatarOf(u: { avatarUrl?: string | null }) {
  return u.avatarUrl || null;
}
