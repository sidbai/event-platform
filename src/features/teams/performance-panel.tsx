import { formOf, perGame, performanceOf, type Dated, type Outcome } from "./performance";

/**
 * How a team has been going, from its results.
 *
 * The line above this one already says 6W 2D 4L · 28–15. What a total cannot
 * say is whether the goals came evenly or in one 6–0, and whether the ones
 * conceded came in every game or in two bad afternoons — so the clean sheets,
 * the games scored in, and the widest margin either way are here beside it.
 *
 * The number of games is stated first and repeated in every "of N", because
 * teams here average under five and a rate off four games invites more weight
 * than it can hold. It is a fact with its sample attached, not a rating.
 */

const LETTER: Record<Outcome, string> = { won: "W", drawn: "D", lost: "L" };
const TONE: Record<Outcome, string> = {
  won: "bg-brand-soft text-brand-soft-text",
  drawn: "bg-elevated text-muted",
  lost: "bg-elevated text-muted",
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums">
        {value}
        {note ? <span className="ml-1.5 text-xs text-muted">{note}</span> : null}
      </dd>
    </div>
  );
}

export function PerformancePanel({
  matches,
  teamId,
  addedByTeam = 0,
}: {
  matches: Dated[];
  teamId: string;
  /**
   * How many of these results the team told us about rather than an
   * organizer. Stated because it changes what the numbers are worth, and
   * because a figure whose provenance is invisible is one nobody can check.
   */
  addedByTeam?: number;
}) {
  const shape = performanceOf(matches, teamId);
  if (shape.played === 0) return null;
  const rate = perGame(shape)!;
  const form = formOf(matches, teamId);

  return (
    <div className="mt-3 rounded-lg border border-line p-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="Goals for" value={String(shape.gf)} note={`${rate.gf} a game`} />
        <Stat label="Goals against" value={String(shape.ga)} note={`${rate.ga} a game`} />
        <Stat
          label="Clean sheets"
          value={`${shape.cleanSheets} of ${shape.played}`}
        />
        <Stat label="Scored in" value={`${shape.scoredIn} of ${shape.played}`} />
      </dl>

      {addedByTeam > 0 && (
        <p className="mt-2 text-xs text-muted">
          {addedByTeam} of {shape.played} added by the team.
        </p>
      )}

      {form.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3">
          <span className="text-xs uppercase tracking-wide text-muted">Form</span>
          <span className="flex gap-1">
            {form.map((outcome, i) => (
              <span
                key={i}
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-medium ${TONE[outcome]}`}
                title={outcome}
              >
                {LETTER[outcome]}
              </span>
            ))}
          </span>
          <span className="text-xs text-muted">most recent first</span>
          {(shape.bestWin !== null || shape.worstLoss !== null) && (
            <span className="ml-auto text-xs tabular-nums text-muted">
              {/* The averages flatten these out, and they are the difference
                  between a steady side and a streaky one. */}
              {shape.bestWin !== null ? `best win +${shape.bestWin}` : ""}
              {shape.bestWin !== null && shape.worstLoss !== null ? " · " : ""}
              {shape.worstLoss !== null ? `worst loss −${shape.worstLoss}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
