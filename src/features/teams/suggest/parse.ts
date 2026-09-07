/**
 * Reading a model's answer, on the assumption that it is wrong.
 *
 * Everything here exists because the output is untrusted text: an id that was
 * never sent, a team paired with itself, the same pair twice, a confidence
 * level nobody offered, or a hundred matches when we asked about twelve
 * teams. None of it is malicious — it is what generated text does — and all
 * of it would otherwise reach a queue that proposes irreversible merges.
 */

export type Suggestion = {
  newId: string;
  existingId: string;
  confidence: "high" | "medium";
  why: string;
};

const CONFIDENCE = new Set(["high", "medium"]);

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

export function parseSuggestions(
  raw: string,
  known: { newIds: Set<string>; existingIds: Set<string> },
  limit = 50,
): Suggestion[] {
  const value = extractJson(raw);
  if (!value || typeof value !== "object") return [];
  const matches = (value as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) return [];

  const seen = new Set<string>();
  const out: Suggestion[] = [];

  for (const item of matches) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const newId = typeof m.newId === "string" ? m.newId : "";
    const existingId = typeof m.existingId === "string" ? m.existingId : "";
    const confidence = typeof m.confidence === "string" ? m.confidence.toLowerCase() : "";
    const why = typeof m.why === "string" ? m.why.trim() : "";

    // Every id has to be one we sent. A model that invents one is not
    // malicious, it is a model, and this is a foreign key either way.
    if (!known.newIds.has(newId) || !known.existingIds.has(existingId)) continue;
    if (newId === existingId) continue;
    if (!CONFIDENCE.has(confidence)) continue;

    const key = [newId, existingId].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      newId,
      existingId,
      confidence: confidence as "high" | "medium",
      // Kept short: it is shown beside the pair, and a paragraph of
      // reasoning reads as authority the suggestion has not earned.
      why: why.slice(0, 200),
    });
    if (out.length >= limit) break;
  }
  return out;
}
