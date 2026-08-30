import { useAuth } from "@/hooks/useAuth";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportAccessGuardProps {
  children: React.ReactNode;
  module?: string;
}

export function ImportAccessGuard({ children, module = "data" }: ImportAccessGuardProps) {
  const { isSuperAdmin, isRootSuperAdmin } = useAuth();
  const hasAccess = isSuperAdmin || isRootSuperAdmin;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <div className="rounded-full bg-destructive/10 p-4">
            <ShieldX className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            Data imports are restricted to Super Admin users only. Contact your administrator if you need access to {module} import functionality.
          </p>
          <p className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
            File uploads to individual records are not affected.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-back">
          Go Back
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
