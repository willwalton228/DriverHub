import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2, Mail, Phone, User, Calendar, Briefcase, Lock, Check, X, Pencil, Camera, MessageSquare, ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw, ArrowLeft, ExternalLink, Link2, ClipboardList, Circle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { useParams, Link } from "wouter";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { formatPhoneInput, cleanPhone, validatePhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@shared/schema";
import { ExcelDownloadButton } from "@/components/ExcelDownloadButton";
import type { ExcelColumn } from "@/lib/excelExport";
import { EmployeeLeaveManagement } from "./employees/EmployeeLeaveManagement";
import { PhoneDisplay } from "@/components/PhoneDisplay";

const US_STATES = [
  { value: "AL", label: "AL" }, { value: "AK", label: "AK" }, { value: "AZ", label: "AZ" },
  { value: "AR", label: "AR" }, { value: "CA", label: "CA" }, { value: "CO", label: "CO" },
  { value: "CT", label: "CT" }, { value: "DE", label: "DE" }, { value: "FL", label: "FL" },
  { value: "GA", label: "GA" }, { value: "HI", label: "HI" }, { value: "ID", label: "ID" },
  { value: "IL", label: "IL" }, { value: "IN", label: "IN" }, { value: "IA", label: "IA" },
  { value: "KS", label: "KS" }, { value: "KY", label: "KY" }, { value: "LA", label: "LA" },
  { value: "ME", label: "ME" }, { value: "MD", label: "MD" }, { value: "MA", label: "MA" },
  { value: "MI", label: "MI" }, { value: "MN", label: "MN" }, { value: "MS", label: "MS" },
  { value: "MO", label: "MO" }, { value: "MT", label: "MT" }, { value: "NE", label: "NE" },
  { value: "NV", label: "NV" }, { value: "NH", label: "NH" }, { value: "NJ", label: "NJ" },
  { value: "NM", label: "NM" }, { value: "NY", label: "NY" }, { value: "NC", label: "NC" },
  { value: "ND", label: "ND" }, { value: "OH", label: "OH" }, { value: "OK", label: "OK" },
  { value: "OR", label: "OR" }, { value: "PA", label: "PA" }, { value: "RI", label: "RI" },
  { value: "SC", label: "SC" }, { value: "SD", label: "SD" }, { value: "TN", label: "TN" },
  { value: "TX", label: "TX" }, { value: "UT", label: "UT" }, { value: "VT", label: "VT" },
  { value: "VA", label: "VA" }, { value: "WA", label: "WA" }, { value: "WV", label: "WV" },
  { value: "WI", label: "WI" }, { value: "WY", label: "WY" }, { value: "DC", label: "DC" },
];

const relationshipOptions = [
  { value: "Spouse", label: "Spouse" },
  { value: "Mother", label: "Mother" },
  { value: "Father", label: "Father" },
  { value: "Sibling", label: "Sibling" },
  { value: "Friend", label: "Friend" },
  { value: "Other", label: "Other" },
];

function formatSSN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}


function formatZipCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatCurrencyInput(value: string, maxValue?: number): string {
  // Extract only digits
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  
  // Convert to cents (right-to-left entry)
  let cents = parseInt(digits, 10);
  
  // Apply max value limit if provided (convert max to cents)
  if (maxValue !== undefined) {
    const maxCents = Math.floor(maxValue * 100);
    if (cents > maxCents) {
      cents = maxCents;
    }
  }
  
  // Convert cents to dollars with 2 decimal places
  const dollars = (cents / 100).toFixed(2);
  
  // Add thousand separators
  const parts = dollars.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return '$' + parts.join('.');
}

function parseCurrencyToNumber(formattedValue: string): string {
  // Remove $ and commas, return the numeric value as string
  const cleaned = formattedValue.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? '' : num.toString();
}

function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  } catch {
    return "";
  }
}

function isValidEmail(email: string): boolean {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidZipCode(zip: string): boolean {
  if (!zip) return true;
  const zipRegex = /^\d{5}(-\d{4})?$/;
  return zipRegex.test(zip);
}

interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => Promise<void>;
  type?: "text" | "date" | "currency" | "phone" | "email" | "textarea" | "select" | "ssn" | "state" | "zip" | "percentage" | "rating";
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  disabledMessage?: string;
  max?: number;
  placeholder?: string;
  className?: string;
}

function formatDateForInput(dateValue: string | null | undefined): string {
  if (!dateValue) return "";
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split('T')[0];
  } catch {
    return "";
  }
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function EditableField({
  label,
  value,
  fieldName,
  onSave,
  type = "text",
  options,
  required = false,
  maxLength,
  disabled = false,
  disabledMessage,
  max,
  className,
}: EditableFieldProps) {
  const getInitialValue = () => {
    if (type === "date") return formatDateForInput(value);
    if (type === "phone") return formatPhoneInput(value || "");
    if (type === "currency" && value) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) return formatCurrencyInput((numValue * 100).toFixed(0), max);
    }
    return value || "";
  };

  const [editValue, setEditValue] = useState(getInitialValue());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveStatus !== "saving") {
      if (type === "date") {
        setEditValue(formatDateForInput(value));
      } else if (type === "phone") {
        setEditValue(formatPhoneInput(value || ""));
      } else if (type === "currency" && value) {
        const numValue = parseFloat(value);
        setEditValue(!isNaN(numValue) ? formatCurrencyInput((numValue * 100).toFixed(0), max) : "");
      } else {
        setEditValue(value || "");
      }
    }
  }, [value, type, max]);

  const getServerCanonical = () => {
    if (type === "phone") return cleanPhone(value || "");
    if (type === "currency" && value) {
      const n = parseFloat(value);
      return isNaN(n) ? "" : n.toString();
    }
    if (type === "date") return value ? formatDateForInput(value) : "";
    return value || "";
  };

  const getCanonical = (raw: string): string => {
    let v = raw.trim();
    if (type === "phone") return cleanPhone(v);
    if (type === "date" && (v === "0000-00-00" || v === "00000000")) v = "";
    if (type === "currency") v = parseCurrencyToNumber(v);
    return v;
  };

  const validate = (v: string): string | null => {
    if (type === "phone" && v) { const err = validatePhone(v); if (err) return err; }
    if (type === "email" && v && !isValidEmail(v)) return "Please enter a valid email address";
    if (type === "zip" && v && !isValidZipCode(v)) return "Please enter a valid zip code (XXXXX or XXXXX-XXXX)";
    return null;
  };

  const triggerSave = async (rawValue: string) => {
    const canonical = getCanonical(rawValue);
    if (canonical === getServerCanonical()) return;
    const err = validate(canonical);
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveStatus("saving");
    try {
      await onSave(fieldName, canonical);
      setSaveStatus("saved");
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1800);
    } catch {
      setSaveStatus("error");
    }
  };

  const handleBlur = () => { triggerSave(editValue); };

  const handleSelectChange = (v: string) => {
    setEditValue(v);
    triggerSave(v);
  };

  const handleFormattedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (type === "ssn") setEditValue(formatSSN(val));
    else if (type === "phone") setEditValue(formatPhoneInput(val));
    else if (type === "zip") setEditValue(formatZipCode(val));
    else if (maxLength) setEditValue(val.slice(0, maxLength));
    else setEditValue(val);
  };

  // PhoneInput calls onChange(formattedString) directly — no event object.
  const handlePhoneInputChange = (formatted: string) => {
    setValidationError(null);
    setEditValue(formatted);
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (max !== undefined) {
      const numVal = parseFloat(val);
      if (!isNaN(numVal) && numVal > max) { setEditValue(max.toString()); return; }
    }
    if (type === "rating") {
      const numVal = parseFloat(val);
      if (!isNaN(numVal) && numVal < 1 && val !== "") { setEditValue("1"); return; }
    }
    setEditValue(val);
  };

  const getInputType = () => {
    if (type === "date") return "date";
    if (type === "currency") return "text";
    if (type === "percentage" || type === "rating") return "number";
    if (type === "email") return "email";
    return "text";
  };

  const getChangeHandler = () => {
    if (type === "currency") return (e: React.ChangeEvent<HTMLInputElement>) => setEditValue(formatCurrencyInput(e.target.value, max));
    if (type === "percentage" || type === "rating") return handleNumericChange;
    if (type === "ssn" || type === "phone" || type === "zip") return handleFormattedChange;
    return (e: React.ChangeEvent<HTMLInputElement>) => setEditValue(maxLength ? e.target.value.slice(0, maxLength) : e.target.value);
  };

  const showRequired = required && !value && !disabled;

  const StatusIndicator = () => {
    if (saveStatus === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />;
    if (saveStatus === "saved") return <Check className="h-3 w-3 text-green-500 flex-shrink-0" />;
    if (saveStatus === "error") return <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />;
    return null;
  };

  if (disabled) {
    return (
      <div className={`opacity-50 cursor-not-allowed p-2 -m-2 ${className || ""}`} data-testid={`field-${fieldName}`}>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-muted-foreground">{disabledMessage || "N/A"}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className || ""}`} data-testid={`field-${fieldName}`}>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </p>
        <StatusIndicator />
      </div>
      {type === "textarea" ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
          onBlur={handleBlur}
          className={`min-h-[80px] ${validationError || showRequired ? "border-destructive" : ""}`}
          maxLength={maxLength}
          data-testid={`input-edit-${fieldName}`}
        />
      ) : type === "select" && options ? (
        <Select value={editValue} onValueChange={handleSelectChange}>
          <SelectTrigger className={`h-9 ${showRequired ? "border-destructive" : ""}`} data-testid={`select-edit-${fieldName}`}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "state" ? (
        <Select value={editValue} onValueChange={handleSelectChange}>
          <SelectTrigger className={`h-9 w-20 ${showRequired ? "border-destructive" : ""}`} data-testid={`select-edit-${fieldName}`}>
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent>
            {US_STATES.map((state) => (
              <SelectItem key={state.value} value={state.value}>{state.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "phone" ? (
        <PhoneInput
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={editValue}
          onChange={handlePhoneInputChange}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") {
              setEditValue(formatPhoneInput(value || ""));
              setValidationError(null);
            }
          }}
          className={validationError || showRequired ? "border-destructive" : ""}
          aria-invalid={validationError ? "true" : undefined}
          data-testid={`input-edit-${fieldName}`}
        />
      ) : (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={getInputType()}
            value={editValue}
            onChange={(e) => {
              setValidationError(null);
              getChangeHandler()(e);
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") {
                if (type === "date") setEditValue(formatDateForInput(value));
                else if (type === "currency" && value) {
                  const n = parseFloat(value);
                  setEditValue(!isNaN(n) ? formatCurrencyInput((n * 100).toFixed(0), max) : "");
                } else { setEditValue(value || ""); }
                setValidationError(null);
              }
            }}
            step={(type === "percentage" || type === "rating") ? "0.01" : undefined}
            max={(type === "percentage" || type === "rating") && max !== undefined ? max : undefined}
            min={type === "percentage" ? "0" : type === "rating" ? "1" : undefined}
            maxLength={maxLength}
            className={`h-9 ${validationError || showRequired ? "border-destructive" : ""}`}
            aria-invalid={validationError ? "true" : undefined}
            data-testid={`input-edit-${fieldName}`}
          />
          {type === "date" && editValue && !required && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { setEditValue(""); triggerSave(""); }}
              title="Clear date"
              data-testid={`button-clear-${fieldName}`}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}
      {validationError && (
        <p className="text-xs text-destructive" role="alert" data-testid={`error-${fieldName}`}>{validationError}</p>
      )}
      {saveStatus === "error" && !validationError && (
        <p className="text-xs text-destructive" role="alert">Save failed. Please try again.</p>
      )}
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: [`/api/corporate/employees/${id}`],
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ fieldName, value }: { fieldName: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/corporate/employees/${id}`, { [fieldName]: value || null });
      return response.json();
    },
    onSuccess: (updatedEmployee: Employee) => {
      queryClient.setQueryData([`/api/corporate/employees/${id}`], updatedEmployee);
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/employees'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update", variant: "destructive" });
    },
  });

  const photoUploadMutation = useMutation({
    mutationFn: async (profilePhotoUrl: string) => {
      const response = await apiRequest("PUT", `/api/corporate/employees/${id}/photo`, { profilePhotoUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/corporate/employees/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/employees'] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Photo Updated", description: "Profile photo has been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile photo. Please try again.", variant: "destructive" });
    },
  });

  const handlePhotoUploadComplete = (dataUrl: string) => {
    if (dataUrl) {
      photoUploadMutation.mutate(dataUrl);
    }
  };

  const handleSave = async (fieldName: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      updateMutation.mutate({ fieldName, value }, {
        onSuccess: () => resolve(),
        onError: (err: any) => {
          toast({ title: "Save failed", description: err.message || "Failed to update", variant: "destructive" });
          reject(err);
        },
      });
    });
  };


  const calculateAge = (dateOfBirth: string | Date | null): number | null => {
    if (!dateOfBirth) return null;
    // parseDateSafe builds the Date in LOCAL time, avoiding the UTC-midnight shift
    // that `new Date("YYYY-MM-DD")` causes in US timezones (shows prior day).
    const dob = parseDateSafe(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  // ── Driver-Employee linkage (derived before hooks so queries can use them) ──
  const driverLinked = !!(employee as any)?.sourceOfTruth && (employee as any).sourceOfTruth === "driver";
  const linkedDriverId = (employee as any)?.driverId ?? null;

  // Fetch linked driver details for the Driver Profile widget
  const { data: linkedDriver } = useQuery<any>({
    queryKey: ["/api/corporate/drivers", linkedDriverId],
    enabled: !!employee && driverLinked && !!linkedDriverId,
  });

  // ── Onboarding ──
  const { data: onboardingData, isLoading: onboardingLoading } = useQuery<{
    onboardingStatus: string;
    total: number;
    completed: number;
    requiredTotal: number;
    requiredCompleted: number;
    blockers: string[];
    items: any[];
    onboardingStartedAt: string | null;
    onboardingCompletedAt: string | null;
  }>({
    queryKey: ["/api/corporate/employees", employee?.id ?? "", "onboarding"],
    enabled: !!employee && driverLinked,
  });

  const completeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("POST", `/api/corporate/employees/${employee?.id}/onboarding/items/${itemId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employee?.id ?? "", "onboarding"] });
    },
    onError: () => toast({ title: "Failed to complete item", variant: "destructive" }),
  });

  const uncompleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("POST", `/api/corporate/employees/${employee?.id}/onboarding/items/${itemId}/uncomplete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employee?.id ?? "", "onboarding"] });
    },
    onError: () => toast({ title: "Failed to uncheck item", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/corporate/employees/${employee?.id}/onboarding`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employee?.id ?? "", "onboarding"] });
      toast({ title: "Onboarding status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const seedOnboardingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/employees/${employee?.id}/onboarding/seed`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employee?.id ?? "", "onboarding"] });
      toast({ title: "Onboarding checklist created" });
    },
    onError: () => toast({ title: "Failed to create checklist", variant: "destructive" }),
  });

  // ── Early returns AFTER all hooks ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-employee" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground" data-testid="text-employee-not-found">Employee not found</p>
        <Link href="/employees">
          <Button variant="ghost" className="mt-4" data-testid="button-back-to-employees">Back to Employees</Button>
        </Link>
      </div>
    );
  }

  // ── Post-guard derived values ─────────────────────────────────────────────
  const age = calculateAge(employee.dateOfBirth);
  const driverSyncedAt = (employee as any).driverSyncedAt ?? null;

  // Fields that are owned by the Driver when this Employee is driver-linked
  const DRIVER_SYNCED_FIELDS = new Set([
    "firstName", "lastName", "email", "phoneNumber",
    "address", "city", "state", "zipCode",
    "hireDate", "reactivationDate", "termDate", "termReason", "eligibleForRehire",
    "employmentType", "status", "department", "directManagerId",
  ]);

  const isSynced = (fieldName: string) => driverLinked && DRIVER_SYNCED_FIELDS.has(fieldName);
  const syncedMsg = "This field is synced from the linked Driver record and can only be changed there.";

  const onboardingItems = onboardingData?.items ?? [];
  const onboardingStatus = onboardingData?.onboardingStatus ?? "not_started";
  const onboardingProgress = onboardingData ? { completed: onboardingData.completed, total: onboardingData.total } : null;

  const ONBOARDING_STATUS_OPTIONS = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "ready_for_review", label: "Ready for Review" },
    { value: "completed", label: "Completed" },
  ];
  const ONBOARDING_CATEGORY_LABELS: Record<string, string> = {
    identity: "Identity & Record",
    hr: "HR",
    payroll: "Payroll",
    documentation: "Documentation",
    compliance: "Compliance",
  };
  const ONBOARDING_STATUS_COLORS: Record<string, string> = {
    not_started: "",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent",
    ready_for_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent",
  };

  // Backend strips comp/perf fields for non-authorized users — check if any are present
  const canViewComp = 'annualSalary' in (employee as object) || 'hourlyRate' in (employee as object);

  // Check if emergency contact has any entries
  const hasEmergencyContactInfo = !!(
    employee.emergencyContactName || 
    employee.emergencyContactPhone || 
    employee.emergencyContactEmail || 
    employee.emergencyContactRelationship
  );
  
  // Emergency Contact Section render function
  const renderEmergencyContactSection = () => (
    <Card id="emergency-section">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Phone className="h-5 w-5 text-primary" />
        <CardTitle>Emergency Contact</CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <EditableField label="Emergency Contact Name" value={employee.emergencyContactName} fieldName="emergencyContactName" onSave={handleSave} required />
        <EditableField label="Emergency Contact Mobile #" value={employee.emergencyContactPhone} fieldName="emergencyContactPhone" type="phone" onSave={handleSave} required />
        <EditableField label="Emergency Contact Email" value={employee.emergencyContactEmail} fieldName="emergencyContactEmail" type="email" onSave={handleSave} required />
        <EditableField label="Emergency Contact Relationship" value={employee.emergencyContactRelationship} fieldName="emergencyContactRelationship" type="select" options={relationshipOptions} onSave={handleSave} required />
      </CardContent>
    </Card>
  );

  const statusOptions = [
    { value: "Active", label: "Active" },
    { value: "Suspended", label: "Suspended" },
    { value: "On Leave", label: "On Leave" },
    { value: "Terminated", label: "Terminated" },
  ];

  const yesNoOptions = [
    { value: "Yes", label: "Yes" },
    { value: "No", label: "No" },
  ];

  const employmentTypeOptions = [
    { value: "Full Time", label: "Full Time" },
    { value: "Part Time", label: "Part Time" },
  ];

  const exemptTypeOptions = [
    { value: "Exempt (Salaried)", label: "Exempt (Salaried)" },
    { value: "Non-Exempt (Hourly)", label: "Non-Exempt (Hourly)" },
  ];

  const employeeExportColumns: ExcelColumn[] = [
    { header: "First Name", key: "firstName", width: 15 },
    { header: "Last Name", key: "lastName", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Phone", key: "phoneNumber", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Position", key: "position", width: 20 },
    { header: "Department", key: "department", width: 15 },
    { header: "Employment Type", key: "employmentType", width: 15 },
    { header: "Employee Type", key: "employeeType", width: 20 },
    { header: "Hire Date", key: "hireDate", width: 12 },
    { header: "Annual Salary", key: "annualSalary", width: 12 },
    { header: "Hourly Rate", key: "hourlyRate", width: 12 },
    { header: "Address", key: "address", width: 30 },
    { header: "City", key: "city", width: 15 },
    { header: "State", key: "state", width: 10 },
    { header: "Zip", key: "zipCode", width: 10 },
  ];

  const employeeExportData = [{
    firstName: employee.firstName || "",
    lastName: employee.lastName || "",
    email: employee.email || "",
    phoneNumber: employee.phoneNumber || "",
    status: employee.status || "",
    position: employee.position || "",
    department: employee.department || "",
    employmentType: employee.employmentType || "",
    employeeType: employee.employeeType || "",
    hireDate: formatDate(employee.hireDate),
    annualSalary: employee.annualSalary ? `$${employee.annualSalary}` : "",
    hourlyRate: employee.hourlyRate ? `$${employee.hourlyRate}` : "",
    address: employee.address || "",
    city: employee.city || "",
    state: employee.state || "",
    zipCode: employee.zipCode || "",
  }];

  return (
    <div className="space-y-6">
      {/* ── Sticky identity header ── */}
      <div className="sticky top-0 z-50 bg-background border-b border-border -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate" data-testid="text-employee-name-sticky">
                  {employee.firstName && employee.lastName
                    ? `${employee.firstName} ${employee.lastName}`
                    : employee.email}
                </h1>
                <StatusBadge status={employee.status} data-testid="badge-employee-status-sticky" />
                {employee.title && (
                  <span className="text-sm text-muted-foreground hidden sm:inline">{employee.title}</span>
                )}
              </div>
              {employee.department && (
                <p className="text-xs text-muted-foreground">{employee.department}</p>
              )}
            </div>
          </div>
          <ExcelDownloadButton
            data={employeeExportData}
            columns={employeeExportColumns}
            filename={`Employee_${employee.lastName || "Details"}`}
            label="Export"
          />
        </div>
      </div>

      {/* ── Driver-Linked banner ── */}
      {driverLinked && linkedDriverId && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3" data-testid="banner-driver-linked">
          <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Driver-Linked Record</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              This employee is a W-2 driver. Core fields are controlled by the Driver record and are read-only here.
              {driverSyncedAt && (
                <span className="ml-1">Last synced: {new Date(driverSyncedAt).toLocaleString()}</span>
              )}
            </p>
          </div>
          <Link href={`/drivers/${linkedDriverId}`}>
            <Button variant="outline" size="default" data-testid="button-view-driver-record">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              View Driver Record
            </Button>
          </Link>
        </div>
      )}

      {/* ── Two-column layout: main cards (left) + sidebar widget (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Left column: all main content cards ── */}
        <div className="lg:col-span-2 space-y-6">

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="relative">
              <UserAvatar
                photoUrl={employee.profilePhotoUrl}
                firstName={employee.firstName}
                lastName={employee.lastName}
                email={employee.email}
                size="xl"
                data-testid="avatar-employee"
              />
              <ProfilePhotoUploader
                onComplete={handlePhotoUploadComplete}
                buttonVariant="secondary"
                buttonClassName="absolute -bottom-1 -right-1 h-8 w-8 rounded-full p-0"
                testId="button-upload-employee-photo"
              >
                <Camera className="h-4 w-4" />
              </ProfilePhotoUploader>
              {photoUploadMutation.isPending && (
                <div className="absolute inset-0 bg-background/50 rounded-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
            
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold" data-testid="text-employee-name">
                    {employee.firstName && employee.lastName
                      ? `${employee.firstName} ${employee.lastName}`
                      : employee.email}
                  </h1>
                  <StatusBadge status={employee.status || "active"} data-testid="badge-employee-status" />
                </div>
                {employee.position && (
                  <p className="text-muted-foreground mt-1" data-testid="text-employee-position">{employee.position}</p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {employee.email && (
                  <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-employee-email">
                    <Mail className="h-4 w-4" />
                    <span>{employee.email}</span>
                  </div>
                )}
                {employee.phoneNumber && (
                  <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-employee-phone">
                    <Phone className="h-4 w-4 shrink-0" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={`https://app.heymarket.com/conversations?number=${cleanPhone(employee.phoneNumber)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                          data-testid="button-text-employee"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Text via Heymarket</TooltipContent>
                    </Tooltip>
                    <PhoneDisplay
                      phone={employee.phoneNumber}
                      data-testid="display-employee-phone"
                    />
                  </div>
                )}
                {employee.department && (
                  <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-employee-department">
                    <span className="font-medium">Department:</span>
                    <span>{employee.department}</span>
                  </div>
                )}
                {employee.hireDate && (
                  <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-employee-hire-date">
                    <Calendar className="h-4 w-4" />
                    <span>Hired: {formatDate(employee.hireDate)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="personal-section">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <User className="h-5 w-5 text-primary" />
          <CardTitle>Personal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Line 1: First Name, Middle Name, Last Name */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="First Name" value={employee.firstName} fieldName="firstName" onSave={handleSave} required maxLength={15} disabled={isSynced("firstName")} disabledMessage={syncedMsg} />
            <EditableField label="Middle Name" value={employee.middleName} fieldName="middleName" onSave={handleSave} maxLength={15} />
            <EditableField label="Last Name" value={employee.lastName} fieldName="lastName" onSave={handleSave} required maxLength={20} disabled={isSynced("lastName")} disabledMessage={syncedMsg} />
          </div>
          {/* Line 2: Mobile Phone, Personal Email, SSN */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Mobile Phone" value={employee.phoneNumber} fieldName="phoneNumber" type="phone" onSave={handleSave} disabled={isSynced("phoneNumber")} disabledMessage={syncedMsg} />
            <EditableField label="Personal Email" value={employee.email} fieldName="email" type="email" onSave={handleSave} required maxLength={30} disabled={isSynced("email")} disabledMessage={syncedMsg} />
            <EditableField label="Social Security Number" value={employee.ssn} fieldName="ssn" type="ssn" onSave={handleSave} />
          </div>
          {/* Line 3: Address, City, State, Zip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Address" value={employee.address} fieldName="address" onSave={handleSave} maxLength={35} disabled={isSynced("address")} disabledMessage={syncedMsg} />
            <EditableField label="City" value={employee.city} fieldName="city" onSave={handleSave} maxLength={20} disabled={isSynced("city")} disabledMessage={syncedMsg} />
            <EditableField label="State" value={employee.state} fieldName="state" type="state" onSave={handleSave} disabled={isSynced("state")} disabledMessage={syncedMsg} />
            <EditableField label="Zip" value={employee.zipCode} fieldName="zipCode" type="zip" onSave={handleSave} disabled={isSynced("zipCode")} disabledMessage={syncedMsg} />
          </div>
          {/* Line 4: Date of Birth, Age */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Date of Birth" value={employee.dateOfBirth?.toString()} fieldName="dateOfBirth" type="date" onSave={handleSave} />
            <div className="p-2 -m-2">
              <p className="text-sm font-medium text-muted-foreground">Age</p>
              <p className="mt-1 text-foreground" data-testid="text-age">{age !== null ? age : "N/A"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact Section - shown here when it has entries */}
      {hasEmergencyContactInfo && renderEmergencyContactSection()}

      <Card id="professional-section">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Briefcase className="h-5 w-5 text-primary" />
          <CardTitle>Professional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Line 1: Job Title, Manager, Employee ID, Hire Date */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Job Title" value={employee.position} fieldName="position" onSave={handleSave} required maxLength={25} />
            <EditableField label="Manager" value={employee.manager} fieldName="manager" onSave={handleSave} required maxLength={20} />
            <EditableField label="Employee ID" value={employee.employeeId} fieldName="employeeId" onSave={handleSave} maxLength={8} />
            <EditableField label="Hire Date" value={employee.hireDate?.toString()} fieldName="hireDate" type="date" onSave={handleSave} required disabled={isSynced("hireDate")} disabledMessage={syncedMsg} />
          </div>
          {/* Line 2: Status, Department, Employment Type, Employee Type */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Status" value={employee.status} fieldName="status" type="select" options={statusOptions} onSave={handleSave} required disabled={isSynced("status")} disabledMessage={syncedMsg} />
            <EditableField label="Department" value={employee.department} fieldName="department" onSave={handleSave} required maxLength={15} disabled={isSynced("department")} disabledMessage={syncedMsg} />
            <EditableField label="Employment Type" value={employee.employmentType} fieldName="employmentType" type="select" options={employmentTypeOptions} onSave={handleSave} disabled={isSynced("employmentType")} disabledMessage={syncedMsg} />
            <EditableField label="Employee Type" value={employee.employeeType} fieldName="employeeType" type="select" options={exemptTypeOptions} onSave={handleSave} required />
          </div>
          {/* Line 3: Work Email Address (links employee to user) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Work Email Address" value={employee.workEmail} fieldName="workEmail" type="email" onSave={handleSave} maxLength={50} />
          </div>
          {/* Line 4: Benefits Eligible, PTO Policy, Sick Time Policy, Paid Holiday Policy */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Benefits Eligible" value={employee.benefitsEligible} fieldName="benefitsEligible" type="select" options={yesNoOptions} onSave={handleSave} />
            <EditableField label="PTO Policy" value={employee.ptoPolicy} fieldName="ptoPolicy" onSave={handleSave} maxLength={20} />
            <EditableField label="Sick Time Policy" value={employee.sickTimePolicy} fieldName="sickTimePolicy" onSave={handleSave} maxLength={20} />
            <EditableField label="Paid Holiday Policy" value={employee.paidHolidayPolicy} fieldName="paidHolidayPolicy" onSave={handleSave} maxLength={20} />
          </div>
          {/* Line 5: Reactivation Date, Term Date, Termination Reason, Eligible for Rehire */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField label="Reactivation Date" value={(employee as any).reactivationDate?.toString()} fieldName="reactivationDate" type="date" onSave={handleSave} disabled={isSynced("reactivationDate")} disabledMessage={syncedMsg} />
            <EditableField label="Term Date" value={employee.termDate?.toString()} fieldName="termDate" type="date" onSave={handleSave} disabled={isSynced("termDate")} disabledMessage={syncedMsg} />
            {employee.termDate && (
              <>
                <EditableField label="Termination Reason" value={employee.termReason} fieldName="termReason" onSave={handleSave} maxLength={25} disabled={isSynced("termReason")} disabledMessage={syncedMsg} />
                <EditableField label="Eligible for Rehire" value={employee.eligibleForRehire} fieldName="eligibleForRehire" type="select" options={yesNoOptions} onSave={handleSave} disabled={isSynced("eligibleForRehire")} disabledMessage={syncedMsg} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact Section - shown here when it has NO entries */}
      {!hasEmergencyContactInfo && renderEmergencyContactSection()}

{canViewComp && (
            <Card id="compensation-section">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Lock className="h-5 w-5 text-primary" />
          <CardTitle>Compensation / Performance</CardTitle>
          <Badge variant="secondary" className="ml-auto">Manager/Super Admin Only</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Annual Salary, Hourly Rate, Bonus Eligible, Annual Bonus Percentage Target */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField 
              label="Annual Salary" 
              value={employee.annualSalary} 
              fieldName="annualSalary" 
              type="currency" 
              onSave={handleSave} 
             
              required={employee.employeeType === "Exempt (Salaried)"} 
              disabled={employee.employeeType === "Non-Exempt (Hourly)"}
              disabledMessage="N/A for hourly employees"
              max={99999999.99}
            />
            <EditableField 
              label="Hourly Rate" 
              value={employee.hourlyRate} 
              fieldName="hourlyRate" 
              type="currency" 
              onSave={handleSave} 
             
              required={employee.employeeType === "Non-Exempt (Hourly)"} 
              disabled={employee.employeeType === "Exempt (Salaried)"}
              disabledMessage="N/A for salaried employees"
              max={999.99}
            />
            <EditableField 
              label="Bonus Eligible" 
              value={employee.bonusEligible} 
              fieldName="bonusEligible" 
              type="select" 
              options={yesNoOptions} 
              onSave={handleSave} 
              
            />
            <EditableField 
              label="Annual Bonus Percentage Target" 
              value={employee.annualBonusPercentageTarget} 
              fieldName="annualBonusPercentageTarget" 
              type="percentage"
              onSave={handleSave} 
             
              max={999.99}
            />
          </div>
          {/* Row 2: Last Performance Review, Performance Review Rating, Last Merit Increase, Last Merit Increase Amount */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <EditableField 
              label="Last Performance Review" 
              value={employee.lastPerformanceReviewDate?.toString()} 
              fieldName="lastPerformanceReviewDate" 
              type="date" 
              onSave={handleSave} 
              
            />
            <EditableField 
              label="Performance Review Rating" 
              value={employee.lastPerformanceReviewRating} 
              fieldName="lastPerformanceReviewRating" 
              type="rating"
              onSave={handleSave} 
             
              max={5}
            />
            <EditableField 
              label="Last Merit Increase" 
              value={employee.lastMeritIncrease?.toString()} 
              fieldName="lastMeritIncrease" 
              type="date" 
              onSave={handleSave} 
              
            />
            <EditableField 
              label="Last Merit Increase Amount" 
              value={employee.lastMeritIncreaseAmount?.toString()} 
              fieldName="lastMeritIncreaseAmount" 
              type="currency" 
              onSave={handleSave} 
             
              max={99999.99}
            />
          </div>
        </CardContent>
      </Card>
      )}

      <AbsenceRiskCard employeeId={employee.id} department={employee.department} />
      <EmployeeLeaveManagement employeeId={employee.id} />

      {/* ── Onboarding Section (driver-employees only) ── */}
      {driverLinked && (
        <Card id="onboarding-section" data-testid="card-onboarding-section">
          <CardHeader className="flex flex-row items-center gap-2 flex-wrap space-y-0 pb-4">
            <div className="flex items-center gap-2 flex-1">
              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
              <div>
                <CardTitle>Onboarding</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Track onboarding progress for this driver-employee. Shared fields come from the Driver record.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onboardingData && (
                <Select
                  value={onboardingStatus}
                  onValueChange={(v) => updateStatusMutation.mutate(v)}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger className="w-44" data-testid="select-onboarding-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ONBOARDING_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {onboardingLoading ? (
              <div className="space-y-3">
                <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
              </div>
            ) : !onboardingData || onboardingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No onboarding checklist yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
                  The onboarding checklist is created automatically when an employee record is linked to a Driver. You can also create it manually.
                </p>
                <Button
                  onClick={() => seedOnboardingMutation.mutate()}
                  disabled={seedOnboardingMutation.isPending}
                  data-testid="button-seed-onboarding"
                >
                  {seedOnboardingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardList className="h-4 w-4 mr-2" />}
                  Create Onboarding Checklist
                </Button>
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{onboardingProgress?.completed ?? 0} of {onboardingProgress?.total ?? 0} items complete</span>
                    <span className="font-medium">
                      {onboardingProgress && onboardingProgress.total > 0
                        ? Math.round((onboardingProgress.completed / onboardingProgress.total) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{
                        width: `${onboardingProgress && onboardingProgress.total > 0
                          ? Math.round((onboardingProgress.completed / onboardingProgress.total) * 100)
                          : 0}%`,
                      }}
                      data-testid="bar-onboarding-progress"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-xs ${ONBOARDING_STATUS_COLORS[onboardingStatus] || ""}`} data-testid="badge-onboarding-status">
                      {ONBOARDING_STATUS_OPTIONS.find((o) => o.value === onboardingStatus)?.label ?? onboardingStatus}
                    </Badge>
                    {onboardingData?.onboardingStartedAt && (
                      <span className="text-xs text-muted-foreground">
                        Started {new Date(onboardingData.onboardingStartedAt).toLocaleDateString()}
                      </span>
                    )}
                    {onboardingData?.onboardingCompletedAt && (
                      <span className="text-xs text-muted-foreground">
                        Completed {new Date(onboardingData.onboardingCompletedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Checklist grouped by category */}
                {(["identity", "hr", "payroll", "documentation", "compliance"] as const).map((cat) => {
                  const catItems = onboardingItems.filter((item: any) => item.category === cat);
                  if (catItems.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {ONBOARDING_CATEGORY_LABELS[cat] ?? cat}
                      </p>
                      <div className="space-y-1.5">
                        {catItems.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 rounded-md p-2.5 hover-elevate"
                            data-testid={`row-onboarding-item-${item.id}`}
                          >
                            <button
                              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                              onClick={() =>
                                item.completed
                                  ? item.autoCompleted
                                    ? undefined
                                    : uncompleteItemMutation.mutate(item.id)
                                  : completeItemMutation.mutate(item.id)
                              }
                              disabled={item.autoCompleted || completeItemMutation.isPending || uncompleteItemMutation.isPending}
                              title={item.autoCompleted ? "Auto-completed by system" : item.completed ? "Click to uncheck" : "Click to complete"}
                              data-testid={`button-onboarding-toggle-${item.id}`}
                            >
                              {item.completed ? (
                                <CheckCircle2 className={`h-4 w-4 ${item.autoCompleted ? "text-muted-foreground" : "text-primary"}`} />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm ${item.completed ? "line-through text-muted-foreground" : "font-medium"}`}>
                                  {item.label}
                                </span>
                                {!item.required && (
                                  <Badge variant="outline" className="text-[10px]">Optional</Badge>
                                )}
                                {item.autoCompleted && (
                                  <Badge variant="secondary" className="text-[10px]">Auto</Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                              )}
                              {item.completed && item.completedAt && !item.autoCompleted && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Completed {new Date(item.completedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>
      )}

        </div>{/* end left col */}

        {/* ── Right column: Driver Profile widget ── */}
        <div className="space-y-4">
          {/* Driver Profile widget — always visible for driver-linked employees */}
          {driverLinked ? (
            linkedDriverId && linkedDriver ? (
              <Card data-testid="card-driver-profile-widget">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Driver Record (Source of Truth)</p>
                      <CardTitle className="text-sm mt-0.5">Driver Profile</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Source of truth callout */}
                  <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-2.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800 dark:text-blue-300">Core fields managed from Driver record</p>
                  </div>

                  {/* Driver fields */}
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Driver Name</p>
                      <p className="text-sm font-medium" data-testid="text-widget-driver-name">
                        {linkedDriver.user
                          ? `${linkedDriver.user.firstName ?? ""} ${linkedDriver.user.lastName ?? ""}`.trim() || "—"
                          : `${linkedDriver.firstName ?? ""} ${linkedDriver.lastName ?? ""}`.trim() || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Driver Status</p>
                      <StatusBadge status={linkedDriver.status ?? "unknown"} data-testid="badge-widget-driver-status" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Worker Type</p>
                      <p className="text-sm" data-testid="text-widget-worker-type">Employee Driver</p>
                    </div>
                    {linkedDriver.classification && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Classification</p>
                        <p className="text-sm" data-testid="text-widget-classification">{linkedDriver.classification}</p>
                      </div>
                    )}
                    {driverSyncedAt && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Last Synced</p>
                        <p className="text-xs text-muted-foreground" data-testid="text-widget-last-synced">
                          {new Date(driverSyncedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  <Link href={`/drivers/${linkedDriverId}`}>
                    <Button variant="outline" size="default" className="w-full" data-testid="button-widget-view-driver">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      View Driver Record
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : linkedDriverId ? (
              /* Broken link — driver ID exists but record not found */
              <Card data-testid="card-driver-profile-widget-broken">
                <CardHeader className="pb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Driver Record (Source of Truth)</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 rounded-md bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-800 dark:text-yellow-300">Linked record missing or inaccessible</p>
                  </div>
                  <Link href={`/drivers/${linkedDriverId}`}>
                    <Button variant="outline" size="default" className="w-full" data-testid="button-widget-relink-driver">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Relink Record
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : null
          ) : null}
        </div>{/* end right col */}

      </div>{/* end grid */}
    </div>
  );
}

interface FlaggedPattern {
  rule: string;
  triggered: boolean;
  score: number;
  evidence: string;
  window: string;
}

interface AbsenceRiskData {
  employeeId: string;
  riskScore: number;
  flaggedPatterns: FlaggedPattern[];
  lastUpdated: string;
}

interface MarketIndicatorData {
  market: string;
  activeEmployees: number;
  sickRequestCount: number;
  absenceRate: number;
  threshold: number;
  exceeds: boolean;
}

const RULE_LABELS: Record<string, string> = {
  monday_friday_sick: "Monday/Friday Sick Pattern",
  holiday_adjacent_sick: "Holiday-Adjacent Sick Day",
  last_minute_requests: "Last-Minute Requests",
  sick_exceeds_accrual: "Sick Usage Exceeds Accrual",
  market_absence_rate: "Department Absence Rate",
};

function getRiskColor(score: number): string {
  if (score >= 60) return "destructive";
  if (score >= 40) return "secondary";
  return "outline";
}

function getRiskLabel(score: number): string {
  if (score >= 60) return "High Risk";
  if (score >= 40) return "Medium Risk";
  if (score >= 20) return "Low Risk";
  return "No Risk";
}

function AbsenceRiskCard({ employeeId, department }: { employeeId: string; department: string | null }) {
  const { toast } = useToast();

  const { data: riskData, isLoading } = useQuery<AbsenceRiskData>({
    queryKey: ["/api/corporate/absence-risk", employeeId],
  });

  const { data: marketData } = useQuery<MarketIndicatorData>({
    queryKey: ["/api/corporate/absence-risk/market", department],
    enabled: !!department,
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/corporate/absence-risk/recalculate", { employeeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/absence-risk", employeeId] });
      if (department) {
        queryClient.invalidateQueries({ queryKey: ["/api/corporate/absence-risk/market", department] });
      }
      toast({ title: "Risk score recalculated" });
    },
    onError: () => {
      toast({ title: "Failed to recalculate", variant: "destructive" });
    },
  });

  const triggeredFlags = riskData?.flaggedPatterns?.filter((f) => f.triggered) || [];
  const score = riskData?.riskScore ?? 0;

  return (
    <Card id="absence-risk-section" data-testid="card-absence-risk">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <CardTitle>Absence Risk Monitor</CardTitle>
        <Badge variant={getRiskColor(score) as any} className="ml-2" data-testid="badge-risk-score">
          {isLoading ? "..." : `${score}/100 - ${getRiskLabel(score)}`}
        </Badge>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            data-testid="button-recalculate-risk"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
            Recalculate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div>
              <h4 className="text-sm font-medium mb-2">Flagged Patterns</h4>
              {riskData?.flaggedPatterns && riskData.flaggedPatterns.length > 0 ? (
                <div className="space-y-2">
                  {riskData.flaggedPatterns.map((flag, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                        flag.triggered ? "bg-destructive/10" : "bg-muted/50"
                      }`}
                      data-testid={`flag-pattern-${flag.rule}`}
                    >
                      {flag.triggered ? (
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">
                          {RULE_LABELS[flag.rule] || flag.rule}
                          {flag.triggered && (
                            <Badge variant="destructive" className="ml-2 text-xs">
                              +{flag.score}
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs mt-0.5">{flag.evidence}</div>
                        <div className="text-muted-foreground text-xs">{flag.window}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-no-flags">No patterns evaluated yet</p>
              )}
            </div>

            {marketData && department && (
              <div data-testid="market-indicator">
                <h4 className="text-sm font-medium mb-2">Department Absence Indicator</h4>
                <div className="p-3 rounded-md bg-muted/50 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{department}</span>
                    <Badge variant={marketData.exceeds ? "destructive" : "outline"} data-testid="badge-market-rate">
                      {(marketData.absenceRate * 100).toFixed(1)}% rate
                    </Badge>
                    {marketData.exceeds && (
                      <span className="text-destructive text-xs">Exceeds {(marketData.threshold * 100).toFixed(0)}% threshold</span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs mt-1">
                    {marketData.sickRequestCount} sick request(s) across {marketData.activeEmployees} active employee(s) in last 60 days
                  </div>
                </div>
              </div>
            )}

            {riskData?.lastUpdated && (
              <div className="text-xs text-muted-foreground" data-testid="text-last-updated">
                Last updated: {new Date(riskData.lastUpdated).toLocaleString()}
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-2">
              This system flags patterns only. No automated discipline actions are taken.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
