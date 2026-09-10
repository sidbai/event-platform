/**
 * Reading an event that lives on somebody else's platform.
 *
 * Youth soccer tournaments are hosted on a small number of systems —
 * Athletes2Events, EventConnect, GotSport, Sports Affinity — so this is a
 * handful of adapters, not one per organizer. The number grows slowly and
 * stops: it is a bounded problem, which is what makes it worth building
 * rather than doing by hand.
 *
 * Nothing above this layer knows which platform an event came from. An
 * adapter's whole job is to turn whatever that platform publishes into the
 * shapes below, and those are deliberately the shapes this application
 * already stores — so a synced event renders through the same schedule and
 * standings pages as one we run ourselves.
 */

import type { Gender } from "@/features/teams/age";

/** What a platform calls this event, so a sync can find it again. */
export type SourceRef = {
  platform: "athletes2events" | "eventconnect" | "modular11" | "sportsaffinity" | "manual";
  eventId: string;
  /**
   * The club's own subdomain, where a platform gives each one.
   *
   * Athletes2Events does: crossfire.athletes2events.com. Without it the same
   * event id on two clubs would collide.
   */
  subdomain?: string;
};

export type SyncedTeam = {
  /** The platform's own id. Stable across syncs; the name is not. */
  sourceTeamId: string;
  name: string;
  /** The division or flight it plays in, as the platform names it. */
  division: string;
  /** The group within that division, where there is one. */
  group: string | null;
  /**
   * The gender the platform states outright, where it does.
   *
   * Not everything writes it into a name or a flight label. Modular11 names
   * a team "Harbor SC" in a division called "U13 EA PACNW" and puts MALE in
   * a column of its own — so the age is recoverable and the gender is not,
   * and without this the canonical name has nothing to build from and falls
   * back to the published one. Seven ages of Harbor SC then arrive as seven
   * teams all called "Harbor SC".
   */
  gender?: Gender | null;
};

export type SyncedMatch = {
  sourceMatchId: string;
  division: string;
  group: string | null;
  /**
   * Local wall-clock date and time, given a zone by the caller.
   *
   * `2026-09-05` and `09:05` — an adapter normalises whatever its platform
   * prints, so nothing downstream has to know that one of them writes
   * "9:05 AM" and the next one "9.05am".
   */
  date: string | null;
  time: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Kept as published, because a platform's names are what a parent reads. */
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  field: string | null;
  venue: string | null;
};

export type SyncedEvent = {
  source: SourceRef;
  teams: SyncedTeam[];
  matches: SyncedMatch[];
};

/**
 * Why a sync produced nothing.
 *
 * Separated from an empty result on purpose. A schedule that has not been
 * published yet and a parser that no longer understands the page look
 * identical from the outside — both give you zero matches — and treating them
 * the same is how a directory quietly starts showing a stale schedule for
 * weeks. One is normal. The other has to be loud.
 */
export type SyncFailure =
  | { kind: "unreachable"; detail: string }
  | { kind: "unrecognised"; detail: string };

export type SyncResult =
  | { ok: true; data: SyncedEvent }
  | { ok: false; error: SyncFailure };

export interface ExternalEventProvider {
  readonly platform: SourceRef["platform"];
  /** True when this provider recognises the URL an organizer pasted. */
  matches(url: string): boolean;
  /** The platform's event id, read out of a URL a person can paste. */
  parseUrl(url: string): SourceRef | null;
  /** Everything currently published for that event. */
  fetch(ref: SourceRef): Promise<SyncResult>;
}
