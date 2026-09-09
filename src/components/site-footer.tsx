import Link from "next/link";

/**
 * What the header does not already carry.
 *
 * Events lived here too until the header grew a link to it, and a footer that
 * repeats the navigation above it is a second copy of the same choice — what
 * belongs down here is the reading nobody navigates to on purpose: what the
 * site is, and the terms it runs on.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line print:hidden">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-muted">
        <span>&copy; {new Date().getFullYear()} King Juan Soccer</span>
        <nav className="flex gap-4">
          <Link href="/about" className="hover:text-ink">
            About
          </Link>
          <Link href="/guidelines" className="hover:text-ink">
            Guidelines
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
