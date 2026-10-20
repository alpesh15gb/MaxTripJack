import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Reset your password");

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
