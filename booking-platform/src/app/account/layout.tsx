import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Your account");

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
