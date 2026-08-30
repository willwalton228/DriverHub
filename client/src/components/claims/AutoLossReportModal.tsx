import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Download,
  Eye,
  ClipboardList,
  PartyPopper,
  Info,
} from "lucide-react";

interface AutoLossReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accidentId: string;
  accident: any;
  driverName: string | null;
  customerName: string | null;
  onSuccess: () => void;
}

interface FieldCheck {
  label: string;
  value: string | null | undefined;
  required: boolean;
}

type Stage = "preview" | "generating" | "success";

interface GenerateResult {
  fileName: string;
  attachmentId: string;
}

function buildFieldChecks(accident: any, driverName: string | null, customerName: string | null): FieldCheck[] {
  return [
    { label: "Accident Date", value: accident?.lossDate || accident?.incidentDate || accident?.accidentDate, required: true },
    { label: "Accident Location", value: accident?.lossLocation || accident?.location, required: true },
    { label: "Incident Description", value: accident?.descriptionOfLoss || accident?.description, required: true },
    { label: "Our Company Name", value: customerName, required: true },
    { label: "Driver Name", value: driverName, required: false },
    { label: "Vehicle VIN", value: accident?.vehicleVin, required: false },
    { label: "Year / Make / Model", value: [accident?.vehicleYear, accident?.vehicleMake, accident?.vehicleModel].filter(Boolean).join(" / ") || null, required: false },
    { label: "License Plate", value: accident?.vehicleLicensePlate, required: false },
    { label: "Driver Classification", value: accident?.driverClassification, required: false },
    { label: "Police Department", value: accident?.policeReportDepartment, required: false },
    { label: "Police Report Number", value: accident?.policeReportNumber || accident?.policeReportCaseNumber, required: false },
    { label: "Claimant / Other Party", value: accident?.claimantName, required: false },
    { label: "Other Party Insurance", value: accident?.claimantInsurance, required: false },
    { label: "Witness 1", value: accident?.witnessName, required: false },
  ];
}

export function AutoLossReportModal({
  open,
  onOpenChange,
  accidentId,
  accident,
  driverName,
  customerName,
  onSuccess,
}: AutoLossReportModalProps) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("preview");
  const [result, setResult] = useState<GenerateResult | null>(null);

  const fieldChecks = buildFieldChecks(accident, driverName, customerName);
  const missingRequired = fieldChecks.filter((f) => f.required && !f.value);
  const missingOptional = fieldChecks.filter((f) => !f.required && !f.value);
  const populated = fieldChecks.filter((f) => !!f.value);
  const hasMissingRequired = missingRequired.length > 0;

  const generateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(
        "POST",
        `/api/corporate/accidents/${accidentId}/auto-loss-report/generate`,
        {}
      ) as Promise<GenerateResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setStage("success");
      onSuccess();
    },
    onError: (error: any) => {
      setStage("preview");
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate the Auto Loss Report",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    setStage("generating");
    generateMutation.mutate();
  };

  const handleDownload = async () => {
    if (!result) return;
    try {
      const resp = await fetch(`/api/documents/${result.attachmentId}/download`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Download Failed",
        description: "Could not download the report. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStage("preview");
      setResult(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" data-testid="dialog-auto-loss-report">
        {/* ── Preview / Generating Stage ──────────────────────────── */}
        {(stage === "preview" || stage === "generating") && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Generate Auto Loss Report
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              The{" "}
              <span className="font-medium text-foreground">
                Transportation Auto Loss Report
              </span>{" "}
              will be auto-populated from claim data and saved as an attachment.
            </p>

            {/* Missing required fields warning */}
            {hasMissingRequired && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-3 py-3 space-y-1">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Missing required fields
                </p>
                {missingRequired.map((f) => (
                  <p key={f.label} className="text-xs text-amber-700/80 dark:text-amber-400/80 pl-5">
                    {f.label}
                  </p>
                ))}
                <p className="text-xs text-amber-700/60 dark:text-amber-400/60 pt-1">
                  You can generate now — blanks will appear on the form. Complete the claim data first to avoid them.
                </p>
              </div>
            )}

            <Separator />

            {/* Field population summary */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                Field Population Preview
              </p>
              <div className="max-h-52 overflow-y-auto pr-1 space-y-1">
                {fieldChecks.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      {f.value ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className={`h-3.5 w-3.5 shrink-0 ${f.required ? "text-amber-500" : "text-muted-foreground/50"}`} />
                      )}
                      {f.label}
                      {f.required && (
                        <span className="text-amber-600 dark:text-amber-400 text-xs">*</span>
                      )}
                    </span>
                    {f.value ? (
                      <span className="text-xs text-foreground truncate max-w-36 text-right" title={f.value}>
                        {f.value}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground/60">
                        blank
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {populated.length} of {fieldChecks.length} fields populated
                {missingOptional.length > 0 && ` · ${missingOptional.length} optional fields blank`}
              </p>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              The generated report will be saved to this claim, the driver record, and the account record.
            </p>

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={stage === "generating"}
                data-testid="button-auto-loss-cancel"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={stage === "generating"}
                data-testid="button-auto-loss-generate"
              >
                {stage === "generating" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-1" />
                    Generate Auto Loss Report
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Success Stage ───────────────────────────────────────── */}
        {stage === "success" && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <PartyPopper className="h-5 w-5" />
                Auto Loss Report Generated
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-3 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    {result.fileName}
                  </p>
                  <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">
                    Saved to claim, driver record, and account record
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                The Transportation Auto Loss Report is now available in the Attachments section. It will also be automatically included in the Carrier Submission Packet.
              </p>
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                data-testid="button-auto-loss-close"
              >
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleClose();
                  setTimeout(
                    () =>
                      document
                        .querySelector<HTMLElement>('[data-testid="card-attachments"]')
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    350
                  );
                }}
                data-testid="button-auto-loss-view"
              >
                <Eye className="h-4 w-4 mr-1" />
                View in Attachments
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                data-testid="button-auto-loss-download"
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
