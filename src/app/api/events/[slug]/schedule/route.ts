import { scheduleFeed } from "@/features/events/public-feed";

export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const schedule = await scheduleFeed(slug);
  if (!schedule) {
    return Response.json(
      { error: "event not found" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  return Response.json(schedule, { headers });
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
