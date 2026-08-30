import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, Check, ChevronLeft, Loader2, Mail, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

type InternalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ClaimsControlsSettings = {
  newClaimEmailEnabled: boolean;
  recipients: InternalUser[];
};

function UserChip({ user, onRemove }: { user: InternalUser; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove} aria-label={`Remove ${user.name}`}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function ClaimsControls() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<ClaimsControlsSettings | null>(null);

  const settingsQuery = useQuery<ClaimsControlsSettings>({
    queryKey: ["/api/claims/controls"],
  });
  const usersQuery = useQuery<InternalUser[]>({
    queryKey: ["/api/claims/controls/users"],
  });

  const settings = draft ?? settingsQuery.data;
  const allUsers = usersQuery.data ?? [];
  const selectedIds = useMemo(() => new Set(settings?.recipients.map((user) => user.id) ?? []), [settings?.recipients]);
  const availableUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allUsers
      .filter((user) => !selectedIds.has(user.id))
      .filter((user) => !term || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [allUsers, search, selectedIds]);

  const updateDraft = (next: ClaimsControlsSettings) => setDraft(next);
  const saveMutation = useMutation({
    mutationFn: async (current: ClaimsControlsSettings) => {
      return apiRequest("PUT", "/api/claims/controls", {
        newClaimEmailEnabled: current.newClaimEmailEnabled,
        recipientUserIds: current.recipients.map((recipient) => recipient.id),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/claims/controls"] });
      setDraft(null);
      toast({ title: "Claims Controls saved", description: "New Claim email settings are now active." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save Claims Controls", description: error.message, variant: "destructive" });
    },
  });

  if (settingsQuery.isLoading || usersQuery.isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (settingsQuery.isError || usersQuery.isError || !settings) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Claims Controls unavailable</h1>
        <p className="text-sm text-muted-foreground">You may not have administrator access, or the settings could not be loaded.</p>
        <Link href="/claims/dashboard"><Button variant="outline">Back to Claims Dashboard</Button></Link>
      </div>
    );
  }

  const isDirty = draft !== null;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/claims/dashboard">
            <Button variant="ghost" size="icon" className="mt-0.5" aria-label="Back to Claims Dashboard"><ChevronLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <p className="text-sm text-muted-foreground">Claims / Controls</p>
            <h1 className="text-2xl font-semibold tracking-tight">Claims Controls</h1>
            <p className="mt-1 text-sm text-muted-foreground">Configure operational notifications without changing claim workflow.</p>
          </div>
        </div>
        <Button disabled={!isDirty || saveMutation.isPending} onClick={() => saveMutation.mutate(settings)}>
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Mail className="h-5 w-5" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base">New Claim Notification</CardTitle>
              <CardDescription className="mt-1">Send a shared email to selected internal users whenever a new claim is created.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="new-claim-email" className="text-sm font-medium">New Claim Notification</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">In-app notifications are not affected by this setting.</p>
            </div>
            <Switch
              id="new-claim-email"
              checked={settings.newClaimEmailEnabled}
              onCheckedChange={(enabled) => updateDraft({ ...settings, newClaimEmailEnabled: enabled })}
              data-testid="switch-new-claim-email"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-medium">Email Recipients</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Recipients are stored by their permanent DriverHub user ID.</p>
              </div>
              <Badge variant="secondary">{settings.recipients.length} selected</Badge>
            </div>

            {settings.newClaimEmailEnabled && settings.recipients.length === 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Configuration warning: New Claim Notification is enabled, but no recipients are selected. Claims will still be created and the missing email will be logged.</span>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {settings.recipients.map((user) => (
                <UserChip
                  key={user.id}
                  user={user}
                  onRemove={() => updateDraft({ ...settings, recipients: settings.recipients.filter((recipient) => recipient.id !== user.id) })}
                />
              ))}
            </div>
            {settings.recipients.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No internal recipients have been selected.</p>
            )}

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search internal users by name, email, or role" />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto">
                {availableUsers.length ? availableUsers.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      updateDraft({ ...settings, recipients: [...settings.recipients, user] });
                      setSearch("");
                    }}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-muted-foreground"><UserPlus className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{user.email}{user.role ? ` · ${user.role}` : ""}</span>
                    </span>
                  </button>
                )) : (
                  <p className="px-2 py-3 text-sm text-muted-foreground">{search ? "No matching internal users." : "All available internal users are selected."}</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}