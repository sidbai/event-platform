/**
 * Which team rows are the same team, and which of them should survive.
 *
 * A connector creates a team row per event, so one real club side becomes a
 * new row every tournament it enters: "XF U12 G14-15 ECNL" exists five times,
 * each holding a fifth of its history. A team page can only be worth reading
 * — or worth claiming — once those are one row.
 *
 * Merging is not automatic and this module does not do it. It proposes; a
 * person confirms. Two teams sharing a name is strong evidence within one
 * club's own tournaments and no evidence at all across a whole region, where
 * every club has a "Warriors", and the cost of being wrong is a merged
 * history that cannot be told apart afterwards.
 */

export type MergeCandidate = {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  visibility: string;
  /** The platform's own id for this team, where the entry came from one. */
  sourceTeamIds: string[];
  /** How much history this row is holding. */
  matches: number;
  events: number;
};

/**
 * Case, punctuation and spacing differ between platforms; the team does not.
 *
 * Letters and digits of any script, separators dropped rather than collapsed.
 *
 * Stripping to [a-z0-9] deleted every non-Latin character, so 烙饼FC, 吃饼FC and
 * 喂饼FC all normalised to "fc" and this screen offered to merge three
 * different clubs into one. Dropping separators rather than turning them into
 * spaces is the other half: nothing separates 饼 from F, so "烙饼 FC" and
 * "烙饼FC" would otherwise still be two teams.
 */
export function normaliseTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Whether a normalised name says enough to group on.
 *
 * "FC" or "B14" is a suffix half the region shares, not an identity, and a
 * name that normalises to almost nothing would gather everything it touched.
 */
export function nameIsDistinctive(normalised: string): boolean {
  return normalised.length >= 4;
}

/**
 * The row a merge should keep.
 *
 * A claimed team always wins: somebody has put their name to it, and folding
 * that into a shell would hand their team to a row nobody owns. After that,
 * the one holding the most history, so the fewest links break and the fewest
 * matches move. The id last, only so the answer is stable rather than
 * arbitrary when two rows are genuinely equal.
 */
export function chooseSurvivor(candidates: MergeCandidate[]): MergeCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const owned = Number(Boolean(b.ownerId)) - Number(Boolean(a.ownerId));
    if (owned !== 0) return owned;
    const claimed = Number(b.visibility === "public") - Number(a.visibility === "public");
    if (claimed !== 0) return claimed;
    if (b.matches !== a.matches) return b.matches - a.matches;
    if (b.events !== a.events) return b.events - a.events;
    return a.id.localeCompare(b.id);
  })[0];
}

export type MergeGroup = {
  key: string;
  survivor: MergeCandidate;
  losers: MergeCandidate[];
  /** Why these were put together, for the person deciding. */
  because: "same source id" | "same name";
};

/**
 * Group rows that look like one team.
 *
 * Two rules, and the stronger one first. A platform that reuses its own team
 * id across events is telling us outright that these are the same side —
 * Athletes2Events does, and that is worth more than any name comparison.
 * Names catch the rest, because a team re-registering for a new season often
 * gets a fresh id from the same platform.
 */
export function groupDuplicates(candidates: MergeCandidate[]): MergeGroup[] {
  const groups: MergeGroup[] = [];
  const taken = new Set<string>();

  const collect = (
    keyOf: (c: MergeCandidate) => string[],
    because: MergeGroup["because"],
  ) => {
    const buckets = new Map<string, MergeCandidate[]>();
    for (const c of candidates) {
      if (taken.has(c.id)) continue;
      for (const key of keyOf(c)) {
        if (!key) continue;
        const list = buckets.get(key) ?? [];
        list.push(c);
        buckets.set(key, list);
      }
    }

    for (const [key, rows] of buckets) {
      // A row can only be claimed by one group, and the source id runs first,
      // so a name bucket never steals a row an id already explained.
      const fresh = rows.filter((r) => !taken.has(r.id));
      if (fresh.length < 2) continue;
      const survivor = chooseSurvivor(fresh)!;
      for (const r of fresh) taken.add(r.id);
      groups.push({
        key,
        survivor,
        losers: fresh.filter((r) => r.id !== survivor.id),
        because,
      });
    }
  };

  collect((c) => c.sourceTeamIds, "same source id");
  collect((c) => {
    const key = normaliseTeamName(c.name);
    return nameIsDistinctive(key) ? [key] : [];
  }, "same name");

  return groups.sort((a, b) => b.losers.length - a.losers.length);
}
