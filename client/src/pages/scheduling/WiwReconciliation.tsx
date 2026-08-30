/**
 * WIW Driver Reconciliation
 * Standalone page for reviewing and resolving unmatched WIW users.
 * Route: /scheduling/wiw-reconciliation
 */

import { WhenIWorkUserMapping } from "@/components/scheduling/WhenIWorkUserMapping";
import { GitMerge } from "lucide-react";

export default function WiwReconciliation() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <GitMerge className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">WIW Driver Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Review and resolve unmatched WhenIWork users — assign to existing drivers or create new ones.
          </p>
        </div>
      </div>
      <WhenIWorkUserMapping />
    </div>
  );
}
