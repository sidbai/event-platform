import { ImageResponse } from "next/og";

import { canViewEvent } from "@/features/events/can-view";
import { getEventBySlug } from "@/features/events/queries";

export const alt = "King Juan Soccer event";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await getEventBySlug(slug);
  // Unfurlers arrive with no session, so this is the anonymous check: an
  // unlisted event still gets a real card (sharing the link is the point), a
  // private one falls back to generic branding rather than leaking its details.
  const event = found && (await canViewEvent(found, null)) ? found : null;

  const title = event?.title ?? "King Juan Soccer";
  const dateLine = event?.startsAt
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: event.timezone ?? undefined,
      }).format(event.startsAt)
    : "";
  const place =
    event?.venue?.name ??
    (event?.locationType === "online" ? "Online" : "");
  const tag = [event?.kind, event?.ageGroup, event?.format]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#12140f",
          color: "#e9ebe1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "#67c083",
            }}
          />
          <div style={{ fontSize: 26, letterSpacing: 2, color: "#868c7c" }}>
            KING JUAN SOCCER
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tag ? (
            <div style={{ fontSize: 24, letterSpacing: 3, color: "#67c083" }}>
              {tag}
            </div>
          ) : null}
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
            {title}
          </div>
          <div style={{ fontSize: 32, color: "#b3b8aa" }}>
            {[dateLine, place].filter(Boolean).join("  —  ")}
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#868c7c" }}>
          More soccer. Less logistics.
        </div>
      </div>
    ),
    size,
  );
}
