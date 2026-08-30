/**
 * When I Work Integration Settings — Ticket 1 (WIW Epic)
 *
 * Lets authorised users configure and test the DriverHub ↔ When I Work API connection.
 * Rendered inside the Scheduling module → Connected Apps tab.
 *
 * Features:
 *  - API token input (masked, never returned from server)
 *  - Optional base URL override (advanced)
 *  - Test Connection with live feedback
 *  - Save settings
 *  - Connection status badge + last tested timestamp + last error
 *  - Sync toggle
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Loader2, Plug, RefreshCw, ShieldCheck,
  Clock, AlertTriangle, Eye, EyeOff, ExternalLink, Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WiwConfig {
  id: string;
  baseUrl: string;
  accountId: string | null;
  connectionStatus: "connected" | "not_connected" | "error";
  lastTestedAt: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
  syncEnabled: boolean;
  hasToken: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WiwConfig["connectionStatus"] | undefined }) {
  if (!status || status === "not_connected") {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <Plug className="h-3 w-3" />
        Not Connected
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge className="gap-1.5 bg-green-600 dark:bg-green-700 text-white border-0">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700">
      <XCircle className="h-3 w-3" />
      Connection Error
    </Badge>
  );
}

function fmtTs(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy h:mm a"); }
  catch { return iso; }
}

// ── Main component ────────────────────────────────────────────────────────────

export function WhenIWorkIntegration() {
  const { toast } = useToast();

  // Form state — token input (separate from stored, so we don't show the encrypted value)
  const [tokenInput, setTokenInput]     = useState("");
  const [showToken, setShowToken]       = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [accountIdInput, setAccountIdInput] = useState("");
  const [syncEnabled, setSyncEnabled]   = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Test result overlay
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    account?: { name: string; company: string | null; id: string | number };
    error?: string;
  } | null>(null);

  // ── Query: load config ─────────────────────────────────────────────────────
  const { data: config, isLoading, isError, refetch } = useQuery<WiwConfig | null>({
    queryKey: ["/api/scheduling/wheniwork/config"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load config");
      return res.json();
    },
    onSuccess: (cfg) => {
      if (cfg) {
        setBaseUrlInput(cfg.baseUrl ?? "https://api.wheniwork.com/2");
        setAccountIdInput(cfg.accountId ?? "");
        setSyncEnabled(cfg.syncEnabled ?? false);
      }
    },
  } as any);

  // ── Mutation: save config ─────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        baseUrl:     baseUrlInput || "https://api.wheniwork.com/2",
        accountId:   accountIdInput || null,
        syncEnabled,
      };
      if (tokenInput) body.token = tokenInput;
      const res = await apiRequest("POST", "/api/scheduling/wheniwork/config", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/config"] });
      setTokenInput(""); // clear token field after save
      toast({ title: "Settings saved", description: "When I Work configuration updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  // ── Mutation: test connection ─────────────────────────────────────────────
  const testMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {};
      if (tokenInput) body.token = tokenInput; // test with unsaved token if provided
      const res = await fetch("/api/scheduling/wheniwork/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/config"] });
      if (data.ok) {
        toast({ title: "Connection successful", description: `Authenticated to ${data.account?.name ?? "When I Work"}.` });
      } else {
        toast({ title: "Connection failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      setTestResult({ ok: false, error: err?.message ?? "Request failed" });
      toast({ title: "Test failed", description: err?.message, variant: "destructive" });
    },
  });

  const isBusy = saveMut.isPending || testMut.isPending;
  const canTest = !isBusy && (tokenInput.length > 0 || (config?.hasToken ?? false));
  const canSave = !isBusy && (tokenInput.length > 0 || (config?.hasToken ?? false));

  return (
    <div className="space-y-6" data-testid="wheniwork-integration">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-[#5C98F2]/10 flex items-center justify-center shrink-0">
            <Plug className="h-5 w-5 text-[#5C98F2]" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">When I Work</h3>
            <p className="text-sm text-muted-foreground">
              Scheduling &amp; Attendance API Integration
            </p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-28 rounded-full" />
        ) : isError ? (
          <div className="flex items-center gap-1.5 text-xs text-destructive" data-testid="error-wiw-config">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Failed to load</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <StatusBadge status={config?.connectionStatus} />
        )}
      </div>

      {/* Status panel */}
      {!isLoading && config && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last Tested
            </div>
            <p className="text-sm font-medium">{fmtTs(config.lastTestedAt)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              Last Sync
            </div>
            <p className="text-sm font-medium">{fmtTs(config.lastSyncAt)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Token Stored
            </div>
            <p className="text-sm font-medium">{config.hasToken ? "Yes (encrypted)" : "No"}</p>
          </div>
        </div>
      )}

      {/* Last error */}
      {config?.lastError && config.connectionStatus === "error" && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Last Connection Error</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{config.lastError}</p>
          </div>
        </div>
      )}

      <Separator />

      {/* Settings form */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-3">Connection Settings</h4>

          {/* API Token */}
          <div className="space-y-1.5">
            <Label htmlFor="wiw-token" className="text-sm">
              API Token <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Your When I Work API token.{" "}
              <a
                href="https://apidocs.wheniwork.com/#authentication"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                How to find it <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="relative">
              <Input
                id="wiw-token"
                type={showToken ? "text" : "password"}
                placeholder={config?.hasToken ? "••••••••  (token saved — enter new to replace)" : "Paste your W-Token here"}
                value={tokenInput}
                onChange={(e) => { setTokenInput(e.target.value); setTestResult(null); }}
                className="pr-10 font-mono text-sm"
                data-testid="input-wiw-token"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover-elevate p-0.5 rounded"
                data-testid="button-toggle-token-visibility"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Advanced settings toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            data-testid="button-toggle-advanced"
          >
            <Info className="h-3 w-3" />
            {showAdvanced ? "Hide" : "Show"} advanced settings
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 pl-3 border-l border-border">
              {/* Base URL */}
              <div className="space-y-1.5">
                <Label htmlFor="wiw-base-url" className="text-sm">API Base URL</Label>
                <p className="text-xs text-muted-foreground">Leave as default unless using a sandbox environment.</p>
                <Input
                  id="wiw-base-url"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="https://api.wheniwork.com/2"
                  className="font-mono text-sm"
                  data-testid="input-wiw-base-url"
                />
              </div>

              {/* Account ID */}
              <div className="space-y-1.5">
                <Label htmlFor="wiw-account-id" className="text-sm">Account ID (optional)</Label>
                <p className="text-xs text-muted-foreground">When I Work account identifier, if required by your plan.</p>
                <Input
                  id="wiw-account-id"
                  value={accountIdInput}
                  onChange={(e) => setAccountIdInput(e.target.value)}
                  placeholder="e.g. 123456"
                  className="font-mono text-sm"
                  data-testid="input-wiw-account-id"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sync toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm font-medium">Automatic Sync</p>
            <p className="text-xs text-muted-foreground">Periodically pull shifts, times, and attendance from When I Work.</p>
          </div>
          <Switch
            checked={syncEnabled}
            onCheckedChange={setSyncEnabled}
            data-testid="switch-wiw-sync-enabled"
          />
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className={`p-3 rounded-lg border ${
              testResult.ok
                ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
            }`}
            data-testid="wiw-test-result"
          >
            <div className="flex items-start gap-2">
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                {testResult.ok ? (
                  <>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      Connection successful
                    </p>
                    {testResult.account && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 space-y-0.5">
                        <p>Account: <span className="font-medium">{testResult.account.name}</span></p>
                        {testResult.account.company && <p>Company: {testResult.account.company}</p>}
                        <p>ID: {testResult.account.id}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Connection failed</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{testResult.error}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            onClick={() => testMut.mutate()}
            disabled={!canTest}
            variant="outline"
            data-testid="button-wiw-test-connection"
          >
            {testMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Test Connection
          </Button>

          <Button
            onClick={() => saveMut.mutate()}
            disabled={!canSave}
            data-testid="button-wiw-save-settings"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-1.5" />
            )}
            Save Settings
          </Button>

          {config?.hasToken && !tokenInput && (
            <p className="text-xs text-muted-foreground">
              Token is stored. Enter a new token above to replace it.
            </p>
          )}
        </div>
      </div>

      {/* Info footer */}
      <Separator />
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
        <p>
          API tokens are encrypted at rest using AES-256-GCM. The raw token is never stored in plain text
          and is never returned to the browser after saving.
        </p>
      </div>
    </div>
  );
}
