import profiles from "./profiles.json";

import { forPrompt, type ClubProfile } from "./profile";
import { vocabularyOf, type ClubVocabulary } from "./vocabulary";

/**
 * The knowledge base itself: one JSON file, keyed by club slug.
 *
 * A file rather than a table, for three reasons that all point the same way.
 * It is reviewed in a diff — "this PR changes what we believe about Atletico"
 * is a sentence a person can check, and a model's reading of a website is
 * exactly the kind of claim that should be checked before it argues for a
 * merge. It needs no migration, so it can land on a day nobody is at the
 * machine that runs them. And a `git log` on it is the record of when a club
 * changed how it names things, which is a question we have already had to ask
 * twice and had no way to answer.
 *
 * One file rather than forty-three, because the only consumer is a prompt
 * builder that wants all of them, and because Next's output tracing bundles
 * an import it can see and not a directory somebody reads at runtime.
 */

const ALL = profiles as Record<string, ClubProfile>;

export function profileFor(slug: string): ClubProfile | null {
  return ALL[slug] ?? null;
}

export function allProfiles(): ClubProfile[] {
  return Object.values(ALL);
}

/**
 * What we know about this club, in one line, or nothing.
 *
 * Returns null rather than an empty string so a caller cannot accidentally
 * tell a model "here is what we know about this club:" followed by silence,
 * which reads as "we know it has no tiers".
 */
export function clubContext(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const profile = ALL[slug];
  if (!profile) return null;
  const line = forPrompt(profile);
  return line || null;
}

/**
 * The club's own distinguishing words, or null if we have never read it.
 *
 * Memoised: the matcher asks this once per pair and there are thousands of
 * pairs, while the answer is derived from a file that cannot change while the
 * process is running.
 */
const vocabularies = new Map<string, ClubVocabulary | null>();

export function vocabularyFor(slug: string | null | undefined): ClubVocabulary | null {
  if (!slug) return null;
  if (!vocabularies.has(slug)) {
    const profile = ALL[slug];
    vocabularies.set(slug, profile ? vocabularyOf(profile) : null);
  }
  return vocabularies.get(slug) ?? null;
}
