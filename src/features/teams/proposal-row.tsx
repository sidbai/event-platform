"use client";

import { useState } from "react";
import Link from "next/link";

import type { DismissResult } from "./dismiss-actions";
import type { MergeActionResult } from "./merge-actions";
import { ProposalButtons } from "./proposal-buttons";

export type ProposalSide = {
  name: string;
  slug: string;
  matches: number;
  events: number;
};

/**
 * One proposed pair, and which of the two is being kept.
 *
 * The queue used to decide that on its own — the left-hand side survived and
 * the right was folded into it — and the choice was invisible until somebody
 * looked at the team afterwards and found the wrong name on it. Which one
 * keeps its name, its address and its page is the whole substance of the
 * decision, so it is now stated and can be turned round before merging.
 *
 * Both directions are bound on the server and handed down, rather than
 * sending ids up from here: the pair an admin is looking at is the pair the
 * action runs on, and nothing in the browser chooses which teams it names.
 */
export function ProposalRow({
  a,
  b,
  because,
  mergeAB,
  mergeBA,
  dismiss,
}: {
  a: ProposalSide;
  b: ProposalSide;
  because: string;
  mergeAB: (prev: MergeActionResult) => Promise<MergeActionResult>;
  mergeBA: (prev: MergeActionResult) => Promise<MergeActionResult>;
  dismiss: (prev: DismissResult) => Promise<DismissResult>;
}) {
  const [swapped, setSwapped] = useState(false);
  const keep = swapped ? b : a;
  const fold = swapped ? a : b;

  const side = (t: ProposalSide) =>
    `${t.matches} match${t.matches === 1 ? "" : "es"} over ${t.events} event${
      t.events === 1 ? "" : "s"
    }`;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">
          <Link href={`/teams/${keep.slug}`} className="font-medium hover:underline">
            {keep.name}
          </Link>
          <span className="mx-2 text-muted">and</span>
          <Link href={`/teams/${fold.slug}`} className="font-medium hover:underline">
            {fold.name}
          </Link>
        </span>
        <span className="text-xs text-muted">{because}</span>
      </div>

      {/*
        What each side would bring, so the choice is visible rather than
        implied — and which way round it currently runs.
      */}
      <p className="mt-1 text-xs text-muted">
        Keeping <span className="font-medium text-ink">{keep.name}</span>{" "}
        <span className="font-mono">{keep.slug}</span> — {side(keep)}.
        <br />
        Folding in <span className="text-ink">{fold.name}</span> — {side(fold)}.
        Its name is remembered, and its address will point here.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setSwapped((s) => !s)}
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated"
          aria-label={`Keep ${fold.name} instead of ${keep.name}`}
        >
          Keep the other one
        </button>
        <ProposalButtons merge={swapped ? mergeBA : mergeAB} dismiss={dismiss} />
      </div>
    </li>
  );
}
