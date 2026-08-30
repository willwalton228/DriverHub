import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, UserPlus, Trash2, Lock, Search, RefreshCw, AlertCircle,
  CheckCircle2, Eye, Download, Database, BarChart3, TrendingUp, Receipt, Package,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FinancePermRow {
  id: string;
  user_id: string;
  can_view_module: boolean;
  can_view_dashboard: boolean;
  can_view_revenue: boolean;
  can_view_expenses: boolean;
  can_view_margin: boolean;
  can_export: boolean;
  can_manage_qb_sync: boolean;
  can_manage_products: boolean;
  granted_at: string;
  updated_at: string;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_role: string | null;
  granted_by_email: string | null;
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface PermState {
  canViewModule:    boolean;
  canViewDashboard: boolean;
  canViewRevenue:   boolean;
  canViewExpenses:  boolean;
  canViewMargin:    boolean;
  canExport:        boolean;
  canManageQbSync:  boolean;
  canManageProducts: boolean;
}

const DEFAULT_PERMS: PermState = {
  canViewModule:    false,
  canViewDashboard: false,
  canViewRevenue:   false,
  canViewExpenses:  false,
  canViewMargin:    false,
  canExport:        false,
  canManageQbSync:  false,
  canManageProducts: false,
};

// ── Permission toggle defs ─────────────────────────────────────────────────────

const PERM_DEFS: Array<{ key: keyof PermState; label: string; description: string; icon: React.ReactNode; requires?: keyof PermState }> = [
  {
    key: "canViewModule",
    label: "Module Access",
    description: "Master switch — grants entry to the Finance module. Must be ON for any access.",
    icon: <Lock className="h-4 w-4 text-primary" />,
  },
  {
    key: "canViewDashboard",
    label: "Financial Dashboard",
    description: "View the Finance overview dashboard with KPIs and summary metrics.",
    icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
    requires: "canViewModule",
  },
  {
    key: "canViewRevenue",
    label: "Revenue Visibility",
    description: "Access revenue analytics, invoice trends, and AR aging data.",
    icon: <TrendingUp className="h-4 w-4 text-green-500" />,
    requires: "canViewModule",
  },
  {
    key: "canViewExpenses",
    label: "Expense / Payment Visibility",
    description: "Access expense reports, vendor spend, and QuickBooks AP transactions.",
    icon: <Receipt className="h-4 w-4 text-orange-500" />,
    requires: "canViewModule",
  },
  {
    key: "canViewMargin",
    label: "Margin / Profitability",
    description: "View margin analysis, move-level profitability, and cost structure data.",
    icon: <Eye className="h-4 w-4 text-purple-500" />,
    requires: "canViewModule",
  },
  {
    key: "canExport",
    label: "Export Permissions",
    description: "Download financial data as CSV, Excel, or PDF exports.",
    icon: <Download className="h-4 w-4 text-muted-foreground" />,
    requires: "canViewModule",
  },
  {
    key: "canManageQbSync",
    label: "QB Sync Management",
    description: "Run manual QuickBooks syncs, retry failed jobs, and resolve sync exceptions.",
    icon: <Database className="h-4 w-4 text-red-500" />,
    requires: "canViewModule",
  },
  {
    key: "canManageProducts",
    label: "Product Library Management",
    description: "Create, edit, and remove Product Library records, including operational flags.",
    icon: <Package className="h-4 w-4 text-indigo-500" />,
    requires: "canViewModule",
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinancePermissionsAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin } = usePermissions();
  const [search, setSearch] = useState("");
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [editPerms, setEditPerms] = useState<PermState>(DEFAULT_PERMS);

  const { data: grantedList, isLoading } = useQuery<FinancePermRow[]>({
    queryKey: ["/api/admin/finance-permissions"],
    queryFn: () => fetch("/api/admin/finance-permissions", { credentials: "include" }).then(r => r.json()),
  });

  const { data: allUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => fetch("/api/admin/users", { credentials: "include" }).then(r => r.json()),
  });

  const upsertMutation = useMutation({
    mutationFn: ({ userId, perms }: { userId: string; perms: PermState }) =>
      apiRequest("PUT", `/api/admin/finance-permissions/${userId}`, perms),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finance-permissions"] });
      toast({ title: "Finance permissions saved" });
      setGrantDialogOpen(false);
      setEditUserId(null);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/admin/finance-permissions/${userId}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finance-permissions"] });
      toast({ title: "Finance access revoked" });
    },
    onError: (e: any) => toast({ title: "Revoke failed", description: e?.message, variant: "destructive" }),
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Super Admin Only</h2>
        <p className="text-sm text-muted-foreground">Finance permission management requires Super Admin access.</p>
      </div>
    );
  }

  const grantedUserIds = new Set((grantedList ?? []).map(r => r.user_id));
  const eligibleUsers = (allUsers ?? []).filter(u =>
    u.role !== "super_user" &&
    !grantedUserIds.has(u.id)
  );

  const filtered = (grantedList ?? []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.user_email ?? "").toLowerCase().includes(q) ||
           (r.user_first_name ?? "").toLowerCase().includes(q) ||
           (r.user_last_name ?? "").toLowerCase().includes(q);
  });

  function openEdit(row: FinancePermRow) {
    setEditUserId(row.user_id);
    setEditPerms({
      canViewModule:    row.can_view_module,
      canViewDashboard: row.can_view_dashboard,
      canViewRevenue:   row.can_view_revenue,
      canViewExpenses:  row.can_view_expenses,
      canViewMargin:    row.can_view_margin,
      canExport:        row.can_export,
      canManageQbSync:  row.can_manage_qb_sync,
      canManageProducts: row.can_manage_products,
    });
    setGrantDialogOpen(true);
  }

  function openNew() {
    setEditUserId(null);
    setSelectedUserId("");
    setEditPerms(DEFAULT_PERMS);
    setGrantDialogOpen(true);
  }

  function togglePerm(key: keyof PermState, val: boolean) {
    setEditPerms(prev => {
      const next = { ...prev, [key]: val };
      // If turning off canViewModule, turn everything else off too
      if (key === "canViewModule" && !val) {
        return DEFAULT_PERMS;
      }
      // If turning on anything else, ensure canViewModule is on
      if (key !== "canViewModule" && val) {
        next.canViewModule = true;
      }
      return next;
    });
  }

  function handleSave() {
    const userId = editUserId ?? selectedUserId;
    if (!userId) return;
    upsertMutation.mutate({ userId, perms: editPerms });
  }

  const activeCount = (grantedList ?? []).filter(r => r.can_view_module).length;
  const revokedCount = (grantedList ?? []).filter(r => !r.can_view_module).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Finance Module Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Explicitly grant Finance access per user. No role inherits Finance access automatically.
          </p>
        </div>
        <Button onClick={openNew} data-testid="button-grant-access">
          <UserPlus className="h-4 w-4 mr-2" /> Grant Access
        </Button>
      </div>

      {/* Warning */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Sensitive financial data.</strong> Finance permissions are not inherited from any user role. Access must be manually granted per user by a Super Admin. Granting access to this module exposes revenue, expense, margin, and QuickBooks transaction data.
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Users with Access</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{isLoading ? "—" : activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Access Revoked / Suspended</p>
            <p className="text-2xl font-bold text-muted-foreground">{isLoading ? "—" : revokedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Pending Grant</p>
            <p className="text-2xl font-bold">{isLoading ? "—" : eligibleUsers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <div>
            <CardTitle className="text-base">Granted Users</CardTitle>
            <CardDescription className="text-xs">All users with an explicit Finance permission record</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48" data-testid="input-search-users" />
            </div>
            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/finance-permissions"] })}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Granted By</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    {search ? "No users match your search" : "No Finance permissions granted yet. Click \"Grant Access\" to add users."}
                  </TableCell>
                </TableRow>
              ) : filtered.map(row => {
                const name = [row.user_first_name, row.user_last_name].filter(Boolean).join(" ") || row.user_email || row.user_id;
                const permCount = [row.can_view_dashboard, row.can_view_revenue, row.can_view_expenses, row.can_view_margin, row.can_export, row.can_manage_qb_sync].filter(Boolean).length;
                return (
                  <TableRow key={row.user_id} data-testid={`perm-row-${row.user_id}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{name}</div>
                      <div className="text-xs text-muted-foreground">{row.user_email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{row.user_role ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.can_view_module
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" />Suspended</span>}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{permCount}</span>
                       <span className="text-xs text-muted-foreground"> / 7 sections</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.granted_by_email ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.updated_at ? formatDistanceToNow(parseISO(row.updated_at)) + " ago" : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)} data-testid={`button-edit-${row.user_id}`}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate(row.user_id)} disabled={revokeMutation.isPending} data-testid={`button-revoke-${row.user_id}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Grant / Edit Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {editUserId ? "Edit Finance Permissions" : "Grant Finance Access"}
            </DialogTitle>
          </DialogHeader>

          {!editUserId && (
            <div className="space-y-1.5">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger data-testid="select-user">
                  <SelectValue placeholder="Choose a user…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.length === 0 ? (
                    <SelectItem value="__none" disabled>All users already have Finance access</SelectItem>
                  ) : eligibleUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} — {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {editUserId && (() => {
            const row = (grantedList ?? []).find(r => r.user_id === editUserId);
            if (!row) return null;
            const name = [row.user_first_name, row.user_last_name].filter(Boolean).join(" ") || row.user_email;
            return (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{name}</span>
                {row.user_email && <span className="text-muted-foreground ml-2">{row.user_email}</span>}
              </div>
            );
          })()}

          {/* Permission toggles */}
          <div className="space-y-3 mt-1">
            {PERM_DEFS.map(def => {
              const isDisabled = def.requires ? !editPerms[def.requires] : false;
              return (
                <div key={def.key} className={`flex items-start justify-between gap-3 rounded-md p-2.5 ${editPerms[def.key] ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="mt-0.5 shrink-0">{def.icon}</span>
                    <div className="min-w-0">
                      <Label className="text-sm font-medium cursor-pointer leading-tight">{def.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{def.description}</p>
                      {def.requires && !editPerms[def.requires] && (
                        <p className="text-xs text-destructive mt-0.5">Requires Module Access to be enabled</p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={editPerms[def.key]}
                    onCheckedChange={val => togglePerm(def.key, val)}
                    disabled={isDisabled}
                    data-testid={`switch-${def.key}`}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setGrantDialogOpen(false); setEditUserId(null); }}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={upsertMutation.isPending || (!editUserId && !selectedUserId)}
              data-testid="button-save-perms"
            >
              {upsertMutation.isPending ? "Saving…" : editUserId ? "Save Changes" : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
