import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen, Plus, Pencil, ToggleLeft, AlertTriangle, CheckCircle2,
  Settings, Landmark, ArrowRight, Loader2, ToggleRight, RefreshCw,
} from "lucide-react";

const ACCOUNT_TYPES = ["Income", "COGS", "Expense", "AR", "AP", "Bank", "Equity"] as const;
type AccountType = typeof ACCOUNT_TYPES[number];

const TYPE_COLORS: Record<string, string> = {
  Income: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  COGS: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  AR: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  AP: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Bank: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  Equity: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const emptyAccountForm = { accountCode: "", accountName: "", accountType: "Expense" as AccountType, description: "" };

export default function AccountingAdmin() {
  const { toast } = useToast();

  // Chart of Accounts state
  const [accountDialog, setAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Settings state
  const [settingsForm, setSettingsForm] = useState<any>({
    suspenseIncomeAccountId: "",
    suspenseExpenseAccountId: "",
    requireMappingBeforeExport: false,
    routeUnmappedToSuspense: false,
    fiscalYearStart: "01-01",
    currency: "USD",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery<any[]>({
    queryKey: ["/api/finance/accounts"],
  });

  const { data: settings, isLoading: loadingSettings } = useQuery<any>({
    queryKey: ["/api/finance/accounting-settings"],
    onSuccess: (data: any) => {
      if (data && !settingsLoaded) {
        setSettingsForm({
          suspenseIncomeAccountId: data.suspenseIncomeAccountId || "",
          suspenseExpenseAccountId: data.suspenseExpenseAccountId || "",
          requireMappingBeforeExport: data.requireMappingBeforeExport || false,
          routeUnmappedToSuspense: data.routeUnmappedToSuspense || false,
          fiscalYearStart: data.fiscalYearStart || "01-01",
          currency: data.currency || "USD",
        });
        setSettingsLoaded(true);
      }
    },
  } as any);

  const createAccountMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/finance/accounts", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to create account"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts"] });
      setAccountDialog(false);
      setAccountForm(emptyAccountForm);
      setEditingAccount(null);
      toast({ title: "Account created" });
    },
    onError: (e: any) => toast({ title: "Failed to create account", description: e.message, variant: "destructive" }),
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/finance/accounts/${id}`, payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to update account"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts"] });
      setAccountDialog(false);
      setEditingAccount(null);
      setAccountForm(emptyAccountForm);
      toast({ title: "Account updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update account", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/finance/accounts/${id}`, { isActive });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to update"); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts"] }),
    onError: (e: any) => toast({ title: "Failed to update account", description: e.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("PATCH", "/api/finance/accounting-settings", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to save settings"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounting-settings"] });
      setSettingsLoaded(false);
      toast({ title: "Accounting settings saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save settings", description: e.message, variant: "destructive" }),
  });

  const openCreateDialog = () => {
    setEditingAccount(null);
    setAccountForm(emptyAccountForm);
    setAccountDialog(true);
  };

  const openEditDialog = (account: any) => {
    setEditingAccount(account);
    setAccountForm({
      accountCode: account.accountCode || "",
      accountName: account.accountName || "",
      accountType: account.accountType || "Expense",
      description: account.description || "",
    });
    setAccountDialog(true);
  };

  const submitAccountForm = () => {
    if (!accountForm.accountCode.trim() || !accountForm.accountName.trim()) {
      toast({ title: "Account code and name are required", variant: "destructive" });
      return;
    }
    if (editingAccount) {
      updateAccountMutation.mutate({ id: editingAccount.id, payload: accountForm });
    } else {
      createAccountMutation.mutate({ ...accountForm, isActive: true });
    }
  };

  const filteredAccounts = (accounts || []).filter((a: any) => {
    const matchesType = typeFilter === "all" || a.accountType === typeFilter;
    const matchesSearch = !searchQuery || 
      a.accountCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.accountName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const activeAccounts = (accounts || []).filter((a: any) => a.isActive !== false);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Accounting Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your chart of accounts and configure suspense routing and export enforcement.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>{activeAccounts.length} active accounts</span>
        </div>
      </div>

      <Tabs defaultValue="chart-of-accounts">
        <TabsList data-testid="tabs-accounting-admin">
          <TabsTrigger value="chart-of-accounts" data-testid="tab-chart-of-accounts">
            <Landmark className="mr-2 h-4 w-4" />
            Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-accounting-settings">
            <Settings className="mr-2 h-4 w-4" />
            Accounting Settings
          </TabsTrigger>
        </TabsList>

        {/* ── Chart of Accounts ─────────────────────────────────────────────── */}
        <TabsContent value="chart-of-accounts" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Chart of Accounts</CardTitle>
                  <CardDescription>
                    Define the accounts used across invoices, bills, and expense lines. No hardcoded accounts — all GL codes reference this registry.
                  </CardDescription>
                </div>
                <Button onClick={openCreateDialog} data-testid="btn-create-account">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48">
                  <Input
                    placeholder="Search by code or name…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    data-testid="input-account-search"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40" data-testid="select-account-type-filter">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => refetchAccounts()} data-testid="btn-refresh-accounts">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {loadingAccounts ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Landmark className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No accounts found</p>
                  <p className="text-sm mt-1">
                    {accounts.length === 0 ? "Add your first account to get started." : "Try adjusting your search or filter."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account: any) => (
                      <TableRow key={account.id} data-testid={`account-row-${account.id}`}>
                        <TableCell className="font-mono text-sm font-medium">{account.accountCode}</TableCell>
                        <TableCell className="font-medium">{account.accountName}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_COLORS[account.accountType] || "bg-muted text-muted-foreground"}`}>
                            {account.accountType}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {account.description || "—"}
                        </TableCell>
                        <TableCell>
                          {account.isActive !== false ? (
                            <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-400">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(account)}
                              data-testid={`btn-edit-account-${account.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActiveMutation.mutate({ id: account.id, isActive: !account.isActive })}
                              disabled={toggleActiveMutation.isPending}
                              data-testid={`btn-toggle-account-${account.id}`}
                              title={account.isActive !== false ? "Deactivate" : "Activate"}
                            >
                              {account.isActive !== false
                                ? <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                                : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Accounting Settings ───────────────────────────────────────────── */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          {loadingSettings ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Suspense Accounts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-amber-500" />
                    Suspense Accounts
                  </CardTitle>
                  <CardDescription>
                    Unmapped lines will route to these accounts when suspense routing is enabled. These must be set before enabling enforcement.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="suspense-income">Suspense Income Account</Label>
                      <Select
                        value={settingsForm.suspenseIncomeAccountId || "none"}
                        onValueChange={v => setSettingsForm((f: any) => ({ ...f, suspenseIncomeAccountId: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger id="suspense-income" data-testid="select-suspense-income">
                          <SelectValue placeholder="Select account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {activeAccounts
                            .filter((a: any) => ["Income", "AR"].includes(a.accountType))
                            .map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="suspense-expense">Suspense Expense Account</Label>
                      <Select
                        value={settingsForm.suspenseExpenseAccountId || "none"}
                        onValueChange={v => setSettingsForm((f: any) => ({ ...f, suspenseExpenseAccountId: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger id="suspense-expense" data-testid="select-suspense-expense">
                          <SelectValue placeholder="Select account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {activeAccounts
                            .filter((a: any) => ["Expense", "COGS", "AP"].includes(a.accountType))
                            .map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Enforcement Toggles */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Enforcement Settings
                  </CardTitle>
                  <CardDescription>
                    Control how unmapped lines are handled and whether exports are blocked when mappings are missing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Route unmapped lines to suspense</Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, invoice and bill lines without a GL account will automatically be assigned to the configured suspense account.
                      </p>
                    </div>
                    <Switch
                      checked={settingsForm.routeUnmappedToSuspense}
                      onCheckedChange={v => setSettingsForm((f: any) => ({ ...f, routeUnmappedToSuspense: v }))}
                      data-testid="switch-route-unmapped"
                    />
                  </div>

                  <Separator />

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Require mapping before export</Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, QuickBooks / accounting exports will be blocked if any lines are missing GL account mappings. A validation error will be shown at export time.
                      </p>
                    </div>
                    <Switch
                      checked={settingsForm.requireMappingBeforeExport}
                      onCheckedChange={v => setSettingsForm((f: any) => ({ ...f, requireMappingBeforeExport: v }))}
                      data-testid="switch-require-mapping"
                    />
                  </div>

                  {settingsForm.requireMappingBeforeExport && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Export enforcement is active. Any export with unmapped lines will be rejected with a validation error.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* General Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>General</CardTitle>
                  <CardDescription>Fiscal year and currency settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fiscal-year-start">Fiscal Year Start (MM-DD)</Label>
                      <Input
                        id="fiscal-year-start"
                        placeholder="01-01"
                        value={settingsForm.fiscalYearStart}
                        onChange={e => setSettingsForm((f: any) => ({ ...f, fiscalYearStart: e.target.value }))}
                        data-testid="input-fiscal-year-start"
                      />
                      <p className="text-xs text-muted-foreground">Format: MM-DD (e.g. 01-01 for January 1st)</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Default Currency</Label>
                      <Select
                        value={settingsForm.currency}
                        onValueChange={v => setSettingsForm((f: any) => ({ ...f, currency: v }))}
                      >
                        <SelectTrigger id="currency" data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD — US Dollar</SelectItem>
                          <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                          <SelectItem value="EUR">EUR — Euro</SelectItem>
                          <SelectItem value="GBP">GBP — British Pound</SelectItem>
                          <SelectItem value="MXN">MXN — Mexican Peso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveSettingsMutation.mutate({
                    ...settingsForm,
                    suspenseIncomeAccountId: settingsForm.suspenseIncomeAccountId || null,
                    suspenseExpenseAccountId: settingsForm.suspenseExpenseAccountId || null,
                  })}
                  disabled={saveSettingsMutation.isPending}
                  data-testid="btn-save-accounting-settings"
                >
                  {saveSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Account Dialog */}
      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent data-testid="dialog-account-form">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Update this account's details." : "Add a new account to your chart of accounts."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account-code" required>Account Code</Label>
                <Input
                  id="account-code"
                  placeholder="e.g. 4000"
                  value={accountForm.accountCode}
                  onChange={e => setAccountForm(f => ({ ...f, accountCode: e.target.value }))}
                  data-testid="input-account-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-type" required>Type</Label>
                <Select
                  value={accountForm.accountType}
                  onValueChange={v => setAccountForm(f => ({ ...f, accountType: v as AccountType }))}
                >
                  <SelectTrigger id="account-type" data-testid="select-form-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name" required>Account Name</Label>
              <Input
                id="account-name"
                placeholder="e.g. Sales Revenue"
                value={accountForm.accountName}
                onChange={e => setAccountForm(f => ({ ...f, accountName: e.target.value }))}
                data-testid="input-account-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-desc">Description</Label>
              <Input
                id="account-desc"
                placeholder="Optional description"
                value={accountForm.description}
                onChange={e => setAccountForm(f => ({ ...f, description: e.target.value }))}
                data-testid="input-account-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog(false)} data-testid="btn-cancel-account">
              Cancel
            </Button>
            <Button
              onClick={submitAccountForm}
              disabled={createAccountMutation.isPending || updateAccountMutation.isPending}
              data-testid="btn-submit-account"
            >
              {(createAccountMutation.isPending || updateAccountMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingAccount ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
