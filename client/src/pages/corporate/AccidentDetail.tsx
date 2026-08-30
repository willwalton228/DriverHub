import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAttachmentDialog } from "@/components/DeleteAttachmentDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate, formatDateTime, parseFormDate, todayDateString } from "@/lib/dateFormat";
import type { AccidentWithDetails, AccidentAttachment, Customer, DriverWithUser, AttachmentCategory } from "@shared/schema";
import {
  claimExecutionSystemLegacyValueLabels,
  claimExecutionSystemOptions,
  claimIncidentTypeOptions,
  claimResolutionStatusOptions,
  validateIncidentDate,
  ATTACHMENT_SOURCE_LABELS,
  ATTACHMENT_FLAG_LABELS,
  attachmentFlagEnum,
  type AttachmentFlag,
} from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DirectFileUploader } from "@/components/DirectFileUploader";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Calendar,
  FileText,
  Shield,
  DollarSign,
  User,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  FileImage,
  File,
  Pencil,
  Check,
  X,
  Hash,
  Ticket,
  ClipboardList,
  Building2,
  MessageCircle,
  Plus,
  History,
  Truck,
  ExternalLink,
  AlertOctagon,
  Ambulance,
  Car,
  Bell,
  RefreshCw,
  GraduationCap,
  ShieldAlert,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
  Unlock,
  Scale,
  FileDown,
  MailWarning,
  FlaskConical,
  Send,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Save,
  StickyNote,
  Circle,
  ChevronsUpDown,
  UserSearch,
  Search,
  Flag,
  ShieldCheck,
  Camera,
  AlertCircle,
  Package,
  Upload,
  Tag,
  Maximize2,
  Minimize2,
  Film,
  Wrench,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ClaimStatusBadge } from "@/components/ClaimStatusBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ClaimWorkflowPanel } from "@/components/ClaimTransitionDialog";
import { ClaimAlertsPanel } from "@/components/claims/ClaimAlertsPanel";
import { ClaimNarrativeCard } from "@/components/claims/ClaimNarrativeCard";
import { RecordHeader } from "@/components/RecordHeader";
import { TimelinePanel, TimelineEvent } from "@/components/claims/TimelinePanel";
import { ActiveSafetyFlagsBadges } from "@/components/DriverSafetyFlags";
import { EvidenceChainViewer } from "@/components/EvidenceChainViewer";
import { CarrierSubmissionPanel } from "@/components/claims/CarrierSubmissionPanel";
import { ClaimPhotoGallery, EvidenceDocumentList } from "@/components/claims/ClaimPhotoGallery";
import { ClaimSummaryPanel } from "@/components/claims/ClaimSummaryPanel";
import { ClaimIntelligencePanel, computeClaimIntelligence } from "@/components/claims/ClaimIntelligencePanel";
import { ClaimContextCard } from "@/components/claims/ClaimContextCard";
import { PacketPreviewModal } from "@/components/claims/PacketPreviewModal";
import { AutoLossReportModal } from "@/components/claims/AutoLossReportModal";
import { ClaimQuickActionsBar } from "@/components/claims/ClaimQuickActionsBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return <FileImage className="h-5 w-5 text-muted-foreground" />;
  }
  if (fileType === "application/pdf") {
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  }
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => void;
  type?: "text" | "currency" | "percent" | "date" | "textarea";
  isSaving?: boolean;
  maxLength?: number;
  required?: boolean;
  labelBadge?: React.ReactNode;
}

function EditableField({ label, value, fieldName, onSave, type = "text", isSaving, maxLength, required, labelBadge }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [isFlashing, setIsFlashing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync editValue with value prop when it changes (after successful save)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value || "");
    }
  }, [value, isEditing]);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, []);
  
  const { toast } = useToast();
  const handleSave = () => {
    if (editValue !== (value || "")) {
      if (type === "date") {
        const dateCheck = validateIncidentDate(editValue);
        if (!dateCheck.valid) {
          toast({ title: "Invalid date", description: dateCheck.error, variant: "destructive" });
          return;
        }
      }
      onSave(fieldName, editValue);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setIsFlashing(true);
      flashTimerRef.current = setTimeout(() => setIsFlashing(false), 2200);
    }
    setIsEditing(false);
  };
  
  const handleCancel = () => {
    setEditValue(value || "");
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setIsFlashing(false);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setIsEditing(true);
  };
  
  const formatDisplay = () => {
    if (!value) return "—";
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return `${value}%`;
    if (type === "date") return formatDate(value);
    return value;
  };
  
  if (isEditing) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground flex items-center flex-wrap gap-x-0.5">
          {label}{required && <span className="text-red-500 ml-0.5" title="Required field">*</span>}{labelBadge}
        </p>
        <div className="flex items-center gap-2">
          {type === "textarea" ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[80px]"
              data-testid={`input-edit-${fieldName}`}
            />
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type === "date" ? "date" : type === "currency" || type === "percent" ? "number" : "text"}
              value={editValue}
              onChange={(e) => {
                const newValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
                setEditValue(newValue);
              }}
              step={type === "currency" ? "0.01" : type === "percent" ? "1" : undefined}
              max={type === "date" ? todayDateString() : undefined}
              maxLength={maxLength}
              className="h-8"
              data-testid={`input-edit-${fieldName}`}
            />
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid={`button-save-${fieldName}`}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} data-testid={`button-cancel-${fieldName}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div data-testid={`field-${fieldName}`}>
      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center flex-wrap gap-x-0.5">
        {label}{required && <span className="text-red-500 ml-0.5" title="Required field">*</span>}{labelBadge}
      </p>
      <div
        className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm cursor-pointer hover-elevate items-center group${isFlashing ? " field-saved-flash" : ""}`}
        onClick={handleStartEdit}
        data-testid={`field-display-${fieldName}`}
      >
        <span className={`flex-1 truncate ${!value ? "text-muted-foreground" : "text-foreground font-normal"}`}>{value ? formatDisplay() : "—"}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground ml-2 flex-shrink-0" />
      </div>
    </div>
  );
}

interface SelectableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onSave: (fieldName: string, value: string) => void;
  isSaving?: boolean;
  required?: boolean;
  labelBadge?: React.ReactNode;
  legacyValueLabels?: Record<string, string>;
}

function SelectableField({
  label,
  value,
  fieldName,
  options,
  onSave,
  isSaving,
  required,
  labelBadge,
  legacyValueLabels,
}: SelectableFieldProps) {
  const hasOptionForCurrentValue = !!value && options.some((option) => option.value === value);
  const legacyValueLabel = value && !hasOptionForCurrentValue
    ? legacyValueLabels?.[value] ?? value
    : null;

  return (
    <div data-testid={`field-${fieldName}`}>
      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center flex-wrap gap-x-0.5">
        {label}{required && <span className="text-red-500 ml-0.5" title="Required field">*</span>}{labelBadge}
      </p>
      <Select
        value={value || ""}
        onValueChange={(val) => onSave(fieldName, val)}
        disabled={isSaving}
      >
        <SelectTrigger
          className="h-9 bg-background"
          data-testid={`select-${fieldName}`}
        >
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {legacyValueLabel && value && (
            <SelectItem value={value} disabled>
              {legacyValueLabel}
            </SelectItem>
          )}
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Read-Only Field ──────────────────────────────────────────────────────────
// Displays system-generated / computed data. Grey box = cannot be edited.

function ReadOnlyField({
  label,
  value,
  testId,
  valueClass,
}: {
  label: string;
  value: string | null | undefined;
  testId?: string;
  valueClass?: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">{label}</p>
      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center cursor-default select-text">
        <span className={`flex-1 truncate ${valueClass ?? "text-foreground"}`}>{value || "—"}</span>
      </div>
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: boolean) => void;
  isSaving?: boolean;
}

function ToggleField({ label, value, fieldName, onSave, isSaving }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between" data-testid={`field-${fieldName}`}>
      <p className="text-sm font-medium">{label}</p>
      <Switch 
        checked={!!value} 
        onCheckedChange={(checked) => onSave(fieldName, checked)}
        disabled={isSaving}
        data-testid={`switch-${fieldName}`}
      />
    </div>
  );
}

// ─── Field Requirement Badge ──────────────────────────────────────────────────
type FieldReqStatus = 'required' | 'conditional' | 'optional' | 'not_applicable';
interface FieldReq { status: FieldReqStatus; reason?: string; }

function FieldReqBadge({
  status,
  reason,
  inline = false,
}: {
  status?: FieldReqStatus;
  reason?: string;
  inline?: boolean;
}) {
  if (!status || status === 'optional') return null;

  if (status === 'not_applicable') {
    return (
      <span
        className="ml-1 inline-flex items-center text-[9px] font-medium text-muted-foreground leading-none"
        data-testid="badge-field-not-applicable"
      >
        Not Required — No Police Involvement
      </span>
    );
  }

  if (inline && reason) {
    // Inline mode: show the reason text visibly next to the field label
    if (status === 'required') {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive/80 leading-none"
          data-testid="badge-field-required-inline"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 flex-shrink-0" />
          {reason}
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground leading-none"
        data-testid="badge-field-conditional-inline"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
        {reason}
      </span>
    );
  }

  // Default mode: compact label with reason as tooltip
  if (status === 'required') {
    return (
      <span
        className="ml-1 inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-destructive leading-none"
        data-testid="badge-field-required"
        title={reason || 'Required before claim submission'}
      >
        Required
      </span>
    );
  }
  return (
    <span
      className="ml-1 inline-flex items-center text-[9px] font-normal text-muted-foreground leading-none"
      data-testid="badge-field-conditional"
      title={reason || 'May be required depending on claim details'}
    >
      Conditional
    </span>
  );
}

// ─── Shared severity helper (single source of truth used by gating, readiness card, and hook) ────
// Returns true when any severity field indicates major/catastrophic severity.
// Uses OR across both fields to prevent conflicting states when fields disagree.
function deriveMajorSeverity(accident: any): boolean {
  const est = (accident?.severityEstimate || '').toLowerCase();
  const raw = ((accident?.claimSeverity || '') as string).toUpperCase();
  return raw === 'HIGH' || raw === 'CRITICAL' ||
         est === 'major' || est === 'catastrophic';
}

// ─── Field Requirement Hook ───────────────────────────────────────────────────
function useClaimFieldRequirements(accident: any): Record<string, FieldReq> {
  return useMemo(() => {
    const cat   = accident?.claimCategory || '';
    const fault = accident?.liabilityFault || '';
    const noPoliceInvolvement = !!accident?.policeReportWaived;

    const isInsuranceClaim = cat === 'insurance_claim';
    const isMajorSeverity  = deriveMajorSeverity(accident);
    const isAtFault        = fault === 'at_fault' || fault === 'shared_fault';
    const isNotAtFault     = fault === 'not_at_fault';
    const reqPhotos        = isMajorSeverity ? 3 : 1;

    return {
      scene_photos:          { status: 'required',     reason: isMajorSeverity ? `${reqPhotos}+ scene photos required for major severity` : '1+ scene photo required' },
      vehicle_damage_photos: { status: 'required',     reason: 'Vehicle damage documentation required' },
      accident_report:       noPoliceInvolvement
        ? { status: 'not_applicable', reason: 'Not Required — No Police Involvement' }
        : { status: 'required', reason: 'Exchange of driver info / accident report required' },
      police_report:         noPoliceInvolvement
        ? { status: 'not_applicable', reason: 'Not Required — No Police Involvement' }
        : isInsuranceClaim
          ? { status: 'required',     reason: 'Required for Carrier Claims' }
          : { status: 'conditional',  reason: 'Required if Claim Type is Insurance / Carrier' },
      driver_statement:      isMajorSeverity
        ? { status: 'required',     reason: 'Required for Major Severity Claims' }
        : { status: 'conditional',  reason: 'Required if severity is Major or higher' },
      driverRemediation:     isAtFault
        ? { status: 'required',     reason: 'Required for At Fault claims' }
        : { status: 'conditional',  reason: 'Required if liability is At Fault or Shared' },
      thirdPartyInfo:        isNotAtFault
        ? { status: 'required',     reason: 'Required for Not At Fault claims' }
        : { status: 'conditional',  reason: 'Required if liability is Not At Fault' },
    };
  }, [accident?.claimCategory, accident?.severityEstimate, accident?.claimSeverity, accident?.liabilityFault, accident?.policeReportWaived]);
}

function getMonthName(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleString("en-US", { month: "long" });
}

function getFullYear(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date).getFullYear().toString();
}

function formatDateMMDDYYYY(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

interface TimestampedComment {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
}

interface CommentsSectionProps {
  title: string;
  accidentId: string;
  comments: TimestampedComment[];
  onAddComment: (comment: string) => void;
  isSaving?: boolean;
  testIdPrefix: string;
}

function CommentsSection({ title, accidentId, comments, onAddComment, isSaving, testIdPrefix }: CommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when Add Comment is clicked
  useEffect(() => {
    if (isAdding && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAdding]);

  const handleAddComment = () => {
    if (newComment.trim()) {
      onAddComment(newComment.trim().substring(0, 60));
      setNewComment("");
      setIsAdding(false);
    }
  };

  // Show only first 2 comments unless "See All" is clicked
  const visibleComments = showAll ? comments : comments.slice(0, 2);
  const hasMoreComments = comments.length > 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          {title}
        </p>
        {!isAdding && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAdding(true)}
            data-testid={`button-add-${testIdPrefix}-comment`}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Comment
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/30">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value.substring(0, 60))}
            placeholder="Enter comment (max 60 characters)..."
            maxLength={60}
            className="min-h-[60px]"
            data-testid={`textarea-${testIdPrefix}-comment`}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{newComment.length}/60 characters</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNewComment("");
                  setIsAdding(false);
                }}
                data-testid={`button-cancel-${testIdPrefix}-comment`}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={!newComment.trim() || isSaving}
                data-testid={`button-save-${testIdPrefix}-comment`}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {comments && comments.length > 0 ? (
        <div className="space-y-2">
          {visibleComments.map((comment, index) => (
            <div
              key={comment.id}
              className="p-3 border border-border rounded-lg bg-card"
              data-testid={`${testIdPrefix}-comment-${index}`}
            >
              <p className="text-sm">{comment.text}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {comment.createdBy} • {formatDateTime(comment.createdAt)}
              </p>
            </div>
          ))}
          {hasMoreComments && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-primary"
              onClick={() => setShowAll(true)}
              data-testid={`button-see-all-${testIdPrefix}-comments`}
            >
              See All Comments ({comments.length - 2} more)
            </Button>
          )}
          {showAll && hasMoreComments && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowAll(false)}
              data-testid={`button-show-less-${testIdPrefix}-comments`}
            >
              Show Less
            </Button>
          )}
        </div>
      ) : !isAdding ? (
        <p className="text-sm text-muted-foreground italic">No comments yet</p>
      ) : null}
    </div>
  );
}

// InsuranceCommentsSection wraps CommentsSection for backward compatibility
function InsuranceCommentsSection({ accidentId, comments, onAddComment, isSaving }: { accidentId: string; comments: TimestampedComment[]; onAddComment: (comment: string) => void; isSaving?: boolean }) {
  return (
    <CommentsSection
      title="Ins Comments"
      accidentId={accidentId}
      comments={comments}
      onAddComment={onAddComment}
      isSaving={isSaving}
      testIdPrefix="ins"
    />
  );
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any }> = {
  // Original categories
  accident_report: { label: "Accident Report / Exchange of Driver Info", icon: FileText },
  traffic_citations: { label: "Traffic Citations Issued", icon: Ticket },
  vehicle_towing: { label: "Vehicle Towing", icon: Truck },
  video_photos: { label: "Video / Photos", icon: FileImage },
  general: { label: "General Attachments", icon: Paperclip },
  // New claim document categories
  scene_photos: { label: "Scene Photos", icon: FileImage },
  vehicle_damage_photos: { label: "Vehicle Damage Photos", icon: FileImage },
  driver_photos: { label: "Driver Photos", icon: FileImage },
  police_report: { label: "Police Report", icon: FileText },
  insurance_claim_form: { label: "Insurance Claim Form", icon: FileText },
  customer_documentation: { label: "Customer Documentation", icon: FileText },
  repair_estimate: { label: "Repair Estimate", icon: FileText },
  invoice_receipt: { label: "Invoice / Receipt", icon: FileText },
  video: { label: "Video", icon: FileImage },
  other: { label: "Other", icon: Paperclip },
  driver_statement: { label: "Driver Statement", icon: FileText },
};

const CATEGORY_ORDER: string[] = [
  "scene_photos",
  "vehicle_damage_photos",
  "driver_photos",
  "police_report",
  "driver_statement",
  "accident_report",
  "insurance_claim_form",
  "customer_documentation",
  "repair_estimate",
  "invoice_receipt",
  "video",
  "traffic_citations",
  "vehicle_towing",
  "video_photos",
  "other",
  "general",
];

/** Categories that should only accept image/video files on drag-and-drop */
const PHOTO_CAT_SET = new Set([
  "scene_photos",
  "vehicle_damage_photos",
  "driver_photos",
  "video_photos",
  "video",
]);

/** Inline file reader for drag-and-drop in category sections */
function readCategoryFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

interface CategorySectionProps {
  category: string;
  attachments: AccidentAttachment[];
  categoryMetaRecord: any;
  onSaveMeta: (data: { category: string; metadata: any; notes: string | null }) => void;
  isSavingMeta: boolean;
  onUploadComplete: (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }, category: string) => void;
  onReplace: (attachmentId: string) => void;
  onDelete: (attachmentId: string) => void;
  onRequestOverride: (attachmentId: string, fileName: string) => void;
  isDeleting: boolean;
  replacingAttachmentId: string | null;
  onReplaceComplete: (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }) => void;
  onCancelReplace: () => void;
  claimStatus: string;
  isLitigationHeld: boolean;
  isEvidenceLocked: boolean;
  canDelete: boolean;
  accidentId: string;
  reqStatus?: FieldReqStatus;
  reqReason?: string;
  enrichedById?: Record<string, any>;
}

function CategorySection({
  category,
  attachments,
  categoryMetaRecord,
  onSaveMeta,
  isSavingMeta,
  onUploadComplete,
  onReplace,
  onDelete,
  onRequestOverride,
  isDeleting,
  replacingAttachmentId,
  onReplaceComplete,
  onCancelReplace,
  claimStatus,
  isLitigationHeld,
  isEvidenceLocked,
  canDelete,
  accidentId,
  reqStatus,
  reqReason,
  enrichedById = {},
}: CategorySectionProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [notes, setNotes] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

  const flagMutation = useMutation({
    mutationFn: ({ attachmentId, flags }: { attachmentId: string; flags: string[] }) =>
      apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/attachments/${attachmentId}/flags`, { flags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'attachments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      setFlaggingId(null);
    },
    onError: () => {
      toast({ title: "Failed to update flags", variant: "destructive" });
      setFlaggingId(null);
    },
  });

  const toggleFlag = (attachment: AccidentAttachment, flag: AttachmentFlag) => {
    const current: string[] = (attachment as any).attachmentFlags ?? [];
    const updated = current.includes(flag)
      ? current.filter(f => f !== flag)
      : [...current, flag];
    setFlaggingId(attachment.id);
    flagMutation.mutate({ attachmentId: attachment.id, flags: updated });
  };

  const handleAttachmentDownload = async (attachment: AccidentAttachment & { attachmentDocumentId?: string | null }, index: number) => {
    const trackId = attachment.id || String(index);
    setDownloadingAttachmentId(trackId);

    const triggerBlob = (blob: Blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    };

    const retryFetch = async (url: string, maxAttempts = 4): Promise<Response | null> => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const resp = await fetch(url, { credentials: 'include' });
          if (resp.ok) return resp;
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 500 * attempt));
        } catch {
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
      return null;
    };

    try {
      // fileUrl is excluded from the bulk accident detail response to avoid
      // exceeding the 64 MB Neon serverless limit on claims with many/large
      // attachments. Fetch it on-demand from the dedicated URL endpoint.
      let resolvedFileUrl = attachment.fileUrl;
      if (!resolvedFileUrl) {
        const urlResp = await fetch(`/api/corporate/accidents/${accidentId}/attachments/${attachment.id}/url`, { credentials: 'include' });
        if (urlResp.ok) {
          const urlData = await urlResp.json();
          resolvedFileUrl = urlData.fileUrl;
        }
      }

      // Data URL stored directly in DB — decode without any network request
      if (resolvedFileUrl?.startsWith('data:')) {
        try {
          const [header, base64] = resolvedFileUrl.split(',');
          const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
          const bytes = atob(base64);
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          triggerBlob(new Blob([arr], { type: mime }));
        } catch {
          toast({ title: "Document failed to load", description: "The file data could not be decoded.", variant: "destructive" });
        }
        return;
      }
      if (attachment.attachmentDocumentId) {
        const resp = await retryFetch(`/api/documents/${attachment.attachmentDocumentId}/download`);
        if (resp) { triggerBlob(await resp.blob()); return; }
      }
      const rawPath = (resolvedFileUrl || '').replace(/^\//, '');
      const url = rawPath.startsWith('objects/') ? `/${rawPath}` : `/objects/${rawPath}`;
      const resp = await retryFetch(url);
      if (resp) { triggerBlob(await resp.blob()); return; }
      toast({ title: "Document failed to load", description: "The file could not be retrieved. Try again or contact support.", variant: "destructive" });
    } catch {
      toast({ title: "Document failed to load", description: "A network error occurred. Please check your connection and try again.", variant: "destructive" });
    } finally {
      setDownloadingAttachmentId(null);
    }
  };
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (categoryMetaRecord && !initialized) {
      setNotes(categoryMetaRecord.notes || "");
      setMetadata(categoryMetaRecord.metadata || {});
      setInitialized(true);
    }
  }, [categoryMetaRecord, initialized]);

  useEffect(() => {
    if (categoryMetaRecord) {
      setNotes(categoryMetaRecord.notes || "");
      setMetadata(categoryMetaRecord.metadata || {});
    }
  }, [categoryMetaRecord]);

  const config = CATEGORY_CONFIG[category];
  const IconComponent = config.icon;
  const fileCount = attachments.length;
  const isReadOnly = claimStatus === "CLOSED" || claimStatus === "DENIED";
  const mostRecentDate = attachments.length > 0
    ? attachments.reduce((latest, a) => {
        const d = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return d > latest ? d : latest;
      }, 0)
    : null;

  const handleSave = () => {
    onSaveMeta({ category, metadata, notes: notes || null });
  };

  // ── Section-level drag-and-drop ─────────────────────────────────────────────
  const isPhotoCategory = PHOTO_CAT_SET.has(category);
  const [sectionIsDragging, setSectionIsDragging] = useState(false);
  const [sectionIsUploading, setSectionIsUploading] = useState(false);
  const sectionDragCounter = useRef(0);

  const handleSectionDragEnter = useCallback((e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault(); e.stopPropagation();
    sectionDragCounter.current += 1;
    if (sectionDragCounter.current === 1) setSectionIsDragging(true);
  }, [isReadOnly]);

  const handleSectionDragOver = useCallback((e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, [isReadOnly]);

  const handleSectionDragLeave = useCallback((e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault(); e.stopPropagation();
    sectionDragCounter.current -= 1;
    if (sectionDragCounter.current === 0) setSectionIsDragging(false);
  }, [isReadOnly]);

  const handleSectionDrop = useCallback(async (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault(); e.stopPropagation();
    sectionDragCounter.current = 0;
    setSectionIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const catLabel = CATEGORY_CONFIG[category]?.label || category;

    if (isPhotoCategory) {
      const nonImages = files.filter((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));
      if (nonImages.length) {
        toast({
          title: "Wrong file type",
          description: `Only image files can be uploaded to ${catLabel}. Use a document category for PDFs.`,
          variant: "destructive",
        });
        return;
      }
    } else {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length) {
        toast({
          title: "Wrong file type",
          description: `Image files should go in a Photos category, not ${catLabel}. Drop images into Scene Photos, Vehicle Damage Photos, or Driver Photos instead.`,
          variant: "destructive",
        });
        return;
      }
    }

    const oversized = files.filter((f) => f.size > 26214400);
    if (oversized.length) {
      toast({ title: "File too large", description: `Max 25 MB per file. Skipped: ${oversized.map((f) => f.name).join(", ")}`, variant: "destructive" });
    }
    const valid = files.filter((f) => f.size <= 26214400);
    if (!valid.length) return;

    setSectionIsUploading(true);
    try {
      for (const file of valid) {
        const dataUrl = await readCategoryFile(file);
        await onUploadComplete({ objectPath: dataUrl, fileName: file.name, fileType: file.type, fileSize: file.size }, category);
      }
      toast({ title: valid.length === 1 ? "File uploaded" : `${valid.length} files uploaded`, description: `Added to ${catLabel}.` });
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSectionIsUploading(false);
    }
  }, [isReadOnly, isPhotoCategory, category, onUploadComplete, toast]);

  const updateMetadata = (key: string, value: string) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };

  const renderMetadataFields = () => {
    switch (category) {
      case "accident_report":
        return (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-sm text-muted-foreground">Document Type</Label>
              <Select value={metadata.documentType || ""} onValueChange={(val) => updateMetadata("documentType", val)}>
                <SelectTrigger data-testid={`select-${category}-documentType`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accident_report">Accident Report</SelectItem>
                  <SelectItem value="exchange_of_info">Exchange of Info</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "traffic_citations":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm text-muted-foreground">Citation Issued</Label>
              <Select value={metadata.citationIssued || ""} onValueChange={(val) => updateMetadata("citationIssued", val)}>
                <SelectTrigger data-testid={`select-${category}-citationIssued`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Citation Number</Label>
              <Input
                value={metadata.citationNumber || ""}
                onChange={(e) => updateMetadata("citationNumber", e.target.value)}
                placeholder="Citation #"
                data-testid={`input-${category}-citationNumber`}
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Issuing Agency</Label>
              <Input
                value={metadata.issuingAgency || ""}
                onChange={(e) => updateMetadata("issuingAgency", e.target.value)}
                placeholder="Agency name"
                data-testid={`input-${category}-issuingAgency`}
              />
            </div>
          </div>
        );
      case "vehicle_towing":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Towed?</Label>
              <Select value={metadata.towed || ""} onValueChange={(val) => updateMetadata("towed", val)}>
                <SelectTrigger data-testid={`select-${category}-towed`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Vehicle 1</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Input value={metadata.v1Year || ""} onChange={(e) => updateMetadata("v1Year", e.target.value)} placeholder="Year" data-testid={`input-${category}-v1Year`} />
                <Input value={metadata.v1Color || ""} onChange={(e) => updateMetadata("v1Color", e.target.value)} placeholder="Color" data-testid={`input-${category}-v1Color`} />
                <Input value={metadata.v1Make || ""} onChange={(e) => updateMetadata("v1Make", e.target.value)} placeholder="Make" data-testid={`input-${category}-v1Make`} />
                <Input value={metadata.v1Model || ""} onChange={(e) => updateMetadata("v1Model", e.target.value)} placeholder="Model" data-testid={`input-${category}-v1Model`} />
                <Input value={metadata.v1Vin || ""} onChange={(e) => updateMetadata("v1Vin", e.target.value)} placeholder="VIN" data-testid={`input-${category}-v1Vin`} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Vehicle 2</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Input value={metadata.v2Year || ""} onChange={(e) => updateMetadata("v2Year", e.target.value)} placeholder="Year" data-testid={`input-${category}-v2Year`} />
                <Input value={metadata.v2Color || ""} onChange={(e) => updateMetadata("v2Color", e.target.value)} placeholder="Color" data-testid={`input-${category}-v2Color`} />
                <Input value={metadata.v2Make || ""} onChange={(e) => updateMetadata("v2Make", e.target.value)} placeholder="Make" data-testid={`input-${category}-v2Make`} />
                <Input value={metadata.v2Model || ""} onChange={(e) => updateMetadata("v2Model", e.target.value)} placeholder="Model" data-testid={`input-${category}-v2Model`} />
                <Input value={metadata.v2Vin || ""} onChange={(e) => updateMetadata("v2Vin", e.target.value)} placeholder="VIN" data-testid={`input-${category}-v2Vin`} />
              </div>
            </div>
          </div>
        );
      case "video_photos":
        return (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-sm text-muted-foreground">Media Type</Label>
              <Select value={metadata.mediaType || ""} onValueChange={(val) => updateMetadata("mediaType", val)}>
                <SelectTrigger data-testid={`select-${category}-mediaType`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`relative rounded-lg transition-colors duration-150 ${sectionIsDragging ? "ring-2 ring-primary" : ""}`}
      onDragEnter={handleSectionDragEnter}
      onDragOver={handleSectionDragOver}
      onDragLeave={handleSectionDragLeave}
      onDrop={handleSectionDrop}
      data-testid={`category-section-${category}`}
    >
      {/* Drag overlay — visibility toggled, no layout shift */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg pointer-events-none transition-opacity duration-150"
        style={{ visibility: sectionIsDragging ? "visible" : "hidden", opacity: sectionIsDragging ? 1 : 0, background: "hsl(var(--primary) / 0.07)" }}
        data-testid={`drag-overlay-${category}`}
      >
        <Upload className="h-7 w-7 text-primary" />
        <p className="text-sm font-semibold text-primary">Drop {isPhotoCategory ? "photos" : "files"} here</p>
        <p className="text-xs text-primary/70">→ {config.label}</p>
      </div>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 cursor-pointer">
            <div className="flex items-center gap-3 flex-wrap">
              <IconComponent className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">{config.label}</span>
              <FieldReqBadge status={reqStatus} reason={reqReason} inline />
              <Badge variant="secondary" className="text-xs">
                {fileCount} {fileCount === 1 ? "file" : "files"}
              </Badge>
              {mostRecentDate && (
                <span className="text-xs text-muted-foreground">
                  Last upload: {formatDateTime(new Date(mostRecentDate).toISOString())}
                </span>
              )}
            </div>
            <div className="flex-shrink-0">
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-3">
              {renderMetadataFields()}
              <div>
                <Label className="text-sm text-muted-foreground">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 10000))}
                  placeholder="Add notes..."
                  className="min-h-[60px]"
                  maxLength={10000}
                  data-testid={`textarea-${category}-notes`}
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${notes.length >= 9500 ? "text-destructive" : "text-muted-foreground"}`} data-testid={`text-${category}-notes-count`}>
                    {notes.length.toLocaleString()} / 10,000
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSavingMeta || notes.length > 10000}
                data-testid={`button-save-${category}-meta`}
              >
                {isSavingMeta ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>

            <Separator />

            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((attachment: AccidentAttachment, index: number) => (
                  <div
                    key={attachment.id}
                    id={`attachment-id-${attachment.id}`}
                    className="flex items-center justify-between gap-4 p-3 border border-border rounded-md"
                    data-testid={`attachment-${category}-${index}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(attachment.fileType)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate text-sm">{attachment.fileName}</p>
                          {(attachment as any).attachmentSource && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0" data-testid={`badge-source-${attachment.id}`}>
                              {ATTACHMENT_SOURCE_LABELS[(attachment as any).attachmentSource as keyof typeof ATTACHMENT_SOURCE_LABELS] || (attachment as any).attachmentSource}
                            </Badge>
                          )}
                          {((attachment as any).attachmentFlags ?? []).includes("key_evidence") && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0" data-testid={`badge-flag-key-evidence-${attachment.id}`}>
                              Key Evidence
                            </Badge>
                          )}
                          {((attachment as any).attachmentFlags ?? []).includes("insurance_required") && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0" data-testid={`badge-flag-insurance-required-${attachment.id}`}>
                              Insurance Required
                            </Badge>
                          )}
                          {((attachment as any).attachmentFlags ?? []).includes("internal_only") && (
                            <Badge variant="destructive" className="text-xs font-normal shrink-0" data-testid={`badge-flag-internal-only-${attachment.id}`}>
                              Internal Only
                            </Badge>
                          )}
                          {/* Chain of custody: lock badge */}
                          {enrichedById[attachment.id]?.isLocked && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0 text-destructive border-destructive/50" data-testid={`badge-locked-cat-${attachment.id}`}>
                              <Lock className="h-2.5 w-2.5 mr-1" />
                              Locked
                            </Badge>
                          )}
                          {/* Chain of custody: integrity flag */}
                          {(enrichedById[attachment.id]?.integrityFlags ?? []).includes("duplicate_filename") && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0" data-testid={`badge-duplicate-cat-${attachment.id}`}>
                              Duplicate filename
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.fileSize)}
                          {(attachment as any).uploaderName && ` • ${(attachment as any).uploaderName}`}
                          {attachment.createdAt && ` • ${formatDateTime(attachment.createdAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isReadOnly && (
                        <Popover>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={flaggingId === attachment.id}
                                  className={((attachment as any).attachmentFlags ?? []).length > 0 ? "text-foreground" : ""}
                                  data-testid={`button-flag-${category}-${index}`}
                                >
                                  {flaggingId === attachment.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Flag className="h-4 w-4" />}
                                </Button>
                              </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Flag attachment</TooltipContent>
                          </Tooltip>
                          <PopoverContent className="w-52 p-2" align="end">
                            <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Flag Attachment</p>
                            <div className="space-y-0.5">
                              {(attachmentFlagEnum as readonly AttachmentFlag[]).map((flag) => {
                                const active = ((attachment as any).attachmentFlags ?? []).includes(flag);
                                return (
                                  <button
                                    key={flag}
                                    type="button"
                                    disabled={flaggingId === attachment.id}
                                    onClick={() => toggleFlag(attachment, flag)}
                                    className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm text-left hover-elevate transition-colors ${active ? "font-medium" : "text-muted-foreground"}`}
                                    data-testid={`flag-option-${flag}-${attachment.id}`}
                                  >
                                    <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${active ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                                      {active && <span className="block h-2 w-2 rounded-sm bg-primary-foreground" />}
                                    </div>
                                    {ATTACHMENT_FLAG_LABELS[flag]}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={downloadingAttachmentId === (attachment.id || String(index))}
                            onClick={() => handleAttachmentDownload(attachment, index)}
                            data-testid={`button-download-${category}-${index}`}
                          >
                            {downloadingAttachmentId === (attachment.id || String(index))
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download file</TooltipContent>
                      </Tooltip>
                      {!isReadOnly && !isEvidenceLocked && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onReplace(attachment.id)}
                                data-testid={`button-replace-${category}-${index}`}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Replace file</TooltipContent>
                          </Tooltip>
                          {canDelete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onDelete(attachment.id)}
                                  disabled={isDeleting}
                                  data-testid={`button-delete-${category}-${index}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete attachment</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}
                      {isEvidenceLocked && !isReadOnly && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <ShieldAlert className="h-4 w-4 text-destructive" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isLitigationHeld ? 'Litigation hold active' : 'Evidence lock active'} — deletion requires dual approval
                            </TooltipContent>
                          </Tooltip>
                          {canDelete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onRequestOverride(attachment.id, attachment.fileName)}
                                  data-testid={`button-request-override-${category}-${index}`}
                                >
                                  <Unlock className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Request deletion override</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {replacingAttachmentId && attachments.some(a => a.id === replacingAttachmentId) && (
              <div className="border border-border rounded-md p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">Replace attachment</p>
                <DirectFileUploader
                  onUploadComplete={onReplaceComplete}
                  onError={(error) => { console.error("File replace failed:", error); }}
                  maxFiles={1}
                  maxFileSize={10485760}
                  enableCamera={true}
                  allowedFileTypes={["image/*", "application/pdf", ".doc", ".docx", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
                  claimId={accidentId}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="ghost" size="sm" onClick={onCancelReplace} data-testid={`button-cancel-replace-${category}`}>
                    Cancel Replace
                  </Button>
                </div>
              </div>
            )}

            {!isReadOnly && (
              <div>
                {showUploader ? (
                  <div className="border border-border rounded-md p-4 bg-muted/30 space-y-3">
                    <DirectFileUploader
                      onUploadComplete={(result) => onUploadComplete(result, category)}
                      onError={(error) => { console.error("File upload failed:", error); }}
                      maxFiles={5}
                      maxFileSize={10485760}
                      enableCamera={true}
                      allowedFileTypes={["image/*", "application/pdf", ".doc", ".docx", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
                      claimId={accidentId}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setShowUploader(false)} data-testid={`button-cancel-upload-${category}`}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUploader(true)}
                    data-testid={`button-add-attachment-${category}`}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add File
                  </Button>
                )}
              </div>
            )}

            {attachments.length === 0 && !showUploader && (
              <p className="text-sm text-muted-foreground italic text-center py-2">No files in this category</p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
    </div>
  );
}

function GLComplianceTraining({ accident, accidentId }: { accident: any; accidentId: string }) {
  const { toast } = useToast();

  const reviewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/gl-training-reviewed`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      toast({ title: "Training Reviewed", description: "GL handling compliance training has been marked as reviewed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to mark training as reviewed", variant: "destructive" });
    },
  });

  if (accident?.claimType !== "general_liability") return null;

  const isReviewed = accident?.glTrainingReviewed;
  const createdAt = accident?.createdAt ? new Date(accident.createdAt) : null;
  const hoursSinceCreation = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
  const showPendingBanner = !isReviewed && hoursSinceCreation > 24;

  return (
    <Card data-testid="card-gl-compliance-training">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
            isReviewed
              ? "bg-green-100 dark:bg-green-900/50"
              : "bg-muted"
          }`}>
            <GraduationCap className={`h-5 w-5 ${
              isReviewed
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }`} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">GL Handling Compliance</h3>
              {isReviewed ? (
                <span className="text-xs text-emerald-600 flex items-center gap-1" data-testid="badge-gl-training-status">
                  <CheckCircle className="h-3 w-3" /> Reviewed
                </span>
              ) : (
                <span className="text-xs text-muted-foreground" data-testid="badge-gl-training-status">Not Reviewed</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Review GL handling rules: do not contact claimant; carrier/adjuster manages communications.
            </p>
            {isReviewed && accident?.glTrainingReviewedAt && (
              <p className="text-xs text-muted-foreground" data-testid="text-gl-training-reviewed-info">
                Reviewed {formatDateTime(accident.glTrainingReviewedAt)}
              </p>
            )}
            {showPendingBanner && (
              <div className="mt-2 px-3 py-2 rounded-md bg-muted border border-border/60" data-testid="banner-gl-training-pending">
                <p className="text-xs font-medium text-muted-foreground">
                  Compliance review pending — training has not been reviewed within 24 hours of claim creation.
                </p>
              </div>
            )}
            {!isReviewed && accident.claimStatus !== "CLOSED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending}
                className="mt-2"
                data-testid="button-gl-training-reviewed"
              >
                {reviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Training Reviewed
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CarrierHandlingModeCard({ accident, accidentId, isAdmin }: { accident: any; accidentId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableReason, setDisableReason] = useState("");

  const toggleMutation = useMutation({
    mutationFn: async (data: { enabled: boolean; reason?: string }) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-handling-mode`, data);
    },
    onSuccess: (_: any, variables: { enabled: boolean; reason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      toast({
        title: variables.enabled ? "Carrier Handling Mode Enabled" : "Carrier Handling Mode Disabled",
        description: variables.enabled
          ? "Outbound communications are now locked for this claim."
          : "Outbound communications are now unlocked for this claim.",
      });
      setShowDisableDialog(false);
      setDisableReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update carrier handling mode", variant: "destructive" });
    },
  });

  if (accident?.claimType !== "general_liability") return null;

  const isEnabled = accident?.carrierHandlingMode !== false;
  const isClosed = accident?.claimStatus === "CLOSED";

  return (
    <Card data-testid="card-carrier-handling-mode">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
            isEnabled
              ? "bg-muted"
              : "bg-muted"
          }`}>
            <Shield className={`h-5 w-5 ${
              isEnabled
                ? "text-foreground"
                : "text-muted-foreground"
            }`} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">Carrier Handling Mode</h3>
              {isEnabled ? (
                <span className="text-xs font-medium flex items-center gap-1" data-testid="badge-carrier-handling-status">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              ) : (
                <span className="text-xs text-muted-foreground" data-testid="badge-carrier-handling-status">Unlocked</span>
              )}
            </div>
            {isEnabled ? (
              <p className="text-sm text-muted-foreground">
                Outbound communications to claimants and external parties are locked. The carrier/adjuster manages all communications.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Carrier Handling Mode has been disabled by an admin.
                </p>
                {accident?.carrierHandlingOverrideReason && (
                  <p className="text-xs text-muted-foreground">
                    Reason: {accident.carrierHandlingOverrideReason}
                  </p>
                )}
              </div>
            )}
            {!isClosed && isAdmin && (
              <div className="flex gap-2 mt-2">
                {isEnabled ? (
                  <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="button-disable-carrier-handling">
                        <Unlock className="h-4 w-4 mr-1" />
                        Disable (Admin Override)
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Disable Carrier Handling Mode</DialogTitle>
                        <DialogDescription>
                          Disabling Carrier Handling Mode will unlock outbound communications for this claim. A reason is required and this action will be audited.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="carrier-disable-reason">Reason (required)</Label>
                          <Textarea
                            id="carrier-disable-reason"
                            value={disableReason}
                            onChange={(e: any) => setDisableReason(e.target.value)}
                            placeholder="e.g., Carrier authorized direct contact, claim resolved, etc."
                            className="mt-1"
                            data-testid="input-carrier-disable-reason"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDisableDialog(false)}>Cancel</Button>
                        <Button
                          onClick={() => toggleMutation.mutate({ enabled: false, reason: disableReason })}
                          disabled={!disableReason.trim() || toggleMutation.isPending}
                          data-testid="button-confirm-disable-carrier-handling"
                        >
                          {toggleMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          Disable
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMutation.mutate({ enabled: true })}
                    disabled={toggleMutation.isPending}
                    data-testid="button-enable-carrier-handling"
                  >
                    {toggleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Shield className="h-4 w-4 mr-1" />
                    )}
                    Re-enable Carrier Handling Mode
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Claim Activity Timeline ─────────────────────────────────────────────────

type TimelineEntry = {
  id: string;
  source: string;
  badge: string;
  title: string;
  detail?: string;
  actor: string;
  timestamp: string;
};

// ─── Driver Search Combobox ───────────────────────────────────────────────────

interface DriverSearchResult {
  id: string;
  displayName: string;
  employeeId: string | null;
  status: string;
}

function DriverSearchCombobox({
  accidentId,
  currentDriverId,
  currentDriverName,
  onDriverChanged,
  disabled,
}: {
  accidentId: string;
  currentDriverId?: string | null;
  currentDriverName?: string;
  onDriverChanged: (driverId: string, driverName: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 280);
  };

  const { data: results = [], isFetching } = useQuery<DriverSearchResult[]>({
    queryKey: ['/api/drivers/search', debouncedQuery, 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/drivers/search?q=${encodeURIComponent(debouncedQuery)}&active=false`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open,
    staleTime: 15_000,
  });

  const displayLabel = currentDriverName?.trim() || (currentDriverId ? "Loading…" : "Select driver…");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div
              role="combobox"
              aria-expanded={open}
              className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm items-center gap-2 cursor-pointer hover-elevate min-w-[180px] max-w-xs ${disabled ? "opacity-50 pointer-events-none" : ""}`}
              data-testid="button-driver-search-trigger"
            >
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={`flex-1 truncate ${!currentDriverName ? "text-muted-foreground" : ""}`}>
                {displayLabel}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search all drivers…"
                value={query}
                onValueChange={handleQueryChange}
                data-testid="input-driver-search"
              />
              <CommandList>
                {isFetching ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching…
                  </div>
                ) : results.length === 0 ? (
                  <CommandEmpty>No drivers found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {results.map((driver) => {
                      const statusLabel = driver.status
                        ? driver.status.charAt(0).toUpperCase() + driver.status.slice(1).toLowerCase()
                        : null;
                      const isNonActive = driver.status && driver.status.toLowerCase() !== 'active';
                      return (
                        <CommandItem
                          key={driver.id}
                          value={`${driver.displayName} ${driver.employeeId || ''}`}
                          onSelect={() => {
                            onDriverChanged(driver.id, driver.displayName);
                            setOpen(false);
                            setQuery("");
                            setDebouncedQuery("");
                          }}
                          data-testid={`driver-option-${driver.id}`}
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium truncate">{driver.displayName}</span>
                              {statusLabel && isNonActive && (
                                <span className="text-xs text-muted-foreground shrink-0">({statusLabel})</span>
                              )}
                            </div>
                            {driver.employeeId && (
                              <span className="text-xs text-muted-foreground">ID: {driver.employeeId}</span>
                            )}
                          </div>
                          {driver.id === currentDriverId && (
                            <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary flex-shrink-0" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {currentDriverId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`/drivers/${currentDriverId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background text-muted-foreground hover-elevate shrink-0"
                data-testid="link-view-driver-record"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open driver profile</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── Customer Search Combobox ────────────────────────────────────────────────

const RECENT_CUSTOMERS_KEY = "recent_claim_customers";
const MAX_RECENT_CUSTOMERS = 5;

function getRecentCustomers(): { id: string; name: string }[] {
  try { return JSON.parse(localStorage.getItem(RECENT_CUSTOMERS_KEY) || "[]"); }
  catch { return []; }
}

function addRecentCustomer(id: string, name: string) {
  const updated = [{ id, name }, ...getRecentCustomers().filter((c) => c.id !== id)].slice(0, MAX_RECENT_CUSTOMERS);
  localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(updated));
}

interface CustomerSearchResult { id: string; name: string; status: string; }

function CustomerSearchCombobox({
  currentCustomerId,
  currentCustomerName,
  onSelect,
  disabled,
}: {
  currentCustomerId?: string | null;
  currentCustomerName?: string | null;
  onSelect: (id: string, name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentCustomers, setRecentCustomers] = useState<{ id: string; name: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) setRecentCustomers(getRecentCustomers());
  }, [open]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 280);
  };

  const { data: results = [], isFetching } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/accounts/search", debouncedQuery],
    queryFn: async () => {
      const qs = debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : "";
      const res = await fetch(`/api/accounts/search${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open,
    staleTime: 15_000,
  });

  const handleSelect = (id: string, name: string) => {
    addRecentCustomer(id, name);
    onSelect(id, name);
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
  };

  const displayLabel = currentCustomerName?.trim() || (currentCustomerId ? "Loading…" : "Search accounts…");
  const showRecent = !debouncedQuery && recentCustomers.length > 0;

  return (
    <div data-testid="field-customerId">
      <p className="text-sm font-medium text-muted-foreground mb-1">Customer</p>
      <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            className={`flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm items-center gap-2 cursor-pointer hover-elevate ${disabled ? "opacity-50 pointer-events-none" : ""}`}
            data-testid="button-customer-search-trigger"
          >
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className={`flex-1 truncate ${!currentCustomerName?.trim() ? "text-muted-foreground" : ""}`}>
              {displayLabel}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type to search all accounts…"
              value={query}
              onValueChange={handleQueryChange}
              data-testid="input-customer-search"
            />
            <CommandList>
              {isFetching ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching…
                </div>
              ) : showRecent ? (
                <>
                  <CommandGroup heading="Recent Customers">
                    {recentCustomers.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => handleSelect(c.id, c.name)}
                        data-testid={`customer-option-${c.id}`}
                      >
                        <span className="truncate flex-1">{c.name}</span>
                        {c.id === currentCustomerId && <CheckCircle2 className="h-3.5 w-3.5 ml-2 text-primary flex-shrink-0" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {results.length > 0 && (
                    <CommandGroup heading="All Accounts">
                      {results.map((r) => (
                        <CommandItem
                          key={r.id}
                          value={r.id}
                          onSelect={() => handleSelect(r.id, r.name)}
                          data-testid={`customer-option-${r.id}`}
                        >
                          <span className="truncate flex-1">{r.name}</span>
                          {r.status !== "active" && <Badge variant="secondary" className="ml-1 text-xs shrink-0">{r.status}</Badge>}
                          {r.id === currentCustomerId && <CheckCircle2 className="h-3.5 w-3.5 ml-2 text-primary flex-shrink-0" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              ) : results.length === 0 && debouncedQuery ? (
                <CommandEmpty>No accounts found for &ldquo;{debouncedQuery}&rdquo;</CommandEmpty>
              ) : results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">Type to search all accounts…</div>
              ) : (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      onSelect={() => handleSelect(r.id, r.name)}
                      data-testid={`customer-option-${r.id}`}
                    >
                      <span className="truncate flex-1">{r.name}</span>
                      {r.status !== "active" && <Badge variant="secondary" className="ml-1 text-xs shrink-0">{r.status}</Badge>}
                      {r.id === currentCustomerId && <CheckCircle2 className="h-3.5 w-3.5 ml-2 text-primary flex-shrink-0" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {currentCustomerId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`/accounts/${currentCustomerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background text-muted-foreground hover-elevate shrink-0"
              data-testid="link-view-account-record"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </TooltipTrigger>
          <TooltipContent>Open account record</TooltipContent>
        </Tooltip>
      )}
      </div>
    </div>
  );
}

// ─── Claim Review Section ────────────────────────────────────────────────────

const PREVENTABILITY_OPTIONS = [
  { value: "Preventable", label: "Preventable" },
  { value: "Non-Preventable", label: "Non-Preventable" },
  { value: "Undetermined", label: "Undetermined" },
];

const REVIEW_SEVERITY_OPTIONS = [
  { value: "Minor", label: "Minor" },
  { value: "Moderate", label: "Moderate" },
  { value: "Major", label: "Major" },
  { value: "Catastrophic", label: "Catastrophic" },
];

const HANDLING_TYPE_OPTIONS = [
  { value: "Internal", label: "Internal" },
  { value: "Insurance", label: "Insurance" },
];

const ROOT_CAUSE_OPTIONS = [
  { value: "Distracted Driving", label: "Distracted Driving" },
  { value: "Backing Error", label: "Backing Error" },
  { value: "Parking Error", label: "Parking Error" },
  { value: "Following Distance", label: "Following Distance" },
  { value: "Speed / Aggressive Driving", label: "Speed / Aggressive Driving" },
  { value: "Poor Judgment", label: "Poor Judgment" },
  { value: "Road Hazard", label: "Road Hazard" },
  { value: "Weather", label: "Weather" },
  { value: "Mechanical Failure", label: "Mechanical Failure" },
  { value: "Third Party Negligence", label: "Third Party Negligence" },
  { value: "Unknown", label: "Unknown" },
];

const CORRECTIVE_ACTION_OPTIONS = [
  { value: "No Action", label: "No Action" },
  { value: "Coaching", label: "Coaching" },
  { value: "Written Warning", label: "Written Warning" },
  { value: "Retraining", label: "Retraining" },
  { value: "Drug Test", label: "Drug Test" },
  { value: "Suspension", label: "Suspension" },
  { value: "Termination Review", label: "Termination Review" },
  { value: "Process Change", label: "Process Change" },
  { value: "Customer Discussion", label: "Customer Discussion" },
  { value: "Vendor Follow-Up", label: "Vendor Follow-Up" },
];

interface CorporateUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

function ClaimReviewSection({
  accident,
  onSave,
  isSaving,
  currentUserId,
}: {
  accident: any;
  onSave: (field: string, value: string | null) => void;
  isSaving: boolean;
  currentUserId: string | undefined;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [reviewDateLocal, setReviewDateLocal] = useState(
    accident.reviewDate ? (typeof accident.reviewDate === "string"
      ? accident.reviewDate.slice(0, 10)
      : new Date(accident.reviewDate).toISOString().slice(0, 10)) : ""
  );

  const { data: corpUsers = [] } = useQuery<CorporateUser[]>({
    queryKey: ["/api/corporate/users"],
  });

  const reviewedByUser = corpUsers.find((u) => u.id === accident.reviewedByUserId);
  const reviewedByLabel = reviewedByUser
    ? `${reviewedByUser.firstName ?? ""} ${reviewedByUser.lastName ?? ""}`.trim() || reviewedByUser.email
    : accident.reviewedByUserId ? "Unknown User" : "";

  const isReviewed = !!(
    accident.reviewPreventability ||
    accident.reviewSeverity ||
    accident.reviewHandlingType ||
    accident.reviewRootCause ||
    accident.reviewCorrectiveAction ||
    accident.reviewedByUserId ||
    accident.reviewDate
  );

  return (
    <Card data-testid="card-claim-review">
      <CardHeader
        className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <CardTitle className="text-[15px] font-semibold">Claim Review</CardTitle>
          {isReviewed && (
            <Badge variant="secondary" className="text-xs">
              Reviewed
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsed ? "-rotate-90" : ""}`}
        />
      </CardHeader>
      <CardContent className={`space-y-4 ${collapsed ? "hidden" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Preventability */}
          <div data-testid="field-reviewPreventability">
            <p className="text-xs font-medium text-muted-foreground mb-1">Preventability</p>
            <Select
              value={accident.reviewPreventability || ""}
              onValueChange={(val) => onSave("reviewPreventability", val || null)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9 bg-background" data-testid="select-reviewPreventability">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {PREVENTABILITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Severity — read-only, SSOT is severityEstimate in General Information */}
          <div data-testid="field-reviewSeverity">
            <p className="text-xs font-medium text-muted-foreground mb-1">Severity</p>
            <div className="h-9 flex items-center px-3 bg-muted/40 border rounded-md text-sm text-muted-foreground">
              {accident.severityEstimate
                ? accident.severityEstimate.charAt(0).toUpperCase() + accident.severityEstimate.slice(1)
                : "Not Set"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Managed in General Information (single source of truth)
            </p>
          </div>

          {/* Handling Type */}
          <div data-testid="field-reviewHandlingType">
            <p className="text-xs font-medium text-muted-foreground mb-1">Handling Type</p>
            <Select
              value={accident.reviewHandlingType || ""}
              onValueChange={(val) => onSave("reviewHandlingType", val || null)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9 bg-background" data-testid="select-reviewHandlingType">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {HANDLING_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Root Cause */}
          <div data-testid="field-reviewRootCause">
            <p className="text-xs font-medium text-muted-foreground mb-1">Root Cause</p>
            <Select
              value={accident.reviewRootCause || ""}
              onValueChange={(val) => onSave("reviewRootCause", val || null)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9 bg-background" data-testid="select-reviewRootCause">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {ROOT_CAUSE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Corrective Action */}
          <div data-testid="field-reviewCorrectiveAction">
            <p className="text-xs font-medium text-muted-foreground mb-1">Corrective Action</p>
            <Select
              value={accident.reviewCorrectiveAction || ""}
              onValueChange={(val) => onSave("reviewCorrectiveAction", val || null)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9 bg-background" data-testid="select-reviewCorrectiveAction">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {CORRECTIVE_ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Review Date */}
          <div data-testid="field-reviewDate">
            <p className="text-xs font-medium text-muted-foreground mb-1">Review Date</p>
            <Input
              type="date"
              value={reviewDateLocal}
              onChange={(e) => setReviewDateLocal(e.target.value)}
              onBlur={() => onSave("reviewDate", reviewDateLocal || null)}
              disabled={isSaving}
              data-testid="input-reviewDate"
            />
          </div>
        </div>

        {/* Reviewed By — full width */}
        <div data-testid="field-reviewedByUserId">
          <p className="text-xs font-medium text-muted-foreground mb-1">Reviewed By</p>
          <div className="flex items-center gap-2">
            <Select
              value={accident.reviewedByUserId || ""}
              onValueChange={(val) => onSave("reviewedByUserId", val || null)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-9 bg-background flex-1" data-testid="select-reviewedByUserId">
                <SelectValue placeholder="Select reviewer..." />
              </SelectTrigger>
              <SelectContent>
                {corpUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentUserId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave("reviewedByUserId", currentUserId)}
                disabled={isSaving || accident.reviewedByUserId === currentUserId}
                data-testid="button-set-reviewer-me"
              >
                <User className="h-4 w-4 mr-1" />
                Set as Me
              </Button>
            )}
          </div>
          {reviewedByLabel && (
            <p className="text-xs text-muted-foreground mt-1">Reviewer: {reviewedByLabel}</p>
          )}
        </div>

        {/* Review Notes — full width */}
        <div data-testid="field-reviewNotes">
          <p className="text-xs font-medium text-muted-foreground mb-1">Review Notes</p>
          <ReviewNotesField
            value={accident.reviewNotes || ""}
            onSave={(val) => onSave("reviewNotes", val || null)}
            isSaving={isSaving}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EstimateEditForm({
  estimate,
  onSave,
  onCancel,
  isSaving,
}: {
  estimate: { vendorName: string | null; estimateDate: string | null; estimateAmount: string | null; repairStatus: string; notes: string | null };
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [vname, setVname] = useState(estimate.vendorName ?? "");
  const [edate, setEdate] = useState(estimate.estimateDate ? new Date(estimate.estimateDate).toISOString().split("T")[0] : "");
  const [eamt, setEamt] = useState(estimate.estimateAmount ?? "");
  const [estatus, setEstatus] = useState(estimate.repairStatus);
  const [enotes, setEnotes] = useState(estimate.notes ?? "");
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Repair Vendor</Label>
          <Input value={vname} onChange={e => setVname(e.target.value)} placeholder="e.g. ABC Collision" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estimate Date</Label>
          <Input type="date" value={edate} onChange={e => setEdate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estimate Amount ($)</Label>
          <Input type="number" min="0" step="0.01" value={eamt} onChange={e => setEamt(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={estatus} onValueChange={setEstatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estimate_received">Estimate Received</SelectItem>
              <SelectItem value="approved_for_repair">Approved for Repair</SelectItem>
              <SelectItem value="repair_in_progress">Repair In Progress</SelectItem>
              <SelectItem value="repair_completed">Repair Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea value={enotes} onChange={e => setEnotes(e.target.value)} className="min-h-[60px] resize-none" placeholder="Additional details..." />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={isSaving} onClick={() => onSave({
          vendorName: vname || null,
          estimateDate: edate || null,
          estimateAmount: eamt ? parseFloat(eamt) : null,
          repairStatus: estatus,
          notes: enotes || null,
        })}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

function ReviewNotesField({
  value,
  onSave,
  isSaving,
}: {
  value: string;
  onSave: (val: string) => void;
  isSaving: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  return (
    <Textarea
      value={local}
      onChange={(e) => setLocal(e.target.value.slice(0, 5000))}
      onBlur={() => { if (local !== value) onSave(local); }}
      placeholder="Internal notes about this review decision..."
      disabled={isSaving}
      rows={3}
      data-testid="textarea-reviewNotes"
    />
  );
}

// ─── Claim Readiness Card ────────────────────────────────────────────────────

interface ReadinessItem {
  field: string;
  label: string;
  ready: boolean;
  required: boolean;
  reason?: string;
  waivable?: boolean;
  waived?: boolean;
  notApplicable?: boolean;
  count?: number;
  requiredCount?: number;
}

interface ClaimReadinessData {
  items: ReadinessItem[];
  requiredReady: boolean;
  totalReady: number;
  totalItems: number;
  missingRequired: ReadinessItem[];
  openItems: number;
  readinessPercent: number;
  currentStatus: string;
}

function ClaimReadinessCard({ accidentId, isAuthenticated, onScrollToCarrier, onItemClick, accident }: {
  accidentId: string;
  isAuthenticated: boolean;
  onScrollToCarrier: () => void;
  onItemClick?: (fieldKey: string) => void;
  accident?: any;
}) {
  const { toast } = useToast();
  const readinessKey = ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'];
  const [showNoPoliceDialog, setShowNoPoliceDialog] = useState(false);
  const [noPoliceReason, setNoPoliceReason] = useState("");
  const { data: serverReadiness, isLoading } = useQuery<ClaimReadinessData>({
    queryKey: readinessKey,
    enabled: isAuthenticated && !!accidentId,
    staleTime: 0,
  });

  const noPoliceMutation = useMutation({
    mutationFn: ({ enabled, reason }: { enabled: boolean; reason?: string }) =>
      apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/carrier-submission/waive-police-report`, {
        waived: enabled,
        reason,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: readinessKey });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/claims', accidentId, 'audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'available-transitions'] });
      setShowNoPoliceDialog(false);
      setNoPoliceReason("");
      toast({
        title: variables.enabled ? "No Police Involvement enabled" : "Police requirements restored",
        description: variables.enabled
          ? "Police-related evidence is now marked not required."
          : "Normal police-related evidence requirements are active again.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to update claim",
        description: error.message || "Failed to update No Police Involvement",
        variant: "destructive",
      });
    },
  });

  // The server readiness response is the only completion result rendered here.
  const displayItems = serverReadiness?.items || [];

  const hasData = displayItems.length > 0;
  if (!hasData && isLoading) return null;
  if (!hasData && !serverReadiness) return null;

  const pct = serverReadiness?.readinessPercent ?? 0;
  const missingRequired = serverReadiness?.missingRequired || [];
  const missingOptional = displayItems.filter((i) => !i.required && !i.ready && !i.waived && !i.notApplicable);
  const requiredReady = serverReadiness?.requiredReady === true;
  const openItems = serverReadiness?.openItems ?? 0;
  const noPoliceInvolvement = !!accident?.policeReportWaived;
  const isUpdatingNoPolice = noPoliceMutation.isPending;

  return (
    <Card data-testid="card-claim-readiness">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-4 w-4 text-primary" />
          <CardTitle className="text-[15px] font-semibold">Claim Readiness</CardTitle>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Readiness</p>
            <p className="text-2xl font-bold tabular-nums leading-none" data-testid="text-readiness-pct">{pct}%</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Open Items</p>
            <p
              className={`text-2xl font-bold tabular-nums leading-none ${
                missingRequired.length > 0
                  ? "text-destructive"
                  : missingOptional.length > 0
                  ? "text-muted-foreground"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
              data-testid="text-open-items"
            >
              {openItems}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-1.5" data-testid="progress-claim-readiness" />

        <div className="rounded-md border border-border px-3 py-2.5" data-testid="control-no-police-involvement">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="switch-no-police-involvement" className="text-[12px] font-semibold">
                No Police Involvement
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Marks Police Report and Accident Report / Exchange of Driver Info as not required.
              </p>
            </div>
            <Switch
              id="switch-no-police-involvement"
              checked={noPoliceInvolvement}
              disabled={isUpdatingNoPolice}
              onCheckedChange={(checked) => {
                if (checked) {
                  setShowNoPoliceDialog(true);
                } else {
                  noPoliceMutation.mutate({ enabled: false });
                }
              }}
              data-testid="switch-no-police-involvement"
            />
          </div>
          {noPoliceInvolvement && accident?.policeReportWaivedReason && (
            <p className="text-[11px] text-muted-foreground mt-2 border-t border-border pt-2" data-testid="text-no-police-reason">
              <span className="font-medium text-foreground">Reason:</span>{" "}
              {accident.policeReportWaivedReason}
            </p>
          )}
        </div>

        {(["required", "optional"] as const).map((group) => {
          const groupItems = displayItems.filter((i) =>
            group === "required" ? i.required : !i.required
          );
          if (groupItems.length === 0) return null;
          const isRequired = group === "required";
          return (
            <div key={group} className="space-y-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                isRequired ? "text-foreground" : "text-muted-foreground/60 mt-2"
              }`}>
                {isRequired ? "Required" : "Optional"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
                {groupItems.map((item) => {
                  const isClickable = !!onItemClick && !item.ready && !item.waived && !item.notApplicable;
                  const showReason  = item.required && !item.ready && !!item.reason;
                  return (
                    <div key={item.field} className="flex flex-col gap-0 py-0" data-testid={`readiness-row-${item.field}`}>
                      <div
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onClick={isClickable ? () => onItemClick!(item.field) : undefined}
                        onKeyDown={isClickable ? (e) => (e.key === "Enter" || e.key === " ") && onItemClick!(item.field) : undefined}
                        className={`flex items-center gap-1.5 rounded-sm -mx-1 px-1 py-0.5 ${
                          isClickable
                            ? "cursor-pointer hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            : ""
                        }`}
                      >
                        {item.notApplicable ? (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                        ) : item.ready ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        ) : item.waived ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                        ) : item.required ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0" />
                        )}
                        <span className={
                          item.ready || item.waived || item.notApplicable
                            ? "text-[12px] text-muted-foreground/60 line-through"
                            : item.required
                            ? "text-[12px] font-semibold text-foreground"
                            : "text-[12px] text-muted-foreground/80"
                        }>
                          {item.label}
                        </span>
                        {item.notApplicable && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground ml-auto flex-shrink-0 py-0 whitespace-nowrap">
                            Not Required — No Police Involvement
                          </Badge>
                        )}
                        {!item.notApplicable && !item.waived && item.required && !item.ready ? (
                          <span className="text-destructive text-[10px] font-semibold ml-auto flex-shrink-0 flex items-center gap-0.5">
                            {isClickable && <ArrowRight className="h-3 w-3 text-destructive/60" />}
                          </span>
                        ) : !item.waived && isClickable ? (
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto flex-shrink-0" />
                        ) : null}
                      </div>

                      {showReason && (
                        <div className="flex items-start gap-1.5 ml-6 -mt-0.5">
                          <AlertCircle className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-tight">{item.reason}</p>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!requiredReady && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/5 border border-destructive/20 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive/90">
              Complete all required items before reporting this claim to the carrier. Required fields and documents are marked above.
            </p>
          </div>
        )}

        {requiredReady && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                All required items are complete. This claim is ready to report to the carrier.
              </p>
            </div>
            <Button size="sm" onClick={onScrollToCarrier} data-testid="button-readiness-goto-carrier">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Report Now
            </Button>
          </div>
        )}

        <Dialog
          open={showNoPoliceDialog}
          onOpenChange={(open) => {
            if (!open && !isUpdatingNoPolice) {
              setShowNoPoliceDialog(false);
              setNoPoliceReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enable No Police Involvement</DialogTitle>
              <DialogDescription>
                Explain why police involvement was not required. This decision will be saved with the claim and added to its audit history.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="no-police-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="no-police-reason"
                value={noPoliceReason}
                onChange={(event) => setNoPoliceReason(event.target.value)}
                placeholder="Minor parking-lot incident; police were not contacted."
                maxLength={1000}
                data-testid="input-no-police-reason"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNoPoliceDialog(false);
                  setNoPoliceReason("");
                }}
                disabled={isUpdatingNoPolice}
              >
                Cancel
              </Button>
              <Button
                onClick={() => noPoliceMutation.mutate({ enabled: true, reason: noPoliceReason.trim() })}
                disabled={!noPoliceReason.trim() || isUpdatingNoPolice}
                data-testid="button-confirm-no-police"
              >
                {isUpdatingNoPolice && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Claim Activity Timeline ──────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { icon: React.ReactNode; dotClass: string; label: string }> = {
  system:     { icon: <History className="h-3 w-3" />,      dotClass: "bg-muted-foreground/60",                          label: "System" },
  status:     { icon: <RefreshCw className="h-3 w-3" />,    dotClass: "bg-muted-foreground/60",                          label: "Status" },
  note:       { icon: <MessageCircle className="h-3 w-3" />,dotClass: "bg-muted-foreground/60",                          label: "Note" },
  attachment: { icon: <Paperclip className="h-3 w-3" />,    dotClass: "bg-violet-500 dark:bg-violet-400",                label: "File" },
  carrier:    { icon: <Send className="h-3 w-3" />,         dotClass: "bg-primary",                                      label: "Carrier" },
  settlement: { icon: <DollarSign className="h-3 w-3" />,   dotClass: "bg-emerald-500 dark:bg-emerald-400",              label: "Settlement" },
};

function groupByDate(entries: TimelineEntry[]): { label: string; items: TimelineEntry[] }[] {
  const groups: Record<string, TimelineEntry[]> = {};
  for (const e of entries) {
    const d = new Date(e.timestamp);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

function ClaimActivityTimeline({ accidentId, isAuthenticated }: { accidentId: string; isAuthenticated: boolean }) {
  const { data: entries = [], isLoading } = useQuery<TimelineEntry[]>({
    queryKey: ["/api/claims", accidentId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/claims/${accidentId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timeline");
      return res.json();
    },
    enabled: isAuthenticated && !!accidentId,
    staleTime: 30_000,
  });

  const groups = groupByDate(entries);

  return (
    <Card data-testid="card-claim-timeline">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        <Clock className="h-5 w-5 text-primary" />
        <div>
          <CardTitle className="text-[15px] font-semibold">Activity Timeline</CardTitle>
          <CardDescription>Chronological record of all claim events</CardDescription>
        </div>
        {!isLoading && (
          <Badge variant="secondary" className="ml-auto text-xs no-default-hover-elevate no-default-active-elevate">
            {entries.length} event{entries.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group, gi) => (
              <div key={group.label} data-testid={`timeline-group-${gi}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="relative ml-3">
                  {/* Vertical guide line */}
                  {group.items.length > 1 && (
                    <div className="absolute left-[7px] top-4 bottom-4 w-px bg-border" />
                  )}
                  <div className="space-y-3">
                    {group.items.map((entry, ei) => {
                      const cfg = BADGE_CONFIG[entry.badge] ?? BADGE_CONFIG.system;
                      const entryDate = new Date(entry.timestamp);
                      const timeLabel = entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        + " — "
                        + entryDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 relative"
                          data-testid={`timeline-entry-${entry.id}`}
                        >
                          {/* Dot */}
                          <div className={`mt-1 h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-white ${cfg.dotClass}`}>
                            {cfg.icon}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <p className="text-sm font-medium leading-snug">{entry.title}</p>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{timeLabel}</span>
                            </div>
                            {entry.detail && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.detail}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">{entry.actor}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Timeline section map (module-level, static) ──────────────────────────────
const TIMELINE_SECTION_MAP: Record<string, { cardTestId: string; sectionKey?: string }> = {
  notes:       { cardTestId: "card-claim-notes",       sectionKey: "claim_notes" },
  review:      { cardTestId: "card-claim-review",      sectionKey: "general_info" },
  attachments: { cardTestId: "card-attachments",       sectionKey: "attachments" },
  repair:      { cardTestId: "card-repair-estimates",  sectionKey: "repair_estimates" },
  legal:       { cardTestId: "card-legal-readiness",   sectionKey: "legal_readiness" },
  drug_test:   { cardTestId: "card-drug-test",         sectionKey: "drug_test" },
  triage:      { cardTestId: "card-claim-review",      sectionKey: "triage" },
  evidence:    { cardTestId: "card-evidence-chain" },
};

export default function AccidentDetail() {
  const { accidentId } = useParams<{ accidentId: string }>();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading, user, isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canDelete = isSuperAdmin || isRootSuperAdmin;
  const [showUploader, setShowUploader] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{ attachmentId: string; fileName: string } | null>(null);
  const [deletionOverrideReason, setDeletionOverrideReason] = useState("");
  const [deletionOverrideConfirmed, setDeletionOverrideConfirmed] = useState(false);
  const [approvingOverrideId, setApprovingOverrideId] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [showOverridesPanel, setShowOverridesPanel] = useState(false);
  const [evidenceLockReason, setEvidenceLockReason] = useState("");
  const [showEvidenceLockDialog, setShowEvidenceLockDialog] = useState(false);
  // ── Active tab — controlled so Operational Summary KPIs can switch tabs ──
  const [activeTab, setActiveTab] = useState("overview");
  const carrierSectionRef = useRef<HTMLDivElement>(null);

  // ── Flash helper ────────────────────────────────────────────────────────────
  const flashElement = useCallback((el: HTMLElement) => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("claim-section-flash");
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add("claim-section-flash");
    setTimeout(() => el.classList.remove("claim-section-flash"), 2600);
  }, []);

  // ── Navigate + flash a field/section (used by Summary & Intelligence panels) ─
  const navigateToField = useCallback((testId: string, sectionKey?: string) => {
    const collapsed   = collapsedSectionsRef.current;
    const setCollapsed = setCollapsedSectionsRef.current;

    const doNavigate = () => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (el) flashElement(el);
    };

    if (sectionKey && collapsed.has(sectionKey) && setCollapsed) {
      setCollapsed(prev => { const next = new Set(prev); next.delete(sectionKey!); return next; });
      setTimeout(doNavigate, 80);
    } else {
      doNavigate();
    }
  }, [flashElement]);

  /** Switch to a tab, then optionally scroll to a specific element. */
  const navigateToTab = useCallback((tab: string, testId?: string, sectionKey?: string) => {
    setActiveTab(tab);
    if (testId) {
      setTimeout(() => navigateToField(testId, sectionKey), 100);
    }
  }, [navigateToField]);

  // ── collapsedSections ref — populated after state is declared (see below) ──
  // Used by handleTimelineNavigate which must be declared before the state
  // to avoid re-ordering hooks, but needs to read the current collapsed set.
  const collapsedSectionsRef = useRef<Set<string>>(new Set());
  const setCollapsedSectionsRef = useRef<((action: Set<string> | ((prev: Set<string>) => Set<string>)) => void) | null>(null);

  const handleTimelineNavigate = useCallback((event: TimelineEvent) => {
    const targetSection = event.targetSection;
    const targetId      = event.targetId;
    const collapsed     = collapsedSectionsRef.current;
    const setCollapsed  = setCollapsedSectionsRef.current;

    // ── Carrier section uses a ref (not a testid card) ─────────────────────
    if (targetSection === "carrier") {
      const el = carrierSectionRef.current;
      if (el) flashElement(el);
      return;
    }

    // ── Map targetSection to card / sectionKey ──────────────────────────────
    const mapping = targetSection ? TIMELINE_SECTION_MAP[targetSection] : null;

    let cardSelector: string | null = mapping
      ? `[data-testid="${mapping.cardTestId}"]`
      : null;
    let sectionKey = mapping?.sectionKey ?? null;

    // Fallback: derive from eventType if backend didn't supply targetSection
    if (!cardSelector) {
      const t = (event.eventType || "").toUpperCase();
      if (t.includes("NOTE") || t === "NOTES_ADDED" || t === "NOTE_ADDED") {
        cardSelector = '[data-testid="card-claim-notes"]'; sectionKey = "claim_notes";
      } else if (t.includes("UPLOAD") || t.includes("ATTACHMENT") || t.includes("DOCUMENT") || t.includes("EVIDENCE") || t.includes("PHOTO")) {
        cardSelector = '[data-testid="card-attachments"]'; sectionKey = "attachments";
      } else if (t.includes("STATUS") || t.includes("CREATED") || t.includes("CLOSED") || t.includes("TRANSITION")) {
        cardSelector = '[data-testid="card-claim-review"]'; sectionKey = "general_info";
      } else if (t.includes("REPAIR") || t.includes("ESTIMATE")) {
        cardSelector = '[data-testid="card-repair-estimates"]'; sectionKey = "repair_estimates";
      } else if (t.includes("CARRIER") || t.includes("SUBMISSION") || t.includes("FORM") || t.includes("GENERATED") || t.includes("PACKET")) {
        const el = carrierSectionRef.current;
        if (el) flashElement(el);
        return;
      }
    }

    if (!cardSelector) return;

    // ── Expand the section if collapsed ────────────────────────────────────
    let needsExpand = false;
    if (sectionKey && collapsed.has(sectionKey) && setCollapsed) {
      setCollapsed(prev => {
        const next = new Set(prev);
        next.delete(sectionKey!);
        return next;
      });
      needsExpand = true;
    }

    // ── Navigate after DOM settles ──────────────────────────────────────────
    const navigate = () => {
      // Try specific element first (attachment row or note entry)
      if (targetId) {
        const specificEl =
          document.getElementById(`attachment-id-${targetId}`) ||
          document.getElementById(`note-entry-id-${targetId}`);
        if (specificEl) {
          flashElement(specificEl);
          return;
        }
      }
      // Fall back to section card
      const cardEl = document.querySelector<HTMLElement>(cardSelector!);
      if (cardEl) flashElement(cardEl);
    };

    if (needsExpand) {
      setTimeout(navigate, 80);
    } else {
      navigate();
    }
  }, [carrierSectionRef, flashElement]); // refs are stable — no collapsedSections dep needed

  const { data: accident, isLoading, isError, error: accidentError } = useQuery<AccidentWithDetails>({
    queryKey: ["/api/corporate/accidents", accidentId],
    enabled: isAuthenticated && !!accidentId,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
    enabled: isAuthenticated,
  });

  const { data: drivers = [] } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
    enabled: isAuthenticated,
  });

  interface ClaimEvent {
    id: string;
    claim_id: string;
    from_status: string;
    to_status: string;
    changed_by_user_id: string;
    changed_by_name: string;
    note: string | null;
    created_at: string;
  }

  const { data: claimEvents = [] } = useQuery<ClaimEvent[]>({
    queryKey: ['/api/claims', accidentId, 'events'],
    enabled: isAuthenticated && !!accidentId,
  });

  // Audit log type
  interface AuditLogEntry {
    id: string;
    claimId: string;
    userId: string;
    userFullName: string;
    eventType: string;
    actionSummary: string;
    previousValue: string | null;
    newValue: string | null;
    metadata: string | null;
    createdAt: string;
  }

  const { data: auditLogs = [], isLoading: auditLogsLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ['/api/corporate/claims', accidentId, 'audit-logs'],
    enabled: isAuthenticated && !!accidentId,
  });

  // Check if this case is under a legal hold
  const { data: legalHoldStatus } = useQuery<{ isHeld: boolean; holdCount: number }>({
    queryKey: ['/api/legal-holds/check', 'case', accidentId],
    enabled: isAuthenticated && !!accidentId,
  });

  // Fetch linked move for claim traceability
  const { data: linkedMove, isLoading: moveLoading } = useQuery<{ id: string; moveNumber: string; tripDate: string; origin: string; destination: string } | null>({
    queryKey: ['/api/claims', accidentId, 'move'],
    enabled: isAuthenticated && !!accidentId,
    queryFn: async () => {
      const response = await fetch(`/api/claims/${accidentId}/move`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to fetch linked move");
      return response.json();
    },
  });

  // Triage info query
  interface TriageInfo {
    claimId: string;
    triageSeverity: string | null;
    injuryFlag: boolean;
    drivableFlag: boolean;
    carrierNotificationRequired: boolean;
    triageDecisionAt: string | null;
    triageOwnerUserId: string | null;
    triageOwner: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
    workflow: string | null;
    override: {
      reason: string;
      overrideAt: string;
      overrideBy: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
    } | null;
  }

  const { data: triageInfo, isLoading: triageLoading, refetch: refetchTriage } = useQuery<TriageInfo>({
    queryKey: ['/api/claims', accidentId, 'triage'],
    enabled: isAuthenticated && !!accidentId,
  });

  // Claim readiness (used by sticky header button + ClaimReadinessCard)
  const { data: claimReadiness } = useQuery<ClaimReadinessData>({
    queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'],
    enabled: isAuthenticated && !!accidentId,
    staleTime: 0,
  });

  // Triage override state
  const [showTriageOverride, setShowTriageOverride] = useState(false);
  const [overrideSeverity, setOverrideSeverity] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideInjury, setOverrideInjury] = useState(false);
  const [overrideDrivable, setOverrideDrivable] = useState(true);

  const triageOverrideMutation = useMutation({
    mutationFn: async (data: { triageSeverity?: string; injuryFlag?: boolean; drivableFlag?: boolean; overrideReason: string }) => {
      return apiRequest("PUT", `/api/claims/${accidentId}/triage`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'triage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/claims', accidentId, 'audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Triage updated", description: "The claim triage has been successfully updated." });
      setShowTriageOverride(false);
      setOverrideReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update triage", variant: "destructive" });
    },
  });

  const recalculateTriageMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/claims/${accidentId}/triage/recalculate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'triage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/claims', accidentId, 'audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Triage recalculated", description: "The claim triage has been recalculated based on current data." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to recalculate triage", variant: "destructive" });
    },
  });

  // Driver Remediation data (Ticket 2)
  interface RemediationData {
    incident: {
      id: string;
      claimId: string;
      driverId: string;
      severity: string;
      preventableFlag: boolean;
      incidentDate: string;
      notes: string | null;
      safetyReviewRequired: boolean;
      createdAt: string;
    } | null;
    correctiveActions: Array<{
      id: string;
      driverIncidentId: string;
      driverId: string;
      actionType: string;
      status: string;
      dueDate: string | null;
      assignedToUserId: string | null;
      notes: string | null;
      completedAt: string | null;
      automationRule: string | null;
      createdAt: string;
    }>;
  }

  const { data: remediationData, isLoading: remediationLoading, refetch: refetchRemediation } = useQuery<RemediationData>({
    queryKey: ['/api/claims', accidentId, 'remediation'],
    enabled: isAuthenticated && !!accidentId,
  });

  // ── Structured claim notes (per-entry, timestamped) ────────────────────────
  const [newNoteText, setNewNoteText] = useState("");

  const { data: structuredNotes = [], isLoading: notesLoading } = useQuery<{
    id: string;
    claimId: string;
    noteText: string;
    createdAt: string;
    userId: string;
    authorFirstName: string | null;
    authorLastName: string | null;
  }[]>({
    queryKey: ['/api/corporate/accidents', accidentId, 'notes'],
    enabled: !!accidentId,
  });

  const addClaimNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/notes`, { noteText });
    },
    onSuccess: () => {
      setNewNoteText("");
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'timeline'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save note", variant: "destructive" });
    },
  });

  // ── Repair Estimates ────────────────────────────────────────────────────────
  const [showAddEstimate, setShowAddEstimate] = useState(false);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [estVendorName, setEstVendorName] = useState("");
  const [estDate, setEstDate] = useState("");
  const [estAmount, setEstAmount] = useState("");
  const [estStatus, setEstStatus] = useState("estimate_received");
  const [estNotes, setEstNotes] = useState("");
  const [finalRepairCost, setFinalRepairCost] = useState<string>(() => {
    const v = (accident as any)?.finalRepairCost;
    if (v == null || v === "") return "";
    const n = parseFloat(String(v));
    return isNaN(n) ? "" : String(Math.round(n * 100) / 100);
  });
  const fmtRepairDisplay = (raw: string) => {
    if (!raw) return "";
    const n = parseFloat(raw);
    if (isNaN(n)) return "";
    return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const [finalRepairDisplay, setFinalRepairDisplay] = useState<string>(() => fmtRepairDisplay(
    (() => { const v = (accident as any)?.finalRepairCost; return (v != null && v !== "") ? String(v) : ""; })()
  ));

  // Sync display when the accident record refreshes (e.g. post-save invalidation)
  useEffect(() => {
    const v = (accident as any)?.finalRepairCost;
    if (v == null || v === "") { setFinalRepairCost(""); setFinalRepairDisplay(""); return; }
    const n = parseFloat(String(v));
    if (!isNaN(n)) {
      const raw = String(Math.round(n * 100) / 100);
      setFinalRepairCost(raw);
      setFinalRepairDisplay(fmtRepairDisplay(raw));
    }
  }, [(accident as any)?.finalRepairCost]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleFinalRepairChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits and a single decimal point while typing
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    const parts = raw.split(".");
    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
    setFinalRepairDisplay(cleaned);
    setFinalRepairCost(cleaned);
  };

  const handleFinalRepairFocus = () => {
    // Strip formatting so the user sees a plain number
    setFinalRepairDisplay(finalRepairCost || "");
  };

  const handleFinalRepairBlur = () => {
    if (!finalRepairCost) { setFinalRepairDisplay(""); return; }
    const n = parseFloat(finalRepairCost);
    if (isNaN(n)) { setFinalRepairDisplay(""); setFinalRepairCost(""); return; }
    const rounded = String(Math.round(n * 100) / 100);
    setFinalRepairCost(rounded);
    setFinalRepairDisplay(fmtRepairDisplay(rounded));
  };

  const [repairStartDate, setRepairStartDate] = useState(
    (accident as any)?.repairStartDate ? new Date((accident as any).repairStartDate).toISOString().split("T")[0] : ""
  );
  const [finalRepairDate, setFinalRepairDate] = useState(
    (accident as any)?.repairCompletionDate ? new Date((accident as any).repairCompletionDate).toISOString().split("T")[0] : ""
  );

  const { data: repairEstimatesList = [], isLoading: estimatesLoading } = useQuery<{
    id: string;
    claimId: string;
    vendorId: string | null;
    vendorName: string | null;
    estimateDate: string | null;
    estimateAmount: string | null;
    repairStatus: string;
    notes: string | null;
    documentId: string | null;
    createdAt: string;
    vendorDisplayName: string | null;
  }[]>({
    queryKey: ['/api/claims', accidentId, 'repair-estimates'],
    enabled: !!accidentId,
  });

  // Supplement state
  const [showAddSupplement, setShowAddSupplement] = useState(false);
  const [suppDate, setSuppDate] = useState("");
  const [suppAmount, setSuppAmount] = useState("");
  const [suppReason, setSuppReason] = useState("");
  const [suppNotes, setSuppNotes] = useState("");
  const [suppDocPath, setSuppDocPath] = useState<string | null>(null);
  const [suppDocUploading, setSuppDocUploading] = useState(false);
  const [suppDocName, setSuppDocName] = useState<string | null>(null);

  const { data: supplementsList = [], refetch: refetchSupplements } = useQuery<{
    id: string;
    claimId: string;
    supplementDate: string | null;
    supplementAmount: string | null;
    supplementReason: string | null;
    documentPath: string | null;
    notes: string | null;
    createdAt: string;
  }[]>({
    queryKey: ['/api/claims', accidentId, 'supplements'],
    enabled: !!accidentId,
  });

  const invalidateSupplements = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'supplements'] });
  };

  const invalidateEstimates = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'repair-estimates'] });
    queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'timeline'] });
  };

  const addEstimateMutation = useMutation({
    mutationFn: async (data: { vendorName: string; estimateDate: string; estimateAmount: string; repairStatus: string; notes: string }) =>
      apiRequest("POST", `/api/claims/${accidentId}/repair-estimates`, {
        vendorName: data.vendorName || null,
        estimateDate: data.estimateDate || null,
        estimateAmount: data.estimateAmount ? parseFloat(data.estimateAmount) : null,
        repairStatus: data.repairStatus,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      setShowAddEstimate(false);
      setEstVendorName(""); setEstDate(""); setEstAmount(""); setEstStatus("estimate_received"); setEstNotes("");
      invalidateEstimates();
      toast({ title: "Estimate added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateEstimateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/claims/${accidentId}/repair-estimates/${id}`, data),
    onSuccess: () => {
      setEditingEstimateId(null);
      invalidateEstimates();
      toast({ title: "Estimate updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEstimateMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/claims/${accidentId}/repair-estimates/${id}`),
    onSuccess: () => { invalidateEstimates(); toast({ title: "Estimate removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addSupplementMutation = useMutation({
    mutationFn: async (data: { supplementDate: string; supplementAmount: string; supplementReason: string; documentPath: string | null; notes: string }) =>
      apiRequest("POST", `/api/claims/${accidentId}/supplements`, {
        supplementDate: data.supplementDate || null,
        supplementAmount: data.supplementAmount ? parseFloat(data.supplementAmount) : null,
        supplementReason: data.supplementReason || null,
        documentPath: data.documentPath || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      setShowAddSupplement(false);
      setSuppDate(""); setSuppAmount(""); setSuppReason(""); setSuppNotes(""); setSuppDocPath(null); setSuppDocName(null);
      invalidateSupplements();
      toast({ title: "Supplemental estimate added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSupplementMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/claims/${accidentId}/supplements/${id}`),
    onSuccess: () => { invalidateSupplements(); toast({ title: "Supplement removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSuppDocUpload = async (file: File) => {
    setSuppDocUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const resp = await fetch("/api/objects/upload-file", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-Entity-Type": "supplement_document",
        },
        body: buf,
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Upload failed");
      const json = await resp.json();
      setSuppDocPath(json.path || json.key || json.url || null);
      setSuppDocName(file.name);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload supplement document.", variant: "destructive" });
    } finally {
      setSuppDocUploading(false);
    }
  };

  const saveFinalRepairMutation = useMutation({
    mutationFn: async (data: { finalRepairCost: string; repairStartDate: string; repairCompletionDate: string }) =>
      apiRequest("PATCH", `/api/claims/${accidentId}/final-repair`, {
        finalRepairCost: data.finalRepairCost ? parseFloat(data.finalRepairCost) : null,
        repairStartDate: data.repairStartDate || null,
        repairCompletionDate: data.repairCompletionDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      toast({ title: "Final repair info saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const REPAIR_STATUS_LABELS: Record<string, string> = {
    estimate_received: "Estimate Received",
    approved_for_repair: "Approved for Repair",
    repair_in_progress: "Repair In Progress",
    repair_completed: "Repair Completed",
  };

  const REPAIR_STATUS_COLORS: Record<string, string> = {
    estimate_received: "bg-muted text-muted-foreground",
    approved_for_repair: "bg-muted text-muted-foreground",
    repair_in_progress: "bg-muted text-muted-foreground",
    repair_completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  };

  const generateFormMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/generate-form`, {
        claimType: (accident as any)?.claimType,
      });
      return resp as { fileName: string; attachmentId: string; objectPath: string };
    },
    onSuccess: async (data) => {
      try {
        const dlResp = await fetch(`/api/documents/${data.attachmentId}/download`, { credentials: "include" });
        if (dlResp.ok) {
          const blob = await dlResp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      toast({ title: "Claim form generated", description: `${data.fileName} is ready.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate claim form", variant: "destructive" });
    },
  });

  // State for creating incident
  const [showCreateIncident, setShowCreateIncident] = useState(false);
  const [showPacketPreview, setShowPacketPreview] = useState(false);
  const [showAutoLossReport, setShowAutoLossReport] = useState(false);
  const [incidentPreventable, setIncidentPreventable] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState("");

  // State for creating corrective action
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [newActionType, setNewActionType] = useState("");
  const [newActionDueDate, setNewActionDueDate] = useState("");
  const [newActionNotes, setNewActionNotes] = useState("");

  const createIncidentMutation = useMutation({
    mutationFn: async (data: { preventableFlag: boolean; notes: string }) => {
      return apiRequest("POST", `/api/claims/${accidentId}/incident`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'remediation'] });
      toast({ title: "Incident Created", description: "Driver incident record has been created." });
      setShowCreateIncident(false);
      setIncidentPreventable(false);
      setIncidentNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create incident", variant: "destructive" });
    },
  });

  const createCorrectiveActionMutation = useMutation({
    mutationFn: async (data: { actionType: string; dueDate?: string; notes?: string }) => {
      return apiRequest("POST", `/api/incidents/${remediationData?.incident?.id}/corrective-actions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'remediation'] });
      toast({ title: "Action Created", description: "Corrective action has been created." });
      setShowCreateAction(false);
      setNewActionType("");
      setNewActionDueDate("");
      setNewActionNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create corrective action", variant: "destructive" });
    },
  });

  const updateActionStatusMutation = useMutation({
    mutationFn: async (data: { actionId: string; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/corrective-actions/${data.actionId}`, { status: data.status, notes: data.notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'remediation'] });
      toast({ title: "Status Updated", description: "Corrective action status has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  // Customer Risk Score (Ticket 3)
  interface CustomerRiskData {
    riskBand: string;
    normalizedScore: string;
    claimsPer1000Moves180d: string;
    totalClaims180d: number;
    totalMoves180d: number;
    contractPressureFlags: string[];
    scoreTrend: string;
  }

  const { data: customerRiskData, isLoading: riskLoading } = useQuery<CustomerRiskData>({
    queryKey: ['/api/customers', accident?.customerId, 'risk-score'],
    enabled: isAuthenticated && !!accident?.customerId,
  });

  // Claim Recovery/Subrogation data (Ticket 4)
  interface ClaimRecoveryData {
    id: string;
    claimId: string;
    thirdPartyFault: boolean;
    recoverableAmount: string;
    recoveredAmount: string;
    recoverySource: string | null;
    recoveryStatus: string;
    recoveryNotes: string | null;
    recoveryStartedAt: string | null;
    recoveryClosedAt: string | null;
  }

  interface RecoveryAuditLog {
    id: string;
    actionType: string;
    fieldChanged: string | null;
    previousValue: string | null;
    newValue: string | null;
    notes: string | null;
    createdAt: string;
    userName: string | null;
  }

  const { data: recoveryData, isLoading: recoveryLoading } = useQuery<ClaimRecoveryData | null>({
    queryKey: ['/api/claims', accidentId, 'recovery'],
    enabled: isAuthenticated && !!accidentId,
  });

  const { data: recoveryAuditLog = [] } = useQuery<RecoveryAuditLog[]>({
    queryKey: ['/api/claims', accidentId, 'recovery', 'audit-log'],
    enabled: isAuthenticated && !!accidentId && !!recoveryData,
  });

  const [showRecoveryAudit, setShowRecoveryAudit] = useState(false);

  // Controlled states for recovery amount inputs (format-on-blur)
  const fmtAmt = (v: string | number | null | undefined): string => {
    if (v == null || v === "") return "";
    const n = parseFloat(String(v));
    if (isNaN(n)) return "";
    return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const [recoverableAmtDisplay, setRecoverableAmtDisplay] = useState("");
  const [recoveredAmtDisplay,   setRecoveredAmtDisplay]   = useState("");
  const [recoverableAmtRaw,     setRecoverableAmtRaw]     = useState("");
  const [recoveredAmtRaw,       setRecoveredAmtRaw]       = useState("");

  useEffect(() => {
    if (!recoveryData) return;
    const ra = String(recoveryData.recoverableAmount ?? "");
    const rv = String(recoveryData.recoveredAmount ?? "");
    setRecoverableAmtRaw(ra ? String(parseFloat(ra) || 0) : "0");
    setRecoveredAmtRaw  (rv ? String(parseFloat(rv) || 0) : "0");
    setRecoverableAmtDisplay(fmtAmt(ra) || "$0.00");
    setRecoveredAmtDisplay  (fmtAmt(rv) || "$0.00");
  }, [recoveryData?.recoverableAmount, recoveryData?.recoveredAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeAmtHandlers = (
    setRaw: (v: string) => void,
    setDisplay: (v: string) => void,
    onSave: (raw: string) => void,
  ) => ({
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
      setDisplay(cleaned);
      setRaw(cleaned);
    },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      // Strip formatting so the user sees a plain number
      const stripped = e.target.value.replace(/[^0-9.]/g, "");
      setDisplay(stripped);
      setRaw(stripped);
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const stripped = e.target.value.replace(/[^0-9.]/g, "");
      const n = parseFloat(stripped);
      const rounded = isNaN(n) ? 0 : Math.round(n * 100) / 100;
      const raw = String(rounded);
      setRaw(raw);
      setDisplay(fmtAmt(raw) || "$0.00");
      onSave(raw);
    },
  });

  const saveRecoveryMutation = useMutation({
    mutationFn: async (data: Partial<ClaimRecoveryData>) => {
      return await apiRequest("POST", `/api/claims/${accidentId}/recovery`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'recovery'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'recovery', 'audit-log'] });
      toast({ title: "Recovery Updated", description: "Recovery information has been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save recovery", variant: "destructive" });
    },
  });

  // Litigation Hold (Ticket 5)
  interface LitigationHoldData {
    litigationHoldActive: boolean;
    litigationHoldReason: string | null;
    litigationHoldTrigger: string | null;
    litigationHoldActivatedAt: string | null;
    litigationHoldActivatedByUserId: string | null;
    litigationHoldReleasedAt: string | null;
    litigationHoldReleasedByUserId: string | null;
    litigationHoldReleaseReason: string | null;
    attorneyLetterReceived: boolean;
    attorneyLetterReceivedAt: string | null;
    injuryFlag: boolean;
    triageSeverity: string | null;
  }

  interface LitigationAuditEntry {
    id: string;
    claimId: string;
    userId: string;
    actionType: string;
    triggerType: string | null;
    reason: string | null;
    createdAt: string;
  }

  const { data: litigationHold, isLoading: litigationLoading } = useQuery<LitigationHoldData>({
    queryKey: ['/api/claims', accidentId, 'litigation-hold'],
    enabled: isAuthenticated && !!accidentId,
  });

  const { data: litigationAuditLog = [] } = useQuery<LitigationAuditEntry[]>({
    queryKey: ['/api/claims', accidentId, 'litigation-hold', 'audit-log'],
    enabled: isAuthenticated && !!accidentId,
  });

  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [showLitigationAudit, setShowLitigationAudit] = useState(false);

  const activateHoldMutation = useMutation({
    mutationFn: async (data: { reason: string; triggerType: string }) => {
      return apiRequest("POST", `/api/claims/${accidentId}/litigation-hold/activate`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold', 'audit-log'] });
      toast({ title: "Litigation Hold Activated", description: "This claim is now under litigation hold." });
      setShowHoldDialog(false);
      setHoldReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to activate hold", variant: "destructive" });
    },
  });

  const releaseHoldMutation = useMutation({
    mutationFn: async (data: { reason: string }) => {
      return apiRequest("POST", `/api/claims/${accidentId}/litigation-hold/release`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold', 'audit-log'] });
      toast({ title: "Litigation Hold Released", description: "The litigation hold has been released." });
      setShowReleaseDialog(false);
      setReleaseReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to release hold", variant: "destructive" });
    },
  });

  const recordAttorneyLetterMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/claims/${accidentId}/attorney-letter`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'litigation-hold', 'audit-log'] });
      toast({ title: "Attorney Letter Recorded", description: "Litigation hold has been automatically activated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record attorney letter", variant: "destructive" });
    },
  });

  const exportLegalPacketMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/claims/${accidentId}/legal-packet`);
      if (!response.ok) throw new Error("Failed to export legal packet");
      return response.json();
    },
    onSuccess: (data) => {
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `legal-packet-${accidentId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Legal Packet Exported", description: "The legal packet has been downloaded." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to export legal packet", variant: "destructive" });
    },
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'super_user';

  // Drug Test Workflow (Ticket 6)
  interface DrugTestData {
    drugTestRequired: boolean;
    drugTestStatus: string | null;
    drugTestRequiredAt: string | null;
    drugTestDueBy: string | null;
    drugTestRequiredReason: string | null;
    drugTestWaivedReason: string | null;
    drugTestCompletedAt: string | null;
    drugTestLastNotifiedAt: string | null;
    drugTestAcknowledgedAt: string | null;
    isOverdue: boolean;
    daysOverdue: number;
    notifications: any[];
    driverTask: any | null;
  }

  interface DrugTestAuditEntry {
    id: string;
    claimId: string;
    userId: string;
    actionType: string;
    previousStatus: string | null;
    newStatus: string | null;
    reason: string | null;
    createdAt: string;
  }

  const { data: drugTest, isLoading: drugTestLoading } = useQuery<DrugTestData>({
    queryKey: ['/api/claims', accidentId, 'drug-test'],
    enabled: isAuthenticated && !!accidentId,
  });

  const { data: drugTestAuditLog = [] } = useQuery<DrugTestAuditEntry[]>({
    queryKey: ['/api/claims', accidentId, 'drug-test', 'audit-log'],
    enabled: isAuthenticated && !!accidentId,
  });

  const [showDrugTestRequireDialog, setShowDrugTestRequireDialog] = useState(false);
  const [showDrugTestWaiveDialog, setShowDrugTestWaiveDialog] = useState(false);
  const [drugTestRequireReason, setDrugTestRequireReason] = useState("");
  const [drugTestWaiveReason, setDrugTestWaiveReason] = useState("");
  const [showDrugTestAudit, setShowDrugTestAudit] = useState(false);

  const requireDrugTestMutation = useMutation({
    mutationFn: async (data: { reason: string; isAutoTrigger?: boolean }) => {
      return apiRequest("POST", `/api/claims/${accidentId}/drug-test/require`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test', 'audit-log'] });
      toast({ title: "Drug Test Required", description: "Driver has been notified." });
      setShowDrugTestRequireDialog(false);
      setDrugTestRequireReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to require drug test", variant: "destructive" });
    },
  });

  const waiveDrugTestMutation = useMutation({
    mutationFn: async (data: { reason: string }) => {
      return apiRequest("POST", `/api/claims/${accidentId}/drug-test/waive`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test', 'audit-log'] });
      toast({ title: "Drug Test Waived", description: "The drug test requirement has been waived." });
      setShowDrugTestWaiveDialog(false);
      setDrugTestWaiveReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to waive drug test", variant: "destructive" });
    },
  });

  const resendDrugTestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/claims/${accidentId}/drug-test/resend`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test'] });
      toast({ title: "Notification Resent", description: "Driver has been notified again." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to resend notification", variant: "destructive" });
    },
  });

  const completeDrugTestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/claims/${accidentId}/drug-test/complete`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'drug-test', 'audit-log'] });
      toast({ title: "Drug Test Completed", description: "The drug test has been marked as completed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to complete drug test", variant: "destructive" });
    },
  });

  const getDrugTestStatusBadge = (status: string | null) => {
    switch (status) {
      case 'not_required':   return <StatusBadge status="not_required" label="Not Required" />;
      case 'required':       return <StatusBadge status="required" label="Required" />;
      case 'notified':       return <StatusBadge status="notified" label="Notified" />;
      case 'acknowledged':   return <StatusBadge status="acknowledged" label="Acknowledged" />;
      case 'completed':      return <StatusBadge status="completed" label="Completed" />;
      case 'waived':         return <StatusBadge status="waived" label="Waived" />;
      case 'failed_to_comply': return <StatusBadge status="failed_to_comply" label="Failed to Comply" />;
      default:               return <StatusBadge status="unknown" label="Unknown" />;
    }
  };

  const validateDriverId = (idType: "employee" | "ic", idValue: string): { valid: boolean; driver?: DriverWithUser } => {
    if (!idValue) return { valid: false };
    const driver = drivers.find((d) => {
      if (idType === "employee") {
        return d.employeeId === idValue && d.status === "active";
      } else {
        return d.independentContractorId === idValue && d.status === "active";
      }
    });
    return { valid: !!driver, driver };
  };

  const updateAccidentMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      return await apiRequest("PATCH", `/api/corporate/accidents/${accidentId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents"] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({
        title: "Updated",
        description: "Incident information has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update incident",
        variant: "destructive",
      });
    },
  });

  const changeDriverMutation = useMutation({
    mutationFn: async ({ driverId }: { driverId: string }) => {
      return await apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/driver`, { driverId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/claims', accidentId, 'audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', accidentId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Driver Updated", description: "The claim has been linked to the selected driver." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update driver", variant: "destructive" });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest("DELETE", `/api/corporate/accidents/${accidentId}/attachments/${id}`, { deletionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/claims", accidentId, "audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      setDeleteTarget(null);
      toast({ title: "Attachment Removed", description: "The attachment has been removed and an audit record created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove attachment", variant: "destructive" });
    },
  });

  // Evidence lock computed value — only lock for truly final statuses
  const EVIDENCE_LOCKED_STATUSES = ['SUBMITTED', 'CLOSED', 'PAID', 'APPROVED', 'DENIED'];
  const isStatusLocked = EVIDENCE_LOCKED_STATUSES.includes(accident?.claimStatus || '');
  const isEvidenceLocked = !!(accident as any)?.evidenceLock || isStatusLocked || !!(accident as any)?.litigationHoldActive;
  const isReadOnly = accident?.claimStatus === "CLOSED" || accident?.claimStatus === "DENIED";

  // Overrides query
  const { data: overridesData, refetch: refetchOverrides } = useQuery<{ overrides: any[] }>({
    queryKey: ["/api/corporate/accidents", accidentId, "deletion-overrides"],
    enabled: isAuthenticated && !!accidentId && canDelete && isEvidenceLocked,
  });
  const overridesList = overridesData?.overrides || [];

  const requestOverrideMutation = useMutation({
    mutationFn: async ({ attachmentId, requestReason }: { attachmentId: string; requestReason: string }) => {
      const resp = await apiRequest("POST", `/api/corporate/accidents/${accidentId}/deletion-overrides`, { attachmentId, requestReason });
      return resp.json();
    },
    onSuccess: () => {
      refetchOverrides();
      setOverrideTarget(null);
      setDeletionOverrideReason("");
      setDeletionOverrideConfirmed(false);
      toast({ title: "Override Requested", description: "Deletion override request submitted. A different Super Admin must approve it." });
    },
    onError: (error: any) => {
      toast({ title: "Request Failed", description: error.message || "Failed to submit override request", variant: "destructive" });
    },
  });

  const approveOverrideMutation = useMutation({
    mutationFn: async ({ overrideId, notes }: { overrideId: string; notes: string }) => {
      const resp = await apiRequest("POST", `/api/corporate/accidents/${accidentId}/deletion-overrides/${overrideId}/approve`, { approvalNotes: notes });
      return resp.json();
    },
    onSuccess: () => {
      refetchOverrides();
      setApprovingOverrideId(null);
      setApprovalNotes("");
      toast({ title: "Override Approved", description: "The requester may now delete this attachment within 24 hours." });
    },
    onError: (error: any) => {
      toast({ title: "Approval Failed", description: error.message || "Failed to approve override", variant: "destructive" });
    },
  });

  const rejectOverrideMutation = useMutation({
    mutationFn: async ({ overrideId, notes }: { overrideId: string; notes: string }) => {
      const resp = await apiRequest("POST", `/api/corporate/accidents/${accidentId}/deletion-overrides/${overrideId}/reject`, { approvalNotes: notes });
      return resp.json();
    },
    onSuccess: () => {
      refetchOverrides();
      setApprovingOverrideId(null);
      setApprovalNotes("");
      toast({ title: "Override Rejected", description: "The deletion override request has been rejected." });
    },
    onError: (error: any) => {
      toast({ title: "Rejection Failed", description: error.message || "Failed to reject override", variant: "destructive" });
    },
  });

  const toggleEvidenceLockMutation = useMutation({
    mutationFn: async ({ enabled, reason }: { enabled: boolean; reason?: string }) => {
      const resp = await apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/evidence-lock`, { enabled, reason });
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      setShowEvidenceLockDialog(false);
      setEvidenceLockReason("");
      toast({ title: data.evidenceLock ? "Evidence Lock Enabled" : "Evidence Lock Disabled", description: data.evidenceLock ? "Attachment deletion now requires dual approval." : "Evidence lock removed. Super Admin deletion restored." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update evidence lock", variant: "destructive" });
    },
  });

  const [replacingAttachmentId, setReplacingAttachmentId] = useState<string | null>(null);

  const handleReplaceComplete = async (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }) => {
    if (!replacingAttachmentId) return;
    try {
      await apiRequest("PUT", `/api/corporate/accidents/${accidentId}/attachments/${replacingAttachmentId}`, {
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize,
        fileUrl: result.objectPath,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      toast({
        title: "Attachment Replaced",
        description: `${result.fileName} has replaced the previous file.`,
      });
      setReplacingAttachmentId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to replace attachment",
        variant: "destructive",
      });
    }
  };

  const addInsuranceCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest("POST", `/api/corporate/accidents/${accidentId}/insurance-comments`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      toast({
        title: "Comment Added",
        description: "Insurance comment has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  const addIncidentCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest("POST", `/api/corporate/accidents/${accidentId}/incident-comments`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      toast({
        title: "Comment Added",
        description: "Incident comment has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  const handleUploadComplete = async (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }, category: string = "general") => {
    try {
      const response = await fetch(`/api/corporate/accidents/${accidentId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: result.fileName,
          fileType: result.fileType,
          fileSize: result.fileSize,
          fileUrl: result.objectPath,
          category,
        }),
      });

      if (!response.ok) {
        let errorData: any = {};
        try { errorData = await response.json(); } catch {}
        const errorCode = errorData.errorCode || "UNKNOWN_ERROR";
        const msg = errorData.message || "Failed to save attachment";
        if (errorCode === "UNSUPPORTED_TYPE") {
          toast({ title: "Unsupported file type", description: msg, variant: "destructive" });
        } else if (errorCode === "NOT_AUTHORIZED") {
          toast({ title: "Not authorized", description: msg, variant: "destructive" });
        } else if (errorCode === "CLAIM_NOT_FOUND") {
          toast({ title: "Claim not found", description: msg, variant: "destructive" });
        } else {
          toast({ title: "Upload failed", description: msg, variant: "destructive" });
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({
        title: "Attachment Added",
        description: `${result.fileName} has been attached to this incident.`,
      });
      setShowUploader(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: "Something went wrong while saving the attachment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveAnnotationsMutation = useMutation({
    mutationFn: ({ attachmentId, annotations }: { attachmentId: string; annotations: string }) =>
      apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/attachments/${attachmentId}/annotations`, { annotations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
    },
  });

  const handleSaveAnnotations = useCallback(
    async (attachmentId: string, annotations: string) => {
      await saveAnnotationsMutation.mutateAsync({ attachmentId, annotations });
    },
    [saveAnnotationsMutation],
  );

  const [headerShadow, setHeaderShadow] = useState(false);
  useEffect(() => {
    const mainEl = document.querySelector("main") as HTMLElement | null;
    if (!mainEl) return;
    const handleScroll = () => setHeaderShadow(mainEl.scrollTop > 0);
    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => mainEl.removeEventListener("scroll", handleScroll);
  }, []);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Keep refs in sync so handleTimelineNavigate (declared earlier) can access current values
  collapsedSectionsRef.current = collapsedSections;
  setCollapsedSectionsRef.current = setCollapsedSections;

  const toggleSection = (key: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const READINESS_TO_TESTID: Record<string, string> = {
    lossDate:                 "field-accidentDate",
    lossLocation:             "field-location",
    lossLocationAddress:      "field-location",
    description:              "card-claim-notes",
    driverId:                 "field-driverName",
    photos:                   "card-attachments",
    accidentReport:           "card-attachments",
    policeReport:             "card-attachments",
    driverStatement:          "card-attachments",
    drugTest:                 "card-drug-test",
    insuredName:              "card-claim-notes",
    catastrophicAcknowledged: "card-claim-notes",
    reportFiledByName:        "card-claim-notes",
    injuredParties:           "card-claim-notes",
    vehicleVin:               "field-incidentType",
    vehicleMake:              "field-incidentType",
    claimantName:             "card-claim-notes",
    thirdPartyInfo:           "card-claim-notes",
    driverRemediation:        "card-driver-incident-remediation",
  };
  const TESTID_TO_SECTION: Record<string, string> = {
    "field-accidentDate":              "general_info",
    "field-location":                  "general_info",
    "field-driverName":                "general_info",
    "field-incidentType":              "general_info",
    "field-resolutionStatus":          "general_info",
    "card-claim-notes":                "claim_notes",
    "card-attachments":                "attachments",
    "card-drug-test":                  "drug_test",
    "card-driver-incident-remediation":"driver_remediation",
  };
  const scrollToRequirementError = (fieldKey: string) => {
    const testId = READINESS_TO_TESTID[fieldKey];
    if (!testId) return;
    navigateToField(testId, TESTID_TO_SECTION[testId]);
  };

  const updateCategoryMutation = useMutation({
    mutationFn: ({ attachmentId, category }: { attachmentId: string; category: string }) =>
      apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/attachments/${attachmentId}/category`, { category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId] });
    },
    onError: () => {
      toast({ title: "Failed to update category", variant: "destructive" });
    },
  });

  const handleCategoryChange = useCallback(
    async (attachmentId: string, category: string) => {
      await updateCategoryMutation.mutateAsync({ attachmentId, category });
    },
    [updateCategoryMutation],
  );

  const { data: categoryMeta } = useQuery<any[]>({
    queryKey: ['/api/corporate/accidents', accidentId, 'category-meta'],
    enabled: isAuthenticated && !!accidentId,
  });

  const saveCategoryMetaMutation = useMutation({
    mutationFn: async ({ category, metadata, notes }: { category: string; metadata: any; notes: string | null }) => {
      return apiRequest("PUT", `/api/corporate/accidents/${accidentId}/category-meta/${category}`, { metadata, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'category-meta'] });
      toast({ title: "Saved", description: "Category information updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save category info", variant: "destructive" });
    },
  });

  const attachmentsByCategory = useMemo(() => {
    const allCats = Object.keys(CATEGORY_CONFIG);
    const grouped: Record<string, AccidentAttachment[]> = {};
    allCats.forEach(c => { grouped[c] = []; });
    (accident?.attachments || []).forEach((a: any) => {
      const cat = a.category || "general";
      if (grouped[cat] !== undefined) grouped[cat].push(a);
      else {
        if (!grouped.general) grouped.general = [];
        grouped.general.push(a);
      }
    });
    return grouped;
  }, [accident?.attachments]);

  const handleFieldSave = (fieldName: string, value: string | boolean) => {
    updateAccidentMutation.mutate({ [fieldName]: value });
  };

  const handleDocumentDownload = async (attachment: any, _index: number) => {
    const triggerBlob = (blob: Blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    };

    const retryFetch = async (url: string, maxAttempts = 4): Promise<Response | null> => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const resp = await fetch(url, { credentials: "include" });
          if (resp.ok) return resp;
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 500 * attempt));
        } catch {
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
      return null;
    };

    try {
      // fileUrl is excluded from the bulk response — fetch on-demand
      let resolvedFileUrl = attachment.fileUrl;
      if (!resolvedFileUrl) {
        const urlResp = await fetch(`/api/corporate/accidents/${accidentId}/attachments/${attachment.id}/url`, { credentials: "include" });
        if (urlResp.ok) {
          const urlData = await urlResp.json();
          resolvedFileUrl = urlData.fileUrl;
        }
      }

      if (resolvedFileUrl?.startsWith("data:")) {
        const [header, base64] = resolvedFileUrl.split(",");
        const mime = header.match(/:(.*?);/)?.[1] || "application/octet-stream";
        const bytes = atob(base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        triggerBlob(new Blob([arr], { type: mime }));
        return;
      }
      if (attachment.attachmentDocumentId) {
        const resp = await retryFetch(`/api/documents/${attachment.attachmentDocumentId}/download`);
        if (resp) { triggerBlob(await resp.blob()); return; }
      }
      const rawPath = (resolvedFileUrl || "").replace(/^\//, "");
      const url = rawPath.startsWith("objects/") ? `/${rawPath}` : `/objects/${rawPath}`;
      const resp = await retryFetch(url);
      if (resp) { triggerBlob(await resp.blob()); return; }
      toast({ title: "Download failed", description: "The file could not be retrieved.", variant: "destructive" });
    } catch {
      toast({ title: "Download failed", description: "A network error occurred.", variant: "destructive" });
    }
  };

  // ── Enriched attachment query — includes isLocked, integrityFlags, lockerName ──
  // Must be above early returns (same hook-count rule).
  const { data: enrichedAttachments = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/accidents', accidentId, 'attachments'],
    enabled: isAuthenticated && !!accidentId,
    staleTime: 0,
  });

  const enrichedById = useMemo(() => {
    const map: Record<string, any> = {};
    enrichedAttachments.forEach((a: any) => { map[a.id] = a; });
    return map;
  }, [enrichedAttachments]);

  // ── Field requirement hook — must be called BEFORE any early returns so the hook
  // count is the same on every render (React rule: hooks must not be conditional).
  // The hook handles accident=undefined internally via optional chaining.
  const fieldReqs = useClaimFieldRequirements(accident);

  // Show spinner while auth is resolving OR while the claim is fetching.
  // Important: in TanStack Query v5, a *disabled* query (enabled=false) has
  // isLoading=false even though data is undefined. Without isAuthLoading here,
  // the component would fall through to "Claim not found" on every first render
  // before authentication state has resolved.
  if (isAuthLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Distinguish between a true 404 (claim does not exist) and a fetch error
  // (network failure, 403, 500, etc.) so the user knows what actually went wrong.
  if (isError) {
    const errMsg = (accidentError as Error)?.message || "";
    const is404 = errMsg.startsWith("404");
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="claim-not-found">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">
          {is404 ? "Claim not found" : "Failed to load claim"}
        </p>
        {accidentId && (
          <p className="text-sm text-muted-foreground">Claim ID: {accidentId}</p>
        )}
        {!is404 && errMsg && (
          <p className="text-sm text-destructive">{errMsg}</p>
        )}
        <Link href="/safety">
          <Button variant="outline" data-testid="button-back-to-safety">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Safety
          </Button>
        </Link>
      </div>
    );
  }

  if (!accident) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="claim-not-found">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">Claim not found</p>
        {accidentId && (
          <p className="text-sm text-muted-foreground">Claim ID: {accidentId}</p>
        )}
        <Link href="/safety">
          <Button variant="outline" data-testid="button-back-to-safety">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Safety
          </Button>
        </Link>
      </div>
    );
  }

  // Resolution Status options — single authoritative source shared with the
  // Claims Analysis Report (shared/schema.ts claimResolutionStatusOptions). DH-002337.
  const statusOptions = claimResolutionStatusOptions;

  const atFaultOptions = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "partial", label: "Partial" },
    { value: "pending", label: "Pending" },
  ];

  const driverClassificationOptions = [
    { value: "employee", label: "Employee" },
    { value: "independent_contractor", label: "Independent Contractor" },
  ];

  const vehicleInvolvedOptions = [
    { value: "dod_customer", label: "DoD Customer" },
    { value: "dealer_loaner", label: "Dealer Loaner" },
    { value: "consumer", label: "Consumer" },
  ];

  const severityEstimateOptions = [
    { value: "minor",        label: "Minor (< $2,500)" },
    { value: "moderate",     label: "Moderate ($2,500 – $10,000)" },
    { value: "major",        label: "Major ($10,000+)" },
    { value: "catastrophic", label: "Catastrophic" },
  ];

  const severityEstimate = (accident as any).severityEstimate || "minor";
  const showInsuranceSuggestionBanner = severityEstimate === "major" || severityEstimate === "catastrophic";

  // ─── Severity SSOT: auto-calculate from cost, detect override ──────────────
  const computedSeverity = (() => {
    const isClosed = (accident as any).claimStatus === "CLOSED";
    const raw = isClosed
      ? ((accident as any).finalRepairCost ?? (accident as any).actualCost)
      : ((accident as any).estimatedDamageAmount ?? (accident as any).probableCost);
    const cost = parseFloat(raw || "0");
    if (!cost) return null;
    if (cost >= 10000) return "major";
    if (cost >= 2500) return "moderate";
    return "minor";
  })();
  const effectiveSeverity: string | null = (accident as any).severityEstimate || computedSeverity;
  const severityIsOverridden =
    computedSeverity !== null && (accident as any).severityEstimate !== computedSeverity && !!(accident as any).severityEstimate;

  const liabilityFaultOptions = [
    { value: "at_fault",     label: "At Fault" },
    { value: "not_at_fault", label: "Not At Fault" },
    { value: "shared_fault", label: "Shared Fault" },
    { value: "unknown",      label: "Unknown" },
  ];

  const claimCategoryOptions = [
    { value: "insurance_claim", label: "Insurance Claim" },
    { value: "internal_claim",  label: "Internal Claim" },
  ];

  const claimOutcomeOptions = [
    { value: "pending",                       label: "Pending" },
    { value: "approved",                      label: "Approved" },
    { value: "approved_relationship_exception", label: "Approved – Relationship Exception" },
    { value: "denied",                        label: "Denied" },
    { value: "paid",                          label: "Paid" },
  ];

  const damageLocationOptions = [
    { value: "front",           label: "Front" },
    { value: "rear",            label: "Rear" },
    { value: "driver_side",     label: "Driver Side" },
    { value: "passenger_side",  label: "Passenger Side" },
    { value: "wheel_area",      label: "Wheel Area" },
    { value: "windshield",      label: "Windshield" },
    { value: "interior",        label: "Interior" },
    { value: "multiple_areas",  label: "Multiple Areas" },
    { value: "unknown",         label: "Unknown" },
  ];

  const preventabilityOptions = [
    { value: "Preventable",     label: "Preventable" },
    { value: "Non-Preventable", label: "Non-Preventable" },
    { value: "Undetermined",    label: "Undetermined" },
  ];

  const driverClassification = (accident as any).driverClassification || "";
  const isEmployee = driverClassification === "employee";
  const isIC = driverClassification === "independent_contractor";

  const customerName = accident.customerId
    ? customers.find((c) => c.id === accident.customerId)?.customerName
    : null;

  // ─── RecordHeader computed values ───────────────────────────
  const recordLabel = (accident as any).insuranceClaimNumber
    ? `Claim #${(accident as any).insuranceClaimNumber}`
    : (accident as any).displayClaimId
    ? `Claim ID: ${(accident as any).displayClaimId}`
    : `Claim ID: ${accidentId?.substring(0, 8).toUpperCase()}`;
  // Copy the authoritative, user-facing claim ID rather than the formatted header
  // label. This preserves the display while ensuring the clipboard contains only
  // the raw identifier (for example, "22883082").
  const rawClaimId = String(
    (accident as any).displayClaimId || accidentId?.substring(0, 8).toUpperCase() || ""
  ).trim();

  const driverName = accident.driver?.user
    ? `${accident.driver.user.firstName || ''} ${accident.driver.user.lastName || ''}`.trim()
    : null;
  const incidentTypeLabel = claimIncidentTypeOptions.find((o) => o.value === accident.incidentType)?.label || accident.incidentType;
  const subtitleParts = [driverName, accident.accidentDate ? formatDate(accident.accidentDate) : null, incidentTypeLabel].filter(Boolean);

  const dodFaultLabel = accident.dodAtFault === "yes" ? "At Fault"
    : accident.dodAtFault === "no" ? "Not At Fault"
    : accident.dodAtFault === "partial" ? "Partial Fault"
    : accident.dodAtFault === "pending" ? "Fault Pending"
    : null;
  const severityLabel = effectiveSeverity
    ? `Severity: ${effectiveSeverity.charAt(0).toUpperCase() + effectiveSeverity.slice(1)}`
    : "Severity: Not Set";

  const claimTypeLabel = claimCategoryOptions.find(
    (o) => o.value === (accident as any).claimCategory
  )?.label ?? "Not Set";

  // ─── Evidence count chips ────────────────────────────────────
  const allAttachments: any[] = (accident as any).attachments || [];
  const activeAttachments = allAttachments.filter((a: any) => !a.isDeleted);
  const photoCount = activeAttachments.filter((a: any) => a.fileType?.startsWith("image/")).length;
  const videoCount = activeAttachments.filter((a: any) => a.fileType?.startsWith("video/")).length;
  const docCount = activeAttachments.filter((a: any) => !a.fileType?.startsWith("image/") && !a.fileType?.startsWith("video/")).length;
  const uncategorizedCount = activeAttachments.filter((a: any) => !a.category || a.category === "uncategorized").length;
  const evidenceComplete = activeAttachments.length > 0 && uncategorizedCount === 0;

  const evidenceStatus: "complete" | "incomplete" | "missing_photos" | "no_evidence" =
    activeAttachments.length === 0
      ? "no_evidence"
      : photoCount === 0
      ? "missing_photos"
      : uncategorizedCount > 0
      ? "incomplete"
      : "complete";

  const scrollToSection = (testId: string) =>
    document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ─── Section completion indicators ──────────────────────────────────────────
  type SectionStatus = "complete" | "incomplete" | null;
  const si: Record<string, SectionStatus> = {
    general_info: (accident.accidentDate && accident.incidentType && accident.location && accident.vehicleInvolved)
      ? "complete" : "incomplete",
    claim_notes: (structuredNotes.length > 0 || accident?.notesReceived?.trim()) ? "complete" : "incomplete",
    legal_readiness: claimReadiness === undefined
      ? null
      : claimReadiness.requiredReady ? "complete" : "incomplete",
    drug_test: (drugTestLoading || drugTest === undefined)
      ? null
      : (!drugTest.drugTestRequired || ["completed", "waived"].includes(drugTest.drugTestStatus || ""))
        ? "complete" : "incomplete",
    triage: triageLoading
      ? null
      : (effectiveSeverity ? "complete" : "incomplete"),
    driver_remediation: remediationLoading
      ? null
      : (remediationData?.incident ? "complete" : "incomplete"),
    attachments: evidenceStatus === "complete" ? "complete" : "incomplete",
  };
  const SectionIcon = ({ k }: { k: string }) => {
    const s = si[k];
    if (!s) return null;
    return s === "complete"
      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0 pointer-events-none" />
      : <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 pointer-events-none" />;
  };

  // ─── Readiness chip ──────────────────────────────────────────
  const carrierStatus = (accident as any).carrierSubmissionStatus as string | undefined;
  const isReported = carrierStatus && ["REPORTED","ACKNOWLEDGED","ADJUSTER_ASSIGNED","CLOSED"].includes(carrierStatus);
  const readinessLabel = isReported
    ? "Reported"
    : claimReadiness?.requiredReady
    ? "Ready for Insurance"
    : "Incomplete";

  // ─── Operational Summary strip computed values ──────────────────────────────
  const readinessPct = claimReadiness?.readinessPercent ?? null;
  const openItemCount = claimReadiness?.openItems ?? null;
  const estimatedDamageStr = (() => {
    const val = [(accident as any).totalEstimate, (accident as any).propertyDamage,
                 (accident as any).probableCost, (accident as any).actualCost]
      .map((v: any) => (v != null ? parseFloat(v) : NaN))
      .find((v) => !isNaN(v) && v > 0) ?? null;
    return val != null ? `$${val.toLocaleString()}` : "—";
  })();
  // ─── Claim Summary panel computed values ────────────────────
  const severityRaw = effectiveSeverity
    ? effectiveSeverity.charAt(0).toUpperCase() + effectiveSeverity.slice(1)
    : "Not Set";
  const severityTextColor = effectiveSeverity === "major" || effectiveSeverity === "catastrophic"
    ? "text-destructive"
    : "text-muted-foreground";

  const claimStatusDisplayMap: Record<string, string> = {
    DRAFT: "Draft", IN_REVIEW: "In Review", READY_FOR_SUBMISSION: "Ready for Submission",
    SUBMITTED: "Submitted", CLOSED: "Closed",
    // Legacy
    PENDING: "Pending", APPROVED: "Approved", DENIED: "Denied", PAID: "Paid",
    UNDER_REVIEW: "Under Review", ADDITIONAL_INFO_REQUESTED: "Info Requested",
    SENT_TO_CARRIER: "Sent to Carrier",
  };
  const claimStatusText = claimStatusDisplayMap[(accident as any).claimStatus ?? ""] ?? ((accident as any).claimStatus ?? "—");
  const claimStatusTextColor = ["APPROVED", "PAID"].includes((accident as any).claimStatus)
    ? "text-emerald-600 dark:text-emerald-400"
    : ["DENIED", "CLOSED"].includes((accident as any).claimStatus)
    ? "text-destructive"
    : "text-muted-foreground";

  const injuryText = litigationHold?.injuryFlag ? "Injury Reported" : "No Injury";
  const injuryTextColor = litigationHold?.injuryFlag
    ? "text-destructive"
    : "text-emerald-600 dark:text-emerald-400";

  const liabilityTextColor = accident.dodAtFault === "yes"
    ? "text-destructive"
    : accident.dodAtFault === "no"
    ? "text-emerald-600 dark:text-emerald-400"
    : accident.dodAtFault === "partial"
    ? "text-muted-foreground"
    : "text-muted-foreground";

  const insuranceStatusTextColor = isReported || claimReadiness?.requiredReady
    ? "text-emerald-600 dark:text-emerald-400"
    : claimReadiness
    ? "text-destructive"
    : "text-muted-foreground";

  const summaryGroups = [
    {
      title: "Incident",
      fields: [
        { label: "Claim Type",    value: claimTypeLabel || "—",                                                     onClick: () => navigateToTab("overview", "field-claimCategory", "general_info") },
        { label: "Incident Type", value: incidentTypeLabel || "—",                                                  onClick: () => navigateToField("field-incidentType", "general_info") },
        { label: "Date",          value: accident.accidentDate ? formatDate(accident.accidentDate) : "—",            onClick: () => navigateToField("field-accidentDate", "general_info") },
        { label: "Severity",      value: severityRaw,            colorClass: severityTextColor,                     onClick: () => navigateToField("field-severity", "general_info") },
      ],
    },
    {
      title: "People",
      fields: [
        { label: "Customer",      value: customerName || "—",                                                        onClick: () => navigateToField("field-customer", "general_info") },
        { label: "Driver",        value: driverName || "—",                                                          onClick: () => navigateToField("field-driverName", "general_info") },
      ],
    },
    {
      title: "Liability",
      fields: [
        { label: "Fault",         value: dodFaultLabel ?? "—",   colorClass: liabilityTextColor,                    onClick: () => navigateToField("field-liabilityFault", "general_info") },
        { label: "Injury",        value: injuryText,             colorClass: injuryTextColor,                       onClick: () => navigateToField("card-claim-review") },
        { label: "Insurance",     value: readinessLabel,         colorClass: insuranceStatusTextColor,              onClick: () => { const el = carrierSectionRef.current; if (el) flashElement(el); } },
      ],
    },
    {
      title: "Evidence",
      fields: [
        { label: "Photos",        value: String(photoCount),                                                         onClick: () => navigateToField("card-attachments", "attachments") },
        { label: "Documents",     value: String(docCount),                                                           onClick: () => navigateToField("card-attachments", "attachments") },
      ],
    },
  ] as import("@/components/claims/ClaimSummaryPanel").SummaryGroup[];

  // ─── Claim Intelligence (rules engine) ──────────────────────
  const intelligenceData = computeClaimIntelligence({
    accident,
    litigationHold: litigationHold ?? undefined,
    photoCount,
    docCount,
    claimReadiness: claimReadiness ?? null,
  });

  // ─── Missing Required Information ────────────────────────────────────────
  // Every readiness-facing surface consumes the authoritative server result.
  const missingItems = (claimReadiness?.missingRequired || []).map((item) => item.label);
  const photosReadiness = claimReadiness?.items.find((item) => item.field === "photos");

  // Tier 1 — Generate Claim Form: core identity fields
  const formMissing: string[] = [];
  if (!accident.accidentDate) formMissing.push("Date of Loss");
  if (!accident.driverId) formMissing.push("Driver");
  if (!accident.incidentType) formMissing.push("Incident Type");
  const formReady = formMissing.length === 0;

  // Tier 2 — Generate Submission Packet: core fields + at least 1 photo
  const packetMissing: string[] = [...formMissing];
  if (!photosReadiness?.ready) packetMissing.push(photosReadiness?.label || "Photos / Video");
  const packetReady = packetMissing.length === 0;

  // Tier 3 — Report to Carrier: consume the same canonical missing requirements
  // used by the workflow, readiness card, open-item count, and warnings.
  const carrierMissing = missingItems;
  const carrierReady = claimReadiness?.requiredReady === true;

  return (
    <>
    {/* ── Sticky command zone: Record Header + Quick Actions Bar ─────────── */}
    <div className="sticky top-0 z-50 -mx-6 bg-background">
    <RecordHeader
      asSticky={false}
      noBleed
      backLabel="Back to Claims"
      onBack={() => window.history.back()}
      recordId={recordLabel}
      copyValue={rawClaimId}
      accountLine={
        customerName && accident.customerId ? (
          <a
            href={`/accounts/${accident.customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            data-testid="link-header-account-name"
            aria-label={`Open account: ${customerName}`}
          >
            {customerName}
          </a>
        ) : undefined
      }
      subtitle={subtitleParts.length > 0 ? subtitleParts.join(' • ') : undefined}
      className={headerShadow ? "shadow-md" : ""}
      statusPills={
        <>
          {/* Resolution Status — clickable → Resolution Status field in General Info */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                onClick={() => navigateToField("field-resolutionStatus", "general_info")}
                aria-label="Go to Resolution Status"
                data-testid="badge-claim-status-nav"
              >
                <ClaimStatusBadge status={accident.status} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Go to Resolution Status (General Information)</TooltipContent>
          </Tooltip>

          {/* Legal Hold — informational only */}
          {legalHoldStatus?.isHeld && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="gap-1 cursor-default" data-testid="badge-legal-hold">
                  <ShieldAlert className="h-3 w-3" />
                  Legal Hold
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>This case is under {legalHoldStatus.holdCount} legal hold(s)</p>
                <p className="text-xs text-muted-foreground">Evidence preservation enforced</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Injury — clickable → Legal Readiness section */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                onClick={() => navigateToField("card-legal-readiness", "legal_readiness")}
                data-testid="badge-injury-pill"
              >
                <StatusBadge
                  status={litigationHold?.injuryFlag ? "injury_reported" : "no_injury"}
                  label={litigationHold?.injuryFlag ? "Injury Reported" : "No Injury"}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Go to Legal Readiness</TooltipContent>
          </Tooltip>

          {/* Liability / Fault — clickable → Liability field */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                onClick={() => navigateToField("field-liabilityFault", "general_info")}
                data-testid="badge-at-fault-pill"
              >
                <StatusBadge
                  status={
                    accident.dodAtFault === "yes" ? "at_fault" :
                    accident.dodAtFault === "no" ? "not_at_fault" :
                    accident.dodAtFault === "partial" ? "partial_fault" :
                    accident.dodAtFault === "pending" ? "fault_pending" :
                    "fault_pending"
                  }
                  label={dodFaultLabel ?? "Fault: Not Set"}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Go to Liability / Fault</TooltipContent>
          </Tooltip>

          {/* Claim Type — solid dark gray pill; shown when claimCategory is set */}
          {(accident as any).claimCategory && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                  onClick={() => navigateToField("field-claimCategory", "general_info")}
                  data-testid="badge-claim-type-pill"
                >
                  <StatusBadge
                    status={(accident as any).claimCategory}
                    label={claimTypeLabel}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>Go to Claim Type</TooltipContent>
            </Tooltip>
          )}

          {/* Severity — solid dark gray pill; shown when severity is known */}
          {effectiveSeverity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                  onClick={() => navigateToField("field-severity", "general_info")}
                  data-testid="badge-severity-pill"
                >
                  <StatusBadge
                    status={effectiveSeverity}
                    label={effectiveSeverity.charAt(0).toUpperCase() + effectiveSeverity.slice(1)}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>Go to Claim Severity</TooltipContent>
            </Tooltip>
          )}

        </>
      }
      actions={
        <>
          {/* Auto Loss Report — conditional, no gating */}
          {(accident as any)?.claimType !== "general_liability" && (accident as any)?.claimType !== "INJURY" && (accident as any)?.claimType !== "PROPERTY" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAutoLossReport(true)}
              data-testid="sticky-button-auto-loss-report"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Auto Loss Report</span>
            </Button>
          )}

          {/* Generate Claim Form — Tier 1 gating */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (formReady) generateFormMutation.mutate(); }}
                  disabled={!formReady || generateFormMutation.isPending}
                  data-testid="sticky-button-generate-form"
                >
                  {generateFormMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <FileText className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-1">Generate Claim Form</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              {formReady ? (
                <p className="text-xs">Click to generate the claim form</p>
              ) : (
                <>
                  <p className="font-medium mb-1.5 text-xs">Complete before generating:</p>
                  <ul className="space-y-0.5">
                    {formMissing.map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Generate Submission Packet — Tier 2 gating — SECONDARY action */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { if (packetReady) setShowPacketPreview(true); }}
                  disabled={!packetReady}
                  data-testid="sticky-button-generate-packet"
                >
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Generate Submission Packet</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              {packetReady ? (
                <p className="text-xs">Click to generate the submission packet</p>
              ) : (
                <>
                  <p className="font-medium mb-1.5 text-xs">Complete before generating:</p>
                  <ul className="space-y-0.5">
                    {packetMissing.map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Report to Carrier — Tier 3 gating — PRIMARY action */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(240,54%,32%)] text-white border-transparent disabled:opacity-50"
                  onClick={() => { if (carrierReady) carrierSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  disabled={!carrierReady}
                  data-testid="sticky-button-report-carrier"
                >
                  <Send className="h-5 w-5" />
                  <span className="hidden sm:inline ml-1">Report to Carrier</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              {carrierReady ? (
                <p className="text-xs">Click to report this claim to the carrier</p>
              ) : (
                <>
                  <p className="font-medium mb-1.5 text-xs">Complete before reporting:</p>
                  <ul className="space-y-0.5">
                    {carrierMissing.map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        </>
      }
    />
    {/* ── Operational Summary strip ─────────────────────────────────────── */}
    {/* Each KPI is clickable — switches tab + scrolls to the relevant section */}
    <div className="border-b border-border/50 bg-muted/20 flex items-center gap-0 overflow-x-auto px-6 py-2 shrink-0">
      {([
        // ── Workflow KPIs ─────────────────────────────────────────────────
        { label: "Carrier Submission Stage", value: claimStatusText,                              testid: "ops-stage",     nav: () => navigateToTab("overview",   "card-claim-workflow"),             tip: "Go to Carrier Submission Workflow (Overview)" },
        { label: "Readiness",      value: readinessPct != null ? `${readinessPct}%` : "—",      testid: "ops-readiness", nav: () => navigateToTab("overview",   "card-claim-readiness"),            tip: "Go to Claim Readiness (Overview)" },
        { label: "Open Items",     value: openItemCount != null ? String(openItemCount) : "—",  testid: "ops-open",      nav: () => navigateToTab("overview",   "card-claim-readiness"),            tip: "View required items (Overview)", alert: !!(openItemCount && openItemCount > 0) },
        // ── Descriptive attributes (plain text) ──────────────────────────
        { label: "Claim Type",     value: claimTypeLabel,                                       testid: "ops-claim-type",nav: () => navigateToTab("overview",   "field-claimCategory", "general_info"), tip: "Go to Claim Type (General Info)" },
        { label: "Severity",       value: severityRaw || "—",                                   testid: "ops-severity",  nav: () => navigateToTab("overview",   "field-severity",      "general_info"), tip: "Go to Severity (General Info)" },
        // ── Financial / Evidence shortcuts ────────────────────────────────
        { label: "Est. Damage",    value: estimatedDamageStr,                                   testid: "ops-damage",    nav: () => navigateToTab("financials"),                                     tip: "Open Financials tab" },
        { label: "Photos",         value: String(photoCount),                                   testid: "ops-photos",    nav: () => navigateToTab("evidence",   "section-photos"),                  tip: "Go to Photos (Evidence)" },
        { label: "Documents",      value: String(docCount),                                     testid: "ops-docs",      nav: () => navigateToTab("evidence",   "section-documents"),               tip: "Go to Documents (Evidence)" },
      ] as { label: string; value: string; testid: string; nav: () => void; tip: string; alert?: boolean }[]).map((kpi, i) => (
        <div key={kpi.label} className="flex items-center shrink-0">
          {i > 0 && <div className="h-4 w-px bg-border mx-5 shrink-0" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex flex-col gap-0.5 text-left hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                onClick={kpi.nav}
                data-testid={kpi.testid}
              >
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none">
                  {kpi.label}
                </span>
                <span className={`text-[13px] font-semibold leading-none underline decoration-dashed decoration-muted-foreground/30 underline-offset-2 ${kpi.alert ? "text-destructive" : "text-foreground"}`}>
                  {kpi.value}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{kpi.tip}</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>

    {/* Quick Actions Bar */}
    <ClaimQuickActionsBar
      noBleed
      accidentId={accidentId!}
      onUploadComplete={handleUploadComplete}
      currentClaimStatus={(accident as any).claimStatus}
      onTransitionComplete={() => {
        queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      }}
      onExpandAll={() => setCollapsedSections(new Set())}
    />
    </div>{/* end sticky command zone */}


    {/* ─── Claim body (searchable) ─────────────────────────────── */}
    <div data-testid="claim-detail-body">

    {/* ─── Tab Layout + Sticky Sidebar ──────────────────────────── */}
    <div className="flex items-start">

      {/* ── Left: tabbed content ── */}
      <div className="flex-1 min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

          {/* Tab bar */}
          <div className="border-b border-border bg-background sticky top-[72px] z-10">
            <div className="overflow-x-auto">
              <TabsList className="h-9 bg-transparent rounded-none gap-0 px-4 w-max">
                <TabsTrigger value="overview"       className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Overview</TabsTrigger>
                <TabsTrigger value="investigation"  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Investigation</TabsTrigger>
                <TabsTrigger value="evidence"       className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Evidence</TabsTrigger>
                <TabsTrigger value="financials"     className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Financials</TabsTrigger>
                <TabsTrigger value="communications" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Communications</TabsTrigger>
                <TabsTrigger value="timeline"       className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Timeline</TabsTrigger>
                <TabsTrigger value="documents"      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Documents</TabsTrigger>
                <TabsTrigger value="ai"             className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">AI</TabsTrigger>
                <TabsTrigger value="audit"          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10">Audit Log</TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════ */}
          {/* OVERVIEW TAB                                        */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="p-4 space-y-3 mt-0">

    {/* ─── Missing Required Information Banner ────────────────── */}
    {missingItems.length > 0 && (
      <div
        className="flex items-start gap-3 px-4 py-3 bg-destructive/5 border border-destructive/20 rounded-md"
        data-testid="banner-missing-info"
        role="alert"
      >
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">Missing Required Information</p>
          <ul className="space-y-0.5">
            {missingItems.map((item) => (
              <li key={item} className="text-xs text-destructive/80" data-testid={`missing-item-${item.replace(/\s+/g, "-").toLowerCase()}`}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )}

    {/* ─── Insurance Routing Suggestion Banner ───────────────── */}
    {showInsuranceSuggestionBanner && (
      <div
        className="flex items-start gap-3 px-4 py-3 bg-muted border border-border/60 rounded-md"
        data-testid="banner-insurance-suggestion"
        role="alert"
      >
        <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-semibold text-foreground">Insurance Claim Suggested</p>
          <p className="text-xs text-muted-foreground">This incident may exceed the insurance deductible. Consider classifying as an Insurance Claim.</p>
        </div>
      </div>
    )}


    {/* ─── PRIMARY ZONE: Claim Summary + Intelligence ─────────── */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 border-b border-border/50 items-stretch">
      <ClaimSummaryPanel groups={summaryGroups} />
      <ClaimIntelligencePanel
        data={intelligenceData}
        onChipClick={(label) => {
          if (label === "Cost Exposure")     navigateToField("card-repair-estimates", "repair_estimates");
          else if (label === "Evidence")     navigateToField("card-attachments", "attachments");
          else if (label === "Insurance Status") { const el = carrierSectionRef.current; if (el) flashElement(el); }
          else if (label === "Risk Level")   navigateToField("card-legal-readiness", "legal_readiness");
        }}
        onMissingItemClick={(item) => {
          const i = item.toLowerCase();
          if (i.includes("driver") && !i.includes("statement")) navigateToField("field-driverName", "general_info");
          else if (i.includes("customer") || i.includes("account")) navigateToField("field-customer", "general_info");
          else if (i.includes("photo"))           navigateToField("card-attachments", "attachments");
          else if (i.includes("document") || i.includes("supporting")) navigateToField("card-attachments", "attachments");
          else if (i.includes("vehicle"))         navigateToField("field-incidentType", "general_info");
          else if (i.includes("police"))          navigateToField("card-attachments", "attachments");
          else if (i.includes("statement") || i.includes("notes") || i.includes("driver statement")) navigateToField("card-claim-notes", "claim_notes");
          else if (i.includes("injury"))          navigateToField("card-claim-review");
          else if (i.includes("loss description") || i.includes("description")) navigateToField("card-claim-notes", "claim_notes");
          else if (i.includes("claim form") || i.includes("generated")) { const el = carrierSectionRef.current; if (el) flashElement(el); }
          else navigateToField("card-claim-review");
        }}
      />
    </div>


      {/* Claim Readiness Indicator */}
      <ClaimReadinessCard
        accidentId={accidentId!}
        isAuthenticated={isAuthenticated}
        accident={accident}
        onScrollToCarrier={() => carrierSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        onItemClick={(fieldKey) => {
          const testId = READINESS_TO_TESTID[fieldKey];
          if (!testId) return;
          navigateToField(testId, TESTID_TO_SECTION[testId]);
        }}
      />


      {/* Claim Workflow Stage Engine */}
      <Card data-testid="card-claim-workflow">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 pt-3 px-5">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-[15px] font-semibold">Claim Workflow</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-5 pb-3">
          <ClaimWorkflowPanel
            claimId={accidentId!}
            currentStatus={(accident as any).claimStatus}
            onTransitionComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
            }}
          />
        </CardContent>
      </Card>


            {/* ── Financial Snapshot ── */}
            <Card>
              <CardHeader className="pb-1.5 pt-3 px-5">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <CardTitle className="text-[15px] font-semibold">Financial Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-5 pb-3">
                {!accident.damageEst1 && !accident.totalEstimate && !accident.probableCost && !accident.actualCost && !(accident as any).estimatedDamageAmount ? (
                  <p className="text-xs text-muted-foreground py-1">No financial data recorded yet.</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {(accident as any).estimatedDamageAmount ? (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Est. Damage</span>
                        <span className="text-xs font-semibold tabular-nums">{formatCurrency((accident as any).estimatedDamageAmount)}</span>
                      </div>
                    ) : null}
                    {accident.damageEst1 ? (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Estimate 1</span>
                        <span className="text-xs font-semibold tabular-nums">{formatCurrency(accident.damageEst1)}</span>
                      </div>
                    ) : null}
                    {accident.totalEstimate ? (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Total Est.</span>
                        <span className="text-xs font-semibold tabular-nums">{formatCurrency(accident.totalEstimate)}</span>
                      </div>
                    ) : null}
                    {accident.probableCost ? (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Reserve</span>
                        <span className="text-xs font-semibold tabular-nums">{formatCurrency(accident.probableCost)}</span>
                      </div>
                    ) : null}
                    {accident.actualCost ? (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Actual Cost</span>
                        <span className="text-xs font-semibold tabular-nums">{formatCurrency(accident.actualCost)}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

      {/* Claim Auto Narrative */}
      <ClaimNarrativeCard
        claimId={accidentId!}
        claimStatus={(accident as any).claimStatus}
      />


      {/* Claim Alerts & Risk Flags */}
      <ClaimAlertsPanel claimId={accidentId!} />


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* INVESTIGATION TAB                                   */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="investigation" className="p-4 space-y-3 mt-0">

      {/* Litigation Hold Banner (Ticket 5) */}
      {litigationHold?.litigationHoldActive && (
        <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20" data-testid="card-litigation-hold-active">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-red-700 dark:text-red-300">Litigation Hold Active</h3>
                  <Badge variant="destructive" className="text-xs">
                    {litigationHold.litigationHoldTrigger === 'auto_injury' ? 'Injury Flag' :
                     litigationHold.litigationHoldTrigger === 'auto_severe' ? 'Severe Claim' :
                     litigationHold.litigationHoldTrigger === 'auto_attorney_letter' ? 'Attorney Letter' :
                     'Manual'}
                  </Badge>
                </div>
                <p className="text-sm text-red-600/80 dark:text-red-300/70">
                  {litigationHold.litigationHoldReason || 'Evidence and documents are preserved - editing restricted'}
                </p>
                {litigationHold.litigationHoldActivatedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activated: {formatDateTime(litigationHold.litigationHoldActivatedAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLitigationAudit(!showLitigationAudit)}
                data-testid="button-litigation-audit"
              >
                <History className="h-4 w-4 mr-1" />
                Audit Log
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLegalPacketMutation.mutate()}
                disabled={exportLegalPacketMutation.isPending}
                data-testid="button-export-legal-packet"
              >
                {exportLegalPacketMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-1" />
                )}
                Export Legal Packet
              </Button>
              {isAdmin && (
                <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-release-hold">
                      <Unlock className="h-4 w-4 mr-1" />
                      Release Hold
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Release Litigation Hold</DialogTitle>
                      <DialogDescription>
                        Provide a reason for releasing the litigation hold. This action will be logged.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="release-reason">Release Reason (required)</Label>
                        <Textarea
                          id="release-reason"
                          value={releaseReason}
                          onChange={(e) => setReleaseReason(e.target.value)}
                          placeholder="e.g., Case settled, No litigation pursued, etc."
                          className="mt-1"
                          data-testid="input-release-reason"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowReleaseDialog(false)}>Cancel</Button>
                      <Button
                        onClick={() => releaseHoldMutation.mutate({ reason: releaseReason })}
                        disabled={!releaseReason.trim() || releaseHoldMutation.isPending}
                        data-testid="button-confirm-release"
                      >
                        {releaseHoldMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Release Hold
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardContent>
          {showLitigationAudit && litigationAuditLog.length > 0 && (
            <CardContent className="pt-0">
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Audit Trail</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {litigationAuditLog.map((entry) => (
                    <div key={entry.id} className="text-xs p-2 bg-background rounded border">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          {entry.actionType.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="text-muted-foreground mt-1">{entry.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}


      {/* GL Claimant Contact Restriction Banner */}
      {(accident as any).claimType === "general_liability" && accident.claimStatus !== "CLOSED" && (
        <Card className="border-border" data-testid="card-gl-contact-restriction">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">CLAIMANT CONTACT RESTRICTION</h3>
                <p className="text-sm text-muted-foreground">
                  This is a General Liability claim.{" "}
                  <span className="font-semibold">Do NOT contact the claimant directly.</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  All communication must be handled by the carrier/adjuster or broker per reporting instructions.
                </p>
                <p className="text-sm text-muted-foreground">
                  Contacting the claimant may create legal exposure.
                </p>
                {(!((accident as any).carrierSubmissionStatus) ||
                  !["REPORTED", "ACKNOWLEDGED", "ADJUSTER_ASSIGNED", "CLOSED"].includes((accident as any).carrierSubmissionStatus)) && (
                  <p className="text-sm font-medium text-destructive mt-2 border-t border-border/50 pt-2" data-testid="text-gl-not-reported-warning">
                    This claim has not yet been marked as reported to the carrier.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* GL Compliance Training Section */}
      <GLComplianceTraining accident={accident} accidentId={accidentId!} />


      {/* Carrier Handling Mode */}
      <CarrierHandlingModeCard accident={accident} accidentId={accidentId!} isAdmin={isAdmin} />


      {/* Legal Readiness Controls (when not on hold) */}
      {!litigationHold?.litigationHoldActive && (
        <Card data-testid="card-legal-readiness">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection("legal_readiness")}>
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle className="text-[15px] font-semibold">Legal Readiness</CardTitle>
              <SectionIcon k="legal_readiness" />
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("legal_readiness") ? "-rotate-90" : ""}`} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!litigationHold?.attorneyLetterReceived && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recordAttorneyLetterMutation.mutate()}
                  disabled={recordAttorneyLetterMutation.isPending}
                  data-testid="button-record-attorney-letter"
                >
                  {recordAttorneyLetterMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <MailWarning className="h-4 w-4 mr-1" />
                  )}
                  Record Attorney Letter
                </Button>
              )}
              <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-activate-hold">
                    <Lock className="h-4 w-4 mr-1" />
                    Activate Hold
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Activate Litigation Hold</DialogTitle>
                    <DialogDescription>
                      Activating a litigation hold will lock evidence and restrict modifications to this claim.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="hold-reason">Reason (required)</Label>
                      <Textarea
                        id="hold-reason"
                        value={holdReason}
                        onChange={(e) => setHoldReason(e.target.value)}
                        placeholder="e.g., Anticipated litigation, Attorney involvement, etc."
                        className="mt-1"
                        data-testid="input-hold-reason"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowHoldDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => activateHoldMutation.mutate({ reason: holdReason, triggerType: 'manual' })}
                      disabled={!holdReason.trim() || activateHoldMutation.isPending}
                      data-testid="button-confirm-activate"
                    >
                      {activateHoldMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Activate Hold
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLegalPacketMutation.mutate()}
                disabled={exportLegalPacketMutation.isPending}
                data-testid="button-export-packet-inactive"
              >
                {exportLegalPacketMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-1" />
                )}
                Export Legal Packet
              </Button>
            </div>
          </CardHeader>
          <CardContent className={collapsedSections.has("legal_readiness") ? "hidden" : ""}>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={litigationHold?.injuryFlag ? "injury_reported" : "no_injury"}
                  label={litigationHold?.injuryFlag ? "Injury Reported" : "No Injury"}
                  data-testid="badge-injury"
                />
              </div>
              <div className="flex items-center gap-2" data-testid="badge-severity">
                <span className="text-sm font-medium">
                  Severity: {effectiveSeverity ? effectiveSeverity.charAt(0).toUpperCase() + effectiveSeverity.slice(1) : "Not Set"}
                </span>
                {severityIsOverridden && (
                  <span className="text-xs text-muted-foreground">Overridden</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={litigationHold?.attorneyLetterReceived ? "attorney_letter_received" : "no_injury"}
                  label={litigationHold?.attorneyLetterReceived ? "Attorney Letter Received" : "No Attorney Letter"}
                  data-testid="badge-attorney"
                />
              </div>
            </div>
            {litigationAuditLog.length > 0 && (
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLitigationAudit(!showLitigationAudit)}
                  data-testid="button-view-litigation-history"
                >
                  <History className="h-4 w-4 mr-1" />
                  {showLitigationAudit ? 'Hide' : 'View'} History ({litigationAuditLog.length})
                </Button>
                {showLitigationAudit && (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {litigationAuditLog.map((entry) => (
                      <div key={entry.id} className="text-xs p-2 bg-muted rounded">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {entry.actionType.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        {entry.reason && (
                          <p className="text-muted-foreground mt-1">{entry.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Drug Test Panel (Ticket 6) */}
      <Card data-testid="card-drug-test">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection("drug_test")}>
            <FlaskConical className="h-5 w-5 text-primary" />
            <CardTitle className="text-[15px] font-semibold">Drug Test</CardTitle>
            {drugTest?.drugTestRequired && getDrugTestStatusBadge(drugTest.drugTestStatus)}
            {drugTest?.isOverdue && (
              <Badge variant="destructive" className="ml-2" data-testid="badge-drug-test-overdue">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {drugTest.daysOverdue} Days Overdue
              </Badge>
            )}
            <SectionIcon k="drug_test" />
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("drug_test") ? "-rotate-90" : ""}`} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!drugTest?.drugTestRequired && (
              <Dialog open={showDrugTestRequireDialog} onOpenChange={setShowDrugTestRequireDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-require-drug-test">
                    <FlaskConical className="h-4 w-4 mr-1" />
                    Require Drug Test
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Require Drug Test</DialogTitle>
                    <DialogDescription>
                      The driver will be notified and given 24 hours to complete a drug test.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="drug-test-reason">Reason (required)</Label>
                      <Textarea
                        id="drug-test-reason"
                        value={drugTestRequireReason}
                        onChange={(e) => setDrugTestRequireReason(e.target.value)}
                        placeholder="e.g., Post-accident policy requirement, DOT requirement, etc."
                        className="mt-1"
                        data-testid="input-drug-test-reason"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDrugTestRequireDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => requireDrugTestMutation.mutate({ reason: drugTestRequireReason })}
                      disabled={!drugTestRequireReason.trim() || requireDrugTestMutation.isPending}
                      data-testid="button-confirm-require-drug-test"
                    >
                      {requireDrugTestMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Require Test
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {drugTest?.drugTestRequired && !['completed', 'waived'].includes(drugTest.drugTestStatus || '') && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendDrugTestMutation.mutate()}
                  disabled={resendDrugTestMutation.isPending}
                  data-testid="button-resend-notification"
                >
                  {resendDrugTestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Resend Notification
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => completeDrugTestMutation.mutate()}
                      disabled={completeDrugTestMutation.isPending}
                      data-testid="button-complete-drug-test"
                    >
                      {completeDrugTestMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-1" />
                      )}
                      Mark Completed
                    </Button>
                    <Dialog open={showDrugTestWaiveDialog} onOpenChange={setShowDrugTestWaiveDialog}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid="button-waive-drug-test">
                          <XCircle className="h-4 w-4 mr-1" />
                          Waive
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Waive Drug Test Requirement</DialogTitle>
                          <DialogDescription>
                            Provide a reason for waiving this drug test requirement. This action will be logged.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <Label htmlFor="waive-reason">Reason (required)</Label>
                            <Textarea
                              id="waive-reason"
                              value={drugTestWaiveReason}
                              onChange={(e) => setDrugTestWaiveReason(e.target.value)}
                              placeholder="e.g., Not applicable, Medical exemption, etc."
                              className="mt-1"
                              data-testid="input-waive-reason"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowDrugTestWaiveDialog(false)}>Cancel</Button>
                          <Button
                            variant="destructive"
                            onClick={() => waiveDrugTestMutation.mutate({ reason: drugTestWaiveReason })}
                            disabled={!drugTestWaiveReason.trim() || waiveDrugTestMutation.isPending}
                            data-testid="button-confirm-waive"
                          >
                            {waiveDrugTestMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Waive Requirement
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className={collapsedSections.has("drug_test") ? "hidden" : ""}>
          {drugTest?.drugTestRequired ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ReadOnlyField
                  testId="field-drug-test-required-at"
                  label="Required At"
                  value={drugTest.drugTestRequiredAt ? formatDateTime(drugTest.drugTestRequiredAt) : undefined}
                />
                <ReadOnlyField
                  testId="field-drug-test-due-by"
                  label="Due By"
                  value={drugTest.drugTestDueBy ? formatDateTime(drugTest.drugTestDueBy) : undefined}
                  valueClass={drugTest.isOverdue ? "text-destructive font-semibold" : undefined}
                />
                <ReadOnlyField
                  testId="field-drug-test-last-notified"
                  label="Last Notified"
                  value={drugTest.drugTestLastNotifiedAt ? formatDateTime(drugTest.drugTestLastNotifiedAt) : undefined}
                />
                <ReadOnlyField
                  testId="field-drug-test-acknowledged"
                  label="Acknowledged"
                  value={drugTest.drugTestAcknowledgedAt ? formatDateTime(drugTest.drugTestAcknowledgedAt) : "Not yet"}
                />
              </div>
              {drugTest.drugTestRequiredReason && (
                <ReadOnlyField
                  testId="field-drug-test-reason"
                  label="Reason"
                  value={drugTest.drugTestRequiredReason}
                />
              )}
              {drugTest.drugTestStatus === 'waived' && drugTest.drugTestWaivedReason && (
                <div data-testid="field-drug-test-waived-reason" className="p-3 bg-muted rounded border border-border/50">
                  <p className="text-sm font-medium text-foreground">Waive Reason</p>
                  <p className="mt-1 text-sm text-muted-foreground">{drugTest.drugTestWaivedReason}</p>
                </div>
              )}
              {drugTest.drugTestStatus === 'completed' && drugTest.drugTestCompletedAt && (
                <div data-testid="field-drug-test-completed" className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Completed</p>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    {formatDateTime(drugTest.drugTestCompletedAt)}
                  </p>
                </div>
              )}
              {drugTestAuditLog.length > 0 && (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDrugTestAudit(!showDrugTestAudit)}
                    data-testid="button-view-drug-test-history"
                  >
                    <History className="h-4 w-4 mr-1" />
                    {showDrugTestAudit ? 'Hide' : 'View'} History ({drugTestAuditLog.length})
                  </Button>
                  {showDrugTestAudit && (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {drugTestAuditLog.map((entry) => (
                        <div key={entry.id} className="text-xs p-2 bg-muted rounded">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {entry.actionType.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-muted-foreground">
                              {formatDateTime(entry.createdAt)}
                            </span>
                          </div>
                          {entry.reason && (
                            <p className="text-muted-foreground mt-1">{entry.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No drug test required for this claim. Use the button above to manually require a test if needed.
            </p>
          )}
        </CardContent>
      </Card>


          {/* General Information Section */}
          <Card data-testid="card-general-info">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4 cursor-pointer select-none" onClick={() => toggleSection("general_info")}>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">General Information</CardTitle>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SectionIcon k="general_info" />
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("general_info") ? "-rotate-90" : ""}`} />
              </div>
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("general_info") ? "hidden" : ""}`}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div data-testid="field-accidentDate">
                  <EditableField
                    label="Date of Incident"
                    value={parseFormDate(accident.accidentDate)}
                    fieldName="accidentDate"
                    type="date"
                    required
                    onSave={(fieldName, value) => {
                      const date = new Date(value);
                      updateAccidentMutation.mutate({
                        [fieldName]: value,
                        monthOfIncident: getMonthName(date),
                        yearOfIncident: getFullYear(date),
                      });
                    }}
                    isSaving={updateAccidentMutation.isPending}
                  />
                </div>
                <ReadOnlyField
                  testId="field-monthOfIncident"
                  label="Month of Incident"
                  value={accident.monthOfIncident || getMonthName(accident.accidentDate)}
                />
                <ReadOnlyField
                  testId="field-yearOfIncident"
                  label="Year of Incident"
                  value={accident.yearOfIncident || getFullYear(accident.accidentDate)}
                />
                <SelectableField
                  label="Resolution Status"
                  value={accident.status}
                  fieldName="status"
                  options={statusOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                  testId="field-resolutionStatus"
                />
                <EditableField
                  label="Zendesk Ticket #"
                  value={accident.zendeskTicketNumber}
                  fieldName="zendeskTicketNumber"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Move ID"
                  value={accident.redcapId}
                  fieldName="redcapId"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                {/* Linked Move - for Claim-Move Traceability */}
                <div data-testid="field-linkedMove">
                  <p className="text-xs font-medium text-muted-foreground">Linked Move</p>
                  <div className="mt-1">
                    {moveLoading ? (
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    ) : linkedMove ? (
                      <Link href={`/trips/${linkedMove.id}`}>
                        <Button variant="outline" size="sm" data-testid="button-view-move">
                          <Truck className="h-4 w-4 mr-1" />
                          {linkedMove.moveNumber || 'View Move'}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">No move linked</span>
                    )}
                  </div>
                </div>
                <SelectableField
                  label="Execution System"
                  value={(accident as any).executionSystem}
                  fieldName="executionSystem"
                   options={claimExecutionSystemOptions}
                   legacyValueLabels={claimExecutionSystemLegacyValueLabels}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>

              <Separator />

              {/* Incident Classification fields */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div data-testid="field-incidentType">
                  <SelectableField
                    label="Incident Type"
                    value={accident.incidentType}
                    fieldName="incidentType"
                    options={claimIncidentTypeOptions}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                    required
                  />
                </div>
                <div data-testid="field-severity">
                  <SelectableField
                    label="Claim Severity"
                    value={severityEstimate}
                    fieldName="severityEstimate"
                    options={severityEstimateOptions}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                    labelBadge={<FieldReqBadge status={fieldReqs.driver_statement?.status} reason="Affects driver statement & photo requirements" />}
                  />
                  {computedSeverity && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {severityIsOverridden
                        ? `Auto-calculated: ${computedSeverity.charAt(0).toUpperCase() + computedSeverity.slice(1)} — manually overridden`
                        : "Calculated from estimated cost"}
                    </p>
                  )}
                </div>
                <div data-testid="field-liabilityFault">
                  <SelectableField
                    label="Liability / Fault"
                    value={(accident as any).liabilityFault}
                    fieldName="liabilityFault"
                    options={liabilityFaultOptions}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                    labelBadge={<FieldReqBadge status={fieldReqs.driverRemediation?.status} reason="Affects driver remediation & third-party info requirements" />}
                  />
                </div>
                <div data-testid="field-claimCategory">
                  <SelectableField
                    label="Claim Type"
                    value={(accident as any).claimCategory}
                    fieldName="claimCategory"
                    options={claimCategoryOptions}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                    labelBadge={<FieldReqBadge status={fieldReqs.police_report?.status} reason="Affects police report requirement" />}
                  />
                </div>
                <SelectableField
                  label="Damage Location"
                  value={(accident as any).damageLocation}
                  fieldName="damageLocation"
                  options={damageLocationOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Estimated Damage Amount"
                  value={(accident as any).estimatedDamageAmount != null ? String((accident as any).estimatedDamageAmount) : ""}
                  fieldName="estimatedDamageAmount"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <SelectableField
                  label="Preventability"
                  value={(accident as any).preventability}
                  fieldName="preventability"
                  options={preventabilityOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>
              
              <Separator />
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div data-testid="field-driverName" className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Driver Name<span className="text-red-500 ml-0.5" title="Required field">*</span>
                  </p>
                  <DriverSearchCombobox
                    accidentId={accidentId!}
                    currentDriverId={accident.driverId}
                    currentDriverName={
                      accident.driver?.user
                        ? `${accident.driver.user.firstName || ''} ${accident.driver.user.lastName || ''}`.trim()
                        : undefined
                    }
                    onDriverChanged={(driverId) => changeDriverMutation.mutate({ driverId })}
                    disabled={changeDriverMutation.isPending}
                  />
                  {changeDriverMutation.isPending && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Updating driver…
                    </span>
                  )}
                  {accident.driver?.id && (
                    <div className="mt-1">
                      <ActiveSafetyFlagsBadges driverId={accident.driver.id} />
                    </div>
                  )}
                </div>
                <SelectableField
                  label="Driver Classification"
                  value={driverClassification}
                  fieldName="driverClassification"
                  options={driverClassificationOptions}
                  onSave={(fieldName, value) => {
                    updateAccidentMutation.mutate({
                      [fieldName]: value,
                      employeeId: value === "employee" ? (accident as any).employeeId : null,
                      independentContractorId: value === "independent_contractor" ? (accident as any).independentContractorId : null,
                    });
                  }}
                  isSaving={updateAccidentMutation.isPending}
                />
                {isEmployee && (
                  <EditableField
                    label="Employee ID"
                    value={(accident as any).employeeId}
                    fieldName="employeeId"
                    onSave={(fieldName, value) => {
                      const validation = validateDriverId("employee", value);
                      if (value && !validation.valid) {
                        toast({
                          title: "Invalid Employee ID",
                          description: "No active employee driver found with this Employee ID.",
                          variant: "destructive",
                        });
                        return;
                      }
                      handleFieldSave(fieldName, value);
                    }}
                    isSaving={updateAccidentMutation.isPending}
                  />
                )}
                {isIC && (
                  <EditableField
                    label="Independent Contractor ID"
                    value={(accident as any).independentContractorId}
                    fieldName="independentContractorId"
                    onSave={(fieldName, value) => {
                      const validation = validateDriverId("ic", value);
                      if (value && !validation.valid) {
                        toast({
                          title: "Invalid IC ID",
                          description: "No active independent contractor found with this ID.",
                          variant: "destructive",
                        });
                        return;
                      }
                      handleFieldSave(fieldName, value);
                    }}
                    isSaving={updateAccidentMutation.isPending}
                  />
                )}
                {!isEmployee && !isIC && (
                  <div className="text-sm text-muted-foreground italic">
                    Select a Driver Classification to enter ID
                  </div>
                )}
                <SelectableField
                  label="DoD At Fault"
                  value={accident.dodAtFault}
                  fieldName="dodAtFault"
                  options={atFaultOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>
              
              <Separator />
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div data-testid="field-location">
                  <EditableField
                    label="Location"
                    value={accident.location}
                    fieldName="location"
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                    required
                  />
                </div>
                <div data-testid="field-customer">
                  <CustomerSearchCombobox
                    currentCustomerId={(accident as any).customerId}
                    currentCustomerName={customerName}
                    onSelect={(id) => handleFieldSave("customerId", id)}
                    disabled={updateAccidentMutation.isPending}
                  />
                </div>
                <SelectableField
                  label="Vehicle Involved"
                  value={accident.vehicleInvolved}
                  fieldName="vehicleInvolved"
                  options={vehicleInvolvedOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                  required
                />
              </div>
              
              <Separator />
              
              {/* Submitted By Information — read-only system fields */}
              <div className="grid sm:grid-cols-2 gap-4">
                <ReadOnlyField
                  testId="field-submittedBy"
                  label="Incident Submitted By"
                  value={accident.reporter
                    ? `${accident.reporter.firstName} ${accident.reporter.lastName}`
                    : "Unknown"}
                />
                <ReadOnlyField
                  testId="field-submittedAt"
                  label="Date & Time Submitted"
                  value={accident.createdAt ? formatDateTime(accident.createdAt) : undefined}
                />
              </div>
            </CardContent>
          </Card>


          {/* Claim Review Section */}
          <ClaimReviewSection
            accident={accident}
            onSave={(field, value) => updateAccidentMutation.mutate({ [field]: value })}
            isSaving={updateAccidentMutation.isPending}
            currentUserId={user?.userId}
          />


          {/* Triage & Severity Classification */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection("triage")}>
                <AlertOctagon className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Triage & Severity</CardTitle>
                <SectionIcon k="triage" />
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("triage") ? "-rotate-90" : ""}`} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => recalculateTriageMutation.mutate()}
                  disabled={recalculateTriageMutation.isPending}
                  data-testid="button-recalculate-triage"
                >
                  {recalculateTriageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ml-1">Recalculate</span>
                </Button>
                {isAdmin && (
                  <Dialog open={showTriageOverride} onOpenChange={setShowTriageOverride}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setOverrideSeverity(triageInfo?.triageSeverity || "");
                          setOverrideInjury(triageInfo?.injuryFlag || false);
                          setOverrideDrivable(triageInfo?.drivableFlag ?? true);
                          setOverrideReason("");
                        }}
                        data-testid="button-override-triage"
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Override Triage Classification</DialogTitle>
                        <DialogDescription>
                          Admin override of automatic triage. A reason is required for audit purposes.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="override-severity">Severity Level</Label>
                          <Select value={overrideSeverity} onValueChange={setOverrideSeverity}>
                            <SelectTrigger id="override-severity" data-testid="select-override-severity">
                              <SelectValue placeholder="Select severity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minor">Minor – Under $2,500</SelectItem>
                              <SelectItem value="moderate">Moderate – $2,500 to $9,999</SelectItem>
                              <SelectItem value="major">Major – $10,000+</SelectItem>
                              <SelectItem value="catastrophic">Catastrophic – Authorized only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="override-injury">Injury Reported</Label>
                          <Switch 
                            id="override-injury" 
                            checked={overrideInjury} 
                            onCheckedChange={setOverrideInjury}
                            data-testid="switch-override-injury"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="override-drivable">Vehicle Drivable</Label>
                          <Switch 
                            id="override-drivable" 
                            checked={overrideDrivable} 
                            onCheckedChange={setOverrideDrivable}
                            data-testid="switch-override-drivable"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="override-reason">Override Reason (required, min 10 chars)</Label>
                          <Textarea
                            id="override-reason"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Explain why this override is necessary..."
                            className="min-h-[80px]"
                            data-testid="textarea-override-reason"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowTriageOverride(false)}>Cancel</Button>
                        <Button
                          onClick={() => {
                            triageOverrideMutation.mutate({
                              triageSeverity: overrideSeverity || undefined,
                              injuryFlag: overrideInjury,
                              drivableFlag: overrideDrivable,
                              overrideReason,
                            });
                            if (overrideSeverity) {
                              updateAccidentMutation.mutate({ severityEstimate: overrideSeverity });
                            }
                          }}
                          disabled={overrideReason.length < 10 || triageOverrideMutation.isPending}
                          data-testid="button-confirm-override"
                        >
                          {triageOverrideMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Apply Override
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("triage") ? "hidden" : ""}`}>
              {triageLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : triageInfo ? (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Severity</p>
                      <div className="flex items-center gap-2">
                        {(effectiveSeverity === 'major' || effectiveSeverity === 'catastrophic') ? (
                          <Badge className="bg-destructive text-destructive-foreground" data-testid="badge-triage-severity">
                            {effectiveSeverity.toUpperCase()}
                          </Badge>
                        ) : (
                          <span className="text-sm font-medium" data-testid="badge-triage-severity">
                            {effectiveSeverity?.toUpperCase() || "NOT SET"}
                          </span>
                        )}
                        {severityIsOverridden && (
                          <span className="text-xs text-muted-foreground">Overridden</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Managed via Claim Severity in General Information</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Workflow</p>
                      <p className="text-sm font-medium" data-testid="text-triage-workflow">
                        {triageInfo.workflow || "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Decision Time</p>
                      <p className="text-sm" data-testid="text-triage-decision-time">
                        {triageInfo.triageDecisionAt ? formatDateTime(triageInfo.triageDecisionAt) : "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Owner</p>
                      <p className="text-sm" data-testid="text-triage-owner">
                        {triageInfo.triageOwner 
                          ? `${triageInfo.triageOwner.firstName || ""} ${triageInfo.triageOwner.lastName || ""}`.trim() || triageInfo.triageOwner.email
                          : "Unassigned"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Ambulance className={`h-4 w-4 ${triageInfo.injuryFlag ? 'text-red-500' : 'text-muted-foreground opacity-40'}`} />
                      <span className={`text-sm ${triageInfo.injuryFlag ? 'font-medium' : 'text-muted-foreground'}`} data-testid="text-injury-flag">
                        Injury: {triageInfo.injuryFlag ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Car className={`h-4 w-4 ${!triageInfo.drivableFlag ? 'text-destructive' : 'text-muted-foreground opacity-40'}`} />
                      <span className={`text-sm ${!triageInfo.drivableFlag ? 'font-medium' : 'text-muted-foreground'}`} data-testid="text-drivable-flag">
                        Drivable: {triageInfo.drivableFlag ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bell className={`h-4 w-4 ${triageInfo.carrierNotificationRequired ? 'text-foreground' : 'text-muted-foreground opacity-40'}`} />
                      <span className={`text-sm ${triageInfo.carrierNotificationRequired ? 'font-medium' : 'text-muted-foreground'}`} data-testid="text-carrier-notification">
                        Carrier Notification: {triageInfo.carrierNotificationRequired ? "Required" : "Not Required"}
                      </span>
                    </div>
                  </div>

                  {triageInfo.override && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-md border">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Admin Override Applied</p>
                          <p className="text-xs text-muted-foreground">
                            By {triageInfo.override.overrideBy 
                              ? `${triageInfo.override.overrideBy.firstName || ""} ${triageInfo.override.overrideBy.lastName || ""}`.trim() || triageInfo.override.overrideBy.email
                              : "Unknown"} on {formatDateTime(triageInfo.override.overrideAt)}
                          </p>
                          <p className="text-sm mt-1" data-testid="text-override-reason">
                            Reason: {triageInfo.override.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No triage information available</p>
              )}

              <Separator />

              {/* Claim Outcome and Abandoned flag */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectableField
                  label="Claim Outcome"
                  value={(accident as any).claimOutcome}
                  fieldName="claimOutcome"
                  options={claimOutcomeOptions}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <div className="flex flex-col gap-2 justify-end pb-1" data-testid="field-abandonedFlag">
                  <p className="text-xs font-medium text-muted-foreground">Abandoned</p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="flag-abandoned-triage"
                      checked={!!(accident as any).abandonedFlag}
                      onCheckedChange={(checked) => handleFieldSave("abandonedFlag", !!checked)}
                      disabled={updateAccidentMutation.isPending || isReadOnly}
                      data-testid="checkbox-abandonedFlag"
                    />
                    <label htmlFor="flag-abandoned-triage" className="text-sm leading-none cursor-pointer">
                      Mark as abandoned
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Customer Risk Snapshot (Ticket 3) */}
          {accident.customerId && (
            <Card data-testid="card-customer-risk">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Customer Risk Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {riskLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : customerRiskData?.riskBand && customerRiskData.riskBand !== 'unknown' ? (
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Risk Band</p>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            customerRiskData.riskBand === 'critical' ? 'bg-red-600 text-white' :
                            customerRiskData.riskBand === 'high' ? 'bg-destructive text-destructive-foreground' :
                            customerRiskData.riskBand === 'medium' ? 'bg-muted-foreground/80 text-white' :
                            'bg-emerald-600 text-white'
                          } data-testid="badge-risk-band">
                            {customerRiskData.riskBand?.toUpperCase()}
                          </Badge>
                          {customerRiskData.scoreTrend === 'improving' && <TrendingDown className="h-4 w-4 text-green-500" />}
                          {customerRiskData.scoreTrend === 'worsening' && <TrendingUp className="h-4 w-4 text-red-500" />}
                          {customerRiskData.scoreTrend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Normalized Score</p>
                        <p className="text-sm font-medium" data-testid="text-normalized-score">
                          {parseFloat(customerRiskData.normalizedScore || "0").toFixed(0)}%
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Claims/1000 Moves (180d)</p>
                        <p className="text-sm" data-testid="text-claims-per-1000">
                          {parseFloat(customerRiskData.claimsPer1000Moves180d || "0").toFixed(2)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Claims (180d)</p>
                        <p className="text-sm">
                          {customerRiskData.totalClaims180d} / {customerRiskData.totalMoves180d} moves
                        </p>
                      </div>
                    </div>

                    {customerRiskData.contractPressureFlags && customerRiskData.contractPressureFlags.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {customerRiskData.contractPressureFlags.map((flag) => (
                          <Badge key={flag} variant="outline" className="text-muted-foreground">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {flag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="pt-2">
                      <Link href={`/accounts/${accident.customerId}?tab=claims`}>
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Full Customer Profile
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground text-sm">No risk score calculated yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Risk scores are calculated based on claims history.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}


          {/* Driver Incident & Remediation (unified section) */}
          <Card data-testid="card-driver-incident-remediation">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection("driver_remediation")}>
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Driver Incident & Remediation</CardTitle>
                <FieldReqBadge status={fieldReqs.driverRemediation?.status} reason={fieldReqs.driverRemediation?.reason} inline />
                <SectionIcon k="driver_remediation" />
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("driver_remediation") ? "-rotate-90" : ""}`} />
              </div>
              {!remediationData?.incident && (
                <Dialog open={showCreateIncident} onOpenChange={setShowCreateIncident}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="button-create-incident">
                      <Plus className="h-4 w-4 mr-1" />
                      Create Incident
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Driver Incident Record</DialogTitle>
                      <DialogDescription>
                        Link this claim to a driver incident record for tracking and corrective actions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="preventable-flag">Preventable Incident</Label>
                        <Switch 
                          id="preventable-flag" 
                          checked={incidentPreventable} 
                          onCheckedChange={setIncidentPreventable}
                          data-testid="switch-preventable"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="incident-notes">Notes</Label>
                        <Textarea
                          id="incident-notes"
                          value={incidentNotes}
                          onChange={(e) => setIncidentNotes(e.target.value)}
                          placeholder="Add notes about this incident..."
                          className="min-h-[80px]"
                          data-testid="textarea-incident-notes"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setShowCreateIncident(false)}>Cancel</Button>
                      <Button
                        onClick={() => createIncidentMutation.mutate({ preventableFlag: incidentPreventable, notes: incidentNotes })}
                        disabled={createIncidentMutation.isPending}
                        data-testid="button-confirm-create-incident"
                      >
                        {createIncidentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Create Incident
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("driver_remediation") ? "hidden" : ""}`}>
              {/* A) Incident Summary Block */}
              {remediationLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : remediationData?.incident ? (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Severity</p>
                      <Badge className={
                        remediationData.incident.severity === 'severe' ? 'bg-destructive text-destructive-foreground' :
                        remediationData.incident.severity === 'moderate' ? 'bg-muted text-muted-foreground' :
                        'bg-muted text-muted-foreground'
                      }>
                        {remediationData.incident.severity?.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Preventable</p>
                      <p className={`text-sm font-medium ${remediationData.incident.preventableFlag ? 'text-destructive' : 'text-emerald-600'}`}>
                        {remediationData.incident.preventableFlag ? "Yes" : "No"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Incident Date</p>
                      <p className="text-sm">{formatDate(remediationData.incident.incidentDate)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Safety Review</p>
                      <p className={`text-sm ${remediationData.incident.safetyReviewRequired ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {remediationData.incident.safetyReviewRequired ? "Required" : "Not Required"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Corrective Actions</h4>
                      <Dialog open={showCreateAction} onOpenChange={setShowCreateAction}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" data-testid="button-add-action">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Action
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Corrective Action</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Action Type</Label>
                              <Select value={newActionType} onValueChange={setNewActionType}>
                                <SelectTrigger data-testid="select-action-type">
                                  <SelectValue placeholder="Select action type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="coaching_required">Coaching Required</SelectItem>
                                  <SelectItem value="training_required">Training Required</SelectItem>
                                  <SelectItem value="probation">Probation</SelectItem>
                                  <SelectItem value="suspension">Suspension</SelectItem>
                                  <SelectItem value="termination_recommended">Termination Recommended</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Due Date</Label>
                              <Input 
                                type="date" 
                                value={newActionDueDate} 
                                onChange={(e) => setNewActionDueDate(e.target.value)}
                                data-testid="input-action-due-date"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Notes</Label>
                              <Textarea
                                value={newActionNotes}
                                onChange={(e) => setNewActionNotes(e.target.value)}
                                placeholder="Add notes..."
                                data-testid="textarea-action-notes"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="ghost" onClick={() => setShowCreateAction(false)}>Cancel</Button>
                            <Button
                              onClick={() => createCorrectiveActionMutation.mutate({ 
                                actionType: newActionType, 
                                dueDate: newActionDueDate || undefined, 
                                notes: newActionNotes || undefined 
                              })}
                              disabled={!newActionType || createCorrectiveActionMutation.isPending}
                              data-testid="button-confirm-add-action"
                            >
                              {createCorrectiveActionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                              Add Action
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {remediationData.correctiveActions.length > 0 ? (
                      <div className="space-y-2">
                        {remediationData.correctiveActions.map((action) => (
                          <div key={action.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border" data-testid={`action-${action.id}`}>
                            <div className="flex items-center gap-3">
                              {action.actionType === 'coaching_required' && <MessageCircle className="h-4 w-4 text-muted-foreground" />}
                              {action.actionType === 'training_required' && <GraduationCap className="h-4 w-4 text-primary" />}
                              {action.actionType === 'probation' && <ShieldAlert className="h-4 w-4 text-destructive" />}
                              {action.actionType === 'suspension' && <UserX className="h-4 w-4 text-destructive" />}
                              {action.actionType === 'termination_recommended' && <XCircle className="h-4 w-4 text-red-500" />}
                              <div>
                                <p className="text-sm font-medium">{action.actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                                <p className="text-xs text-muted-foreground">
                                  {action.dueDate && `Due: ${formatDate(action.dueDate)}`}
                                  {action.automationRule && ` | Auto-created: ${action.automationRule}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={
                                action.status === 'completed' ? 'bg-emerald-600 text-white' :
                                action.status === 'in_progress' ? 'bg-muted-foreground/80 text-white' :
                                action.status === 'waived' ? 'bg-muted text-muted-foreground' :
                                'bg-destructive text-destructive-foreground'
                              }>
                                {action.status}
                              </Badge>
                              {action.status !== 'completed' && action.status !== 'waived' && (
                                <Select 
                                  value="" 
                                  onValueChange={(val) => updateActionStatusMutation.mutate({ actionId: action.id, status: val })}
                                >
                                  <SelectTrigger className="w-[120px] h-8" data-testid={`select-status-${action.id}`}>
                                    <SelectValue placeholder="Update" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {action.status === 'open' && <SelectItem value="in_progress">Start</SelectItem>}
                                    <SelectItem value="completed">Complete</SelectItem>
                                    <SelectItem value="waived">Waive</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No corrective actions assigned</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4" data-testid="no-incident-message">
                  <p className="text-muted-foreground text-sm">No driver incident record created yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Create an incident to track corrective actions.</p>
                </div>
              )}

              <Separator />

              {/* B) Remediation & Compliance Block */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <EditableField
                  label="Driver Payment %"
                  value={accident.driverPaymentPercent}
                  fieldName="driverPaymentPercent"
                  type="percent"
                  maxLength={7}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <SelectableField
                  label="Paid Not Closed"
                  value={(accident as any).paidNotClosedStatus || ""}
                  fieldName="paidNotClosedStatus"
                  options={[
                    { value: "loss_yes_salvage", label: "(- Loss) Yes - Salvage" },
                    { value: "loss_yes_subro", label: "(- Loss) Yes - Subro" },
                    { value: "gain_yes_addtl", label: "(+ Loss) Yes - Addtl Claim" },
                    { value: "gain_yes_subro", label: "(+ Loss) Yes - Subro" },
                  ]}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Driver Drug Testing</h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <SelectableField
                    label="Drug Test Requested"
                    value={accident.driverDrugTestRequested}
                    fieldName="driverDrugTestRequested"
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                  />
                  <EditableField
                    label="Test Requested Date"
                    value={parseFormDate(accident.driverDrugTestRequestedDate)}
                    fieldName="driverDrugTestRequestedDate"
                    type="date"
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                  />
                  <SelectableField
                    label="Drug Test Results"
                    value={accident.driverDrugTestResults}
                    fieldName="driverDrugTestResults"
                    options={[
                      { value: "positive", label: "Positive" },
                      { value: "negative", label: "Negative" },
                      { value: "pending", label: "Pending" },
                      { value: "refused", label: "Refused" },
                    ]}
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                  />
                  <EditableField
                    label="Test Results Date"
                    value={parseFormDate(accident.driverDrugTestResultsDate)}
                    fieldName="driverDrugTestResultsDate"
                    type="date"
                    onSave={handleFieldSave}
                    isSaving={updateAccidentMutation.isPending}
                  />
                </div>
              </div>
              
              <Separator />
              
              {/* C) Incident Comments */}
              <CommentsSection
                title="Incident Comments"
                accidentId={accident.id}
                comments={(accident as any).incidentCommentsHistory || []}
                onAddComment={(comment) => {
                  addIncidentCommentMutation.mutate(comment);
                }}
                isSaving={addIncidentCommentMutation.isPending}
                testIdPrefix="incident"
              />
            </CardContent>
          </Card>


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* EVIDENCE TAB                                        */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="evidence" className="p-4 space-y-3 mt-0">

          {/* Photos & Documents Section */}
          <Card data-testid="card-attachments">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4 cursor-pointer select-none" onClick={() => toggleSection("attachments")}>
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <Paperclip className="h-5 w-5 text-primary shrink-0" />
                <CardTitle className="text-[15px] font-semibold">Attachments</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {accident.attachments?.length || 0} total
                </Badge>
                {photoCount > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {photoCount} photo{photoCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {docCount > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {docCount} doc{docCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {(accident.claimStatus === "CLOSED" || accident.claimStatus === "DENIED") && (
                  <Badge variant="outline" className="text-xs">Read-only</Badge>
                )}
                {legalHoldStatus?.isHeld && (
                  <Badge variant="destructive" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Litigation Hold
                  </Badge>
                )}
                {evidenceStatus === "complete" ? (
                  <Badge variant="outline" className="text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30" data-testid="badge-evidence-status-header">
                    <CheckCircle2 className="h-3 w-3" />
                    Evidence Complete
                  </Badge>
                ) : evidenceStatus === "incomplete" ? (
                  <Badge variant="outline" className="text-xs gap-1 text-muted-foreground" data-testid="badge-evidence-status-header">
                    <AlertCircle className="h-3 w-3" />
                    Incomplete
                  </Badge>
                ) : evidenceStatus === "missing_photos" ? (
                  <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30" data-testid="badge-evidence-status-header">
                    <AlertCircle className="h-3 w-3" />
                    Missing Photos
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30" data-testid="badge-evidence-status-header">
                    <AlertCircle className="h-3 w-3" />
                    No Evidence
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SectionIcon k="attachments" />
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("attachments") ? "-rotate-90" : ""}`} />
              </div>
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("attachments") ? "hidden" : ""}`}>
            {/* Evidence Status detail row */}
            <div className="flex items-center gap-2 flex-wrap" data-testid="evidence-status-bar">
              <span className="text-xs font-medium text-muted-foreground">Evidence Status:</span>
              {evidenceStatus === "complete" && (
                <Badge variant="outline" className="text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30" data-testid="badge-evidence-complete">
                  <CheckCircle2 className="h-3 w-3" />
                  Complete
                </Badge>
              )}
              {evidenceStatus === "incomplete" && (
                <>
                  <Badge variant="outline" className="text-xs gap-1 text-muted-foreground" data-testid="badge-evidence-incomplete">
                    <AlertCircle className="h-3 w-3" />
                    Incomplete
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid="text-uncategorized-count">
                    {uncategorizedCount} file{uncategorizedCount !== 1 ? "s" : ""} need{uncategorizedCount === 1 ? "s" : ""} category assignment
                  </span>
                </>
              )}
              {evidenceStatus === "missing_photos" && (
                <>
                  <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30" data-testid="badge-evidence-missing-photos">
                    <AlertCircle className="h-3 w-3" />
                    Missing Photos
                  </Badge>
                  {docCount === 0 && (
                    <span className="text-xs text-muted-foreground">No evidence uploaded</span>
                  )}
                  {docCount > 0 && uncategorizedCount > 0 && (
                    <span className="text-xs text-muted-foreground">{uncategorizedCount} file{uncategorizedCount !== 1 ? "s" : ""} uncategorized</span>
                  )}
                </>
              )}
              {evidenceStatus === "no_evidence" && (
                <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30" data-testid="badge-evidence-no-evidence">
                  <AlertCircle className="h-3 w-3" />
                  No Evidence Uploaded
                </Badge>
              )}
            </div>
            {/* ─── Evidence Volume Counters ─────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap" data-testid="evidence-volume-counters">
              <span className="text-xs font-medium text-muted-foreground">Volume:</span>
              <div className="flex items-center gap-1.5" data-testid="evidence-count-photos">
                <FileImage className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Photos:</span>
                <span className={`text-xs font-semibold tabular-nums ${photoCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {photoCount}
                </span>
              </div>
              <span className="text-muted-foreground/40 text-xs">•</span>
              <div className="flex items-center gap-1.5" data-testid="evidence-count-documents">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Documents:</span>
                <span className={`text-xs font-semibold tabular-nums ${docCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {docCount}
                </span>
              </div>
              <span className="text-muted-foreground/40 text-xs">•</span>
              <div className="flex items-center gap-1.5" data-testid="evidence-count-videos">
                <Film className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Videos:</span>
                <span className={`text-xs font-semibold tabular-nums ${videoCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {videoCount}
                </span>
              </div>
              {activeAttachments.length > 0 && (
                <>
                  <span className="text-muted-foreground/40 text-xs">•</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{activeAttachments.length}</span> total
                  </span>
                </>
              )}
            </div>
            {/* Photo Quality Flags */}
            <div className="flex flex-wrap gap-6 pt-1" data-testid="photo-quality-flags">
              <div className="flex items-center gap-2" data-testid="field-noPhotosFlag">
                <Checkbox
                  id="flag-no-photos"
                  checked={!!(accident as any).noPhotosFlag}
                  onCheckedChange={(checked) => handleFieldSave("noPhotosFlag", !!checked)}
                  disabled={updateAccidentMutation.isPending || isReadOnly}
                  data-testid="checkbox-noPhotosFlag"
                />
                <label htmlFor="flag-no-photos" className="text-sm font-medium leading-none cursor-pointer">
                  No Photos
                </label>
              </div>
              <div className="flex items-center gap-2" data-testid="field-poorPhotosFlag">
                <Checkbox
                  id="flag-poor-photos"
                  checked={!!(accident as any).poorPhotosFlag}
                  onCheckedChange={(checked) => handleFieldSave("poorPhotosFlag", !!checked)}
                  disabled={updateAccidentMutation.isPending || isReadOnly}
                  data-testid="checkbox-poorPhotosFlag"
                />
                <label htmlFor="flag-poor-photos" className="text-sm font-medium leading-none cursor-pointer">
                  Poor Photos
                </label>
              </div>
            </div>
            {/* Evidence Lock Banner */}
            {isEvidenceLocked && (
              <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-2">
                <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">
                    Evidence Lock Active — documents cannot be deleted without dual approval
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(accident as any)?.litigationHoldActive
                      ? 'Litigation hold is active.'
                      : isStatusLocked
                      ? `Claim status (${accident?.claimStatus}) automatically locks evidence.`
                      : 'Evidence lock was manually enabled.'}
                    {canDelete && ' Use the unlock icon on an attachment to request a deletion override.'}
                  </p>
                </div>
                {canDelete && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowOverridesPanel(!showOverridesPanel)}
                      data-testid="button-toggle-overrides-panel"
                    >
                      {showOverridesPanel ? 'Hide' : 'View'} Overrides ({overridesList.length})
                    </Button>
                    {!(accident as any)?.litigationHoldActive && !isStatusLocked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEvidenceLockDialog(true)}
                        data-testid="button-toggle-evidence-lock"
                      >
                        <Unlock className="h-3 w-3 mr-1" />
                        Disable Lock
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {!isEvidenceLocked && canDelete && (
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEvidenceLockDialog(true)}
                  data-testid="button-enable-evidence-lock"
                  className="text-muted-foreground"
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Enable Evidence Lock
                </Button>
              </div>
            )}

            {/* Override Approval Panel */}
            {showOverridesPanel && canDelete && (
              <div className="rounded-md border mb-3 p-3">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  Deletion Override Requests
                </h4>
                {overridesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No override requests for this claim.</p>
                ) : (
                  <div className="space-y-2">
                    {overridesList.map((ov: any) => (
                      <div key={ov.id} className="rounded-md border p-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium">{ov.attachmentFileName || 'Attachment'}</span>
                          <Badge variant={ov.status === 'approved' ? 'default' : ov.status === 'rejected' ? 'destructive' : 'secondary'}>
                            {ov.isExpired ? 'expired' : ov.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mb-1">
                          Requested by {ov.requesterName} — {ov.requestReason}
                        </p>
                        {ov.approvalNotes && (
                          <p className="text-muted-foreground">Notes: {ov.approvalNotes}</p>
                        )}
                        {ov.status === 'pending' && approvingOverrideId === ov.id ? (
                          <div className="mt-2 space-y-1">
                            <Textarea
                              placeholder="Approval/rejection notes..."
                              value={approvalNotes}
                              onChange={(e) => setApprovalNotes(e.target.value)}
                              className="text-xs min-h-[60px]"
                              data-testid="input-approval-notes"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveOverrideMutation.mutate({ overrideId: ov.id, notes: approvalNotes })}
                                disabled={approveOverrideMutation.isPending}
                                data-testid={`button-approve-override-${ov.id}`}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectOverrideMutation.mutate({ overrideId: ov.id, notes: approvalNotes })}
                                disabled={rejectOverrideMutation.isPending || !approvalNotes.trim()}
                                data-testid={`button-reject-override-${ov.id}`}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setApprovingOverrideId(null); setApprovalNotes(""); }}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : ov.status === 'pending' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => setApprovingOverrideId(ov.id)}
                            data-testid={`button-review-override-${ov.id}`}
                          >
                            Review
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Photo Gallery ─────────────────────────────────────── */}
            <div data-testid="section-photos">
              <ClaimPhotoGallery
                attachments={accident?.attachments || []}
                isReadOnly={isReadOnly}
                onUploadComplete={isReadOnly ? undefined : handleUploadComplete}
                onCategoryChange={isReadOnly ? undefined : handleCategoryChange}
                onSaveAnnotations={isReadOnly ? undefined : handleSaveAnnotations}
                accidentId={accidentId}
                canDelete={canDelete}
                onDelete={(attachmentId) => {
                  if (!canDelete) return;
                  const att = accident?.attachments?.find((a: any) => a.id === attachmentId);
                  setDeleteTarget({ id: attachmentId, fileName: att?.fileName || "Photo" });
                }}
              />
            </div>

            {/* ── Document List ─────────────────────────────────────── */}
            <div data-testid="section-documents">
              <EvidenceDocumentList
                attachments={accident?.attachments || []}
                onDownload={handleDocumentDownload}
                onDelete={(attachmentId) => {
                  if (!canDelete) return;
                  const att = accident?.attachments?.find((a: any) => a.id === attachmentId);
                  setDeleteTarget({ id: attachmentId, fileName: att?.fileName || "Attachment" });
                }}
                canDelete={canDelete}
                isEvidenceLocked={isEvidenceLocked}
                isReadOnly={isReadOnly}
                onUploadComplete={isReadOnly ? undefined : handleUploadComplete}
                onCategoryChange={isReadOnly ? undefined : handleCategoryChange}
              />
            </div>

            {/* ── Upload & Manage by Category ───────────────────────── */}
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Upload &amp; Manage by Category</p>
            </div>

            {CATEGORY_ORDER.map((cat) => (
              <div key={cat} id={`photo-category-${cat}`}>
              <CategorySection
                key={cat}
                category={cat}
                attachments={attachmentsByCategory[cat] || []}
                categoryMetaRecord={categoryMeta?.find((m: any) => m.category === cat)}
                onSaveMeta={(data) => saveCategoryMetaMutation.mutate(data)}
                isSavingMeta={saveCategoryMetaMutation.isPending}
                onUploadComplete={handleUploadComplete}
                onReplace={(attachmentId) => { setReplacingAttachmentId(attachmentId); setShowUploader(false); }}
                onDelete={(attachmentId) => {
                  if (!canDelete) return;
                  const att = accident?.attachments?.find((a: any) => a.id === attachmentId);
                  setDeleteTarget({ id: attachmentId, fileName: att?.fileName || 'Attachment' });
                }}
                onRequestOverride={(attachmentId, fileName) => {
                  setOverrideTarget({ attachmentId, fileName });
                  setOverrideReason("");
                  setOverrideConfirmed(false);
                }}
                isDeleting={deleteAttachmentMutation.isPending}
                replacingAttachmentId={replacingAttachmentId}
                onReplaceComplete={handleReplaceComplete}
                onCancelReplace={() => setReplacingAttachmentId(null)}
                claimStatus={accident.claimStatus || ""}
                isLitigationHeld={!!legalHoldStatus?.isHeld}
                isEvidenceLocked={isEvidenceLocked}
                canDelete={canDelete}
                accidentId={accidentId || ""}
                reqStatus={fieldReqs[cat]?.status}
                reqReason={fieldReqs[cat]?.reason}
                enrichedById={enrichedById}
              />
              </div>
            ))}
            </CardContent>
          </Card>


          {/* Evidence Chain Section */}
          <Card data-testid="card-evidence-chain">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              <CardTitle className="text-[15px] font-semibold">Evidence Chain of Custody</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <EvidenceChainViewer claimId={accidentId} maxHeight="500px" isSuperAdmin={isSuperAdmin || isRootSuperAdmin} />
            </CardContent>
          </Card>


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* FINANCIALS TAB                                      */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="financials" className="p-4 space-y-3 mt-0">

          {/* Estimated Claim Impact Section */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle className="text-[15px] font-semibold">Estimated Claim Impact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <EditableField
                  label="Damage Estimate 1"
                  value={accident.damageEst1}
                  fieldName="damageEst1"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Damage Estimate 2"
                  value={accident.damageEst2}
                  fieldName="damageEst2"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Property Estimate"
                  value={accident.propertyDamage}
                  fieldName="propertyDamage"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Total Estimate"
                  value={accident.totalEstimate}
                  fieldName="totalEstimate"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Probable Cost"
                  value={accident.probableCost}
                  fieldName="probableCost"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Actual Cost"
                  value={accident.actualCost}
                  fieldName="actualCost"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>
            </CardContent>
          </Card>


          {/* Repair Estimates Section */}
          <Card data-testid="card-repair-estimates">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4 cursor-pointer select-none" onClick={() => toggleSection("repair_estimates")}>
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Repair Estimates</CardTitle>
                {repairEstimatesList.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">({repairEstimatesList.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); setShowAddEstimate(v => !v); }}
                  data-testid="button-add-repair-estimate"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Estimate
                </Button>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("repair_estimates") ? "-rotate-90" : ""}`} />
              </div>
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("repair_estimates") ? "hidden" : ""}`}>
              {/* Add Estimate Form */}
              {showAddEstimate && (
                <div className="rounded-md border bg-muted/30 p-4 space-y-3" data-testid="form-add-repair-estimate">
                  <p className="text-sm font-medium">New Repair Estimate</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Repair Vendor</Label>
                      <Input
                        value={estVendorName}
                        onChange={e => setEstVendorName(e.target.value)}
                        placeholder="e.g. ABC Collision"
                        data-testid="input-est-vendor-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Estimate Date</Label>
                      <Input
                        type="date"
                        value={estDate}
                        onChange={e => setEstDate(e.target.value)}
                        data-testid="input-est-date"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Estimate Amount ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={estAmount}
                        onChange={e => setEstAmount(e.target.value)}
                        placeholder="0.00"
                        data-testid="input-est-amount"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={estStatus} onValueChange={setEstStatus}>
                        <SelectTrigger data-testid="select-est-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="estimate_received">Estimate Received</SelectItem>
                          <SelectItem value="approved_for_repair">Approved for Repair</SelectItem>
                          <SelectItem value="repair_in_progress">Repair In Progress</SelectItem>
                          <SelectItem value="repair_completed">Repair Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                    <Textarea
                      value={estNotes}
                      onChange={e => setEstNotes(e.target.value)}
                      placeholder="Additional details..."
                      className="min-h-[72px] resize-none"
                      data-testid="textarea-est-notes"
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowAddEstimate(false)} data-testid="button-cancel-add-estimate">Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => addEstimateMutation.mutate({ vendorName: estVendorName, estimateDate: estDate, estimateAmount: estAmount, repairStatus: estStatus, notes: estNotes })}
                      disabled={addEstimateMutation.isPending}
                      data-testid="button-save-add-estimate"
                    >
                      {addEstimateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      Save Estimate
                    </Button>
                  </div>
                </div>
              )}

              {/* Estimates List */}
              {estimatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading estimates…
                </div>
              ) : repairEstimatesList.length === 0 && !showAddEstimate ? (
                <p className="text-sm text-muted-foreground text-center py-4">No repair estimates recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {repairEstimatesList.map(est => (
                    <div key={est.id} className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid={`card-estimate-${est.id}`}>
                      {editingEstimateId === est.id ? (
                        /* Inline edit form */
                        <EstimateEditForm
                          estimate={est}
                          onSave={(data) => updateEstimateMutation.mutate({ id: est.id, data })}
                          onCancel={() => setEditingEstimateId(null)}
                          isSaving={updateEstimateMutation.isPending}
                        />
                      ) : (
                        /* Read view */
                        <>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="space-y-0.5 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {est.vendorDisplayName || est.vendorName || "Unknown Vendor"}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {est.estimateDate && (
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(est.estimateDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </span>
                                )}
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REPAIR_STATUS_COLORS[est.repairStatus] ?? "bg-muted text-muted-foreground"}`} data-testid={`badge-est-status-${est.id}`}>
                                  {REPAIR_STATUS_LABELS[est.repairStatus] ?? est.repairStatus}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {est.estimateAmount && (
                                <span className="text-sm font-semibold text-foreground" data-testid={`text-est-amount-${est.id}`}>
                                  ${parseFloat(est.estimateAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => setEditingEstimateId(est.id)} data-testid={`button-edit-estimate-${est.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => { if (confirm("Remove this estimate?")) deleteEstimateMutation.mutate(est.id); }}
                                disabled={deleteEstimateMutation.isPending}
                                data-testid={`button-delete-estimate-${est.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          {est.notes && (
                            <p className="text-xs text-muted-foreground">{est.notes}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Supplemental Estimates Section */}
              <div className="pt-2 border-t space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Supplemental Estimates</p>
                    {supplementsList.length > 0 && (
                      <span className="text-xs text-muted-foreground font-normal">({supplementsList.length})</span>
                    )}
                  </div>
                  {!showAddSupplement && (
                    <Button size="sm" variant="outline" onClick={() => setShowAddSupplement(true)} data-testid="button-add-supplement">
                      <Plus className="h-3 w-3 mr-1" /> Add Supplement
                    </Button>
                  )}
                </div>

                {showAddSupplement && (
                  <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">New Supplemental Estimate</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Supplement Date</Label>
                        <Input type="date" value={suppDate} onChange={e => setSuppDate(e.target.value)} data-testid="input-supp-date" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Amount ($)</Label>
                        <Input type="number" min="0" step="0.01" value={suppAmount} onChange={e => setSuppAmount(e.target.value)} placeholder="0.00" data-testid="input-supp-amount" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Reason</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={suppReason}
                        onChange={e => setSuppReason(e.target.value)}
                        data-testid="select-supp-reason"
                      >
                        <option value="">Select reason…</option>
                        <option value="Hidden Structural Damage">Hidden Structural Damage</option>
                        <option value="Suspension Damage">Suspension Damage</option>
                        <option value="Brake / Rotor Damage">Brake / Rotor Damage</option>
                        <option value="Wheel / Axle Damage">Wheel / Axle Damage</option>
                        <option value="Additional Body Damage">Additional Body Damage</option>
                        <option value="Paint / Blend Requirement">Paint / Blend Requirement</option>
                        <option value="Mechanical Damage">Mechanical Damage</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                      <Textarea value={suppNotes} onChange={e => setSuppNotes(e.target.value)} placeholder="Additional details…" className="text-sm min-h-[60px]" data-testid="textarea-supp-notes" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Supplement Document (optional)</Label>
                      {suppDocPath ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">{suppDocName || "Document uploaded"}</span>
                          <Button size="sm" variant="ghost" onClick={() => { setSuppDocPath(null); setSuppDocName(null); }} data-testid="button-supp-doc-remove">Remove</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            className="text-xs"
                            disabled={suppDocUploading}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleSuppDocUpload(f); }}
                            data-testid="input-supp-doc"
                          />
                          {suppDocUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddSupplement(false); setSuppDate(""); setSuppAmount(""); setSuppReason(""); setSuppNotes(""); setSuppDocPath(null); setSuppDocName(null); }} data-testid="button-supp-cancel">Cancel</Button>
                      <Button size="sm" onClick={() => addSupplementMutation.mutate({ supplementDate: suppDate, supplementAmount: suppAmount, supplementReason: suppReason, documentPath: suppDocPath, notes: suppNotes })} disabled={addSupplementMutation.isPending || suppDocUploading} data-testid="button-supp-save">
                        {addSupplementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                        Save Supplement
                      </Button>
                    </div>
                  </div>
                )}

                {supplementsList.length > 0 && (
                  <div className="space-y-2">
                    {supplementsList.map((supp, idx) => {
                      const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                      const fmtCur = (v: string | null) => v ? parseFloat(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }) : "—";
                      return (
                        <div key={supp.id} className="rounded-md border bg-muted/10 p-3 space-y-1" data-testid={`card-supplement-${supp.id}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">Supplement {idx + 1}</span>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteSupplementMutation.mutate(supp.id)} disabled={deleteSupplementMutation.isPending} data-testid={`button-delete-supplement-${supp.id}`}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {supp.supplementDate && (
                              <>
                                <span className="text-xs text-muted-foreground">Date</span>
                                <span className="text-xs font-medium text-right">{fmtDate(supp.supplementDate)}</span>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">Amount</span>
                            <span className="text-xs font-semibold text-right">{fmtCur(supp.supplementAmount)}</span>
                            {supp.supplementReason && (
                              <>
                                <span className="text-xs text-muted-foreground">Reason</span>
                                <span className="text-xs font-medium text-right">{supp.supplementReason}</span>
                              </>
                            )}
                            {supp.notes && (
                              <>
                                <span className="text-xs text-muted-foreground">Notes</span>
                                <span className="text-xs text-muted-foreground text-right">{supp.notes}</span>
                              </>
                            )}
                            {supp.documentPath && (
                              <>
                                <span className="text-xs text-muted-foreground">Document</span>
                                <a href={`/api/objects${supp.documentPath}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline text-right" data-testid={`link-supp-doc-${supp.id}`}>View</a>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Supplemental Totals */}
                {supplementsList.length > 0 && (() => {
                  const totalSupp = supplementsList.reduce((sum, s) => sum + (s.supplementAmount ? parseFloat(s.supplementAmount) : 0), 0);
                  const initAmt = repairEstimatesList[0]?.estimateAmount ? parseFloat(repairEstimatesList[0].estimateAmount) : null;
                  const finalAmt = finalRepairCost ? parseFloat(String(finalRepairCost)) : null;
                  const totalApproved = finalAmt != null && finalAmt > 0 ? finalAmt : (initAmt != null ? initAmt + totalSupp : totalSupp);
                  const fmtCur = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
                  return (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2" data-testid="panel-supplement-totals">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplemental Totals</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {initAmt != null && (
                          <>
                            <span className="text-xs text-muted-foreground">Initial Estimate</span>
                            <span className="text-xs font-medium text-right" data-testid="text-supp-initial">{fmtCur(initAmt)}</span>
                          </>
                        )}
                        <>
                          <span className="text-xs text-muted-foreground">Total Supplemental Amount</span>
                          <span className="text-xs font-semibold text-right" data-testid="text-supp-total">{fmtCur(totalSupp)}</span>
                        </>
                        <>
                          <span className="text-xs font-medium">Total Approved Repair Cost</span>
                          <span className="text-xs font-bold text-right" data-testid="text-supp-approved-total">{fmtCur(totalApproved)}</span>
                        </>
                        {finalAmt != null && finalAmt > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground col-span-2 italic">(Based on saved final repair cost)</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Final Repair Fields */}
              <div className="pt-2 border-t space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Final Repair</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Final Repair Cost</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={finalRepairDisplay}
                      onChange={handleFinalRepairChange}
                      onFocus={handleFinalRepairFocus}
                      onBlur={handleFinalRepairBlur}
                      placeholder="$0.00"
                      data-testid="input-final-repair-cost"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Repair Start Date</Label>
                    <Input
                      type="date"
                      value={repairStartDate}
                      onChange={e => setRepairStartDate(e.target.value)}
                      data-testid="input-repair-start-date"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Repair Completion Date</Label>
                    <Input
                      type="date"
                      value={finalRepairDate}
                      onChange={e => setFinalRepairDate(e.target.value)}
                      data-testid="input-repair-completion-date"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveFinalRepairMutation.mutate({ finalRepairCost, repairStartDate, repairCompletionDate: finalRepairDate })}
                    disabled={saveFinalRepairMutation.isPending}
                    data-testid="button-save-final-repair"
                  >
                    {saveFinalRepairMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Final Repair
                  </Button>
                </div>

                {/* Repair Cycle Time */}
                {(() => {
                  const completionVal = finalRepairDate;
                  const startVal = repairStartDate;
                  const estDateVal = repairEstimatesList[0]?.estimateDate;
                  if (!completionVal) return null;
                  const completionMs = new Date(completionVal).getTime();
                  let cycleMs: number | null = null;
                  let basis: string | null = null;
                  if (startVal) {
                    cycleMs = completionMs - new Date(startVal).getTime();
                    basis = null;
                  } else if (estDateVal) {
                    cycleMs = completionMs - new Date(estDateVal).getTime();
                    basis = "Estimate to Completion";
                  }
                  if (cycleMs === null || cycleMs < 0) return null;
                  const cycleDays = Math.round(cycleMs / (1000 * 60 * 60 * 24));
                  const fmtDate = (d: string | Date) =>
                    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2" data-testid="panel-cycle-time">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repair Cycle Time</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {estDateVal && (
                          <>
                            <span className="text-xs text-muted-foreground">Estimate Date</span>
                            <span className="text-xs font-medium text-right" data-testid="text-cycle-estimate-date">{fmtDate(estDateVal)}</span>
                          </>
                        )}
                        {startVal && (
                          <>
                            <span className="text-xs text-muted-foreground">Repair Start Date</span>
                            <span className="text-xs font-medium text-right" data-testid="text-cycle-start-date">{fmtDate(startVal)}</span>
                          </>
                        )}
                        <>
                          <span className="text-xs text-muted-foreground">Repair Completion Date</span>
                          <span className="text-xs font-medium text-right" data-testid="text-cycle-completion-date">{fmtDate(completionVal)}</span>
                        </>
                        <>
                          <span className="text-xs text-muted-foreground">Repair Cycle Time</span>
                          <span className="text-xs font-semibold text-right" data-testid="text-cycle-days">
                            {cycleDays} {cycleDays === 1 ? "day" : "days"}
                          </span>
                        </>
                        {basis && (
                          <>
                            <span className="text-xs text-muted-foreground">Calculation Basis</span>
                            <span className="text-xs text-muted-foreground text-right" data-testid="text-cycle-basis">{basis}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Estimate Variance Summary */}
                {(() => {
                  const initialEst = repairEstimatesList[0];
                  const initAmt = initialEst?.estimateAmount ? parseFloat(initialEst.estimateAmount) : null;
                  const finalAmt = finalRepairCost ? parseFloat(String(finalRepairCost)) : null;
                  const hasInit = initAmt !== null && initAmt > 0;
                  const hasFinal = finalAmt !== null && finalAmt > 0;
                  if (!hasInit && !hasFinal) return null;
                  const variance = hasInit && hasFinal ? finalAmt! - initAmt! : null;
                  const variancePct = hasInit && hasFinal && initAmt! !== 0 ? ((finalAmt! - initAmt!) / initAmt!) * 100 : null;
                  const isOver = variance !== null && variance > 0;
                  const isUnder = variance !== null && variance < 0;
                  const fmtCurrency = (v: number) =>
                    v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
                  return (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2" data-testid="panel-estimate-variance">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estimate Variance</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {hasInit && (
                          <>
                            <span className="text-xs text-muted-foreground">Initial Estimate</span>
                            <span className="text-xs font-medium text-right" data-testid="text-initial-estimate">
                              {fmtCurrency(initAmt!)}
                              {initialEst.vendorDisplayName && (
                                <span className="text-muted-foreground ml-1 font-normal">({initialEst.vendorDisplayName})</span>
                              )}
                            </span>
                          </>
                        )}
                        {hasFinal && (
                          <>
                            <span className="text-xs text-muted-foreground">Final Repair Cost</span>
                            <span className="text-xs font-medium text-right" data-testid="text-final-repair-display">
                              {fmtCurrency(finalAmt!)}
                            </span>
                          </>
                        )}
                        {variance !== null && (
                          <>
                            <span className="text-xs text-muted-foreground">Variance</span>
                            <span
                              className={`text-xs font-semibold text-right ${isOver ? "text-red-600 dark:text-red-400" : isUnder ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                              data-testid="text-variance-amount"
                            >
                              {isOver ? "+" : ""}{fmtCurrency(variance)}
                            </span>
                          </>
                        )}
                        {variancePct !== null && (
                          <>
                            <span className="text-xs text-muted-foreground">Variance %</span>
                            <span
                              className={`text-xs font-semibold text-right ${isOver ? "text-red-600 dark:text-red-400" : isUnder ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                              data-testid="text-variance-pct"
                            >
                              {variancePct > 0 ? "+" : ""}{variancePct.toFixed(1)}%
                            </span>
                          </>
                        )}
                        {hasInit && hasFinal && variancePct === null && (
                          <>
                            <span className="text-xs text-muted-foreground">Variance %</span>
                            <span className="text-xs text-muted-foreground text-right">N/A</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>


          {/* Recovery/Subrogation Panel (Ticket 4) */}
          <Card data-testid="card-claim-recovery">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Recovery / Subrogation</CardTitle>
              </div>
              {recoveryData && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowRecoveryAudit(!showRecoveryAudit)}
                  data-testid="button-toggle-recovery-audit"
                >
                  <History className="h-4 w-4 mr-1" />
                  Audit Log
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {recoveryLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Net Claim Cost Calculation */}
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="grid sm:grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Gross Claim Cost</p>
                        <p className="text-lg font-semibold" data-testid="text-gross-cost">
                          ${parseFloat(accident.actualCost as string || accident.probableCost as string || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Recovered Amount</p>
                        <p className="text-lg font-semibold text-green-600" data-testid="text-recovered-amount">
                          -${parseFloat(recoveryData?.recoveredAmount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Net Claim Cost</p>
                        <p className="text-lg font-bold" data-testid="text-net-cost">
                          ${(parseFloat(accident.actualCost as string || accident.probableCost as string || '0') - parseFloat(recoveryData?.recoveredAmount || '0')).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recovery Fields */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Third Party At Fault</Label>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={recoveryData?.thirdPartyFault || false}
                          onCheckedChange={(checked) => saveRecoveryMutation.mutate({ thirdPartyFault: checked })}
                          disabled={saveRecoveryMutation.isPending}
                          data-testid="switch-third-party-fault"
                        />
                        <span className="text-sm">{recoveryData?.thirdPartyFault ? 'Yes' : 'No'}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Recoverable Amount</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={recoverableAmtDisplay}
                        className="h-9"
                        data-testid="input-recoverable-amount"
                        {...makeAmtHandlers(
                          setRecoverableAmtRaw,
                          setRecoverableAmtDisplay,
                          (raw) => saveRecoveryMutation.mutate({ recoverableAmount: raw }),
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Recovered Amount</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={recoveredAmtDisplay}
                        className="h-9"
                        data-testid="input-recovered-amount"
                        {...makeAmtHandlers(
                          setRecoveredAmtRaw,
                          setRecoveredAmtDisplay,
                          (raw) => saveRecoveryMutation.mutate({ recoveredAmount: raw }),
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Recovery Source</Label>
                      <Select
                        value={recoveryData?.recoverySource || ''}
                        onValueChange={(value) => saveRecoveryMutation.mutate({ recoverySource: value })}
                        disabled={saveRecoveryMutation.isPending}
                      >
                        <SelectTrigger className="h-9" data-testid="select-recovery-source">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="third_party">Third Party</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="driver">Driver</SelectItem>
                          <SelectItem value="insurer_subrogation">Insurer Subrogation</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Recovery Status</Label>
                      <Select
                        value={recoveryData?.recoveryStatus || 'not_pursued'}
                        onValueChange={(value) => saveRecoveryMutation.mutate({ recoveryStatus: value })}
                        disabled={saveRecoveryMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-recovery-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_pursued">Not Pursued</SelectItem>
                          <SelectItem value="pursuing">Pursuing</SelectItem>
                          <SelectItem value="partial_recovery">Partial Recovery</SelectItem>
                          <SelectItem value="fully_recovered">Fully Recovered</SelectItem>
                          <SelectItem value="closed_unrecoverable">Closed - Unrecoverable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Recovery Notes</Label>
                      <Textarea
                        defaultValue={recoveryData?.recoveryNotes || ''}
                        onBlur={(e) => saveRecoveryMutation.mutate({ recoveryNotes: e.target.value })}
                        placeholder="Notes about recovery efforts..."
                        className="resize-none h-20"
                        data-testid="textarea-recovery-notes"
                      />
                    </div>
                  </div>

                  {/* Timestamps */}
                  {(recoveryData?.recoveryStartedAt || recoveryData?.recoveryClosedAt) && (
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
                      {recoveryData.recoveryStartedAt && (
                        <span data-testid="text-recovery-started">Started: {formatDate(recoveryData.recoveryStartedAt)}</span>
                      )}
                      {recoveryData.recoveryClosedAt && (
                        <span data-testid="text-recovery-closed">Closed: {formatDate(recoveryData.recoveryClosedAt)}</span>
                      )}
                    </div>
                  )}

                  {/* Audit Log */}
                  {showRecoveryAudit && recoveryAuditLog.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-2">Change History</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {recoveryAuditLog.map((log) => (
                          <div key={log.id} className="text-xs bg-muted/30 rounded p-2" data-testid={`audit-log-${log.id}`}>
                            <div className="flex justify-between">
                              <span className="font-medium">{log.userName || 'System'}</span>
                              <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                            </div>
                            <p className="text-muted-foreground mt-1">
                              {log.actionType === 'CREATED' ? 'Created recovery record' :
                                log.fieldChanged ? `Changed ${log.fieldChanged.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${log.previousValue || '(empty)'} → ${log.newValue || '(empty)'}` :
                                  log.actionType}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>


          {/* Insurance Detail */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-[15px] font-semibold">Insurance Detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SelectableField
                  label="Ins Claim Submitted"
                  value={(accident as any).insuranceClaimSubmittedStatus || ""}
                  fieldName="insuranceClaimSubmittedStatus"
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "pending", label: "Pending" },
                  ]}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Claim #"
                  value={accident.insuranceClaimNumber}
                  fieldName="insuranceClaimNumber"
                  maxLength={15}
                  onSave={(fieldName, value) => {
                    const claimStatus = (accident as any).insuranceClaimSubmittedStatus;
                    if (claimStatus === "yes" && !value) {
                      toast({
                        title: "Ins Claim # Required",
                        description: "Insurance Claim # is required when Ins Claim Submitted is Yes.",
                        variant: "destructive",
                      });
                      return;
                    }
                    handleFieldSave(fieldName, value);
                  }}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Subrogation Claim"
                  value={accident.subrogationClaim}
                  fieldName="subrogationClaim"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Reserve"
                  value={accident.insuranceReserve}
                  fieldName="insuranceReserve"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Paid"
                  value={accident.insurancePaid}
                  fieldName="insurancePaid"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Total"
                  value={accident.insuranceTotal}
                  fieldName="insuranceTotal"
                  type="currency"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Date"
                  value={parseFormDate(accident.insuranceDate)}
                  fieldName="insuranceDate"
                  type="date"
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
                <EditableField
                  label="Ins Fault"
                  value={accident.insuranceFault}
                  fieldName="insuranceFault"
                  maxLength={15}
                  onSave={handleFieldSave}
                  isSaving={updateAccidentMutation.isPending}
                />
              </div>
              
              <Separator />
              
              {/* Insurance Comments - Timestamped Notes */}
              <InsuranceCommentsSection
                accidentId={accident.id}
                comments={(accident as any).insuranceCommentsHistory || []}
                onAddComment={(comment) => {
                  addInsuranceCommentMutation.mutate(comment);
                }}
                isSaving={addInsuranceCommentMutation.isPending}
              />
            </CardContent>
          </Card>


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* COMMUNICATIONS TAB                                  */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="communications" className="p-4 space-y-3 mt-0">

          {/* Claim Notes Section */}
          <Card data-testid="card-claim-notes">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4 cursor-pointer select-none" onClick={() => toggleSection("claim_notes")}>
              <div className="flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Claim Notes</CardTitle>
                {structuredNotes.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">({structuredNotes.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SectionIcon k="claim_notes" />
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${collapsedSections.has("claim_notes") ? "-rotate-90" : ""}`} />
              </div>
            </CardHeader>
            <CardContent className={`space-y-4 ${collapsedSections.has("claim_notes") ? "hidden" : ""}`}>
              {/* New note entry area */}
              <div className="space-y-2">
                <Textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value.slice(0, 5000))}
                  placeholder="Add a note..."
                  className="min-h-[100px] resize-none"
                  disabled={addClaimNoteMutation.isPending}
                  data-testid="textarea-claim-notes"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-xs ${newNoteText.length >= 4800 ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-claim-notes-count">
                    {newNoteText.length.toLocaleString()} / 5,000
                  </span>
                  <Button
                    size="sm"
                    onClick={() => addClaimNoteMutation.mutate(newNoteText)}
                    disabled={addClaimNoteMutation.isPending || !newNoteText.trim()}
                    data-testid="button-save-claim-notes"
                  >
                    {addClaimNoteMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      : <Plus className="h-4 w-4 mr-1" />}
                    Add Note
                  </Button>
                </div>
              </div>

              {/* Saved note entries */}
              {notesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notes…
                </div>
              ) : (
                <>
                  {/* Legacy plain-text notes (from the old notesReceived field) */}
                  {accident?.notesReceived?.trim() && structuredNotes.length === 0 && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Prior notes (legacy)</p>
                      <p className="text-sm whitespace-pre-wrap">{accident.notesReceived}</p>
                    </div>
                  )}

                  {structuredNotes.length === 0 && !accident?.notesReceived?.trim() && (
                    <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
                  )}

                  {structuredNotes.map((note) => {
                    const noteDate = new Date(note.createdAt);
                    const dateStr = noteDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    const timeStr = noteDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    const authorName = [note.authorFirstName, note.authorLastName].filter(Boolean).join(" ") || "Unknown";
                    return (
                      <div
                        key={note.id}
                        id={`note-entry-id-${note.id}`}
                        className="rounded-md border bg-muted/40 p-3 space-y-1"
                        data-testid={`note-entry-${note.id}`}
                      >
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{dateStr} — {timeStr}</span>
                        </div>
                        <p className="text-sm font-medium">{authorName}</p>
                        <p className="text-sm whitespace-pre-wrap">{note.noteText}</p>
                      </div>
                    );
                  })}

                  {/* Legacy notes shown alongside structured ones if both exist */}
                  {accident?.notesReceived?.trim() && structuredNotes.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <p className="text-xs text-muted-foreground italic">Prior notes (legacy, pre-migration)</p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{accident.notesReceived}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* TIMELINE TAB                                        */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="timeline" className="p-5 mt-0">
            <TimelinePanel claimId={accidentId!} onNavigate={handleTimelineNavigate} />
          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* DOCUMENTS TAB                                       */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="documents" className="p-4 space-y-3 mt-0">
            <Card data-testid="card-documents-tab">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-[15px] font-semibold">Documents</CardTitle>
                {docCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{docCount} doc{docCount !== 1 ? "s" : ""}</Badge>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <EvidenceDocumentList
                  attachments={accident?.attachments || []}
                  onDownload={handleDocumentDownload}
                  onDelete={(attachmentId) => {
                    if (!canDelete) return;
                    const att = accident?.attachments?.find((a: any) => a.id === attachmentId);
                    setDeleteTarget({ id: attachmentId, fileName: att?.fileName || "Attachment" });
                  }}
                  canDelete={canDelete}
                  isEvidenceLocked={isEvidenceLocked}
                  isReadOnly={isReadOnly}
                  onUploadComplete={isReadOnly ? undefined : handleUploadComplete}
                  onCategoryChange={isReadOnly ? undefined : handleCategoryChange}
                />
              </CardContent>
            </Card>

          {/* Carrier Submission Panel */}
          <div ref={carrierSectionRef}>
            <CarrierSubmissionPanel
              accidentId={accidentId || ""}
              accident={accident}
              isAuthenticated={isAuthenticated}
            />
          </div>


          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* AI TAB                                              */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="ai" className="p-5 mt-0">
            <ClaimIntelligencePanel
              data={intelligenceData}
              onChipClick={(label) => {
                if (label === "Cost Exposure")        navigateToField("card-repair-estimates", "repair_estimates");
                else if (label === "Evidence")        navigateToField("card-attachments", "attachments");
                else if (label === "Insurance Status") { const el = carrierSectionRef.current; if (el) flashElement(el); }
                else if (label === "Risk Level")      navigateToField("card-legal-readiness", "legal_readiness");
              }}
              onMissingItemClick={(item) => {
                const i = item.toLowerCase();
                if (i.includes("driver") && !i.includes("statement")) navigateToField("field-driverName", "general_info");
                else if (i.includes("customer") || i.includes("account")) navigateToField("field-customer", "general_info");
                else if (i.includes("photo"))            navigateToField("card-attachments", "attachments");
                else if (i.includes("document") || i.includes("supporting")) navigateToField("card-attachments", "attachments");
                else if (i.includes("vehicle"))          navigateToField("field-incidentType", "general_info");
                else if (i.includes("police"))           navigateToField("card-attachments", "attachments");
                else if (i.includes("statement") || i.includes("notes")) navigateToField("card-claim-notes", "claim_notes");
                else if (i.includes("injury"))           navigateToField("card-claim-review");
                else if (i.includes("loss description") || i.includes("description")) navigateToField("card-claim-notes", "claim_notes");
                else if (i.includes("claim form") || i.includes("generated")) { const el = carrierSectionRef.current; if (el) flashElement(el); }
                else navigateToField("card-claim-review");
              }}
            />
          </TabsContent>

          {/* ════════════════════════════════════════════════════ */}
          {/* AUDIT LOG TAB                                       */}
          {/* ════════════════════════════════════════════════════ */}
          <TabsContent value="audit" className="p-4 space-y-3 mt-0">
            {litigationAuditLog.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">Litigation Hold History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {litigationAuditLog.map((entry) => (
                      <div key={entry.id} className="text-xs p-2 bg-muted rounded">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{entry.actionType.replace(/_/g, ' ')}</Badge>
                          <span className="text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.reason && <p className="text-muted-foreground mt-1">{entry.reason}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {drugTestAuditLog.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">Drug Test History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {drugTestAuditLog.map((entry) => (
                      <div key={entry.id} className="text-xs p-2 bg-muted rounded">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{entry.actionType.replace(/_/g, ' ')}</Badge>
                          <span className="text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.reason && <p className="text-muted-foreground mt-1">{entry.reason}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {showRecoveryAudit && recoveryAuditLog.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">Recovery / Subrogation History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {recoveryAuditLog.map((log) => (
                      <div key={log.id} className="text-xs bg-muted/30 rounded p-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{log.userName || 'System'}</span>
                          <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="text-muted-foreground mt-1">
                          {log.actionType === 'CREATED' ? 'Created recovery record' :
                            log.fieldChanged ? `Changed ${log.fieldChanged.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${log.previousValue || '(empty)'} → ${log.newValue || '(empty)'}` :
                              log.actionType}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {litigationAuditLog.length === 0 && drugTestAuditLog.length === 0 && recoveryAuditLog.length === 0 ? (
              <div className="text-center py-16">
                <History className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">No audit history yet.</p>
              </div>
            ) : null}
          </TabsContent>

        </Tabs>
      </div>{/* end left tabbed content */}

      {/* ── Right: sticky sidebar ── */}
      <aside
        className="w-72 shrink-0 hidden xl:flex xl:flex-col border-l-2 border-border/40 bg-background"
        style={{ position: "sticky", top: "72px", maxHeight: "calc(100vh - 88px)", overflowY: "auto" }}
        data-testid="claim-detail-sidebar"
      >
        {/* Notifications */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/60 px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notifications</p>
        </div>
        <div className="border-b border-border/60 px-4 py-2.5">
          <ClaimAlertsPanel claimId={accidentId!} />
        </div>

        {/* Missing Items */}
        {missingItems.length > 0 ? (
          <>
            <div className="sticky top-[33px] z-10 bg-background border-b border-border/60 px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Missing Items ({missingItems.length})
              </p>
            </div>
            <div className="border-b border-border/60 px-4 py-2.5 space-y-1.5">
              {missingItems.map((item) => (
                <div key={item} className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* Activity Timeline */}
        <div className="flex-1 min-h-0">
          <div className="sticky top-[33px] z-10 bg-background border-b border-border/60 px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Activity Timeline</p>
          </div>
          <TimelinePanel claimId={accidentId!} onNavigate={handleTimelineNavigate} />
        </div>
      </aside>

    </div>{/* end flex tab + sidebar */}


    {/* Delete Attachment Dialog */}
    <DeleteAttachmentDialog
      open={!!deleteTarget}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      fileName={deleteTarget?.fileName ?? ''}
      context="Claim Attachment"
      onConfirm={(reason) => deleteTarget && deleteAttachmentMutation.mutate({ id: deleteTarget.id, reason })}
      isPending={deleteAttachmentMutation.isPending}
    />

    {/* Override Request Modal */}
    <Dialog open={!!overrideTarget} onOpenChange={(open) => { if (!open) { setOverrideTarget(null); setDeletionOverrideReason(""); setDeletionOverrideConfirmed(false); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Request Deletion Override
          </DialogTitle>
          <DialogDescription>
            This attachment is protected by an evidence lock. Deletion requires approval from a <strong>different</strong> Super Admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">File</p>
            <p className="text-sm text-muted-foreground">{overrideTarget?.fileName}</p>
          </div>
          <div>
            <Label htmlFor="deletion-override-reason">Reason for deletion <span className="text-destructive">*</span></Label>
            <Textarea
              id="deletion-override-reason"
              placeholder="Explain why this evidence-locked document must be deleted (min 10 characters)..."
              value={deletionOverrideReason}
              onChange={(e) => setDeletionOverrideReason(e.target.value)}
              className="mt-1 min-h-[80px]"
              data-testid="input-override-reason"
            />
          </div>
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="deletion-override-confirm"
              checked={deletionOverrideConfirmed}
              onChange={(e) => setDeletionOverrideConfirmed(e.target.checked)}
              data-testid="checkbox-override-confirm"
              className="mt-0.5"
            />
            <label htmlFor="deletion-override-confirm" className="text-sm text-muted-foreground">
              I understand this action affects evidence integrity and requires a second Super Admin to approve before deletion can proceed.
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOverrideTarget(null)}>Cancel</Button>
          <Button
            onClick={() => overrideTarget && requestOverrideMutation.mutate({ attachmentId: overrideTarget.attachmentId, requestReason: deletionOverrideReason })}
            disabled={!deletionOverrideConfirmed || deletionOverrideReason.trim().length < 10 || requestOverrideMutation.isPending}
            data-testid="button-submit-override-request"
          >
            {requestOverrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Override Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Evidence Lock Toggle Dialog */}
    <Dialog open={showEvidenceLockDialog} onOpenChange={(open) => { if (!open) { setShowEvidenceLockDialog(false); setEvidenceLockReason(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(accident as any)?.evidenceLock ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
            {(accident as any)?.evidenceLock ? 'Disable Evidence Lock' : 'Enable Evidence Lock'}
          </DialogTitle>
          <DialogDescription>
            {(accident as any)?.evidenceLock
              ? 'Removing the evidence lock will allow Super Admin attachment deletion without dual approval (litigation hold and status locks are unaffected).'
              : 'Enabling evidence lock will require dual Super Admin approval for any attachment deletion on this claim.'}
          </DialogDescription>
        </DialogHeader>
        {!(accident as any)?.evidenceLock && (
          <div>
            <Label htmlFor="lock-reason">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="lock-reason"
              placeholder="Why is this evidence lock being applied? (min 10 characters)"
              value={evidenceLockReason}
              onChange={(e) => setEvidenceLockReason(e.target.value)}
              className="mt-1"
              data-testid="input-evidence-lock-reason"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEvidenceLockDialog(false)}>Cancel</Button>
          <Button
            variant={(accident as any)?.evidenceLock ? 'default' : 'destructive'}
            onClick={() => toggleEvidenceLockMutation.mutate({ enabled: !(accident as any)?.evidenceLock, reason: evidenceLockReason })}
            disabled={!(accident as any)?.evidenceLock && evidenceLockReason.trim().length < 10 || toggleEvidenceLockMutation.isPending}
            data-testid="button-confirm-evidence-lock"
          >
            {toggleEvidenceLockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {(accident as any)?.evidenceLock ? 'Disable Lock' : 'Enable Lock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ─── Auto Loss Report Modal ─────────────────────────────── */}
    <AutoLossReportModal
      open={showAutoLossReport}
      onOpenChange={setShowAutoLossReport}
      accidentId={accidentId!}
      accident={accident}
      driverName={driverName}
      customerName={customerName ?? null}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'attachments'] });
      }}
    />

    {/* ─── Packet Preview Modal ───────────────────────────────── */}
    <PacketPreviewModal
      open={showPacketPreview}
      onOpenChange={setShowPacketPreview}
      accidentId={accidentId!}
      accident={accident}
      attachments={allAttachments}
      claimReadiness={claimReadiness}
      driverName={driverName}
      customerName={customerName ?? null}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
        queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'attachments'] });
      }}
      onScrollToCarrier={() => carrierSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
    />

    {/* ClaimTransitionDialog intentionally removed from action bar — managed elsewhere */}

    </div>{/* end claim-detail-body */}

    </>
  );
}
