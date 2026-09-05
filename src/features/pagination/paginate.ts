/**
 * Page maths, kept pure so the edges are testable without a database.
 *
 * Offset paging rather than a cursor: these are directories people scan and
 * link to, so a stable "page 3" that survives being pasted to someone else
 * matters more than perfect behaviour under concurrent inserts.
 */

export const PER_PAGE = 24;

/** A page number from a query string. Anything unusable means page 1. */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  // Guards against ?page=1e9 turning into a pointless huge OFFSET.
  return Math.min(n, 10_000);
}

export type Pagination = {
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
  offset: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 1-based inclusive range shown, for "25-48 of 167". */
  from: number;
  to: number;
};

export function paginate(
  total: number,
  page: number,
  perPage: number = PER_PAGE,
): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  // Asking for page 9 of 3 lands on 3 rather than an empty screen.
  const clamped = Math.min(Math.max(1, page), totalPages);
  const offset = (clamped - 1) * perPage;
  return {
    page: clamped,
    perPage,
    totalPages,
    total,
    offset,
    hasPrev: clamped > 1,
    hasNext: clamped < totalPages,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + perPage, total),
  };
}

/**
 * A link to another page of the same view.
 *
 * Carries the other query parameters through, so paging never silently drops
 * the search you are paging within.
 *
 * `key` names the query parameter holding the page number. It exists for
 * screens like /admin that stack several independent lists: each needs its own
 * parameter, or paging one list would reset the others.
 */
export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
  key = "page",
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== key) qs.set(k, v);
  }
  if (page > 1) qs.set(key, String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}
