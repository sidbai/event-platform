import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line print:hidden">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-muted">
        <span>&copy; {new Date().getFullYear()} King Juan Soccer</span>
        <nav className="flex gap-4">
          <Link href="/events" className="hover:text-ink">
            Events
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
