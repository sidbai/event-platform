"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState, useTransition } from "react";

import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_TYPES,
  uploadPrefix,
  type UploadTarget,
} from "./blob";

/** What a button accepts, and what it says about it. */
const MEDIA = {
  image: { types: IMAGE_TYPES, max: MAX_UPLOAD_BYTES, wrong: "Use a JPG, PNG, WEBP or GIF.", hint: "JPG, PNG, WEBP or GIF" },
  video: { types: VIDEO_TYPES, max: MAX_VIDEO_BYTES, wrong: "Use an MP4, WebM or MOV.", hint: "MP4, WebM or MOV" },
} as const;

const MB = (n: number) => `${Math.round(n / (1024 * 1024))}MB`;

/**
 * The image's real pixel size, read before it is sent.
 *
 * Worth the extra step because the alternative is guessing: a page that does
 * not know an image's shape has to force one, which is how a portrait photo
 * ends up cropped through the middle.
 */
async function measure(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    // An animated GIF or an odd encoding can refuse to decode here. The upload
    // itself is fine; the page just falls back to a fixed shape for it.
    return null;
  }
}

export function ImageUpload({
  target,
  onUploaded,
  onMeasured,
  onCleared,
  hasImage,
  label = "Upload a photo",
  media = "image",
}: {
  target: UploadTarget;
  /** Images by default; a video for the one place that takes them. */
  media?: keyof typeof MEDIA;
  onUploaded: (url: string) => Promise<void>;
  /** Its pixel size, when the browser could read it. */
  onMeasured?: (size: { width: number; height: number } | null) => void;
  onCleared?: () => Promise<void>;
  hasImage: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);

    // Checked again server-side when the token is minted; this is just so the
    // user finds out before waiting for an upload to fail.
    const rules = MEDIA[media];
    if (!(rules.types as readonly string[]).includes(file.type)) {
      setError(rules.wrong);
      return;
    }
    if (file.size > rules.max) {
      setError(`That file is over ${MB(rules.max)}.`);
      return;
    }

    setBusy(true);
    try {
      const size = onMeasured && media === "image" ? await measure(file) : null;
      // addRandomSuffix keeps this unique; the server validates the prefix.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);
      const blob = await upload(`${uploadPrefix(target)}/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify(target),
      });
      await onUploaded(blob.url);
      onMeasured?.(size);
      startTransition(() => {});
    } catch (e) {
      setError((e as Error).message || "That didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept={MEDIA[media].types.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated disabled:opacity-50"
        >
          {busy ? "Uploading…" : hasImage ? "Replace" : label}
        </button>
        {hasImage && onCleared && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onCleared().finally(() => setBusy(false));
            }}
            className="text-xs text-muted hover:text-red-600 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {MEDIA[media].hint}, up to {MB(MEDIA[media].max)}.
        </p>
      )}
    </div>
  );
}
