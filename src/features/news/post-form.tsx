"use client";

import { useActionState, useRef, useState } from "react";

import { ImageUpload } from "@/features/uploads/image-upload";

import { NEWS_CATEGORIES, type NewsResult } from "./constants";

type Action = (prev: NewsResult, formData: FormData) => Promise<NewsResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export function NewsPostForm({
  action,
  existing,
  admin,
  submitLabel,
}: {
  action: Action;
  existing?: {
    title: string;
    summary: string;
    body: string;
    category: string;
    coverUrl: string | null;
    coverWidth: number | null;
    coverHeight: number | null;
    published: boolean;
  } | null;
  /** Admins publish directly; everyone else's send goes to the review queue. */
  admin: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<NewsResult, FormData>(
    action,
    {},
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    existing?.coverUrl ?? null,
  );
  const [coverSize, setCoverSize] = useState<{
    width: number;
    height: number;
  } | null>(
    existing?.coverWidth && existing?.coverHeight
      ? { width: existing.coverWidth, height: existing.coverHeight }
      : null,
  );
  const [body, setBody] = useState(existing?.body ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** Drops an uploaded image into the article at the cursor. */
  function insertImage(url: string) {
    const el = bodyRef.current;
    const snippet = `\n![](${url})\n`;
    if (!el) {
      setBody((b) => b + snippet);
      return;
    }
    const at = el.selectionStart ?? body.length;
    setBody(body.slice(0, at) + snippet + body.slice(at));
    // Put the caret after what we just inserted, so typing continues below the
    // image rather than in the middle of the markup.
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = at + snippet.length;
    });
  }
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="title">
          Headline
        </label>
        <input
          id="title"
          name="title"
          defaultValue={existing?.title}
          className={`mt-1 ${field}`}
          autoFocus
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div>
        <label className={label} htmlFor="summary">
          Summary
        </label>
        <input
          id="summary"
          name="summary"
          defaultValue={existing?.summary}
          placeholder="One line — this is what shows on the index and in link previews."
          className={`mt-1 ${field}`}
        />
        {err.summary && <p className="mt-1 text-xs text-red-600">{err.summary}</p>}
      </div>

      <div>
        <label className={label} htmlFor="category">
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue={existing?.category ?? "news"}
          className={`mt-1 ${field} sm:max-w-xs`}
        >
          {NEWS_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        {err.category && <p className="mt-1 text-xs text-red-600">{err.category}</p>}
      </div>

      <div>
        <span className={label}>
          Cover image <span className="text-muted">(optional)</span>
        </span>
        <div className="mt-2 flex items-start gap-4">
          {coverUrl ? (
            // Plain img: this is an editor preview, and next/image would want
            // the blob host configured for every possible size here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-20 w-32 rounded-lg object-cover"
            />
          ) : (
            <div className="h-20 w-32 rounded-lg bg-elevated" />
          )}
          <input type="hidden" name="coverUrl" value={coverUrl ?? ""} />
          <input
            type="hidden"
            name="coverWidth"
            value={coverSize?.width ?? ""}
          />
          <input
            type="hidden"
            name="coverHeight"
            value={coverSize?.height ?? ""}
          />
          <ImageUpload
            target={{ kind: "news" }}
            hasImage={Boolean(coverUrl)}
            onUploaded={async (url) => setCoverUrl(url)}
            onMeasured={setCoverSize}
            onCleared={async () => {
              setCoverUrl(null);
              setCoverSize(null);
            }}
            label="Upload a cover"
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="body">
          Article
        </label>
        <textarea
          id="body"
          name="body"
          ref={bodyRef}
          rows={16}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`mt-1 ${field}`}
        />
        {err.body && <p className="mt-1 text-xs text-red-600">{err.body}</p>}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Formatting: <code>**bold**</code>, <code>*italic*</code>,{" "}
            <code>[text](https://link)</code>, <code>## heading</code>,{" "}
            <code>- list</code>. A blank line starts a new paragraph.
          </p>
          <ImageUpload
            target={{ kind: "news" }}
            hasImage={false}
            onUploaded={async (url) => insertImage(url)}
            label="Insert an image"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="publish"
          defaultChecked={existing?.published ?? false}
        />
        {admin ? "Publish now" : "Send for review"}
        <span className="text-muted">
          {admin
            ? "(leave off to keep it a draft only admins can see)"
            : "(leave off to keep working on it privately)"}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-brand-text">Saved.</span>}
      </div>
    </form>
  );
}
