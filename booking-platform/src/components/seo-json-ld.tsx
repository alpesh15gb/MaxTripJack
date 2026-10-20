import { headers } from "next/headers";
import { type JsonLdData, serializeJsonLd } from "@/lib/seo";

export default async function SeoJsonLd({ data, id }: { data: JsonLdData; id?: string }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script id={id} type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
