import { buildLlmsTxt } from "@/lib/llms";

// Read the indexing gate in the deployed runtime, like robots.txt and the sitemap.
export const dynamic = "force-dynamic";

export function GET() {
  const body = buildLlmsTxt();
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
