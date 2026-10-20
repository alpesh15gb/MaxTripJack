import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo";

// Read the explicit activation gate in the deployed runtime, not a build machine.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
