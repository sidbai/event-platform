import Link from "next/link";

import { db } from "@/db";
import { clubs, coaches } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * One header for both halves of Reviews.
 *
 * Clubs and coaches used to each render their own title, blurb and copy of the
 * nav, so switching tabs changed the page's identity and read as two pages
 * that happened to link to each other. Everything shared lives here instead,
 * and the two pages differ only in the list underneath.
 */
export async function ReviewsHeader({
  active,
  action,
}: {
  active: "clubs" | "coaches";
  /** The add button for whichever half you're on; omitted when signed out. */
  action?: { href: string; label: string };
}) {
  const [[{ clubCount }], [{ coachCount }]] = await Promise.all([
    db.select({ clubCount: sql<number>`count(*)::int` }).from(clubs),
    db.select({ coachCount: sql<number>`count(*)::int` }).from(coaches),
  ]);

  const tabs = [
    { key: "clubs", href: "/clubs", label: "Clubs", count: clubCount },
    { key: "coaches", href: "/coaches", label: "Coaches", count: coachCount },
  ] as const;

  return (
    <header>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted">
            What it&rsquo;s actually like at a club, and with the coaches there
            — written anonymously by local parents and players.
          </p>
        </div>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            {action.label}
          </Link>
        )}
      </div>

      {/* A single segmented control rather than two loose pills, so the two
          halves read as one switch instead of two unrelated links. */}
      <nav
        aria-label="Reviews sections"
        className="mt-5 inline-flex rounded-lg border border-line bg-elevated p-0.5 text-sm"
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={
                on
                  ? "rounded-md bg-card px-3.5 py-1.5 font-medium text-ink shadow-sm"
                  : "rounded-md px-3.5 py-1.5 text-muted transition-colors hover:text-ink"
              }
            >
              {t.label}
              <span
                className={`ml-1.5 tabular-nums ${on ? "text-muted" : "text-muted/70"}`}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
