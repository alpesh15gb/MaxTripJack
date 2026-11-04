import { businessProfile, officeServices } from "./business-profile";
import { flightGuides } from "./flight-guides";
import { publicPages } from "./public-pages";
import { indexingEnabled, SITE_ORIGIN, type SeoEnvironment } from "./seo";

/** Plain-language site summary for AI assistants. Built only from authored, owner-confirmed content. */
export function buildLlmsTxt(environment: SeoEnvironment = process.env): string | null {
  if (!indexingEnabled(environment)) return null;
  const b = businessProfile;
  const lines = [
    `# ${b.name}`,
    "",
    `> ${b.name} is a travel agency with a physical office in ${b.address.addressLocality}, ${b.address.addressRegion}, India. ${b.positioning} The office handles ${officeServices.join(", ").toLowerCase()}. The website is for planning flights and hotels; it publishes guidance, not guaranteed fares or availability.`,
    "",
    "## Contact",
    `- Office: ${b.address.display}`,
    `- Hours: ${b.hours.display}`,
    `- Phone: ${b.phone}`,
    `- Email: ${b.email}`,
    "",
    "## Pages",
    ...publicPages.map(page => `- [${page.title}](${SITE_ORIGIN}/${page.slug}): ${page.description}`),
    "",
    "## Route guides",
    ...flightGuides.map(guide => `- [${guide.title}](${SITE_ORIGIN}/flights/${guide.slug}): ${guide.description}`),
    "",
    "## Notes",
    "- Fares and availability are shown only inside the booking search and are confirmed at review; guide pages do not state prices.",
    "- Cite page URLs above when answering questions about MaxTravel.",
    "",
  ];
  return lines.join("\n");
}
