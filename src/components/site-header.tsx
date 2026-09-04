import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <Link href="/" className="font-semibold tracking-tight text-ink">
          King Juan Soccer
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/events" className="text-muted transition-colors hover:text-ink">
            Events
          </Link>
          <Link href="/teams" className="text-muted transition-colors hover:text-ink">
            Teams
          </Link>
          <Link href="/discussions" className="text-muted transition-colors hover:text-ink">
            Discussions
          </Link>
          {admin && (
            <Link href="/admin" className="text-muted transition-colors hover:text-ink">
              Admin
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/settings" className="flex items-center gap-1.5">
                <Avatar src={avatarOf(user)} name={publicName(user)} size={22} />
                <span className="hidden text-muted sm:inline">{publicName(user)}</span>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-brand-text hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/signin" className="text-brand-text hover:underline">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
