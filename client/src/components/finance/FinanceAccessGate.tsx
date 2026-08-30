import { Skeleton } from "@/components/ui/skeleton";
import { ShieldOff, Lock } from "lucide-react";
import { useFinancePermissions } from "@/hooks/useFinancePermissions";
import { usePermissions } from "@/hooks/usePermissions";
import type { FinancePerms } from "@/hooks/useFinancePermissions";

interface FinanceAccessGateProps {
  /** Which specific Finance permission is required in addition to canViewModule */
  require?: keyof Pick<FinancePerms, "canViewDashboard" | "canViewRevenue" | "canViewExpenses" | "canViewMargin" | "canExport" | "canManageQbSync">;
  children: React.ReactNode;
}

export function FinanceAccessGate({ require, children }: FinanceAccessGateProps) {
  const { perms, isLoading } = useFinancePermissions();
  const { isSuperAdmin } = usePermissions();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isSuperAdmin) return <>{children}</>;

  if (!perms.canViewModule) {
    return <FinanceAccessDenied reason="module" />;
  }

  if (require && !perms[require]) {
    return <FinanceAccessDenied reason="section" />;
  }

  return <>{children}</>;
}

function FinanceAccessDenied({ reason }: { reason: "module" | "section" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="rounded-full bg-muted p-5 mb-6">
        {reason === "module" ? (
          <Lock className="h-10 w-10 text-muted-foreground" />
        ) : (
          <ShieldOff className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <h2 className="text-xl font-semibold mb-2">Finance Access Required</h2>
      <p className="text-muted-foreground max-w-md mb-4 text-sm leading-relaxed">
        {reason === "module"
          ? "You do not have access to the Finance module. This module contains sensitive financial data and requires explicit permission to be granted by a Super Admin."
          : "You do not have permission to view this section of the Finance module. Contact a Super Admin to request access."}
      </p>
      <p className="text-xs text-muted-foreground">
        Contact your platform administrator to request Finance module access.
      </p>
    </div>
  );
}
