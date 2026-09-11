import Image from "next/image";
import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, avatarOf } from "@/components/avatar";
import { NavMenu } from "@/components/nav-menu";
import { followsOf } from "@/features/me/follows";
import { MeSidebar } from "@/features/me/sidebar";
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
  // The drawer on a phone carries what you follow; read once per request,
  // so the front page does not pay for it twice.
  const follows = user ? await followsOf(user.id) : null;

  // Order is the editor's, not alphabetical or by age: News leads, then the
  // two things people come back for, then the directory they arrive through.
  const sections = [
    { href: "/news", label: "News" },
    { href: "/events", label: "Events" },
    { href: "/teams", label: "Teams" },
    { href: "/community", label: "Community" },
    { href: "/clubs", label: "Reviews" },
    // No "Me": signed in, the front page is yours, and the logo is the way to
    // it. A link beside the logo that goes where the logo goes is a second
    // door in the same wall.
  ];
  // Admin sits at the account end of the bar, apart from the sections: it is
  // not a part of the site, it is the back of it. The phone drawer lists it
  // with the rest, where there is no "end" to keep it at.
  const drawerSections = admin ? [...sections, { href: "/admin", label: "Admin" }] : sections;

  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-[0_2px_6px_rgba(0,0,0,0.25)] print:hidden">
      {/*
        The bar and the signed-in front page share one measure (max-w-6xl,
        px-5), so the logo starts where the page's sidebar does and the
        account end stops where its feed does — the owner's spec. Logo, then
        the sections, then search; Admin and the account at the far end.
      */}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-5">
        {/* The drawer's button leads on a phone, as a forum's does; from md
            the sections are inline and it is not needed. */}
        <div className="md:hidden">
          <NavMenu>
            {user && follows ? (
              <MeSidebar
                teams={follows.teams}
                last={follows.last}
                events={follows.events}
                unread={unread}
                sections={drawerSections}
              />
            ) : (
              <nav aria-label="Sections" className="text-sm">
                <ul className="space-y-0.5">
                  {drawerSections.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-lg px-2.5 py-1.5 hover:bg-elevated"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signin"
                  className="mt-6 block rounded-lg bg-brand px-3 py-2 text-center font-medium text-on-brand hover:bg-brand-strong"
                >
                  Sign in
                </Link>
              </nav>
            )}
          </NavMenu>
        </div>
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
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
        {/* The sections beside the logo, as a forum lays its bar out; on a
            phone they are in the drawer, where five of them plus a search box
            would not fit at 375px. */}
        <div className="hidden items-center gap-4 md:ml-3 md:flex">
          {sections.map((item) => (
            <Link key={item.href} href={item.href} className={navLink}>
              {item.label}
            </Link>
          ))}
        </div>
        {/* Then search, taking what is left between the sections and the
            account end, but capped: a box the width of the feed is a field
            waiting to be filled, not a way to look something up. */}
        <SearchBar
          suggest={suggestAnything}
          className="ml-2 min-w-0 flex-1 sm:ml-3 md:ml-4 md:max-w-sm lg:max-w-md"
          action="/search"
          compact
          label="Search events, teams, clubs and community posts"
          placeholder="Search"
        />

        <nav className="ml-auto flex items-center gap-2 text-[13px] sm:gap-4 sm:text-sm">
          {admin && (
            <Link href="/admin" className={`hidden md:inline ${navLink}`}>
              Admin
            </Link>
          )}
          {user ? (
            <ProfileMenu
              name={publicName(user)}
              avatar={
                <Avatar src={avatarOf(user)} name={publicName(user)} size={24} />
              }
              items={[
                // First, because it is the one that gathers the rest.
                { href: "/", label: "Your page" },
                {
                  href: "/messages",
                  label: unread > 0 ? `Messages (${unread})` : "Messages",
                },
                // Above the directory-wide Teams link on purpose: this one is
                // the handful somebody chose, and it is what they came back for.
                { href: "/following", label: "Following" },
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
