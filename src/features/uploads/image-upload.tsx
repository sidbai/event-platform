"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState, useTransition } from "react";

import { IMAGE_TYPES, MAX_UPLOAD_BYTES, type UploadTarget } from "./blob";

const MB = (n: number) => `${Math.round(n / (1024 * 1024))}MB`;

export function ImageUpload({
  target,
  onUploaded,
  onCleared,
  hasImage,
  label = "Upload a photo",
}: {
  target: UploadTarget;
  onUploaded: (url: string) => Promise<void>;
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
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError("Use a JPG, PNG, WEBP or GIF.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is over ${MB(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    setBusy(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify(target),
      });
      await onUploaded(blob.url);
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
          accept={IMAGE_TYPES.join(",")}
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
          JPG, PNG, WEBP or GIF, up to {MB(MAX_UPLOAD_BYTES)}.
        </p>
      )}
    </div>
  );
}
