/**
 * How a view count is written on a page.
 *
 * Exact up to a thousand, then rounded: the difference between 1,240 and
 * 1,250 readers is not information anybody acts on, and four significant
 * figures next to a headline reads like a stock ticker. Pure, so the
 * boundaries can be tested rather than eyeballed on a live page.
 */
export function formatViews(views: number): string {
  if (views < 1000) return String(views);
  if (views < 10_000) {
    const tenths = Math.floor(views / 100) / 10;
    // 1.0k is a longer way of writing 1k.
    return `${tenths % 1 === 0 ? tenths.toFixed(0) : tenths.toFixed(1)}k`;
  }
  if (views < 1_000_000) return `${Math.floor(views / 1000)}k`;
  const millions = Math.floor(views / 100_000) / 10;
  return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}m`;
}

/** "1 view" / "23 views" / "1.2k views". */
export function viewsLabel(views: number): string {
  return `${formatViews(views)} ${views === 1 ? "view" : "views"}`;
}
