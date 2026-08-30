import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle, AlertTriangle, Link2, CloudDownload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface HubSpotConfig {
  configured: boolean;
}

interface HubSpotSettings {
  syncCustomersOnly: boolean;
  lastSyncTotalEvaluated?: number;
  lastSyncTotalEligible?: number;
  lastSyncTotalCreated?: number;
  lastSyncTotalUpdated?: number;
  lastSyncTotalSkipped?: number;
  lastSyncErrorCount?: number;
  lastSyncAt?: string;
}

interface HubSpotTestResult {
  success: boolean;
  message: string;
  companyCount?: number;
  customerCount?: number;
  http_status?: number;
  hubspot_error_category?: string | null;
  hubspot_request_id?: string | null;
}

interface HubSpotSyncStatus {
  isConfigured: boolean;
  totalCustomers: number;
  syncedFromHubSpot: number;
  lastSyncDate?: string;
  pendingSync: number;
  errorCount: number;
  settings: HubSpotSettings;
}

interface SyncResult {
  success: boolean;
  totalEvaluated: number;
  totalEligible: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
  syncCustomersOnly: boolean;
}

interface HubSpotStructuredError {
  message: string;
  http_status?: number | null;
  hubspot_error_category?: string | null;
  hubspot_request_id?: string | null;
}

async function fetchHubSpot<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw data as HubSpotStructuredError;
  }
  return data as T;
}

export function HubSpotIntegration() {
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [syncError, setSyncError] = useState<HubSpotStructuredError | null>(null);
  const [testError, setTestError] = useState<HubSpotStructuredError | null>(null);

  const { data: config, isLoading: configLoading } = useQuery<HubSpotConfig>({
    queryKey: ["/api/hubspot/config"],
  });

  const { data: syncStatus, isLoading: statusLoading } = useQuery<HubSpotSyncStatus>({
    queryKey: ["/api/hubspot/status"],
    enabled: config?.configured === true,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<HubSpotSettings>({
    queryKey: ["/api/hubspot/settings"],
    enabled: config?.configured === true,
  });

  const testConnectionMutation = useMutation<HubSpotTestResult, HubSpotStructuredError>({
    mutationFn: () => fetchHubSpot<HubSpotTestResult>("/api/hubspot/test"),
    onSuccess: (data) => {
      setTestError(null);
      if (data.success) {
        const countMsg = data.customerCount != null
          ? ` (${data.customerCount} companies with lifecyclestage=customer)`
          : data.companyCount != null
          ? ` (${data.companyCount} companies found)`
          : "";
        toast({ title: "Connection Successful", description: data.message + countMsg });
      } else {
        setTestError({
          message: data.message,
          http_status: data.http_status,
          hubspot_error_category: data.hubspot_error_category,
          hubspot_request_id: data.hubspot_request_id,
        });
        toast({ title: "Connection Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error) => {
      setTestError(error);
      toast({ title: "Connection Test Failed", description: error?.message || "Unable to connect to HubSpot", variant: "destructive" });
    },
    onSettled: () => setIsTesting(false),
  });

  const updateSettingsMutation = useMutation<{ ok: boolean; syncCustomersOnly: boolean }, Error, boolean>({
    mutationFn: async (syncCustomersOnly: boolean) => {
      const res = await apiRequest("PUT", "/api/hubspot/settings", { syncCustomersOnly });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/status"] });
      toast({
        title: "Settings Saved",
        description: data.syncCustomersOnly
          ? "Only HubSpot contacts with lifecycle stage 'customer' will be synced."
          : "All HubSpot companies will be evaluated during sync.",
      });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const syncMutation = useMutation<SyncResult, HubSpotStructuredError>({
    mutationFn: () => {
      const syncCustomersOnly = settings?.syncCustomersOnly ?? true;
      return fetchHubSpot<SyncResult>("/api/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncCustomersOnly }),
      });
    },
    onSuccess: (data) => {
      setSyncError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });

      const parts = [
        `Evaluated: ${data.totalEvaluated}`,
        `Eligible: ${data.totalEligible}`,
        `Created: ${data.created}`,
        `Updated: ${data.updated}`,
        `Skipped: ${data.skipped}`,
      ];

      if (data.success) {
        toast({ title: "Sync Completed", description: parts.join(" · ") });
      } else {
        toast({
          title: "Sync Completed with Errors",
          description: parts.join(" · ") + ` · ${data.errors.length} error(s)`,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setSyncError(error);
      toast({ title: "Sync Failed", description: error?.message || "Failed to sync from HubSpot", variant: "destructive" });
    },
  });

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestError(null);
    testConnectionMutation.mutate();
  };

  const handleToggleSyncCustomersOnly = (checked: boolean) => {
    updateSettingsMutation.mutate(checked);
  };

  if (configLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isConfigured = config?.configured ?? false;
  const currentSettings = settings ?? syncStatus?.settings;
  const syncCustomersOnly = currentSettings?.syncCustomersOnly ?? true;
  const activeError = syncError || testError;

  return (
    <Card data-testid="card-hubspot-integration">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle>HubSpot Integration</CardTitle>
          </div>
          {isConfigured ? (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Connected</Badge>
          ) : (
            <Badge variant="secondary">Not Configured</Badge>
          )}
        </div>
        <CardDescription>
          Sync customer data from HubSpot CRM using the Companies API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConfigured ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>HubSpot Not Configured</AlertTitle>
            <AlertDescription>
              To enable HubSpot integration, please add your <code className="text-xs bg-muted px-1 rounded">HUBSPOT_ACCESS_TOKEN</code> to the project secrets.
              You can get an access token by creating a private app in your HubSpot account settings.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Sync Customers Only Toggle */}
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="sync-customers-only" className="text-sm font-medium">
                  Sync Customers Only
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, only HubSpot companies with <code className="bg-muted px-1 rounded text-xs">lifecyclestage = customer</code> are eligible for sync.
                  Non-customer records are skipped even if the HubSpot API returns them.
                </p>
              </div>
              <Switch
                id="sync-customers-only"
                checked={syncCustomersOnly}
                onCheckedChange={handleToggleSyncCustomersOnly}
                disabled={settingsLoading || updateSettingsMutation.isPending}
                data-testid="switch-sync-customers-only"
              />
            </div>

            {/* Status Metrics */}
            {statusLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading sync status...</span>
              </div>
            ) : syncStatus && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                  <p className="text-lg font-semibold">{syncStatus.totalCustomers}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Synced from HubSpot</p>
                  <p className="text-lg font-semibold text-green-600">{syncStatus.syncedFromHubSpot}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pending Sync</p>
                  <p className="text-lg font-semibold text-amber-600">{syncStatus.pendingSync}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Errors</p>
                  <p className={`text-lg font-semibold ${syncStatus.errorCount > 0 ? "text-red-600" : ""}`}>
                    {syncStatus.errorCount}
                  </p>
                </div>
              </div>
            )}

            {/* Last Sync Detail */}
            {currentSettings?.lastSyncAt && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Sync Results
                </p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Evaluated</p>
                    <p className="text-sm font-semibold">{currentSettings.lastSyncTotalEvaluated ?? "—"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Eligible</p>
                    <p className="text-sm font-semibold text-blue-600">{currentSettings.lastSyncTotalEligible ?? "—"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-semibold text-green-600">{currentSettings.lastSyncTotalCreated ?? "—"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-sm font-semibold text-amber-600">{currentSettings.lastSyncTotalUpdated ?? "—"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Skipped</p>
                    <p className="text-sm font-semibold text-muted-foreground">{currentSettings.lastSyncTotalSkipped ?? "—"}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Synced {new Date(currentSettings.lastSyncAt).toLocaleString()}
                  {currentSettings.lastSyncErrorCount != null && currentSettings.lastSyncErrorCount > 0 && (
                    <span className="text-red-600 ml-2">· {currentSettings.lastSyncErrorCount} error(s)</span>
                  )}
                </p>
              </div>
            )}

            {syncStatus?.lastSyncDate && !currentSettings?.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(syncStatus.lastSyncDate).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
                data-testid="button-test-hubspot"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
              <Button
                size="sm"
                onClick={() => { setSyncError(null); syncMutation.mutate(); }}
                disabled={syncMutation.isPending}
                data-testid="button-sync-hubspot"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4 mr-2" />
                )}
                {syncCustomersOnly ? "Sync Customers" : "Sync All Companies"}
              </Button>
            </div>

            {/* Structured API Error Panel */}
            {activeError && (
              <Alert variant="destructive" data-testid="alert-hubspot-api-error">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between gap-2">
                  HubSpot API Error
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 -mr-1 -mt-1 text-destructive-foreground"
                    onClick={() => { setSyncError(null); setTestError(null); }}
                    data-testid="button-dismiss-hubspot-error"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </AlertTitle>
                <AlertDescription className="space-y-2 mt-2">
                  <p className="text-sm">{activeError.message}</p>
                  <Separator className="opacity-30" />
                  <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-destructive-foreground/60 min-w-[10rem]">http_status</span>
                      <span data-testid="text-hubspot-http-status" className="font-semibold">
                        {activeError.http_status ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-destructive-foreground/60 min-w-[10rem]">hubspot_error_category</span>
                      <span data-testid="text-hubspot-error-category" className="font-semibold">
                        {activeError.hubspot_error_category ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-destructive-foreground/60 min-w-[10rem]">hubspot_request_id</span>
                      <span data-testid="text-hubspot-request-id" className="font-semibold break-all">
                        {activeError.hubspot_request_id ?? "—"}
                      </span>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <div className="pt-2 border-t">
          <h4 className="text-sm font-medium mb-2">Field Mapping</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <span>HubSpot Company Name</span>
              <span className="text-foreground">→ Customer Name</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Customer Number (custom)</span>
              <span className="text-foreground">→ Customer #</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Phone</span>
              <span className="text-foreground">→ Primary Contact Number</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Lead Status</span>
              <span className="text-foreground">→ Status</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Lifecycle Stage</span>
              <span className="text-foreground">→ Sync Filter (must be "customer")</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Customer / Prospect Type</span>
              <span className="text-foreground">→ Customer Type</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span>Legal Name, Domain, Address</span>
              <span className="text-foreground">→ Customer Details</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
