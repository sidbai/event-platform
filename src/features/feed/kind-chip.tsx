import type { FeedItem } from "./queries";

/**
 * What kind of thing this is, said once per row.
 *
 * The feed mixes sources, so without this the only clue would be the shape
 * of the row underneath — which is exactly the sort of thing that reads fine
 * to whoever built it and to nobody else.
 */
const KIND: Record<FeedItem["kind"], { label: string; className: string }> = {
  news: { label: "News", className: "bg-brand-soft text-brand-soft-text" },
  post: { label: "Community", className: "bg-elevated text-muted" },
};

export function KindChip({ kind }: { kind: FeedItem["kind"] }) {
  const k = KIND[kind];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.className}`}>
      {k.label}
    </span>
  );
}
