import Image from "next/image";
import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

const navLink =
  "text-white/75 transition-colors hover:text-gold";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);

  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-[0_2px_6px_rgba(0,0,0,0.25)] print:hidden">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* Knockout version: the source lockup is drawn in near-black on
              white, so its 卷 and half its ring vanish on this bar. The
              wordmark is cropped off too — the text beside it already says
              the name. public/logo-lockup.png keeps the full original for
              light surfaces. */}
          <Image
            src="/logo-mark-dark.png"
            alt="King Juan Soccer"
            width={80}
            height={80}
            priority
            className="h-9 w-9 object-contain"
          />
          {/* The crest carries the brand on small screens; the wordmark would
              push the nav off the edge. */}
          <span className="hidden font-display text-lg font-bold tracking-wide text-white sm:inline">
            King Juan Soccer
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-4">
          <Link href="/events" className={navLink}>
            Events
          </Link>
          <Link href="/community" className={navLink}>
            Community
          </Link>
          <Link href="/clubs" className={navLink}>
            Reviews
          </Link>
          <Link href="/teams" className={navLink}>
            Teams
          </Link>
          {admin && (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/settings" className="flex items-center gap-1.5">
                <Avatar src={avatarOf(user)} name={publicName(user)} size={22} />
                <span className="hidden text-white/75 sm:inline">
                  {publicName(user)}
                </span>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="text-gold transition-opacity hover:opacity-80"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/signin"
              className="text-gold transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
