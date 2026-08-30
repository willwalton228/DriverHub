import React, { Component, useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { DriverWithUser, PayRecord, Trip, DriverNoteWithAuthor, InsertDriverNote, DriverDocumentWithUploader, DriverCommentWithAuthor } from "@shared/schema";
import { NETWORK_VALUES, MARKET_VALUES, RECRUITER_VALUES, DIRECT_MANAGER_VALUES, CERTIFIED_BY_VALUES, EMERGENCY_CONTACT_RELATIONSHIP_VALUES, DRIVER_NOTE_TYPES, employmentTypeOptions } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RecordWorkspaceTabs } from "@/components/RecordWorkspaceTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverPayrollTab } from "@/pages/payroll/PayrollModule";
import { AddClaimDialog } from "@/components/AddClaimDialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Tooltip as RechartsTooltip, ReferenceLine, Cell, ResponsiveContainer } from "recharts";
import { 
  Loader2, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  DollarSign,
  MapPinned,
  MessageSquare,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Shield,
  Briefcase,
  CreditCard,
  TrendingUp,
  Pencil,
  Check,
  X,
  ChevronsUpDown,
  AlertCircle,
  AlertTriangle,
  Clock,
  ClipboardCheck,
  Download,
  Plus,
  Car,
  Paperclip,
  ChevronRight,
  Camera,
  Send,
  Upload,
  Activity,
  Timer,
  CheckCircle,
  XCircle,
  ArchiveX,
  RotateCcw,
  Lock,
  Building2,
  Star,
  GitMerge,
  Search,
  RefreshCw,
  ExternalLink,
  Filter,
  CalendarRange,
  ThumbsUp,
  ThumbsDown,
  AlertOctagon,
  CalendarCheck,
  CalendarDays,
  Info,
  History,
  ArrowDown,
  User2,
  UserPlus,
  Smartphone,
  ZoomIn,
  Palmtree,
  BrainCircuit
} from "lucide-react";
import { useParams, Link, useLocation } from "wouter";
import { formatPhone, formatPhoneInput, cleanPhone } from "@/lib/phone";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { PhoneInput } from "@/components/PhoneInput";
import { formatDate, parseFormDate, formatDateTime, formatNoteDateTime, parseDateSafe } from "@/lib/dateFormat";
import { ServerUploader } from "@/components/ServerUploader";
import { ExcelDownloadButton } from "@/components/ExcelDownloadButton";
import type { ExcelColumn } from "@/lib/excelExport";
import { exportToExcel } from "@/lib/excelExport";
import { DriverSafetyFlags } from "@/components/DriverSafetyFlags";
import { DriverCommandBar } from "@/components/drivers/DriverCommandBar";
import { NotesAndCommsTimeline } from "@/components/drivers/NotesAndCommsTimeline";
import { DriverOTWatchCard } from "@/components/scheduling/OTWatchTab";
import { DriverScoreBadge } from "@/components/drivers/DriverScoreBadge";
import { DriverRiskScoreBadge } from "@/components/drivers/DriverRiskScoreBadge";
import { MergeRecordsDialog } from "@/components/MergeRecordsDialog";
import { DriverEmailComposeDialog } from "@/components/drivers/DriverEmailComposeDialog";
import { rechartsTooltipStyle } from "@/lib/chartUtils";
import { DRIVER_RISK_SCORE_TIP, getRiskTierColors } from "@/lib/driverRiskScoreConfig";
import { DriverRiskScorePopoverContent } from "@/components/drivers/DriverRiskScorePopoverContent";

interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => void;
  type?: "text" | "date" | "tel" | "email" | "currency";
  isSaving?: boolean;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  alphanumericOnly?: boolean;
  alphanumericWithSpaces?: boolean;
}

function formatCurrency(value: string | null | undefined): string {
  if (!value) return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

type ComplianceResult = { label: string; color: "green" | "yellow" | "red" };

function toUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addYears(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function getExpirationComplianceStatus(dateStr: string | null | undefined): ComplianceResult {
  if (!dateStr) return { label: "Needed", color: "red" };
  const expiresOn = toUTCDate(dateStr);
  const today = todayUTC();
  const expiringOn = subDays(expiresOn, 60);
  console.debug("[Compliance] License debug:", {
    licenseExpiration: dateStr,
    expiresOn: expiresOn.toISOString().slice(0, 10),
    expiringOn: expiringOn.toISOString().slice(0, 10),
    today: today.toISOString().slice(0, 10),
  });
  if (today > expiresOn) return { label: "Expired", color: "red" };
  if (today >= expiringOn) return { label: "Expiring", color: "yellow" };
  return { label: "Current", color: "green" };
}

function getPresenceComplianceStatus(dateStr: string | null | undefined): ComplianceResult {
  if (!dateStr) {
    console.debug("[Compliance] Drug Test debug:", { drugTestDate: null, status: "Needed" });
    return { label: "Needed", color: "red" };
  }
  console.debug("[Compliance] Drug Test debug:", { drugTestDate: dateStr, status: "Current" });
  return { label: "Current", color: "green" };
}

function getAnnualComplianceStatus(dateStr: string | null | undefined): ComplianceResult & { debugInfo: string | null } {
  if (!dateStr) return { label: "Needed", color: "red", debugInfo: null };
  const recordDate = toUTCDate(dateStr);
  const today = todayUTC();
  const expiresOn = addYears(recordDate, 1);
  const expiringOn = subDays(expiresOn, 60);
  const debugInfo = `Record: ${dateStr}, Expires: ${expiresOn.toISOString().slice(0, 10)}, Warning: ${expiringOn.toISOString().slice(0, 10)}`;
  console.debug("[Compliance] MVR debug:", {
    mvrDate: dateStr,
    expiresOn: expiresOn.toISOString().slice(0, 10),
    expiringOn: expiringOn.toISOString().slice(0, 10),
    today: today.toISOString().slice(0, 10),
  });
  if (today > expiresOn) return { label: "Expired", color: "red", debugInfo };
  if (today >= expiringOn) return { label: "Expiring", color: "yellow", debugInfo };
  return { label: "Current", color: "green", debugInfo };
}

// ─── Compliance Snapshot Bar ──────────────────────────────────────────────────
// Compact compliance strip shown in the pinned Driver Detail header.
// Uses the existing compliance date rules: MVR ≤7 days, License ≤30 days,
// and annual validity for Background.
function ComplianceSnapshotBar({
  driver,
  onNavigate,
}: {
  driver: DriverWithUser;
  onNavigate: () => void;
}) {
  const MS_PER_DAY = 86_400_000;
  const today = todayUTC();

  type SnapStatus = "current" | "expiring" | "expired" | "needed";

  const mvrData = (() => {
    if (!driver.mvrDate) {
      return { status: "needed" as SnapStatus, daysLabel: "No MVR record on file", date: null };
    }
    const completed  = toUTCDate(driver.mvrDate);
    const expiresOn  = addYears(completed, 1);
    const msLeft     = expiresOn.getTime() - today.getTime();
    const daysLeft   = Math.floor(msLeft / MS_PER_DAY);
    if (daysLeft < 0)  return { status: "expired"  as SnapStatus, daysLabel: `${Math.abs(daysLeft)}d overdue`,   date: driver.mvrDate };
    if (daysLeft <= 7) return { status: "expiring" as SnapStatus, daysLabel: `${daysLeft}d remaining`,            date: driver.mvrDate };
    return               { status: "current"  as SnapStatus, daysLabel: `${daysLeft}d remaining`,                 date: driver.mvrDate };
  })();

  const licData = (() => {
    if (!driver.licenseExpiration) {
      return { status: "needed" as SnapStatus, daysLabel: "No expiration date on file", date: null };
    }
    const expiresOn  = toUTCDate(driver.licenseExpiration);
    const msLeft     = expiresOn.getTime() - today.getTime();
    const daysLeft   = Math.floor(msLeft / MS_PER_DAY);
    if (daysLeft < 0)   return { status: "expired"  as SnapStatus, daysLabel: `${Math.abs(daysLeft)}d overdue`,  date: driver.licenseExpiration };
    if (daysLeft <= 30) return { status: "expiring" as SnapStatus, daysLabel: `${daysLeft}d remaining`,           date: driver.licenseExpiration };
    return                { status: "current"  as SnapStatus, daysLabel: `${daysLeft}d remaining`,                date: driver.licenseExpiration };
  })();

  const backgroundData = (() => {
    if (!driver.backgroundCheckDate) {
      return { status: "needed" as SnapStatus, daysLabel: "No background check on file", date: null };
    }
    const completed = toUTCDate(driver.backgroundCheckDate);
    const expiresOn = addYears(completed, 1);
    const msLeft = expiresOn.getTime() - today.getTime();
    const daysLeft = Math.floor(msLeft / MS_PER_DAY);
    if (daysLeft < 0) return { status: "expired" as SnapStatus, daysLabel: `${Math.abs(daysLeft)}d overdue`, date: driver.backgroundCheckDate };
    if (daysLeft <= 60) return { status: "expiring" as SnapStatus, daysLabel: `${daysLeft}d remaining`, date: driver.backgroundCheckDate };
    return { status: "current" as SnapStatus, daysLabel: `${daysLeft}d remaining`, date: driver.backgroundCheckDate };
  })();

  function statusStyles(s: SnapStatus) {
    if (s === "current")  return { dot: "bg-green-500",  labelCls: "text-green-600 dark:text-green-400",  label: "Current"  };
    if (s === "expiring") return { dot: "bg-yellow-500", labelCls: "text-yellow-600 dark:text-yellow-400", label: "Expiring" };
    if (s === "expired")  return { dot: "bg-red-500",    labelCls: "text-red-600 dark:text-red-400",       label: "Expired"  };
    return                       { dot: "bg-red-500",    labelCls: "text-red-600 dark:text-red-400",       label: "Needed"   };
  }

  const mvrStyles = statusStyles(mvrData.status);
  const licStyles = statusStyles(licData.status);
  const backgroundStyles = statusStyles(backgroundData.status);

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full mt-2.5 flex flex-col sm:flex-row items-stretch rounded-md border border-border/60 bg-muted/30 overflow-hidden hover-elevate text-left"
      data-testid="compliance-snapshot-bar"
      title="View compliance details"
    >
      {/* ── MVR cell ── */}
      <div className="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${mvrStyles.dot}`} />
        <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 leading-snug">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold">MVR</span>
            <span className={`text-[10px] font-semibold ${mvrStyles.labelCls}`}>{mvrStyles.label}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
            {mvrData.date ? (
              <>
                <span>Completed: {formatDate(mvrData.date)}</span>
                <span>·</span>
                <span className={mvrData.status !== "current" ? mvrStyles.labelCls : ""}>{mvrData.daysLabel}</span>
              </>
            ) : (
              <span className="text-red-500 dark:text-red-400">{mvrData.daysLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* divider */}
      <div className="w-full h-px sm:w-px sm:h-auto self-stretch bg-border/50 shrink-0" />

      {/* ── License cell ── */}
      <div className="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${licStyles.dot}`} />
        <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 leading-snug">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold">License</span>
            <span className={`text-[10px] font-semibold ${licStyles.labelCls}`}>{licStyles.label}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
            {licData.date ? (
              <>
                <span>Expires: {formatDate(licData.date)}</span>
                <span>·</span>
                <span className={licData.status !== "current" ? licStyles.labelCls : ""}>{licData.daysLabel}</span>
              </>
            ) : (
              <span className="text-red-500 dark:text-red-400">{licData.daysLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* divider */}
      <div className="w-full h-px sm:w-px sm:h-auto self-stretch bg-border/50 shrink-0" />

      {/* ── Background cell ── */}
      <div className="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${backgroundStyles.dot}`} />
        <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 leading-snug">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold">Background</span>
            <span className={`text-[10px] font-semibold ${backgroundStyles.labelCls}`}>{backgroundStyles.label}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
            {backgroundData.date ? (
              <>
                <span>Completed: {formatDate(backgroundData.date)}</span>
                <span>·</span>
                <span className={backgroundData.status !== "current" ? backgroundStyles.labelCls : ""}>{backgroundData.daysLabel}</span>
              </>
            ) : (
              <span className="text-red-500 dark:text-red-400">{backgroundData.daysLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* edit affordance */}
      <div className="shrink-0 flex items-center px-2.5">
        <Pencil className="h-3 w-3 text-muted-foreground/40" />
      </div>
    </button>
  );
}

function ComplianceBadge({ status }: { status: ComplianceResult }) {
  const testId = `badge-compliance-${status.label.toLowerCase()}`;
  if (status.color === "green") {
    return (
      <Badge variant="outline" className="text-xs bg-green-600 text-white border-green-600 hover:bg-green-600 dark:bg-green-600 dark:text-white dark:border-green-600 no-default-hover-elevate no-default-active-elevate" data-testid={testId}>
        {status.label}
      </Badge>
    );
  }
  if (status.color === "yellow") {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-400 dark:bg-yellow-400 dark:text-black dark:border-yellow-400 no-default-hover-elevate no-default-active-elevate" data-testid={testId}>
        {status.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-red-600 text-white border-red-600 hover:bg-red-600 dark:bg-red-600 dark:text-white dark:border-red-600 no-default-hover-elevate no-default-active-elevate" data-testid={testId}>
      {status.label}
    </Badge>
  );
}

function getHoursColor(hours: number): string {
  if (hours > 35) return "text-red-600 dark:text-red-400";
  if (hours > 30) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function getHoursProgressColor(hours: number): string {
  if (hours > 35) return "bg-red-500";
  if (hours > 30) return "bg-yellow-500";
  return "bg-primary";
}

// WIW hours ratio: green = on track, amber = slightly behind, red = significantly behind
function wiwWorkedRatioColor(worked: number, scheduled: number): string {
  if (scheduled <= 0) return "text-muted-foreground";
  const pct = worked / scheduled;
  if (pct >= 0.9) return "text-green-600 dark:text-green-400";
  if (pct >= 0.6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function wiwWorkedRatioBarColor(worked: number, scheduled: number): string {
  if (scheduled <= 0) return "bg-primary";
  const pct = worked / scheduled;
  if (pct >= 0.9) return "bg-green-500";
  if (pct >= 0.6) return "bg-yellow-500";
  return "bg-red-500";
}

// WIW absence reason / status label maps (WIW API integer codes)
const WIW_ABSENCE_TYPE: Record<string, string> = {
  "0": "Unscheduled", "1": "Sick", "2": "Personal", "3": "Vacation",
  "4": "Holiday", "5": "No Call / No Show", "6": "Late",
};
// WIW /requests status codes (confirmed from raw API payloads):
//   0 = Pending, 1 = Approved (upcoming), 2 = Approved (completed/past), 3 = Denied, 4 = Cancelled
const WIW_ABSENCE_STATUS: Record<string, string> = {
  "0": "Pending", "1": "Approved", "2": "Approved", "3": "Denied", "4": "Cancelled",
};

function parseCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
}

function usePendingFieldSave(isSaving?: boolean) {
  const [isPendingSave, setIsPendingSave] = useState(false);
  const observedSavingRef = useRef(false);

  const beginPendingSave = useCallback(() => {
    observedSavingRef.current = false;
    setIsPendingSave(true);
  }, []);

  useEffect(() => {
    if (!isPendingSave) return;
    if (isSaving) {
      observedSavingRef.current = true;
    } else if (observedSavingRef.current) {
      observedSavingRef.current = false;
      setIsPendingSave(false);
    }
  }, [isPendingSave, isSaving]);

  return { isPendingSave, beginPendingSave };
}

function EditableField({ label, value, fieldName, onSave, type = "text", isSaving, disabled, required, maxLength, alphanumericOnly, alphanumericWithSpaces }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);

  const effectiveValue = value || "";
  const hasValue = effectiveValue.trim() !== "";
  const fieldState = isPendingSave ? "pending" : hasValue ? "saved" : "empty";

  const handleSave = useCallback(() => {
    if (editValue !== (value || "")) {
      beginPendingSave();
      onSave(fieldName, editValue);
    }
    setIsEditing(false);
  }, [beginPendingSave, editValue, value, fieldName, onSave]);
  
  const handleCancel = () => {
    setEditValue(value || "");
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Tab") {
      // Save current field, let Tab naturally move focus to next element
      if (editValue !== (value || "")) {
        beginPendingSave();
        onSave(fieldName, editValue);
      }
      setIsEditing(false);
      // Don't prevent default - let Tab move to next focusable element
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    if (type === "currency") {
      newValue = parseCurrencyInput(newValue);
    } else if (type === "tel") {
      newValue = formatPhoneInput(newValue);
    }
    if (alphanumericOnly) {
      newValue = newValue.replace(/[^a-zA-Z0-9]/g, '');
    } else if (alphanumericWithSpaces) {
      newValue = newValue.replace(/[^a-zA-Z0-9 ]/g, '');
    }
    // Enforce maxLength
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.slice(0, maxLength);
    }
    setEditValue(newValue);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      if (newValue !== (value || "")) {
        beginPendingSave();
        onSave(fieldName, newValue);
        setIsEditing(false);
      }
    }, 10000);
  };
  
  const handleBlur = (e: React.FocusEvent) => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    // Check if focus is moving to another editable field container
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.dataset?.editableField) {
      // Focus is moving to another EditableField, save silently
      if (editValue !== (value || "")) {
        beginPendingSave();
        onSave(fieldName, editValue);
      }
      setIsEditing(false);
    } else {
      handleSave();
    }
  };
  
  // Handle focus on the container to enter edit mode (for Tab navigation)
  const handleContainerFocus = () => {
    if (!isEditing && !disabled) {
      setIsEditing(true);
    }
  };
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);
  
  useEffect(() => {
    setEditValue(value || "");
  }, [value]);
  
  const showRequiredError = required && !hasValue;
  
  if (isEditing) {
    return (
      <div data-editable-field="true" data-field-state="editing">
        <p className="text-sm font-medium text-muted-foreground">
          {label}
          {required && !hasValue && <span className="text-destructive ml-1">*</span>}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {type === "currency" && <span className="text-muted-foreground">$</span>}
          <Input
            ref={inputRef}
            type={type === "currency" ? "text" : type}
            inputMode={type === "currency" ? "decimal" : undefined}
            value={editValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className={`driver-detail-field-control h-8 text-left ${showRequiredError ? "border-destructive" : ""}`}
            data-field-state="editing"
            data-testid={`input-edit-${fieldName}`}
            placeholder={type === "currency" ? "0.00" : undefined}
            maxLength={maxLength}
          />
          {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>
    );
  }
  
  const displayValue = hasValue 
    ? (type === "tel" ? formatPhone(effectiveValue) : type === "date" ? formatDate(effectiveValue) : type === "currency" ? formatCurrency(effectiveValue) : effectiveValue) 
    : "";

  if (disabled) {
    return (
      <div 
        ref={containerRef}
        className="cursor-not-allowed opacity-60"
        data-editable-field="true"
        data-field-state="disabled"
        data-testid={`field-${fieldName}`}
      >
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <div className="driver-detail-field-value flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-sm items-center" data-field-state={hasValue ? "saved" : "empty"}>
          <span className="flex-1 truncate text-muted-foreground" aria-label={hasValue ? undefined : "Empty field"}>{displayValue}</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      data-editable-field="true"
      data-field-state={fieldState}
      data-testid={`field-${fieldName}`}
    >
      <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
        {label}
        {required && !hasValue && <span className="text-destructive">*</span>}
      </p>
      <div 
        className={`driver-detail-field-value flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-sm cursor-pointer hover:bg-muted/50 transition-colors items-center group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          showRequiredError ? "border-destructive" : "border-input"
        }`}
        data-field-state={fieldState}
        onClick={() => setIsEditing(true)}
        onFocus={handleContainerFocus}
        tabIndex={0}
      >
        <span className={`flex-1 truncate ${showRequiredError ? "text-destructive" : ""}`}>
          <span aria-label={showRequiredError ? "Required field" : hasValue ? undefined : "Empty optional field"}>
            {displayValue}
          </span>
          {showRequiredError && <span className="sr-only">Required</span>}
        </span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ml-2 flex-shrink-0" />
      </div>
    </div>
  );
}

interface MaskedSSNFieldProps {
  label: string;
  last4Value: string | null | undefined;
  fieldName: string;
  driverId: string;
  onSave: (fieldName: string, value: string) => void;
  isSaving?: boolean;
  driverClassification?: string | null;
  canViewFullSsn?: boolean;
  canEditSsn?: boolean;
}

function MaskedSSNField({ label, last4Value, fieldName, driverId, onSave, isSaving, driverClassification, canViewFullSsn = false, canEditSsn = false }: MaskedSSNFieldProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingDigits, setPendingDigits] = useState("");
  const [confirmationType, setConfirmationType] = useState<"ssn" | "ein" | "both">("both");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);

  // A permission refresh can revoke SSN/EIN access while this detail page stays
  // open. Never keep a previously revealed value visible after that revocation.
  useEffect(() => {
    if (!canViewFullSsn) {
      setRevealedValue(null);
    }
  }, [canViewFullSsn, driverId]);
  
  const isEmployee = driverClassification === "Employee";
  const isIC = driverClassification === "Independent Contractor";
  const hasValue = last4Value && last4Value.trim() !== "";
  
  const formatSSN = (digits: string): string => {
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
  };
  
  const formatEIN = (digits: string): string => {
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  };
  
  const getMaskedDisplay = (): string => {
    if (!hasValue) return "";
    // Format: *****XXXX (5 asterisks + last 4 visible)
    return `*****${last4Value}`;
  };
  
  const handleAttemptSave = () => {
    const digits = editValue.replace(/\D/g, "");

    // Empty input — just cancel editing silently
    if (digits.length === 0) {
      setIsEditing(false);
      setEditValue("");
      return;
    }
    
    if (isEmployee) {
      if (digits.length !== 9) {
        toast({
          title: "Invalid SSN",
          description: "Social Security Number must be exactly 9 digits.",
          variant: "destructive"
        });
        return;
      }
      const formattedSSN = formatSSN(digits);
      beginPendingSave();
      onSave(fieldName, formattedSSN);
      setIsEditing(false);
      setEditValue("");
    } else if (isIC) {
      if (digits.length === 9) {
        setPendingDigits(digits);
        setConfirmationType("both");
        setShowConfirmation(true);
      } else {
        toast({
          title: "Invalid Entry",
          description: "Enter exactly 9 digits for SSN or EIN.",
          variant: "destructive"
        });
        return;
      }
    } else {
      if (digits.length === 9) {
        beginPendingSave();
        onSave(fieldName, formatSSN(digits));
      }
      setIsEditing(false);
      setEditValue("");
    }
  };
  
  const handleConfirmSSN = () => {
    const formattedSSN = formatSSN(pendingDigits);
    beginPendingSave();
    onSave(fieldName, formattedSSN);
    setShowConfirmation(false);
    setIsEditing(false);
    setEditValue("");
    setPendingDigits("");
    toast({
      title: "Saved as SSN",
      description: `Social Security Number saved: ${formatSSN(pendingDigits).slice(0, 3)}-**-${pendingDigits.slice(-4)}`
    });
  };
  
  const handleConfirmEIN = () => {
    const formattedEIN = formatEIN(pendingDigits);
    beginPendingSave();
    onSave(fieldName, formattedEIN);
    setShowConfirmation(false);
    setIsEditing(false);
    setEditValue("");
    setPendingDigits("");
    toast({
      title: "Saved as EIN",
      description: `Employer Identification Number saved: ${formatEIN(pendingDigits).slice(0, 2)}-***${pendingDigits.slice(-4)}`
    });
  };
  
  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setPendingDigits("");
    setConfirmationType("both");
  };
  
  const handleCancel = () => {
    setEditValue("");
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAttemptSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, "").slice(0, 9);
    setEditValue(rawDigits);
  };
  
  const handleContainerFocus = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };
  
  const handleReveal = async () => {
    if (!canViewFullSsn || !hasValue || isRevealing) return;
    setIsRevealing(true);
    try {
      const response = await apiRequest("POST", `/api/corporate/drivers/${driverId}/ssn/reveal`);
      const payload = await response.json();
      if (!payload?.value) {
        throw new Error("No SSN/EIN value was returned");
      }
      setRevealedValue(String(payload.value));
    } catch (error: any) {
      toast({
        title: "Unable to reveal SSN/EIN",
        description: error?.message || "You may no longer have permission to view this value.",
        variant: "destructive",
      });
    } finally {
      setIsRevealing(false);
    }
  };

  useEffect(() => {
    setRevealedValue(null);
  }, [driverId]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);
  
  if (showConfirmation) {
    return (
      <div className="p-4 bg-muted/30 rounded-lg border space-y-3" data-testid="ssn-ein-confirmation">
        <p className="text-sm font-medium">Confirm Number Type</p>
        <p className="text-sm text-muted-foreground">
          You entered 9 digits. Please confirm if this is a Social Security Number or Employer Identification Number:
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-background rounded border">
            <div>
              <p className="font-medium">Social Security Number (SSN)</p>
              <p className="text-sm text-muted-foreground">Format: {formatSSN(pendingDigits)}</p>
            </div>
            <Button size="sm" onClick={handleConfirmSSN} data-testid="button-confirm-ssn">
              Confirm SSN
            </Button>
          </div>
          <div className="flex items-center justify-between p-2 bg-background rounded border">
            <div>
              <p className="font-medium">Employer Identification Number (EIN)</p>
              <p className="text-sm text-muted-foreground">Format: {formatEIN(pendingDigits)}</p>
            </div>
            <Button size="sm" onClick={handleConfirmEIN} data-testid="button-confirm-ein">
              Confirm EIN
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleCancelConfirmation} data-testid="button-cancel-confirmation">
          Cancel
        </Button>
      </div>
    );
  }
  
  if (revealedValue) {
    return (
      <div data-field-state="saved" data-testid={`field-${fieldName}-revealed`}>
        <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
          {label}
          <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Full value shown</span>
        </p>
        <div className="driver-detail-field-value flex h-9 w-full rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1 text-base items-center bg-amber-50/50 dark:bg-amber-950/20" data-field-state="saved">
          <span className="font-mono flex-1">{revealedValue}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setRevealedValue(null)}
            data-testid={`button-hide-${fieldName}`}
          >
            Hide
          </Button>
        </div>
      </div>
    );
  }

  if (isEditing) {
    const helperText = isEmployee 
      ? "Enter 9-digit Social Security Number (required for employees)"
      : isIC 
        ? "Enter 9 digits - you will be asked to confirm if SSN or EIN"
        : "Enter 9-digit SSN or EIN";
    
    return (
      <div data-editable-field="true" data-field-state="editing">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {label}
          {(isEmployee || isIC) && !hasValue && <span className="text-destructive">*</span>}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleAttemptSave}
            placeholder="123456789"
            maxLength={9}
            className="driver-detail-field-control h-8 font-mono"
            data-field-state="editing"
            data-testid={`input-edit-${fieldName}`}
          />
          <Button size="sm" variant="ghost" onMouseDown={(e) => { e.preventDefault(); handleCancel(); }} data-testid="button-cancel-ssn">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
        <p className="text-xs text-muted-foreground">Digits entered: {editValue.length}/9</p>
      </div>
    );
  }
  
  const showRequiredError = (isEmployee || isIC) && !hasValue;
  const displayValue = hasValue ? getMaskedDisplay() : "";

  const revealControl = canViewFullSsn && hasValue ? (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-xs"
      onClick={(event) => {
        event.stopPropagation();
        void handleReveal();
      }}
      disabled={isRevealing}
      data-testid={`button-reveal-${fieldName}`}
    >
      {isRevealing ? "Loading…" : "Reveal"}
    </Button>
  ) : null;

  // Masked editable view — existing edit behavior remains independent from reveal permission.
  if (canEditSsn) {
    return (
      <div
        ref={containerRef}
        data-editable-field="true"
        data-field-state={isPendingSave ? "pending" : hasValue ? "saved" : "empty"}
        data-testid={`field-${fieldName}-masked-edit`}
      >
        <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
          {label}
          {(isEmployee || isIC) && !hasValue && <span className="text-destructive">*</span>}
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
          {revealControl}
        </p>
        <div
          className={`driver-detail-field-value flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-sm cursor-pointer hover:bg-muted/50 transition-colors items-center group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            showRequiredError ? "border-destructive" : "border-input"
          }`}
          data-field-state={isPendingSave ? "pending" : hasValue ? "saved" : "empty"}
          onClick={() => setIsEditing(true)}
          tabIndex={0}
          onFocus={() => setIsEditing(true)}
        >
          <span className={`flex-1 truncate font-mono ${showRequiredError ? "text-destructive" : "text-muted-foreground"}`}>
            {hasValue ? displayValue : null}
          </span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ml-2 flex-shrink-0" />
        </div>
      </div>
    );
  }

  // Read-only masked view. An explicit reveal permission adds the Reveal
  // control, but never changes the default masked state.
  return (
    <div data-field-state={hasValue ? "saved" : "empty"} data-testid={`field-${fieldName}-masked`}>
      <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
        {label}
        {revealControl}
      </p>
      <div className="driver-detail-field-value flex h-9 w-full rounded-md border border-input px-3 py-1 text-base items-center bg-muted/30" data-field-state={hasValue ? "saved" : "empty"}>
        <span className="font-mono text-muted-foreground" aria-label={hasValue ? undefined : "Empty field"}>{hasValue ? displayValue : null}</span>
        {!canViewFullSsn && <Lock className="h-3 w-3 ml-2 text-muted-foreground flex-shrink-0" />}
      </div>
    </div>
  );
}

interface SelectableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  options: { value: string; label: string }[];
  onSave: (fieldName: string, value: string) => void;
  isSaving?: boolean;
  placeholder?: string;
  required?: boolean;
  width?: string;
}

function SelectableField({ label, value, fieldName, options, onSave, isSaving, placeholder = "Select an option", required, width }: SelectableFieldProps) {
  const hasValue = value && value.trim() !== "";
  const showRequiredError = required && !hasValue;
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);
  
  const handleChange = (newValue: string) => {
    if (newValue !== (value || "")) {
      beginPendingSave();
      onSave(fieldName, newValue);
    }
  };
  
  return (
    <div 
      className="group"
      data-editable-field="true"
      data-testid={`field-${fieldName}`}
    >
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
        {label}
        {required && !hasValue && <span className="text-destructive">*</span>}
        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>
      <Select value={value || ""} onValueChange={handleChange}>
        <SelectTrigger 
          className={`driver-detail-field-control h-8 text-left ${showRequiredError ? "border-destructive" : ""}`}
          data-field-state={isPendingSave ? "pending" : hasValue ? "saved" : "empty"}
          tabIndex={0}
          data-testid={`select-${fieldName}`}
          style={width ? { width } : undefined}
        >
          <SelectValue placeholder={showRequiredError ? "Required" : "\u00a0"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const TERMINATION_REASON_GROUPS: { label: string; options: string[] }[] = [
  {
    label: "Voluntary / Driver Initiated",
    options: [
      "Driver Resignation",
      "Taking Time Off / Temporary Leave",
      "Health Related / Surgery",
      "Relocated",
      "Accepted Job Elsewhere",
    ],
  },
  {
    label: "Inactivity",
    options: ["No Trips – 30+ Days"],
  },
  {
    label: "Client / Dealer Related",
    options: [
      "Availability Issues",
      "Blocked by Dealer",
      "Dealer Contract Cancellation",
      "No Show",
      "Performance / Service Issues",
      "Service Issue / Performance Concerns",
      "Unresponsive",
    ],
  },
  {
    label: "Business / Platform Related",
    options: ["Driver Number Adjustment", "Network Discontinued", "Not Enough Trip Volume"],
  },
  {
    label: "Financial / Liability",
    options: [
      "Insurance / Liability Risk",
      "Excessive Claims",
    ],
  },
  {
    label: "Compliance / Documentation",
    options: [
      "Failed Compliance Requirements",
      "Ignored Compliance Request",
    ],
  },
];

const ALL_TERMINATION_REASONS = TERMINATION_REASON_GROUPS.flatMap(g => g.options);

interface TerminationHistoryEvent {
  id: string;
  effectiveDate: string | null;
  reasonCode: string | null;
  createdAt: string;
  changedByUserId: string | null;
  changedByName: string | null;
  mostRecentReactivationDate: string | null;
}
interface TerminationSectionProps {
  driver: DriverWithUser & {
    terminationUpdatedByName?: string | null;
    mostRecentTerminationEvent?: TerminationHistoryEvent | null;
  };
  onSave: (updates: Record<string, any>) => Promise<void>;
  isSaving?: boolean;
}

// ── Lifecycle Section (replaces old single-form TerminationSection) ────────────
// Supports the full hire → terminate → reactivate → terminate cycle.
// Termination and reactivation are independent append-only actions — no cross-field
// blocking. The driver_status_history table is the source of truth for the timeline.
function TerminationSection({ driver, onSave, isSaving }: TerminationSectionProps) {
  const { toast } = useToast();
  const isEmployee = driver.driverClassification === "Employee";
  const dateLabel = isEmployee ? "Term Date" : "Contract Cancelled";
  const dateFieldName = isEmployee ? "terminationDate" : "contractCancelledDate";
  const currentDate = isEmployee ? driver.terminationDate : driver.contractCancelledDate;
  const hasDate = !!(currentDate && currentDate !== "");
  const isCurrentlyTerminated = driver.status === "terminated";

  // DH-002144: Use lifecycle history as fallback source when driver fields are incomplete
  const hist = driver.mostRecentTerminationEvent ?? null;
  const displayDate        = currentDate || hist?.effectiveDate || null;
  const displayReason      = driver.terminationReason || hist?.reasonCode || null;
  const displayUpdatedBy   = driver.terminationUpdatedByName || hist?.changedByName || null;
  const displayUpdatedAt   = driver.terminationUpdatedAt || hist?.createdAt || null;
  const displayReactivation = driver.reactivationDate || hist?.mostRecentReactivationDate || null;
  // True when the termination date is sourced from history (driver fields incomplete)
  const dataFromHistory = !hasDate && !!hist?.effectiveDate;

  // mode: null = view | "editExisting" = edit term details | "recordReactivation" | "recordTermination"
  const [mode, setMode] = useState<null | "editExisting" | "recordReactivation" | "recordTermination">(null);
  const [editFormError, setEditFormError] = useState("");

  // ── Edit existing termination details ──────────────────────────────────────
  // Pre-fill from lifecycle history when driver fields are null (DH-002144)
  const [editForm, setEditForm] = useState({
    date: parseFormDate(currentDate || hist?.effectiveDate) || "",
    reason: driver.terminationReason || hist?.reasonCode || "",
    eligibleForRehire: driver.terminationEligibleForRehire || "",
  });

  useEffect(() => {
    setEditForm({
      date: parseFormDate(currentDate || hist?.effectiveDate) || "",
      reason: driver.terminationReason || hist?.reasonCode || "",
      eligibleForRehire: driver.terminationEligibleForRehire || "",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, driver.terminationReason, driver.terminationEligibleForRehire, hist?.effectiveDate, hist?.reasonCode]);

  const handleEditSave = async () => {
    setEditFormError("");
    if (editForm.date) {
      if (!editForm.reason?.trim()) {
        setEditFormError("Termination Reason is required when a date is set.");
        return;
      }
      if (!editForm.eligibleForRehire) {
        setEditFormError("Eligible for Rehire is required when a date is set.");
        return;
      }
    }
    try {
      const isTerminating = !!(editForm.date?.trim());
      // Only send a status update when the termination state is actually changing
      // (date is being added or cleared). Editing reason/eligibleForRehire alone
      // must not trigger a status transition.
      const hadDate = !!(currentDate && currentDate !== "");
      const updates: Record<string, any> = {
        [dateFieldName]: editForm.date || null,
        terminationReason: editForm.reason || null,
        terminationEligibleForRehire: editForm.eligibleForRehire || null,
      };
      if (isTerminating !== hadDate) {
        updates.status = isTerminating ? "terminated" : "active";
      }
      if (isEmployee) updates.contractCancelledDate = null;
      else updates.terminationDate = null;
      await onSave(updates);
      setEditFormError("");
      setMode(null);
      toast({ title: "Saved", description: "Termination details updated." });
    } catch (err: any) {
      setEditFormError(err.message || "Save failed. Please try again.");
    }
  };

  // ── Record new lifecycle event (POST /api/drivers/:id/lifecycle) ───────────
  const [lifecycleForm, setLifecycleForm] = useState({ date: "", reason: "", eligibleForRehire: "" });
  const [lifecycleError, setLifecycleError] = useState("");

  const lifecycleMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      // apiRequest throws "STATUS: {json}" on non-2xx — extract the business message.
      try {
        const r = await apiRequest("POST", `/api/drivers/${driver.id}/lifecycle`, body);
        return r.json();
      } catch (err: any) {
        const raw: string = err?.message || "";
        // Try to parse JSON after the "NNN: " prefix
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart));
            if (parsed?.message) throw new Error(parsed.message);
          } catch (parseErr: any) {
            if (parseErr?.message && !parseErr.message.startsWith("Unexpected")) throw parseErr;
          }
        }
        throw new Error(raw || "Failed to save lifecycle event.");
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers", driver.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers", driver.id, "status-history"] });
      setMode(null);
      setLifecycleForm({ date: "", reason: "", eligibleForRehire: "" });
      setLifecycleError("");
      toast({ title: "Saved", description: variables.eventType === "reactivated" ? "Reactivation recorded." : "Termination recorded." });
    },
    onError: (err: any) => {
      setLifecycleError(err.message || "Failed to save. Please try again.");
    },
  });

  const handleLifecycleSave = () => {
    const eventType = mode === "recordReactivation" ? "reactivated" : "terminated";
    if (!lifecycleForm.date) { setLifecycleError("Date is required."); return; }
    if (eventType === "terminated") {
      if (!lifecycleForm.reason) { setLifecycleError("Reason is required."); return; }
      if (!lifecycleForm.eligibleForRehire) { setLifecycleError("Eligible for Rehire is required."); return; }
    }
    setLifecycleError("");
    lifecycleMutation.mutate({
      eventType,
      date: lifecycleForm.date,
      ...(eventType === "terminated" && {
        reason: lifecycleForm.reason,
        eligibleForRehire: lifecycleForm.eligibleForRehire,
      }),
    });
  };

  // ── EDIT EXISTING TERMINATION form ────────────────────────────────────────
  if (mode === "editExisting") {
    return (
      <div className="sm:col-span-2 p-4 bg-muted/30 rounded-lg border space-y-4" data-testid="termination-section-edit">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Edit Termination Details</h4>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={isSaving} data-testid="button-cancel-termination">
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
            <Button size="sm" onClick={handleEditSave} disabled={isSaving} data-testid="button-save-termination">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">{dateLabel}</label>
            <Input type="date" value={editForm.date} className="h-8"
              onChange={e => { setEditForm(p => ({ ...p, date: e.target.value })); setEditFormError(""); }}
              data-testid={`input-${dateFieldName}`} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Eligible for Rehire{editForm.date ? <span className="text-destructive ml-1">*</span> : null}
            </label>
            <Select value={editForm.eligibleForRehire} onValueChange={v => { setEditForm(p => ({ ...p, eligibleForRehire: v })); setEditFormError(""); }}>
              <SelectTrigger className={`h-8${editForm.date && !editForm.eligibleForRehire ? " border-destructive" : ""}`} data-testid="select-terminationEligibleForRehire"><SelectValue placeholder="Select option" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
              Termination Reason{editForm.date ? <span className="text-destructive ml-1">*</span> : null}
            </label>
            <Select value={editForm.reason} onValueChange={v => { setEditForm(p => ({ ...p, reason: v })); setEditFormError(""); }}>
              <SelectTrigger className={`h-8${editForm.date && !editForm.reason ? " border-destructive" : ""}`} data-testid="select-terminationReason"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent>
                {TERMINATION_REASON_GROUPS.map(group => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">{group.label}</SelectLabel>
                    {group.options.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {editFormError && (
          <p className="text-sm text-destructive font-medium" data-testid="termination-edit-form-error">{editFormError}</p>
        )}
      </div>
    );
  }

  // ── RECORD REACTIVATION form ───────────────────────────────────────────────
  if (mode === "recordReactivation") {
    return (
      <div className="sm:col-span-2 p-4 bg-muted/30 rounded-lg border space-y-4" data-testid="reactivation-form">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Record Reactivation</h4>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setLifecycleError(""); }} data-testid="button-cancel-reactivation">
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
            <Button size="sm" onClick={handleLifecycleSave} disabled={lifecycleMutation.isPending} data-testid="button-save-reactivation">
              {lifecycleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">Reactivation Date <span className="text-destructive">*</span></label>
          <Input type="date" value={lifecycleForm.date} className="h-8 max-w-xs"
            onChange={e => { setLifecycleForm(p => ({ ...p, date: e.target.value })); setLifecycleError(""); }}
            data-testid="input-reactivationDate" />
        </div>
        {lifecycleError && <p className="text-sm text-destructive">{lifecycleError}</p>}
      </div>
    );
  }

  // ── RECORD NEW TERMINATION form ────────────────────────────────────────────
  if (mode === "recordTermination") {
    return (
      <div className="sm:col-span-2 p-4 bg-muted/30 rounded-lg border space-y-4" data-testid="new-termination-form">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Record Termination</h4>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setLifecycleError(""); }} data-testid="button-cancel-new-termination">
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
            <Button size="sm" onClick={handleLifecycleSave} disabled={lifecycleMutation.isPending} data-testid="button-save-new-termination">
              {lifecycleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">{dateLabel} <span className="text-destructive">*</span></label>
            <Input type="date" value={lifecycleForm.date} className="h-8"
              onChange={e => { setLifecycleForm(p => ({ ...p, date: e.target.value })); setLifecycleError(""); }}
              data-testid={`input-new-${dateFieldName}`} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Eligible for Rehire <span className="text-destructive">*</span></label>
            <Select value={lifecycleForm.eligibleForRehire} onValueChange={v => setLifecycleForm(p => ({ ...p, eligibleForRehire: v }))}>
              <SelectTrigger className="h-8" data-testid="select-new-terminationEligibleForRehire"><SelectValue placeholder="Select option" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Termination Reason <span className="text-destructive">*</span></label>
            <Select value={lifecycleForm.reason} onValueChange={v => setLifecycleForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger className="h-8" data-testid="select-new-terminationReason"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent>
                {TERMINATION_REASON_GROUPS.map(group => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">{group.label}</SelectLabel>
                    {group.options.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {lifecycleError && <p className="text-sm text-destructive">{lifecycleError}</p>}
      </div>
    );
  }

  // ── VIEW MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="sm:col-span-2 p-4 bg-muted/30 rounded-lg border space-y-4" data-testid="termination-section">
      <div className="flex items-center justify-between">
        <h4 className="driver-detail-section-title">Termination / Cancellation Details</h4>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Show Edit when date is on the driver record; "Complete Details" when only history has it */}
          {(hasDate || (isCurrentlyTerminated && dataFromHistory)) && (
            <Button size="sm" variant="ghost" onClick={() => setMode("editExisting")} data-testid="button-edit-termination">
              <Pencil className="h-3 w-3 mr-1" />{hasDate ? "Edit" : "Complete Details"}
            </Button>
          )}
          {/* Reactivation is only valid when currently terminated */}
          {isCurrentlyTerminated && (
            <Button size="sm" variant="outline" onClick={() => { setLifecycleForm({ date: "", reason: "", eligibleForRehire: "" }); setLifecycleError(""); setMode("recordReactivation"); }} data-testid="button-record-reactivation">
              Record Reactivation
            </Button>
          )}
          {/* New termination is valid when active/reactivated (not currently terminated) or no date set */}
          {!isCurrentlyTerminated && (
            <Button size="sm" variant="outline" onClick={() => { setLifecycleForm({ date: "", reason: "", eligibleForRehire: "" }); setLifecycleError(""); setMode(hasDate ? "recordTermination" : "editExisting"); }} data-testid="button-record-termination">
              {hasDate ? "Record New Termination" : "Record Termination"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div data-field-state={displayDate ? "saved" : "empty"}>
          <p className="text-sm font-medium text-muted-foreground">{dateLabel}</p>
          <div className="driver-detail-field-value mt-1 flex h-8 rounded-md border px-3 items-center" data-field-state={displayDate ? "saved" : "empty"}>
            {displayDate ? formatDate(displayDate) : null}
          </div>
        </div>
        <div data-field-state={displayReason ? "saved" : "empty"}>
          <p className="text-sm font-medium text-muted-foreground">Termination Reason</p>
          <div className="driver-detail-field-value mt-1 flex h-8 rounded-md border px-3 items-center" data-field-state={displayReason ? "saved" : "empty"}>
            {displayReason || null}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Eligible for Rehire</p>
          <select
            value={driver.terminationEligibleForRehire || ""}
            disabled={isSaving}
            onChange={async (e) => {
              const val = e.target.value;
              if (val) await onSave({ terminationEligibleForRehire: val });
            }}
            className="driver-detail-field-control mt-1 h-8 w-full rounded-md border border-input px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            data-field-state={driver.terminationEligibleForRehire ? "saved" : "empty"}
            data-testid="select-inline-eligible-for-rehire"
          >
            <option value=""> </option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div data-field-state={displayReactivation ? "saved" : "empty"}>
          <p className="text-sm font-medium text-muted-foreground">Most Recent Reactivation</p>
          <div className="driver-detail-field-value mt-1 flex h-8 rounded-md border px-3 items-center" data-field-state={displayReactivation ? "saved" : "empty"}>
            {displayReactivation ? formatDate(displayReactivation) : null}
          </div>
        </div>
      </div>

      {(hasDate || dataFromHistory) && displayUpdatedBy && (
        <div className="pt-2 border-t space-y-1">
          <p className="text-xs text-muted-foreground">
            Recorded by <span className="font-medium">{displayUpdatedBy}</span>
            {displayUpdatedAt && <> on {new Date(displayUpdatedAt).toLocaleString()}</>}
          </p>
          {dataFromHistory && (
            <p className="text-xs text-amber-600">
              Termination date sourced from Status History — reason and eligibility were not recorded at the time. Use <strong>Complete Details</strong> to add the missing information.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface CustomerSearchFieldProps {
  label: string;
  value: string | null | undefined;
  customerName: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => void;
  isSaving?: boolean;
  isRequired?: boolean;
  showRequiredError?: boolean;
}

interface CustomerOption {
  id: string;
  customerName: string;
  customerType: string;
}

function CustomerSearchField({ 
  label, 
  value, 
  customerName, 
  fieldName, 
  onSave, 
  isSaving, 
  isRequired,
  showRequiredError 
}: CustomerSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);
  
  const { data: customers = [], isLoading } = useQuery<CustomerOption[]>({
    queryKey: ["/api/corporate/customers/search/drivershift"],
    enabled: true,
  });
  
  const handleSelect = (customerId: string, selectedCustomerName: string) => {
    beginPendingSave();
    onSave(fieldName, customerId);
    setOpen(false);
    setSearchQuery("");
  };
  
  const handleClear = () => {
    beginPendingSave();
    onSave(fieldName, "");
    setOpen(false);
  };
  
  const displayValue = customerName || (value ? "Loading..." : "Select customer");
  
  return (
    <div 
      className="group"
      data-editable-field="true"
      data-testid={`field-${fieldName}`}
    >
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
        {label}
        {isRequired && <span className="text-destructive">*</span>}
        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`driver-detail-field-control w-full justify-between h-8 ${showRequiredError ? "border-destructive" : ""}`}
            data-field-state={isPendingSave ? "pending" : value ? "saved" : "empty"}
            data-testid={`select-${fieldName}`}
          >
            <span className={!value ? "text-muted-foreground" : ""}>
              {displayValue}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search customers..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : customers.length === 0 ? (
                <CommandEmpty>No DriverShift/Hybrid customers found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {value && (
                    <CommandItem onSelect={handleClear} className="text-muted-foreground">
                      <X className="mr-2 h-4 w-4" />
                      Clear selection
                    </CommandItem>
                  )}
                  {customers.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.customerName}
                      onSelect={() => handleSelect(customer.id, customer.customerName)}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${value === customer.id ? "opacity-100" : "opacity-0"}`}
                      />
                      <div className="flex flex-col">
                        <span>{customer.customerName}</span>
                        <span className="text-xs text-muted-foreground">{customer.customerType}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showRequiredError && (
        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Required for DriverShift/Hybrid drivers
        </p>
      )}
    </div>
  );
}

interface CustomerMultiSelectFieldProps {
  label: string;
  selectedIds: string[];
  selectedCustomers: { id: string; customerName: string; status: string }[];
  fieldName: string;
  onSave: (fieldName: string, value: string[]) => void;
  isSaving?: boolean;
  disabled?: boolean;
}

function CustomerMultiSelectField({
  label,
  selectedIds,
  selectedCustomers,
  fieldName,
  onSave,
  isSaving,
  disabled,
}: CustomerMultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);

  const { data: customers = [], isLoading } = useQuery<CustomerOption[]>({
    queryKey: ["/api/corporate/customers/search/drivershift"],
    enabled: true,
  });

  const handleToggle = (customerId: string) => {
    const next = selectedIds.includes(customerId)
      ? selectedIds.filter(id => id !== customerId)
      : [...selectedIds, customerId];
    beginPendingSave();
    onSave(fieldName, next);
  };

  const handleRemove = (customerId: string) => {
    beginPendingSave();
    onSave(fieldName, selectedIds.filter(id => id !== customerId));
  };

  const displayList = selectedCustomers.length > 0
    ? selectedCustomers
    : selectedIds.map(id => ({ id, customerName: "Loading…", status: "active" }));

  return (
    <div className="group" data-editable-field="true" data-testid={`field-${fieldName}`}>
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
        {label}
        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>
      {disabled ? (
        <div className="driver-detail-field-value min-h-9 rounded-md border px-3 py-1.5 text-sm" data-field-state={selectedIds.length > 0 ? "saved" : "empty"}>
          {displayList.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {displayList.map(c => (
                <Badge key={c.id} variant="secondary" className="text-xs">
                  {c.customerName}
                  {c.status && c.status.toLowerCase() !== "active" && (
                    <span className="ml-1 opacity-60">(inactive)</span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {displayList.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {displayList.map(c => (
                <Badge key={c.id} variant="secondary" className="text-xs flex items-center gap-1">
                  {c.customerName}
                  {c.status && c.status.toLowerCase() !== "active" && (
                    <span className="opacity-60">(inactive)</span>
                  )}
                  <button
                    type="button"
                    className="ml-0.5 opacity-60 hover:opacity-100"
                    onClick={() => handleRemove(c.id)}
                    data-testid={`button-remove-customer-${c.id}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="driver-detail-field-control w-full justify-between"
                data-field-state={isPendingSave ? "pending" : selectedIds.length > 0 ? "saved" : "empty"}
                data-testid={`select-${fieldName}`}
              >
                <span className="text-muted-foreground">
                  {selectedIds.length === 0 ? "Add accounts…" : "Add more accounts…"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : customers.length === 0 ? (
                    <CommandEmpty>No active accounts found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {customers.map(customer => (
                        <CommandItem
                          key={customer.id}
                          value={customer.customerName}
                          onSelect={() => handleToggle(customer.id)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedIds.includes(customer.id) ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col">
                            <span>{customer.customerName}</span>
                            <span className="text-xs text-muted-foreground">{customer.customerType}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}

interface EmployeeSearchFieldProps {
  label: string;
  value: string | null | undefined;
  employeeName: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => void;
  isSaving?: boolean;
  disabled?: boolean;
  helperText?: string;
}

interface EmployeeOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
}

function EmployeeSearchField({ 
  label, 
  value, 
  employeeName, 
  fieldName, 
  onSave, 
  isSaving,
  disabled,
  helperText
}: EmployeeSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isPendingSave, beginPendingSave } = usePendingFieldSave(isSaving);
  
  const { data: employees = [], isLoading } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/corporate/employees"],
    enabled: true,
  });
  
  // Filter employees based on search query
  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.toLowerCase();
    const title = (emp.title || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || title.includes(query);
  });
  
  const handleSelect = (employeeId: string) => {
    beginPendingSave();
    onSave(fieldName, employeeId);
    setOpen(false);
    setSearchQuery("");
  };
  
  const handleClear = () => {
    beginPendingSave();
    onSave(fieldName, "");
    setOpen(false);
  };
  
  const displayValue = employeeName || (value ? "Loading..." : "Select employee");
  
  return (
    <div 
      className="group"
      data-editable-field="true"
      data-testid={`field-${fieldName}`}
    >
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
        {label}
        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`driver-detail-field-control w-full justify-between h-8 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            data-field-state={isPendingSave ? "pending" : value ? "saved" : "empty"}
            data-testid={`select-${fieldName}`}
            disabled={disabled}
          >
            <span className={!value ? "text-muted-foreground" : ""}>
              {displayValue}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search employees..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredEmployees.length === 0 ? (
                <CommandEmpty>No employees found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {value && (
                    <CommandItem onSelect={handleClear} className="text-muted-foreground">
                      <X className="mr-2 h-4 w-4" />
                      Clear selection
                    </CommandItem>
                  )}
                  {filteredEmployees.map((employee) => (
                    <CommandItem
                      key={employee.id}
                      value={`${employee.firstName} ${employee.lastName}`}
                      onSelect={() => handleSelect(employee.id)}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${value === employee.id ? "opacity-100" : "opacity-0"}`}
                      />
                      <div className="flex flex-col">
                        <span>{employee.firstName} {employee.lastName}</span>
                        {employee.title && (
                          <span className="text-xs text-muted-foreground">{employee.title}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helperText && (
        <p className="text-xs text-muted-foreground mt-1">
          {helperText}
        </p>
      )}
    </div>
  );
}

// ── WIW Scheduling & Attendance Tab ──────────────────────────────────────────
type WIWDateWindow = "this_week" | "next_week" | "following_week" | "last_2_weeks" | "last_90_days" | "custom";

function drvGetThisMonday(from: Date = new Date()): Date {
  const day = from.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(from);
  m.setDate(from.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function drvAddDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function drvToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMDYShort(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function wiwWindowDates(window: WIWDateWindow, custom: { start: string; end: string }) {
  const today = new Date();
  const todayStr = drvToStr(today);
  const thisMonday = drvGetThisMonday(today);
  if (window === "this_week") {
    return { start: drvToStr(thisMonday), end: todayStr };
  }
  if (window === "next_week") {
    const nextMon = drvAddDays(thisMonday, 7);
    const nextSun = drvAddDays(thisMonday, 13);
    return { start: drvToStr(nextMon), end: drvToStr(nextSun) };
  }
  if (window === "following_week") {
    const folMon = drvAddDays(thisMonday, 14);
    const folSun = drvAddDays(thisMonday, 20);
    return { start: drvToStr(folMon), end: drvToStr(folSun) };
  }
  if (window === "last_2_weeks") {
    const s = drvAddDays(today, -14);
    return { start: drvToStr(s), end: todayStr };
  }
  if (window === "last_90_days") {
    const s = drvAddDays(today, -90);
    return { start: drvToStr(s), end: todayStr };
  }
  return { start: custom.start, end: custom.end };
}

function WIWShiftBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    // Acceptance-state statuses (derived from WIW v2 flags)
    unpublished: "bg-muted text-muted-foreground",
    published:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    alerted:     "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    accepted:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    // Attendance-state statuses (from WIW numeric status field)
    confirmed:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    denied:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    late:        "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    absent:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    started:     "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    finished:    "bg-muted text-muted-foreground",
    open:        "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  const s = status ?? "unknown";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${map[s] ?? "bg-muted text-muted-foreground"}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function WIWApprovalBadge({ status }: { status: string | null }) {
  // No fallback — null/missing status maps to 'unknown' per data-integrity policy.
  const s = status ?? "unknown";
  const map: Record<string, { cls: string; label: string }> = {
    approved:   { cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",   label: "Approved" },
    unreviewed: { cls: "bg-muted text-muted-foreground",                                          label: "Unreviewed" },
    rejected:   { cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",           label: "Rejected" },
    unknown:    { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", label: "Unknown" },
  };
  const { cls, label } = map[s] ?? map.unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Shift Status Banner ───────────────────────────────────────────────────────

interface ShiftStatusBannerProps {
  status: "ON_SHIFT" | "SCHEDULED_NOT_CLOCKED_IN" | "LATE" | "NO_SHOW" | "OFF_SHIFT";
  shiftStart: string | null;
  shiftEnd: string | null;
  clockIn: string | null;
  minutesLate: number | null;
  evaluatedAt: string;
}

function ShiftStatusBanner({ status, shiftStart, shiftEnd, clockIn, minutesLate, evaluatedAt }: ShiftStatusBannerProps) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const shiftRange = shiftStart && shiftEnd ? `${fmt(shiftStart)} – ${fmt(shiftEnd)}` : null;
  const evalTime  = new Date(evaluatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const config: Record<string, {
    bg: string; border: string; dot: string; titleColor: string;
    title: string; description: string;
  }> = {
    ON_SHIFT: {
      bg: "bg-green-50 dark:bg-green-950/30",
      border: "border-green-200 dark:border-green-800",
      dot: "bg-green-500",
      titleColor: "text-green-800 dark:text-green-300",
      title: "On Shift",
      description: clockIn
        ? `Clocked in at ${fmt(clockIn)}${shiftRange ? ` · Shift ${shiftRange}` : ""}`
        : `Active shift${shiftRange ? `: ${shiftRange}` : ""}`,
    },
    SCHEDULED_NOT_CLOCKED_IN: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      dot: "bg-blue-500",
      titleColor: "text-blue-800 dark:text-blue-300",
      title: "Scheduled — Not Clocked In",
      description: shiftRange ? `Shift ${shiftRange} · Within grace period` : "Within grace period",
    },
    LATE: {
      bg: "bg-orange-50 dark:bg-orange-950/30",
      border: "border-orange-200 dark:border-orange-800",
      dot: "bg-orange-500",
      titleColor: "text-orange-800 dark:text-orange-300",
      title: minutesLate != null ? `Late · ${minutesLate}m past grace` : "Late",
      description: shiftRange ? `Shift ${shiftRange} · No clock-in recorded` : "No clock-in recorded",
    },
    NO_SHOW: {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
      dot: "bg-red-500",
      titleColor: "text-red-800 dark:text-red-300",
      title: "No Show",
      description: shiftRange ? `Shift ${shiftRange} ended · No clock-in recorded` : "Shift ended · No clock-in recorded",
    },
    OFF_SHIFT: {
      bg: "bg-muted/40",
      border: "border-border",
      dot: "bg-muted-foreground/40",
      titleColor: "text-muted-foreground",
      title: "Off Shift",
      description: "No active or scheduled shift in the current window",
    },
  };

  const c = config[status] ?? config.OFF_SHIFT;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-4 py-3 ${c.bg} ${c.border}`}
      data-testid="card-driver-shift-status"
    >
      <div className="mt-0.5 shrink-0 flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${c.dot} ${status === "ON_SHIFT" ? "animate-pulse" : ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-tight ${c.titleColor}`}>{c.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-muted-foreground/70">Evaluated</p>
        <p className="text-[10px] text-muted-foreground">{evalTime}</p>
      </div>
    </div>
  );
}

// ── WIW Time-Off History sub-section (inside DriverWIWTab) ───────────────────
function DriverTimeOffSection({ driverId }: { driverId: string }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const { data, isLoading, isError } = useQuery<{
    summary: {
      daysLast60: number; hoursLast60: number | null;
      daysYtd: number; hoursYtd: number | null;
      requestsYtd: number;
    };
    requests: Array<{
      id: string; startDate: string; endDate: string;
      totalDays: number | null; totalHours: number | null;
      requestType: string | null; status: string;
      submittedAt: string | null; approvedDeniedAt: string | null;
      externalRequestId: string; notes: string | null;
    }>;
  }>({
    queryKey: ["/api/wiw/time-off/driver", driverId],
    queryFn: async () => {
      const r = await fetch(`/api/wiw/time-off/driver/${driverId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (data?.requests ?? []).filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (periodFilter === "60d") {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
      return new Date(r.startDate) >= cutoff;
    }
    if (periodFilter === "ytd") {
      return new Date(r.startDate).getFullYear() === new Date().getFullYear();
    }
    return true;
  });

  const statusColors: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    pending:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    denied:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    cancelled:"bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  function fmtD(d: string | null) {
    if (!d) return "—";
    try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }); }
    catch { return d; }
  }

  const s = data?.summary;

  return (
    <Card data-testid="driver-time-off-section">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-amber-500" />
              WIW Time-Off History
            </CardTitle>
            <CardDescription className="mt-1">Time-off requests from When I Work</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "60d", "ytd"] as const).map(p => (
              <Button key={p} size="sm" variant={periodFilter === p ? "default" : "outline"}
                onClick={() => setPeriodFilter(p)} className="h-7 text-xs">
                {p === "all" ? "All Time" : p === "60d" ? "Last 60 Days" : "This Year"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary KPIs */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : s ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Days Off (60d)", value: s.daysLast60.toFixed(1) },
              { label: "Hours Off (60d)", value: s.hoursLast60 != null ? s.hoursLast60.toFixed(1) : "—" },
              { label: "Days Off (YTD)", value: s.daysYtd.toFixed(1) },
              { label: "Hours Off (YTD)", value: s.hoursYtd != null ? s.hoursYtd.toFixed(1) : "—" },
              { label: "Requests (YTD)", value: s.requestsYtd.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {["all", "approved", "pending", "denied", "cancelled"].map(st => (
            <Button key={st} size="sm" variant={statusFilter === st ? "default" : "outline"}
              onClick={() => setStatusFilter(st)} className="h-7 text-xs capitalize">
              {st === "all" ? "All Statuses" : st}
            </Button>
          ))}
        </div>

        {/* Detail table */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-4">Could not load time-off records</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <Palmtree className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No time-off records</p>
            <p className="text-xs text-muted-foreground/70">No records match the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                  <th className="px-3 py-2 font-medium">Start</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2 font-medium text-right">Days</th>
                  <th className="px-3 py-2 font-medium text-right">Hours</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                  <th className="px-3 py-2 font-medium">WIW ID</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtD(r.startDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtD(r.endDate)}</td>
                    <td className="px-3 py-2 text-right">{r.totalDays != null ? r.totalDays.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 text-right">{r.totalHours != null ? r.totalHours.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 capitalize text-muted-foreground text-xs">{r.requestType ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium capitalize ${statusColors[r.status] ?? "bg-muted text-muted-foreground"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.externalRequestId}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DriverWIWTab({ driverId }: { driverId: string }) {
  const { toast } = useToast();
  const [dateWindow, setDateWindow] = useState<WIWDateWindow>("last_2_weeks");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // ── Absence/Notice date window — independent of schedule window, defaults to 90 days ──
  const [absenceWindow, setAbsenceWindow] = useState<WIWDateWindow>("last_90_days");
  const [absenceCustomStart, setAbsenceCustomStart] = useState("");
  const [absenceCustomEnd, setAbsenceCustomEnd] = useState("");
  const [selectedTimeIds, setSelectedTimeIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Sheet open states
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [timeHistorySheetOpen, setTimeHistorySheetOpen] = useState(false);
  const [issuesSheetOpen, setIssuesSheetOpen] = useState(false);

  // Real-time shift status from the Status Engine
  const { data: tabShiftStatus } = useQuery<{
    status: "ON_SHIFT" | "SCHEDULED_NOT_CLOCKED_IN" | "LATE" | "NO_SHOW" | "OFF_SHIFT";
    shiftStart: string | null;
    shiftEnd: string | null;
    clockIn: string | null;
    minutesLate: number | null;
    wiwUserId: string | null;
    evaluatedAt: string;
  }>({
    queryKey: ["/api/scheduling/wheniwork/driver-shift-status", driverId],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/driver-shift-status?driverId=${driverId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const { data: wiwIntegration, isLoading: wiwIntegrationLoading } = useQuery<{
    wiw_user_id: string | null;
    wiw_email: string | null;
    wiw_workplace_id: string | null;
    wiw_sync_status: string | null;
    wiw_last_seen_at: string | null;
    wiw_external_user_id: string | null;
    wiw_user_name: string | null;
    match_method: string | null;
    match_status: string | null;
    wiw_user_status: string | null;
    wiw_account_id: number | null;
    wiw_user_synced_at: string | null;
  }>({
    queryKey: ["/api/drivers", driverId, "wiw-integration"],
    queryFn: async () => {
      const r = await fetch(`/api/drivers/${driverId}/wiw-integration`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  // ── WIW data availability range ───────────────────────────────────────────
  const { data: wiwRangeData } = useQuery<{ minShiftDate: string | null; maxShiftDate: string | null }>({
    queryKey: ["/api/scheduling/wheniwork/data-range"],
    queryFn: async () => {
      const r = await fetch("/api/scheduling/wheniwork/data-range", { credentials: "include" });
      if (!r.ok) return { minShiftDate: null, maxShiftDate: null };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const drvMaxShiftDate = wiwRangeData?.maxShiftDate ?? null;

  const { start, end } = wiwWindowDates(dateWindow, { start: customStart, end: customEnd });
  const todayStr = drvToStr(new Date()); // local date — not UTC

  // ── Clock Activity: fixed independent look-back (always last 14 days from today) ──
  // Clock records are inherently retrospective, so they should always show recent
  // activity regardless of which schedule date window is selected (e.g., "Next Week").
  const clockStart = drvToStr(drvAddDays(new Date(), -14));
  const clockEnd   = todayStr;

  // ── Absence/Notice window — user-selectable, defaults to last 90 days ─────
  const { start: absenceStart, end: absenceEnd } = wiwWindowDates(absenceWindow, {
    start: absenceCustomStart,
    end:   absenceCustomEnd,
  });

  // ── Upcoming shifts query bounds ──────────────────────────────────────────
  // Start from today (or window start if window is entirely in the future).
  // End at the window end, but for "this_week" extend to end-of-week (Sunday)
  // so the rest of the current week is visible even though the date range end is today.
  const _thisMonday = drvGetThisMonday(new Date());
  const _endOfWeekStr = drvToStr(drvAddDays(_thisMonday, 6));
  const upcomingQueryStart = start && start > todayStr ? start : todayStr;
  const upcomingQueryEnd   = dateWindow === "this_week" ? _endOfWeekStr : (end || todayStr);

  function fmtDt(v: string | null) {
    if (!v) return "—";
    try { return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }); }
    catch { return v; }
  }
  function fmtTime(v: string | null) {
    if (!v) return "—";
    try { return new Date(v).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); }
    catch { return v; }
  }
  function fmtDate(v: string | null) {
    if (!v) return "—";
    try { return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return v; }
  }
  /** Format an ISO timestamp in the given IANA timezone with TZ suffix.
   *  includeDate=true → "Mar 31, 11:00 AM EST"
   *  includeDate=false → "11:00 AM EST"
   *  Falls back to UTC when tz is null (location timezone not yet synced from WIW). */
  function fmtWithTZ(iso: string | null, tz: string | null, includeDate = false): string {
    if (!iso) return "—";
    const zone = tz ?? "UTC";
    try {
      const opts: Intl.DateTimeFormatOptions = {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        ...(includeDate ? { month: "short", day: "numeric" } : {}),
      };
      return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
    } catch {
      return fmtDt(iso);
    }
  }
  function fmtHours(minutes: number | null) {
    if (minutes == null) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  // ── Summary metrics ──────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<{
    scheduledHoursThisWeek: number;
    workedHoursThisWeek: number;
    approvedHours: number;
    attendanceIssues30d: number;
    nextShift: any | null;
  }>({
    queryKey: ["/api/scheduling/wheniwork/driver-summary", driverId],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/driver-summary?driverId=${driverId}`, { credentials: "include" });
      if (!r.ok) return { scheduledHoursThisWeek: 0, workedHoursThisWeek: 0, approvedHours: 0, attendanceIssues30d: 0, nextShift: null };
      return r.json();
    },
    enabled: !!driverId,
  });

  // ── Upcoming shifts (date-window-aware, from today or window start forward) ─
  const { data: upcomingData, isLoading: upcomingLoading, refetch: refetchUpcoming } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/shifts", "upcoming", driverId, upcomingQueryStart, upcomingQueryEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ driverId, pageSize: "30" });
      if (upcomingQueryStart) params.set("start", upcomingQueryStart);
      if (upcomingQueryEnd)   params.set("end",   upcomingQueryEnd);
      const r = await fetch(`/api/scheduling/wheniwork/shifts?${params}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      const data = await r.json();
      // Sort ascending so nearest shifts appear first
      return { records: (data.records ?? []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()) };
    },
    enabled: !!driverId,
  });

  // ── Clock activity (always last 14 days — independent of schedule date window) ─
  const { data: timesData, isLoading: timesLoading, refetch: refetchTimes } = useQuery<{ records: any[]; counts: any }>({
    queryKey: ["/api/scheduling/wheniwork/times", driverId, clockStart, clockEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ driverId, pageSize: "50" });
      params.set("start", clockStart);
      params.set("end",   clockEnd);
      const r = await fetch(`/api/scheduling/wheniwork/times?${params}`, { credentials: "include" });
      if (!r.ok) return { records: [], counts: {} };
      return r.json();
    },
    enabled: !!driverId,
  });

  // ── Absences (absence-window-aware, defaults to last 90 days) ───────────
  const { data: absencesData, isLoading: absencesLoading, refetch: refetchAbsences } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/absences", driverId, absenceStart, absenceEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ driverId, pageSize: "100" });
      if (absenceStart) params.set("start", absenceStart);
      if (absenceEnd)   params.set("end",   absenceEnd);
      const r = await fetch(`/api/scheduling/wheniwork/absences?${params}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!driverId,
  });

  // ── Notices (absence-window-aware, defaults to last 90 days) ────────────
  const { data: noticesData, isLoading: noticesLoading, refetch: refetchNotices } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/notices", driverId, absenceStart, absenceEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ driverId, pageSize: "100" });
      if (absenceStart) params.set("start", absenceStart);
      if (absenceEnd)   params.set("end",   absenceEnd);
      const r = await fetch(`/api/scheduling/wheniwork/notices?${params}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!driverId,
  });

  // ── Full schedule (60-day past + 60-day future) — loaded lazily when Sheet opens ─
  const scheduleRange = (() => {
    const d = new Date();
    const past = new Date(d); past.setDate(d.getDate() - 60);
    const future = new Date(d); future.setDate(d.getDate() + 60);
    return { start: past.toISOString().split("T")[0], end: future.toISOString().split("T")[0] };
  })();
  const { data: fullScheduleData, isLoading: fullScheduleLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/shifts", "full", driverId],
    queryFn: async () => {
      const r = await fetch(
        `/api/scheduling/wheniwork/shifts?driverId=${driverId}&start=${scheduleRange.start}&end=${scheduleRange.end}&pageSize=200`,
        { credentials: "include" }
      );
      if (!r.ok) return { records: [] };
      const data = await r.json();
      return { records: (data.records ?? []).sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()) };
    },
    enabled: !!driverId && scheduleSheetOpen,
  });

  // ── Full time history (90 days) — loaded lazily when Sheet opens ─────────
  const historyRange = (() => {
    const d = new Date();
    const past = new Date(d); past.setDate(d.getDate() - 90);
    return { start: past.toISOString().split("T")[0], end: d.toISOString().split("T")[0] };
  })();
  const { data: fullHistoryData, isLoading: fullHistoryLoading } = useQuery<{ records: any[]; counts: any }>({
    queryKey: ["/api/scheduling/wheniwork/times", "full", driverId],
    queryFn: async () => {
      const r = await fetch(
        `/api/scheduling/wheniwork/times?driverId=${driverId}&start=${historyRange.start}&end=${historyRange.end}&pageSize=200`,
        { credentials: "include" }
      );
      if (!r.ok) return { records: [], counts: {} };
      return r.json();
    },
    enabled: !!driverId && timeHistorySheetOpen,
  });

  // ── Issues (30-day absences + notices) — loaded lazily when Sheet opens ──
  const issues30Range = (() => {
    const d = new Date();
    const past = new Date(d); past.setDate(d.getDate() - 30);
    return { start: past.toISOString().split("T")[0], end: d.toISOString().split("T")[0] };
  })();
  const { data: issues30AbsData, isLoading: issues30AbsLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/absences", "30d", driverId],
    queryFn: async () => {
      const r = await fetch(
        `/api/scheduling/wheniwork/absences?driverId=${driverId}&start=${issues30Range.start}&end=${issues30Range.end}&pageSize=100`,
        { credentials: "include" }
      );
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!driverId && issuesSheetOpen,
  });
  const { data: issues30NtcData, isLoading: issues30NtcLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/notices", "30d", driverId],
    queryFn: async () => {
      const r = await fetch(
        `/api/scheduling/wheniwork/notices?driverId=${driverId}&start=${issues30Range.start}&end=${issues30Range.end}&pageSize=100`,
        { credentials: "include" }
      );
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!driverId && issuesSheetOpen,
  });

  const upcomingShifts = upcomingData?.records ?? [];
  const times          = timesData?.records ?? [];
  const absences       = absencesData?.records ?? [];
  const notices        = noticesData?.records ?? [];

  // Helper: map raw WIW absence rows to display rows
  function mapAbsenceRow(a: any) {
    const typeLabel = WIW_ABSENCE_TYPE[String(a.type ?? a.reason ?? "0")] ?? `Type ${a.type ?? a.reason ?? "0"}`;
    const statusLabel = WIW_ABSENCE_STATUS[String(a.status ?? "0")] ?? `Status ${a.status}`;
    const mins = a.duration_minutes ?? 0;
    const details = mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m ` : ""}` : "";
    return { id: `abs-${a.id}`, _type: "absence" as const, date: a.date ?? "", type: typeLabel, details: details.trim() || "—", status: statusLabel };
  }

  // Merge absences + notices for a combined view, sorted by date desc
  const issueRows: Array<{ id: string; _type: "absence" | "notice"; date: string; type: string; details: string; status: string }> = [
    ...absences.map((a: any) => mapAbsenceRow(a)),
    ...notices.map((n: any) => ({
      id: `ntc-${n.id}`, _type: "notice" as const,
      date: n.occurred_at ? n.occurred_at.split("T")[0] : "",
      type: n.type?.replace(/_/g, " ") ?? "Notice",
      details: [n.minutes_late != null ? `${n.minutes_late} min late` : null, n.notes ?? null].filter(Boolean).join(" · ") || "—",
      status: n.resolved ? "Resolved" : "Open",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // ── Approve / Reject mutations ────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await apiRequest("POST", "/api/scheduling/wheniwork/times/approve", { ids });
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.updated} record(s) approved` });
      setSelectedTimeIds([]);
      refetchTimes();
      refetchSummary();
    },
    onError: () => toast({ title: "Approval failed", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await apiRequest("POST", "/api/scheduling/wheniwork/times/reject", { ids });
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.updated} record(s) rejected` });
      setSelectedTimeIds([]);
      refetchTimes();
    },
    onError: () => toast({ title: "Rejection failed", variant: "destructive" }),
  });

  // ── Sync this driver's WIW data ───────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      // Trigger a short incremental sync window for all four entities
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      await Promise.all([
        fetch(`/api/scheduling/wheniwork/sync/shifts?updatedSince=${since}`, { method: "POST", credentials: "include" }),
        fetch(`/api/scheduling/wheniwork/sync/times?updatedSince=${since}`,  { method: "POST", credentials: "include" }),
        fetch(`/api/scheduling/wheniwork/sync/absences?updatedSince=${since}`, { method: "POST", credentials: "include" }),
        fetch(`/api/scheduling/wheniwork/sync/notices?updatedSince=${since}`, { method: "POST", credentials: "include" }),
      ]);
      await Promise.all([refetchSummary(), refetchUpcoming(), refetchTimes(), refetchAbsences(), refetchNotices()]);
      toast({ title: "WIW data refreshed" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  // ── Checkbox helpers ──────────────────────────────────────────────────────
  function toggleTime(id: string) {
    setSelectedTimeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAllTimes() {
    const unreviewedIds = times.filter((t: any) => t.approval_status === "unreviewed").map((t: any) => t.id);
    setSelectedTimeIds(prev => prev.length === unreviewedIds.length ? [] : unreviewedIds);
  }

  const unreviewedTimes = times.filter((t: any) => t.approval_status === "unreviewed");
  const allUnreviewedSelected = unreviewedTimes.length > 0 && selectedTimeIds.length === unreviewedTimes.length;

  return (
    <div className="space-y-6" data-testid="wiw-scheduling-tab">
      {/* ── WIW Identity Mapping Card ────────────────────────────────────── */}
      {(() => {
        const WORKPLACE_NAMES: Record<string, string> = {
          "3725440": "Main",
          "4244009": "IL & NY",
          "4280572": "CA",
        };
        const synced  = wiwIntegration?.wiw_sync_status === "synced";
        const method  = wiwIntegration?.match_method;
        const wpId       = wiwIntegration?.wiw_workplace_id ?? wiwIntegration?.wiw_account_id?.toString();
        const wpName     = wpId ? (WORKPLACE_NAMES[wpId] ?? `Workplace ${wpId}`) : null;
        const lastSeen   = wiwIntegration?.wiw_last_seen_at
          ? new Date(wiwIntegration.wiw_last_seen_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : null;
        return (
          <Card data-testid="card-wiw-integration">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">WIW Identity Mapping</CardTitle>
                <CardDescription className="text-xs">When I Work user linked to this driver profile</CardDescription>
              </div>
              {wiwIntegrationLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <Badge
                  variant={synced ? "default" : "secondary"}
                  className={synced ? "bg-emerald-600 text-white" : ""}
                  data-testid="badge-wiw-sync-status"
                >
                  {synced ? "Linked" : (wiwIntegration?.wiw_sync_status ?? "Unlinked")}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {wiwIntegrationLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : wiwIntegration?.wiw_user_id ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="text-muted-foreground">WIW Name</div>
                  <div className="font-medium truncate" data-testid="text-wiw-user-name">{wiwIntegration.wiw_user_name ?? "—"}</div>
                  <div className="text-muted-foreground">WIW User ID</div>
                  <div className="font-mono text-xs truncate" data-testid="text-wiw-external-id">{wiwIntegration.wiw_external_user_id ?? "—"}</div>
                  <div className="text-muted-foreground">Email</div>
                  <div className="truncate" data-testid="text-wiw-email">{wiwIntegration.wiw_email ?? "—"}</div>
                  <div className="text-muted-foreground">Workplace</div>
                  <div data-testid="text-wiw-workplace">{wpName ?? "—"}</div>
                  <div className="text-muted-foreground">Match Method</div>
                  <div>
                    {method ? (
                      <Badge variant="outline" className="capitalize text-xs" data-testid="badge-match-method">{method.replace(/_/g, " ")}</Badge>
                    ) : "—"}
                  </div>
                  <div className="text-muted-foreground">WIW Status</div>
                  <div>
                    <Badge
                      variant={wiwIntegration.wiw_user_status === "active" ? "default" : "secondary"}
                      className={`text-xs capitalize ${wiwIntegration.wiw_user_status === "active" ? "bg-emerald-600 text-white" : ""}`}
                      data-testid="badge-wiw-user-status"
                    >
                      {wiwIntegration.wiw_user_status ?? "—"}
                    </Badge>
                  </div>
                  {lastSeen && (
                    <>
                      <div className="text-muted-foreground">Last Seen</div>
                      <div className="text-muted-foreground text-xs" data-testid="text-wiw-last-seen">{lastSeen}</div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-wiw-no-link">
                  No WIW user linked. Run auto-match or manually link from the WIW User Mapping console.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Header + Actions ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Scheduling &amp; Attendance</h3>
          <p className="text-sm text-muted-foreground">When I Work data — synced from canonical tables</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScheduleSheetOpen(true)}
            data-testid="btn-wiw-view-schedule"
          >
            <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
            Full Schedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTimeHistorySheetOpen(true)}
            data-testid="btn-wiw-view-history"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Time History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            data-testid="btn-wiw-sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync WIW Data"}
          </Button>
        </div>
      </div>

      {/* ── Real-Time Shift Status Banner ────────────────────────────────── */}
      {tabShiftStatus?.wiwUserId && (
        <ShiftStatusBanner
          status={tabShiftStatus.status}
          shiftStart={tabShiftStatus.shiftStart}
          shiftEnd={tabShiftStatus.shiftEnd}
          clockIn={tabShiftStatus.clockIn}
          minutesLate={tabShiftStatus.minutesLate}
          evaluatedAt={tabShiftStatus.evaluatedAt}
        />
      )}

      {/* ── OT Watch ─────────────────────────────────────────────────────── */}
      <DriverOTWatchCard driverId={driverId} />

      {/* ── Summary metrics ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Scheduled This Week */}
        <Card data-testid="metric-wiw-scheduled">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Scheduled This Week</p>
              <CalendarCheck className="w-4 h-4 text-muted-foreground" />
            </div>
            {summaryLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-2xl font-bold">{summary?.scheduledHoursThisWeek ?? 0}h</p>
            )}
          </CardContent>
        </Card>

        {/* Worked This Week — shows ratio + mini progress bar */}
        <Card data-testid="metric-wiw-worked">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Worked This Week</p>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            {summaryLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (() => {
              const worked = summary?.workedHoursThisWeek ?? 0;
              const sched  = summary?.scheduledHoursThisWeek ?? 0;
              const pct    = sched > 0 ? Math.min((worked / sched) * 100, 100) : 0;
              return (
                <>
                  <p className={`text-2xl font-bold ${wiwWorkedRatioColor(worked, sched)}`}>
                    {worked.toFixed(1)}h
                    {sched > 0 && <span className="text-sm font-normal text-muted-foreground"> / {sched}h</span>}
                  </p>
                  {sched > 0 && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${wiwWorkedRatioBarColor(worked, sched)}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Approved Hours */}
        <Card data-testid="metric-wiw-approved">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Approved Hours</p>
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            {summaryLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-2xl font-bold">{summary?.approvedHours ?? 0}h</p>
            )}
          </CardContent>
        </Card>

        {/* Issues (30 days) — clickable drill-down */}
        <Card
          data-testid="metric-wiw-issues"
          className={(summary?.attendanceIssues30d ?? 0) > 0 ? "cursor-pointer hover-elevate" : ""}
          onClick={() => { if ((summary?.attendanceIssues30d ?? 0) > 0) setIssuesSheetOpen(true); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Issues (30 days)</p>
              <AlertOctagon className="w-4 h-4 text-muted-foreground" />
            </div>
            {summaryLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <div className="flex items-end justify-between">
                <p className={`text-2xl font-bold ${(summary?.attendanceIssues30d ?? 0) > 0 ? "text-destructive" : ""}`}>
                  {summary?.attendanceIssues30d ?? 0}
                </p>
                {(summary?.attendanceIssues30d ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground mb-1">click to view</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Date range filter ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Date Window</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "this_week",      label: "This Week" },
                  { key: "next_week",      label: "Next Week" },
                  { key: "following_week", label: "Following Week" },
                  { key: "last_2_weeks",   label: "Last 2 Weeks" },
                  { key: "custom",         label: "Custom Range" },
                ] as { key: WIWDateWindow; label: string }[]
              ).map(({ key: w, label }) => {
                const windowRange = wiwWindowDates(w, { start: customStart, end: customEnd });
                const isBeyondMax = drvMaxShiftDate && windowRange.end > drvMaxShiftDate;
                return (
                  <Button
                    key={w}
                    size="sm"
                    variant={dateWindow === w ? "default" : "outline"}
                    onClick={() => {
                      setDateWindow(w);
                      if (w !== "custom") {
                        const computed = wiwWindowDates(w, { start: customStart, end: customEnd });
                        setCustomStart(computed.start);
                        setCustomEnd(computed.end);
                      }
                    }}
                    data-testid={`filter-wiw-${w}`}
                    title={isBeyondMax ? `Limited data — schedules available through ${fmtMDYShort(drvMaxShiftDate!)}` : undefined}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            {dateWindow !== "custom" && (
              <span className="text-xs text-muted-foreground ml-auto">
                {fmtMDYShort(start)} — {fmtMDYShort(end)}
              </span>
            )}
          </div>
          {/* Guardrail: warn when selected window extends past available data */}
          {drvMaxShiftDate && end > drvMaxShiftDate && (
            <div className="flex items-start gap-2 mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-wiw-beyond-range">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                No schedule data available beyond <strong>{fmtMDYShort(drvMaxShiftDate)}</strong>. WIW schedules are typically published 1–2 weeks ahead.
              </span>
            </div>
          )}
          {dateWindow === "custom" && (
            <div className="flex flex-wrap items-center gap-2 mt-2 ml-1">
              <Input
                type="date"
                value={customStart}
                max={drvMaxShiftDate ?? undefined}
                onChange={e => setCustomStart(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="input-wiw-custom-start"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                value={customEnd}
                max={drvMaxShiftDate ?? undefined}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="input-wiw-custom-end"
              />
              {drvMaxShiftDate && (
                <span className="text-xs text-muted-foreground" data-testid="text-wiw-max-hint">
                  Data available through {fmtMDYShort(drvMaxShiftDate)}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Upcoming Shifts ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarRange className="w-4 h-4" />
              Upcoming Shifts
            </CardTitle>
            <CardDescription>Based on selected date range ({fmtMDYShort(upcomingQueryStart)} – {fmtMDYShort(upcomingQueryEnd)})</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : upcomingShifts.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center px-4" data-testid="empty-upcoming-shifts">
              <CalendarRange className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {upcomingQueryStart > todayStr
                  ? `No shifts scheduled for ${fmtMDYShort(upcomingQueryStart)} – ${fmtMDYShort(upcomingQueryEnd)}.`
                  : "No upcoming shifts found for this driver within the selected date range."}
              </p>
              {drvMaxShiftDate && upcomingQueryEnd > drvMaxShiftDate && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5" data-testid="text-upcoming-beyond-range">
                  Schedule data is only available through {fmtMDYShort(drvMaxShiftDate)}.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Start</th>
                    <th className="px-4 py-2.5 font-medium">End</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5 font-medium">Position</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingShifts.map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0 hover-elevate" data-testid={`row-shift-${s.id}`}>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                        {fmtDate(s.start_time)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtWithTZ(s.start_time, s.location_timezone)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtWithTZ(s.end_time, s.location_timezone)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.location_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.position_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <WIWShiftBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Clock Activity ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Clock Activity
            </CardTitle>
            <CardDescription>
              Time records — last 14 days ({fmtMDYShort(clockStart)} – {fmtMDYShort(clockEnd)})
              {timesData?.counts?.unreviewed > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {timesData.counts.unreviewed} unreviewed
                </Badge>
              )}
            </CardDescription>
          </div>
          {selectedTimeIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedTimeIds.length} selected</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => approveMutation.mutate(selectedTimeIds)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                data-testid="btn-wiw-approve-selected"
              >
                <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectMutation.mutate(selectedTimeIds)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                data-testid="btn-wiw-reject-selected"
              >
                <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
                Reject
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {timesLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : times.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No clock records found in this date range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allUnreviewedSelected}
                        onChange={toggleAllTimes}
                        className="rounded"
                        title="Select all unreviewed"
                        data-testid="checkbox-wiw-select-all-times"
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">Clock In</th>
                    <th className="px-4 py-2.5 font-medium">Clock Out</th>
                    <th className="px-4 py-2.5 font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {times.map((t: any) => {
                    const isUnreviewed = t.approval_status === "unreviewed";
                    const isSelected = selectedTimeIds.includes(t.id);
                    return (
                      <tr
                        key={t.id}
                        className={`border-b last:border-0 ${isSelected ? "bg-muted/40" : "hover-elevate"}`}
                        data-testid={`row-time-${t.id}`}
                      >
                        <td className="px-4 py-2.5">
                          {isUnreviewed ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTime(t.id)}
                              className="rounded"
                              data-testid={`checkbox-time-${t.id}`}
                            />
                          ) : (
                            <span className="w-4 block" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium">{fmtWithTZ(t.clock_in, t.location_timezone, true)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {t.clock_out ? fmtWithTZ(t.clock_out, t.location_timezone, true) : <span className="italic text-muted-foreground/60">ongoing</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{fmtHours(t.total_minutes)}</td>
                        <td className="px-4 py-2.5">
                          <WIWApprovalBadge status={t.approval_status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Absences & Notices ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertOctagon className="w-4 h-4" />
                Absences &amp; Notices
              </CardTitle>
              <CardDescription className="mt-1">
                Attendance events — {absenceWindow === "last_90_days" ? "last 90 days" : absenceWindow === "this_week" ? "this week" : absenceWindow === "last_2_weeks" ? "last 2 weeks" : "custom range"}
                {absenceStart && absenceEnd ? ` (${fmtMDYShort(absenceStart)} – ${fmtMDYShort(absenceEnd)})` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["last_90_days", "last_2_weeks", "this_week", "custom"] as WIWDateWindow[]).map(w => (
                <Button
                  key={w}
                  size="sm"
                  variant={absenceWindow === w ? "default" : "outline"}
                  onClick={() => setAbsenceWindow(w)}
                  data-testid={`btn-absence-window-${w}`}
                >
                  {w === "last_90_days" ? "90 Days" : w === "last_2_weeks" ? "2 Weeks" : w === "this_week" ? "This Week" : "Custom"}
                </Button>
              ))}
            </div>
          </div>
          {absenceWindow === "custom" && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input
                type="date"
                value={absenceCustomStart}
                onChange={e => setAbsenceCustomStart(e.target.value)}
                className="border rounded-md px-2 h-9 text-sm bg-background"
                data-testid="input-absence-custom-start"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <input
                type="date"
                value={absenceCustomEnd}
                onChange={e => setAbsenceCustomEnd(e.target.value)}
                className="border rounded-md px-2 h-9 text-sm bg-background"
                data-testid="input-absence-custom-end"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {(absencesLoading || noticesLoading) ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : issueRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <AlertOctagon className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No attendance events in selected date range</p>
              <p className="text-xs text-muted-foreground/70">
                {absenceStart && absenceEnd
                  ? `Searched ${fmtMDYShort(absenceStart)} – ${fmtMDYShort(absenceEnd)}`
                  : "No date range selected"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Details</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {issueRows.map(row => (
                    <tr key={row.id} className="border-b last:border-0 hover-elevate" data-testid={`row-issue-${row.id}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          row._type === "absence"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.details || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          row.status === "approved" || row.status === "resolved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                            : row.status === "denied" || row.status === "rejected"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── WIW Time-Off History ─────────────────────────────────────────── */}
      <DriverTimeOffSection driverId={driverId} />

      {/* ── Full Schedule Sheet ───────────────────────────────────────────── */}
      <Sheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4" /> Full Schedule
            </SheetTitle>
            <SheetDescription>All shifts within 60 days (past &amp; future)</SheetDescription>
          </SheetHeader>
          {fullScheduleLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (fullScheduleData?.records ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No shifts found in this date range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">End</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Position</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fullScheduleData?.records ?? []).map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0 hover-elevate">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtDate(s.start_time)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtWithTZ(s.start_time, s.location_timezone)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtWithTZ(s.end_time, s.location_timezone)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.location_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.position_name ?? "—"}</td>
                      <td className="px-3 py-2"><WIWShiftBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Time History Sheet ────────────────────────────────────────────── */}
      <Sheet open={timeHistorySheetOpen} onOpenChange={setTimeHistorySheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4" /> Time History
            </SheetTitle>
            <SheetDescription>All clock records for the last 90 days</SheetDescription>
          </SheetHeader>
          {fullHistoryLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (fullHistoryData?.records ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No clock records in the last 90 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-3 py-2 font-medium">Clock In</th>
                    <th className="px-3 py-2 font-medium">Clock Out</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {(fullHistoryData?.records ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b last:border-0 hover-elevate">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtWithTZ(t.clock_in, t.location_timezone, true)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {t.clock_out ? fmtWithTZ(t.clock_out, t.location_timezone, true) : <span className="italic text-muted-foreground/60">ongoing</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtHours(t.total_minutes)}</td>
                      <td className="px-3 py-2"><WIWApprovalBadge status={t.approval_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Issues Drill-Down Sheet ───────────────────────────────────────── */}
      <Sheet open={issuesSheetOpen} onOpenChange={setIssuesSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-destructive" /> Attendance Issues — Last 30 Days
            </SheetTitle>
            <SheetDescription>
              Issues = absences and attendance notices recorded in When I Work within the last 30 days.
            </SheetDescription>
          </SheetHeader>
          {(issues30AbsLoading || issues30NtcLoading) ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (() => {
            const rows = [
              ...(issues30AbsData?.records ?? []).map((a: any) => mapAbsenceRow(a)),
              ...(issues30NtcData?.records ?? []).map((n: any) => ({
                id: `ntc-${n.id}`, _type: "notice" as const,
                date: n.occurred_at ? n.occurred_at.split("T")[0] : "",
                type: n.type?.replace(/_/g, " ") ?? "Notice",
                details: [n.minutes_late != null ? `${n.minutes_late} min late` : null, n.notes ?? null].filter(Boolean).join(" · ") || "—",
                status: n.resolved ? "Resolved" : "Open",
              })),
            ].sort((a, b) => b.date.localeCompare(a.date));
            return rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No issues found in the last 30 days.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">{rows.length} issue{rows.length !== 1 ? "s" : ""} found</p>
                <div className="space-y-3">
                  {rows.map(row => (
                    <div key={row.id} className="rounded-md border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row._type === "absence"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                        }`}>{row._type === "absence" ? "Absence" : "Notice"}: {row.type}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.status === "Approved" || row.status === "Resolved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                            : row.status === "Denied" || row.status === "Rejected" || row.status === "Open"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-muted text-muted-foreground"
                        }`}>{row.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{fmtDate(row.date)}{row.details && row.details !== "—" ? ` · ${row.details}` : ""}</p>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [noteText, setNoteText] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteType, setNoteType] = useState("");
  const [slideNoteText, setSlideNoteText] = useState("");
  const [slideNoteType, setSlideNoteType] = useState("");
  const [notesSlideOpen, setNotesSlideOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const requestedTab = p.get("tab");
    return requestedTab === "payroll" ? "pay" : requestedTab || "profile";
  });
  const returnTo = new URLSearchParams(window.location.search).get("returnTo") || null;

  // Read-once: check if the user navigated here from a report drill-down.
  // Set by ReportBuilderWorkspace.handleDrillRow so error states can offer
  // "Back to Report" instead of routing the user to the Drivers module.
  const [reportReturnUrl] = useState<string | null>(() => {
    try { return sessionStorage.getItem("reportBuilder.returnUrl") || null; }
    catch { return null; }
  });

  // Read-once: check if the user navigated here from the Claims module.
  // Set by ClaimsQueue.navigateToDriver — cleared immediately after reading.
  const [claimsReturnUrl] = useState<string | null>(() => {
    try {
      const val = sessionStorage.getItem("driverDetail.returnUrl") || null;
      if (val) sessionStorage.removeItem("driverDetail.returnUrl");
      return val;
    } catch { return null; }
  });
  const [commentText, setCommentText] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [, setLocation] = useLocation();

  const handleTabChange = (tab: string) => {
    const normalizedTab = tab === "payroll" ? "pay" : tab;
    setActiveTab(normalizedTab);
    const p = new URLSearchParams(window.location.search);
    p.set("tab", normalizedTab);
    window.history.replaceState(null, "", `/drivers/${id}?${p.toString()}`);
  };
  const pendingChangesRef = useRef<Record<string, string>>({});
  
  // Add Claim dialog state (launched from Claims section)
  const [addClaimDialogOpen, setAddClaimDialogOpen] = useState(false);

  // Archive / Restore state
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  // ── Email compose modal state ──
  const [emailComposeOpen, setEmailComposeOpen] = useState(false);

  // ── SMS compose modal state ──
  const [smsSingleOpen,   setSmsSingleOpen]   = useState(false);
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);
  const [smsSingleMsg,    setSmsSingleMsg]     = useState("");
  const [smsSingleResult, setSmsSingleResult] = useState<any>(null);

  // ── Send MVR Request state ──
  const [sendMvrDialogOpen, setSendMvrDialogOpen] = useState(false);

  // Driver data query — must come before openEditSheet useCallback so [driver] dependency is not in TDZ
  const { data: driver, isLoading: driverLoading, isError: driverError } = useQuery<DriverWithUser>({
    queryKey: ["/api/corporate/drivers", id],
    enabled: isAuthenticated && !!id,
    retry: 1,
  });

  // Pay Profile query & state
  const { data: payProfile, isLoading: payProfileLoading, refetch: refetchPayProfile } = useQuery<any>({
    queryKey: ["/api/payroll/pay-profiles", id],
    enabled: isAuthenticated && !!id,
    retry: false,
  });
  const [payProfileEditOpen, setPayProfileEditOpen] = useState(false);
  const [payProfileForm, setPayProfileForm] = useState<Record<string, string>>({});
  const savePayProfileMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payroll/pay-profiles", {
      driverId: id,
      workerType:     payProfileForm.workerType || "IC",
      payType:        payProfileForm.payType || "per_move",
      hourlyRate:     payProfileForm.hourlyRate || null,
      otMultiplier:   payProfileForm.otMultiplier || "1.5",
      otThresholdHrs: payProfileForm.otThresholdHrs || "40",
      perMoveRate:    payProfileForm.perMoveRate || null,
      perMileRate:    payProfileForm.perMileRate || null,
      salaryAmount:   payProfileForm.salaryAmount || null,
      notes:          payProfileForm.notes || null,
    }),
    onSuccess: () => {
      setPayProfileEditOpen(false);
      refetchPayProfile();
      toast({ title: "Pay profile saved" });
    },
    onError: () => toast({ title: "Failed to save pay profile", variant: "destructive" }),
  });

  // Edit Driver sheet state
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const openEditSheet = useCallback(() => {
    if (!driver) return;
    setEditForm({
      firstName:            driver.user?.firstName ?? "",
      lastName:             driver.user?.lastName ?? "",
      email:                driver.user?.email ?? "",
      phoneNumber:          driver.phoneNumber ? formatPhone(driver.phoneNumber) : "",
      dateOfBirth:          parseFormDate(driver.dateOfBirth) ?? "",
      address:              driver.address ?? "",
      city:                 driver.city ?? "",
      state:                driver.state ?? "",
      zipCode:              driver.zipCode ?? "",
      driverNumber:         driver.driverNumber ?? "",
      driverClassification: driver.driverClassification ?? "",
      market:               (driver as any).market ?? "",
      licenseNumber:        driver.licenseNumber ?? "",
      licenseState:         driver.licenseState ?? "",
      licenseExpiry:        parseFormDate(driver.licenseExpiry) ?? "",
      emergencyContactName:  driver.emergencyContactName ?? "",
      emergencyContactPhone: driver.emergencyContactPhone ? formatPhone(driver.emergencyContactPhone) : "",
    });
    setShowEditSheet(true);
  }, [driver]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  useEffect(() => {
    const scrollEl = document.querySelector("main");
    if (!scrollEl) return;
    const onScroll = () => setIsScrolled(scrollEl.scrollTop > 50);
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, []);

  const { data: payRecords = [] } = useQuery<PayRecord[]>({
    queryKey: ["/api/corporate/drivers", id, "pay"],
    enabled: isAuthenticated && !!id,
  });

  const { data: trips = [] } = useQuery<Trip[]>({
    queryKey: ["/api/corporate/drivers", id, "trips"],
    enabled: isAuthenticated && !!id,
  });

  // ── Paginated driver moves — powers the "Moves" (trips) tab ─────────────────
  const [driverTripsPage, setDriverTripsPage]           = useState(1);
  const [driverTripsStatus, setDriverTripsStatus]       = useState("");
  const [driverTripsType, setDriverTripsType]           = useState("");
  const [driverTripsStart, setDriverTripsStart]         = useState("");
  const [driverTripsEnd, setDriverTripsEnd]             = useState("");
  const DRIVER_TRIPS_LIMIT = 25;

  const { data: driverTripsData, isLoading: driverTripsLoading } = useQuery<{
    trips: Trip[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["/api/corporate/drivers", id, "trips-paged", driverTripsPage, driverTripsStatus, driverTripsType, driverTripsStart, driverTripsEnd],
    queryFn: async () => {
      const params = new URLSearchParams({
        page:    String(driverTripsPage),
        limit:   String(DRIVER_TRIPS_LIMIT),
        sortBy:  "tripDate",
        sortDir: "desc",
        ...(driverTripsStatus && { status: driverTripsStatus }),
        ...(driverTripsType   && { moveType: driverTripsType }),
        ...(driverTripsStart  && { startDate: driverTripsStart }),
        ...(driverTripsEnd    && { endDate: driverTripsEnd }),
      });
      const r = await fetch(`/api/corporate/drivers/${id}/trips?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch driver moves");
      return r.json();
    },
    enabled: isAuthenticated && !!id && activeTab === "trips",
  });
  const driverTrips       = driverTripsData?.trips ?? [];
  const driverTripsTotal  = driverTripsData?.total ?? 0;
  const driverTripsTotalPages = Math.max(1, Math.ceil(driverTripsTotal / DRIVER_TRIPS_LIMIT));

  const { data: notes = [] } = useQuery<DriverNoteWithAuthor[]>({
    queryKey: ["/api/corporate/drivers", id, "notes"],
    enabled: isAuthenticated && !!id,
  });

  const { data: documents = [] } = useQuery<DriverDocumentWithUploader[]>({
    queryKey: ["/api/corporate/drivers", id, "documents"],
    enabled: isAuthenticated && !!id,
  });

  const { data: accidents = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/drivers", id, "accidents"],
    enabled: isAuthenticated && !!id,
  });


  /** Supplementary data for the claims list table and aggregate counts.
   *  Score/tier/components are intentionally NOT used from here — those come from lossScoreData. */
  interface DriverClaimsRisk {
    summary: {
      total: number;
      open: number;
      closed: number;
      preventable: number;
      nonPreventable: number;
      unknown: number;
      estimatedTotal: number;
      actualPaidTotal: number;
    };
    claims: Array<{
      id: string;
      incidentDate: string | null;
      incidentType: string | null;
      preventability: string | null;
      claimStatus: string | null;
      reporter: { firstName: string | null; lastName: string | null; email: string | null } | null;
      estimatedDamage: number;
      actualAmount: number | null;
    }>;
  }
  const { data: claimsRisk } = useQuery<DriverClaimsRisk>({
    queryKey: ["/api/drivers", id, "claims-risk"],
    enabled: isAuthenticated && !!id,
  });
  const [claimsSort, setClaimsSort] = useState<{
    field: "estimatedDamage" | "actualAmount" | null;
    direction: "asc" | "desc";
  }>({ field: null, direction: "desc" });
  const sortedClaims = [...(claimsRisk?.claims ?? [])].sort((a, b) => {
    if (!claimsSort.field) return 0;
    const aValue = claimsSort.field === "estimatedDamage" ? a.estimatedDamage : a.actualAmount;
    const bValue = claimsSort.field === "estimatedDamage" ? b.estimatedDamage : b.actualAmount;

    // Keep incomplete actual amounts at the bottom in either direction.
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    const comparison = aValue - bValue;
    return claimsSort.direction === "asc" ? comparison : -comparison;
  });
  const toggleClaimsSort = (field: "estimatedDamage" | "actualAmount") => {
    setClaimsSort((current) => ({
      field,
      direction: current.field === field && current.direction === "desc" ? "asc" : "desc",
    }));
  };
  const formatClaimAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  interface BenchmarkStat { companyAvg: number | null; topQuartile: number | null; }
  interface DriverRiskBenchmarks {
    insufficient?: boolean;
    sufficientData: boolean;
    minMoves: number;
    benchmarks: {
      riskScore: BenchmarkStat; claimsPerK: BenchmarkStat;
      avgCost: BenchmarkStat;   preventableRate: BenchmarkStat;
    } | null;
    position: {
      riskScore: string; claimsPerK: string; avgCost: string; preventableRate: string;
    } | null;
    overallPosition: string;
    trend: {
      riskScore: "up" | "down" | "stable";
      claimsPerK: "up" | "down" | "stable";
      avgCost: "up" | "down" | "stable";
      preventableRate: "up" | "down" | "stable";
      last90Count: number;
      prior90Count: number;
    };
  }
  const { data: riskBenchmarks } = useQuery<DriverRiskBenchmarks>({
    queryKey: ["/api/drivers", id, "risk-benchmarks"],
    enabled: isAuthenticated && !!id,
    staleTime: 5 * 60 * 1000,
  });

  interface RiskRestrictionStatus {
    driverId: string;
    riskTier: string;
    riskScore: number;
    restrictionLevel: string;
    isOverridden: boolean;
    overriddenBy: string | null;
    overrideReason: string | null;
    overriddenAt: string | null;
    lastEvaluatedAt: string | null;
    effectiveRestriction: string;
    isBlocked: boolean;
    isRestricted: boolean;
  }
  interface DriverRiskRestrictionResponse {
    status: RiskRestrictionStatus | null;
    events: Array<{ id: string; eventType: string; fromTier: string | null; toTier: string | null; fromRestriction: string | null; toRestriction: string | null; triggeredBy: string; createdAt: string; details?: any }>;
    overrideByName: string | null;
  }
  const { data: riskRestriction, refetch: refetchRestriction } = useQuery<DriverRiskRestrictionResponse>({
    queryKey: ["/api/drivers", id, "risk-restriction"],
    enabled: isAuthenticated && !!id,
    staleTime: 30 * 1000,
  });

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

  const overrideMutation = useMutation({
    mutationFn: async (reason: string) => {
      const r = await apiRequest("POST", `/api/drivers/${id}/risk-override`, { reason });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers", id, "risk-restriction"] });
      setOverrideDialogOpen(false);
      setOverrideReason("");
      toast({ title: "Override applied", description: "The driver's dispatch restriction has been lifted." });
    },
    onError: (e: any) => toast({ title: "Failed to apply override", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/drivers/${id}/risk-override`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers", id, "risk-restriction"] });
      setRevokeDialogOpen(false);
      toast({ title: "Override revoked", description: "The automatic restriction is now re-applied." });
    },
    onError: (e: any) => toast({ title: "Failed to revoke override", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const { data: comments = [] } = useQuery<DriverCommentWithAuthor[]>({
    queryKey: ["/api/corporate/drivers", id, "comments"],
    enabled: isAuthenticated && !!id,
  });

  // Fetch driver scorecard data (tier, safety, eligibility)
  interface DriverScorecard {
    tier?: { current: number; multiplier: number; description?: string; progress?: number };
    safety?: { state: string; multiplier?: number; atFaultClaimsCount?: number; claimsInWindow?: number; score?: number };
    recentPayPeriods?: any[];
    driverLossScore?: number;
    eligibilityFlags?: string[];
    last30DayMoveCount?: number;
  }
  
  const { data: scorecard, isLoading: scorecardLoading } = useQuery<DriverScorecard>({
    queryKey: ["/api/drivers", id, "safety-status"],
    enabled: isAuthenticated && !!id,
  });

  // Driver Risk Score data — score 0–100, HIGHER = SAFER (Top Performer at 85+)
  interface DriverLossScoreData {
    driverId: string;
    driverName: string;
    score: number;
    tier: 'Top Performer' | 'On Track' | 'Watch List' | 'High Risk';
    immediateReview: boolean;
    // Component risk sub-scores (0–100, higher = riskier input)
    frequencyRisk: number;
    severityRisk: number;
    mvrRisk: number;
    openExposureRisk: number;
    trendRisk: number;
    weightedRisk: number;
    riskFloorApplied: boolean;
    riskFloorReason: string | null;
    inputs: {
      preventableClaimsAllTime: number;
      atFaultCount12Months: number;
      atFaultRate12Months: number;
      claimsHistory12Months: number;
      claimsLast90Days: number;
      openClaimsCount: number;
      openReserveCents: number;
      seriousViolations12Months: number;
      activityLast90Days: number;
      activityPrior90Days: number;
      totalIncurredCents: number;
      totalClaimsAllTime: number;
      totalTripsAllTime: number;
      movesSinceLastIncident?: number;
    };
    usage: {
      eligibilityGating: boolean;
      tieringVisibility: boolean;
      futurePayModifiers: boolean;
    };
  }

  const { data: lossScoreData, isLoading: lossScoreLoading } = useQuery<DriverLossScoreData>({
    queryKey: ["/api/drivers", id, "loss-score"],
    enabled: isAuthenticated && !!id,
  });

  const { data: statusHistoryData = [], isLoading: statusHistoryLoading } = useQuery<{
    id: string;
    driverId: string;
    eventType: string;
    priorStatus: string | null;
    newStatus: string | null;
    effectiveDate: string | null;
    reasonCode: string | null;
    notes: string | null;
    sourceType: string;
    createdAt: string;
    changedByUserId: string | null;
    changedByName: string | null;
  }[]>({
    queryKey: ["/api/drivers", id, "status-history"],
    enabled: isAuthenticated && !!id && activeTab === "history",
  });

  // Linked Employee record (only relevant when driverClassification === 'Employee')
  const driverClassification = (driver as any)?.driverClassification;
  const { data: linkedEmployeeData, isLoading: linkedEmployeeLoading, refetch: refetchLinkedEmployee } = useQuery<{ employee: any | null }>({
    queryKey: ["/api/corporate/drivers", id, "linked-employee"],
    enabled: isAuthenticated && !!id && activeTab === "employee-record" && driverClassification === "Employee",
  });
  const linkedEmployee = linkedEmployeeData?.employee ?? null;

  const syncEmployeeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/drivers/${id}/sync-employee`, {}),
    onSuccess: () => {
      toast({ title: "Employee record synced", description: "The linked Employee record has been updated from this Driver record." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "linked-employee"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "sync-log"] });
      refetchLinkedEmployee();
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message || "Could not sync employee record.", variant: "destructive" });
    },
  });

  // Sync audit log — only loaded when Employee Record tab is active and employee is linked
  const { data: syncLogData } = useQuery<{ logs: any[] }>({
    queryKey: ["/api/corporate/drivers", id, "sync-log"],
    enabled: isAuthenticated && !!id && activeTab === "employee-record" && driverClassification === "Employee" && !!linkedEmployee,
  });
  const syncLogs = syncLogData?.logs ?? [];

  // Onboarding summary — lightweight status + progress for DriverDetail panel
  const { data: onboardingSummaryData } = useQuery<{
    hasEmployee: boolean;
    onboardingStatus: string | null;
    total: number;
    completed: number;
    requiredTotal: number;
    requiredCompleted: number;
    blockers: string[];
  }>({
    queryKey: ["/api/corporate/drivers", id, "onboarding-summary"],
    enabled: isAuthenticated && !!id && activeTab === "employee-record" && driverClassification === "Employee" && !!linkedEmployee,
  });
  const obSummary = onboardingSummaryData ?? null;

  // Pay explanation state and interface
  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string | null>(null);
  
  interface PayExplanationPacket {
    format: string;
    generatedAt: string;
    breakdown: {
      driverId: string;
      driverName: string;
      workerType: string;
      payPeriod: {
        id: string;
        payGroup: string;
        periodStart: string;
        periodEnd: string;
        status: string;
      };
      metricInputs: {
        tripsCompleted: number;
        safetyScore: number;
        volumeMultiplier: number;
        safetyMultiplier: number;
        rawCombinedMultiplier: number;
        clampedCombinedMultiplier: number;
        clampApplied: boolean;
      };
      policyProvenance: {
        versionId: string;
        versionName: string;
        matchType: string;
        effectiveDate: string;
      };
      payLines: Array<{
        id: string;
        payPeriodId: string;
        driverId: string;
        workerType: string;
        paidMinutes: number;
        baseRateCents: number;
        basePayCents: number;
        volumeMultiplier: number;
        safetyMultiplier: number;
        effectiveMultiplier: number;
        adjustedPayCents: number;
        finalPayCents: number;
        floorApplied: boolean;
        capApplied: boolean;
      }>;
      totals: {
        basePayCents: number;
        adjustedPayCents: number;
        finalPayCents: number;
      };
    };
    content?: string;
  }

  const { data: payExplanation, isLoading: payExplanationLoading } = useQuery<PayExplanationPacket>({
    queryKey: ["/api/drivers", id, "pay", "explanation", selectedPayPeriodId],
    enabled: isAuthenticated && !!id && !!selectedPayPeriodId,
  });

  // Driver ↔ Account many-to-many assignments
  const { data: driverAssignedAccounts = [] } = useQuery<{
    id: string; accountId: string; isPrimary: boolean; createdAt: string; assignmentStartedAt: string | null;
    customerName: string; status: string; customerType: string;
  }[]>({
    queryKey: [`/api/corporate/drivers/${id}/accounts`],
    enabled: isAuthenticated && !!id,
  });
  const { data: driverAccountHistory = [] } = useQuery<{
    id: string;
    accountId: string;
    customerName: string;
    customerType: string | null;
    accountStatus: string | null;
    assignmentStartedAt: string | null;
    assignmentEndedAt: string | null;
    assignmentEndReason: string | null;
    isCurrent: false;
  }[]>({
    queryKey: [`/api/corporate/drivers/${id}/accounts/history`],
    enabled: isAuthenticated && !!id,
  });

  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const { data: allAccountOptions = [] } = useQuery<{ id: string; customerName: string; customerType: string }[]>({
    queryKey: ["/api/corporate/customers/search/drivershift"],
    enabled: accountSearchOpen,
  });

  const assignAccountMutation = useMutation({
    mutationFn: (body: { accountId: string; isPrimary: boolean }) =>
      apiRequest("POST", `/api/corporate/drivers/${id}/accounts`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/corporate/drivers/${id}/accounts`] });
      setAccountSearchOpen(false);
      setAccountSearchQuery("");
    },
    onError: () => toast({ title: "Error", description: "Failed to assign account", variant: "destructive" }),
  });

  const removeAccountMutation = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest("DELETE", `/api/corporate/drivers/${id}/accounts/${accountId}`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/corporate/drivers/${id}/accounts`] }),
    onError: (err: any) => toast({ title: "Cannot Remove", description: err?.message || "Failed to remove account", variant: "destructive" }),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest("PATCH", `/api/corporate/drivers/${id}/accounts/${accountId}/set-primary`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/corporate/drivers/${id}/accounts`] }),
    onError: () => toast({ title: "Error", description: "Failed to set primary account", variant: "destructive" }),
  });


  // Fetch Driver Advocate employee info
  const { data: driverAdvocate } = useQuery<EmployeeOption>({
    queryKey: ["/api/corporate/employees", driver?.driverAdvocateId],
    enabled: isAuthenticated && !!driver?.driverAdvocateId,
  });

  // Fetch driver's time summary (W-2 Timekeeping)
  interface DriverTimeSummary {
    driverId: string;
    periodDays: number;
    totalHours: number;
    totalMinutes: number;
    entryCount: number;
    openShiftCount: number;
    openExceptionCount: number;
    recentEntries: Array<{
      id: number;
      startAt: string;
      endAt: string | null;
      durationMinutes: number | null;
    }>;
  }

  const { data: timeSummary, isLoading: timeSummaryLoading } = useQuery<DriverTimeSummary>({
    queryKey: ["/api/drivers", id, "time-summary"],
    enabled: isAuthenticated && !!id,
  });

  // WIW weekly summary — drives the header Weekly Hrs widget (worked vs scheduled)
  const { data: wiwWeeklySummary } = useQuery<{
    scheduledHoursThisWeek: number;
    workedHoursThisWeek: number;
    approvedHours: number;
    attendanceIssues30d: number;
  }>({
    queryKey: ["/api/scheduling/wheniwork/driver-summary", id],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/driver-summary?driverId=${id}`, { credentials: "include" });
      if (!r.ok) return { scheduledHoursThisWeek: 0, workedHoursThisWeek: 0, approvedHours: 0, attendanceIssues30d: 0 };
      return r.json();
    },
    enabled: isAuthenticated && !!id,
  });

  // Real-time clock status from wiw_times — polls every 2 minutes to stay fresh after syncs
  const { data: clockStatus } = useQuery<{
    status: "clocked_in" | "clocked_out" | "no_activity" | "no_wiw_link";
    clockIn: string | null;
    clockOut: string | null;
  }>({
    queryKey: ["/api/scheduling/wheniwork/driver-clock-status", id],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/driver-clock-status?driverId=${id}`, { credentials: "include" });
      if (!r.ok) return { status: "no_activity", clockIn: null, clockOut: null };
      return r.json();
    },
    enabled: isAuthenticated && !!id,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  // Real-time Driver Shift Status from the Status Engine
  const { data: shiftStatus } = useQuery<{
    driverId: string;
    wiwUserId: string | null;
    status: "ON_SHIFT" | "SCHEDULED_NOT_CLOCKED_IN" | "LATE" | "NO_SHOW" | "OFF_SHIFT";
    shiftStart: string | null;
    shiftEnd: string | null;
    clockIn: string | null;
    clockOut: string | null;
    minutesLate: number | null;
    shiftId: string | null;
    evaluatedAt: string;
  }>({
    queryKey: ["/api/scheduling/wheniwork/driver-shift-status", id],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/driver-shift-status?driverId=${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch shift status");
      return r.json();
    },
    enabled: isAuthenticated && !!id,
    staleTime: 0,
    refetchInterval: 30_000, // re-evaluate every 30 seconds
  });

  // WIW last successful sync timestamp — for transparency in clock status display
  const { data: wiwLastSync } = useQuery<{
    timesLastSync: string | null;
    shiftsLastSync: string | null;
    lastSync: string | null;
  }>({
    queryKey: ["/api/scheduling/wheniwork/last-sync"],
    staleTime: 0,
    refetchInterval: 30_000,
    enabled: isAuthenticated,
  });

  // Dashboard-only reporting has moved to /drivers/:id/dashboard. These legacy
  // queries remain disabled while the page is decomposed so opening Profile does
  // not load the full reporting dataset.
  const { data: draiverStats } = useQuery<{
    movesTotal: number;
    movesCompleted: number;
    movesCancelled: number;
    exceptionCount: number;
    milesTotal: number;
    driveTimeMinutes: number;
    avgDriveTimeMinutes: number | null;
    avgMiles: number | null;
    completionRate: number | null;
    windowLabel: string;
  }>({
    queryKey: ["/api/corporate/drivers", id, "move-stats", "all_time"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${id}/move-stats?window=all_time`, { credentials: "include" });
      if (!r.ok) return { movesTotal: 0, movesCompleted: 0, movesCancelled: 0, exceptionCount: 0, milesTotal: 0, driveTimeMinutes: 0, avgDriveTimeMinutes: null, avgMiles: null, completionRate: null, windowLabel: "All Time" };
      return r.json();
    },
    enabled: false,
  });

  // Canonical this-week driver move stats — reads from trips table (not partner_move_staging).
  const { data: draiverWeeklyStats } = useQuery<{
    movesTotal: number;
    movesCompleted: number;
    movesCancelled: number;
    exceptionCount: number;
    driveTimeMinutes: number;
    completionRate: number | null;
    windowLabel: string;
  }>({
    queryKey: ["/api/corporate/drivers", id, "move-stats", "this_week"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${id}/move-stats?window=this_week`, { credentials: "include" });
      if (!r.ok) return { movesTotal: 0, movesCompleted: 0, movesCancelled: 0, exceptionCount: 0, driveTimeMinutes: 0, completionRate: null, windowLabel: "This Week" };
      return r.json();
    },
    enabled: false,
  });

  // Canonical moves-since-incident — counts completed trips from trips table after last accident date.
  const { data: movesSinceIncident } = useQuery<{
    movesSince: number;
    totalMovesAllTime: number;
    hasIncidents: boolean;
    incidentCount: number;
    lastIncidentDate: string | null;
  }>({
    queryKey: ["/api/corporate/drivers", id, "moves-since-incident"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${id}/moves-since-incident`, { credentials: "include" });
      if (!r.ok) return { movesSince: 0, totalMovesAllTime: 0, hasIncidents: false, incidentCount: 0, lastIncidentDate: null };
      return r.json();
    },
    enabled: false,
  });

  // Canonical 30-day move trend — reads from trips table (not partner_move_staging).
  const { data: moveTrendData } = useQuery<{ days: number; rows: { date: string; moves: number }[] }>({
    queryKey: ["/api/corporate/drivers", id, "move-trend"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${id}/move-trend?days=30`, { credentials: "include" });
      if (!r.ok) return { days: 30, rows: [] };
      return r.json();
    },
    enabled: false,
  });

  const { data: wiwHoursTrendData } = useQuery<{ days: number; rows: { date: string; hours: number }[] }>({
    queryKey: ["/api/draiver-import/wiw-hours-trend", id],
    queryFn: async () => {
      const r = await fetch(`/api/draiver-import/wiw-hours-trend?driverId=${id}&days=14`, { credentials: "include" });
      if (!r.ok) return { days: 14, rows: [] };
      return r.json();
    },
    enabled: false,
  });

  const updateDriverMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      return await apiRequest("PATCH", `/api/corporate/drivers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      toast({
        title: "Saved",
        description: "Driver information updated",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      let description = "Failed to update driver information";
      try {
        const colonIdx = error.message.indexOf(":");
        if (colonIdx !== -1) {
          const parsed = JSON.parse(error.message.slice(colonIdx + 1).trim());
          if (parsed?.message) description = parsed.message;
        }
      } catch {}
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const handleEditFormSave = useCallback(() => {
    const payload: Record<string, string> = {};
    for (const [key, val] of Object.entries(editForm)) {
      if (val.trim() !== "") {
        if (key === "phoneNumber" || key === "emergencyContactPhone") {
          payload[key] = cleanPhone(val);
        } else {
          payload[key] = val.trim();
        }
      }
    }
    updateDriverMutation.mutate(payload, {
      onSuccess: () => setShowEditSheet(false),
    });
  }, [editForm, updateDriverMutation]);

  const handleFieldSave = useCallback((fieldName: string, value: string) => {
    const saveValue = (fieldName === "phoneNumber" || fieldName === "emergencyContactPhone")
      ? cleanPhone(value)
      : value;
    pendingChangesRef.current[fieldName] = saveValue;
    updateDriverMutation.mutate({ [fieldName]: saveValue });
  }, [updateDriverMutation]);

  const handleArrayFieldSave = useCallback((fieldName: string, value: string[]) => {
    pendingChangesRef.current[fieldName] = value;
    updateDriverMutation.mutate({ [fieldName]: value });
  }, [updateDriverMutation]);

  // Photo upload mutation
  const photoUploadMutation = useMutation({
    mutationFn: async (profilePhotoUrl: string) => {
      return await apiRequest("PUT", `/api/corporate/drivers/${id}/photo`, { profilePhotoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Photo Updated",
        description: "Driver profile photo has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to update profile photo",
        variant: "destructive",
      });
    },
  });

  const handlePhotoUploadComplete = (result: { objectPath: string; uploadURL: string }) => {
    if (result.objectPath) {
      photoUploadMutation.mutate(result.objectPath);
    }
  };

  const handleBack = () => {
    if (claimsReturnUrl) {
      setLocation(claimsReturnUrl);
    } else if (reportReturnUrl) {
      setLocation(reportReturnUrl);
    } else {
      window.history.back();
    }
  };

  const addNoteMutation = useMutation({
    mutationFn: async (data: { noteText: string; noteType: string }) => {
      return await apiRequest("POST", `/api/corporate/drivers/${id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "notes"] });
      setNoteText("");
      setNoteType("");
      setSlideNoteText("");
      setSlideNoteType("");
      toast({
        title: "Note added",
        description: "Internal note saved successfully.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add note",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim() || !noteType) return;
    addNoteMutation.mutate({ noteText: noteText.trim(), noteType });
  };

  const handleAddSlideNote = async () => {
    if (!slideNoteText.trim() || !slideNoteType) return;
    try {
      await addNoteMutation.mutateAsync({ noteText: slideNoteText.trim(), noteType: slideNoteType });
    } catch {}
  };

  const addCommentMutation = useMutation({
    mutationFn: async (data: { commentText: string }) => {
      return await apiRequest("POST", `/api/corporate/drivers/${id}/comments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "comments"] });
      setCommentText("");
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest("DELETE", `/api/corporate/drivers/${id}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "comments"] });
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    },
  });

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addCommentMutation.mutate({ commentText: commentText.trim() });
  };

  const archiveDriverMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await apiRequest("POST", `/api/corporate/drivers/${id}/archive`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      setShowArchiveDialog(false);
      setArchiveReason("");
      toast({ title: "Driver Archived", description: "The driver record has been archived." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to archive driver.", variant: "destructive" });
    },
  });

  const restoreDriverMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/corporate/drivers/${id}/restore`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      setShowRestoreDialog(false);
      toast({ title: "Driver Restored", description: "The driver record has been restored to inactive status." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to restore driver.", variant: "destructive" });
    },
  });

  const getInitials = () => {
    if (driver?.user?.firstName && driver?.user?.lastName) {
      return `${driver.user?.firstName[0]}${driver.user?.lastName[0]}`.toUpperCase();
    }
    return driver?.user?.email?.[0]?.toUpperCase() || "D";
  };

  const totalEarnings = payRecords.reduce((sum, record) => sum + Number(record.netPay || 0), 0);

  // ── SMS readiness — hooks must be declared before any early return ──────────
  const { data: smsStatus } = useQuery<{ enabled: boolean; provider: string; configured: boolean }>({
    queryKey: ["/api/platform/texting-config"],
    queryFn: () => fetch("/api/platform/texting-config", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  // Primary account — 3-tier resolution (computed here so it's available for the mutation below)
  const _primaryAccountPreLoad: { accountId: string; customerName: string } | null = (() => {
    if (driverAssignedAccounts.length > 0) {
      const explicit = driverAssignedAccounts.find(a => a.isPrimary);
      if (explicit) return { accountId: explicit.accountId, customerName: explicit.customerName };
      const mostRecent = [...driverAssignedAccounts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      return { accountId: mostRecent.accountId, customerName: mostRecent.customerName };
    }
    const fallbackId = (driver as any)?.drivershiftCustomerId as string | undefined;
    const fallbackName = (driver as any)?.drivershiftCustomerName as string | undefined;
    if (fallbackId && fallbackName) return { accountId: fallbackId, customerName: fallbackName };
    return null;
  })();
  const _smsAccountIdPreLoad = _primaryAccountPreLoad?.accountId ?? "driver_detail";
  const _smsEnabledPreLoad   = smsStatus?.enabled === true && smsStatus?.configured === true;

  const sendDriverSmsMutation = useMutation({
    mutationFn: (msg: string) =>
      apiRequest("POST", `/api/corporate/customers/${_smsAccountIdPreLoad}/drivers/text-selected`, {
        driverIds:      [id],
        message:        msg,
        contextModule:  "drivers",
        contextEntityId: id,
      }).then(r => r.json()),
    onSuccess: (data: any) => {
      setSmsSingleResult(data);
      const sent   = data.sent   ?? 0;
      const failed = data.failed ?? 0;
      // Refresh the communications timeline so the sent message appears immediately
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "communications"] });
      if (sent > 0) {
        toast({ title: "Message sent", description: data.summary ?? `Sent to ${sent} recipient(s).` });
      } else if (failed > 0) {
        const providerErr = data.recipientResults?.[0]?.error;
        toast({
          title: "Send failed",
          description: providerErr
            ? `Provider error: ${providerErr}`
            : (data.summary ?? `Failed to deliver to ${failed} recipient(s).`),
          variant: "destructive",
        });
      } else {
        toast({ title: "Intent logged", description: data.summary ?? `${data.included ?? 0} recipient(s) queued.` });
      }
    },
    onError: () => toast({ title: "Send failed", description: "Could not process SMS request.", variant: "destructive" }),
  });

  const sendMvrRequestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/drivers/${id}/send-mvr-request`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      setSendMvrDialogOpen(false);
      toast({ title: "MVR request sent", description: `Email delivered to ${data.recipientEmail}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "communications"] });
    },
    onError: (err: any) => {
      const detail = err?.message || "Could not send MVR request email.";
      toast({ title: "Send failed", description: detail, variant: "destructive" });
    },
  });

  if (authLoading || driverLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (driverError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 py-12">
        <p className="text-muted-foreground">Failed to load driver profile. The driver may not exist or there was a server error.</p>
        <div className="flex gap-2">
          {/* Retry preserves report context — sessionStorage is untouched */}
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id] })}>
            Retry
          </Button>
          {reportReturnUrl ? (
            <Link href={reportReturnUrl}>
              <Button variant="ghost">Back to Report</Button>
            </Link>
          ) : (
            <Link href="/drivers">
              <Button variant="ghost">Back to Drivers</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Driver not found</p>
        {reportReturnUrl ? (
          <Link href={reportReturnUrl}>
            <Button variant="ghost" className="mt-4">Back to Report</Button>
          </Link>
        ) : (
          <Link href="/drivers">
            <Button variant="ghost" className="mt-4">Back to Drivers</Button>
          </Link>
        )}
      </div>
    );
  }

  const driverExportColumns: ExcelColumn[] = [
    { header: "First Name", key: "firstName", width: 15 },
    { header: "Last Name", key: "lastName", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Driver Number", key: "driverNumber", width: 15 },
    { header: "License Number", key: "licenseNumber", width: 18 },
    { header: "License State", key: "licenseState", width: 12 },
    { header: "License Expiration", key: "licenseExpiration", width: 18 },
    { header: "Classification", key: "driverClassification", width: 20 },
    { header: "Address", key: "address", width: 30 },
    { header: "City", key: "city", width: 15 },
    { header: "State", key: "state", width: 10 },
    { header: "Zip", key: "zipCode", width: 10 },
  ];

  const driverExportData = driver ? [{
    firstName: driver.user?.firstName || "",
    lastName: driver.user?.lastName || "",
    email: driver.user?.email || "",
    phone: driver.phoneNumber || "",
    status: driver.status || "",
    driverNumber: driver.driverNumber || "",
    licenseNumber: driver.licenseNumber || "",
    licenseState: driver.licenseState || "",
    licenseExpiration: formatDate(driver.licenseExpiration),
    driverClassification: driver.driverClassification || "",
    address: driver.address || "",
    city: driver.city || "",
    state: driver.state || "",
    zipCode: driver.zipCode || "",
  }] : [];

  const payExportColumns: ExcelColumn[] = [
    { header: "Pay Period Start", key: "payPeriodStart", width: 15 },
    { header: "Pay Period End", key: "payPeriodEnd", width: 15 },
    { header: "Payment Date", key: "paymentDate", width: 15 },
    { header: "Gross Pay", key: "grossPay", width: 12 },
    { header: "Deductions", key: "deductions", width: 12 },
    { header: "Net Pay", key: "netPay", width: 12 },
    { header: "Hours Worked", key: "hoursWorked", width: 12 },
  ];

  const payExportData = payRecords.map(record => ({
    payPeriodStart: formatDate(record.payPeriodStart),
    payPeriodEnd: formatDate(record.payPeriodEnd),
    paymentDate: formatDate(record.paymentDate),
    grossPay: formatCurrency(record.grossPay),
    deductions: formatCurrency(record.deductions),
    netPay: formatCurrency(record.netPay),
    hoursWorked: record.hoursWorked || "",
  }));

  const tripExportColumns: ExcelColumn[] = [
    { header: "Move Number", key: "moveNumber", width: 15 },
    { header: "Date", key: "tripDate", width: 15 },
    { header: "Origin", key: "origin", width: 25 },
    { header: "Destination", key: "destination", width: 25 },
    { header: "Distance", key: "distance", width: 12 },
    { header: "Status", key: "status", width: 12 },
  ];

  const tripExportData = trips.map(trip => ({
    moveNumber: trip.moveNumber || "",
    tripDate: formatDate(trip.tripDate),
    origin: trip.origin || "",
    destination: trip.destination || "",
    distance: trip.distance || "",
    status: trip.status || "",
  }));

  // Weekly hours sourced from WIW (worked hours this week) — canonical source per data rules
  const weeklyHours = wiwWeeklySummary?.workedHoursThisWeek ?? 0;
  const weeklyHoursPercent = Math.min((weeklyHours / 40) * 100, 100);
  const last30Moves = scorecard?.last30DayMoveCount ?? driver?.currentMonthMoveCount ?? 0;
  const lossScore = lossScoreData?.score ?? scorecard?.driverLossScore ?? 0;
  const claimsCount12mo = lossScoreData?.inputs?.claimsHistory12Months ?? lossScoreData?.inputs?.claimsHistory90Days ?? scorecard?.safety?.atFaultClaimsCount ?? 0;
  const eligibilityLabel = (scorecard?.eligibilityFlags?.length ?? 0) > 0 ? scorecard?.eligibilityFlags?.join(", ") : "Eligible";
  const driverTypeMap: Record<string, string> = {
    DriverShift: "Shift Driver",
    DriverDash: "Dash Driver",
    Hybrid: "Hybrid Driver",
    "On-Call": "On-Call Driver",
  };
  const driverRoleLabel = (driver.driverType && driverTypeMap[driver.driverType]) || driver.driverType || "Driver";
  const driverClassLabel = driver.driverClassification || null;
  const driverSubtitle = driverClassLabel ? `${driverRoleLabel} \u2022 ${driverClassLabel}` : driverRoleLabel;

  const drugTestStatus = getPresenceComplianceStatus(driver.drugTestDate);
  const mvrStatus = getAnnualComplianceStatus(driver.mvrDate);
  const licenseStatus = getExpirationComplianceStatus(driver.licenseExpiration);

  // Primary account — 3-tier resolution:
  // T1: explicit isPrimary assignment, T2: most recently created assignment, T3: drivershiftCustomerId fallback
  const primaryAccount = _primaryAccountPreLoad;
  const smsEnabled    = smsStatus?.enabled === true;
  const smsConfigured = smsStatus?.configured === true;
  const smsReady      = smsEnabled && smsConfigured;
  const smsAccountId  = _smsAccountIdPreLoad;

  // Clock status label — formats raw ISO timestamps to local time
  const clockStatusDisplay = (() => {
    if (!clockStatus || clockStatus.status === "no_wiw_link") return null;
    const tz = (shiftStatus as any)?.locationTimezone ?? null;
    const fmt = (iso: string) => {
      try {
        const zone = tz ?? undefined;
        return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
      } catch { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    };
    if (clockStatus.status === "clocked_in" && clockStatus.clockIn) {
      return { label: `Clocked In (since ${fmt(clockStatus.clockIn)})`, variant: "in" as const };
    }
    if (clockStatus.status === "clocked_out" && clockStatus.clockOut) {
      return { label: `Clocked Out (last shift ${fmt(clockStatus.clockOut)})`, variant: "out" as const };
    }
    if (clockStatus.status === "no_activity") {
      return { label: "No Activity Today", variant: "none" as const };
    }
    return null;
  })();

  // Shift status display — derived from the Status Engine
  const shiftStatusDisplay = (() => {
    if (!shiftStatus || !shiftStatus.wiwUserId) return null;
    const tz = (shiftStatus as any).locationTimezone ?? null;
    const fmt = (iso: string | null) => {
      if (!iso) return null;
      try {
        const zone = tz ?? undefined;
        return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
      } catch { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    };
    const fmtShiftRange = () => {
      const s = fmt(shiftStatus.shiftStart);
      const e = fmt(shiftStatus.shiftEnd);
      return s && e ? `${s} – ${e}` : null;
    };
    switch (shiftStatus.status) {
      case "ON_SHIFT":
        return {
          label: shiftStatus.clockIn
            ? `On Shift · Clocked in ${fmt(shiftStatus.clockIn)}`
            : "On Shift",
          variant: "on_shift" as const,
          detail: fmtShiftRange(),
        };
      case "SCHEDULED_NOT_CLOCKED_IN":
        return {
          label: `Scheduled · Not clocked in`,
          variant: "scheduled" as const,
          detail: fmtShiftRange(),
        };
      case "LATE":
        return {
          label: shiftStatus.minutesLate != null
            ? `Late · ${shiftStatus.minutesLate}m past grace`
            : "Late",
          variant: "late" as const,
          detail: fmtShiftRange(),
        };
      case "NO_SHOW":
        return {
          label: "No Show",
          variant: "no_show" as const,
          detail: fmtShiftRange(),
        };
      case "OFF_SHIFT":
      default:
        return {
          label: "Off Shift",
          variant: "off_shift" as const,
          detail: null,
        };
    }
  })();

  // Real daily WIW hours — last 14 days, formatted as "M/d"
  // Backend returns all days including zeros for a continuous timeline.
  const weeklyHoursTrend: { date: string; hours: number }[] = (wiwHoursTrendData?.rows ?? []).map(r => ({
    date: new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
    hours: r.hours,
  }));
  const hasWiwHoursData = weeklyHoursTrend.some(r => r.hours > 0);

  // Real daily Draiver moves — last 30 days, formatted as "M/d"
  // Backend returns all days including zeros for a continuous timeline.
  const moveTrend: { date: string; moves: number }[] = (moveTrendData?.rows ?? []).map(r => ({
    date: new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
    moves: r.moves,
  }));
  const hasMoveData = moveTrend.some(r => r.moves > 0);

  const canEditDriver = !!(
    (user as any)?.role === "super_admin" ||
    (user as any)?.role === "corporate_admin" ||
    (user as any)?.role === "admin" ||
    (user as any)?.role === "super_user" ||
    (user as any)?.isSuperAdmin ||
    (user as any)?.isRootSuperAdmin
  );

  return (
    <div className="driver-detail-density space-y-2 pt-4 sm:pt-6">
      {/* Back Button Row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {claimsReturnUrl ? "Back to Claims" : reportReturnUrl ? "Back to Report" : "Back"}
        </Button>
        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            data={driverExportData}
            columns={driverExportColumns}
            filename={`Driver_${driver.user?.lastName || "Details"}`}
            label="Driver Info"
          />
          {payRecords.length > 0 && (
            <ExcelDownloadButton
              data={payExportData}
              columns={payExportColumns}
              filename={`Pay_${driver.user?.lastName || "Records"}`}
              label="Pay Records"
            />
          )}
          {trips.length > 0 && (
            <ExcelDownloadButton
              data={tripExportData}
              columns={tripExportColumns}
              filename={`Moves_${driver.user?.lastName || "History"}`}
              label="Moves"
            />
          )}
          {!(driver as any).isDeleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setArchiveReason(""); setShowArchiveDialog(true); }}
              data-testid="button-archive-driver"
            >
              <ArchiveX className="h-4 w-4 mr-1" />
              Archive
            </Button>
          )}
          {(driver as any).isDeleted && ((user as any)?.isSuperAdmin || (user as any)?.isRootSuperAdmin || (user as any)?.role === "super_admin") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRestoreDialog(true)}
              data-testid="button-restore-driver"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Restore
            </Button>
          )}
          {(user as any)?.isRootSuperAdmin && !(driver as any).mergedIntoId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMergeDialogOpen(true)}
              data-testid="button-merge-driver"
              className="text-orange-600 border-orange-300"
            >
              <GitMerge className="h-4 w-4 mr-1" />
              Merge
            </Button>
          )}
        </div>
      </div>

      {(driver as any).isDeleted && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" data-testid="banner-driver-archived">
          <ArchiveX className="h-4 w-4 shrink-0" />
          <span>This driver record has been <strong>archived</strong> and is read-only. Only a Super Admin can restore it.</span>
        </div>
      )}

      {(driver as any).mergedIntoId && (
        <div className="flex items-center gap-2 rounded-md border border-orange-400/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-2.5 text-sm text-orange-700 dark:text-orange-400" data-testid="banner-driver-merged">
          <GitMerge className="h-4 w-4 shrink-0" />
          <span>This driver record has been <strong>merged</strong> into another record and is retired. All data has been moved to the primary record.</span>
        </div>
      )}

      {/* ═══ Individual Driver SMS Compose Dialog ══════════════════════════ */}
      <Dialog open={smsSingleOpen} onOpenChange={open => {
        setSmsSingleOpen(open);
        if (!open) { setSmsSingleMsg(""); setSmsSingleResult(null); sendDriverSmsMutation.reset(); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Send Text Message
            </DialogTitle>
            <DialogDescription>
              {driver?.phoneNumber
                ? `To: ${formatPhone(driver.phoneNumber)}`
                : "This driver has no phone number on file."}
              {" · "}
              {smsReady
                ? "Live delivery via Heymarket."
                : !smsEnabled
                ? "SMS disabled — message will be logged as pending intent."
                : "Heymarket not configured — message will be logged as pending intent."}
            </DialogDescription>
          </DialogHeader>

          {!smsReady && (
            <div className="flex items-start gap-2.5 rounded-md border bg-muted/40 px-3 py-2.5">
              <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="font-medium text-sm">{!smsEnabled ? "SMS feature disabled" : "Heymarket not configured"}</p>
                <p className="text-xs text-muted-foreground">
                  {!smsEnabled
                    ? "Enable the SMS flag in Platform Admin → Communications. Messages logged now will be marked as pending intent."
                    : "Set your Heymarket API token and inbox ID in Platform Admin → Communications."}
                </p>
              </div>
            </div>
          )}

          {smsSingleResult ? (
            <div className={`rounded-md border px-3 py-3 text-sm space-y-2 ${(smsSingleResult.failed ?? 0) > 0 && (smsSingleResult.sent ?? 0) === 0 ? "bg-destructive/10 border-destructive/30" : "bg-muted/40"}`}>
              <p className="font-medium">
                {(smsSingleResult.sent ?? 0) > 0
                  ? "Message sent"
                  : (smsSingleResult.failed ?? 0) > 0
                    ? "Send failed"
                    : "Intent logged"}
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div><span className="block font-medium text-foreground">{smsSingleResult.sent ?? 0}</span>Sent</div>
                <div><span className="block font-medium text-foreground">{smsSingleResult.failed ?? 0}</span>Failed</div>
                <div><span className="block font-medium text-foreground">{smsSingleResult.excluded ?? 0}</span>Excluded</div>
                <div><span className="block font-medium text-foreground">{smsSingleResult.included ?? 0}</span>Included</div>
              </div>
              {smsSingleResult.summary && <p className="text-xs text-muted-foreground">{smsSingleResult.summary}</p>}
              {(smsSingleResult.failed ?? 0) > 0 && smsSingleResult.recipientResults?.[0]?.error && (
                <p className="text-xs text-destructive font-medium">
                  Provider error: {smsSingleResult.recipientResults[0].error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sms-single-body">Message</label>
                <Textarea
                  id="sms-single-body"
                  placeholder="Enter your message…"
                  rows={4}
                  value={smsSingleMsg}
                  onChange={e => setSmsSingleMsg(e.target.value)}
                  data-testid="input-sms-single-body"
                />
                <p className="text-xs text-muted-foreground text-right">{smsSingleMsg.length} chars</p>
              </div>
              {sendDriverSmsMutation.isError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Request failed — {(sendDriverSmsMutation.error as any)?.message || "network error"}. Your message is preserved above.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSmsSingleOpen(false)} data-testid="button-sms-single-cancel">
              {smsSingleResult ? "Close" : "Cancel"}
            </Button>
            {!smsSingleResult && (
              <Button
                size="sm"
                disabled={sendDriverSmsMutation.isPending || !smsSingleMsg.trim() || !driver?.phoneNumber}
                onClick={() => sendDriverSmsMutation.mutate(smsSingleMsg)}
                data-testid="button-sms-single-send"
              >
                <Smartphone className="h-3 w-3 mr-1.5" />
                {sendDriverSmsMutation.isPending
                  ? (smsReady ? "Sending…" : "Logging…")
                  : smsReady ? "Send Message" : "Log Intent"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Send MVR Request Dialog ═══════════════════════════════════════ */}
      <Dialog open={sendMvrDialogOpen} onOpenChange={setSendMvrDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-mvr-request">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              Send MVR Request
            </DialogTitle>
            <DialogDescription>
              The following email will be sent to the driver requesting an updated Motor Vehicle Record. Sending will update the MVR tracking fields automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Email preview */}
          <div className="rounded-md border bg-muted/30 text-sm divide-y">
            {/* To */}
            <div className="flex gap-2 px-3 py-2">
              <span className="font-medium text-muted-foreground w-14 shrink-0">To</span>
              <span className="text-foreground">
                {driver?.user?.email
                  ? driver.user.email
                  : <span className="text-destructive">No email address on file</span>}
              </span>
            </div>
            {/* From */}
            <div className="flex gap-2 px-3 py-2">
              <span className="font-medium text-muted-foreground w-14 shrink-0">From</span>
              <span className="text-foreground">reports@driverondemand.co</span>
            </div>
            {/* Subject */}
            <div className="flex gap-2 px-3 py-2">
              <span className="font-medium text-muted-foreground w-14 shrink-0">Subject</span>
              <span className="text-foreground font-medium">DOD: Updated Motor Vehicle Report</span>
            </div>
            {/* Body */}
            <div className="px-3 py-3 space-y-2 text-sm text-foreground">
              <p>Hi {driver?.user?.firstName ? `${driver.user.firstName} ${driver.user.lastName ?? ""}`.trim() : "Driver"},</p>
              <p>I hope this message finds you well. As part of Driver on Demand's ongoing compliance program, we need an updated Motor Vehicle Record (MVR) on file for you.</p>
              <p>Please submit your updated MVR at your earliest convenience. This is required to maintain your active status with Driver on Demand.</p>
              <p>If you have any questions or need assistance with this process, please don't hesitate to reach out to our compliance team.</p>
              <p>Thank you for your prompt attention to this matter.</p>
              <p className="pt-1 text-muted-foreground">
                Best regards,<br />
                Driver on Demand Compliance Team<br />
                reports@driverondemand.co
              </p>
            </div>
          </div>

          {/* Auto-update notice */}
          <div className="flex items-start gap-2.5 rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-500" />
            <span>
              On send: <strong>MVR Link Sent Date</strong> will be set to today and <strong>MVR Progress</strong> will be updated to <em>Link Sent</em>. Communication will be logged.
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSendMvrDialogOpen(false)}
              disabled={sendMvrRequestMutation.isPending}
              data-testid="button-mvr-request-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendMvrRequestMutation.mutate()}
              disabled={sendMvrRequestMutation.isPending || !driver?.user?.email}
              data-testid="button-mvr-request-send"
            >
              {sendMvrRequestMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                : <><Send className="h-4 w-4 mr-2" />Send Email</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Driver Photo Lightbox ══ */}
      {(() => {
        const photoSrc = driver?.profilePhotoUrl || driver?.user?.profileImageUrl || undefined;
        if (!photoSrc) return null;
        return (
          <Dialog open={photoLightboxOpen} onOpenChange={setPhotoLightboxOpen}>
            <DialogContent
              className="max-w-none w-auto p-0 bg-transparent border-none shadow-none flex items-center justify-center"
              data-testid="dialog-photo-lightbox"
              style={{ maxWidth: "min(90vw, 900px)" }}
            >
              <div className="relative">
                <button
                  className="absolute -top-3 -right-3 z-50 h-8 w-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover-elevate"
                  onClick={() => setPhotoLightboxOpen(false)}
                  aria-label="Close photo preview"
                  data-testid="button-photo-lightbox-close"
                >
                  <X className="h-4 w-4" />
                </button>
                <img
                  src={photoSrc}
                  alt={driver?.user?.firstName
                    ? `${driver.user.firstName} ${driver.user.lastName ?? ""}`.trim()
                    : "Driver photo"}
                  className="rounded-md object-contain"
                  style={{ maxHeight: "85vh", maxWidth: "min(90vw, 900px)", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  data-testid="img-photo-lightbox"
                />
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ═══ STICKY HEADER WRAPPER: Identity (collapsible) + Command Bar ═══ */}
      <div className="sticky top-0 z-[50] bg-background">

        {/* Compact identity strip — shown when scrolled */}
        <div
          className={`flex items-center gap-3 px-4 border-b border-border overflow-hidden transition-all duration-200 ${isScrolled ? "max-h-[52px] py-2 opacity-100" : "max-h-0 py-0 opacity-0 pointer-events-none"}`}
          data-testid="driver-header-compact"
        >
          <Avatar className="h-7 w-7 shrink-0" data-testid="avatar-driver-compact">
            <AvatarImage src={driver.profilePhotoUrl || driver.user?.profileImageUrl || undefined} />
            <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-sm font-bold truncate" data-testid="text-driver-name-compact">
              {driver.user?.firstName && driver.user?.lastName
                ? `${driver.user?.firstName} ${driver.user?.lastName}`
                : driver.user?.email}
            </span>
            <StatusBadge
              status={(driver as any).isDeleted ? "archived" : (driver.status || "active")}
            />
            {lossScoreData && (
              <DriverRiskScoreBadge data={lossScoreData} compact />
            )}
            <DriverScoreBadge driverId={id} compact data-testid="badge-score-compact" />
            <span className="text-xs text-muted-foreground" data-testid="text-driver-subtitle-compact">{driverSubtitle}</span>
            {primaryAccount && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <Link
                  href={`/customers/${primaryAccount.accountId}`}
                  className="text-xs text-primary hover:underline truncate max-w-[180px] inline-block"
                  data-testid="link-driver-primary-account-compact"
                >
                  {primaryAccount.customerName}
                </Link>
              </>
            )}
            {shiftStatusDisplay && shiftStatusDisplay.variant !== "off_shift" && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                  shiftStatusDisplay.variant === "on_shift"  ? "bg-green-500"
                  : shiftStatusDisplay.variant === "scheduled" ? "bg-blue-500"
                  : shiftStatusDisplay.variant === "late"     ? "bg-orange-500"
                  : shiftStatusDisplay.variant === "no_show"  ? "bg-red-500"
                  : "bg-muted-foreground/50"
                }`} />
                <span
                  className={`text-xs ${
                    shiftStatusDisplay.variant === "on_shift"  ? "text-green-600 dark:text-green-400 font-medium"
                    : shiftStatusDisplay.variant === "scheduled" ? "text-blue-600 dark:text-blue-400"
                    : shiftStatusDisplay.variant === "late"     ? "text-orange-600 dark:text-orange-400 font-medium"
                    : shiftStatusDisplay.variant === "no_show"  ? "text-red-600 dark:text-red-400 font-medium"
                    : "text-muted-foreground"
                  }`}
                  data-testid="text-driver-shift-status-compact"
                >
                  {shiftStatusDisplay.label}
                </span>
              </>
            )}
            {driver.driverNumber && (
              <span className="text-xs text-muted-foreground">#{driver.driverNumber}</span>
            )}
          </div>
        </div>

        {/* Full identity card — collapses when scrolled */}
        <div
          className={`overflow-hidden transition-all duration-200 border-b border-border ${isScrolled ? "max-h-0 opacity-0" : "max-h-[280px] opacity-100"}`}
          data-testid="driver-header-card"
        >
          <div className="py-2 px-3">
          <div className="grid grid-cols-1 gap-3 items-center lg:grid-cols-12">
            {/* Col 1-5: Photo + Identity */}
            <div className="flex items-center gap-3 min-w-0 lg:col-span-5">
              <div className="relative shrink-0">
                {(() => {
                  const photoSrc = driver.profilePhotoUrl || driver.user?.profileImageUrl || undefined;
                  return (
                    <div
                      className={photoSrc ? "relative group cursor-pointer" : "relative"}
                      onClick={() => { if (photoSrc) setPhotoLightboxOpen(true); }}
                      data-testid="avatar-driver-wrapper"
                    >
                      <Avatar className="h-20 w-20" data-testid="avatar-driver">
                        <AvatarImage src={photoSrc} />
                        <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
                      </Avatar>
                      {photoSrc && (
                        <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
                          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>
                  );
                })()}
                <ServerUploader
                  maxFileSize={10485760}
                  onComplete={handlePhotoUploadComplete}
                  onError={(error) => {
                    console.error("Photo upload failed:", error);
                  }}
                  buttonVariant="secondary"
                  buttonClassName="absolute -bottom-1 -right-1 h-7 w-7 rounded-full p-0"
                  enableCamera={true}
                  testId="button-upload-driver-photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </ServerUploader>
                {photoUploadMutation.isPending && (
                  <div className="absolute inset-0 bg-background/50 rounded-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold truncate leading-tight" data-testid="text-driver-name">
                    {driver.user?.firstName && driver.user?.lastName
                      ? `${driver.user?.firstName} ${driver.user?.lastName}`
                      : driver.user?.email}
                  </h1>
                  <StatusBadge
                    status={(driver as any).isDeleted ? "archived" : (driver.status || "active")}
                    data-testid="badge-driver-status"
                  />
                  {(driver as any).isDeleted && (
                    <Badge variant="destructive" className="text-[10px]" data-testid="badge-driver-archived">Archived</Badge>
                  )}
                  {lossScoreData && (
                    <DriverRiskScoreBadge data={lossScoreData} />
                  )}
                  <DriverScoreBadge driverId={id} data-testid="badge-score-full" />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5" data-testid="text-driver-subtitle">
                  <span>{driverSubtitle}</span>
                  {driver.driverNumber && (
                    <>
                      <span>·</span>
                      <span>#{driver.driverNumber}</span>
                    </>
                  )}
                </div>
                {primaryAccount && (
                  <div className="mt-0.5" data-testid="text-driver-primary-account">
                    <Link
                      href={`/customers/${primaryAccount.accountId}`}
                      className="text-xs text-primary hover:underline truncate max-w-[220px] inline-block"
                      data-testid="link-driver-primary-account"
                    >
                      {primaryAccount.customerName}
                    </Link>
                  </div>
                )}
                {shiftStatusDisplay && (
                  <div className="mt-0.5 flex items-center gap-1" data-testid="text-driver-shift-status">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                      shiftStatusDisplay.variant === "on_shift"  ? "bg-green-500"
                      : shiftStatusDisplay.variant === "scheduled" ? "bg-blue-500"
                      : shiftStatusDisplay.variant === "late"     ? "bg-orange-500"
                      : shiftStatusDisplay.variant === "no_show"  ? "bg-red-500"
                      : "bg-muted-foreground/40"
                    }`} />
                    <span className={`text-xs ${
                      shiftStatusDisplay.variant === "on_shift"  ? "text-green-600 dark:text-green-400 font-medium"
                      : shiftStatusDisplay.variant === "scheduled" ? "text-blue-600 dark:text-blue-400"
                      : shiftStatusDisplay.variant === "late"     ? "text-orange-600 dark:text-orange-400 font-medium"
                      : shiftStatusDisplay.variant === "no_show"  ? "text-red-600 dark:text-red-400 font-medium"
                      : "text-muted-foreground"
                    }`}>
                      {shiftStatusDisplay.label}
                      {shiftStatusDisplay.detail && (
                        <span className="text-muted-foreground font-normal ml-1">({shiftStatusDisplay.detail})</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Col 6-7: Contact + Notes */}
            <div className="flex items-center gap-2 flex-wrap lg:col-span-2">
              {driver.user?.email && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setEmailComposeOpen(true)}
                      className="flex items-center gap-1 hover-elevate rounded-md px-1.5 py-0.5 text-xs text-muted-foreground"
                      data-testid="button-email-driver"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Email Driver</TooltipContent>
                </Tooltip>
              )}
              {driver.phoneNumber && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={`tel:${cleanPhone(driver.phoneNumber)}`} className="flex items-center gap-1 hover-elevate rounded-md px-1.5 py-0.5 text-xs text-muted-foreground" data-testid="link-phone-driver">
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>{formatPhone(driver.phoneNumber)}</TooltipContent>
                </Tooltip>
              )}
              {driver.phoneNumber && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSmsSingleOpen(true)}
                      className="flex items-center gap-1 hover-elevate rounded-md px-1.5 py-0.5 text-xs text-muted-foreground"
                      data-testid="button-text-driver"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Send text message</TooltipContent>
                </Tooltip>
              )}
              <Separator orientation="vertical" className="h-4" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setNotesSlideOpen(true)}
                    className="flex items-center gap-1 hover-elevate rounded-md px-1.5 py-0.5 text-xs relative"
                    data-testid="button-notes-indicator"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{notes.length}</span>
                    {notes.length > 0 && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{notes.length} Notes & Communications</TooltipContent>
              </Tooltip>
            </div>

            {/* Col 8-10: Weekly Hours Progress (WIW worked vs scheduled) */}
            <div className="lg:col-span-3" data-testid="driver-weekly-hours">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Weekly Hrs</span>
                <span className={`text-xs font-bold ${wiwWorkedRatioColor(wiwWeeklySummary?.workedHoursThisWeek ?? 0, wiwWeeklySummary?.scheduledHoursThisWeek ?? 0)}`}>
                  {(wiwWeeklySummary?.workedHoursThisWeek ?? 0).toFixed(1)}
                  {(wiwWeeklySummary?.scheduledHoursThisWeek ?? 0) > 0 && (
                    <span className="text-muted-foreground font-normal"> / {wiwWeeklySummary!.scheduledHoursThisWeek}h</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${wiwWorkedRatioBarColor(wiwWeeklySummary?.workedHoursThisWeek ?? 0, wiwWeeklySummary?.scheduledHoursThisWeek ?? 0)}`}
                  style={{ width: `${Math.min(((wiwWeeklySummary?.workedHoursThisWeek ?? 0) / Math.max(wiwWeeklySummary?.scheduledHoursThisWeek ?? 1, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Col 11-12: Eligibility + 30-Day Moves */}
            <div className="flex flex-row gap-3 text-xs sm:items-end sm:justify-end lg:col-span-2 lg:flex-col">
              <div className="flex items-center gap-1.5" data-testid="text-30day-moves">
                <span className="text-muted-foreground">30d Moves:</span>
                <span className="font-bold">{last30Moves}</span>
              </div>
              <div className="flex items-center gap-1" data-testid="text-eligibility-status">
                <Badge variant={(scorecard?.eligibilityFlags?.length ?? 0) > 0 ? "secondary" : "default"} className="text-[10px] px-1.5 py-0">
                  {eligibilityLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* ─── Compliance Snapshot ──────────────────────────────────────────── */}
          <ComplianceSnapshotBar
            driver={driver}
            onNavigate={() => handleTabChange("profile")}
          />
          </div>
        </div>

        {/* Command Bar — always visible, sticky within the wrapper */}
        <DriverCommandBar
          disableSticky
          driver={driver}
          canEdit={canEditDriver}
          isPending={updateDriverMutation.isPending}
          onEditDriver={openEditSheet}
          onChangeStatus={(status) => updateDriverMutation.mutate({ status })}
          onAddNote={() => setNotesSlideOpen(true)}
          onAddComment={() => handleTabChange("comments")}
          onUploadDocument={() => handleTabChange("documents")}
          onViewHistory={() => handleTabChange("trips")}
          onViewCompliance={() => {
            handleTabChange("profile");
            setTimeout(() => {
              document.getElementById("compliance-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
          }}
          onExportRecord={() => {
            if (driverExportData && driverExportColumns) {
              exportToExcel(driverExportData, driverExportColumns, `Driver_${driver.user?.lastName || "Record"}`);
            }
          }}
          onViewDashboard={() => setLocation(`/drivers/${id}/dashboard`)}
        />

        {/* Back to Account Scheduling — shown when navigated from an account scheduling view */}
        {returnTo && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border bg-background/95">
            <button
              onClick={() => setLocation(returnTo)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-back-to-account-scheduling"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Account Scheduling
            </button>
          </div>
        )}

        {/* Driver Workspace Navigation — sticky tab strip */}
        <RecordWorkspaceTabs
          tabs={[
            { value: "profile",    label: "Profile" },
            { value: "pay",        label: "Pay" },
            { value: "trips",      label: "Moves" },
            { value: "documents",  label: "Documents" },
            { value: "notes",      label: "Notes & Comms" },
            { value: "claims",     label: "Claims" },
            { value: "payments",   label: "Payments" },
            { value: "expenses",   label: "Expenses" },
            { value: "invoices",   label: "Invoices" },
            { value: "comments",   label: "Driver Comments" },
            { value: "scheduling", label: "Scheduling" },
            { value: "history",    label: "Status History" },
            ...(driverClassification === "Employee" ? [{ value: "employee-record", label: "Employee Record" }] : []),
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          data-testid="sticky-workspace-nav"
        />
      </div>

      {/* Driver Intelligence shortcut */}
      <div className="flex items-center justify-end px-3 py-1 border-b border-border bg-muted/30">
        <Link href={`/reports/driver-intelligence?driverId=${id}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <BrainCircuit className="w-3.5 h-3.5" />
          View Driver Intelligence
        </Link>
      </div>

      {/* ═══ LAYER 2: KPI STRIP — 5-col × 2 rows, visual indicators ═══ */}
      {false && (() => {
        // ── Raw source values ─────────────────────────────────────────────
        const wiwWorked    = wiwWeeklySummary?.workedHoursThisWeek    ?? 0;
        const wiwScheduled = wiwWeeklySummary?.scheduledHoursThisWeek ?? 0;
        const dMovesTotal  = draiverStats?.movesTotal       ?? 0;
        const dDriveMin    = draiverStats?.driveTimeMinutes ?? 0;
        const dMilesTotal  = draiverStats?.milesTotal       ?? 0;

        // Weekly-scoped Draiver values
        const wkMovesTotal = draiverWeeklyStats?.movesTotal    ?? 0;
        const wkCompleted  = draiverWeeklyStats?.movesCompleted ?? 0;
        const wkDriveMin      = draiverWeeklyStats?.driveTimeMinutes ?? 0;
        const wkCancelled     = draiverWeeklyStats?.movesCancelled  ?? 0;
        const wkExceptions    = draiverWeeklyStats?.exceptionCount  ?? 0;

        // All-time averages (completed moves only)
        const dAvgDriveMin    = (draiverStats?.avgDriveTimeMinutes ?? 0) > 0
          ? (draiverStats?.avgDriveTimeMinutes ?? null) : null;
        const dAvgMiles       = (draiverStats?.avgMiles ?? 0) > 0
          ? (draiverStats?.avgMiles ?? null) : null;

        // ── Performance metrics ───────────────────────────────────────────

        // Productivity % = Active drive time ÷ Clocked time (target 85%)
        const productivityPct = wiwWorked > 0 && wkDriveMin > 0
          ? Math.min((wkDriveMin / (wiwWorked * 60)) * 100, 100)
          : null;
        const prodColor = productivityPct === null ? "text-muted-foreground"
          : productivityPct >= 85 ? "text-green-600 dark:text-green-400"
          : productivityPct >= 65 ? "text-yellow-600 dark:text-yellow-400"
          : "text-red-600 dark:text-red-400";
        const prodBarColor = productivityPct === null ? "bg-muted"
          : productivityPct >= 85 ? "bg-green-500"
          : productivityPct >= 65 ? "bg-yellow-500"
          : "bg-red-500";
        const prodLabel = productivityPct === null ? "No data this week"
          : productivityPct >= 85 ? "On target"
          : productivityPct >= 65 ? "Below target"
          : "Action needed";

        // Moves per Hour = Completed moves ÷ Clocked hours (target 2.0/hr)
        const movesPerHour = wiwWorked > 0 && wkCompleted > 0
          ? wkCompleted / wiwWorked
          : null;
        const mphColor = movesPerHour === null ? "text-muted-foreground"
          : movesPerHour >= 2.0 ? "text-green-600 dark:text-green-400"
          : movesPerHour >= 1.0 ? "text-yellow-600 dark:text-yellow-400"
          : "text-red-600 dark:text-red-400";

        // Idle Time = Clocked hours − Active drive hours
        const idleHours = wiwWorked > 0 ? Math.max(0, wiwWorked - wkDriveMin / 60) : null;
        const idlePct   = wiwWorked > 0 && idleHours !== null ? (idleHours / wiwWorked) * 100 : 0;
        const idleColor = idleHours === null ? "text-muted-foreground"
          : idlePct < 15 ? "text-green-600 dark:text-green-400"
          : idlePct < 30 ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";
        const idleBarColor = idleHours === null ? "bg-muted"
          : idlePct < 15 ? "bg-green-500"
          : idlePct < 30 ? "bg-amber-500"
          : "bg-red-500";

        // Utilization Rate = Completed ÷ Assigned this week (90% target)
        const utilizationPct = wkMovesTotal > 0 ? (wkCompleted / wkMovesTotal) * 100 : null;
        const utilColor = utilizationPct === null ? "text-muted-foreground"
          : utilizationPct >= 90 ? "text-green-600 dark:text-green-400"
          : utilizationPct >= 75 ? "text-yellow-600 dark:text-yellow-400"
          : "text-red-600 dark:text-red-400";
        const utilBarColor = utilizationPct === null ? "bg-muted"
          : utilizationPct >= 90 ? "bg-green-500"
          : utilizationPct >= 75 ? "bg-yellow-500"
          : "bg-red-500";

        // 14-day trend: move volume (last 7 vs prior 7)
        type TrendDir = "up" | "down" | "flat" | null;
        const moveTrend14 = (moveTrendData?.rows ?? []).slice(-14);
        const mPrev7 = moveTrend14.slice(0, 7).reduce((s: number, r: { moves: number }) => s + r.moves, 0);
        const mCurr7 = moveTrend14.slice(7).reduce((s: number, r: { moves: number }) => s + r.moves, 0);
        const moveTrendDir: TrendDir = moveTrendData && moveTrend14.length >= 14
          ? (mCurr7 > mPrev7 * 1.1 ? "up" : mCurr7 < mPrev7 * 0.9 ? "down" : "flat")
          : null;

        // 14-day trend: clocked hours (last 7 vs prior 7)
        const hTrend14 = wiwHoursTrendData?.rows ?? [];
        const hPrev7 = hTrend14.slice(0, 7).reduce((s: number, r: { hours: number }) => s + r.hours, 0);
        const hCurr7 = hTrend14.slice(7).reduce((s: number, r: { hours: number }) => s + r.hours, 0);
        const hoursTrendDir: TrendDir = wiwHoursTrendData && hTrend14.length >= 14
          ? (hCurr7 > hPrev7 * 1.1 ? "up" : hCurr7 < hPrev7 * 0.9 ? "down" : "flat")
          : null;

        // ── Legacy WIW thresholds (Row 2) ────────────────────────────────
        const hoursBarPct   = Math.min((wiwWorked / 40) * 100, 100);
        const hoursBarColor = wiwWorked < 30 ? "bg-green-500" : wiwWorked <= 35 ? "bg-yellow-500" : "bg-red-500";
        const schedBarPct   = wiwScheduled > 0 ? Math.min((wiwWorked / wiwScheduled) * 100, 130) : 0;
        const schedBarColor = schedBarPct < 75 ? "bg-amber-500" : schedBarPct > 110 ? "bg-red-500" : "bg-green-500";
        type KpiTip = { definition: string; calculation: string; howToUse: string };
        type KpiSource = "WIW" | "Draiver" | "DriverHub";

        function TrendArrow({ dir, label }: { dir: TrendDir; label?: string }) {
          if (!dir) return null;
          if (dir === "flat") return <span className="text-[10px] text-muted-foreground">→ stable</span>;
          return dir === "up"
            ? <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">↑ {label ?? "trending up"}</span>
            : <span className="text-[10px] font-semibold text-red-500">↓ {label ?? "trending down"}</span>;
        }

        function KpiCard({ label, testId, source, tip, children }: {
          label: string; testId: string; source: KpiSource; tip: KpiTip; children: React.ReactNode;
        }) {
          const srcColor = source === "WIW" ? "text-blue-500" : source === "Draiver" ? "text-orange-500" : "text-purple-500";
          return (
            <Card>
              <CardContent className="pt-2.5 pb-2 px-3">
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-1">{label}</p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${srcColor}`}>{source}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button tabIndex={-1} aria-label={`Info: ${label}`}
                          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          data-testid={`info-${testId}`}>
                          <Info className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end" className="max-w-72">
                        <div className="text-xs space-y-1 p-0.5">
                          <p className="font-semibold leading-tight mb-1">{label}</p>
                          <p><span className="font-semibold">Definition:</span> {tip.definition}</p>
                          <p><span className="font-semibold">Calculation:</span> {tip.calculation}</p>
                          <p><span className="font-semibold">How to Use:</span> {tip.howToUse}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div data-testid={testId}>{children}</div>
              </CardContent>
            </Card>
          );
        }

        // Thin inline progress bar shared by several widgets
        function MiniBar({ pct, colorClass, height = "h-1.5" }: { pct: number; colorClass: string; height?: string }) {
          return (
            <div className={`mt-1.5 ${height} w-full rounded-full bg-muted overflow-hidden`}>
              <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
            </div>
          );
        }

        return (
          <div data-testid="driver-kpi-strip" className="grid grid-cols-5 gap-2">

            {/* ══════════════════════════════════════════════════════════════
                ROW 1 — Performance & Productivity
                ══════════════════════════════════════════════════════════ */}

            {/* 1 · Productivity % */}
            <KpiCard label="Productivity %" testId="kpi-productivity" source="Draiver" tip={{
              definition: "Active drive time as a percentage of total clocked hours this week. Measures how much of a driver's shift is spent actively moving vehicles.",
              calculation: "Weekly drive time minutes (Draiver) ÷ (WIW clocked hours × 60) × 100. Requires both Draiver move data and WIW clock-in data.",
              howToUse: "Target ≥ 85% (green). 65–84% is below target (yellow). Below 65% requires action (red). Low productivity may indicate excessive idle time, dispatch gaps, or unreported downtime.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${prodColor}`} data-testid="kpi-productivity-value">
                {productivityPct !== null ? `${productivityPct.toFixed(0)}%` : "—"}
              </p>
              {productivityPct !== null && (
                <>
                  <MiniBar pct={productivityPct} colorClass={prodBarColor} />
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-muted-foreground">{prodLabel}</p>
                    <TrendArrow dir={moveTrendDir} />
                  </div>
                  <p className="text-[9px] text-muted-foreground">85% target</p>
                </>
              )}
              {productivityPct === null && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Requires WIW + Draiver data</p>
              )}
            </KpiCard>

            {/* 2 · Moves per Hour */}
            <KpiCard label="Moves / Hour" testId="kpi-moves-per-hour" source="Draiver" tip={{
              definition: "Number of completed moves per clocked hour this week. Core throughput metric for shift drivers.",
              calculation: "Completed moves (Draiver, this week) ÷ Worked hours (WIW, this week). Requires both data sources.",
              howToUse: "Target ≥ 2.0 moves/hr (green). 1.0–1.99 is below target (yellow). Below 1.0 warrants review (red). Compare across the team to identify high and low performers.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${mphColor}`} data-testid="kpi-moves-per-hour-value">
                {movesPerHour !== null ? movesPerHour.toFixed(2) : "—"}
              </p>
              {movesPerHour !== null && (
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[10px] text-muted-foreground">per clocked hr</p>
                  <TrendArrow dir={moveTrendDir} />
                </div>
              )}
              {movesPerHour === null && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {wkCompleted > 0 ? `${wkCompleted} moves · no WIW hrs` : "No move data this week"}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground mt-0.5">target ≥ 2.0 / hr</p>
            </KpiCard>

            {/* 3 · Idle Time */}
            <KpiCard label="Idle Time" testId="kpi-idle-time" source="Draiver" tip={{
              definition: "Estimated non-productive time: clocked hours minus active drive time this week. Includes time between moves, waiting for assignments, and delays.",
              calculation: "WIW clocked hours − (Draiver weekly drive minutes ÷ 60). A negative result is shown as 0h (data anomaly). Breakdown by category (between-moves, unassigned, delays) will be added in a future phase.",
              howToUse: "Under 15% of shift (green) is excellent. 15–30% (amber) warrants review. Over 30% (red) signals dispatch or availability issues.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${idleColor}`} data-testid="kpi-idle-time-value">
                {idleHours !== null ? `${idleHours.toFixed(1)}h` : "—"}
              </p>
              {idleHours !== null && (
                <>
                  <MiniBar pct={idlePct} colorClass={idleBarColor} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {idlePct.toFixed(0)}% of clocked shift
                  </p>
                </>
              )}
              {idleHours === null && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Requires WIW + Draiver data</p>
              )}
            </KpiCard>

            {/* 4 · Driver Risk Score */}
            <KpiCard label="Driver Risk Score" testId="kpi-loss-score" source="DriverHub" tip={DRIVER_RISK_SCORE_TIP}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`text-2xl font-bold leading-tight tabular-nums ${
                  lossScoreData?.tier === "Top Performer" ? "text-emerald-600 dark:text-emerald-400" :
                  lossScoreData?.tier === "On Track" ? "text-blue-600 dark:text-blue-400" :
                  lossScoreData?.tier === "Watch List" ? "text-yellow-600 dark:text-yellow-400" :
                  "text-red-600 dark:text-red-400"
                }`} data-testid="kpi-risk-score-value">{lossScore}</p>
                {lossScoreData?.tier && (
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      lossScoreData.tier === "Top Performer" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" :
                      lossScoreData.tier === "On Track" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
                      lossScoreData.tier === "Watch List" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" :
                      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    }`}
                    data-testid="badge-loss-tier"
                  >
                    {lossScoreData.tier}
                  </Badge>
                )}
                {lossScoreData?.immediateReview && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-red-600 text-white" data-testid="badge-immediate-review">
                    Immediate Review
                  </Badge>
                )}
              </div>
              {lossScoreData?.riskFloorApplied ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] font-semibold text-red-600 dark:text-red-400" data-testid="label-risk-floor">Unproven Driver with Incident</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">No trip history — score capped in High Risk until moves recorded</p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  85+ Top Performer · 70+ On Track · 50+ Watch List · &lt;50 High Risk
                </p>
              )}
            </KpiCard>

            {/* 5 · Claims (12 mo) */}
            <KpiCard label="Claims (12 mo)" testId="kpi-claims-count" source="DriverHub" tip={{
              definition: "Total claims filed against this driver in the last 12 months.",
              calculation: "Count of DriverHub claim records within the last 365 days.",
              howToUse: "Elevated counts may trigger risk review. Cross-reference with Driver Risk Score.",
            }}>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-bold leading-tight ${claimsCount12mo > 3 ? "text-red-600 dark:text-red-400" : claimsCount12mo > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}`}>{claimsCount12mo}</p>
                {claimsCount12mo > 0 && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${claimsCount12mo > 3 ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"}`}>
                    {claimsCount12mo > 3 ? "High" : "Review"}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">last 12 months</p>
            </KpiCard>

            {/* ══════════════════════════════════════════════════════════════
                ROW 2 — Operations Context
                ══════════════════════════════════════════════════════════ */}

            {/* 6 · Weekly Hours */}
            <KpiCard label="Weekly Hours" testId="kpi-weekly-hours" source="WIW" tip={{
              definition: "Total hours clocked in during the current Monday–Sunday week.",
              calculation: "Sum of approved WhenIWork time entries for the current week.",
              howToUse: "Green < 30h, Yellow 30–35h, Red > 35h. Check for under-utilization or OT risk.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${hoursBarColor === "bg-green-500" ? "text-green-600 dark:text-green-400" : hoursBarColor === "bg-yellow-500" ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                {wiwWorked.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-1">h</span>
              </p>
              <MiniBar pct={hoursBarPct} colorClass={hoursBarColor} />
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-[10px] text-muted-foreground">of 40h target</p>
                <TrendArrow dir={hoursTrendDir} />
              </div>
            </KpiCard>

            {/* 7 · Scheduled vs Worked */}
            <KpiCard label="Scheduled vs Worked" testId="kpi-scheduled-vs-worked" source="WIW" tip={{
              definition: "Actual worked hours versus total scheduled hours for the current week.",
              calculation: "Worked = WIW time entries. Scheduled = WIW shift durations for the current week.",
              howToUse: "Bar below 80% may indicate no-shows. Above 110% flags OT risk.",
            }}>
              <p className="text-2xl font-bold leading-tight tabular-nums">
                <span className={schedBarColor === "bg-green-500" ? "text-green-600 dark:text-green-400" : schedBarColor === "bg-amber-500" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                  {wiwWorked.toFixed(1)}
                </span>
                <span className="text-sm font-normal text-muted-foreground"> / {wiwScheduled > 0 ? `${wiwScheduled.toFixed(1)}h` : "—"}</span>
              </p>
              <MiniBar pct={Math.min(schedBarPct, 100)} colorClass={schedBarColor} />
              <p className="text-[10px] text-muted-foreground mt-0.5">worked / scheduled</p>
            </KpiCard>

            {/* 8 · Utilization Rate (Completed ÷ Assigned — this week, 90% target) */}
            <KpiCard label="Utilization Rate" testId="kpi-utilization-rate" source="Draiver" tip={{
              definition: "Percentage of assigned moves successfully completed this week. Measures how fully a driver's dispatch capacity is being utilized.",
              calculation: "Completed moves ÷ Assigned moves × 100 (current Mon–Sun week). Shown as — if no moves are assigned.",
              howToUse: "Target ≥ 90% (green). 75–89% warrants review (yellow). Below 75% requires action (red). Low utilization combined with high idle time confirms dispatch or availability issues.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${utilColor}`} data-testid="kpi-utilization-rate-value">
                {utilizationPct !== null ? `${utilizationPct.toFixed(0)}%` : "—"}
              </p>
              {utilizationPct !== null && (
                <>
                  <MiniBar pct={utilizationPct} colorClass={utilBarColor} />
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-muted-foreground">
                      {wkCompleted} of {wkMovesTotal} assigned
                    </p>
                    <span className="text-[9px] text-muted-foreground">90% target</span>
                  </div>
                </>
              )}
              {utilizationPct === null && (
                <p className="text-[10px] text-muted-foreground mt-0.5">No moves assigned this week</p>
              )}
            </KpiCard>

            {/* 9 · Moves Since Last Incident */}
            {(() => {
              const msi = movesSinceIncident;
              const displayCount = msi?.hasIncidents ? (msi?.movesSince ?? 0) : (msi?.totalMovesAllTime ?? 0);
              const hasData = !!msi;

              // Color: high = green, medium = yellow, low/recent = red, no incidents = green
              const colorCls =
                !msi?.hasIncidents
                  ? "text-emerald-600 dark:text-emerald-400"
                  : displayCount >= 100
                  ? "text-emerald-600 dark:text-emerald-400"
                  : displayCount >= 25
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400";

              const subtext = !msi
                ? "Loading..."
                : !msi.hasIncidents
                ? "No incidents on record"
                : msi.lastIncidentDate
                ? `Last incident: ${new Date(msi.lastIncidentDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}`
                : "No incidents on record";

              return (
                <KpiCard label="Moves Since Last Incident" testId="kpi-moves-since-incident" source="Draiver" tip={{
                  definition: "Count of completed moves logged in Draiver since the driver's most recent claim or incident on record.",
                  calculation: "Completed moves in partner_move_staging after MAX(incident_date, accident_date) from the accidents table. Displays lifetime total when no incidents exist.",
                  howToUse: "100+ = strong clean streak (green). 25–99 = moderate (yellow). <25 after an incident = elevated risk (red). No incidents = green.",
                }}>
                  <div className="mt-0.5">
                    {hasData ? (
                      <p className={`text-2xl font-black tabular-nums leading-none ${colorCls}`} data-testid="kpi-moves-since-value">
                        {displayCount.toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-2xl font-black tabular-nums leading-none text-muted-foreground">—</p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1" data-testid="kpi-moves-since-subtext">{subtext}</p>
                </KpiCard>
              );
            })()}

            {/* 10 · Miles & Drive Time */}
            <KpiCard label="Miles & Drive Time" testId="kpi-miles-drive-time" source="Draiver" tip={{
              definition: "Total miles driven and total drive time across all completed moves (all time).",
              calculation: "Miles = SUM(unit_miles) for completed Draiver moves. Drive Time = SUM(drive_time_minutes), sourced from Draiver driving_time field (decimal hours converted to minutes). Shows — when no data is available.",
              howToUse: "High totals indicate a high-volume or long-haul driver. Use alongside Move Count to assess per-move workload and identify dispatch efficiency opportunities.",
            }}>
              <div className="flex items-start gap-3 mt-0.5">
                <div className="min-w-0">
                  <p className="text-base font-bold leading-tight tabular-nums">
                    {dMilesTotal > 0
                      ? <>{dMilesTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">mi</span></>
                      : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">total miles</p>
                </div>
                <div className="w-px self-stretch bg-border/60 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold leading-tight tabular-nums">
                    {dDriveMin > 0
                      ? dDriveMin >= 60
                        ? <>{(dDriveMin / 60).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">h</span></>
                        : <>{Math.round(dDriveMin)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">min</span></>
                      : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">total drive time</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">all completed moves · all time</p>
            </KpiCard>

            {/* ══════════════════════════════════════════════════════════════
                ROW 3 — Weekly Move Details & Efficiency Averages (Draiver)
                ══════════════════════════════════════════════════════════ */}

            {/* 11 · Moves This Week */}
            <KpiCard label="Moves This Week" testId="kpi-moves-this-week" source="Draiver" tip={{
              definition: "Total moves assigned to this driver in the current WTD window (Mon–Sun).",
              calculation: "COUNT(*) from Draiver staging WHERE matched_driver_id = driver AND move_created_at in current week.",
              howToUse: "Gauge current week workload. Compare with Assigned vs Completed to see completion progress.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${wkMovesTotal > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                {wkMovesTotal}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">assigned this week</p>
            </KpiCard>

            {/* 12 · Move Outcomes */}
            <KpiCard label="Move Outcomes" testId="kpi-move-outcomes" source="Draiver" tip={{
              definition: "Completed, cancelled, and exception counts for moves assigned this week.",
              calculation: "Counts by mapped_status and validation_status from Draiver staging, filtered to current week.",
              howToUse: "Spot drivers with elevated cancellations or exceptions that warrant follow-up this week.",
            }}>
              {wkMovesTotal === 0 ? (
                <p className="text-muted-foreground text-sm">No moves this week</p>
              ) : (
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    <span className="font-semibold text-green-600 dark:text-green-400">{wkCompleted}</span>
                    <span className="text-muted-foreground">done</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                    <span className="font-semibold">{wkCancelled}</span>
                    <span className="text-muted-foreground">cancel</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    <span className={`font-semibold ${wkExceptions > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{wkExceptions}</span>
                    <span className="text-muted-foreground">exc</span>
                  </span>
                </div>
              )}
            </KpiCard>

            {/* 13 · Exception Count */}
            <KpiCard label="Exception Count" testId="kpi-exception-count" source="Draiver" tip={{
              definition: "Number of moves flagged with a validation warning (exception) this week.",
              calculation: "COUNT(*) FILTER (WHERE validation_status = 'warning') from Draiver staging, current week.",
              howToUse: "0 is ideal. 1–2 warrants review; 3+ may indicate a pattern needing coaching or investigation.",
            }}>
              <p className={`text-2xl font-bold leading-tight tabular-nums ${
                wkExceptions === 0 ? "text-green-600 dark:text-green-400"
                : wkExceptions <= 2 ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
              }`}>
                {wkExceptions}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {wkExceptions === 0 ? "clean this week" : wkExceptions <= 2 ? "review recommended" : "action needed"}
              </p>
              {wkMovesTotal > 0 && (
                <MiniBar
                  pct={Math.min((wkExceptions / wkMovesTotal) * 100, 100)}
                  colorClass={wkExceptions === 0 ? "bg-green-500" : wkExceptions <= 2 ? "bg-amber-500" : "bg-red-500"}
                />
              )}
            </KpiCard>

            {/* 14 · Avg Drive Time per Move */}
            <KpiCard label="Avg Drive Time" testId="kpi-avg-drive-time" source="Draiver" tip={{
              definition: "Average drive time per completed move, across all recorded Draiver history.",
              calculation: "AVG(drive_time_minutes) WHERE mapped_status = 'completed' AND drive_time_minutes > 0.",
              howToUse: "Compare drivers on similar routes. A rising avg may reflect longer routes or inefficiency.",
            }}>
              <p className="text-2xl font-bold leading-tight tabular-nums">
                {dAvgDriveMin !== null
                  ? dAvgDriveMin >= 60
                    ? <>{(dAvgDriveMin / 60).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">h</span></>
                    : <>{Math.round(dAvgDriveMin)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">min</span></>
                  : <span className="text-muted-foreground">—</span>}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">per completed move · all time</p>
            </KpiCard>

            {/* 15 · Avg Miles per Move */}
            <KpiCard label="Avg Miles / Move" testId="kpi-avg-miles" source="Draiver" tip={{
              definition: "Average miles driven per completed move, across all recorded Draiver history.",
              calculation: "AVG(miles) WHERE mapped_status = 'completed' AND miles BETWEEN 0 AND 500.",
              howToUse: "Use to estimate fuel cost and driver wear. Pair with Avg Drive Time to assess route density.",
            }}>
              <p className="text-2xl font-bold leading-tight tabular-nums">
                {dAvgMiles !== null
                  ? <>{dAvgMiles.toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">mi</span></>
                  : <span className="text-muted-foreground">—</span>}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">per completed move · all time</p>
            </KpiCard>

          </div>
        );
      })()}

      {/* ═══ LAYER 3: Entity Workspace ═══ */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-2">
        <TabsList className="hidden">
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
           <TabsTrigger value="pay" data-testid="tab-pay">Pay</TabsTrigger>
          <TabsTrigger value="trips" data-testid="tab-trips">Moves</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">Notes & Comms</TabsTrigger>
          <TabsTrigger value="claims" data-testid="tab-claims">Claims</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          <TabsTrigger value="comments" data-testid="tab-comments">Driver Comments</TabsTrigger>
          <TabsTrigger value="scheduling" data-testid="tab-scheduling">Scheduling</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Status History</TabsTrigger>
          <TabsTrigger value="employee-record" data-testid="tab-employee-record">Employee Record</TabsTrigger>
        </TabsList>

        {/* ── Profile tab: full-width responsive layout ── */}
        <TabsContent value="profile" className="space-y-0">
          <div className="space-y-2">

              {/* Reporting charts have moved to the dedicated Dashboard route. */}
              {false && <Card data-testid="chart-weekly-hours-trend">
                <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-1 pt-3 px-4">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Daily Hours — Last 14 Days (WIW)</CardTitle>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400">
                      <span className="inline-block w-4 border-t border-dashed border-yellow-500" />
                      6h caution
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                      <span className="inline-block w-4 border-t border-dashed border-red-500" />
                      7h OT risk
                    </span>
                    {wiwLastSync?.timesLastSync && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] text-muted-foreground/70 cursor-default" data-testid="text-wiw-last-sync">
                            Synced {(() => {
                              const d = new Date(wiwLastSync.timesLastSync);
                              const now = new Date();
                              const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
                              if (diffMin < 1) return "just now";
                              if (diffMin < 60) return `${diffMin}m ago`;
                              const diffHr = Math.round(diffMin / 60);
                              if (diffHr < 24) return `${diffHr}h ago`;
                              return d.toLocaleDateString([], { month: "short", day: "numeric" });
                            })()}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Last WIW times sync:{" "}
                          {new Date(wiwLastSync.timesLastSync).toLocaleString([], {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {!hasWiwHoursData ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                      No data available for selected timeframe
                    </div>
                  ) : (
                    <div className="h-[200px] w-full">
                      {(() => {
                        const maxHoursVal = weeklyHoursTrend.reduce((m, r) => Math.max(m, r.hours), 0);
                        const yMax = maxHoursVal > 12 ? Math.ceil(maxHoursVal * 1.1) : 12;
                        return (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyHoursTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, yMax]} tickCount={5} />
                          <RechartsTooltip
                            {...rechartsTooltipStyle}
                            formatter={(v: number) => [`${Number(v).toFixed(1)} h`, "Hours"]}
                          />
                          <ReferenceLine y={6} stroke="#eab308" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "6h caution", position: "right", fontSize: 9, fill: "#eab308" }} />
                          <ReferenceLine y={7} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "7h OT risk", position: "right", fontSize: 9, fill: "#ef4444" }} />
                          <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                            {weeklyHoursTrend.map((entry) => (
                              <Cell
                                key={entry.date}
                                fill={entry.hours < 6 ? "hsl(var(--primary))" : entry.hours <= 7 ? "#eab308" : "#ef4444"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                        );
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>}

              {false && <Card data-testid="chart-move-trend">
                <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-1 pt-3 px-4">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Daily Moves — Last 30 Days (Draiver)</CardTitle>
                  {hasMoveData && (() => {
                    // Avg over active days only (days with at least 1 move) for a meaningful metric
                    const activeDays = moveTrend.filter(r => r.moves > 0);
                    const avg = activeDays.reduce((s, r) => s + r.moves, 0) / activeDays.length;
                    return (
                      <div className="ml-auto flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-4 border-t border-dashed border-muted-foreground/50" />
                          avg {avg.toFixed(1)}/active day
                        </span>
                      </div>
                    );
                  })()}
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {!hasMoveData ? (
                    <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
                      No data available for selected timeframe
                    </div>
                  ) : (
                    <div className="h-[120px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={moveTrend} margin={{ top: 5, right: 16, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <RechartsTooltip
                            {...rechartsTooltipStyle}
                            formatter={(v: number) => [v, "Moves"]}
                          />
                          {(() => {
                            const avg = moveTrend.reduce((s, r) => s + r.moves, 0) / moveTrend.length;
                            return <ReferenceLine y={avg} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} strokeWidth={1.5} />;
                          })()}
                          <Line type="monotone" dataKey="moves" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2, fill: "hsl(var(--chart-2))" }} activeDot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>}

              <Card id="personal-section">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="driver-detail-section-title">Personal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Identity and contact stay on one compact row when the viewport allows. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <EditableField
                  label="First Name"
                  value={driver.user?.firstName ?? ""}
                  fieldName="firstName"
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  required
                />
                <EditableField
                  label="Last Name"
                  value={driver.user?.lastName ?? ""}
                  fieldName="lastName"
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  required
                />
                <EditableField
                  label="Phone Number"
                  value={driver.phoneNumber}
                  fieldName="phoneNumber"
                  onSave={handleFieldSave}
                  type="tel"
                  isSaving={updateDriverMutation.isPending}
                  required
                />
                <div data-testid="field-age" className="cursor-not-allowed opacity-60" data-field-state={(driver as any).age !== null && (driver as any).age !== undefined ? "saved" : "empty"}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Age</p>
                  <div className="driver-detail-field-value flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-sm items-center" data-field-state={(driver as any).age !== null && (driver as any).age !== undefined ? "saved" : "empty"}>
                    <span className="flex-1 truncate text-muted-foreground">{(driver as any).age !== null && (driver as any).age !== undefined ? (driver as any).age : null}</span>
                  </div>
                </div>
              </div>

              {/* Address fields use proportional widths rather than leaving a half-row empty. */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-5">
                  <EditableField
                    label="Address"
                    value={driver.address}
                    fieldName="address"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <EditableField
                    label="City"
                    value={driver.city}
                    fieldName="city"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <EditableField
                    label="State"
                    value={driver.state}
                    fieldName="state"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <EditableField
                    label="ZIP Code"
                    value={driver.zipCode}
                    fieldName="zipCode"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <EditableField
                    label="Emergency Contact Name"
                    value={driver.emergencyContactName}
                    fieldName="emergencyContactName"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
                <div className="sm:col-span-3">
                  <EditableField
                    label="Emergency Contact Phone"
                    value={driver.emergencyContactPhone}
                    fieldName="emergencyContactPhone"
                    onSave={handleFieldSave}
                    type="tel"
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
                <div className="sm:col-span-3">
                  <EditableField
                    label="Emergency Contact Email"
                    value={driver.emergencyContactEmail}
                    fieldName="emergencyContactEmail"
                    onSave={handleFieldSave}
                    type="email"
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
                <div className="sm:col-span-2">
                  <SelectableField
                    label="Relationship"
                    value={driver.emergencyContactRelationship}
                    fieldName="emergencyContactRelationship"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    placeholder="Select relationship"
                    options={EMERGENCY_CONTACT_RELATIONSHIP_VALUES.map((v) => ({ value: v, label: v }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="compliance-section">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <CardTitle className="driver-detail-section-title">Compliance &amp; Key Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Operational fields row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1" data-testid="field-market">
                  <SelectableField
                    label="Market"
                    value={driver.market}
                    fieldName="market"
                    options={MARKET_VALUES.map((m) => ({ value: m, label: m }))}
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    placeholder="Select market"
                  />
                </div>
                <div className="space-y-1" data-testid="field-network">
                  <label className="text-xs text-muted-foreground font-medium">Network</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="driver-detail-field-control w-full justify-between font-normal"
                        data-field-state={driver.network ? "saved" : "empty"}
                        data-testid="select-network"
                      >
                        <span className={!driver.network ? "text-muted-foreground" : ""}>{driver.network || "\u00a0"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search network..." data-testid="input-search-network" />
                        <CommandList>
                          <CommandEmpty>No network found.</CommandEmpty>
                          <CommandGroup>
                            {NETWORK_VALUES.map((net) => (
                              <CommandItem
                                key={net}
                                value={net}
                                onSelect={() => { handleFieldSave("network", net); }}
                                data-testid={`option-network-${net.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <Check className={`mr-2 h-4 w-4 ${driver.network === net ? "opacity-100" : "opacity-0"}`} />
                                {net}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1" data-testid="field-recruiter">
                  <label className="text-xs text-muted-foreground font-medium">Recruiter</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="driver-detail-field-control w-full justify-between font-normal"
                        data-field-state={driver.recruiter ? "saved" : "empty"}
                        data-testid="select-recruiter"
                      >
                        <span className={!driver.recruiter ? "text-muted-foreground" : ""}>{driver.recruiter || "\u00a0"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search recruiter..." data-testid="input-search-recruiter" />
                        <CommandList>
                          <CommandEmpty>No recruiter found.</CommandEmpty>
                          <CommandGroup>
                            {driver.recruiter && (
                              <CommandItem
                                value="__clear__"
                                onSelect={() => handleFieldSave("recruiter", "")}
                                data-testid="option-recruiter-clear"
                              >
                                <X className="mr-2 h-4 w-4" />
                                Clear selection
                              </CommandItem>
                            )}
                            {RECRUITER_VALUES.map((rec) => (
                              <CommandItem
                                key={rec}
                                value={rec}
                                onSelect={() => handleFieldSave("recruiter", rec)}
                                data-testid={`option-recruiter-${rec.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <Check className={`mr-2 h-4 w-4 ${driver.recruiter === rec ? "opacity-100" : "opacity-0"}`} />
                                {rec}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <EditableField
                  label="Payment ID"
                  value={driver.paymentId}
                  fieldName="paymentId"
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  maxLength={12}
                  alphanumericOnly
                />
              </div>

              <Separator />

              {/* Key Dates header */}
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key Dates</span>
              </div>

              {/* Employment dates row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <EditableField
                  label="Hire Date"
                  value={parseFormDate(driver.hireDate)}
                  fieldName="hireDate"
                  onSave={handleFieldSave}
                  type="date"
                  isSaving={updateDriverMutation.isPending}
                  required
                />
                <EditableField
                  label="Date of Birth"
                  value={parseFormDate(driver.dateOfBirth)}
                  fieldName="dateOfBirth"
                  onSave={handleFieldSave}
                  type="date"
                  isSaving={updateDriverMutation.isPending}
                  required
                />
                <EditableField
                  label="Gender"
                  value={driver.gender}
                  fieldName="gender"
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  maxLength={8}
                  alphanumericOnly
                />
                <div className="space-y-1" data-testid="field-created-date" data-field-state={driver.createdAt ? "saved" : "empty"}>
                  <p className="text-xs font-medium text-muted-foreground">Created Date</p>
                  <div className="driver-detail-field-value flex h-9 rounded-md border px-3 py-1 text-base items-center" data-field-state={driver.createdAt ? "saved" : "empty"} data-testid="text-created-date">
                    {driver.createdAt ? formatDate(driver.createdAt) : null}
                  </div>
                  <p className="text-[10px] text-muted-foreground">System</p>
                </div>
              </div>

              {/* Compliance dates row — Drug Test + MVR */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1" data-testid="compliance-drug-test-field">
                  <EditableField
                    label="Drug Test Date"
                    value={parseFormDate(driver.drugTestDate)}
                    fieldName="drugTestDate"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                  <ComplianceBadge status={drugTestStatus} />
                </div>
                <div className="space-y-1" data-testid="compliance-mvr-field">
                  <EditableField
                    label="MVR Record Date"
                    value={parseFormDate(driver.mvrDate)}
                    fieldName="mvrDate"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                  <ComplianceBadge status={mvrStatus} />
                  {/* MVR Workflow Status */}
                  {(driver as any).mvrProgress && (() => {
                    const prog = (driver as any).mvrProgress as string;
                    const updatedAt = (driver as any).mvrProgressUpdatedAt;
                    const daysInStatus = updatedAt
                      ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000))
                      : null;
                    const colorCls = daysInStatus === null ? "text-muted-foreground"
                      : daysInStatus >= 6 ? "text-destructive font-semibold"
                      : daysInStatus >= 3 ? "text-yellow-600 dark:text-yellow-400 font-medium"
                      : "text-foreground";
                    const showUnresponsiveHint = prog === "Link Sent" && daysInStatus !== null && daysInStatus >= 3;
                    return (
                      <div className="flex flex-col gap-0.5 mt-1" data-testid="mvr-workflow-status">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">Workflow:</span>
                          <span className="text-xs font-medium">{prog}</span>
                          {daysInStatus !== null && (
                            <span className={`text-xs ${colorCls}`} data-testid="mvr-days-in-status">
                              · {daysInStatus}d in status
                            </span>
                          )}
                        </div>
                        {showUnresponsiveHint && (
                          <div className="flex items-center gap-1 text-[11px] text-yellow-600 dark:text-yellow-400">
                            <span>⚑ {daysInStatus}d since link sent — consider marking Unresponsive</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(mvrStatus.color === "red" || mvrStatus.color === "yellow" || !driver.mvrDate) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-full text-xs gap-1.5"
                      onClick={() => setSendMvrDialogOpen(true)}
                      data-testid="button-send-mvr-request"
                    >
                      <Send className="h-3 w-3" />
                      Send MVR Request
                    </Button>
                  )}
                </div>
                <div className="space-y-1" data-testid="compliance-background-field">
                  <EditableField
                    label="Background Check Date"
                    value={parseFormDate(driver.backgroundCheckDate)}
                    fieldName="backgroundCheckDate"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                  <ComplianceBadge status={getAnnualComplianceStatus(driver.backgroundCheckDate)} />
                </div>
              </div>

              {/* License information row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1" data-testid="field-license-number">
                  <EditableField
                    label="License Number"
                    value={driver.licenseNumber}
                    fieldName="licenseNumber"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
                <div className="space-y-1" data-testid="field-license-state">
                  <EditableField
                    label="License State"
                    value={driver.licenseState}
                    fieldName="licenseState"
                    onSave={handleFieldSave}
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                </div>
                <div className="space-y-1" data-testid="compliance-license-field">
                  <EditableField
                    label="License Expiration"
                    value={parseFormDate(driver.licenseExpiration)}
                    fieldName="licenseExpiration"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                    required
                  />
                  <ComplianceBadge status={licenseStatus} />
                </div>
              </div>

              {/* Certification + trip dates row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/50">
                <div className="space-y-1" data-testid="compliance-certified-field">
                  <EditableField
                    label="Date Certified"
                    value={parseFormDate(driver.dateCertified)}
                    fieldName="dateCertified"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
                <div className="space-y-1" data-testid="field-certifiedBy">
                  <label className="text-xs text-muted-foreground font-medium">Certified By</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="driver-detail-field-control w-full justify-between font-normal"
                        data-field-state={driver.certifiedBy ? "saved" : "empty"}
                        data-testid="select-certified-by"
                      >
                        <span className={!driver.certifiedBy ? "text-muted-foreground" : ""}>{driver.certifiedBy || "\u00a0"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search certified by..." data-testid="input-search-certified-by" />
                        <CommandList>
                          <CommandEmpty>No match found.</CommandEmpty>
                          <CommandGroup>
                            {driver.certifiedBy && (
                              <CommandItem
                                value="__clear__"
                                onSelect={() => handleFieldSave("certifiedBy", "")}
                                data-testid="option-certified-by-clear"
                              >
                                <X className="mr-2 h-4 w-4" />
                                Clear selection
                              </CommandItem>
                            )}
                            {CERTIFIED_BY_VALUES.map((cb) => (
                              <CommandItem
                                key={cb}
                                value={cb}
                                onSelect={() => handleFieldSave("certifiedBy", cb)}
                                data-testid={`option-certified-by-${cb.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <Check className={`mr-2 h-4 w-4 ${driver.certifiedBy === cb ? "opacity-100" : "opacity-0"}`} />
                                {cb}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1" data-testid="field-first-trip-date" data-field-state={driver.firstMoveDate ? "saved" : "empty"}>
                  <p className="text-xs font-medium text-muted-foreground">First Trip Date</p>
                  <div className="driver-detail-field-value flex h-9 rounded-md border px-3 py-1 text-base items-center" data-field-state={driver.firstMoveDate ? "saved" : "empty"} data-testid="text-first-trip-date">
                    {driver.firstMoveDate ? formatDate(driver.firstMoveDate) : null}
                  </div>
                  <p className="text-[10px] text-muted-foreground">System</p>
                </div>
                <div className="space-y-1" data-testid="field-last-trip-date" data-field-state={driver.lastMoveDate ? "saved" : "empty"}>
                  <p className="text-xs font-medium text-muted-foreground">Last Trip Date</p>
                  <div className="driver-detail-field-value flex h-9 rounded-md border px-3 py-1 text-base items-center" data-field-state={driver.lastMoveDate ? "saved" : "empty"} data-testid="text-last-trip-date">
                    {driver.lastMoveDate ? formatDate(driver.lastMoveDate) : null}
                  </div>
                  <p className="text-[10px] text-muted-foreground">System</p>
                </div>
              </div>

              {/* Lifecycle dates row — always visible regardless of driver status */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/50">
                <div className="space-y-1" data-testid="field-termination-date">
                  <EditableField
                    label="Termination Date"
                    value={parseFormDate(driver.terminationDate || driver.contractCancelledDate)}
                    fieldName={driver.driverClassification === "Employee" ? "terminationDate" : "contractCancelledDate"}
                    onSave={(fieldName, value) => {
                      // If setting a new date but Termination Reason or Eligible for Rehire is missing,
                      // block the inline save and direct the user to the TerminationSection form which
                      // captures all required fields atomically.
                      if (value && (!driver.terminationReason || !driver.terminationEligibleForRehire)) {
                        toast({
                          title: "Additional information required",
                          description: "Use the Termination / Cancellation Details form below to enter the date along with the required Termination Reason and Eligible for Rehire.",
                          variant: "destructive",
                        });
                        return;
                      }
                      handleFieldSave(fieldName, value);
                    }}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
                <div className="space-y-1" data-testid="field-reactivation-date">
                  <EditableField
                    label="Reactivation Date"
                    value={parseFormDate(driver.reactivationDate)}
                    fieldName="reactivationDate"
                    onSave={handleFieldSave}
                    type="date"
                    isSaving={updateDriverMutation.isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="professional-section">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Briefcase className="h-5 w-5 text-primary" />
              <CardTitle className="driver-detail-section-title">Professional Details</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <SelectableField
                  label="Status"
                  value={driver.status || "active"}
                  fieldName="status"
                  options={[
                    { value: "active", label: "Active" },
                    { value: "onboarding", label: "Onboarding" },
                    { value: "inactive", label: "Inactive" },
                    { value: "suspended", label: "Suspended" },
                    { value: "terminated", label: "Terminated" }
                  ]}
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  placeholder="Select status"
                  required
                  width="15ch"
                />
                {driver.statusChangedAt && (
                  <p className="text-[10px] text-muted-foreground" data-testid="text-status-audit">
                    Changed{driver.previousStatus ? ` from ${driver.previousStatus}` : ""} on {new Date(driver.statusChangedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <SelectableField
                label="Driver Type"
                value={driver.driverType}
                fieldName="driverType"
                options={[
                  { value: "DriverShift", label: "DriverShift" },
                  { value: "DriverDash", label: "DriverDash" },
                  { value: "Hybrid", label: "Hybrid" }
                ]}
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
                placeholder="Select driver type"
                required
                width="15ch"
              />
              <SelectableField
                label="Driver Classification"
                value={driver.driverClassification}
                fieldName="driverClassification"
                options={[
                  { value: "Employee", label: "Employee" },
                  { value: "Independent Contractor", label: "Independent Contractor" }
                ]}
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
                placeholder="Select classification"
                required
                width="25ch"
              />
              <SelectableField
                label="Employment Type"
                value={driver.employmentType}
                fieldName="employmentType"
                options={employmentTypeOptions}
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
                placeholder="Select employment type"
                width="18ch"
              />
              <EditableField
                label="OpenForce ID"
                value={driver.openforceId}
                fieldName="openforceId"
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
                data-testid="field-openforce-id"
              />
              <div className="space-y-1">
                <EditableField
                  label="Employee ID"
                  value={driver.employeeId}
                  fieldName="employeeId"
                  onSave={(fieldName, value) => {
                    if (driver.driverClassification !== "Employee") {
                      toast({
                        title: "Cannot update Employee ID",
                        description: "Driver classified as Independent Contractor, update Independent Contractor ID field",
                        variant: "destructive"
                      });
                      return;
                    }
                    handleFieldSave(fieldName, value);
                  }}
                  isSaving={updateDriverMutation.isPending}
                  disabled={driver.driverClassification !== "Employee"}
                  maxLength={12}
                  alphanumericOnly
                />
                {driver.driverClassification !== "Employee" && (
                  <p className="text-xs text-muted-foreground">
                    Only available when Driver Classification is "Employee"
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <EditableField
                  label="Independent Contractor ID"
                  value={driver.independentContractorId}
                  fieldName="independentContractorId"
                  onSave={(fieldName, value) => {
                    if (driver.driverClassification !== "Independent Contractor") {
                      toast({
                        title: "Cannot update Independent Contractor ID",
                        description: "Driver classified as Employee, update Employee ID field",
                        variant: "destructive"
                      });
                      return;
                    }
                    handleFieldSave(fieldName, value);
                  }}
                  isSaving={updateDriverMutation.isPending}
                  disabled={driver.driverClassification !== "Independent Contractor"}
                  maxLength={12}
                  alphanumericOnly
                />
                {driver.driverClassification !== "Independent Contractor" && (
                  <p className="text-xs text-muted-foreground">
                    Only available when Driver Classification is "Independent Contractor"
                  </p>
                )}
              </div>
              
              <div className="space-y-1" data-testid="field-directManager">
                <label className="text-xs text-muted-foreground font-medium">Direct Manager</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                        className="driver-detail-field-control w-full justify-between font-normal"
                        data-field-state={driver.directManager ? "saved" : "empty"}
                      data-testid="select-directManager"
                      disabled={driver.driverClassification !== "Employee"}
                    >
                      <span className={!driver.directManager ? "text-muted-foreground" : ""}>{driver.directManager || "\u00a0"}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search manager..." data-testid="input-search-directManager" />
                      <CommandList>
                        <CommandEmpty>No manager found.</CommandEmpty>
                        <CommandGroup>
                          {driver.directManager && (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => handleFieldSave("directManager", "")}
                              data-testid="option-directManager-clear"
                            >
                              <X className="mr-2 h-4 w-4" />
                              Clear selection
                            </CommandItem>
                          )}
                          {DIRECT_MANAGER_VALUES.map((mgr) => (
                            <CommandItem
                              key={mgr}
                              value={mgr}
                              onSelect={() => handleFieldSave("directManager", mgr)}
                              data-testid={`option-directManager-${mgr.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              <Check className={`mr-2 h-4 w-4 ${driver.directManager === mgr ? "opacity-100" : "opacity-0"}`} />
                              {mgr}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  {driver.driverClassification !== "Employee"
                    ? "Only available for Employee drivers"
                    : "Manager who approves expenses for this employee driver"}
                </p>
              </div>
              
              <EmployeeSearchField
                label="Driver Advocate"
                value={driver.driverAdvocateId}
                employeeName={driverAdvocate ? `${driverAdvocate.firstName} ${driverAdvocate.lastName}` : null}
                fieldName="driverAdvocateId"
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
                disabled={driver.driverClassification !== "Independent Contractor"}
                helperText={driver.driverClassification !== "Independent Contractor"
                  ? "Only available for Independent Contractor drivers"
                  : "Advocate who approves expenses for this contractor driver"}
              />
              
              {/* Account Assignment — current and historical rows share the authoritative driver_accounts table. */}
              <div className="space-y-2 col-span-full" data-testid="field-account-assignment">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Current Assignments</p>
                  {driver.status === "active" && (
                    <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" data-testid="button-add-account">
                          <Plus className="h-3 w-3 mr-1" /> Add Account
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="end">
                        <Command>
                          <CommandInput
                            placeholder="Search eligible accounts..."
                            value={accountSearchQuery}
                            onValueChange={setAccountSearchQuery}
                            data-testid="input-search-account"
                          />
                          <CommandList>
                            <CommandEmpty>No eligible accounts found.</CommandEmpty>
                            <CommandGroup>
                              {allAccountOptions
                                .filter(a => !driverAssignedAccounts.some(da => da.accountId === a.id))
                                .map(account => (
                                  <CommandItem
                                    key={account.id}
                                    value={account.customerName}
                                    onSelect={() => {
                                      const isFirst = driverAssignedAccounts.length === 0;
                                      assignAccountMutation.mutate({ accountId: account.id, isPrimary: isFirst });
                                    }}
                                    data-testid={`option-account-${account.id}`}
                                  >
                                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                                    <span>{account.customerName}</span>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {driverAssignedAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No current account assignments.</p>
                ) : (
                  <div className="space-y-1">
                    {driverAssignedAccounts.map(da => {
                      const showPrimaryControls = driverAssignedAccounts.length >= 2;
                      return (
                        <div
                          key={da.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                          data-testid={`account-row-${da.accountId}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {showPrimaryControls ? (
                              da.isPrimary ? (
                                <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="currentColor" />
                              ) : (
                                <Star className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                              )
                            ) : (
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                            )}
                            <span className="text-sm truncate">{da.customerName}</span>
                            {showPrimaryControls && da.isPrimary && (
                              <Badge variant="secondary" className="text-xs shrink-0">Primary</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {showPrimaryControls && !da.isPrimary && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setPrimaryMutation.mutate(da.accountId)}
                                disabled={setPrimaryMutation.isPending}
                                data-testid={`button-set-primary-${da.accountId}`}
                              >
                                Set Primary
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => removeAccountMutation.mutate(da.accountId)}
                              disabled={removeAccountMutation.isPending}
                              data-testid={`button-remove-account-${da.accountId}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-3 border-t mt-3" data-testid="account-assignment-history">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Past Assignments</p>
                  {driverAccountHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">No past account assignments recorded.</p>
                  ) : (
                    <div className="space-y-1">
                      {driverAccountHistory.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-muted-foreground"
                          data-testid={`account-history-row-${assignment.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <History className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-sm truncate">{assignment.customerName}</span>
                          </div>
                          <span className="text-xs shrink-0">
                            {assignment.assignmentStartedAt ? formatDate(assignment.assignmentStartedAt) : "Start unavailable"}
                            {" – "}
                            {assignment.assignmentEndedAt ? formatDate(assignment.assignmentEndedAt) : "End unavailable"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <EditableField
                label="Driver Number"
                value={driver.driverNumber}
                fieldName="driverNumber"
                onSave={handleFieldSave}
                isSaving={updateDriverMutation.isPending}
              />
              {/* Termination/Contract Cancellation Section - always visible as lifecycle audit fields */}
              <TerminationSection
                driver={driver}
                onSave={async (updates) => {
                  await updateDriverMutation.mutateAsync(updates);
                }}
                isSaving={updateDriverMutation.isPending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="driver-detail-section-title">Payment Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <EditableField
                  label="Hourly Pay Rate"
                  value={driver.basePayPerMile ? String(driver.basePayPerMile) : ""}
                  fieldName="basePayPerMile"
                  onSave={handleFieldSave}
                  type="currency"
                  isSaving={updateDriverMutation.isPending}
                />
                <MaskedSSNField
                  label="SSN/EIN"
                  last4Value={driver.ssnOrEinLast4}
                  fieldName="ssnOrEinEncrypted"
                  driverId={driver.id}
                  onSave={handleFieldSave}
                  isSaving={updateDriverMutation.isPending}
                  driverClassification={driver.driverClassification}
                  canViewFullSsn={(driver as any).canViewFullSsn ?? false}
                  canEditSsn={(driver as any).canEditSsn ?? false}
                />
              </div>
              
              <Separator />
              
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Hours (via When I Work)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div data-testid="field-hoursWtd" data-field-state={driver.hoursWtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Hours WTD</p>
                    <p className="text-sm font-semibold">{driver.hoursWtd != null ? Number(driver.hoursWtd).toFixed(1) : null}</p>
                  </div>
                  <div data-testid="field-hoursMtd" data-field-state={driver.hoursMtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Hours MTD</p>
                    <p className="text-sm font-semibold">{driver.hoursMtd != null ? Number(driver.hoursMtd).toFixed(1) : null}</p>
                  </div>
                  <div data-testid="field-hoursYtd" data-field-state={driver.hoursYtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Hours YTD</p>
                    <p className="text-sm font-semibold">{driver.hoursYtd != null ? Number(driver.hoursYtd).toFixed(1) : null}</p>
                  </div>
                  <div data-testid="field-lifetimeHours" data-field-state={driver.lifetimeHours != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Lifetime Hours</p>
                    <p className="text-sm font-semibold">{driver.lifetimeHours != null ? Number(driver.lifetimeHours).toFixed(1) : null}</p>
                  </div>
                  <div data-testid="field-averageHoursPerWeek" data-field-state={driver.averageHoursPerWeek != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Avg Hours/Week</p>
                    <p className="text-sm font-semibold">{driver.averageHoursPerWeek != null ? Number(driver.averageHoursPerWeek).toFixed(1) : null}</p>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pay (via When I Work)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div data-testid="field-payLastWeek" data-field-state={driver.payLastWeek != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Pay Last Week</p>
                    <p className="text-sm font-semibold">{driver.payLastWeek != null ? `$${Number(driver.payLastWeek).toFixed(2)}` : null}</p>
                  </div>
                  <div data-testid="field-payWtd" data-field-state={driver.payWtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Pay WTD (Est)</p>
                    <p className="text-sm font-semibold">{driver.payWtd != null ? `$${Number(driver.payWtd).toFixed(2)}` : null}</p>
                  </div>
                  <div data-testid="field-payMtd" data-field-state={driver.payMtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Pay MTD</p>
                    <p className="text-sm font-semibold">{driver.payMtd != null ? `$${Number(driver.payMtd).toFixed(2)}` : null}</p>
                  </div>
                  <div data-testid="field-payYtd" data-field-state={driver.payYtd != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Pay YTD</p>
                    <p className="text-sm font-semibold">{driver.payYtd != null ? `$${Number(driver.payYtd).toFixed(2)}` : null}</p>
                  </div>
                  <div data-testid="field-lifetimePay" data-field-state={driver.lifetimePay != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Lifetime Pay</p>
                    <p className="text-sm font-semibold">{driver.lifetimePay != null ? `$${Number(driver.lifetimePay).toFixed(2)}` : null}</p>
                  </div>
                  <div data-testid="field-averagePayPerWeek" data-field-state={driver.averagePayPerWeek != null ? "saved" : "empty"}>
                    <p className="text-xs text-muted-foreground">Avg Pay/Week</p>
                    <p className="text-sm font-semibold">{driver.averagePayPerWeek != null ? `$${Number(driver.averagePayPerWeek).toFixed(2)}` : null}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="driver-detail-section-title">Driver Statistics</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lifetime Moves</p>
                <p className="mt-1 text-sm font-semibold">{driver.lifetimeMoveCount ?? 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Month Moves</p>
                <p className="mt-1 text-sm font-semibold">{driver.currentMonthMoveCount ?? 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Month Moves</p>
                <p className="mt-1 text-sm font-semibold">{driver.lastMonthMoveCount ?? 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Safety Score</p>
                {driver.safetyScore && <Badge
                  variant={
                    driver.safetyScore === "Green" ? "default" :
                    driver.safetyScore === "Yellow" ? "secondary" :
                    driver.safetyScore === "Red" ? "destructive" : "secondary"
                  }
                  className="mt-1"
                >
                  {driver.safetyScore}
                </Badge>
                }
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Move Date</p>
                <p className="mt-1">
                  {driver.lastMoveDate
                    ? formatDate(driver.lastMoveDate)
                    : null}
                </p>
              </div>
            </CardContent>
          </Card>

            {/* Safety Flags Section */}
            <DriverSafetyFlags driverId={driver.id} />

            {/* Alerts / Missing Data — retained below the full-width Profile content. */}
            {(() => {
              const missingAlerts: { label: string }[] = [];
              if (!driver.ssnOrEinLast4) missingAlerts.push({ label: "Missing SSN/EIN" });
              if (!primaryAccount) missingAlerts.push({ label: "No Account Assigned" });
              if (!driver.drugTestDate) missingAlerts.push({ label: "Missing Drug Test Date" });
              if (!driver.mvrDate) missingAlerts.push({ label: "Missing MVR Record Date" });
              if (!driver.licenseNumber) missingAlerts.push({ label: "Missing License Number" });
              if (missingAlerts.length === 0) return null;
              return (
                <Card data-testid="card-alerts-missing">
                  <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-1 pt-3 px-4">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <CardTitle className="text-sm font-medium">Alerts &amp; Missing Data</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 px-4 pb-3">
                    {missingAlerts.map((alert) => (
                      <div key={alert.label} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400" data-testid={`alert-missing-${alert.label.toLowerCase().replace(/\s+/g, '-')}`}>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{alert.label}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </TabsContent>

        <TabsContent value="pay">
          {/* ── Pay Profile Card ────────────────────────────────────────────── */}
          <Card className="mb-6" data-testid="card-pay-profile">
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Pay Profile
                  </CardTitle>
                  <CardDescription>
                    Pay type, rates, and bonus rules for this driver
                  </CardDescription>
                </div>
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => {
                    setPayProfileForm({
                      workerType:     payProfile?.workerType ?? "IC",
                      payType:        payProfile?.payType ?? "per_move",
                      hourlyRate:     payProfile?.hourlyRate ?? "",
                      otMultiplier:   payProfile?.otMultiplier ?? "1.5",
                      otThresholdHrs: payProfile?.otThresholdHrs ?? "40",
                      perMoveRate:    payProfile?.perMoveRate ?? "",
                      perMileRate:    payProfile?.perMileRate ?? "",
                      salaryAmount:   payProfile?.salaryAmount ?? "",
                      notes:          payProfile?.notes ?? "",
                    });
                    setPayProfileEditOpen(true);
                  }}
                  data-testid="button-edit-pay-profile"
                >
                  {payProfile ? "Edit Profile" : "Configure Profile"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {payProfileLoading ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : !payProfile ? (
                <div className="py-10 text-center">
                  <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No pay profile configured</p>
                  <p className="text-xs text-muted-foreground mt-1">Set up pay type and rates to enable payroll calculations for this driver.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Worker Type",   value: payProfile.workerType },
                    { label: "Pay Type",      value: payProfile.payType?.replace(/_/g, " ") },
                    { label: "Hourly Rate",   value: payProfile.hourlyRate ? `$${Number(payProfile.hourlyRate).toFixed(2)}/hr` : "—" },
                    { label: "OT Multiplier", value: `${payProfile.otMultiplier}×` },
                    { label: "OT Threshold",  value: `${payProfile.otThresholdHrs}h/week` },
                    { label: "Per-Move Rate", value: payProfile.perMoveRate ? `$${Number(payProfile.perMoveRate).toFixed(2)}` : "—" },
                    { label: "Per-Mile Rate", value: payProfile.perMileRate ? `$${Number(payProfile.perMileRate).toFixed(4)}/mi` : "—" },
                    { label: "Salary",        value: payProfile.salaryAmount ? `$${Number(payProfile.salaryAmount).toFixed(2)}/yr` : "—" },
                    { label: "Effective",     value: payProfile.effectiveFrom ? new Date(payProfile.effectiveFrom).toLocaleDateString() : "Immediately" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-sm font-medium capitalize">{value}</p>
                    </div>
                  ))}
                  {payProfile.notes && (
                    <div className="col-span-full">
                      <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                      <p className="text-sm">{payProfile.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pay Profile edit dialog */}
          <Dialog open={payProfileEditOpen} onOpenChange={setPayProfileEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{payProfile ? "Edit Pay Profile" : "Configure Pay Profile"}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Worker Type</label>
                    <Select value={payProfileForm.workerType || "IC"} onValueChange={v => setPayProfileForm(f => ({ ...f, workerType: v }))}>
                      <SelectTrigger data-testid="select-worker-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IC">Independent Contractor</SelectItem>
                        <SelectItem value="W2">W-2 Employee</SelectItem>
                        <SelectItem value="1099">1099</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Pay Type</label>
                    <Select value={payProfileForm.payType || "per_move"} onValueChange={v => setPayProfileForm(f => ({ ...f, payType: v }))}>
                      <SelectTrigger data-testid="select-pay-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="per_move">Per Move</SelectItem>
                        <SelectItem value="per_mile">Per Mile</SelectItem>
                        <SelectItem value="salary">Salary</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Hourly Rate ($)</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={payProfileForm.hourlyRate} onChange={e => setPayProfileForm(f => ({ ...f, hourlyRate: e.target.value }))} data-testid="input-hourly-rate" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Per-Move Rate ($)</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={payProfileForm.perMoveRate} onChange={e => setPayProfileForm(f => ({ ...f, perMoveRate: e.target.value }))} data-testid="input-per-move-rate" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Per-Mile Rate ($)</label>
                    <Input type="number" step="0.0001" placeholder="0.0000" value={payProfileForm.perMileRate} onChange={e => setPayProfileForm(f => ({ ...f, perMileRate: e.target.value }))} data-testid="input-per-mile-rate" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Annual Salary ($)</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={payProfileForm.salaryAmount} onChange={e => setPayProfileForm(f => ({ ...f, salaryAmount: e.target.value }))} data-testid="input-salary" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">OT Multiplier</label>
                    <Input type="number" step="0.01" value={payProfileForm.otMultiplier} onChange={e => setPayProfileForm(f => ({ ...f, otMultiplier: e.target.value }))} data-testid="input-ot-multiplier" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">OT Threshold (hrs/week)</label>
                    <Input type="number" value={payProfileForm.otThresholdHrs} onChange={e => setPayProfileForm(f => ({ ...f, otThresholdHrs: e.target.value }))} data-testid="input-ot-threshold" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                  <Input value={payProfileForm.notes} onChange={e => setPayProfileForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-pay-notes" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayProfileEditOpen(false)}>Cancel</Button>
                <Button onClick={() => savePayProfileMutation.mutate()} disabled={savePayProfileMutation.isPending} data-testid="button-save-pay-profile">
                  {savePayProfileMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Profile
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Payment History ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>{payRecords.length} pay records</CardDescription>
            </CardHeader>
            <CardContent>
              {payRecords.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No pay records found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payRecords.map((record, index) => (
                    <div
                      key={record.id}
                      className="border border-border rounded-lg p-4"
                      data-testid={`card-pay-record-${index}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">
                            {formatDate(record.payPeriodStart)} - {formatDate(record.payPeriodEnd)}
                          </div>
                          {record.paymentDate && (
                            <div className="text-sm text-muted-foreground">
                              Paid: {formatDate(record.paymentDate)}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">${Number(record.netPay).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">Net Pay</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Gross:</span>{" "}
                          <span className="font-medium">${Number(record.grossPay).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Hours:</span>{" "}
                          <span className="font-medium">
                            {record.hoursWorked ? Number(record.hoursWorked).toFixed(1) : "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Miles:</span>{" "}
                          <span className="font-medium">
                            {record.milesDelivered ? Number(record.milesDelivered).toFixed(0) : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pay Explanation Section */}
          <Card className="mt-6" data-testid="card-pay-explanation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Pay Breakdown Explanation
              </CardTitle>
              <CardDescription>
                Understand why you earned what you earned for each pay period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Select Pay Period</label>
                  <Select 
                    value={selectedPayPeriodId || ""} 
                    onValueChange={(value) => setSelectedPayPeriodId(value || null)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-pay-period">
                      <SelectValue placeholder="Choose a pay period to see breakdown" />
                    </SelectTrigger>
                    <SelectContent>
                      {payRecords.map((record, index) => (
                        <SelectItem key={record.id} value={record.id} data-testid={`option-pay-period-${index}`}>
                          {formatDate(record.payPeriodStart)} - {formatDate(record.payPeriodEnd)} (${Number(record.netPay).toFixed(2)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPayPeriodId && (
                  <div className="border rounded-lg p-4 space-y-4">
                    {payExplanationLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-1/3" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : payExplanation?.breakdown ? (
                      <>
                        {/* Period Info */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <h4 className="font-semibold" data-testid="text-pay-driver-name">{payExplanation.breakdown.driverName}</h4>
                            <p className="text-sm text-muted-foreground" data-testid="text-pay-period-info">
                              {payExplanation.breakdown.workerType.replace('_', ' ')} | Period: {formatDate(payExplanation.breakdown.payPeriod.periodStart)} - {formatDate(payExplanation.breakdown.payPeriod.periodEnd)}
                            </p>
                          </div>
                          <Badge variant={payExplanation.breakdown.payPeriod.status === 'LOCKED' ? 'default' : 'secondary'} data-testid="badge-pay-period-status">
                            {payExplanation.breakdown.payPeriod.status}
                          </Badge>
                        </div>

                        <Separator />

                        {/* Multipliers Section */}
                        <div>
                          <h5 className="font-medium mb-2 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Performance Multipliers
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="p-3 rounded-lg border">
                              <p className="text-muted-foreground">Moves Completed</p>
                              <p className="text-xl font-bold" data-testid="text-trips-completed">
                                {payExplanation.breakdown.metricInputs.tripsCompleted}
                              </p>
                            </div>
                            <div className="p-3 rounded-lg border">
                              <p className="text-muted-foreground">Safety Score</p>
                              <p className="text-xl font-bold" data-testid="text-safety-score">
                                {payExplanation.breakdown.metricInputs.safetyScore}%
                              </p>
                            </div>
                            <div className="p-3 rounded-lg border">
                              <p className="text-muted-foreground">Volume Multiplier</p>
                              <p className="text-xl font-bold" data-testid="text-volume-multiplier">
                                {(payExplanation.breakdown.metricInputs.volumeMultiplier * 100).toFixed(0)}%
                              </p>
                            </div>
                            <div className="p-3 rounded-lg border">
                              <p className="text-muted-foreground">Safety Multiplier</p>
                              <p className="text-xl font-bold" data-testid="text-safety-multiplier">
                                {(payExplanation.breakdown.metricInputs.safetyMultiplier * 100).toFixed(0)}%
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Combined Effective Multiplier</span>
                              <span className="text-lg font-bold" data-testid="text-effective-multiplier">
                                {(payExplanation.breakdown.metricInputs.clampedCombinedMultiplier * 100).toFixed(0)}%
                              </span>
                            </div>
                            {payExplanation.breakdown.metricInputs.clampApplied && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Clamp applied (85% - 115% range)
                              </p>
                            )}
                          </div>
                        </div>

                        <Separator />

                        {/* Pay Calculation */}
                        <div>
                          <h5 className="font-medium mb-2 flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Pay Calculation
                          </h5>
                          <div className="space-y-2">
                            {payExplanation.breakdown.payLines.map((line, idx) => (
                              <div key={line.id} className="p-3 rounded-lg border" data-testid={`pay-line-${idx}`}>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                  <div>
                                    <p className="text-muted-foreground">Hours Worked</p>
                                    <p className="font-medium">{(line.paidMinutes / 60).toFixed(1)} hrs</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Base Rate</p>
                                    <p className="font-medium">${(line.baseRateCents / 100).toFixed(2)}/hr</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Base Pay</p>
                                    <p className="font-medium">${(line.basePayCents / 100).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Adjusted Pay</p>
                                    <p className="font-medium">${(line.adjustedPayCents / 100).toFixed(2)}</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                  {line.floorApplied && <Badge variant="outline">Floor Applied</Badge>}
                                  {line.capApplied && <Badge variant="outline">Cap Applied</Badge>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        {/* Totals */}
                        <div className="p-4 rounded-lg border bg-primary/5">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Base Pay</p>
                              <p className="text-xl font-bold" data-testid="text-total-base-pay">
                                ${(payExplanation.breakdown.totals.basePayCents / 100).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">After Multipliers</p>
                              <p className="text-xl font-bold" data-testid="text-total-adjusted-pay">
                                ${(payExplanation.breakdown.totals.adjustedPayCents / 100).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Final Pay</p>
                              <p className="text-2xl font-bold text-primary" data-testid="text-total-final-pay">
                                ${(payExplanation.breakdown.totals.finalPayCents / 100).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Policy Info */}
                        <div className="text-xs text-muted-foreground" data-testid="text-policy-info">
                          <p data-testid="text-policy-name">Policy: {payExplanation.breakdown.policyProvenance.versionName}</p>
                          <p data-testid="text-policy-dates">Effective: {formatDate(payExplanation.breakdown.policyProvenance.effectiveDate)} | Generated: {formatDate(payExplanation.generatedAt)}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Unable to load pay explanation for this period</p>
                    )}
                  </div>
                )}

                {!selectedPayPeriodId && payRecords.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Select a pay period above to view the detailed breakdown
                  </p>
                )}

                {payRecords.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pay records available for this driver
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            <DriverPayrollTab driverId={id!} />
          </div>
        </TabsContent>

        <TabsContent value="trips">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div>
                <CardTitle>Move History</CardTitle>
                <CardDescription>
                  {driverTripsTotal > 0 ? `${driverTripsTotal.toLocaleString()} total moves` : "No moves found"}
                </CardDescription>
              </div>
              {driverTripsTotal > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const params = new URLSearchParams({
                      limit: "5000", sortBy: "tripDate", sortDir: "desc",
                      ...(driverTripsStatus && { status: driverTripsStatus }),
                      ...(driverTripsType   && { moveType: driverTripsType }),
                      ...(driverTripsStart  && { startDate: driverTripsStart }),
                      ...(driverTripsEnd    && { endDate: driverTripsEnd }),
                    });
                    fetch(`/api/corporate/drivers/${id}/trips?${params}`, { credentials: "include" })
                      .then(r => r.json())
                      .then((data: { trips: Trip[] }) => {
                        const rows = data.trips ?? [];
                        const headers = ["Move #","Date","Origin","Destination","Customer","Status","Move Type","Vehicle","Distance","Duration","Pay Rate","Notes"];
                        const csv = [headers.join(","), ...rows.map((m) => [
                          m.moveNumber ?? "", m.tripDate ? formatDate(m.tripDate) : "",
                          `"${(m.origin ?? "").replace(/"/g,'""')}"`,
                          `"${(m.destination ?? "").replace(/"/g,'""')}"`,
                          `"${(m.customerId ?? "").replace(/"/g,'""')}"`,
                          m.status ?? "", m.moveType ?? "", m.vehicleType ?? "",
                          m.distance ? Number(m.distance).toFixed(1) : "",
                          m.duration ?? "",
                          m.payRate ? `$${Number(m.payRate).toFixed(2)}` : "",
                          `"${(m.notes ?? "").replace(/"/g,'""')}"`,
                        ].join(","))].join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = window.document.createElement("a");
                        a.href = url; a.download = `driver_moves_${driver?.driverNumber ?? id}_${new Date().toISOString().split("T")[0]}.csv`;
                        a.click(); URL.revokeObjectURL(url);
                      });
                  }}
                  data-testid="button-export-driver-moves"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </CardHeader>

            {/* Filter bar */}
            <div className="px-6 pb-3 flex flex-wrap gap-2 items-end border-b border-border">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">Status</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={driverTripsStatus}
                  onChange={(e) => { setDriverTripsStatus(e.target.value); setDriverTripsPage(1); }}
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">Move Type</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={driverTripsType}
                  onChange={(e) => { setDriverTripsType(e.target.value); setDriverTripsPage(1); }}
                >
                  <option value="">All Types</option>
                  <option value="DriverShift">DriverShift</option>
                  <option value="DriverReturn">DriverReturn</option>
                  <option value="Supplemental">Supplemental</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">From</label>
                <input
                  type="date"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={driverTripsStart}
                  onChange={(e) => { setDriverTripsStart(e.target.value); setDriverTripsPage(1); }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">To</label>
                <input
                  type="date"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={driverTripsEnd}
                  onChange={(e) => { setDriverTripsEnd(e.target.value); setDriverTripsPage(1); }}
                />
              </div>
              {(driverTripsStatus || driverTripsType || driverTripsStart || driverTripsEnd) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-end text-xs"
                  onClick={() => {
                    setDriverTripsStatus(""); setDriverTripsType("");
                    setDriverTripsStart(""); setDriverTripsEnd("");
                    setDriverTripsPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            <CardContent className="pt-4">
              {driverTripsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
                  Loading moves…
                </div>
              ) : driverTrips.length === 0 ? (
                <div className="text-center py-12">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No moves match the selected filters</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {driverTrips.map((move, index) => (
                      <div
                        key={move.id}
                        className="border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                        onClick={() => setLocation(`/trips/${move.id}`)}
                        data-testid={`card-trip-${index}`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            {move.moveNumber && (
                              <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                                {move.moveNumber}
                              </span>
                            )}
                            <Badge variant={move.status === "completed" ? "default" : move.status === "cancelled" ? "destructive" : "secondary"}>
                              {move.status || "unknown"}
                            </Badge>
                            {move.moveType && <Badge variant="outline">{move.moveType}</Badge>}
                          </div>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(move.tripDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{move.origin}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{move.destination}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {move.distance && <span>{Number(move.distance).toFixed(1)} mi</span>}
                          {move.duration && <span>{move.duration}</span>}
                          {move.vehicleType && <span>{move.vehicleType}</span>}
                          {move.payRate && <span>Pay: ${Number(move.payRate).toFixed(2)}</span>}
                        </div>
                        {move.notes && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{move.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {driverTripsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        Page {driverTripsPage} of {driverTripsTotalPages} · {driverTripsTotal.toLocaleString()} moves
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={driverTripsPage <= 1}
                          onClick={() => setDriverTripsPage(p => Math.max(1, p - 1))}
                        >
                          ← Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={driverTripsPage >= driverTripsTotalPages}
                          onClick={() => setDriverTripsPage(p => Math.min(driverTripsTotalPages, p + 1))}
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Driver's licenses, certifications, and compliance documents</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No documents uploaded yet</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {documents.map((doc) => (
                    <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <FileText className="h-6 w-6 text-primary" />
                          <Badge variant="secondary">
                            {doc.documentType.charAt(0).toUpperCase() + doc.documentType.slice(1)}
                          </Badge>
                        </div>
                        <CardTitle className="text-base truncate" title={doc.fileName}>
                          {doc.fileName}
                        </CardTitle>
                        <CardDescription>
                          {doc.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {doc.expirationDate && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Expires: {formatDate(doc.expirationDate)}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Uploaded by {doc.uploader.firstName} {doc.uploader.lastName} on{" "}
                          {doc.createdAt ? formatDate(doc.createdAt) : "Unknown"}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const link = window.document.createElement('a');
                            link.href = `data:${doc.mimeType};base64,${doc.fileData}`;
                            link.download = doc.fileName;
                            link.click();
                          }}
                          className="w-full mt-2"
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

                <TabsContent value="notes">
          <NotesAndCommsTimeline
            driverId={id}
            driverName={driver?.user?.firstName && driver?.user?.lastName
              ? `${driver.user.firstName} ${driver.user.lastName}`
              : driver?.user?.email}
          />
        </TabsContent>

        <TabsContent value="moves">
          <Card id="moves-section">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Moves</CardTitle>
                <CardDescription>Last 25 moves by this driver</CardDescription>
              </div>
              {trips.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const last25Moves = [...trips]
                      .sort((a, b) => parseDateSafe(b.tripDate).getTime() - parseDateSafe(a.tripDate).getTime())
                      .slice(0, 25);
                    
                    const headers = ["Move #", "Date", "Origin", "Destination", "Customer", "Status", "Move Type", "Vehicle", "Distance", "Duration", "Bill Rate", "Pay Rate", "Gross Profit", "Notes"];
                    const csvRows = [headers.join(",")];
                    
                    last25Moves.forEach(move => {
                      const row = [
                        move.moveNumber || "",
                        move.tripDate ? formatDate(move.tripDate) : "",
                        `"${(move.origin || "").replace(/"/g, '""')}"`,
                        `"${(move.destination || "").replace(/"/g, '""')}"`,
                        `"${(move.customerId || "").replace(/"/g, '""')}"`,
                        move.status || "",
                        move.moveType || "",
                        move.vehicleType || "",
                        move.distance ? Number(move.distance).toFixed(1) : "",
                        move.duration || "",
                        move.billRate ? `$${Number(move.billRate).toFixed(2)}` : "",
                        move.payRate ? `$${Number(move.payRate).toFixed(2)}` : "",
                        move.grossProfit ? `$${Number(move.grossProfit).toFixed(2)}` : "",
                        `"${(move.notes || "").replace(/"/g, '""')}"`
                      ];
                      csvRows.push(row.join(","));
                    });
                    
                    const csvContent = csvRows.join("\n");
                    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const link = window.document.createElement("a");
                    link.href = url;
                    link.download = `driver_moves_${driver?.driverNumber || id}_${new Date().toISOString().split('T')[0]}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-export-moves"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {trips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPinned className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Moves Found</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    This driver has no recorded moves yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...trips]
                    .sort((a, b) => parseDateSafe(b.tripDate).getTime() - parseDateSafe(a.tripDate).getTime())
                    .slice(0, 25)
                    .map((move, index) => (
                      <div
                        key={move.id}
                        className="border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                        onClick={() => setLocation(`/trips/${move.id}`)}
                        data-testid={`card-move-${index}`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-sm bg-muted px-2 py-1 rounded" data-testid={`text-move-number-${index}`}>
                              {move.moveNumber || "N/A"}
                            </span>
                            <Badge variant={move.status === "completed" ? "default" : move.status === "cancelled" ? "destructive" : "secondary"}>
                              {move.status || "unknown"}
                            </Badge>
                            {move.moveType && (
                              <Badge variant="outline">{move.moveType}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(move.tripDate)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{move.origin}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{move.destination}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {move.vehicleType && (
                            <div>
                              <span className="text-muted-foreground">Vehicle:</span>{" "}
                              <span className="font-medium">{move.vehicleType}</span>
                            </div>
                          )}
                          {move.distance && (
                            <div>
                              <span className="text-muted-foreground">Distance:</span>{" "}
                              <span className="font-medium">{Number(move.distance).toFixed(1)} mi</span>
                            </div>
                          )}
                          {move.duration && (
                            <div>
                              <span className="text-muted-foreground">Duration:</span>{" "}
                              <span className="font-medium">{move.duration}</span>
                            </div>
                          )}
                          {move.payRate && (
                            <div>
                              <span className="text-muted-foreground">Pay Rate:</span>{" "}
                              <span className="font-medium">${Number(move.payRate).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        
                        {move.notes && (
                          <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
                            {move.notes}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          {/* ── Driver Risk Summary ── */}
          <Card className="mb-4" data-testid="card-driver-risk-summary">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Driver Risk Summary</CardTitle>
                <CardDescription>Unified risk score — frequency (35%), severity (20%), MVR (20%), open exposure (15%), trend (10%)</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {lossScoreLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-28 w-full" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Risk Score Hero ── */}
                  {(() => {
                    const score = lossScoreData?.score ?? 0;
                    const tier = lossScoreData?.tier ?? "High Risk";
                    const floorApplied = lossScoreData?.riskFloorApplied ?? false;
                    const immediateReview = lossScoreData?.immediateReview ?? false;
                    const tierColor = getRiskTierColors(tier);
                    const inp = lossScoreData?.inputs;
                    // Derived supporting metrics from lossScoreData.inputs
                    const claimsPer1K = (inp?.totalTripsAllTime ?? 0) > 0
                      ? Math.round(((inp?.totalClaimsAllTime ?? 0) / (inp?.totalTripsAllTime ?? 1)) * 1000 * 10) / 10
                      : null;
                    const avgIncurredCost = (inp?.totalClaimsAllTime ?? 0) > 0
                      ? Math.round((inp?.totalIncurredCents ?? 0) / 100 / (inp?.totalClaimsAllTime ?? 1))
                      : null;
                    const preventablePct = (inp?.totalClaimsAllTime ?? 0) > 0
                      ? Math.round(((inp?.preventableClaimsAllTime ?? 0) / (inp?.totalClaimsAllTime ?? 1)) * 100)
                      : null;
                    return (
                      <div className={`rounded-lg border ${tierColor.border} ${tierColor.bg} p-4`} data-testid="panel-risk-score">
                        {/* Risk Floor Alert */}
                        {floorApplied && (
                          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-2" data-testid="alert-risk-floor">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <p className="text-xs font-semibold text-red-700 dark:text-red-300">Unproven Driver with Incident</p>
                              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">No trip history on record — score capped in High Risk until moves are logged. Treat as elevated risk and flag before assignment.</p>
                            </div>
                          </div>
                        )}
                        {immediateReview && (
                          <div className="mb-3 flex items-start gap-2 rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 px-3 py-2" data-testid="alert-immediate-review">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Immediate Review Required</p>
                              <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5">Driver meets one or more high-risk thresholds: 2+ serious MVR violations, 3+ open claims, or MVR risk sub-score ≥ 70. Do not assign without supervisor clearance.</p>
                            </div>
                          </div>
                        )}
                        {/* Score + tier + supporting metrics */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          {/* Left: Score */}
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-center">
                              <div className={`text-6xl font-black leading-none ${tierColor.scoreCls}`} data-testid="value-risk-score">{score}</div>
                              <div className="text-xs text-muted-foreground mt-1">out of 100</div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold ${tierColor.badgeCls}`} data-testid="badge-risk-tier">
                                {tier}
                              </span>
                              <div className="text-xs text-muted-foreground leading-snug">
                                <div className="flex items-center gap-1">
                                  <span>Driver Risk Score</span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        data-testid="button-risk-score-info"
                                        aria-label="Driver Risk Score definition and formula"
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      className="w-80 p-0 text-sm"
                                      align="start"
                                      side="bottom"
                                    >
                                      <DriverRiskScorePopoverContent />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <span className="font-medium">35% Freq · 20% Sev · 20% MVR · 15% Exposure · 10% Trend</span>
                              </div>
                              {/* Overall position + 90-day trend */}
                              {riskBenchmarks && !riskBenchmarks.insufficient && (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {(() => {
                                    const POS_CFG: Record<string, { cls: string; label: string }> = {
                                      "Top Performer":  { cls: "bg-green-500/15 text-green-700 dark:text-green-400", label: "Top Performer" },
                                      "Above Average":  { cls: "bg-green-500/10 text-green-600 dark:text-green-400", label: "Above Avg" },
                                      "Average":        { cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", label: "Average" },
                                      "Below Average":  { cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", label: "Below Avg" },
                                      "High Risk":      { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
                                    };
                                    const cfg = POS_CFG[riskBenchmarks.overallPosition] ?? POS_CFG["Average"];
                                    const t = riskBenchmarks.trend?.riskScore;
                                    return (
                                      <>
                                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.cls}`} data-testid="badge-overall-position">
                                          {cfg.label}
                                        </span>
                                        {t && (
                                          <span className={`text-[10px] font-medium ${t === "up" ? "text-destructive" : t === "down" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} data-testid="trend-risk-score">
                                            {t === "up" ? "↑ Worsening" : t === "down" ? "↓ Improving" : "→ Stable"}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="hidden sm:block w-px h-16 bg-border mx-2" />

                          {/* Right: Three KPIs */}
                          <div className="grid grid-cols-3 gap-x-6 gap-y-1 flex-1 min-w-0">
                            <div data-testid="kpi-claims-per-1k">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <span>Claims per 1,000 Moves</span>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-testid="button-claims-per-1k-info"
                                      aria-label="Claims per 1,000 Moves definition and formula"
                                    >
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-0 text-sm" align="start" side="bottom">
                                    <div className="overflow-y-auto max-h-[70vh]">
                                      <div className="px-4 py-3 border-b bg-muted/40">
                                        <p className="font-semibold text-sm leading-tight">Claims per 1,000 Moves</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Definition &amp; Formula</p>
                                      </div>
                                      <div className="px-4 py-3 space-y-3">
                                        <p className="text-xs text-foreground leading-relaxed">
                                          Measures how frequently a driver is involved in claims relative to their total workload.
                                        </p>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Formula</p>
                                          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground">
                                            (number of claims &divide; total moves) &times; 1,000
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Interpretation</p>
                                          <div className="space-y-1 text-[11px]">
                                            <div className="flex items-start gap-2">
                                              <span className="text-green-600 dark:text-green-400 font-medium shrink-0">Lower</span>
                                              <span className="text-muted-foreground">better — fewer incidents relative to workload</span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                              <span className="text-destructive font-medium shrink-0">Higher</span>
                                              <span className="text-muted-foreground">increased frequency risk</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="border-t pt-3">
                                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Sourced from Claims and Moves modules. Draft claims are excluded. Updates dynamically as data changes.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="text-xl font-bold mt-0.5">
                                {claimsPer1K != null
                                  ? claimsPer1K.toFixed(1)
                                  : <span className="text-muted-foreground">—</span>}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {inp?.totalTripsAllTime ? `${inp.totalTripsAllTime.toLocaleString()} total moves` : "No move data"}
                              </div>
                              {riskBenchmarks?.benchmarks && (() => {
                                const bench = riskBenchmarks.benchmarks!.claimsPerK;
                                const pos = riskBenchmarks.position?.claimsPerK;
                                const t = riskBenchmarks.trend?.claimsPerK;
                                const POS: Record<string, { cls: string; label: string }> = {
                                  "Top Performer":  { cls: "bg-green-500/15 text-green-700 dark:text-green-400", label: "Top Performer" },
                                  "Above Average":  { cls: "bg-green-500/10 text-green-600 dark:text-green-400", label: "Above Avg" },
                                  "Average":        { cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", label: "Average" },
                                  "Below Average":  { cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", label: "Below Avg" },
                                  "High Risk":      { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
                                  "Insufficient Data": { cls: "bg-muted/60 text-muted-foreground", label: "No Data" },
                                };
                                const cfg = pos ? (POS[pos] ?? POS["Average"]) : null;
                                return (
                                  <div className="mt-1.5 space-y-1" data-testid="benchmark-claims-per-1k">
                                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                                      {bench.companyAvg !== null && <><span>Avg: </span><span className="text-foreground font-medium">{bench.companyAvg.toFixed(1)}</span></>}
                                      {bench.companyAvg !== null && bench.topQuartile !== null && <span className="mx-1 opacity-40">·</span>}
                                      {bench.topQuartile !== null && <><span>Top 25%: </span><span className="text-foreground font-medium">{bench.topQuartile.toFixed(1)}</span></>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {cfg && <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>}
                                      {t && <span className={`text-[10px] ${t === "up" ? "text-destructive" : t === "down" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>{t === "up" ? "↑ Worsening" : t === "down" ? "↓ Improving" : "→ Stable"}</span>}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div data-testid="kpi-avg-cost">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <span>Avg Cost per Claim</span>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-testid="button-avg-cost-info"
                                      aria-label="Average Cost per Claim definition and formula"
                                    >
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-0 text-sm" align="center" side="bottom">
                                    <div className="overflow-y-auto max-h-[70vh]">
                                      <div className="px-4 py-3 border-b bg-muted/40">
                                        <p className="font-semibold text-sm leading-tight">Average Cost per Claim</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Definition &amp; Formula</p>
                                      </div>
                                      <div className="px-4 py-3 space-y-3">
                                        <p className="text-xs text-foreground leading-relaxed">
                                          Measures the financial severity of incidents involving this driver.
                                        </p>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Formula</p>
                                          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground">
                                            total claim cost &divide; total claims
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Cost Source</p>
                                          <div className="space-y-1 text-[11px] text-muted-foreground">
                                            <p>Uses <span className="text-foreground font-medium">Actual Cost</span> when available.</p>
                                            <p>Falls back to <span className="text-foreground font-medium">Estimated Cost</span> if actual is not yet recorded.</p>
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Interpretation</p>
                                          <div className="space-y-1 text-[11px]">
                                            <div className="flex items-start gap-2">
                                              <span className="text-green-600 dark:text-green-400 font-medium shrink-0">Lower</span>
                                              <span className="text-muted-foreground">less severe incidents</span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                              <span className="text-destructive font-medium shrink-0">Higher</span>
                                              <span className="text-muted-foreground">more expensive claims</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="border-t pt-3">
                                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Sourced from Claims and Moves modules. Draft claims are excluded. Updates dynamically as data changes.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="text-xl font-bold mt-0.5">
                                {avgIncurredCost != null
                                  ? `$${avgIncurredCost.toLocaleString("en-US")}`
                                  : <span className="text-muted-foreground">—</span>}
                              </div>
                              <div className="text-[10px] text-muted-foreground">paid + reserves per claim</div>
                              {riskBenchmarks?.benchmarks && (() => {
                                const bench = riskBenchmarks.benchmarks!.avgCost;
                                const pos = riskBenchmarks.position?.avgCost;
                                const t = riskBenchmarks.trend?.avgCost;
                                const POS: Record<string, { cls: string; label: string }> = {
                                  "Top Performer":  { cls: "bg-green-500/15 text-green-700 dark:text-green-400", label: "Top Performer" },
                                  "Above Average":  { cls: "bg-green-500/10 text-green-600 dark:text-green-400", label: "Above Avg" },
                                  "Average":        { cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", label: "Average" },
                                  "Below Average":  { cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", label: "Below Avg" },
                                  "High Risk":      { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
                                  "Insufficient Data": { cls: "bg-muted/60 text-muted-foreground", label: "No Data" },
                                };
                                const cfg = pos ? (POS[pos] ?? POS["Average"]) : null;
                                const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
                                return (
                                  <div className="mt-1.5 space-y-1" data-testid="benchmark-avg-cost">
                                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                                      {bench.companyAvg !== null && <><span>Avg: </span><span className="text-foreground font-medium">{fmt(bench.companyAvg)}</span></>}
                                      {bench.companyAvg !== null && bench.topQuartile !== null && <span className="mx-1 opacity-40">·</span>}
                                      {bench.topQuartile !== null && <><span>Top 25%: </span><span className="text-foreground font-medium">{fmt(bench.topQuartile)}</span></>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {cfg && <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>}
                                      {t && <span className={`text-[10px] ${t === "up" ? "text-destructive" : t === "down" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>{t === "up" ? "↑ Worsening" : t === "down" ? "↓ Improving" : "→ Stable"}</span>}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div data-testid="kpi-preventable-pct">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <span>Preventable %</span>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-testid="button-preventable-pct-info"
                                      aria-label="Preventable % definition and formula"
                                    >
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-0 text-sm" align="end" side="bottom">
                                    <div className="overflow-y-auto max-h-[70vh]">
                                      <div className="px-4 py-3 border-b bg-muted/40">
                                        <p className="font-semibold text-sm leading-tight">Preventable %</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Definition &amp; Formula</p>
                                      </div>
                                      <div className="px-4 py-3 space-y-3">
                                        <p className="text-xs text-foreground leading-relaxed">
                                          Measures the percentage of claims that were determined to be preventable.
                                        </p>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Formula</p>
                                          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground">
                                            preventable &divide; (preventable + non-preventable)
                                          </div>
                                          <p className="text-[10px] text-muted-foreground mt-1.5">
                                            Claims marked as Unknown are excluded from the calculation.
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-foreground mb-1.5">Interpretation</p>
                                          <div className="space-y-1 text-[11px]">
                                            <div className="flex items-start gap-2">
                                              <span className="text-green-600 dark:text-green-400 font-medium shrink-0">Lower %</span>
                                              <span className="text-muted-foreground">better — less controllable / behavioral risk</span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                              <span className="text-destructive font-medium shrink-0">Higher %</span>
                                              <span className="text-muted-foreground">more controllable risk — behavioral patterns may be addressable</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="border-t pt-3">
                                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Sourced from Claims and Moves modules. Draft claims are excluded. Updates dynamically as data changes.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="text-xl font-bold mt-0.5">
                                {preventablePct != null
                                  ? `${preventablePct}%`
                                  : <span className="text-muted-foreground">—</span>}
                              </div>
                              <div className="text-[10px] text-muted-foreground">of all claims (at-fault)</div>
                              {riskBenchmarks?.benchmarks && (() => {
                                const bench = riskBenchmarks.benchmarks!.preventableRate;
                                const pos = riskBenchmarks.position?.preventableRate;
                                const t = riskBenchmarks.trend?.preventableRate;
                                const POS: Record<string, { cls: string; label: string }> = {
                                  "Top Performer":  { cls: "bg-green-500/15 text-green-700 dark:text-green-400", label: "Top Performer" },
                                  "Above Average":  { cls: "bg-green-500/10 text-green-600 dark:text-green-400", label: "Above Avg" },
                                  "Average":        { cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", label: "Average" },
                                  "Below Average":  { cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", label: "Below Avg" },
                                  "High Risk":      { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
                                  "Insufficient Data": { cls: "bg-muted/60 text-muted-foreground", label: "No Data" },
                                };
                                const cfg = pos ? (POS[pos] ?? POS["Average"]) : null;
                                const fmt = (v: number) => `${Math.round(v)}%`;
                                return (
                                  <div className="mt-1.5 space-y-1" data-testid="benchmark-preventable-pct">
                                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                                      {bench.companyAvg !== null && <><span>Avg: </span><span className="text-foreground font-medium">{fmt(bench.companyAvg)}</span></>}
                                      {bench.companyAvg !== null && bench.topQuartile !== null && <span className="mx-1 opacity-40">·</span>}
                                      {bench.topQuartile !== null && <><span>Top 25%: </span><span className="text-foreground font-medium">{fmt(bench.topQuartile)}</span></>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {cfg && <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>}
                                      {t && <span className={`text-[10px] ${t === "up" ? "text-destructive" : t === "down" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>{t === "up" ? "↑ Worsening" : t === "down" ? "↓ Improving" : "→ Stable"}</span>}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Component breakdown bar — unified 5-component model */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground font-medium">Risk Component Breakdown</span>
                            <span className="text-[10px] text-muted-foreground">Higher bar = higher risk input</span>
                          </div>
                          {([
                            { label: "Preventable Claim Freq", weight: 35, value: lossScoreData?.frequencyRisk ?? 0 },
                            { label: "Claim Severity",          weight: 20, value: lossScoreData?.severityRisk ?? 0 },
                            { label: "MVR / Serious Violations",weight: 20, value: lossScoreData?.mvrRisk ?? 0 },
                            { label: "Open Claim Exposure",     weight: 15, value: lossScoreData?.openExposureRisk ?? 0 },
                            { label: "Recent Incident Trend",   weight: 10, value: lossScoreData?.trendRisk ?? 0 },
                          ] as { label: string; weight: number; value: number }[]).map((c) => (
                            <div key={c.label} className="flex items-center gap-2 text-xs">
                              <span className="w-44 text-muted-foreground shrink-0">{c.label} ({c.weight}%)</span>
                              <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full bg-orange-400 dark:bg-orange-500 transition-all duration-500" style={{ width: `${c.value}%` }} />
                              </div>
                              <span className="w-8 text-right font-semibold shrink-0">{Math.round(c.value)}</span>
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Risk sub-scores 0–100 each. Driver Risk Score = 100 − weighted average.
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Automated Risk Restriction Panel ── */}
                  {(() => {
                    const rs = riskRestriction?.status;
                    if (!rs) return null;

                    const DISPATCH_STATUS_LABEL: Record<string, string> = {
                      low: "Preferred Driver Pool",
                      moderate: "Standard Pool",
                      elevated: "Watch / Coaching",
                      high: "Restricted Pool",
                      critical: "Do Not Dispatch",
                    };
                    const poolLabel = rs.riskTier ? (DISPATCH_STATUS_LABEL[rs.riskTier] ?? "Standard Pool") : "Standard Pool";

                    const RESTRICTION_CFG: Record<string, { border: string; bg: string; badgeCls: string; label: string; icon: string }> = {
                      none:             { border: "border-green-200 dark:border-green-800", bg: "bg-green-50/50 dark:bg-green-950/20", badgeCls: "bg-green-500/15 text-green-700 dark:text-green-400", label: poolLabel, icon: "" },
                      coaching_required:{ border: "border-yellow-200 dark:border-yellow-800", bg: "bg-yellow-50/50 dark:bg-yellow-950/20", badgeCls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", label: "Watch — Coaching Required", icon: "" },
                      restricted:       { border: "border-orange-200 dark:border-orange-800", bg: "bg-orange-50/50 dark:bg-orange-950/20", badgeCls: "bg-orange-500/15 text-orange-700 dark:text-orange-400", label: "Restricted Pool", icon: "" },
                      blocked:          { border: "border-destructive/30 dark:border-destructive/50", bg: "bg-destructive/5", badgeCls: "bg-destructive/15 text-destructive", label: "Do Not Dispatch", icon: "" },
                    };

                    const effective = rs.isOverridden ? "none" : rs.restrictionLevel;
                    const cfg = RESTRICTION_CFG[effective] ?? RESTRICTION_CFG["none"];
                    const overridable = ["super_admin", "corporate_admin"].includes((user as any)?.role ?? "") || (user as any)?.isSuperAdmin;

                    const noneDescription = rs.isOverridden
                      ? "Restriction override is active. Driver is eligible for all assignments."
                      : rs.riskTier === "low"
                        ? "Preferred Driver — full access to all jobs. First priority in dispatch queue, including premium accounts, high-value vehicles, and long-distance moves."
                        : "Standard Driver — full access to all jobs. Normal dispatch priority.";

                    const RESTRICTION_DESCRIPTIONS: Record<string, string> = {
                      none: noneDescription,
                      coaching_required: "Driver has an Elevated risk score. Coaching is required before next assignment. Full job access is retained, but dispatch priority is reduced below Low Risk drivers.",
                      restricted: "Driver is in the Restricted Pool. High-value vehicles, long-distance moves, and premium accounts are not accessible. May require manual dispatch approval.",
                      blocked: "Driver is flagged Do Not Dispatch. Automatic assignment is blocked. A Super Admin override is required to re-enable.",
                    };

                    const TIER_ACTIONS: Record<string, string> = {
                      none: "No action required.",
                      coaching_required: "A DWP task has been generated for operations.",
                      restricted: "A High Risk DWP task has been generated for operations. Assignment types are restricted.",
                      blocked: "A Critical Risk DWP task has been generated. All new dispatch assignments are blocked.",
                    };

                    return (
                      <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4 space-y-3`} data-testid="panel-risk-restriction">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">Automated Risk Restriction</span>
                            {rs.isOverridden && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400" data-testid="badge-override-active">
                                Override Active
                              </span>
                            )}
                          </div>
                          <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${cfg.badgeCls}`} data-testid="badge-restriction-level">
                            {rs.isOverridden ? "Override — Dispatch Allowed" : cfg.label}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {RESTRICTION_DESCRIPTIONS[effective]}
                        </p>

                        {rs.restrictionLevel !== "none" && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {TIER_ACTIONS[rs.restrictionLevel]}
                          </p>
                        )}

                        {/* Override details */}
                        {rs.isOverridden && (
                          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2 space-y-1" data-testid="panel-override-details">
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Override applied by {riskRestriction?.overrideByName ?? rs.overriddenBy ?? "Unknown"}</p>
                            {rs.overriddenAt && (
                              <p className="text-[10px] text-muted-foreground">{new Date(rs.overriddenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</p>
                            )}
                            {rs.overrideReason && (
                              <p className="text-[11px] text-foreground mt-1 leading-relaxed">"{rs.overrideReason}"</p>
                            )}
                          </div>
                        )}

                        {/* Admin actions */}
                        {overridable && (
                          <div className="flex items-center gap-2 pt-1">
                            {!rs.isOverridden && rs.restrictionLevel !== "none" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setOverrideReason(""); setOverrideDialogOpen(true); }}
                                data-testid="button-apply-override"
                              >
                                Override Restriction
                              </Button>
                            )}
                            {rs.isOverridden && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRevokeDialogOpen(true)}
                                data-testid="button-revoke-override"
                              >
                                Revoke Override
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Summary Stat Cards ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-total-claims">
                      <p className="text-xs text-muted-foreground font-medium">Total Claims</p>
                      <p className="text-2xl font-bold">{lossScoreData?.inputs?.totalClaimsAllTime ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-open-claims">
                      <p className="text-xs text-muted-foreground font-medium">Open Claims</p>
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lossScoreData?.inputs?.openClaimsCount ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-closed-claims">
                      <p className="text-xs text-muted-foreground font-medium">Closed Claims</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {Math.max(0, (lossScoreData?.inputs?.totalClaimsAllTime ?? 0) - (lossScoreData?.inputs?.openClaimsCount ?? 0))}
                      </p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-preventable-rate">
                      <p className="text-xs text-muted-foreground font-medium">Preventable Rate</p>
                      {(lossScoreData?.inputs?.totalClaimsAllTime ?? 0) === 0 ? (
                        <p className="text-2xl font-bold text-muted-foreground">—</p>
                      ) : (() => {
                        const pct = Math.round(((lossScoreData?.inputs?.preventableClaimsAllTime ?? 0) / (lossScoreData?.inputs?.totalClaimsAllTime ?? 1)) * 100);
                        return (
                          <p className={`text-2xl font-bold ${pct >= 50 ? "text-destructive" : pct >= 25 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
                            {pct}%
                          </p>
                        );
                      })()}
                      <p className="text-[10px] text-muted-foreground">of classified claims</p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-preventable-claims">
                      <p className="text-xs text-muted-foreground font-medium">Preventable</p>
                      <p className="text-2xl font-bold text-destructive">{claimsRisk?.summary.preventable ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-non-preventable-claims">
                      <p className="text-xs text-muted-foreground font-medium">Non-Preventable</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{claimsRisk?.summary.nonPreventable ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-estimated-damage">
                      <p className="text-xs text-muted-foreground font-medium">Estimated Damage</p>
                      <p className="text-2xl font-bold">
                        ${((claimsRisk?.summary.estimatedTotal ?? 0) / 1000).toFixed(0)}k
                      </p>
                    </div>
                    <div className="rounded-md border p-3 space-y-1" data-testid="stat-actual-paid">
                      <p className="text-xs text-muted-foreground font-medium">Actual Paid</p>
                      <p className="text-2xl font-bold">
                        ${((claimsRisk?.summary.actualPaidTotal ?? 0) / 1000).toFixed(0)}k
                      </p>
                    </div>
                  </div>

                  {/* Unknown preventability notice */}
                  {(claimsRisk?.summary.unknown ?? 0) > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2" data-testid="notice-unknown-preventability">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-semibold">{claimsRisk!.summary.unknown}</span>{" "}
                        {claimsRisk!.summary.unknown === 1 ? "claim is" : "claims are"} missing a preventability classification and {claimsRisk!.summary.unknown === 1 ? "is" : "are"} excluded from the Preventable Rate.
                      </p>
                    </div>
                  )}

                  {/* Claims table */}
                  {(claimsRisk?.claims.length ?? 0) === 0 ? (
                    <div className="text-center py-8">
                      <Car className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No claims recorded for this driver</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-driver-claims">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left pb-2 pr-3 font-medium">Claim ID</th>
                            <th className="text-left pb-2 pr-3 font-medium">Incident Date</th>
                            <th className="text-left pb-2 pr-3 font-medium">Incident Type</th>
                            <th className="text-left pb-2 pr-3 font-medium">Preventability</th>
                            <th className="text-left pb-2 pr-3 font-medium">Status</th>
                            <th className="text-left pb-2 pr-3 font-medium">Submitted By</th>
                            <th className="text-right pb-2 font-medium">
                              <button
                                type="button"
                                className="w-full text-right hover:underline"
                                onClick={() => toggleClaimsSort("estimatedDamage")}
                                aria-label={`Sort by Estimate Amount ${claimsSort.field === "estimatedDamage" && claimsSort.direction === "asc" ? "descending" : "ascending"}`}
                              >
                                Estimate Amount
                              </button>
                            </th>
                            <th className="text-right pb-2 pl-3 font-medium">
                              <button
                                type="button"
                                className="w-full text-right hover:underline"
                                onClick={() => toggleClaimsSort("actualAmount")}
                                aria-label={`Sort by Actual Amount ${claimsSort.field === "actualAmount" && claimsSort.direction === "asc" ? "descending" : "ascending"}`}
                              >
                                Actual Amount
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedClaims.map((claim) => (
                            <tr
                              key={claim.id}
                              className="border-b last:border-0 hover-elevate cursor-pointer"
                              onClick={() => window.location.href = `/accidents/${claim.id}`}
                              data-testid={`row-claim-${claim.id}`}
                            >
                              <td className="py-2 pr-3">
                                <span className="font-mono text-xs text-primary hover:underline">
                                  #{claim.id.slice(0, 8)}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {claim.incidentDate ? formatDate(claim.incidentDate) : "—"}
                              </td>
                              <td className="py-2 pr-3">
                                {claim.incidentType
                                  ? claim.incidentType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 pr-3">
                                {claim.preventability ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${claim.preventability === "Preventable" ? "border-destructive text-destructive" : claim.preventability === "Non-Preventable" ? "border-green-600 text-green-700 dark:text-green-400" : ""}`}
                                  >
                                    {claim.preventability}
                                  </Badge>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 pr-3">
                                {claim.claimStatus ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs whitespace-nowrap ${
                                      claim.claimStatus === "APPROVED" || claim.claimStatus === "PAID"
                                        ? "border-green-600 text-green-700 dark:text-green-400"
                                        : claim.claimStatus === "DENIED"
                                        ? "border-destructive text-destructive"
                                        : claim.claimStatus === "SUBMITTED" || claim.claimStatus === "UNDER_REVIEW" || claim.claimStatus === "ADDITIONAL_INFO_REQUESTED"
                                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                        : claim.claimStatus === "IN_REVIEW"
                                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                        : claim.claimStatus === "READY_FOR_SUBMISSION"
                                        ? "border-amber-500 text-amber-600 dark:text-amber-400"
                                        : claim.claimStatus === "SENT_TO_CARRIER"
                                        ? "border-purple-500 text-purple-600 dark:text-purple-400"
                                        : claim.claimStatus === "CLOSED"
                                        ? "border-muted-foreground text-muted-foreground"
                                        : ""
                                    }`}
                                  >
                                    {claim.claimStatus === "ADDITIONAL_INFO_REQUESTED"
                                      ? "Info Requested"
                                      : claim.claimStatus === "SENT_TO_CARRIER"
                                      ? "Sent to Carrier"
                                      : claim.claimStatus === "UNDER_REVIEW"
                                      ? "Under Review"
                                      : claim.claimStatus === "IN_REVIEW"
                                      ? "In Review"
                                      : claim.claimStatus === "READY_FOR_SUBMISSION"
                                      ? "Ready for Submission"
                                      : claim.claimStatus.charAt(0) + claim.claimStatus.slice(1).toLowerCase()}
                                  </Badge>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {claim.reporter
                                  ? `${claim.reporter.firstName || ""} ${claim.reporter.lastName || ""}`.trim() || claim.reporter.email || "—"
                                  : "—"}
                              </td>
                              <td className="py-2 text-right font-medium">
                                {claim.estimatedDamage > 0
                                  ? formatClaimAmount(claim.estimatedDamage)
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 pl-3 text-right font-medium">
                                {claim.actualAmount == null
                                  ? <span className="text-muted-foreground">—</span>
                                  : formatClaimAmount(claim.actualAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card id="claims-section">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Claims</CardTitle>
                <CardDescription>{accidents.length} claim{accidents.length !== 1 ? "s" : ""}</CardDescription>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setAddClaimDialogOpen(true)}
                data-testid="button-add-claim"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Claim
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {accidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Claims</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    This driver has no recorded claims. Click "Add Claim" to create a new record.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accidents.map((accident, index) => (
                    <Link
                      key={accident.id}
                      href={`/accidents/${accident.id}`}
                      className="block"
                    >
                      <div
                        className="border border-border rounded-lg p-4 hover-elevate cursor-pointer"
                        data-testid={`card-claim-${index}`}
                      >
                        {/* Row 1 — Status badges + date */}
                        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={
                              accident.status === "closed" ? "default" :
                              accident.status === "resolved" ? "secondary" :
                              accident.status === "investigating" ? "outline" : "destructive"
                            }>
                              {accident.status || "open"}
                            </Badge>
                            <Badge variant={
                              accident.atFault === "driver" ? "destructive" :
                              accident.atFault === "other_party" ? "secondary" :
                              "outline"
                            }>
                              {accident.atFault === "driver" ? "At Fault" :
                               accident.atFault === "other_party" ? "Not At Fault" :
                               accident.atFault === "shared" ? "Shared Fault" :
                               accident.atFault === "pending" ? "Fault Pending" : "Fault Unknown"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {accident.attachmentCount > 0 && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                                <Paperclip className="h-3.5 w-3.5" />
                                {accident.attachmentCount} {accident.attachmentCount === 1 ? "Attachment" : "Attachments"}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span className="whitespace-nowrap">{formatDate(accident.accidentDate)}</span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>

                        {/* Row 2 — Customer/Account */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          {accident.customerName ? (
                            <span className="text-sm font-medium">{accident.customerName}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">No account linked</span>
                          )}
                        </div>

                        {/* Row 3 — Location */}
                        {accident.location && (
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm">{accident.location}</span>
                          </div>
                        )}

                        {/* Row 4 — Description */}
                        {accident.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{accident.description}</p>
                        )}

                        {/* Row 5 — Vehicle + Claim details grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm border-t border-border pt-3 mt-2">
                          {/* Vehicle Info */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-xs uppercase tracking-wide mb-1">
                              <Car className="h-3 w-3" />
                              Vehicle
                            </div>
                            {(accident.vehicleYear || accident.vehicleMake || accident.vehicleModel) ? (
                              <div className="font-medium">
                                {[accident.vehicleYear, accident.vehicleMake, accident.vehicleModel].filter(Boolean).join(" ")}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">No vehicle info</div>
                            )}
                          </div>
                          {/* Claim Info */}
                          <div className="space-y-1">
                            <div className="text-muted-foreground font-medium text-xs uppercase tracking-wide mb-1">Claim Info</div>
                            <div className="space-y-0.5">
                              <div>
                                <span className="text-muted-foreground">Police Report: </span>
                                <span className="font-medium">
                                  {accident.policeReportFiled ? (accident.policeReportNumber || "Filed") : "No"}
                                </span>
                              </div>
                              {accident.repairCost && (
                                <div>
                                  <span className="text-muted-foreground">Repair Cost: </span>
                                  <span className="font-medium">${Number(accident.repairCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">Insurance: </span>
                                <span className="font-medium">
                                  {accident.insuranceSubmitted ? (accident.insuranceClaimNumber || "Submitted") : "Not Submitted"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Row 6 — Reported by / Reported date footer */}
                        <div className="flex items-center justify-between gap-4 mt-2.5 pt-2 border-t border-border text-xs text-muted-foreground flex-wrap">
                          <span>
                            {accident.reporter
                              ? `Reported by ${accident.reporter.firstName} ${accident.reporter.lastName}`
                              : "Reporter unknown"}
                          </span>
                          {accident.createdAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Reported {formatDate(accident.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {driver && (
            <AddClaimDialog
              open={addClaimDialogOpen}
              onOpenChange={setAddClaimDialogOpen}
              defaultDriverId={driver.id}
              defaultDriverName={
                driver.user?.firstName && driver.user?.lastName
                  ? `${driver.user?.firstName} ${driver.user?.lastName}`
                  : driver.user?.email ?? ""
              }
              defaultCustomerId={driver.accountId ?? undefined}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", id, "accidents"] });
                queryClient.invalidateQueries({ queryKey: ["/api/drivers", id, "claims-risk"] });
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="payments">
          <Card id="payments-section">
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Driver payment records and transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Payments Coming Soon</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  This section will display detailed payment records, transaction history, and payment management for this driver.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card id="expenses-section">
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
              <CardDescription>Driver expense records and reimbursements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Expenses Coming Soon</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  This section will display expense records, reimbursement requests, and expense management for this driver.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card id="invoices-section">
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Driver invoice history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Invoices Coming Soon</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  This section will display invoice history and billing records for this driver.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card id="comments-section">
            <CardHeader>
              <CardTitle>Driver Comments</CardTitle>
              <CardDescription>Visible to the driver via the driver portal (Last 10)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Textarea
                  placeholder="Add a comment about this driver..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  data-testid="textarea-add-comment"
                />
                <Button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  data-testid="button-add-comment"
                >
                  {addCommentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Comment
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                {comments.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                  </div>
                ) : (
                  comments.slice(0, 10).map((comment, index) => (
                    <div
                      key={comment.id}
                      className="border border-border rounded-lg p-4"
                      data-testid={`card-comment-${index}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={comment.author.profileImageUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {comment.author.firstName?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {comment.author.firstName && comment.author.lastName
                              ? `${comment.author.firstName} ${comment.author.lastName}`
                              : comment.author.email}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {comment.createdAt ? formatDateTime(comment.createdAt) : "Unknown"}
                          </span>
                          {user?.id === comment.authorId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => deleteCommentMutation.mutate(comment.id)}
                              disabled={deleteCommentMutation.isPending}
                              data-testid={`button-delete-comment-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm">{comment.commentText}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduling">
          <DriverWIWTab driverId={id} />
        </TabsContent>

        {/* ── Status History tab ── */}
        <TabsContent value="history">
          <Card id="history-section">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <History className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Status History</CardTitle>
                <CardDescription>Append-only lifecycle audit trail — forward changes captured in real time, older records backfilled from driver fields.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {statusHistoryLoading ? (
                <div className="space-y-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-72" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : statusHistoryData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <History className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No history records yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Status changes will appear here going forward.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                  <div className="space-y-0">
                    {statusHistoryData.map((event, idx) => {
                      const isLast = idx === statusHistoryData.length - 1;

                      // Event type config
                      const eventConfig: Record<string, { label: string; color: string; dotColor: string }> = {
                        driver_created:  { label: "Driver Created",   color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",    dotColor: "bg-blue-500"   },
                        activated:       { label: "Activated",        color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",  dotColor: "bg-green-500"  },
                        terminated:      { label: "Terminated",       color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",          dotColor: "bg-red-500"    },
                        reactivated:     { label: "Reactivated",      color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", dotColor: "bg-emerald-500" },
                        status_changed:  { label: "Status Changed",   color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",  dotColor: "bg-amber-500"  },
                      };
                      const cfg = eventConfig[event.eventType] ?? {
                        label: event.eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                        color: "bg-muted text-muted-foreground",
                        dotColor: "bg-muted-foreground",
                      };

                      const statusLabel = (s: string | null) =>
                        s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null;

                      return (
                        <div
                          key={event.id}
                          className={`relative pl-10 ${isLast ? "pb-2" : "pb-5"}`}
                          data-testid={`history-event-${idx}`}
                        >
                          {/* Timeline dot */}
                          <div className={`absolute left-0 top-1 h-[30px] w-[30px] rounded-full flex items-center justify-center ${cfg.dotColor} shadow-sm`}>
                            {event.eventType === "driver_created"   && <User2 className="h-3.5 w-3.5 text-white" />}
                            {event.eventType === "terminated"        && <XCircle className="h-3.5 w-3.5 text-white" />}
                            {event.eventType === "reactivated"       && <RotateCcw className="h-3.5 w-3.5 text-white" />}
                            {event.eventType === "activated"         && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                            {event.eventType === "status_changed"    && <ArrowDown className="h-3.5 w-3.5 text-white" />}
                            {!["driver_created","terminated","reactivated","activated","status_changed"].includes(event.eventType) && (
                              <Activity className="h-3.5 w-3.5 text-white" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="bg-card border border-border rounded-md p-3 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                                {cfg.label}
                              </span>
                              {event.sourceType === "system" && (
                                <span className="text-[10px] text-muted-foreground">(backfilled)</span>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {event.effectiveDate ? formatDate(event.effectiveDate) : formatDate(event.createdAt)}
                              </span>
                            </div>

                            {/* Status transition */}
                            {(event.priorStatus || event.newStatus) && !(event.eventType === "driver_created") && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {event.priorStatus && (
                                  <span className="font-medium text-foreground">{statusLabel(event.priorStatus)}</span>
                                )}
                                {event.priorStatus && event.newStatus && (
                                  <ArrowRight className="h-3 w-3 shrink-0" />
                                )}
                                {event.newStatus && (
                                  <span className="font-medium text-foreground">{statusLabel(event.newStatus)}</span>
                                )}
                              </div>
                            )}

                            {/* Reason */}
                            {event.reasonCode && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Reason:</span> {event.reasonCode}
                              </p>
                            )}

                            {/* Notes */}
                            {event.notes && event.sourceType !== "system" && (
                              <p className="text-xs text-muted-foreground italic">{event.notes}</p>
                            )}

                            {/* Footer: who + when recorded */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 border-t border-border/40 mt-1">
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <User2 className="h-3 w-3 shrink-0" />
                                {event.changedByName?.trim() ? (
                                  <span>by <span className="font-medium text-foreground/70">{event.changedByName.trim()}</span></span>
                                ) : (
                                  <span>System</span>
                                )}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Recorded {new Date(event.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Employee Record tab ── */}
        <TabsContent value="employee-record">
          <Card id="employee-record-section">
            <CardHeader className="flex flex-row items-center gap-2 flex-wrap space-y-0 pb-4">
              <div className="flex items-center gap-2 flex-1">
                <Briefcase className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <CardTitle>Employee Record</CardTitle>
                  <CardDescription>
                    This driver is classified as a W-2 Employee. The Driver record is the source of truth — shared fields are automatically pushed to the linked Employee record on every save.
                  </CardDescription>
                </div>
              </div>
              {linkedEmployee && (
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => syncEmployeeMutation.mutate()}
                  disabled={syncEmployeeMutation.isPending}
                  data-testid="button-sync-employee"
                >
                  {syncEmployeeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {driverClassification !== "Employee" ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Briefcase className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Not a W-2 Employee</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Set classification to "W-2 Employee" in the Profile tab to create an Employee record.
                  </p>
                </div>
              ) : linkedEmployeeLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-56" />
                </div>
              ) : linkedEmployee ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* ── Left / main column ── */}
                  <div className="lg:col-span-2 space-y-5">
                  {/* Linked badge */}
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent">
                      Linked
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Employee record exists and is synced from this Driver.
                    </span>
                  </div>

                  {/* Summary card */}
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/30">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Name</p>
                      <p className="text-sm font-medium">{linkedEmployee.firstName} {linkedEmployee.lastName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Employee ID</p>
                      <p className="text-sm font-medium">{linkedEmployee.employeeId || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Email</p>
                      <p className="text-sm">{linkedEmployee.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Status</p>
                      <StatusBadge status={linkedEmployee.status || "active"} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Employment Type</p>
                      <p className="text-sm">{linkedEmployee.employmentType || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Department / Market</p>
                      <p className="text-sm">{linkedEmployee.department || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Hire Date</p>
                      <p className="text-sm">{linkedEmployee.hireDate ? new Date(linkedEmployee.hireDate).toLocaleDateString() : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Last Synced</p>
                      <p className="text-sm">{linkedEmployee.driverSyncedAt ? new Date(linkedEmployee.driverSyncedAt).toLocaleString() : "—"}</p>
                    </div>
                  </div>

                  {/* Onboarding Status + Progress */}
                  {obSummary && (
                    <div className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Onboarding</p>
                        <Badge
                          variant={obSummary.onboardingStatus === "completed" ? "default" : "secondary"}
                          className={
                            obSummary.onboardingStatus === "completed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent"
                              : obSummary.onboardingStatus === "ready_for_review"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent"
                              : obSummary.onboardingStatus === "in_progress"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent"
                              : ""
                          }
                          data-testid="badge-onboarding-status"
                        >
                          {obSummary.onboardingStatus === "not_started" ? "Not Started"
                            : obSummary.onboardingStatus === "in_progress" ? "In Progress"
                            : obSummary.onboardingStatus === "ready_for_review" ? "Ready for Review"
                            : obSummary.onboardingStatus === "completed" ? "Completed"
                            : obSummary.onboardingStatus ?? "—"}
                        </Badge>
                      </div>
                      {obSummary.total > 0 && (
                        <>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary rounded-full h-2 transition-all"
                              style={{ width: `${Math.round((obSummary.completed / obSummary.total) * 100)}%` }}
                              data-testid="bar-onboarding-progress"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {obSummary.completed} of {obSummary.total} items complete
                            {obSummary.requiredTotal > 0 && (
                              <span className="ml-1">
                                ({obSummary.requiredCompleted} of {obSummary.requiredTotal} required)
                              </span>
                            )}
                          </p>
                          {obSummary.blockers.length > 0 && (
                            <div className="flex items-start gap-2 mt-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                Incomplete: {obSummary.blockers.slice(0, 3).join(", ")}{obSummary.blockers.length > 3 ? ` +${obSummary.blockers.length - 3} more` : ""}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}


                  {/* Synced fields legend */}
                  <div className="rounded-lg border border-border p-4 bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Driver-Controlled Fields (read-only on Employee)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["First Name", "Last Name", "Email", "Phone", "Address", "Hire Date", "Reactivation Date", "Term Date", "Employment Type", "Status", "Department", "Manager"].map(f => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* Sync Audit Log */}
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sync History</p>
                    {syncLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No sync events recorded yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {syncLogs.map((log: any) => (
                          <div key={log.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0" data-testid={`row-sync-log-${log.id}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={log.operation === "created" ? "default" : "secondary"} className="text-[10px] uppercase">
                                  {log.operation}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {log.triggeredBy === "manual" ? "Manual" : "Auto"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(log.syncedAt).toLocaleString()}
                                </span>
                              </div>
                              {Array.isArray(log.changedFields) && log.changedFields.length > 0 ? (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Changed: {log.changedFields.join(", ")}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground/60 mt-1 italic">No field changes detected</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>{/* end left col */}

                  {/* ── Right column: Employee Profile widget ── */}
                  <div className="space-y-4">
                    <Card data-testid="card-employee-profile-widget">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 shrink-0">
                            <Briefcase className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Employee Record (Linked)</p>
                            <CardTitle className="text-sm mt-0.5">Employee Profile</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Employee fields */}
                        <div className="space-y-2.5">
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Name</p>
                            <p className="text-sm font-medium" data-testid="text-widget-employee-name">
                              {`${linkedEmployee.firstName ?? ""} ${linkedEmployee.lastName ?? ""}`.trim() || "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Employee ID</p>
                            <p className="text-sm" data-testid="text-widget-employee-id">{linkedEmployee.employeeId || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Employment Status</p>
                            <StatusBadge status={linkedEmployee.status || "active"} data-testid="badge-widget-employee-status" />
                          </div>
                          {obSummary && (
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Onboarding</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="secondary"
                                  className={
                                    obSummary.onboardingStatus === "completed"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent text-xs"
                                      : obSummary.onboardingStatus === "ready_for_review"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent text-xs"
                                      : obSummary.onboardingStatus === "in_progress"
                                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent text-xs"
                                      : "text-xs"
                                  }
                                  data-testid="badge-widget-onboarding-status"
                                >
                                  {obSummary.onboardingStatus === "not_started" ? "Not Started"
                                    : obSummary.onboardingStatus === "in_progress" ? "In Progress"
                                    : obSummary.onboardingStatus === "ready_for_review" ? "Ready for Review"
                                    : obSummary.onboardingStatus === "completed" ? "Completed"
                                    : obSummary.onboardingStatus ?? "—"}
                                </Badge>
                                {obSummary.total > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {obSummary.completed}/{obSummary.total}
                                  </span>
                                )}
                              </div>
                              {obSummary.total > 0 && (
                                <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                                  <div
                                    className="bg-primary rounded-full h-1.5 transition-all"
                                    style={{ width: `${Math.round((obSummary.completed / obSummary.total) * 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                      </CardContent>
                    </Card>
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserPlus className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No Employee Record Linked</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
                    This driver is classified as a W-2 Employee but no Employee record exists yet. Create one now to establish the link.
                  </p>
                  <Button
                    onClick={() => syncEmployeeMutation.mutate()}
                    disabled={syncEmployeeMutation.isPending}
                    data-testid="button-create-employee-record"
                  >
                    {syncEmployeeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Create Employee Record
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Sheet open={notesSlideOpen} onOpenChange={setNotesSlideOpen}>
        <SheetContent className="flex flex-col" data-testid="sheet-notes-panel">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notes & Communications
              <Badge variant={notes.length > 0 ? "default" : "secondary"} data-testid="badge-notes-sheet-count">
                {notes.length}
              </Badge>
            </SheetTitle>
            <SheetDescription>Quick view of driver notes and activity</SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-4">
            <Select value={slideNoteType} onValueChange={setSlideNoteType} data-testid="select-slide-note-type">
              <SelectTrigger data-testid="trigger-slide-note-type">
                <SelectValue placeholder="Note type..." />
              </SelectTrigger>
              <SelectContent>
                {DRIVER_NOTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Add a quick note..."
              value={slideNoteText}
              onChange={(e) => setSlideNoteText(e.target.value)}
              rows={2}
              data-testid="textarea-slide-note"
            />
            <Button
              size="sm"
              onClick={handleAddSlideNote}
              disabled={!slideNoteText.trim() || !slideNoteType || addNoteMutation.isPending}
              data-testid="button-add-slide-note"
            >
              {addNoteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Internal Note
            </Button>
          </div>

          <Separator className="my-4" />

          <div className="flex-1 overflow-y-auto space-y-3">
            {notes.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notes yet</p>
              </div>
            ) : (
              notes.slice(0, 10).map((note, index) => (
                <div
                  key={note.id}
                  className="border border-border rounded-md p-3 space-y-1"
                  data-testid={`slide-note-${index}`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.createdAt && new Date(note.createdAt) >= new Date("2026-03-01T00:00:00Z") ? (
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={note.isImported ? undefined : (note.corporateUser.profileImageUrl || undefined)} />
                          <AvatarFallback className="text-[10px]">
                            {note.isImported
                              ? (note.authorName?.[0] || note.corporateUser.firstName?.[0] || "I")
                              : (note.corporateUser.firstName?.[0] || "U")}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="h-5 w-5 rounded-full shrink-0 border border-dashed border-muted-foreground/25" />
                      )}
                      <span className="text-xs font-medium">
                        {note.isImported
                          ? (note.authorName || (note.corporateUser.firstName && note.corporateUser.lastName
                              ? `${note.corporateUser.firstName} ${note.corporateUser.lastName}`
                              : note.corporateUser.email))
                          : (note.corporateUser.firstName && note.corporateUser.lastName
                              ? `${note.corporateUser.firstName} ${note.corporateUser.lastName}`
                              : note.corporateUser.email)}
                      </span>
                      {note.noteType && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {note.noteType}
                        </Badge>
                      )}
                      {note.isImported && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-default">
                              Imported
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs space-y-1 text-xs">
                            <p><span className="font-medium">Imported by:</span> {note.importerUser
                              ? (note.importerUser.firstName && note.importerUser.lastName
                                  ? `${note.importerUser.firstName} ${note.importerUser.lastName}`
                                  : note.importerUser.email)
                              : "Unknown"}</p>
                            {note.importedAt && (
                              <p><span className="font-medium">Import date:</span> {new Date(note.importedAt).toLocaleString()}</p>
                            )}
                            {note.importBatchId && (
                              <p><span className="font-medium">Batch ID:</span> {note.importBatchId.slice(0, 8)}</p>
                            )}
                            {note.sourceAuthorRaw && (
                              <p><span className="font-medium">Source author:</span> {note.sourceAuthorRaw}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {note.createdAt ? formatNoteDateTime(note.createdAt) : ""}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{note.noteText}</p>
                </div>
              ))
            )}
            {notes.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing 10 of {notes.length} notes
              </p>
            )}
          </div>

          <Separator className="my-4" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNotesSlideOpen(false);
              handleTabChange("notes");
            }}
            data-testid="button-view-all-notes"
          >
            View All Notes
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </SheetContent>
      </Sheet>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Driver Record</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving this driver will hide them from the active driver list. This action is non-destructive — the record can be restored by a Super Admin. Provide an optional reason below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <input
              type="text"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Reason for archiving (optional)"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              data-testid="input-archive-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-archive-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveDriverMutation.mutate(archiveReason)}
              disabled={archiveDriverMutation.isPending}
              data-testid="button-archive-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiveDriverMutation.isPending ? "Archiving..." : "Archive Driver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Driver Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the archived driver back to <strong>inactive</strong> status. The driver will reappear in the driver list. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-restore-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreDriverMutation.mutate()}
              disabled={restoreDriverMutation.isPending}
              data-testid="button-restore-confirm"
            >
              {restoreDriverMutation.isPending ? "Restoring..." : "Restore Driver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Risk Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Risk Restriction</DialogTitle>
            <DialogDescription>
              Lifting this restriction allows the driver to receive dispatch assignments despite their risk score. This action is logged and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason for override <span className="text-destructive">*</span></label>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Explain why this restriction is being overridden..."
              rows={3}
              data-testid="input-override-reason"
            />
            {overrideReason.trim().length > 0 && overrideReason.trim().length < 5 && (
              <p className="text-xs text-destructive">Reason must be at least 5 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)} data-testid="button-override-cancel">Cancel</Button>
            <Button
              onClick={() => overrideMutation.mutate(overrideReason)}
              disabled={overrideMutation.isPending || overrideReason.trim().length < 5}
              data-testid="button-override-confirm"
            >
              {overrideMutation.isPending ? "Applying..." : "Apply Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Override Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Override</AlertDialogTitle>
            <AlertDialogDescription>
              This will re-apply the automatic restriction based on the driver's current risk score. The driver may be blocked from new assignments again. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-revoke-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              data-testid="button-revoke-confirm"
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Override"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Driver Compose Dialog */}
      {driver && (
        <DriverEmailComposeDialog
          open={emailComposeOpen}
          onClose={() => setEmailComposeOpen(false)}
          driverId={id!}
          driverName={`${driver.user?.firstName || ""} ${driver.user?.lastName || ""}`.trim() || driver.driverNumber || "Driver"}
          driverEmail={driver.user?.email || ""}
        />
      )}

      {/* Merge Records Dialog (Super Admin only) */}
      {(user as any)?.isRootSuperAdmin && driver && (
        <MergeRecordsDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          entityType="driver"
          primaryId={id!}
          primaryLabel={`${driver.user?.firstName || ""} ${driver.user?.lastName || ""}`.trim() || driver.driverNumber || id!}
          onMergeComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/drivers", id] });
            queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
          }}
        />
      )}

      {/* ── Edit Driver Sheet ── */}
      <Sheet open={showEditSheet} onOpenChange={setShowEditSheet}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="flex-none px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Driver
            </SheetTitle>
            <SheetDescription>
              Update the driver record. Changes save when you click Save Changes.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {/* Personal Information */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Personal Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-firstName">First Name</label>
                  <Input id="edit-firstName" data-testid="input-edit-firstName"
                    value={editForm.firstName ?? ""} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-lastName">Last Name</label>
                  <Input id="edit-lastName" data-testid="input-edit-lastName"
                    value={editForm.lastName ?? ""} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-email">Email</label>
                  <Input id="edit-email" data-testid="input-edit-email" type="email"
                    value={editForm.email ?? ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-phoneNumber">Phone Number</label>
                  <PhoneInput
                    id="edit-phoneNumber"
                    data-testid="input-edit-phoneNumber"
                    value={editForm.phoneNumber ?? ""}
                    onChange={v => setEditForm(f => ({ ...f, phoneNumber: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-dateOfBirth">Date of Birth</label>
                  <Input id="edit-dateOfBirth" data-testid="input-edit-dateOfBirth" type="date"
                    value={editForm.dateOfBirth ?? ""} onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Address</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-address">Street Address</label>
                  <Input id="edit-address" data-testid="input-edit-address"
                    value={editForm.address ?? ""} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="edit-city">City</label>
                    <Input id="edit-city" data-testid="input-edit-city"
                      value={editForm.city ?? ""} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} placeholder="City" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="edit-state">State</label>
                    <Input id="edit-state" data-testid="input-edit-state" maxLength={2}
                      value={editForm.state ?? ""} onChange={e => setEditForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} placeholder="ST" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="edit-zipCode">ZIP Code</label>
                    <Input id="edit-zipCode" data-testid="input-edit-zipCode"
                      value={editForm.zipCode ?? ""} onChange={e => setEditForm(f => ({ ...f, zipCode: e.target.value }))} placeholder="ZIP" />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Professional */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Professional</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-driverNumber">Driver Number</label>
                  <Input id="edit-driverNumber" data-testid="input-edit-driverNumber"
                    value={editForm.driverNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, driverNumber: e.target.value }))} placeholder="Driver #" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-driverClassification">Classification</label>
                  <Select
                    value={editForm.driverClassification || "__none__"}
                    onValueChange={v => setEditForm(f => ({ ...f, driverClassification: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger id="edit-driverClassification" data-testid="select-edit-driverClassification">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select —</SelectItem>
                      <SelectItem value="Employee">W-2 Employee</SelectItem>
                      <SelectItem value="Independent Contractor">Independent Contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-market">Market</label>
                  <Input id="edit-market" data-testid="input-edit-market"
                    value={editForm.market ?? ""} onChange={e => setEditForm(f => ({ ...f, market: e.target.value }))} placeholder="Market / City" />
                </div>
              </div>
            </div>

            <Separator />

            {/* License */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Driver License</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-licenseNumber">License Number</label>
                  <Input id="edit-licenseNumber" data-testid="input-edit-licenseNumber"
                    value={editForm.licenseNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="License #" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-licenseState">Issuing State</label>
                  <Input id="edit-licenseState" data-testid="input-edit-licenseState" maxLength={2}
                    value={editForm.licenseState ?? ""} onChange={e => setEditForm(f => ({ ...f, licenseState: e.target.value.toUpperCase() }))} placeholder="ST" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-licenseExpiry">Expiry Date</label>
                  <Input id="edit-licenseExpiry" data-testid="input-edit-licenseExpiry" type="date"
                    value={editForm.licenseExpiry ?? ""} onChange={e => setEditForm(f => ({ ...f, licenseExpiry: e.target.value }))} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Emergency Contact */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Emergency Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-emergencyContactName">Name</label>
                  <Input id="edit-emergencyContactName" data-testid="input-edit-emergencyContactName"
                    value={editForm.emergencyContactName ?? ""} onChange={e => setEditForm(f => ({ ...f, emergencyContactName: e.target.value }))} placeholder="Contact name" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="edit-emergencyContactPhone">Phone</label>
                  <PhoneInput
                    id="edit-emergencyContactPhone"
                    data-testid="input-edit-emergencyContactPhone"
                    value={editForm.emergencyContactPhone ?? ""}
                    onChange={v => setEditForm(f => ({ ...f, emergencyContactPhone: v }))}
                  />
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Pinned footer */}
          <div className="flex-none flex items-center justify-end gap-2 px-6 py-3 border-t bg-background">
            <Button variant="outline" onClick={() => setShowEditSheet(false)} data-testid="button-edit-driver-cancel">
              Cancel
            </Button>
            <Button onClick={handleEditFormSave} disabled={updateDriverMutation.isPending} data-testid="button-edit-driver-save">
              {updateDriverMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
                : <><Check className="h-4 w-4 mr-1.5" />Save Changes</>
              }
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface DriverDetailBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DriverDetailBoundary extends Component<{ children: React.ReactNode }, DriverDetailBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DriverDetailBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[DriverDetail] Render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">Failed to load driver profile</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message || "An unexpected error occurred while rendering this page."}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DriverDetailPage() {
  return (
    <DriverDetailBoundary>
      <DriverDetail />
    </DriverDetailBoundary>
  );
}
