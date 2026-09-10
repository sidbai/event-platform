/**
 * A name safe to show in public UI.
 *
 * It used to fall back to `name` — the real name Google hands over — and then
 * to the local part of the email address. Both are gone, and neither is a
 * parameter any more: the adapter in auth.ts gives every new account a
 * generated handle for its display name, and settings writes the username
 * back when somebody clears the field, so the fallback was already
 * unreachable. Unreachable is not the same as impossible, and this was the
 * only line between "anonymous by default" and publishing somebody's real
 * name, held up by an invariant maintained in two other files.
 *
 * `displayName` is required rather than optional so that a query which
 * forgets to select it is a compile error rather than a page that quietly
 * says "Someone" — or, before this, quietly said a real name.
 */
export function publicName(u: {
  displayName: string | null;
  username?: string | null;
}) {
  return u.displayName || (u.username ? `@${u.username}` : null) || "Someone";
}
