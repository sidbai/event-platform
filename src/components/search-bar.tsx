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
}: {
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name, since there is no visible label or button. */
  label: string;
  className?: string;
}) {
  return (
    <form method="get" role="search" className={`relative ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
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
        className="w-full rounded-md border border-line bg-card py-2 pl-9 pr-3 text-sm"
      />
    </form>
  );
}
