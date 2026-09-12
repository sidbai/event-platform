import type { Metadata } from "next";
import Link from "next/link";

import { K, MIN_GAMES } from "@/features/predict/elo";
import { modelRecord } from "@/features/predict/queries";

export const metadata: Metadata = {
  title: "Forecasts",
  description: "How the match forecasts are made, and how often they have been right.",
};
export const revalidate = 3600;

const pct = (x: number) => `${Math.round(100 * x)}%`;

/**
 * The model's own report card, in public.
 *
 * A forecast on a fixture is only worth reading if somebody can check how
 * the forecasts have done, so this page replays every decided game and
 * scores the calls the model would have shown — against the base rates,
 * which is what "no model" would say. It is computed, not stored: there
 * is no number here anybody typed.
 */
export default async function PredictionsPage() {
  const r = await modelRecord();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Forecasts</h1>
      <p className="mt-2 text-sm text-muted">
        Some fixtures carry a small bar with three numbers: how likely the home side is to
        win, a draw, and an away win. This is where those come from, and how often they have
        been right.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">The record</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Games forecast</dt>
            <dd className="text-xl font-semibold tabular-nums">{r.scored.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Result called right</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {pct(r.accuracy)} <span className="text-sm font-normal text-muted">vs {pct(r.accuracyBase)} by guessing the usual</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Brier score</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {r.brier.toFixed(2)} <span className="text-sm font-normal text-muted">vs {r.brierBase.toFixed(2)} (lower is better)</span>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Scored on every one of the {r.games.toLocaleString()} decided games here where both sides
          already had {MIN_GAMES} or more results — the same rule that decides whether a fixture
          shows a forecast at all. &ldquo;Guessing the usual&rdquo; always picks the most common
          outcome ({pct(r.base.home)} home wins, {pct(r.base.draw)} draws, {pct(r.base.away)} away).
          {r.rebuiltAt && <> Ratings last rebuilt {r.rebuiltAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</>}
        </p>
      </section>

      <section className="mt-8 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">How it works</h2>
        <p className="mt-2">
          Every team carries a rating that starts equal and moves with each result: beat a
          stronger side and it rises a lot, beat a weaker one and it barely moves, and the
          margin counts — a 5–0 says more than a 1–0, though not five times as much. Games are
          replayed in the order they were played, so a rating is always what the results up to
          that day support (K = {K}).
        </p>
        <p className="mt-2">
          Two ratings give the chance of each outcome. Level sides draw the most; a mismatch
          almost never does. Nothing about age or gender is modelled, because teams only ever meet
          their own group and the ratings separate on their own. A forecast is shown only when
          both sides have {MIN_GAMES} or more results here — before that, a number would look
          like knowledge it is not.
        </p>
        <p className="mt-2 text-muted">
          It learns only from scores on this site, so it knows nothing about a team&rsquo;s games
          elsewhere, injuries, or who is on the pitch that Saturday. Take it as &ldquo;probably&rdquo;,
          never as &ldquo;certainly&rdquo;. Ratings are rebuilt every night from all results;{" "}
          <Link href="/events" className="text-brand-text hover:underline">the events</Link> are
          where the results come from.
        </p>
      </section>
    </main>
  );
}
