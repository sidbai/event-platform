import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-neutral-200 print:hidden dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-neutral-500">
        <span>&copy; {new Date().getFullYear()} King Juan Soccer</span>
        <nav className="flex gap-4">
          <Link href="/events" className="hover:text-neutral-800 dark:hover:text-neutral-200">
            Events
          </Link>
          <Link href="/privacy" className="hover:text-neutral-800 dark:hover:text-neutral-200">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-neutral-800 dark:hover:text-neutral-200">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
