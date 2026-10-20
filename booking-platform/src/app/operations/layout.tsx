import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Operations workspace");

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return children;
}
