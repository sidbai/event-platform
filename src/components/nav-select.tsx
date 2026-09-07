"use client";

import { useRouter } from "next/navigation";

/**
 * A filter that navigates: pick an option, land on its page.
 *
 * A dropdown rather than a row of chips, wherever the list is long enough
 * that chips become a wall of text above the thing somebody came to read. A
 * club-run Labor Day tournament carries thirty-odd flights; the team
 * directory offers twenty-five age groups. One line either way, the same
 * height whether there are two options or forty.
 *
 * The hrefs are built on the server, so the rules about what a change carries
 * and what it drops live with the rest of the page's links rather than being
 * reimplemented here.
 */
export function NavSelect({
  label,
  options,
  value,
  className = "mt-4",
}: {
  /** Shown beside the control and used as its accessible name. */
  label: string;
  options: { id: string; label: string; href: string }[];
  value: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="text-muted">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.id === e.target.value);
          if (next) router.push(next.href);
        }}
        className="max-w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
