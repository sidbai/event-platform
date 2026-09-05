import Link from "next/link";

import { pageHref, type Pagination } from "./paginate";

/**
 * Prev/next with a position readout.
 *
 * Plain links, so paging works without JavaScript and every page is
 * addressable — the same reasoning as the search bars.
 */
export function Pager({
  basePath,
  params,
  pagination,
  noun,
}: {
  basePath: string;
  /** Carried through so paging keeps the current search or filter. */
  params: Record<string, string | undefined>;
  pagination: Pagination;
  /** Plural noun for the readout, e.g. "coaches". */
  noun: string;
}) {
  const { page, totalPages, total, from, to, hasPrev, hasNext } = pagination;
  if (totalPages <= 1) return null;

  const link =
    "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-elevated";
  const dead =
    "rounded-md border border-line px-3 py-1.5 text-sm text-muted/50 cursor-default";

  return (
    <nav
      aria-label={`${noun} pages`}
      className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
    >
      <p className="text-sm text-muted">
        {from}&ndash;{to} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link href={pageHref(basePath, params, page - 1)} className={link} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={dead} aria-hidden>
            ← Previous
          </span>
        )}
        <span className="text-sm text-muted">
          Page {page} of {totalPages}
        </span>
        {hasNext ? (
          <Link href={pageHref(basePath, params, page + 1)} className={link} rel="next">
            Next →
          </Link>
        ) : (
          <span className={dead} aria-hidden>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
