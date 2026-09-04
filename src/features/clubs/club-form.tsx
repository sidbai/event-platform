"use client";

import { useActionState, useState } from "react";

import { TeamCrest } from "@/components/team-crest";
import { ImageUpload } from "@/features/uploads/image-upload";

import type { ClubResult } from "./constants";

type Action = (prev: ClubResult, formData: FormData) => Promise<ClubResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export function ClubForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<ClubResult, FormData>(
    action,
    {},
  );
  const [crestUrl, setCrestUrl] = useState<string | null>(null);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="name">
          Club name
        </label>
        <input id="name" name="name" autoFocus className={`mt-1 ${field}`} />
        {err.name && <p className="mt-1 text-xs text-red-600">{err.name}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="city">
            City <span className="text-muted">(optional)</span>
          </label>
          <input id="city" name="city" placeholder="Bellevue" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="website">
            Website <span className="text-muted">(optional)</span>
          </label>
          <input id="website" name="website" type="url" placeholder="https://…" className={`mt-1 ${field}`} />
        </div>
      </div>
      <div>
        <span className={label}>
          Logo <span className="text-muted">(optional)</span>
        </span>
        <div className="mt-2 flex items-start gap-4">
          <TeamCrest src={crestUrl} size={64} />
          <input type="hidden" name="crestUrl" value={crestUrl ?? ""} />
          <ImageUpload
            target={{ kind: "new-club" }}
            hasImage={Boolean(crestUrl)}
            onUploaded={async (url) => setCrestUrl(url)}
            onCleared={async () => setCrestUrl(null)}
            label="Upload a logo"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add club"}
      </button>
    </form>
  );
}

export function ClubEditForm({
  action,
  club,
  slug,
  onLogoUploaded,
  onLogoCleared,
}: {
  action: Action;
  club: {
    name: string;
    city: string | null;
    website: string | null;
    crestUrl: string | null;
  };
  slug: string;
  onLogoUploaded: (url: string) => Promise<void>;
  onLogoCleared: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState<ClubResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <>
      <div className="mt-6">
        <span className={label}>Logo</span>
        <div className="mt-2 flex items-start gap-4">
          <TeamCrest src={club.crestUrl} size={64} />
          {/* Saved on upload rather than on submit, so the logo and the text
              fields don't have to be changed together. */}
          <ImageUpload
            target={{ kind: "club", clubSlug: slug }}
            hasImage={Boolean(club.crestUrl)}
            onUploaded={onLogoUploaded}
            onCleared={onLogoCleared}
            label="Upload a logo"
          />
        </div>
      </div>

      <form action={formAction} className="mt-6 space-y-5">
        <div>
          <label className={label} htmlFor="name">
            Club name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={club.name}
            className={`mt-1 ${field}`}
          />
          {err.name && <p className="mt-1 text-xs text-red-600">{err.name}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="city">
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={club.city ?? ""}
              placeholder="Bellevue"
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <label className={label} htmlFor="website">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="url"
              defaultValue={club.website ?? ""}
              placeholder="https://…"
              className={`mt-1 ${field}`}
            />
          </div>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {state.ok && <span className="text-sm text-brand-text">Saved.</span>}
        </div>
      </form>
    </>
  );
}
