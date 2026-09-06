"use client";

import { useRouter } from "next/navigation";

/**
 * Which division of a tournament the schedule is showing.
 *
 * A dropdown rather than a row of chips: a club-run Labor Day tournament
 * carries thirty-odd flights, and thirty-odd chips are a wall of text above
 * the schedule somebody actually came to read. One line, always the same
 * height, whether the event has two divisions or forty.
 *
 * The hrefs are built on the server so the rules about what a division change
 * drops — the team and the matchday — live in one place with the rest of the
 * page's links.
 */
export function DivisionPicker({
  options,
  value,
}: {
  options: { id: string; label: string; href: string }[];
  value: string;
}) {
  const router = useRouter();

  return (
    <label className="mt-4 flex items-center gap-2 text-sm">
      <span className="text-muted">Division</span>
      <select
        aria-label="Division"
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
