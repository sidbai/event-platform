"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The four faces of a club page, as one switch.
 *
 * Which one is on comes from the address, so a link straight to the teams
 * tab lights the teams tab; a server layout cannot see the address, which
 * is the one reason this is a client component.
 */
export function ClubTabs({
  slug,
  counts,
}: {
  slug: string;
  counts: { teams: number; coaches: number; reviews: number };
}) {
  const pathname = usePathname();
  const base = `/clubs/${slug}`;
  const tabs = [
    { href: base, label: "Overview", count: null },
    { href: `${base}/teams`, label: "Teams", count: counts.teams },
    { href: `${base}/coaches`, label: "Coaches", count: counts.coaches },
    { href: `${base}/reviews`, label: "Reviews", count: counts.reviews },
  ];
  return (
    <nav
      aria-label="Club sections"
      className="mt-6 inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-elevated p-0.5 text-sm"
    >
      {tabs.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "whitespace-nowrap rounded-md bg-card px-3.5 py-1.5 font-medium text-ink shadow-sm"
                : "whitespace-nowrap rounded-md px-3.5 py-1.5 text-muted transition-colors hover:text-ink"
            }
          >
            {t.label}
            {t.count !== null && (
              <span className={`ml-1.5 tabular-nums ${on ? "text-muted" : "text-muted/70"}`}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
