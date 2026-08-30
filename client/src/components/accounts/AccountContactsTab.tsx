import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Search, Edit, Archive, Phone, Mail, Star, CreditCard,
  MessageSquare, ChevronDown, Loader2, X, User, Building2,
  CheckCircle2, AlertCircle, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AccountContact } from "@shared/schema";

// ─── Phone formatter ──────────────────────────────────────────────────────────
function formatPhone(raw: string | null | undefined): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits; // partial entry — show just the digits so user can keep typing
}

const TIME_ZONES = [
  "Eastern (EST)",
  "Central (CST)",
  "Mountain (MST)",
  "Pacific (PST)",
  "Alaska (AST)",
  "Hawaii (HST)",
];

// ─── Contact form schema ──────────────────────────────────────────────────────
const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.string().optional(),
  department: z.string().optional(),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  primaryPhone: z.string().optional(),
  secondaryPhone: z.string().optional(),
  mobilePhone: z.string().optional(),
  extension: z.string().optional(),
  notes: z.string().optional(),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
  isCommunication: z.boolean().default(false),
  receivesScheduleEmails: z.boolean().default(false),
  receivesEscalations: z.boolean().default(false),
  receivesBilling: z.boolean().default(false),
  receivesServiceUpdates: z.boolean().default(false),
  preferredCommunicationMethod: z.string().optional(),
  timeZone: z.string().optional(),
  status: z.string().default("active"),
});
type ContactFormValues = z.infer<typeof contactFormSchema>;


// ─── Contact form dialog ──────────────────────────────────────────────────────
interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: string;
  existing?: AccountContact | null;
  onSuccess: () => void;
}

function ContactFormDialog({ open, onOpenChange, accountId, existing, onSuccess }: ContactFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: existing?.firstName ?? "",
      lastName: existing?.lastName ?? "",
      role: existing?.role ?? "",
      department: existing?.department ?? "",
      email: existing?.email ?? "",
      primaryPhone: formatPhone(existing?.primaryPhone),
      secondaryPhone: formatPhone(existing?.secondaryPhone),
      mobilePhone: formatPhone(existing?.mobilePhone),
      extension: existing?.extension ?? "",
      notes: existing?.notes ?? "",
      isPrimary: existing?.isPrimary ?? false,
      isBilling: existing?.isBilling ?? false,
      isCommunication: existing?.isCommunication ?? false,
      receivesScheduleEmails: existing?.receivesScheduleEmails ?? false,
      receivesEscalations: existing?.receivesEscalations ?? false,
      receivesBilling: existing?.receivesBilling ?? false,
      receivesServiceUpdates: existing?.receivesServiceUpdates ?? false,
      preferredCommunicationMethod: existing?.preferredCommunicationMethod ?? "",
      timeZone: existing?.timeZone ?? "",
      status: existing?.status ?? "active",
    },
  });

  // Re-hydrate the form whenever the dialog opens or the target contact changes
  useEffect(() => {
    if (open) {
      form.reset({
        firstName: existing?.firstName ?? "",
        lastName: existing?.lastName ?? "",
        role: existing?.role ?? "",
        department: existing?.department ?? "",
        email: existing?.email ?? "",
        primaryPhone: formatPhone(existing?.primaryPhone),
        secondaryPhone: formatPhone(existing?.secondaryPhone),
        mobilePhone: formatPhone(existing?.mobilePhone),
        extension: existing?.extension ?? "",
        notes: existing?.notes ?? "",
        isPrimary: existing?.isPrimary ?? false,
        isBilling: existing?.isBilling ?? false,
        isCommunication: existing?.isCommunication ?? false,
        receivesScheduleEmails: existing?.receivesScheduleEmails ?? false,
        receivesEscalations: existing?.receivesEscalations ?? false,
        receivesBilling: existing?.receivesBilling ?? false,
        receivesServiceUpdates: existing?.receivesServiceUpdates ?? false,
        preferredCommunicationMethod: existing?.preferredCommunicationMethod ?? "",
        timeZone: existing?.timeZone ?? "",
        status: existing?.status ?? "active",
      });
    }
  }, [open, existing?.id]);

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
  };

  const mutation = useMutation({
    mutationFn: async (values: ContactFormValues) => {
      if (isEdit && existing) {
        return apiRequest("PATCH", `/api/accounts/${accountId}/contacts/${existing.id}`, values);
      }
      return apiRequest("POST", `/api/accounts/${accountId}/contacts`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", accountId] });
      toast({ title: isEdit ? "Contact updated" : "Contact added", description: `${form.getValues("firstName")} ${form.getValues("lastName")} has been ${isEdit ? "updated" : "added"}.` });
      onOpenChange(false);
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save contact", variant: "destructive" });
    },
  });

  const onSubmit = (values: ContactFormValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-contact-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this contact's details and designations." : "Add a new contact to this account."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Core identity */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel required>First Name</FormLabel>
                  <FormControl><Input {...field} placeholder="First name" data-testid="input-contact-first-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel required>Last Name</FormLabel>
                  <FormControl><Input {...field} placeholder="Last name" data-testid="input-contact-last-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Title</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-contact-role">
                      <SelectValue placeholder="Select title…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dealer">Dealer</SelectItem>
                      <SelectItem value="General Manager">General Manager</SelectItem>
                      <SelectItem value="General Sales Manager">General Sales Manager</SelectItem>
                      <SelectItem value="Sales Manager">Sales Manager</SelectItem>
                      <SelectItem value="Pre-Owned Manager">Pre-Owned Manager</SelectItem>
                      <SelectItem value="Service Manager">Service Manager</SelectItem>
                      <SelectItem value="Service Director">Service Director</SelectItem>
                      <SelectItem value="Parts & Service Director">Parts &amp; Service Director</SelectItem>
                      <SelectItem value="Parts Manager">Parts Manager</SelectItem>
                      <SelectItem value="Billing / Accounting">Billing / Accounting</SelectItem>
                      <SelectItem value="Transportation Manager">Transportation Manager</SelectItem>
                      <SelectItem value="Customer Experience Manager">Customer Experience Manager</SelectItem>
                      <SelectItem value="Operations Manager">Operations Manager</SelectItem>
                      <SelectItem value="Rental Manager">Rental Manager</SelectItem>
                      <SelectItem value="Fleet Manager">Fleet Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Service" data-testid="input-contact-department" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Contact info */}
            <div className="pt-1 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact Information</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="email@example.com" data-testid="input-contact-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="primaryPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(555) 000-0000"
                        data-testid="input-contact-primary-phone"
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mobilePhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(555) 000-0000"
                        data-testid="input-contact-mobile"
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="secondaryPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secondary Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(555) 000-0000"
                        data-testid="input-contact-secondary-phone"
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="extension" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extension</FormLabel>
                    <FormControl><Input {...field} placeholder="ext. 100" data-testid="input-contact-extension" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="preferredCommunicationMethod" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Method</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-contact-preferred-method">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Designations */}
            <div className="pt-1 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Designations</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { name: "isPrimary" as const, label: "Primary Contact", icon: Star, desc: "Syncs to Company Details primary contact fields" },
                  { name: "isBilling" as const, label: "Billing Contact", icon: CreditCard, desc: "Syncs to Company Details billing contact fields" },
                  { name: "isCommunication" as const, label: "Communication Contact", icon: MessageSquare, desc: "Receives escalations, complaints, and operational alerts" },
                ]).map(({ name, label, icon: Icon, desc }) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border p-3">
                      <FormControl>
                        <Checkbox checked={!!field.value} onCheckedChange={field.onChange} data-testid={`checkbox-contact-${name}`} />
                      </FormControl>
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-1.5 cursor-pointer font-medium text-sm">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {label}
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>

            {/* Notification preferences */}
            <div className="pt-1 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notification Preferences</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { name: "receivesScheduleEmails" as const, label: "Schedule Emails" },
                  { name: "receivesEscalations" as const, label: "Escalations" },
                  { name: "receivesBilling" as const, label: "Billing" },
                  { name: "receivesServiceUpdates" as const, label: "Service Updates" },
                ]).map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={!!field.value} onCheckedChange={field.onChange} data-testid={`checkbox-contact-${name}`} />
                      </FormControl>
                      <FormLabel className="cursor-pointer font-normal text-sm">{label}</FormLabel>
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>

            {/* Status + notes */}
            <div className="grid grid-cols-2 gap-4 pt-1 border-t">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-contact-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="timeZone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Zone</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-contact-timezone">
                      <SelectValue placeholder="Select time zone…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_ZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Any additional notes about this contact…" rows={3} data-testid="textarea-contact-notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-contact-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-contact-save">
                {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : isEdit ? "Save Changes" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
          data-testid={`button-copy-${label ?? "value"}`}
        >
          {copied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? "Copied!" : `Copy ${label ?? "value"}`}</TooltipContent>
    </Tooltip>
  );
}

// ─── Designation cell ─────────────────────────────────────────────────────────
function DesignationCell({ contact }: { contact: AccountContact }) {
  const badges: { label: string; icon: React.ElementType; cls: string }[] = [];
  if (contact.isPrimary)      badges.push({ label: "Primary",  icon: Star,         cls: "bg-primary/10 text-primary border-primary/30" });
  if (contact.isBilling)      badges.push({ label: "Billing",  icon: CreditCard,   cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50" });
  if (contact.isCommunication)badges.push({ label: "Comms",    icon: MessageSquare,cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50" });
  if (badges.length === 0) return <span className="text-muted-foreground/50 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map(({ label, icon: Icon, cls }) => (
        <Badge key={label} variant="outline" className={cn("text-xs no-default-hover-elevate no-default-active-elevate", cls)}>
          <Icon className="h-2.5 w-2.5 mr-1" />{label}
        </Badge>
      ))}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
interface AccountContactsTabProps {
  accountId: string;
}

export function AccountContactsTab({ accountId }: AccountContactsTabProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountContact | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AccountContact | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Tracks inline status edits per contact: contactId → pending status value
  const [dirtyStatus, setDirtyStatus] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<{ contacts: AccountContact[] }>({
    queryKey: ["/api/accounts", accountId, "contacts"],
    queryFn: () => fetch(`/api/accounts/${accountId}/contacts`, { credentials: "include" }).then(r => r.json()),
  });

  const archiveMutation = useMutation({
    mutationFn: async (contactId: string) =>
      apiRequest("PATCH", `/api/accounts/${accountId}/contacts/${contactId}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", accountId] });
      toast({ title: "Contact archived", description: "The contact has been archived." });
      setArchiveTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to archive contact", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ contactId, status }: { contactId: string; status: string }) =>
      apiRequest("PATCH", `/api/accounts/${accountId}/contacts/${contactId}/status`, { status }),
    onSuccess: (_data, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "contacts"] });
      setDirtyStatus((prev) => { const next = { ...prev }; delete next[contactId]; return next; });
      toast({ title: "Status updated", description: "Contact status has been saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update status", variant: "destructive" });
    },
  });

  const allContacts = data?.contacts ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allContacts
      .filter((c) => {
        if (!showArchived && c.isArchived) return false;
        if (!q) return true;
        const hay = `${c.firstName} ${c.lastName} ${c.role ?? ""} ${c.department ?? ""} ${c.email ?? ""} ${c.primaryPhone ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        // 1. Designation rank: Primary=0, Billing=1, Comms=2, None=3
        const desigRank = (c: AccountContact) =>
          c.isPrimary ? 0 : c.isBilling ? 1 : c.isCommunication ? 2 : 3;
        const dDiff = desigRank(a) - desigRank(b);
        if (dDiff !== 0) return dDiff;
        // 2. Status: active before archived/inactive
        const aInactive = a.isArchived || a.status === "inactive" ? 1 : 0;
        const bInactive = b.isArchived || b.status === "inactive" ? 1 : 0;
        if (aInactive !== bInactive) return aInactive - bInactive;
        // 3. Alpha by lastName then firstName
        const last = (a.lastName || "").localeCompare(b.lastName || "");
        if (last !== 0) return last;
        return (a.firstName || "").localeCompare(b.firstName || "");
      });
  }, [allContacts, search, showArchived]);

  const primaryContact = allContacts.find((c) => c.isPrimary && !c.isArchived);
  const billingContact = allContacts.find((c) => c.isBilling && !c.isArchived);
  const communicationContact = allContacts.find((c) => c.isCommunication && !c.isArchived);
  const activeCount = allContacts.filter((c) => !c.isArchived).length;
  const archivedCount = allContacts.filter((c) => c.isArchived).length;

  const handleEdit = (c: AccountContact) => {
    setEditTarget(c);
    setFormOpen(true);
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="tab-content-contacts">

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Primary", contact: primaryContact, icon: Star, testId: "card-contacts-primary" },
            { label: "Billing", contact: billingContact, icon: CreditCard, testId: "card-contacts-billing" },
            { label: "Communications", contact: communicationContact, icon: MessageSquare, testId: "card-contacts-comms" },
          ].map(({ label, contact, icon: Icon, testId }) => (
            <Card key={label} data-testid={testId}>
              <CardContent className="p-3 flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {contact ? (
                    <p className="text-sm font-medium truncate">{contact.firstName || ""} {contact.lastName || ""}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Not designated</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-contacts-search"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        {archivedCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)} data-testid="button-toggle-archived">
            {showArchived ? "Hide Archived" : `Show Archived (${archivedCount})`}
          </Button>
        )}
        <Button size="sm" onClick={handleAddNew} data-testid="button-add-contact">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Contact
        </Button>
      </div>

      {/* ── Contacts table ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading contacts…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <User className="h-10 w-10 text-muted-foreground opacity-30" />
            <div>
              <p className="font-medium text-sm">
                {search ? "No contacts match your search" : "No contacts yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {search ? "Try a different search term" : "Add contacts to centralize communication for this account."}
              </p>
            </div>
            {!search && (
              <Button size="sm" onClick={handleAddNew} data-testid="button-add-first-contact">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add First Contact
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-contacts">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["First Name","Last Name","Status","Title","Email","Phone","Mobile","Designation","Preferred Method",""].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => {
                  const isInactive = contact.isArchived || contact.status === "inactive";
                  const preferredLabel: Record<string, string> = { email: "Email", phone: "Phone", text: "Text" };
                  return (
                    <tr
                      key={contact.id}
                      className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors", isInactive && "opacity-50")}
                      data-testid={`row-contact-${contact.id}`}
                    >
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" data-testid={`cell-first-${contact.id}`}>
                        {contact.firstName || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" data-testid={`cell-last-${contact.id}`}>
                        {contact.lastName || "—"}
                      </td>
                      <td className="px-3 py-2" data-testid={`cell-status-${contact.id}`}>
                        <Select
                          value={dirtyStatus[contact.id] ?? contact.status ?? "active"}
                          onValueChange={(v) => setDirtyStatus((prev) => ({ ...prev, [contact.id]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs w-[100px]" data-testid={`select-status-${contact.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {contact.role || "—"}
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        {contact.email
                          ? <div className="flex items-center gap-1 min-w-0">
                              <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                              <CopyButton value={contact.email} label="email" />
                            </div>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {contact.primaryPhone
                          ? <div className="flex items-center gap-1">
                              <a href={`tel:${contact.primaryPhone}`} className="hover:text-foreground transition-colors">
                                {formatPhone(contact.primaryPhone)}{contact.extension ? ` x${contact.extension}` : ""}
                              </a>
                              <CopyButton value={formatPhone(contact.primaryPhone) + (contact.extension ? ` x${contact.extension}` : "")} label="phone" />
                            </div>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {contact.mobilePhone
                          ? <div className="flex items-center gap-1">
                              <a href={`tel:${contact.mobilePhone}`} className="hover:text-foreground transition-colors">{formatPhone(contact.mobilePhone)}</a>
                              <CopyButton value={formatPhone(contact.mobilePhone)} label="mobile" />
                            </div>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <DesignationCell contact={contact} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {contact.preferredCommunicationMethod
                          ? preferredLabel[contact.preferredCommunicationMethod] ?? contact.preferredCommunicationMethod
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-0.5">
                          {dirtyStatus[contact.id] && dirtyStatus[contact.id] !== contact.status && (
                            <Button
                              size="sm"
                              onClick={() => statusMutation.mutate({ contactId: contact.id, status: dirtyStatus[contact.id] })}
                              disabled={statusMutation.isPending}
                              data-testid={`button-save-status-${contact.id}`}
                            >
                              {statusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(contact)} data-testid={`button-edit-contact-${contact.id}`}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit contact</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setArchiveTarget(contact)} data-testid={`button-archive-contact-${contact.id}`}>
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Archive contact</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Count footer */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground text-right" data-testid="text-contacts-count">
          {activeCount} active contact{activeCount !== 1 ? "s" : ""}
          {archivedCount > 0 ? ` · ${archivedCount} archived` : ""}
        </p>
      )}

      {/* ── Add / Edit dialog ──────────────────────────────────────────── */}
      <ContactFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditTarget(null); }}
        accountId={accountId}
        existing={editTarget}
        onSuccess={() => setEditTarget(null)}
      />

      {/* ── Archive confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
        <AlertDialogContent data-testid="dialog-archive-contact">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget && `${archiveTarget.firstName} ${archiveTarget.lastName} will be archived and hidden from the active contacts list. You can restore them later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-archive-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
              data-testid="button-archive-confirm"
            >
              {archiveMutation.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
