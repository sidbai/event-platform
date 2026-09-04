"use client";

import { useActionState, useState } from "react";

import { TeamCrest } from "@/components/team-crest";
import { ImageUpload } from "@/features/uploads/image-upload";

import type { TeamFormResult } from "./create-actions";

type Action = (prev: TeamFormResult, formData: FormData) => Promise<TeamFormResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export function CreateTeamForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<TeamFormResult, FormData>(
    action,
    {},
  );
  const [visibility, setVisibility] = useState("public");
  const [crestUrl, setCrestUrl] = useState<string | null>(null);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="name">
          Team name
        </label>
        <input id="name" name="name" className={`mt-1 ${field}`} autoFocus />
        {err.name && <p className="mt-1 text-xs text-red-600">{err.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="club">
            Club <span className="text-muted">(optional)</span>
          </label>
          <input id="club" name="club" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            City <span className="text-muted">(optional)</span>
          </label>
          <input id="city" name="city" placeholder="Bellevue" className={`mt-1 ${field}`} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group <span className="text-muted">(optional)</span>
          </label>
          <input id="ageGroup" name="ageGroup" placeholder="U11" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender <span className="text-muted">(optional)</span>
          </label>
          <select id="gender" name="gender" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">Any / coed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </div>
      </div>

      <div>
        <span className={label}>
          Crest <span className="text-muted">(optional)</span>
        </span>
        <div className="mt-2 flex items-start gap-4">
          <TeamCrest src={crestUrl} size={64} />
          {/* Carried on the form; createTeam attaches it to the new team. */}
          <input type="hidden" name="crestUrl" value={crestUrl ?? ""} />
          <ImageUpload
            target={{ kind: "new-crest" }}
            hasImage={Boolean(crestUrl)}
            onUploaded={async (url) => setCrestUrl(url)}
            onCleared={async () => setCrestUrl(null)}
            label="Upload a crest"
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="bio">
          About <span className="text-muted">(optional)</span>
        </label>
        <textarea id="bio" name="bio" rows={3} className={`mt-1 ${field}`} />
      </div>

      <fieldset>
        <legend className={label}>Who can see it</legend>
        <div className="mt-2 space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Public</span>
              <span className="block text-muted">
                Listed in the team directory so others can find you.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Private</span>
              <span className="block text-muted">
                Not listed. Only people you invite will see it.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}

export function TeamInviteForm({
  action,
}: {
  action: (
    prev: { error?: string; ok?: string },
    formData: FormData,
  ) => Promise<{ error?: string; ok?: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-3">
      <div className="flex flex-wrap gap-2">
        <input
          name="who"
          placeholder="@username or email@example.com"
          className={`min-w-0 flex-1 ${field}`}
        />
        <select name="role" defaultValue="player" className="rounded-md border border-line bg-card px-3 py-2 text-sm">
          <option value="player">Player</option>
          <option value="coach">Coach</option>
          <option value="manager">Manager</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-brand-text">{state.ok}</p>}
    </form>
  );
}
