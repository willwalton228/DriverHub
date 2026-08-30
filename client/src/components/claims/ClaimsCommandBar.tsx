import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CommandBar,
  CommandBarView,
  CommandBarSortOption,
  CommandBarMenuItem,
} from "@/components/CommandBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { Shield, ShieldCheck, FileUp, LayoutDashboard } from "lucide-react";
import type { DriverWithUser, Customer } from "@shared/schema";

const CLAIM_VIEWS: CommandBarView[] = [
  { value: "active", label: "Active Claims" },
  { value: "all",    label: "All Claims" },
  { value: "NEEDS_EVIDENCE", label: "Needs Attention" },
  { value: "CLOSED", label: "Closed Claims" },
];

/** All status values surfaced in the Status primary filter.
 *  Grouped: workflow stages first, then resolution outcomes, then legacy. */
export const CLAIM_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  // Canonical workflow stages (claimStatus field)
  { value: "DRAFT",                label: "Draft" },
  { value: "IN_REVIEW",            label: "In Review" },
  { value: "READY_FOR_SUBMISSION", label: "Ready for Submission" },
  { value: "SUBMITTED",            label: "Submitted" },
  { value: "CLOSED",               label: "Closed" },
  // Resolution outcomes (accident.status field)
  { value: "pending",              label: "Pending" },
  { value: "denied",               label: "Denied" },
  { value: "denied_abandoned",     label: "Denied / Abandoned" },
  { value: "abandoned",            label: "Abandoned" },
  { value: "driver_paid",          label: "Driver Paid" },
  { value: "dod_paid",             label: "DoD Paid" },
  { value: "insurance_paid",       label: "Insurance Paid" },
  { value: "paid_other_insurance", label: "Paid — Other Insurance" },
  { value: "paid_jri",             label: "Paid — JRI" },
  // Legacy lifecycle values
  { value: "APPROVED",                  label: "Approved" },
  { value: "DENIED",                    label: "Denied (Legacy)" },
  { value: "PAID",                      label: "Paid" },
  { value: "UNDER_REVIEW",             label: "Under Review" },
  { value: "ADDITIONAL_INFO_REQUESTED", label: "Info Requested" },
  { value: "SENT_TO_CARRIER",           label: "Sent to Carrier" },
];

const SORT_OPTIONS: CommandBarSortOption[] = [
  { value: "incidentDate:desc", label: "Incident Date (Newest First)" },
  { value: "incidentDate:asc",  label: "Incident Date (Oldest First)" },
  { value: "claimStatus:asc",   label: "Status (A → Z)" },
  { value: "incidentType:asc",  label: "Incident Type (A → Z)" },
];

interface ClaimsCommandBarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  // View selector (Active Claims / All Claims / etc.)
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  // Primary Status filter (specific claim status value)
  claimStatusValueFilter: string;
  onClaimStatusValueChange: (v: string) => void;
  // Filters
  customerFilter: string;
  onCustomerFilterChange: (v: string) => void;
  driverFilter: string;
  onDriverFilterChange: (v: string) => void;
  legalHoldFilter: string;
  onLegalHoldFilterChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  // Sort
  sortField: string | null;
  sortDir: "asc" | "desc";
  onSortChange: (field: string | null, dir: "asc" | "desc") => void;
  // Filter meta
  activeFilterCount: number;
  onClearFilters: () => void;
  // Data
  drivers: DriverWithUser[];
  customers: Customer[];
  claimCount: number;
  // Carrier mode
  carrierMode: boolean;
  onToggleCarrier: () => void;
  isSuperAdmin?: boolean;
  // Layout overrides (for page-header-owns-title pattern)
  hideTitle?: boolean;
  hidePrimaryAction?: boolean;
  sticky?: boolean;
}

function encodeSortValue(field: string | null, dir: "asc" | "desc"): string {
  if (!field) return "__none";
  return `${field}:${dir}`;
}

function decodeSortValue(value: string): { field: string | null; dir: "asc" | "desc" } {
  if (!value || value === "__none") return { field: null, dir: "asc" };
  const [field, dir] = value.split(":");
  return { field, dir: (dir === "asc" ? "asc" : "desc") };
}

export function ClaimsCommandBar({
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  claimStatusValueFilter,
  onClaimStatusValueChange,
  customerFilter,
  onCustomerFilterChange,
  driverFilter,
  onDriverFilterChange,
  legalHoldFilter,
  onLegalHoldFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  sortField,
  sortDir,
  onSortChange,
  activeFilterCount,
  onClearFilters,
  drivers,
  customers,
  claimCount,
  carrierMode,
  onToggleCarrier,
  isSuperAdmin,
  hideTitle,
  hidePrimaryAction,
  sticky,
}: ClaimsCommandBarProps) {
  const currentSort = encodeSortValue(sortField, sortDir);

  const handleSortChange = (value: string) => {
    const { field, dir } = decodeSortValue(value);
    onSortChange(field, dir);
  };

  // ── Carrier mode toggle ──────────────────────────────────────────────────
  const carrierToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onToggleCarrier}
          data-testid="button-carrier-mode-toggle"
          className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
            carrierMode
              ? "text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
          aria-pressed={carrierMode}
          aria-label={
            carrierMode
              ? "Carrier mode active — click to show all claims"
              : "Click to enable carrier claims view"
          }
        >
          {carrierMode ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {carrierMode
          ? "Carrier Mode: ON — showing carrier claims only"
          : "All Claims Mode — click to filter by carrier claims"}
      </TooltipContent>
    </Tooltip>
  );

  // ── Filters popover content ──────────────────────────────────────────────
  // On tablet (<xl) this is the ONLY way to reach any filter — the inline
  // row is hidden. Filters: Account, Driver, Legal Hold, Incident Date Range.
  const filtersContent = (
    <>
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Account</Label>
        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="h-9 text-sm w-full border-[#cfd4df] dark:border-border" data-testid="cb-filter-account-popover">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {(c as any).customerName || (c as any).name || c.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Driver</Label>
        <Select value={driverFilter} onValueChange={onDriverFilterChange}>
          <SelectTrigger className="h-9 text-sm w-full border-[#cfd4df] dark:border-border" data-testid="cb-filter-driver-popover">
            <SelectValue placeholder="All drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map((d) => {
              const name = `${(d as any).user?.firstName ?? ""} ${(d as any).user?.lastName ?? ""}`.trim();
              return (
                <SelectItem key={d.id} value={d.id}>{name || d.id}</SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Legal Hold</Label>
        <Select value={legalHoldFilter} onValueChange={onLegalHoldFilterChange}>
          <SelectTrigger className="h-9 text-sm w-full border-[#cfd4df] dark:border-border" data-testid="cb-filter-legal-hold-popover">
            <SelectValue placeholder="All claims" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Claims</SelectItem>
            <SelectItem value="active">Legal Hold Active</SelectItem>
            <SelectItem value="none">No Legal Hold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Incident Date Range</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground/70">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-9 text-sm w-full border-[#cfd4df] dark:border-border"
              data-testid="cb-filter-date-from-popover"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground/70">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-9 text-sm w-full border-[#cfd4df] dark:border-border"
              data-testid="cb-filter-date-to-popover"
            />
          </div>
        </div>
      </div>
    </>
  );

  // ── Inline quick-access filters (desktop xl+ row) ────────────────────────
  // Account, Driver, Incident Date Range. Legal Hold stays in popover (rarely toggled).
  const inlineFiltersContent = (
    <>
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Account</Label>
        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="h-9 text-sm w-[160px] border-[#cfd4df] dark:border-border" data-testid="cb-filter-account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {(c as any).customerName || (c as any).name || c.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Driver</Label>
        <Select value={driverFilter} onValueChange={onDriverFilterChange}>
          <SelectTrigger className="h-9 text-sm w-[160px] border-[#cfd4df] dark:border-border" data-testid="cb-filter-driver">
            <SelectValue placeholder="All drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map((d) => {
              const name = `${(d as any).user?.firstName ?? ""} ${(d as any).user?.lastName ?? ""}`.trim();
              return (
                <SelectItem key={d.id} value={d.id}>
                  {name || d.id}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Incident Date Range</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 text-sm w-[145px] min-w-0 border-[#cfd4df] dark:border-border"
            data-testid="cb-filter-date-from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 text-sm w-[145px] min-w-0 border-[#cfd4df] dark:border-border"
            data-testid="cb-filter-date-to"
          />
        </div>
      </div>
    </>
  );

  // ── Desktop extra-action buttons ─────────────────────────────────────────
  const extraActions = (
    <>
      <Link href="/claims/dashboard">
        <Button variant="outline" size="sm" className="h-9 border-[#d7dbe4] dark:border-border" data-testid="button-go-dashboard">
          <LayoutDashboard className="h-4 w-4 mr-2" />
          Dashboard
        </Button>
      </Link>
      {isSuperAdmin && (
        <Link href="/imports/claims">
          <Button variant="outline" size="sm" className="h-9 border-[#d7dbe4] dark:border-border" data-testid="button-import-claims">
            <FileUp className="h-4 w-4 mr-2" />
            Import
          </Button>
        </Link>
      )}
    </>
  );

  // ── Tablet overflow-menu items ───────────────────────────────────────────
  const menuItems: CommandBarMenuItem[] = [
    {
      label: "Dashboard",
      href: "/claims/dashboard",
      icon: <LayoutDashboard />,
      testId: "menu-go-dashboard",
    },
    ...(isSuperAdmin
      ? ([
          {
            label: "Import",
            href: "/imports/claims",
            icon: <FileUp />,
            testId: "menu-import-claims",
          },
        ] as CommandBarMenuItem[])
      : []),
  ];

  // ── Status primary filter (between view selector and Filters button) ───────
  const statusQuickFilter = (
    <Select value={claimStatusValueFilter} onValueChange={onClaimStatusValueChange}>
      <SelectTrigger
        className="h-9 text-sm w-[130px] xl:w-[160px] shrink-0 border-[#cfd4df] dark:border-border"
        data-testid="commandbar-claim-status-filter"
      >
        <SelectValue placeholder="All Statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Statuses</SelectItem>
        {CLAIM_STATUS_FILTER_OPTIONS.map(({ value, label }) => (
          <SelectItem key={value} value={value} data-testid={`status-option-${value}`}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <CommandBar
      title="Claims"
      titleExtra={carrierToggle}
      searchPlaceholder="Search claims, drivers, accounts..."
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      views={CLAIM_VIEWS}
      currentView={statusFilter}
      onViewChange={onStatusFilterChange}
      quickFilters={statusQuickFilter}
      filtersContent={filtersContent}
      activeFilterCount={activeFilterCount}
      onClearFilters={onClearFilters}
      sortOptions={SORT_OPTIONS}
      currentSort={currentSort === "__none" ? undefined : currentSort}
      onSortChange={handleSortChange}
      extraActions={extraActions}
      menuItems={menuItems}
      primaryActionLabel={hidePrimaryAction ? undefined : "+ New Claim"}
      primaryActionHref={hidePrimaryAction ? undefined : "/claims/new"}
      hideTitle={hideTitle}
      sticky={sticky}
    />
  );
}
