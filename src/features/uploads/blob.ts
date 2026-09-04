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
  | { kind: "crest"; teamSlug: string };

/**
 * Where a target's files live.
 *
 * The client sets the upload path and the server only gets to *validate* it —
 * `onBeforeGenerateToken` cannot rewrite the pathname, so both sides derive it
 * from here and the server checks the prefix before minting a token.
 */
export function uploadPrefix(target: UploadTarget): string {
  return target.kind === "avatar" ? "avatars" : `crests/${target.teamSlug}`;
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
  if (v.kind === "crest" && typeof v.teamSlug === "string")
    return { kind: "crest", teamSlug: v.teamSlug };
  return null;
}
