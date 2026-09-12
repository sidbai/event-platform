import type { Probs } from "./elo";

/**
 * A forecast as three numbers and a bar.
 *
 * Percentages rather than decimals, and the word "forecast" on hover rather
 * than "prediction" in the copy: this is the model's estimate from past
 * results, not a promise, and a parent reading 64 · 20 · 16 should take it
 * as "probably, not certainly". Home is on the left, as the fixture is.
 */
export function Odds({ probs, home, away, compact = false }: { probs: Probs; home?: string; away?: string; compact?: boolean }) {
  const pct = (x: number) => Math.round(x * 100);
  const h = pct(probs.home), d = pct(probs.draw), a = 100 - h - d;
  const title = `Forecast from results so far: ${home ?? "home"} ${h}%, draw ${d}%, ${away ?? "away"} ${a}%`;
  /*
   * "H" and "A" at the ends, because a bar between two names does not say
   * which end is which — and on the team page the names sit a line above,
   * turned around when this team is away. Letters, not words: the bar is
   * eighty pixels and the numbers are the point.
   */
  const tag = (t: string) => (
    <span className="text-[10px] font-medium uppercase tracking-wide text-muted/80" aria-hidden>
      {t}
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-2 ${compact ? "text-[11px]" : "text-xs"} text-muted`} title={title}>
      {tag("H")}
      <span className="tabular-nums">{h}</span>
      <span className="flex h-1.5 w-20 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <span className="bg-brand" style={{ width: `${h}%` }} />
        <span className="bg-line" style={{ width: `${d}%` }} />
        <span className="bg-ink/40" style={{ width: `${a}%` }} />
      </span>
      <span className="tabular-nums">{a}</span>
      {tag("A")}
      {!compact && <span className="sr-only">{title}</span>}
    </span>
  );
}
