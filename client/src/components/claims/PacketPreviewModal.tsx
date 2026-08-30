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
  Package,
  FileText,
  Image,
  Download,
  Eye,
  Send,
  ShieldCheck,
  ClipboardList,
  PartyPopper,
} from "lucide-react";

interface PacketReadinessItem {
  label: string;
  required: boolean;
  ready: boolean;
}

interface PacketPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accidentId: string;
  accident: any;
  attachments: any[];
  claimReadiness?: {
    requiredReady: boolean;
    items: PacketReadinessItem[];
  } | null;
  driverName: string | null;
  customerName: string | null;
  onSuccess: () => void;
  onScrollToCarrier?: () => void;
}

type Stage = "preview" | "generating" | "success";

interface PacketResult {
  fileName: string;
  attachmentId: string;
}

export function PacketPreviewModal({
  open,
  onOpenChange,
  accidentId,
  accident,
  attachments,
  claimReadiness,
  driverName,
  customerName,
  onSuccess,
  onScrollToCarrier,
}: PacketPreviewModalProps) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("preview");
  const [result, setResult] = useState<PacketResult | null>(null);

  const claimType: string = accident?.claimType ?? "auto";
  const isGL =
    claimType === "general_liability" ||
    claimType === "INJURY" ||
    claimType === "PROPERTY";
  const formLabel = isGL ? "GL Carrier Claim Form" : "Auto Carrier Claim Form";

  const photoAttachments = attachments.filter((a) =>
    a.fileType?.startsWith("image/")
  );
  const docAttachments = attachments.filter(
    (a) => !a.fileType?.startsWith("image/")
  );

  const missingRequired = (claimReadiness?.items ?? []).filter(
    (i) => i.required && !i.ready
  );
  const hasMissingRequired = missingRequired.length > 0;

  const claimLabel = accident?.insuranceClaimNumber
    ? `Claim #${accident.insuranceClaimNumber}`
    : `Claim ${accidentId.substring(0, 8).toUpperCase()}`;

  const generateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(
        "POST",
        `/api/corporate/accidents/${accidentId}/carrier-submission/generate-packet`,
        { claimType }
      ) as Promise<PacketResult>;
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
        description: error.message || "Failed to generate submission packet",
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
      const resp = await fetch(
        `/api/documents/${result.attachmentId}/download`,
        { credentials: "include" }
      );
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
        description: "Could not download the packet. Try again.",
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
      <DialogContent
        className="max-w-lg"
        data-testid="dialog-packet-preview"
      >
        {/* ── Preview Stage ─────────────────────────────────────── */}
        {(stage === "preview" || stage === "generating") && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Generate Submission Packet
              </DialogTitle>
            </DialogHeader>

            {/* Claim info banner */}
            <div className="text-sm text-muted-foreground px-1">
              <span className="font-medium text-foreground">{claimLabel}</span>
              {driverName && <> · {driverName}</>}
              {customerName && <> · {customerName}</>}
            </div>

            <Separator />

            {/* Contents */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contents
              </p>
              <ul className="space-y-1.5">
                {[
                  {
                    icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
                    label: "Cover Sheet",
                  },
                  ...(!isGL ? [{
                    icon: <ClipboardList className="h-3.5 w-3.5 text-emerald-500" />,
                    label: "Transportation Auto Loss Report",
                  }] : []),
                  {
                    icon: <FileText className="h-3.5 w-3.5 text-emerald-500" />,
                    label: formLabel,
                  },
                  {
                    icon: <Image className="h-3.5 w-3.5 text-emerald-500" />,
                    label: `Photos (${photoAttachments.length})`,
                  },
                  {
                    icon: <FileText className="h-3.5 w-3.5 text-emerald-500" />,
                    label: `Supporting Documents (${docAttachments.length})`,
                  },
                  {
                    icon: <ClipboardList className="h-3.5 w-3.5 text-emerald-500" />,
                    label: "Evidence Index",
                  },
                ].map(({ icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    {icon}
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            {/* Warnings */}
            {hasMissingRequired && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Missing Required Items
                  </p>
                  <ul className="space-y-1">
                    {missingRequired.map((item) => (
                      <li
                        key={item.label}
                        className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    You can still generate the packet — the PDF will note these
                    items are missing.
                  </p>
                </div>
              </>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={stage === "generating"}
                data-testid="button-packet-cancel"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={stage === "generating"}
                data-testid="button-packet-generate"
              >
                {stage === "generating" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-1" />
                    Generate Submission Packet
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Success Stage ──────────────────────────────────────── */}
        {stage === "success" && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <PartyPopper className="h-5 w-5" />
                Packet Generated
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
                    Saved to claim attachments
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Badge variant="outline" className="w-fit text-xs text-muted-foreground">
                  {isGL ? "GL Submission Packet" : "Auto Submission Packet"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  The packet is available in the Attachments section and can be
                  downloaded or sent to your carrier.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                data-testid="button-packet-close"
              >
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleClose();
                  setTimeout(
                    () => document.querySelector<HTMLElement>('[data-testid="card-attachments"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    350
                  );
                }}
                data-testid="button-packet-view"
              >
                <Eye className="h-4 w-4 mr-1" />
                View in Attachments
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                data-testid="button-packet-download"
              >
                <Download className="h-4 w-4 mr-1" />
                Download Packet
              </Button>
            </DialogFooter>

            {onScrollToCarrier && (
              <div className="pt-1">
                <button
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    handleClose();
                    setTimeout(() => onScrollToCarrier?.(), 350);
                  }}
                  data-testid="button-packet-submit-carrier"
                >
                  <Send className="h-3 w-3 inline mr-1" />
                  Submit to carrier
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
