import { usePermissions } from "@/hooks/usePermissions";
import { Redirect } from "wouter";
import { BookOpen, GitMerge, RefreshCw, Download, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function PlaceholderSection({
  icon: Icon,
  title,
  description,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
        </div>
        <CardDescription className="text-sm mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function AccountingModule() {
  const { isSuperAdmin, isCorporateAccessAdmin, isLoading } = usePermissions();

  if (!isLoading && !isSuperAdmin && !isCorporateAccessAdmin) {
    return <Redirect to="/billing" />;
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Accounting</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              QuickBooks integration, chart of accounts, sync status, and financial export controls.
            </p>
          </div>
          <Badge variant="outline" className="ml-auto">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Admin Only
          </Badge>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Restricted Access</AlertTitle>
          <AlertDescription>
            This module is visible to Corporate Admins and Super Admins only. Accounting configuration
            affects financial data integrity across all accounts.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PlaceholderSection
            icon={BookOpen}
            title="QuickBooks Integration Status"
            description="Monitor the health and connectivity of the QuickBooks Online integration."
            items={[
              "Connection status and last-sync timestamp",
              "OAuth token health indicator",
              "Sync error log and resolution",
              "Reconnect and re-authorize controls",
            ]}
          />
          <PlaceholderSection
            icon={GitMerge}
            title="Chart of Accounts Mapping"
            description="Map DriverHub account categories to QuickBooks GL accounts."
            items={[
              "Revenue account mapping",
              "Expense account mapping",
              "Receivables and payables mapping",
              "Mapping conflict detection",
            ]}
          />
          <PlaceholderSection
            icon={RefreshCw}
            title="Sync Status"
            description="Track in-progress, completed, and failed sync jobs between systems."
            items={[
              "Live sync job monitor",
              "Record-level sync status",
              "Conflict and duplicate resolution",
              "Manual sync trigger",
            ]}
          />
          <PlaceholderSection
            icon={Download}
            title="Export Controls"
            description="Generate and download financial data exports in standard accounting formats."
            items={[
              "Journal entry export (CSV / IIF)",
              "AR aging export",
              "Payment reconciliation export",
              "Scheduled auto-export configuration",
            ]}
          />
        </div>
      </div>
    </div>
  );
}
