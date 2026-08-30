import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Link, Unlink, RefreshCw, Settings, CheckCircle, 
  XCircle, AlertCircle, Building2, CreditCard, Receipt, Calendar 
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

interface QuickBooksSettingsData {
  id: string;
  realmId: string | null;
  isConnected: boolean;
  lastSyncAt: string | null;
  connectionError: string | null;
  hasTokens: boolean;
  arAccountId: string | null;
  arAccountName: string | null;
  incomeAccountId: string | null;
  incomeAccountName: string | null;
  feeAccountId: string | null;
  feeAccountName: string | null;
  taxAccountId: string | null;
  taxAccountName: string | null;
  depositAccountId: string | null;
  depositAccountName: string | null;
  itemMappings: Record<string, { itemId: string; itemName: string }> | null;
  creditSyncMode: string;
  autoSyncEnabled: boolean;
  syncInvoicesOnSend: boolean;
  syncPaymentsOnReceive: boolean;
}

export default function QuickBooksSettings() {
  const { toast } = useToast();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showBatchSyncDialog, setShowBatchSyncDialog] = useState(false);
  const [realmId, setRealmId] = useState("");
  const [batchStartDate, setBatchStartDate] = useState("");
  const [batchEndDate, setBatchEndDate] = useState("");

  const { data: settings, isLoading } = useQuery<QuickBooksSettingsData | null>({
    queryKey: ["/api/corporate/integrations/quickbooks/settings"],
  });

  const { data: syncQueue } = useQuery<any[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/sync-queue"],
    refetchInterval: settings?.isConnected ? 10000 : false,
  });

  const connectMutation = useMutation({
    mutationFn: async (data: { realmId: string }) => {
      return await apiRequest("POST", "/api/corporate/integrations/quickbooks/connect", data);
    },
    onSuccess: () => {
      toast({ title: "QuickBooks Connected", description: "Your QuickBooks account is now connected" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/settings"] });
      setShowConnectDialog(false);
      setRealmId("");
    },
    onError: (error: any) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/corporate/integrations/quickbooks/disconnect");
    },
    onSuccess: () => {
      toast({ title: "QuickBooks Disconnected" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/settings"] });
    },
    onError: (error: any) => {
      toast({ title: "Disconnect Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<QuickBooksSettingsData>) => {
      return await apiRequest("PUT", "/api/corporate/integrations/quickbooks/settings", data);
    },
    onSuccess: () => {
      toast({ title: "Settings Saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/settings"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to Save Settings", description: error.message, variant: "destructive" });
    },
  });

  const batchSyncMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; entityTypes: string[] }) => {
      return await apiRequest("POST", "/api/corporate/integrations/quickbooks/batch-sync", data);
    },
    onSuccess: (data: any) => {
      toast({ title: "Batch Sync Started", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/sync-queue"] });
      setShowBatchSyncDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Batch Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdateSetting = (key: string, value: any) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = syncQueue?.filter(q => q.status === 'queued').length || 0;
  const failedCount = syncQueue?.filter(q => q.status === 'failed').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-qb-settings-title">QuickBooks Integration</h1>
        <p className="text-muted-foreground">Sync invoices and payments to QuickBooks</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              {settings?.isConnected ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-qb-connected">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" data-testid="badge-qb-disconnected">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>

            {settings?.realmId && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Realm ID</span>
                <span className="text-sm text-muted-foreground font-mono">{settings.realmId}</span>
              </div>
            )}

            {settings?.lastSyncAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Sync</span>
                <span className="text-sm text-muted-foreground">{formatDate(settings.lastSyncAt)}</span>
              </div>
            )}

            {settings?.connectionError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{settings.connectionError}</p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {settings?.isConnected ? (
              <Button 
                variant="destructive" 
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-qb"
              >
                {disconnectMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
                Disconnect
              </Button>
            ) : (
              <Button 
                onClick={() => setShowConnectDialog(true)}
                data-testid="button-connect-qb"
              >
                <Link className="w-4 h-4 mr-2" />
                Connect QuickBooks
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Sync Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pending</span>
              <Badge variant="secondary">{pendingCount}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Failed</span>
              <Badge variant={failedCount > 0 ? "destructive" : "secondary"}>{failedCount}</Badge>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => setShowBatchSyncDialog(true)}
              disabled={!settings?.isConnected}
              data-testid="button-batch-sync"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Batch Sync
            </Button>
          </CardFooter>
        </Card>
      </div>

      {settings?.isConnected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Account Mappings
              </CardTitle>
              <CardDescription>Map DriverHub accounts to QuickBooks accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="arAccountId">Accounts Receivable</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="arAccountId" 
                      placeholder="Account ID"
                      value={settings.arAccountId || ""}
                      onChange={(e) => handleUpdateSetting("arAccountId", e.target.value)}
                      data-testid="input-ar-account-id"
                    />
                    <Input 
                      placeholder="Account Name"
                      value={settings.arAccountName || ""}
                      onChange={(e) => handleUpdateSetting("arAccountName", e.target.value)}
                      data-testid="input-ar-account-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="incomeAccountId">Income Account</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="incomeAccountId"
                      placeholder="Account ID"
                      value={settings.incomeAccountId || ""}
                      onChange={(e) => handleUpdateSetting("incomeAccountId", e.target.value)}
                      data-testid="input-income-account-id"
                    />
                    <Input 
                      placeholder="Account Name"
                      value={settings.incomeAccountName || ""}
                      onChange={(e) => handleUpdateSetting("incomeAccountName", e.target.value)}
                      data-testid="input-income-account-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feeAccountId">Fee Account</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="feeAccountId"
                      placeholder="Account ID"
                      value={settings.feeAccountId || ""}
                      onChange={(e) => handleUpdateSetting("feeAccountId", e.target.value)}
                      data-testid="input-fee-account-id"
                    />
                    <Input 
                      placeholder="Account Name"
                      value={settings.feeAccountName || ""}
                      onChange={(e) => handleUpdateSetting("feeAccountName", e.target.value)}
                      data-testid="input-fee-account-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxAccountId">Tax Account</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="taxAccountId"
                      placeholder="Account ID"
                      value={settings.taxAccountId || ""}
                      onChange={(e) => handleUpdateSetting("taxAccountId", e.target.value)}
                      data-testid="input-tax-account-id"
                    />
                    <Input 
                      placeholder="Account Name"
                      value={settings.taxAccountName || ""}
                      onChange={(e) => handleUpdateSetting("taxAccountName", e.target.value)}
                      data-testid="input-tax-account-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="depositAccountId">Bank Deposit Account</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="depositAccountId"
                      placeholder="Account ID"
                      value={settings.depositAccountId || ""}
                      onChange={(e) => handleUpdateSetting("depositAccountId", e.target.value)}
                      data-testid="input-deposit-account-id"
                    />
                    <Input 
                      placeholder="Account Name"
                      value={settings.depositAccountName || ""}
                      onChange={(e) => handleUpdateSetting("depositAccountName", e.target.value)}
                      data-testid="input-deposit-account-name"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Sync Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="creditSyncMode">Credit Memo Sync Mode</Label>
                <Select 
                  value={settings.creditSyncMode || "credit_memo"}
                  onValueChange={(value) => handleUpdateSetting("creditSyncMode", value)}
                >
                  <SelectTrigger data-testid="select-credit-sync-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit_memo">Create Credit Memo</SelectItem>
                    <SelectItem value="negative_line">Negative Line Item</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose how credits and adjustments are synced to QuickBooks
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoSyncEnabled">Auto-Sync Enabled</Label>
                    <p className="text-xs text-muted-foreground">Automatically sync new items</p>
                  </div>
                  <Switch
                    id="autoSyncEnabled"
                    checked={settings.autoSyncEnabled || false}
                    onCheckedChange={(checked) => handleUpdateSetting("autoSyncEnabled", checked)}
                    data-testid="switch-auto-sync"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="syncInvoicesOnSend">Sync Invoices on Send</Label>
                    <p className="text-xs text-muted-foreground">Sync invoice when sent to customer</p>
                  </div>
                  <Switch
                    id="syncInvoicesOnSend"
                    checked={settings.syncInvoicesOnSend || false}
                    onCheckedChange={(checked) => handleUpdateSetting("syncInvoicesOnSend", checked)}
                    data-testid="switch-sync-on-send"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="syncPaymentsOnReceive">Sync Payments on Receive</Label>
                    <p className="text-xs text-muted-foreground">Sync payment when received</p>
                  </div>
                  <Switch
                    id="syncPaymentsOnReceive"
                    checked={settings.syncPaymentsOnReceive || false}
                    onCheckedChange={(checked) => handleUpdateSetting("syncPaymentsOnReceive", checked)}
                    data-testid="switch-sync-on-receive"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to QuickBooks</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="realmId">QuickBooks Realm ID (Company ID)</Label>
              <Input
                id="realmId"
                placeholder="Enter your QuickBooks Realm ID"
                value={realmId}
                onChange={(e) => setRealmId(e.target.value)}
                data-testid="input-realm-id"
              />
              <p className="text-xs text-muted-foreground">
                In production, you would be redirected to QuickBooks OAuth login
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={() => connectMutation.mutate({ realmId })}
              disabled={!realmId || connectMutation.isPending}
              data-testid="button-confirm-connect"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchSyncDialog} onOpenChange={setShowBatchSyncDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Sync to QuickBooks</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batchStartDate">Start Date</Label>
                <Input
                  id="batchStartDate"
                  type="date"
                  value={batchStartDate}
                  onChange={(e) => setBatchStartDate(e.target.value)}
                  data-testid="input-batch-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batchEndDate">End Date</Label>
                <Input
                  id="batchEndDate"
                  type="date"
                  value={batchEndDate}
                  onChange={(e) => setBatchEndDate(e.target.value)}
                  data-testid="input-batch-end-date"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This will queue all unsynced invoices and payments within the selected date range for sync to QuickBooks.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={() => batchSyncMutation.mutate({ 
                startDate: batchStartDate, 
                endDate: batchEndDate,
                entityTypes: ['invoice', 'payment']
              })}
              disabled={!batchStartDate || !batchEndDate || batchSyncMutation.isPending}
              data-testid="button-confirm-batch-sync"
            >
              {batchSyncMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Start Batch Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
