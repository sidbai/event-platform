import type { Metadata } from "next";

import { Avatar, avatarOf } from "@/components/avatar";
import { requireUser } from "@/features/auth";
import { updateProfile } from "@/features/profile/actions";
import { SettingsForm } from "@/features/profile/settings-form";
import { clearMyAvatar, setMyAvatar } from "@/features/uploads/actions";
import { ImageUpload } from "@/features/uploads/image-upload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>

      <div className="mt-5 flex items-start gap-4">
        <Avatar src={avatarOf(user)} name={user.displayName} size={64} />
        <div className="text-sm">
          <ImageUpload
            target={{ kind: "avatar" }}
            hasImage={Boolean(user.avatarUrl)}
            onUploaded={setMyAvatar}
            onCleared={clearMyAvatar}
          />
          {/*
            There is no public profile to link to. The handle is what appears
            beside a post; it is not an address, and nothing here collects a
            person's activity into a page for strangers to read.
          */}
          {user.username && (
            <p className="mt-2 text-xs text-muted">
              Posts show as <span className="font-mono">@{user.username}</span>.
            </p>
          )}
        </div>
      </div>

      <SettingsForm
        action={updateProfile}
        profile={{
          username: user.username,
          displayName: user.displayName,
          tags: user.tags,
          club: user.club,
          city: user.city,
          bio: user.bio,
        }}
      />

      <p className="mt-8 text-xs text-muted">
        Signed in as {user.email}.
      </p>
    </div>
  );
}
