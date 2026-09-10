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
    /*
     * min-w-0 on both, or the select will not shrink.
     *
     * A flex item's min-width is auto, which for a <select> is its widest
     * option — and a league's matchdays are "Saturday, September 12, 2026 –
     * Sunday, September 13, 2026". max-w-full cannot get under that, so the
     * control kept its full width and pushed the whole page sideways: 514px
     * of content in a 463px phone, every page of every league.
     */
    <label className={`flex min-w-0 items-center gap-2 text-sm ${className}`}>
      <span className="shrink-0 text-muted">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.id === e.target.value);
          if (next) router.push(next.href);
        }}
        className="min-w-0 max-w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm"
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
