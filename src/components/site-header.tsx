import Image from "next/image";
import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { NavMenu } from "@/components/nav-menu";
import { ProfileMenu } from "@/components/profile-menu";
import { SearchBar } from "@/components/search-bar";
import { suggestAnything } from "@/features/search/suggest-actions";
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

  // Order is the editor's, not alphabetical or by age: News leads, then the
  // two things people come back for, then the directory they arrive through.
  const sections = [
    { href: "/news", label: "News" },
    { href: "/events", label: "Events" },
    { href: "/teams", label: "Teams" },
    { href: "/community", label: "Community" },
    { href: "/clubs", label: "Reviews" },
    ...(admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-[0_2px_6px_rgba(0,0,0,0.25)] print:hidden">
      {/*
        Wider than the page underneath it, and deliberately so.

        The bar carries a logo, a search box and six section links; the pages
        carry prose, and 768px is a reading measure rather than a layout. At
        768 the search box is squeezed to 171px with 24px of slack in the whole
        bar. 1024 is the width where it stops being squeezed and the links stop
        crowding it; past that the extra would be empty space between two
        groups that are already far apart — and it is also what stops the box
        below, which takes whatever is going, from running away.
      */}
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:px-5">
        {/*
          Indented at lg with the search box, so the box starts exactly where a
          page's own column does and the logo stays beside it.

          The bar is max-w-5xl and a page is max-w-3xl, both centred, so from
          1024px up the page's text begins a constant (1024 - 768) / 2 = 128px
          inside the bar's content edge. This is that 128 less the logo's own
          48 and the 8px flex gap after it. Below 1024 the two containers no
          longer sit a fixed distance apart — the page is still 768 while the
          bar is the window — so both go back to the bar's own edge. In the
          narrow band where a classic scrollbar has taken the bar just under
          1024 while lg has already fired, the two sit within a few pixels
          rather than exactly.
        */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 lg:ml-[72px]"
        >
          {/* One file for both surfaces now. The old mark was drawn in
              near-black on white, so it needed a knockout version to survive
              this bar; this one is white and orange inside black outlines,
              which reads on the dark header and on a white page alike. */}
          <Image
            src="/logo-mark.png"
            alt="King Juan Soccer"
            width={80}
            height={80}
            priority
            className="h-11 w-11 object-contain sm:h-12 sm:w-12"
          />
        </Link>
        {/* The box takes whatever the links do not want, rather than stopping
            at a fixed width — so it reaches from the page's own left margin to
            a hand's width short of the links. The links collapse into a menu
            on phones, where four of them plus a search box do not fit at
            375px. */}
        <SearchBar
          suggest={suggestAnything}
          className="ml-2 min-w-0 flex-1 sm:ml-3 lg:ml-0 lg:mr-6"
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
