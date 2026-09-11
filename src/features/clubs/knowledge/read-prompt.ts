import { type ClubProfile } from "./profile";

/**
 * What we ask a model to read out of a club's own pages.
 *
 * The model is doing reading comprehension, not recall: everything it may
 * answer with is in the pages it is given, and the prompt says so twice
 * because a model asked about "Seattle United" will otherwise cheerfully
 * describe a club it half-remembers. A profile invented from training data
 * would be indistinguishable from one that was read, and it would go on to
 * argue for merges.
 */

export const READ_SYSTEM = [
  "You read a youth soccer club's own website and record how that club organises and names its teams.",
  "Use only what the pages say. If the pages do not say, answer with an empty list or \"unknown\".",
  "Never use outside knowledge about the club, and never infer a tier or a programme you did not read.",
  "Distinguish a tier from a squad: a tier ranks two teams of the same age (Elite above Premier above Select);",
  "a squad merely names one of several equal sides (Red and Grey, Azul and Rojo, A and B, II).",
].join(" ");

export type PageText = { url: string; text: string };

export function buildReadPrompt(club: { name: string; website: string }, pages: PageText[]): string {
  return [
    `Club: ${club.name} (${club.website})`,
    "",
    "Pages from that club's website follow. Read them and answer about this club only.",
    ...pages.map((p) => `\n----- ${p.url} -----\n${p.text}`),
    "",
    "Answer with JSON only, in this shape:",
    JSON.stringify(
      {
        tiers: ["strongest first, the club's own words, e.g. ECNL, Elite, Premier, Select"],
        squadMarkers: ["words or letters telling two same-age sides apart, e.g. Red, Grey, A, B, II"],
        colours: "tier | squad | mixed | none | unknown",
        ageBands: "single-year | two-year | both | unknown",
        branches: ["programmes or towns whose teams are separate sides, e.g. Bellevue, Tacoma, ECNL"],
        coaches: [{ name: "…", role: "… or null", ageGroups: ["Boys 2013"] }],
        summary: "two or three sentences on how this club names its teams",
      },
      null,
      1,
    ),
    "",
    "Leave a list empty rather than filling it with a guess. Do not name a coach the pages do not name.",
  ].join("\n");
}

const COLOURS = new Set(["tier", "squad", "mixed", "none", "unknown"]);
const BANDS = new Set(["single-year", "two-year", "both", "unknown"]);

function strings(value: unknown, cap: number, each = 60): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, each);
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= cap) break;
  }
  return out;
}

/** JSON hidden in prose or a code fence, which is how models answer anyway. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The answer, read on the assumption that it is wrong.
 *
 * Everything is capped and every enum is checked against a set, because this
 * text lands in a file that a person reviews and a prompt that argues for
 * merges — and a model that answers `colours: "colour"` or returns four
 * hundred coaches should cost a truncated field, not a broken profile.
 */
export function parseProfile(
  raw: string,
  about: { slug: string; sources: string[]; model: string; readAt: string },
): ClubProfile {
  const value = extractJson(raw);
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  const colours = typeof o.colours === "string" ? o.colours.toLowerCase().trim() : "";
  const ageBands = typeof o.ageBands === "string" ? o.ageBands.toLowerCase().trim() : "";

  const coaches = Array.isArray(o.coaches)
    ? o.coaches.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const c = item as Record<string, unknown>;
        const name = typeof c.name === "string" ? c.name.trim().slice(0, 80) : "";
        if (!name) return [];
        return [
          {
            name,
            role: typeof c.role === "string" && c.role.trim() ? c.role.trim().slice(0, 60) : null,
            ageGroups: strings(c.ageGroups, 12, 40),
          },
        ];
      })
    : [];

  return {
    slug: about.slug,
    tiers: strings(o.tiers, 10),
    squadMarkers: strings(o.squadMarkers, 16, 24),
    colours: COLOURS.has(colours) ? (colours as ClubProfile["colours"]) : "unknown",
    ageBands: BANDS.has(ageBands) ? (ageBands as ClubProfile["ageBands"]) : "unknown",
    branches: strings(o.branches, 20),
    // Deduplicated by name: a director listed on three pages is one person.
    coaches: coaches
      .filter((c, i) => coaches.findIndex((d) => d.name.toLowerCase() === c.name.toLowerCase()) === i)
      .slice(0, 120),
    summary: typeof o.summary === "string" ? o.summary.trim().replace(/\s+/g, " ").slice(0, 400) : "",
    sources: about.sources,
    readAt: about.readAt,
    model: about.model,
  };
}
