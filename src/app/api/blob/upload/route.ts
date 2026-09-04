import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canEditClub } from "@/features/clubs/access";
import { canManageTeam } from "@/features/teams/access";
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  parseUploadTarget,
  pathnameMatchesTarget,
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
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sign in to upload.");

        const target = parseUploadTarget(clientPayload ?? null);
        if (!target) throw new Error("Unknown upload target.");

        // The pathname comes from the browser and cannot be rewritten here, so
        // it has to be checked: it must sit directly under this target's own
        // prefix, with no traversal into anyone else's.
        if (!pathnameMatchesTarget(pathname, target))
          throw new Error("That upload path isn't allowed.");

        // "new-crest" and "new-club" need no subject check: it lands in the staging folder for
        // a subject that doesn't exist yet, and the create action only adopts
        // URLs from there. Any signed-in user may write one.
        if (target.kind === "club" && !(await canEditClub()))
          throw new Error("You can't edit that club.");

        // News is editorial, so its images are admin-only like its articles.
        if (target.kind === "news" && !isAdmin(user))
          throw new Error("Only admins can upload news images.");

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
