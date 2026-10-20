import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Saved travellers");

export default function TravellersLayout({ children }: { children: ReactNode }) {
  return children;
}
