import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/dateFormat";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronRight,
  Send,
  FileText,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  History,
  Phone,
  Mail,
  Shield,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  FileImage,
  Paperclip,
  Files,
} from "lucide-react";

interface CarrierSubmissionPanelProps {
  accidentId: string;
  accident: any;
  isAuthenticated: boolean;
  isAdmin?: boolean;
}

interface ReadinessItem {
  field: string;
  label: string;
  ready: boolean;
  required: boolean;
}

interface ReadinessData {
  items: ReadinessItem[];
  requiredReady: boolean;
  totalReady: number;
  totalItems: number;
  missingRequired: ReadinessItem[];
  openItems: number;
  readinessPercent: number;
  currentStatus: string;
}

interface SubmissionEvent {
  id: string;
  claimId: string;
  fromStatus: string;
  toStatus: string;
  action: string;
  changedByName: string;
  note: string | null;
  createdAt: string;
}

type ClaimFormType = "auto" | "general_liability";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMISSION_READY: "Submission Ready",
  PACKET_GENERATED: "Packet Generated",
  REPORTED: "Reported",
  ACKNOWLEDGED: "Acknowledged",
  ADJUSTER_ASSIGNED: "Adjuster Assigned",
  CLOSED: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMISSION_READY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PACKET_GENERATED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  REPORTED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ACKNOWLEDGED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ADJUSTER_ASSIGNED: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function InlineEdit({ label, value, fieldName, onSave, type = "text", isSaving }: {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: string) => void;
  type?: "text" | "textarea" | "date" | "time";
  isSaving?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");

  useEffect(() => {
    if (!isEditing) setEditValue(value || "");
  }, [value, isEditing]);

  const handleSave = () => {
    if (editValue !== (value || "")) {
      onSave(fieldName, editValue);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="space-y-1">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2">
          {type === "textarea" ? (
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[60px]"
              data-testid={`input-carrier-${fieldName}`}
            />
          ) : (
            <Input
              type={type === "date" ? "date" : type === "time" ? "time" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              data-testid={`input-carrier-${fieldName}`}
            />
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid={`button-save-carrier-${fieldName}`}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditValue(value || ""); setIsEditing(false); }} data-testid={`button-cancel-carrier-${fieldName}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`field-carrier-${fieldName}`}>
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div
        className="flex h-9 w-full rounded-md px-3 py-1 text-sm cursor-pointer hover:bg-muted/50 transition-colors items-center group"
        onClick={() => setIsEditing(true)}
      >
        <span className="flex-1 truncate">{value || "—"}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ml-2 flex-shrink-0" />
      </div>
    </div>
  );
}

function InlineToggle({ label, value, fieldName, onSave, isSaving }: {
  label: string;
  value: boolean | null | undefined;
  fieldName: string;
  onSave: (fieldName: string, value: boolean) => void;
  isSaving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={`field-carrier-${fieldName}`}>
      <Label className="text-sm">{label}</Label>
      <Switch
        checked={!!value}
        onCheckedChange={(checked) => onSave(fieldName, checked)}
        disabled={isSaving}
        data-testid={`switch-carrier-${fieldName}`}
      />
    </div>
  );
}

interface InjuredParty {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  extentOfInjury: string;
}

interface PropertyDamageEntry {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  typeOfDamage: string;
  extentOfDamage: string;
}

export function CarrierSubmissionPanel({ accidentId, accident, isAuthenticated, isAdmin }: CarrierSubmissionPanelProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [markReportedNotes, setMarkReportedNotes] = useState("");
  const [markReportedTo, setMarkReportedTo] = useState("");
  const [markReportedMethod, setMarkReportedMethod] = useState("");
  const [showMarkReported, setShowMarkReported] = useState(false);
  const [glAcknowledged, setGlAcknowledged] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitRecipients, setSubmitRecipients] = useState("crumandforsternol@cfins.com");
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendNotes, setResendNotes] = useState("");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set());
  const [showAttachmentSelector, setShowAttachmentSelector] = useState(false);

  const claimFormType: ClaimFormType = accident?.claimType === "general_liability" ? "general_liability" : "auto";
  const currentStatus = accident?.carrierSubmissionStatus || "DRAFT";

  // ── Context signals for inline validation guidance ────────────────────────
  // Severity: OR across both fields — matches shared deriveMajorSeverity logic in AccidentDetail
  const _estRaw          = (accident?.severityEstimate || '').toLowerCase();
  const _rawSev          = ((accident?.claimSeverity || '') as string).toUpperCase();
  const _isMajorSeverity = _rawSev === 'HIGH' || _rawSev === 'CRITICAL' || _estRaw === 'major' || _estRaw === 'catastrophic';
  const _liabilityFault  = (accident?.liabilityFault || '') as string;
  const _isNotAtFault    = _liabilityFault === 'not_at_fault';
  const _isInsuranceClaim = (accident?.claimCategory || '') === 'insurance_claim';

  const { data: readinessData, isLoading: readinessLoading } = useQuery<ReadinessData>({
    queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'],
    enabled: isAuthenticated && !!accidentId && isOpen,
  });

  const { data: submissionEvents = [], isLoading: eventsLoading } = useQuery<SubmissionEvent[]>({
    queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'],
    enabled: isAuthenticated && !!accidentId && isOpen,
  });

  const { data: claimAttachments = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/accidents', accidentId, 'attachments'],
    enabled: isAuthenticated && !!accidentId && isOpen,
  });

  const updateFieldsMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `/api/corporate/accidents/${accidentId}/carrier-submission`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Saved", description: "Carrier submission field updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update field", variant: "destructive" });
    },
  });

  const generateFormMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/generate-form`, {
        claimType: claimFormType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Form Generated", description: `${claimFormType === "general_liability" ? "GL" : "Auto"} carrier form PDF has been generated.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate form", variant: "destructive" });
    },
  });

  const generatePacketMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { claimType: claimFormType };
      if (selectedAttachmentIds.size > 0) {
        body.attachmentIds = Array.from(selectedAttachmentIds);
      }
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/generate-packet`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Packet Generated", description: "Full submission packet PDF has been generated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate packet", variant: "destructive" });
    },
  });

  const markReportedMutation = useMutation({
    mutationFn: async (data: { reportedTo: string; reportedMethod: string; notes: string; glAcknowledged?: boolean }) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/mark-reported`, {
        carrierReportedTo: data.reportedTo,
        carrierReportedMethod: data.reportedMethod,
        carrierReportedNotes: data.notes,
        glAcknowledged: data.glAcknowledged,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Marked as Reported", description: "Claim has been marked as reported to carrier." });
      setShowMarkReported(false);
      setMarkReportedNotes("");
      setMarkReportedTo("");
      setMarkReportedMethod("");
      setGlAcknowledged(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to mark as reported", variant: "destructive" });
    },
  });

  const submitToCarrierMutation = useMutation({
    mutationFn: async (data: { notes?: string; recipients: string[] }) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/submit-to-carrier`, {
        submissionNotes: data.notes || undefined,
        recipients: data.recipients,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'readiness'] });
      toast({ title: "Submitted to Carrier", description: "The claim submission has been emailed to the carrier." });
      setShowSubmitDialog(false);
      setSubmitNotes("");
    },
    onError: (error: any) => {
      const msg = error?.message || "Submission failed";
      const hint = error?.hint;
      toast({
        title: "Submission Failed",
        description: hint ? `${msg} — ${hint}` : msg,
        variant: "destructive",
      });
    },
  });

  const resendSubmissionMutation = useMutation({
    mutationFn: async (data: { notes?: string }) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/carrier-submission/resend`, {
        submissionNotes: data.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', accidentId, 'carrier-submission', 'events'] });
      toast({ title: "Submission Resent", description: "The submission email has been resent to the carrier." });
      setShowResendDialog(false);
      setResendNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Resend Failed", description: error?.message || "Resend failed", variant: "destructive" });
    },
  });

  const handleFieldSave = (fieldName: string, value: string | boolean) => {
    updateFieldsMutation.mutate({ [fieldName]: value });
  };

  const handleJsonFieldSave = (fieldName: string, value: any) => {
    updateFieldsMutation.mutate({ [fieldName]: value });
  };

  const injuredParties: InjuredParty[] = accident?.injuredParties || [];
  const propertyDamageEntries: PropertyDamageEntry[] = accident?.propertyDamageEntries || [];

  const addInjuredParty = () => {
    const updated = [...injuredParties, { name: "", phone: "", address: "", city: "", state: "", zip: "", extentOfInjury: "" }];
    handleJsonFieldSave("injuredParties", updated);
  };

  const removeInjuredParty = (index: number) => {
    const updated = injuredParties.filter((_, i) => i !== index);
    handleJsonFieldSave("injuredParties", updated);
  };

  const updateInjuredParty = (index: number, field: string, value: any) => {
    const updated = injuredParties.map((p, i) => i === index ? { ...p, [field]: value } : p);
    handleJsonFieldSave("injuredParties", updated);
  };

  const addPropertyDamageEntry = () => {
    const updated = [...propertyDamageEntries, { name: "", phone: "", address: "", city: "", state: "", zip: "", typeOfDamage: "", extentOfDamage: "" }];
    handleJsonFieldSave("propertyDamageEntries", updated);
  };

  const removePropertyDamageEntry = (index: number) => {
    const updated = propertyDamageEntries.filter((_, i) => i !== index);
    handleJsonFieldSave("propertyDamageEntries", updated);
  };

  const updatePropertyDamageEntry = (index: number, field: string, value: any) => {
    const updated = propertyDamageEntries.map((p, i) => i === index ? { ...p, [field]: value } : p);
    handleJsonFieldSave("propertyDamageEntries", updated);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card data-testid="carrier-submission-panel">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Carrier Submission</CardTitle>
              <Badge className={STATUS_COLORS[currentStatus] || ""} data-testid="badge-carrier-status">
                {STATUS_LABELS[currentStatus] || currentStatus}
              </Badge>
              <Badge variant="outline" className="text-xs" data-testid="badge-claim-form-type">
                {claimFormType === "general_liability" ? "GL" : "Auto"}
              </Badge>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">

            {/* Readiness Checklist */}
            <div className="space-y-3" data-testid="carrier-readiness-section">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Readiness Checklist</h4>
                {readinessData && (
                  <Badge variant={readinessData.requiredReady ? "default" : "outline"} className="text-xs" data-testid="badge-readiness-status">
                    {readinessData.requiredReady ? "Ready" : `${readinessData.missingRequired.length} missing`}
                  </Badge>
                )}
              </div>
              {readinessLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading checklist...
                </div>
              ) : readinessData?.items ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {readinessData.items.map((item) => (
                    <div key={item.field} className="flex items-center gap-2 text-sm" data-testid={`readiness-item-${item.field}`}>
                      {item.ready ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                      ) : item.required ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={item.ready ? "text-muted-foreground" : item.required ? "font-medium" : ""}>
                        {item.label}
                        {item.required && !item.ready && <span className="text-destructive ml-1">*</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Separator />

            {/* Claim Intake Fields */}
            {claimFormType === "auto" ? (
              <>
                {/* Auto: Loss Details */}
                <div className="space-y-3" data-testid="carrier-auto-loss-section">
                  <h4 className="text-sm font-semibold">Loss Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Date of Loss" value={accident?.lossDate ? new Date(accident.lossDate).toISOString().split('T')[0] : ""} fieldName="lossDate" onSave={handleFieldSave} type="date" isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Time of Loss" value={accident?.lossTime} fieldName="lossTime" onSave={handleFieldSave} type="time" isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Location" value={accident?.lossLocation} fieldName="lossLocation" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  <InlineEdit label="Description of Loss" value={accident?.descriptionOfLoss} fieldName="descriptionOfLoss" onSave={handleFieldSave} type="textarea" isSaving={updateFieldsMutation.isPending} />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="Point of Impact" value={accident?.pointOfImpact} fieldName="pointOfImpact" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Weather Conditions" value={accident?.weatherConditions} fieldName="weatherConditions" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Road Conditions" value={accident?.roadConditions} fieldName="roadConditions" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                </div>

                <Separator />

                {/* Auto: Our Vehicle */}
                <div className="space-y-3" data-testid="carrier-auto-vehicle-section">
                  <h4 className="text-sm font-semibold">Our Vehicle</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="Year" value={accident?.vehicleYear} fieldName="vehicleYear" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Make" value={accident?.vehicleMake} fieldName="vehicleMake" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Model" value={accident?.vehicleModel} fieldName="vehicleModel" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="VIN" value={accident?.vehicleVin} fieldName="vehicleVin" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="License Plate" value={accident?.vehicleLicensePlate} fieldName="vehicleLicensePlate" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="State" value={accident?.vehicleState} fieldName="vehicleState" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                </div>

                <Separator />

                {/* Auto: Other Party */}
                <div className="space-y-3" data-testid="carrier-auto-claimant-section">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">Other Party / Claimant</h4>
                    {_isNotAtFault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive/80 leading-none">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 flex-shrink-0" />
                        Required for Not At Fault claims
                      </span>
                    )}
                    {!_isNotAtFault && _liabilityFault === '' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-normal text-amber-600/70 dark:text-amber-500/60 leading-none">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/50 flex-shrink-0" />
                        Required if liability is Not At Fault
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Name" value={accident?.claimantName} fieldName="claimantName" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Phone" value={accident?.claimantPhone} fieldName="claimantPhone" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Address" value={accident?.claimantAddress} fieldName="claimantAddress" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Insurance Company" value={accident?.claimantInsurance} fieldName="claimantInsurance" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Policy Number" value={accident?.claimantPolicyNumber} fieldName="claimantPolicyNumber" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="Vehicle Year" value={accident?.claimantVehicleYear} fieldName="claimantVehicleYear" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Vehicle Make" value={accident?.claimantVehicleMake} fieldName="claimantVehicleMake" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Vehicle Model" value={accident?.claimantVehicleModel} fieldName="claimantVehicleModel" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Vehicle VIN" value={accident?.claimantVehicleVin} fieldName="claimantVehicleVin" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                </div>

                <Separator />

                {/* Auto: Police Report */}
                <div className="space-y-3" data-testid="carrier-auto-police-section">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">Police Report</h4>
                    {_isInsuranceClaim && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive/80 leading-none">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 flex-shrink-0" />
                        Required for Carrier Claims
                      </span>
                    )}
                    {!_isInsuranceClaim && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-normal text-amber-600/70 dark:text-amber-500/60 leading-none">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/50 flex-shrink-0" />
                        Required if Claim Type is Insurance / Carrier
                      </span>
                    )}
                  </div>
                  <InlineToggle label="Police Report Obtained" value={accident?.policeReportObtained} fieldName="policeReportObtained" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Department" value={accident?.policeReportDepartment} fieldName="policeReportDepartment" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Case Number" value={accident?.policeReportCaseNumber} fieldName="policeReportCaseNumber" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                </div>

                <Separator />

                {/* Auto: Witnesses */}
                <div className="space-y-3" data-testid="carrier-auto-witness-section">
                  <h4 className="text-sm font-semibold">Witnesses</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Witness Name" value={accident?.witnessName} fieldName="witnessName" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Witness Phone" value={accident?.witnessPhone} fieldName="witnessPhone" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Witness Statement" value={accident?.witnessStatement} fieldName="witnessStatement" onSave={handleFieldSave} type="textarea" isSaving={updateFieldsMutation.isPending} />
                </div>

                <Separator />

                {/* Auto: Injuries */}
                <div className="space-y-3" data-testid="carrier-auto-injury-section">
                  <h4 className="text-sm font-semibold">Injuries</h4>
                  <InlineEdit label="Injury Description" value={accident?.injuryDescription} fieldName="injuryDescription" onSave={handleFieldSave} type="textarea" isSaving={updateFieldsMutation.isPending} />
                  <InlineToggle label="Medical Treatment Sought" value={accident?.medicalTreatmentSought} fieldName="medicalTreatmentSought" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
                  <InlineEdit label="Medical Provider" value={accident?.medicalProvider} fieldName="medicalProvider" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                </div>
              </>
            ) : (
              <>
                {/* GL: Insured */}
                <div className="space-y-3" data-testid="carrier-gl-insured-section">
                  <h4 className="text-sm font-semibold">Insured</h4>
                  <InlineEdit label="Insured Name" value={accident?.insuredName || "AutoNition, LLC DBA Driver on Demand"} fieldName="insuredName" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                </div>

                <Separator />

                {/* GL: Loss Info */}
                <div className="space-y-3" data-testid="carrier-gl-loss-section">
                  <h4 className="text-sm font-semibold">Loss Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Date of Loss" value={accident?.lossDate ? new Date(accident.lossDate).toISOString().split('T')[0] : ""} fieldName="lossDate" onSave={handleFieldSave} type="date" isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Time of Loss" value={accident?.lossTime} fieldName="lossTime" onSave={handleFieldSave} type="time" isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Street Address" value={accident?.lossLocationAddress} fieldName="lossLocationAddress" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="City" value={accident?.lossLocationCity} fieldName="lossLocationCity" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="State" value={accident?.lossLocationState} fieldName="lossLocationState" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Zip" value={accident?.lossLocationZip} fieldName="lossLocationZip" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <InlineEdit label="Alleged Incident Description" value={accident?.allegedIncidentDescription} fieldName="allegedIncidentDescription" onSave={handleFieldSave} type="textarea" isSaving={updateFieldsMutation.isPending} />
                  <InlineToggle label="Product Involved" value={accident?.productInvolved} fieldName="productInvolved" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
                  {accident?.productInvolved && (
                    <InlineEdit label="Product Description" value={accident?.productDescription} fieldName="productDescription" onSave={handleFieldSave} type="textarea" isSaving={updateFieldsMutation.isPending} />
                  )}
                </div>

                <Separator />

                {/* GL: Injured Parties (repeatable) */}
                <div className="space-y-3" data-testid="carrier-gl-injured-parties-section">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-semibold">Injured Parties</h4>
                    <Button size="sm" variant="outline" onClick={addInjuredParty} disabled={updateFieldsMutation.isPending} data-testid="button-add-injured-party">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Party
                    </Button>
                  </div>
                  {injuredParties.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No injured parties recorded</p>
                  )}
                  {injuredParties.map((party, index) => (
                    <div key={index} className="border border-border rounded-md p-3 space-y-2" data-testid={`injured-party-${index}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Party {index + 1}</span>
                        <Button size="icon" variant="ghost" onClick={() => removeInjuredParty(index)} disabled={updateFieldsMutation.isPending} data-testid={`button-remove-injured-party-${index}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Name</Label>
                          <Input value={party.name} onChange={(e) => updateInjuredParty(index, "name", e.target.value)} data-testid={`input-injured-party-name-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Phone</Label>
                          <Input value={party.phone} onChange={(e) => updateInjuredParty(index, "phone", e.target.value)} data-testid={`input-injured-party-phone-${index}`} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <Input value={party.address} onChange={(e) => updateInjuredParty(index, "address", e.target.value)} data-testid={`input-injured-party-address-${index}`} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">City</Label>
                          <Input value={party.city} onChange={(e) => updateInjuredParty(index, "city", e.target.value)} data-testid={`input-injured-party-city-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">State</Label>
                          <Input value={party.state} onChange={(e) => updateInjuredParty(index, "state", e.target.value)} data-testid={`input-injured-party-state-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Zip</Label>
                          <Input value={party.zip} onChange={(e) => updateInjuredParty(index, "zip", e.target.value)} data-testid={`input-injured-party-zip-${index}`} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Extent of Injury</Label>
                        <Textarea value={party.extentOfInjury} onChange={(e) => updateInjuredParty(index, "extentOfInjury", e.target.value)} className="min-h-[40px]" data-testid={`textarea-injured-party-extent-${index}`} />
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* GL: Property Damage (repeatable) */}
                <div className="space-y-3" data-testid="carrier-gl-property-damage-section">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-semibold">Property Damage</h4>
                    <Button size="sm" variant="outline" onClick={addPropertyDamageEntry} disabled={updateFieldsMutation.isPending} data-testid="button-add-property-damage">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Entry
                    </Button>
                  </div>
                  {propertyDamageEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No property damage recorded</p>
                  )}
                  {propertyDamageEntries.map((entry, index) => (
                    <div key={index} className="border border-border rounded-md p-3 space-y-2" data-testid={`property-damage-${index}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Entry {index + 1}</span>
                        <Button size="icon" variant="ghost" onClick={() => removePropertyDamageEntry(index)} disabled={updateFieldsMutation.isPending} data-testid={`button-remove-property-damage-${index}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Name</Label>
                          <Input value={entry.name} onChange={(e) => updatePropertyDamageEntry(index, "name", e.target.value)} data-testid={`input-property-damage-name-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Phone</Label>
                          <Input value={entry.phone} onChange={(e) => updatePropertyDamageEntry(index, "phone", e.target.value)} data-testid={`input-property-damage-phone-${index}`} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <Input value={entry.address} onChange={(e) => updatePropertyDamageEntry(index, "address", e.target.value)} data-testid={`input-property-damage-address-${index}`} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">City</Label>
                          <Input value={entry.city} onChange={(e) => updatePropertyDamageEntry(index, "city", e.target.value)} data-testid={`input-property-damage-city-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">State</Label>
                          <Input value={entry.state} onChange={(e) => updatePropertyDamageEntry(index, "state", e.target.value)} data-testid={`input-property-damage-state-${index}`} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Zip</Label>
                          <Input value={entry.zip} onChange={(e) => updatePropertyDamageEntry(index, "zip", e.target.value)} data-testid={`input-property-damage-zip-${index}`} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Type of Damage</Label>
                        <Input value={entry.typeOfDamage} onChange={(e) => updatePropertyDamageEntry(index, "typeOfDamage", e.target.value)} data-testid={`input-property-damage-type-${index}`} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Extent of Damage</Label>
                        <Textarea value={entry.extentOfDamage} onChange={(e) => updatePropertyDamageEntry(index, "extentOfDamage", e.target.value)} className="min-h-[40px]" data-testid={`textarea-property-damage-extent-${index}`} />
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* GL: Lawsuit */}
                <div className="space-y-3" data-testid="carrier-gl-lawsuit-section">
                  <h4 className="text-sm font-semibold">Lawsuit</h4>
                  <InlineToggle label="Lawsuit Filed" value={accident?.lawsuitFiled} fieldName="lawsuitFiled" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
                  {accident?.lawsuitFiled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InlineEdit label="County / State" value={accident?.lawsuitCountyState} fieldName="lawsuitCountyState" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                      <InlineEdit label="Date of Service" value={accident?.dateOfService ? new Date(accident.dateOfService).toISOString().split('T')[0] : ""} fieldName="dateOfService" onSave={handleFieldSave} type="date" isSaving={updateFieldsMutation.isPending} />
                    </div>
                  )}
                </div>

                <Separator />

                {/* GL: Reporter Info */}
                <div className="space-y-3" data-testid="carrier-gl-reporter-section">
                  <h4 className="text-sm font-semibold">Reporter Info</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Filed By Name" value={accident?.reportFiledByName} fieldName="reportFiledByName" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Filed By Email" value={accident?.reportFiledByEmail} fieldName="reportFiledByEmail" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineEdit label="Filed By Phone" value={accident?.reportFiledByPhone} fieldName="reportFiledByPhone" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Date of Report" value={accident?.dateOfReport ? new Date(accident.dateOfReport).toISOString().split('T')[0] : ""} fieldName="dateOfReport" onSave={handleFieldSave} type="date" isSaving={updateFieldsMutation.isPending} />
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Catastrophic Loss Toggle (both types) */}
            <div className="space-y-3" data-testid="carrier-catastrophic-section">
              <h4 className="text-sm font-semibold">Catastrophic Loss</h4>
              <InlineToggle label="Catastrophic Loss" value={accident?.catastrophicLoss} fieldName="catastrophicLoss" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
              {accident?.catastrophicLoss && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Catastrophic Loss Warning</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    This claim has been flagged as a catastrophic loss. Immediate carrier notification is required. Please ensure all evidence and documentation is preserved.
                  </p>
                  <InlineToggle label="I acknowledge the catastrophic loss requirements" value={accident?.catastrophicAcknowledged} fieldName="catastrophicAcknowledged" onSave={(f, v) => handleFieldSave(f, v as any)} isSaving={updateFieldsMutation.isPending} />
                </div>
              )}
            </div>

            <Separator />

            {/* Branch / Policy Placeholders */}
            <div className="space-y-3" data-testid="carrier-branch-policy-section">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Branch / Policy</h4>
                <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-50">
                <div>
                  <Label className="text-sm text-muted-foreground">Branch Name</Label>
                  <Input disabled value={accident?.branchName || ""} placeholder="Coming soon" data-testid="input-carrier-branchName" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Branch Number</Label>
                  <Input disabled value={accident?.branchNumber || ""} placeholder="Coming soon" data-testid="input-carrier-branchNumber" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Policy Number</Label>
                  <Input disabled value={accident?.policyNumber || ""} placeholder="Coming soon" data-testid="input-carrier-policyNumber" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Account Number</Label>
                  <Input disabled value={accident?.accountNumber || ""} placeholder="Coming soon" data-testid="input-carrier-accountNumber" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Reporting Guidance Panel */}
            <div className="space-y-3" data-testid="carrier-reporting-guidance-section">
              <h4 className="text-sm font-semibold">Reporting Guidance</h4>
              {claimFormType === "general_liability" ? (
                <div className="border border-border rounded-md p-4 space-y-3 bg-muted/30">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Crum & Forster</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>800-690-5520</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>crumandforsternol@cfins.com</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">IMA Contacts</p>
                    <p className="text-sm text-muted-foreground">Betty Rutherford</p>
                    <p className="text-sm text-muted-foreground">Kelly Dark</p>
                  </div>
                </div>
              ) : (
                <div className="border border-border rounded-md p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground italic">
                    Contact your carrier or broker directly. Carrier and broker contact details will be added in a future update.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Attachment Selection for Submission Packet */}
            {claimAttachments.length > 0 && (
              <div className="space-y-3" data-testid="carrier-attachment-selector">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Files className="h-4 w-4 text-muted-foreground" />
                    Attachments for Submission Packet
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedAttachmentIds.size === claimAttachments.length) {
                          setSelectedAttachmentIds(new Set());
                        } else {
                          setSelectedAttachmentIds(new Set(claimAttachments.map((a: any) => a.id)));
                        }
                      }}
                      data-testid="button-toggle-all-attachments"
                    >
                      {selectedAttachmentIds.size === claimAttachments.length ? "Deselect All" : "Select All"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAttachmentSelector(s => !s)}
                      data-testid="button-toggle-attachment-selector"
                    >
                      {showAttachmentSelector ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedAttachmentIds.size === 0
                    ? "No attachments selected — all attachments will be included by default."
                    : `${selectedAttachmentIds.size} of ${claimAttachments.length} attachment${claimAttachments.length !== 1 ? "s" : ""} selected.`}
                </p>
                {showAttachmentSelector && (
                  <div className="border border-border rounded-md divide-y divide-border bg-muted/20">
                    {claimAttachments.map((att: any) => {
                      const isChecked = selectedAttachmentIds.has(att.id);
                      const catLabel = att.category
                        ? att.category.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : "General";
                      const isPhoto = att.fileType?.startsWith("image/");
                      const isVideo = att.category === "video" || att.category === "video_photos";
                      const AttachIcon = isPhoto || isVideo ? FileImage : att.category === "general" || att.category === "other" ? Paperclip : FileText;
                      return (
                        <label
                          key={att.id}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover-elevate"
                          data-testid={`attachment-select-row-${att.id}`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedAttachmentIds(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(att.id);
                                else next.delete(att.id);
                                return next;
                              });
                            }}
                            data-testid={`checkbox-attachment-${att.id}`}
                          />
                          <AttachIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{att.fileName}</p>
                            <p className="text-xs text-muted-foreground">{catLabel}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Action Buttons */}
            <div className="space-y-3" data-testid="carrier-action-buttons">
              <h4 className="text-sm font-semibold">Actions</h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => generateFormMutation.mutate()}
                  disabled={generateFormMutation.isPending}
                  data-testid="button-generate-carrier-form"
                >
                  {generateFormMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  Generate {claimFormType === "general_liability" ? "GL" : "Auto"} Carrier Form
                </Button>
                <Button
                  variant="outline"
                  onClick={() => generatePacketMutation.mutate()}
                  disabled={generatePacketMutation.isPending}
                  data-testid="button-generate-submission-packet"
                >
                  {generatePacketMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Package className="h-4 w-4 mr-1" />}
                  Generate Submission Packet
                </Button>
                {["SUBMISSION_READY", "PACKET_GENERATED"].includes(currentStatus) && (
                  <Button
                    onClick={() => setShowSubmitDialog(true)}
                    disabled={submitToCarrierMutation.isPending}
                    data-testid="button-submit-to-carrier"
                  >
                    {submitToCarrierMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Submit to Carrier
                  </Button>
                )}
                {!["SUBMISSION_READY", "PACKET_GENERATED"].includes(currentStatus) && currentStatus !== "CLOSED" && (
                  <Button
                    variant="outline"
                    onClick={() => setShowMarkReported(true)}
                    data-testid="button-mark-reported"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Mark as Reported (Manual)
                  </Button>
                )}
                {isAdmin && ["REPORTED", "ACKNOWLEDGED", "ADJUSTER_ASSIGNED", "CLOSED"].includes(currentStatus) && accident?.carrierSubmissionEmailedAt && (
                  <Button
                    variant="outline"
                    onClick={() => setShowResendDialog(true)}
                    disabled={resendSubmissionMutation.isPending}
                    data-testid="button-resend-submission"
                  >
                    {resendSubmissionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Resend Submission
                  </Button>
                )}
              </div>

              {/* Submit to Carrier Dialog */}
              {showSubmitDialog && (
                <div className="border border-border rounded-md p-4 space-y-3 bg-muted/30" data-testid="submit-carrier-dialog">
                  {claimFormType === "general_liability" && (
                    <div className="border border-red-300 rounded-md p-3 bg-red-50 dark:bg-red-950/20">
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">Do NOT contact the claimant</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">All communications must be handled by the carrier or adjuster.</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Recipients</label>
                    <input
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={submitRecipients}
                      onChange={(e) => setSubmitRecipients(e.target.value)}
                      placeholder="crumandforsternol@cfins.com"
                      data-testid="input-submit-recipients"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: C. Ruman &amp; Forsternol (crumandforsternol@cfins.com)</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Submission Notes (optional)</label>
                    <Textarea
                      value={submitNotes}
                      onChange={(e) => setSubmitNotes(e.target.value)}
                      placeholder="Any notes to include in the submission email..."
                      className="min-h-[60px] mt-1"
                      data-testid="textarea-submit-notes"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => submitToCarrierMutation.mutate({
                        notes: submitNotes || undefined,
                        recipients: submitRecipients.split(",").map((r) => r.trim()).filter(Boolean),
                      })}
                      disabled={submitToCarrierMutation.isPending || !submitRecipients.trim()}
                      data-testid="button-confirm-submit-carrier"
                    >
                      {submitToCarrierMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      Confirm & Send
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowSubmitDialog(false); setSubmitNotes(""); }} data-testid="button-cancel-submit-carrier">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Resend Dialog */}
              {showResendDialog && (
                <div className="border border-border rounded-md p-4 space-y-3 bg-muted/30" data-testid="resend-submission-dialog">
                  <p className="text-sm font-medium">Resend submission email to the same carrier recipients.</p>
                  <div>
                    <label className="text-sm text-muted-foreground">Reason / Note (optional)</label>
                    <Textarea
                      value={resendNotes}
                      onChange={(e) => setResendNotes(e.target.value)}
                      placeholder="e.g., carrier requested additional copy..."
                      className="min-h-[56px] mt-1"
                      data-testid="textarea-resend-notes"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => resendSubmissionMutation.mutate({ notes: resendNotes || undefined })}
                      disabled={resendSubmissionMutation.isPending}
                      data-testid="button-confirm-resend"
                    >
                      {resendSubmissionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      Resend
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowResendDialog(false); setResendNotes(""); }} data-testid="button-cancel-resend">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {showMarkReported && (
                <div className="border border-border rounded-md p-4 space-y-3 bg-muted/30" data-testid="mark-reported-form">
                  {claimFormType === "general_liability" && !accident?.glReportingAcknowledged && (
                    <div className="border border-amber-500/50 rounded-md p-4 bg-amber-50 dark:bg-amber-950/20 space-y-3" data-testid="gl-acknowledgment-section">
                      <h5 className="text-sm font-semibold text-amber-700 dark:text-amber-300">General Liability Reporting Acknowledgment</h5>
                      <div className="space-y-2 text-sm text-amber-700/90 dark:text-amber-300/80">
                        <p className="font-medium">Do NOT contact the claimant directly.</p>
                        <p>All communication must be handled by the carrier/adjuster or broker.</p>
                        <p>I understand and will comply.</p>
                      </div>
                      <div className="flex items-start gap-2 pt-1">
                        <Checkbox
                          id="gl-acknowledge"
                          checked={glAcknowledged}
                          onCheckedChange={(checked) => setGlAcknowledged(checked === true)}
                          data-testid="checkbox-gl-acknowledge"
                        />
                        <Label htmlFor="gl-acknowledge" className="text-sm leading-tight cursor-pointer">
                          I acknowledge that I must not contact the claimant and that the carrier/adjuster/broker will manage communications.
                        </Label>
                      </div>
                    </div>
                  )}
                  <h5 className="text-sm font-medium">Report Details</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Reported To</Label>
                      <Input
                        value={markReportedTo}
                        onChange={(e) => setMarkReportedTo(e.target.value)}
                        placeholder="Carrier / broker name"
                        data-testid="input-mark-reported-to"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Method</Label>
                      <Select value={markReportedMethod} onValueChange={setMarkReportedMethod}>
                        <SelectTrigger data-testid="select-mark-reported-method">
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="portal">Portal / Online</SelectItem>
                          <SelectItem value="fax">Fax</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Notes</Label>
                    <Textarea
                      value={markReportedNotes}
                      onChange={(e) => setMarkReportedNotes(e.target.value)}
                      placeholder="Add any reporting notes..."
                      className="min-h-[60px]"
                      data-testid="textarea-mark-reported-notes"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => markReportedMutation.mutate({
                        reportedTo: markReportedTo,
                        reportedMethod: markReportedMethod,
                        notes: markReportedNotes,
                        glAcknowledged: claimFormType === "general_liability" ? glAcknowledged : undefined,
                      })}
                      disabled={markReportedMutation.isPending || !markReportedTo || (claimFormType === "general_liability" && !accident?.glReportingAcknowledged && !glAcknowledged)}
                      data-testid="button-confirm-mark-reported"
                    >
                      {markReportedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                      Confirm
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowMarkReported(false); setGlAcknowledged(false); }} data-testid="button-cancel-mark-reported">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Carrier Submission Record — shown after email submission */}
            {accident?.carrierSubmissionEmailedAt && (
              <div className="space-y-3" data-testid="carrier-submission-record">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <h4 className="text-sm font-semibold">Submission Record</h4>
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Emailed to Carrier</Badge>
                </div>
                <div className="border border-border rounded-md p-4 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Submitted At</span>
                      <p className="font-medium">{formatDateTime(accident.carrierSubmissionEmailedAt)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Recipients</span>
                      <p className="font-medium break-all">
                        {Array.isArray(accident.carrierSubmissionRecipients)
                          ? accident.carrierSubmissionRecipients.join(", ")
                          : "crumandforsternol@cfins.com"}
                      </p>
                    </div>
                    {accident.carrierSubmissionNotes && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground text-xs">Notes</span>
                        <p>{accident.carrierSubmissionNotes}</p>
                      </div>
                    )}
                    {accident.carrierSubmissionMessageId && (
                      <div>
                        <span className="text-muted-foreground text-xs">Email ID</span>
                        <p className="text-xs font-mono">{accident.carrierSubmissionMessageId}</p>
                      </div>
                    )}
                  </div>
                  {Array.isArray(accident.carrierSubmissionArtifacts) && accident.carrierSubmissionArtifacts.length > 0 && (
                    <div className="mt-2">
                      <span className="text-muted-foreground text-xs">Attachments Sent</span>
                      <ul className="mt-1 space-y-1">
                        {(accident.carrierSubmissionArtifacts as any[]).map((artifact, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-xs">
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span>{artifact.fileName}</span>
                            {artifact.fileSizeBytes && (
                              <span className="text-muted-foreground">({Math.round(artifact.fileSizeBytes / 1024)} KB)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Failure Reason — shown when submission failed */}
            {accident?.carrierSubmissionFailureReason && !accident?.carrierSubmissionEmailedAt && (
              <div className="border border-destructive/40 rounded-md p-4 bg-destructive/5 space-y-1" data-testid="submission-failure-reason">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Last Submission Failed</p>
                </div>
                <p className="text-sm text-muted-foreground">{accident.carrierSubmissionFailureReason}</p>
              </div>
            )}

            <Separator />

            {/* Adjuster Info (shown when status >= ADJUSTER_ASSIGNED) */}
            {(currentStatus === "ADJUSTER_ASSIGNED" || currentStatus === "ACKNOWLEDGED" || currentStatus === "CLOSED" || accident?.adjusterName) && (
              <>
                <div className="space-y-3" data-testid="carrier-adjuster-section">
                  <h4 className="text-sm font-semibold">Adjuster Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InlineEdit label="Adjuster Name" value={accident?.adjusterName} fieldName="adjusterName" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Adjuster Phone" value={accident?.adjusterPhone} fieldName="adjusterPhone" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                    <InlineEdit label="Adjuster Email" value={accident?.adjusterEmail} fieldName="adjusterEmail" onSave={handleFieldSave} isSaving={updateFieldsMutation.isPending} />
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Audit Trail */}
            <div className="space-y-3" data-testid="carrier-audit-trail">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Submission Audit Trail</h4>
                <Badge variant="secondary" className="text-xs">{submissionEvents.length}</Badge>
              </div>
              {eventsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading events...
                </div>
              ) : submissionEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No submission events yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {submissionEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-2 border border-border rounded-md text-sm" data-testid={`submission-event-${event.id}`}>
                      <div className="mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{event.fromStatus}</Badge>
                          <span className="text-muted-foreground text-xs">&rarr;</span>
                          <Badge variant="outline" className="text-xs">{event.toStatus}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.action} by {event.changedByName}
                        </p>
                        {event.note && (
                          <p className="text-xs mt-1">{event.note}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.createdAt ? formatDateTime(event.createdAt) : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
