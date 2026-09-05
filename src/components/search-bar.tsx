/**
 * A search box that submits on Enter.
 *
 * No submit button: every browser submits a single-input GET form on Enter,
 * and the magnifier already says what the field is for. method="get" keeps the
 * query in the URL, so results stay shareable and back/forward work with no
 * client JavaScript.
 */
export function SearchBar({
  defaultValue,
  placeholder = "Search",
  label,
  className = "",
  action,
  compact = false,
}: {
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name, since there is no visible label or button. */
  label: string;
  className?: string;
  /** Where to submit. Omitted means the current page, which is what the
   *  per-section bars want; the header one targets /search. */
  action?: string;
  /** Header sizing: shorter, and readable on a dark bar. */
  compact?: boolean;
}) {
  return (
    <form method="get" action={action} role="search" className={`relative ${className}`}>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 flex items-center ${
          compact ? "left-2.5 text-white/60" : "left-3 text-muted"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width={compact ? 14 : 16}
          height={compact ? 14 : 16}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        aria-label={label}
        placeholder={placeholder}
        className={
          compact
            ? "w-full rounded-full border border-white/15 bg-white/10 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-white/50 focus:border-white/30 focus:outline-none"
            : "w-full rounded-md border border-line bg-card py-2 pl-9 pr-3 text-sm"
        }
      />
    </form>
  );
}
