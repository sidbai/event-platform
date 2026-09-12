import Link from "next/link";

import { EventLogo } from "@/components/event-logo";
import { TeamCrest } from "@/components/team-crest";
import { Odds } from "@/features/predict/odds";

import { whenLabel } from "./when-label";
import type { Upcoming } from "./whats-next";

/**
 * One thing that is coming up, as a card.
 *
 * Three columns: what it is on the left, when on the right, and where it is
 * underneath. A fixture stacks its two sides with a crest each — youth team
 * names are long and alike, and "A v B" on one line is the reading problem
 * this replaces — with the side this person follows in bold. An event keeps
 * one line with its logo, in the same skeleton, so the list reads as one
 * kind of thing.
 *
 * The right column carries what we actually know: the day, the hour, and
 * where. A fixture's competition sits under its two sides on the left
 * instead — it belongs to the teams, and beside the ground it pushed
 * "Silas High School · Field 1" off the end of the line, which is the one
 * thing a parent opens this for. A fixture is therefore a grid of three
 * rows shared by both columns — home and day, away and hour, competition
 * and ground — so the bottom line reads across as one line rather than two
 * that nearly meet. Nothing decorative stands in for a preview we do not
 * have.
 */
export function NextCard({ item, now }: { item: Upcoming; now: Date }) {
  const when = whenLabel(item.at, item.timed, now);
  const card =
    "rounded-lg border border-line bg-card px-3 py-2.5 hover:bg-elevated";
  const time = when.time ? (
    <div className="text-right text-sm">{when.time}</div>
  ) : (
    <div className="text-right text-xs text-muted">time TBD</div>
  );

  if (item.sides) {
    const side = (s: NonNullable<Upcoming["sides"]>["home"]) =>
      s ? (
        <div className="flex min-w-0 items-center gap-2">
          <TeamCrest src={s.crest} size={22} className="shrink-0" />
          <span className={`truncate text-sm ${s.followed ? "font-semibold" : ""}`}>
            {s.name}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <TeamCrest src={null} size={22} className="shrink-0" />
          <span className="text-sm text-muted">TBD</span>
        </div>
      );
    return (
      <li>
        <Link
          href={item.href}
          className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 ${card}`}
        >
          {side(item.sides.home)}
          <div className="text-right text-sm font-medium">{when.day}</div>
          {side(item.sides.away)}
          {time}
          {/* The third row exists only when it has something to say: a
              fixture with no competition and no ground ends at its sides. */}
          {(item.detail || item.where) && (
            <>
              <div className="min-w-0 self-end truncate text-xs text-muted">
                {item.detail}
              </div>
              <div className="max-w-[9rem] self-end text-right text-xs text-muted sm:max-w-[14rem]">
                {item.where}
              </div>
            </>
          )}
          {/* A fourth row when the model has an opinion: home on the left,
              as the sides above are. */}
          {item.odds && (
            <>
              <div className="min-w-0">
                <Odds
                  probs={item.odds}
                  home={item.sides.home?.name}
                  away={item.sides.away?.name}
                  compact
                />
              </div>
              <div className="text-right text-[11px] text-muted">forecast</div>
            </>
          )}
        </Link>
      </li>
    );
  }

  // An event's venue rides in its detail.
  const where = [item.detail, item.where].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={item.href}
        className={`flex items-start justify-between gap-4 ${card}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {item.logo && (
            <EventLogo
              src={item.logo.src}
              kind={item.logo.kind}
              size={28}
              className="shrink-0"
            />
          )}
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium">{when.day}</div>
          {time}
          {where && (
            <div className="mt-0.5 max-w-[9rem] text-xs text-muted sm:max-w-[14rem]">
              {where}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
