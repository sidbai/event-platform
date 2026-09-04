import Link from "next/link";
import type { Metadata } from "next";

import { Avatar, avatarOf } from "@/components/avatar";
import { requireUser } from "@/features/auth";
import { updateProfile } from "@/features/profile/actions";
import { SettingsForm } from "@/features/profile/settings-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>

      <div className="mt-5 flex items-center gap-3">
        <Avatar src={avatarOf(user)} name={user.displayName ?? user.name} size={56} />
        <div className="text-sm text-neutral-500">
          <p>
            Photo from your Google account.{" "}
            <span className="text-neutral-400">Custom uploads coming soon.</span>
          </p>
          {user.username && (
            <Link
              href={`/people/${user.username}`}
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              View public profile →
            </Link>
          )}
        </div>
      </div>

      <SettingsForm
        action={updateProfile}
        profile={{
          username: user.username,
          displayName: user.displayName,
          name: user.name,
          tags: user.tags,
          club: user.club,
          city: user.city,
          bio: user.bio,
        }}
      />

      <p className="mt-8 text-xs text-neutral-400">
        Signed in as {user.email}.
      </p>
    </div>
  );
}
