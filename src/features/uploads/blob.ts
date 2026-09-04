/** Shared upload rules. Enforced server-side when minting the upload token. */

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Avatars and crests are small display images; this is generous for one. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True only for URLs served by our own Blob store.
 *
 * The browser tells the server which URL to save after an upload, so without
 * this check anyone could point their avatar at an arbitrary host and use the
 * profile as a tracking pixel or hotlink.
 */
export function isOurBlobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOST_SUFFIX)
  );
}

/** Where a given upload is allowed to live, keyed by what it is for. */
export type UploadTarget =
  | { kind: "avatar" }
  | { kind: "crest"; teamSlug: string }
  /**
   * A crest chosen while creating a team, before the team exists to authorize
   * against. Lands in a staging folder any signed-in user may write to, and
   * createTeam will only adopt a URL from there — so a new team cannot claim
   * an existing team's crest file out from under it.
   */
  | { kind: "new-crest" };

/** Staging folder for crests uploaded before their team exists. */
export const PENDING_CREST_PREFIX = "crests/_pending";

/**
 * Where a target's files live.
 *
 * The client sets the upload path and the server only gets to *validate* it —
 * `onBeforeGenerateToken` cannot rewrite the pathname, so both sides derive it
 * from here and the server checks the prefix before minting a token.
 */
export function uploadPrefix(target: UploadTarget): string {
  if (target.kind === "avatar") return "avatars";
  if (target.kind === "new-crest") return PENDING_CREST_PREFIX;
  return `crests/${target.teamSlug}`;
}

/**
 * True only for a crest sitting in the staging folder. createTeam accepts
 * nothing else: an arbitrary blob URL would let a new team point at a live
 * team's crest, and that team replacing its crest would then delete the file
 * out from under the new one.
 */
export function isPendingCrestUrl(url: string): boolean {
  if (!isOurBlobUrl(url)) return false;
  try {
    return new URL(url).pathname.startsWith(`/${PENDING_CREST_PREFIX}/`);
  } catch {
    return false;
  }
}

export function pathnameMatchesTarget(
  pathname: string,
  target: UploadTarget,
): boolean {
  const prefix = `${uploadPrefix(target)}/`;
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  // One flat segment: no traversal, no burrowing into another target's folder.
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}

export function parseUploadTarget(raw: string | null): UploadTarget | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "avatar") return { kind: "avatar" };
  if (v.kind === "new-crest") return { kind: "new-crest" };
  if (v.kind === "crest" && typeof v.teamSlug === "string")
    return { kind: "crest", teamSlug: v.teamSlug };
  return null;
}
