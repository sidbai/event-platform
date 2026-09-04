import { RATING_CATEGORIES, type Ratings } from "./constants";

/**
 * Read-only star row. Rounds to the nearest half so an average of 3.7 reads as
 * "close to 4" rather than implying a precision six opinions don't have.
 */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
      style={{ fontSize: size }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className="leading-none">
          {rounded >= i ? "★" : rounded >= i - 0.5 ? "⯨" : "☆"}
        </span>
      ))}
    </span>
  );
}

export function RatingBreakdown({
  ratings,
  showValues = true,
}: {
  ratings: Ratings;
  showValues?: boolean;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {RATING_CATEGORIES.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="flex items-center gap-2 text-amber-500">
            <Stars value={ratings[key]} />
            {showValues && (
              <span className="w-7 text-right text-xs tabular-nums text-muted">
                {ratings[key].toFixed(1)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
