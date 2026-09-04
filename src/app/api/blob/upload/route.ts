import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { canManageTeam } from "@/features/teams/access";
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  parseUploadTarget,
} from "@/features/uploads/blob";

export const dynamic = "force-dynamic";

/**
 * Mints a short-lived upload token so the browser can send the file straight
 * to Blob storage instead of through a server function.
 *
 * Everything is decided here, before the token exists: who the user is, that
 * they may write to this target, and what they may upload. The client cannot
 * widen any of it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sign in to upload.");

        const target = parseUploadTarget(clientPayload ?? null);
        if (!target) throw new Error("Unknown upload target.");

        if (target.kind === "crest") {
          const team = await db.query.teams.findFirst({
            where: eq(teams.slug, target.teamSlug),
            columns: { id: true },
          });
          if (!team || !(await canManageTeam(team.id)))
            throw new Error("You don't manage that team.");
        }

        return {
          allowedContentTypes: [...IMAGE_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Keep the uploader's identity in the path so an orphaned blob can be
          // traced back later.
          pathname:
            target.kind === "avatar"
              ? `avatars/${user.id}`
              : `crests/${target.teamSlug}`,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty. This webhook never fires against localhost, so
        // the URL is saved by an explicit server action after the upload
        // resolves in the browser — one path that works in both environments.
      },
    });

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
