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
