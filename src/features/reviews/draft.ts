/**
 * Keeping an unfinished review while its author goes and signs in.
 *
 * Reviews need an account — that is what makes one-per-person enforceable and
 * gives a named coach someone to answer — but asking for it at the door costs
 * you the review. So the form is open to everyone and the account is asked for
 * at the moment of posting, with what they wrote held here across the round
 * trip to Google and back.
 *
 * The draft lives in the browser and never reaches the server: an unposted
 * review is not ours to store, and a signed-out author has no row to attach it
 * to anyway.
 */

/** Storage this can work with, so the logic is testable without a browser. */
export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Draft = Record<string, string>;

const PREFIX = "kjs.review-draft";

/** Per subject, so a draft about one coach cannot surface under another. */
export function draftKey(subject: "club" | "coach", slug: string): string {
  return `${PREFIX}.${subject}.${slug}`;
}

/**
 * Form values worth keeping.
 *
 * Blank fields are dropped so an untouched form does not count as a draft —
 * otherwise merely opening the page would leave one behind, and restoring it
 * later would overwrite nothing with nothing.
 */
export function draftFrom(formData: FormData): Draft {
  const draft: Draft = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (value.trim() === "") continue;
    if (isInternalField(name)) continue;
    draft[name] = value;
  }
  return draft;
}

/**
 * React's own hidden fields, which a form carrying a server action contains:
 * $ACTION_KEY, $ACTION_1:0 and friends.
 *
 * They must never be kept. They identify one build's action, so restoring a
 * set saved before a deploy would put a stale action id back into a live form
 * — a saved draft quietly breaking the button that posts it.
 */
function isInternalField(name: string): boolean {
  return name.startsWith("$");
}

export function isEmpty(draft: Draft): boolean {
  return Object.keys(draft).length === 0;
}

/**
 * Every one of these swallows its errors.
 *
 * Storage throws outright in some browsers — a private window, third-party
 * cookies blocked, quota reached. Losing a draft is a disappointment; taking
 * the review form down with it is a bug.
 */
export function readDraft(store: DraftStore, key: string): Draft | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const draft: Draft = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") draft[k] = v;
    }
    return isEmpty(draft) ? null : draft;
  } catch {
    return null;
  }
}

export function writeDraft(store: DraftStore, key: string, draft: Draft): void {
  try {
    if (isEmpty(draft)) store.removeItem(key);
    else store.setItem(key, JSON.stringify(draft));
  } catch {
    // Nothing to do — the form still works, the draft just will not survive.
  }
}

export function clearDraft(store: DraftStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // As above.
  }
}
