import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  "Claims", "Recruiting", "Drivers", "Scheduling", "Invoicing",
  "Payroll", "Vendors", "Accounts", "System",
];

interface EmailAccount {
  id: string;
  display_name: string;
  email_address: string;
  reply_to_address: string | null;
  signature: string | null;
  is_active: boolean;
  allowed_modules: string[];
  created_at: string;
  updated_at: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const accountSchema = z.object({
  display_name: z.string().min(1, "Display name is required"),
  email_address: z.string().email("Must be a valid email"),
  reply_to_address: z.string().email("Must be a valid email").or(z.literal("")).optional(),
  signature: z.string().optional(),
  is_active: z.boolean().default(true),
  allowed_modules: z.array(z.string()).default([]),
});
type AccountForm = z.infer<typeof accountSchema>;

// ── Account Form Dialog ───────────────────────────────────────────────────────

function AccountDialog({
  open, onClose, account,
}: { open: boolean; onClose: () => void; account?: EmailAccount }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!account;

  const form = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      display_name: account?.display_name ?? "",
      email_address: account?.email_address ?? "",
      reply_to_address: account?.reply_to_address ?? "",
      signature: account?.signature ?? "",
      is_active: account?.is_active ?? true,
      allowed_modules: account?.allowed_modules ?? [],
    },
  });

  const mutation = useMutation({
    mutationFn: (data: AccountForm) =>
      isEdit
        ? apiRequest("PATCH", `/api/admin/comm-email-accounts/${account!.id}`, data)
        : apiRequest("POST", "/api/admin/comm-email-accounts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/comm-email-accounts"] });
      toast({ title: isEdit ? "Account updated" : "Account created" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save account", variant: "destructive" });
    },
  });

  const modules = form.watch("allowed_modules");
  const toggleModule = (mod: string) => {
    const cur = form.getValues("allowed_modules");
    form.setValue(
      "allowed_modules",
      cur.includes(mod) ? cur.filter(m => m !== mod) : [...cur, mod]
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Email Account" : "New Email Account"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Display Name <span className="text-destructive">*</span></Label>
              <Input {...form.register("display_name")} placeholder="Reports Team"
                data-testid="input-display-name" />
              {form.formState.errors.display_name && (
                <p className="text-xs text-destructive">{form.formState.errors.display_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Email Address <span className="text-destructive">*</span></Label>
              <Input {...form.register("email_address")} placeholder="reports@company.com"
                data-testid="input-email-address" />
              {form.formState.errors.email_address && (
                <p className="text-xs text-destructive">{form.formState.errors.email_address.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reply-To Address</Label>
            <Input {...form.register("reply_to_address")} placeholder="noreply@company.com (optional)"
              data-testid="input-reply-to" />
            {form.formState.errors.reply_to_address && (
              <p className="text-xs text-destructive">{form.formState.errors.reply_to_address.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Email Signature</Label>
            <Textarea {...form.register("signature")} rows={3}
              placeholder="Optional HTML or plain-text signature appended to outgoing emails."
              data-testid="textarea-signature" />
          </div>

          <div className="space-y-2">
            <Label>Allowed Modules</Label>
            <div className="grid grid-cols-3 gap-2">
              {ALL_MODULES.map(mod => (
                <label key={mod} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={modules.includes(mod)}
                    onCheckedChange={() => toggleModule(mod)}
                    data-testid={`checkbox-module-${mod.toLowerCase()}`}
                  />
                  <span className="text-sm">{mod}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave all unchecked to allow use in any module.</p>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.watch("is_active")}
              onCheckedChange={v => form.setValue("is_active", v)}
              data-testid="switch-is-active"
            />
            <Label>Active</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-account">
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteDialog({ open, onClose, account }: {
  open: boolean; onClose: () => void; account?: EmailAccount;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/comm-email-accounts/${account!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/comm-email-accounts"] });
      toast({ title: "Account removed" });
      onClose();
    },
    onError: () => toast({ title: "Failed to remove account", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Email Account</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove <strong>{account?.display_name}</strong> ({account?.email_address})?
          Automations using this account will fall back to the system default sender.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}
            data-testid="button-confirm-delete">
            {mutation.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function EmailAccountsView() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailAccount | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<EmailAccount | undefined>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: accounts = [], isLoading, error, refetch } = useQuery<EmailAccount[]>({
    queryKey: ["/api/admin/comm-email-accounts"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiRequest("PATCH", `/api/admin/comm-email-accounts/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/comm-email-accounts"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Failed to load email accounts.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Email Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centrally manage sender identities used across all communication automations.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-email-account">
          <Plus className="w-4 h-4 mr-1.5" />
          New Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No email accounts configured</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Add a sender account to use in communication automations.
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Reply-To</TableHead>
                  <TableHead>Allowed Modules</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(acct => (
                  <TableRow key={acct.id} data-testid={`row-email-account-${acct.id}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{acct.display_name}</div>
                      {acct.signature && (
                        <div className="text-xs text-muted-foreground mt-0.5">Has signature</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{acct.email_address}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {acct.reply_to_address || "—"}
                    </TableCell>
                    <TableCell>
                      {acct.allowed_modules.length === 0 ? (
                        <Badge variant="secondary" className="text-xs">All modules</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {acct.allowed_modules.slice(0, 3).map(m => (
                            <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                          ))}
                          {acct.allowed_modules.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{acct.allowed_modules.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={acct.is_active}
                          onCheckedChange={v => toggleMutation.mutate({ id: acct.id, is_active: v })}
                          data-testid={`toggle-account-${acct.id}`}
                        />
                        {acct.is_active
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : <XCircle className="w-4 h-4 text-muted-foreground" />
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditTarget(acct)}
                          data-testid={`button-edit-account-${acct.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(acct)}
                          data-testid={`button-delete-account-${acct.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AccountDialog
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(undefined); }}
        account={editTarget}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(undefined)}
        account={deleteTarget}
      />
    </div>
  );
}
