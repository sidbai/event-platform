import Link from "next/link";

import { EventLogo } from "@/components/event-logo";
import { TeamCrest } from "@/components/team-crest";

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
 * The right column carries what we actually know: the day, the hour, the
 * competition, the pitch. Nothing decorative stands in for a preview we do
 * not have.
 */
export function NextCard({ item, now }: { item: Upcoming; now: Date }) {
  const when = whenLabel(item.at, item.timed, now);
  const where = [item.detail, item.where].filter(Boolean).join(" · ");

  return (
    <li>
      <Link
        href={item.href}
        className="flex items-start justify-between gap-4 rounded-lg border border-line bg-card px-3 py-2.5 hover:bg-elevated"
      >
        {item.sides ? (
          <div className="min-w-0 space-y-1.5">
            {[item.sides.home, item.sides.away].map((side, i) =>
              side ? (
                <div key={i} className="flex min-w-0 items-center gap-2">
                  <TeamCrest src={side.crest} size={22} className="shrink-0" />
                  <span
                    className={`truncate text-sm ${side.followed ? "font-semibold" : ""}`}
                  >
                    {side.name}
                  </span>
                </div>
              ) : (
                <div key={i} className="flex items-center gap-2">
                  <TeamCrest src={null} size={22} className="shrink-0" />
                  <span className="text-sm text-muted">TBD</span>
                </div>
              ),
            )}
          </div>
        ) : (
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
        )}

        <div className="shrink-0 text-right">
          <div className="text-sm font-medium">{when.day}</div>
          {when.time ? (
            <div className="text-sm">{when.time}</div>
          ) : (
            <div className="text-xs text-muted">time TBD</div>
          )}
          {where && (
            <div className="mt-0.5 max-w-[14rem] truncate text-xs text-muted">
              {where}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
