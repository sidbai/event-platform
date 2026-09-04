import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);

  return (
    <header className="border-b border-neutral-200 print:hidden dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          King Juan Soccer
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/events" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
            Events
          </Link>
          <Link href="/teams" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
            Teams
          </Link>
          <Link href="/discussions" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
            Discussions
          </Link>
          {admin && (
            <Link href="/admin" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
              Admin
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/settings" className="flex items-center gap-1.5">
                <Avatar src={avatarOf(user)} name={publicName(user)} size={22} />
                <span className="hidden text-neutral-500 sm:inline">{publicName(user)}</span>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-emerald-700 hover:underline dark:text-emerald-400">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/signin" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
