import {getCompanyProfile} from "@/lib/company-settings";
import { buildLlmsTxt } from "@/lib/llms";

// Read the indexing gate in the deployed runtime, like robots.txt and the sitemap.
export const dynamic = "force-dynamic";

export async function GET() {
  const body = buildLlmsTxt(process.env,await getCompanyProfile());
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
