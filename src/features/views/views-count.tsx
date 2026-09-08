import { viewsLabel } from "./format";

/**
 * "1.2k views", in the small grey type the rest of a byline uses.
 *
 * Hidden below a handful, because "3 views" on somebody's post reads as a
 * verdict on it rather than a fact about a page that went up an hour ago.
 */
export const VIEWS_SHOWN_FROM = 5;

export function ViewsCount({
  views,
  className = "",
}: {
  views: number;
  className?: string;
}) {
  if (views < VIEWS_SHOWN_FROM) return null;
  return (
    <span className={className}>
      <span aria-hidden>👀</span> {viewsLabel(views)}
    </span>
  );
}
