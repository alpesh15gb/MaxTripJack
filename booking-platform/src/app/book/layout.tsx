import type { ReactNode } from "react";
import { canonicalUrl, privatePageMetadata } from "@/lib/seo";

export const metadata = {
  ...privatePageMetadata("Flight and hotel booking"),
  alternates: { canonical: canonicalUrl("/book") },
};

export default function BookingLayout({ children }: { children: ReactNode }) {
  return children;
}
