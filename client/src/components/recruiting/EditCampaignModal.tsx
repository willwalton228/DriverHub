import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { CERT_LIAISON_VALUES, employmentTypeOptions } from "@shared/schema";

// ── Field label maps ──────────────────────────────────────────────────────────

// Approved campaign types — must match the Recruiting Request Form exactly.
const CAMPAIGN_TYPES = [
  { value: "launch",  label: "Launch" },
  { value: "service", label: "Service" },
  { value: "sales",   label: "Sales" },
  { value: "auction", label: "Auction" },
];
// Approved urgency options — must match the Recruiting Request Form exactly.
// Stored as integers: 5 = Critical, 3 = Normal, 1 = Maintenance / Back Up Role.
const URGENCY_OPTIONS = [
  { value: "5", label: "Critical" },
  { value: "3", label: "Normal" },
  { value: "1", label: "Maintenance / Back Up Role" },
];
const DRIVER_CLASSIFICATIONS = ["Employee", "Independent Contractor"];
const VEHICLE_LICENSE_OPTIONS = [
  "Passenger Vehicle", "Shuttle Van", "Cargo Van / Sprinter",
  "Box Truck", "Flatbed", "CDL-A", "CDL-B", "Other",
];
const DRIVER_TYPE_OPTIONS = ["DriverDash", "DriverShift", "Hybrid"];
// "Completed" removed per DH-002085. "filled" also removed — it previously displayed as
// "Completed" and is no longer a valid selectable value. Existing filled requisitions are
// display-only; new status changes should use "closed".
const REQUISITION_STATUSES = [
  { value: "draft",      label: "Draft" },
  { value: "open",       label: "Active" },
  { value: "on_hold",    label: "Paused" },
  { value: "cancelled",  label: "Cancelled" },
  { value: "closed",     label: "Closed" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditCampaignModalProps {
  campaign: any;
  open: boolean;
  onClose: () => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  try { return value.slice(0, 10); } catch { return ""; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditCampaignModal({ campaign, open, onClose }: EditCampaignModalProps) {
  const { toast } = useToast();

  const [form, setForm] = useState({
    dealershipName:       "",
    location:             "",
    campaignType:         "",
    urgency:              "",
    address:              "",
    city:                 "",
    state:                "",
    zipCode:              "",
    driverClassification: "",
    vehicleLicenseClass:  "",
    programType:          "",
    employmentType:       "",
    targetDriverCount:    "",
    payRate:              "",
    campaignStartDate:    "",
    targetDate:           "",
    recruiter:            "",
    certLiaison:          "",
    driverSchedule:       "",
    additionalComments:   "",
    campaignStatus:       "",
  });

  // Always refresh the authoritative campaign record when editing. The list row
  // is useful for immediate rendering, but must not be the source for editable dates.
  const { data: campaignDetail } = useQuery<any>({
    queryKey: ["/api/recruiting/requests", campaign?.id],
    queryFn: async () => {
      const response = await fetch(`/api/recruiting/requests/${campaign?.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load campaign details");
      return response.json();
    },
    enabled: open && !!campaign?.id,
    staleTime: 0,
  });

  const authoritativeStartDate = campaignDetail?.campaignStartDate ?? campaign?.campaignStartDate;

  // Whether the address was auto-hydrated from the linked account (not manually entered)
  const [addressSource, setAddressSource] = useState<"account" | "campaign" | "manual" | null>(null);

  // Fetch the linked account to get its address.
  // Works when accountId is present OR when only dealershipName is available.
  const accountId   = campaign?.accountId;
  const acctName    = campaign?.dealershipName || "";
  const acctLookupKey = accountId || acctName;
  const {
    data: accountData,
    isFetching: accountFetching,
    isError: accountError,
    refetch: refetchAccount,
  } = useQuery<any>({
    queryKey: ["/api/accounts/search", acctLookupKey],
    queryFn: async () => {
      if (!acctLookupKey) return null;
      const res = await fetch(
        `/api/accounts/search?q=${encodeURIComponent(acctName)}&limit=500`,
        { credentials: "include" }
      );
       if (!res.ok) throw new Error("Unable to load account discovery data.");
      const rows: any[] = await res.json();
      // Exact id match first, fall back to first name match
      if (accountId) return rows.find((r) => r.id === accountId) ?? rows[0] ?? null;
      return rows[0] ?? null;
    },
    enabled: !!(acctLookupKey) && open,
    staleTime: 60_000,
  });

  // Hydrate form whenever dialog opens or campaign changes
  useEffect(() => {
    if (!campaign || !open) return;

    const campaignHasAddress = !!(campaign.address || campaign.city || campaign.state || campaign.zipCode);

    setForm({
      dealershipName:       campaign.dealershipName     || "",
      location:             campaign.location           || "",
      campaignType:         campaign.campaignType       || "",
      urgency:              campaign.urgency != null ? String(campaign.urgency) : "",
      address:              campaign.address            || "",
      city:                 campaign.city               || "",
      state:                campaign.state              || "",
      zipCode:              campaign.zipCode            || "",
      driverClassification: campaign.driverClassification || "",
      vehicleLicenseClass:  campaign.vehicleLicenseClass || "",
      programType:          campaign.programType || campaign.driverType || "",
      employmentType:       campaign.employmentType      || "",
      targetDriverCount:    campaign.targetDriverCount != null ? String(campaign.targetDriverCount) : "",
      payRate:              campaign.payRate != null ? String(campaign.payRate) : "",
      campaignStartDate:    toDateInputValue(authoritativeStartDate),
      targetDate:           toDateInputValue(campaign.targetDate),
      recruiter:            campaign.recruiter          || "",
      certLiaison:          campaign.certLiaison === "Lisa Wickers"
        ? "Lisa Parkhurst"
        : campaign.certLiaison || "",
      driverSchedule:       campaign.driverSchedule     || "",
      additionalComments:   campaign.additionalComments || "",
      campaignStatus:       campaign.requestStatus      || "",
    });

    setAddressSource(campaignHasAddress ? "campaign" : null);
  }, [campaign?.id, campaign?.campaignStartDate, authoritativeStartDate, open]);

  // Once account data loads, hydrate address if campaign address was blank
  useEffect(() => {
    if (!open || !accountData) return;
    const campaignHasAddress = !!(campaign?.address || campaign?.city || campaign?.state || campaign?.zipCode);
    if (campaignHasAddress) return; // Campaign already has address saved — don't overwrite

    const acctHasAddress = !!(accountData.address || accountData.city || accountData.state || accountData.zip);
    if (!acctHasAddress) return; // Account also has no address — nothing to hydrate

    setForm((prev) => ({
      ...prev,
      address: accountData.address || prev.address,
      city:    accountData.city    || prev.city,
      state:   accountData.state   || prev.state,
      zipCode: accountData.zip     || prev.zipCode,
    }));
    setAddressSource("account");
  }, [accountData, open]);

  // Re-hydrate from account on demand (user clicks "Refresh from Account")
  function refreshAddressFromAccount() {
    if (!accountData) return;
    setForm((prev) => ({
      ...prev,
      address: accountData.address || "",
      city:    accountData.city    || "",
      state:   accountData.state   || "",
      zipCode: accountData.zip     || "",
    }));
    setAddressSource("account");
  }

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/recruiting/requests/${campaign?.id}/details`, payload)
        .then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaign?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests/pending"] });
      toast({ title: "Campaign updated", description: "Changes have been saved successfully." });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // If user manually edits an address field, mark it as manual
    if (["address", "city", "state", "zipCode"].includes(field)) {
      setAddressSource("manual");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      dealershipName:       form.dealershipName.trim()       || null,
      location:             form.location.trim()             || null,
      campaignType:         form.campaignType                || null,
      urgency:              form.urgency ? parseInt(form.urgency, 10) : null,
      address:              form.address.trim()              || null,
      city:                 form.city.trim()                 || null,
      state:                form.state.trim()                || null,
      zipCode:              form.zipCode.trim()              || null,
      driverClassification: form.driverClassification.trim() || null,
      vehicleLicenseClass:  form.vehicleLicenseClass.trim()  || null,
      programType:          form.programType.trim()          || null,
      employmentType:       form.employmentType.trim()       || null,
      targetDriverCount:    form.targetDriverCount ? parseInt(form.targetDriverCount, 10) : null,
      payRate:              form.payRate ? parseFloat(form.payRate) : null,
      targetDate:           form.targetDate                  || null,
      recruiter:            form.recruiter.trim()            || null,
      certLiaison:          form.certLiaison.trim()          || null,
      driverSchedule:       form.driverSchedule.trim()       || null,
      additionalComments:   form.additionalComments.trim()   || null,
    };

    if (campaign?.campaignRequisitionId && form.campaignStatus) {
      payload.campaignStatus = form.campaignStatus;
    }

    mutation.mutate(payload);
  }

  if (!campaign) return null;

  const hasLinkedRequisition = !!campaign.campaignRequisitionId;
  const accountHasAddress = !!(accountData?.address || accountData?.city || accountData?.state || accountData?.zip);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary shrink-0" />
            Edit Campaign
          </DialogTitle>
          <DialogDescription>
            Update campaign details below. Submission history and approval records are not editable.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">

          {/* ── Campaign Overview ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Overview</p>

            {/* Linked account read-only indicator */}
            {campaign.dealershipName && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{campaign.dealershipName}</span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">Linked Account</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ec-dealership">Dealership / Account</Label>
                <Input
                  id="ec-dealership"
                  data-testid="input-edit-campaign-dealership"
                  placeholder="Account or dealership name"
                  value={form.dealershipName}
                  onChange={(e) => set("dealershipName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-location">Campaign Label / Location</Label>
                <Input
                  id="ec-location"
                  data-testid="input-edit-campaign-location"
                  placeholder="e.g. Phoenix — Q3 Launch"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-campaign-type">Campaign Type</Label>
                <Select value={form.campaignType} onValueChange={(v) => set("campaignType", v)}>
                  <SelectTrigger id="ec-campaign-type" data-testid="select-edit-campaign-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-urgency">Urgency</Label>
                <Select value={form.urgency} onValueChange={(v) => set("urgency", v)}>
                  <SelectTrigger id="ec-urgency" data-testid="select-edit-campaign-urgency">
                    <SelectValue placeholder="Select urgency…" />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Account Address ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Address</p>
              <div className="flex items-center gap-2">
                {accountFetching && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading account…
                  </span>
                )}
                {accountError && !accountFetching && (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    Account unavailable
                    <button type="button" className="underline font-medium" onClick={() => refetchAccount()}>
                      Retry
                    </button>
                  </span>
                )}
                {addressSource === "account" && !accountFetching && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                    Auto-filled from account
                  </span>
                )}
                {accountHasAddress && accountData && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={refreshAddressFromAccount}
                    data-testid="btn-refresh-address-from-account"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Use Account Address
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ec-address">Street</Label>
                <Input
                  id="ec-address"
                  data-testid="input-edit-campaign-address"
                  placeholder="123 Main St"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-city">City</Label>
                <Input
                  id="ec-city"
                  data-testid="input-edit-campaign-city"
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ec-state">State</Label>
                  <Input
                    id="ec-state"
                    data-testid="input-edit-campaign-state"
                    placeholder="ST"
                    value={form.state}
                    onChange={(e) => set("state", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ec-zip">ZIP</Label>
                  <Input
                    id="ec-zip"
                    data-testid="input-edit-campaign-zip"
                    placeholder="00000"
                    value={form.zipCode}
                    onChange={(e) => set("zipCode", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Driver Requirements ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Driver Requirements</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ec-driver-class">Driver Classification</Label>
                <Select value={form.driverClassification} onValueChange={(v) => set("driverClassification", v)}>
                  <SelectTrigger id="ec-driver-class" data-testid="select-edit-driver-classification">
                    <SelectValue placeholder="Select classification…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DRIVER_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-driver-type">Driver Type</Label>
                <Select value={form.programType} onValueChange={(v) => set("programType", v)}>
                  <SelectTrigger id="ec-driver-type" data-testid="select-edit-driver-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DRIVER_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-vehicle-license">Vehicle / License Class</Label>
                <Select value={form.vehicleLicenseClass} onValueChange={(v) => set("vehicleLicenseClass", v)}>
                  <SelectTrigger id="ec-vehicle-license" data-testid="select-edit-vehicle-license-class">
                    <SelectValue placeholder="Select class…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_LICENSE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-employment-type">Employment Type</Label>
                <Select value={form.employmentType} onValueChange={(v) => set("employmentType", v)}>
                  <SelectTrigger id="ec-employment-type" data-testid="select-edit-employment-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employmentTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-target-drivers">Target # of Drivers</Label>
                <Input
                  id="ec-target-drivers"
                  type="number"
                  min={1}
                  data-testid="input-edit-target-drivers"
                  placeholder="e.g. 10"
                  value={form.targetDriverCount}
                  onChange={(e) => set("targetDriverCount", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-pay-rate">Driver Pay Rate</Label>
                <Input
                  id="ec-pay-rate"
                  type="number"
                  step="0.01"
                  min={0}
                  data-testid="input-edit-pay-rate"
                  placeholder="e.g. 18.50"
                  value={form.payRate}
                  onChange={(e) => set("payRate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ec-driver-schedule">Driver Schedule</Label>
                <Input
                  id="ec-driver-schedule"
                  data-testid="input-edit-driver-schedule"
                  placeholder="e.g. Mon–Fri 6am–2pm, Weekends optional"
                  value={form.driverSchedule}
                  onChange={(e) => set("driverSchedule", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Dates & Assignment ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dates &amp; Assignment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ec-start-date">Campaign Start Date (Approval Date)</Label>
                <Input
                  id="ec-start-date"
                  type="date"
                  data-testid="input-edit-start-date"
                  value={form.campaignStartDate}
                  disabled
                />
                <p className="text-xs text-muted-foreground">Set automatically when the Recruiting Request is approved.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-target-date">Target Completion Date</Label>
                <Input
                  id="ec-target-date"
                  type="date"
                  data-testid="input-edit-target-date"
                  value={form.targetDate}
                  onChange={(e) => set("targetDate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-recruiter">Recruiter</Label>
                <Input
                  id="ec-recruiter"
                  data-testid="input-edit-recruiter"
                  placeholder="Recruiter name"
                  value={form.recruiter}
                  onChange={(e) => set("recruiter", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-cert-liaison">Cert Liaison</Label>
                <Select
                  value={form.certLiaison}
                  onValueChange={(value) => set("certLiaison", value)}
                >
                  <SelectTrigger id="ec-cert-liaison" data-testid="select-edit-cert-liaison">
                    <SelectValue placeholder="Select liaison…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CERT_LIAISON_VALUES.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasLinkedRequisition && (
                <div className="space-y-1.5">
                  <Label htmlFor="ec-status">Campaign Status</Label>
                  <Select value={form.campaignStatus} onValueChange={(v) => set("campaignStatus", v)}>
                    <SelectTrigger id="ec-status" data-testid="select-edit-campaign-status">
                      <SelectValue placeholder="Select status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUISITION_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Additional Comments ── */}
          <div className="space-y-1.5">
            <Label htmlFor="ec-comments">Additional Comments</Label>
            <Textarea
              id="ec-comments"
              data-testid="textarea-edit-comments"
              placeholder="Any additional notes or context for this campaign…"
              className="min-h-[80px]"
              value={form.additionalComments}
              onChange={(e) => set("additionalComments", e.target.value)}
            />
          </div>

          {/* ── Audit-protected notice ── */}
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            Original submission and approval records are preserved and cannot be changed.
          </p>

          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
              data-testid="btn-edit-campaign-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-testid="btn-edit-campaign-save"
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
