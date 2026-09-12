import "server-only";

import { athletes2events } from "./athletes2events";
import { modular11 } from "./modular11";
import type { ExternalEventProvider, SourceRef } from "./provider";
import { sportsaffinity } from "./sportsaffinity";

/**
 * The connectors, and how an event finds its own.
 *
 * Out of run.ts so that the job runner can look a provider up without
 * importing the runner that imports it.
 */
const PROVIDERS: ExternalEventProvider[] = [athletes2events, modular11, sportsaffinity];

export function providerFor(platform: string): ExternalEventProvider | null {
  return PROVIDERS.find((p) => p.platform === platform) ?? null;
}

export function detect(url: string): SourceRef | null {
  for (const p of PROVIDERS) {
    if (!p.matches(url)) continue;
    const ref = p.parseUrl(url);
    if (ref) return ref;
  }
  return null;
}

/**
 * The subdomain is part of the identity on platforms that give each club
 * one, and it is recoverable from the URL that was pasted to connect this
 * event. scheduleUrl first, because that is the platform's own page;
 * sourceUrl is usually the organizer's website, which is a different system
 * and parses to nothing.
 */
export function sourceRefFor(
  event: { scheduleUrl: string | null; sourceUrl: string | null; sourceEventId: string },
  provider: ExternalEventProvider,
): SourceRef {
  return (
    (event.scheduleUrl && provider.parseUrl(event.scheduleUrl)) ||
    (event.sourceUrl && provider.parseUrl(event.sourceUrl)) || {
      platform: provider.platform,
      eventId: event.sourceEventId,
    }
  );
}
