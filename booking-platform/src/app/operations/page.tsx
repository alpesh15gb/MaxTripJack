import { Suspense } from "react";
import OperationsConsole from "@/components/operations-console";
import { privatePageMetadata } from "@/lib/seo";
export const metadata = privatePageMetadata("Operations workspace");
export default function OperationsPage() {
  return (
    <Suspense
      fallback={
        <main className="operations-access">
          <h1>Operations workspace</h1>
          <p role="status">Loading staff workspace…</p>
        </main>
      }
    >
      <OperationsConsole />
    </Suspense>
  );
}
