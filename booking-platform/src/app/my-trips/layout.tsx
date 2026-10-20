import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Your trips");

export default function TripsLayout({ children }: { children: ReactNode }) {
  return children;
}
