import Image from "next/image";
import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { NavMenu } from "@/components/nav-menu";
import { ProfileMenu } from "@/components/profile-menu";
import { SearchBar } from "@/components/search-bar";
import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { unreadCount } from "@/features/messages/queries";

const navLink =
  "text-white/75 transition-colors hover:text-gold";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  // With no email yet, this badge is the whole notification story — without it
  // a message would arrive somewhere nobody is looking.
  const unread = user ? await unreadCount(user.id) : 0;

  const sections = [
    { href: "/events", label: "Events" },
    { href: "/community", label: "Community" },
    { href: "/news", label: "News" },
    { href: "/clubs", label: "Reviews" },
    ...(admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-[0_2px_6px_rgba(0,0,0,0.25)] print:hidden">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-2 px-4 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* Knockout version: the source lockup is drawn in near-black on
              white, so its 卷 and half its ring vanish on this bar.
              public/logo-lockup.png keeps the full original, wordmark and
              all, for light surfaces. */}
          <Image
            src="/logo-mark-dark.png"
            alt="King Juan Soccer"
            width={80}
            height={80}
            priority
            className="h-9 w-9 object-contain sm:h-10 sm:w-10"
          />
        </Link>
        {/* Search takes the middle on every size; the section links collapse
            into a menu on phones, where four of them plus a search box do not
            fit at 375px. */}
        <SearchBar
          className="mx-2 min-w-0 flex-1 sm:mx-4 sm:max-w-xs"
          action="/search"
          compact
          label="Search events and community posts"
          placeholder="Search"
        />

        <nav className="flex items-center gap-2 text-[13px] sm:gap-4 sm:text-sm">
          <div className="hidden items-center gap-4 md:flex">
            {sections.map((item) => (
              <Link key={item.href} href={item.href} className={navLink}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="md:hidden">
            <NavMenu items={sections} />
          </div>
          {user ? (
            <ProfileMenu
              name={publicName(user)}
              avatar={
                <Avatar src={avatarOf(user)} name={publicName(user)} size={24} />
              }
              items={[
                // Only offer the public profile once there is a username to
                // point at; it is generated at signup, but older rows may not
                // have one.
                ...(user.username
                  ? [{ href: `/people/${user.username}`, label: "Profile" }]
                  : []),
                {
                  href: "/messages",
                  label: unread > 0 ? `Messages (${unread})` : "Messages",
                },
                { href: "/teams", label: "Teams" },
                { href: "/settings", label: "Settings" },
              ]}
            >
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-elevated"
                >
                  Sign out
                </button>
              </form>
            </ProfileMenu>
          ) : (
            <Link
              href="/signin"
              className="whitespace-nowrap text-gold transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
