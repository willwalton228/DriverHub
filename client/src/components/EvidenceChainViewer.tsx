import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Lock,
  Unlock,
  AlertTriangle,
  User,
  Calendar,
  Tag,
  Database,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Image,
  Film,
  File,
  Copy,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EvidenceChainViewerProps {
  moveId?: string;
  claimId?: string;
  maxHeight?: string;
  isSuperAdmin?: boolean;
}

const REQUIRED_CATEGORIES = [
  "scene_photos",
  "vehicle_damage_photos",
  "accident_report",
];
const CATEGORY_LABELS: Record<string, string> = {
  scene_photos: "Scene Photos",
  vehicle_damage_photos: "Vehicle Damage Photos",
  driver_photos: "Driver Photos",
  accident_report: "Accident Report",
  police_report: "Police Report",
  driver_statement: "Driver Statement",
  video_photos: "Video / Media",
  video: "Video",
  drug_test_results: "Drug Test Results",
  medical_records: "Medical Records",
  repair_estimates: "Repair Estimates",
  insurance_documents: "Insurance Documents",
  general: "General",
};

const SOURCE_LABELS: Record<string, string> = {
  driver: "Driver",
  internal_user: "Internal",
  external_party: "External",
  system: "System",
};

function getFileIcon(fileType: string) {
  if (fileType?.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (fileType?.startsWith("video/")) return <Film className="h-4 w-4 text-purple-500" />;
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function IntegritySummary({
  attachments,
  duplicateCount,
  lockedCount,
  missingCategories,
}: {
  attachments: any[];
  duplicateCount: number;
  lockedCount: number;
  missingCategories: string[];
}) {
  const totalIssues = duplicateCount + missingCategories.length;
  const isClean = totalIssues === 0;

  return (
    <div
      className={`rounded-md border p-3 flex items-start gap-3 ${
        isClean
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
      data-testid="evidence-integrity-summary"
    >
      {isClean ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">
          {isClean ? "Integrity checks passed" : `${totalIssues} integrity issue${totalIssues > 1 ? "s" : ""} detected`}
        </p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">
            {attachments.length} file{attachments.length !== 1 ? "s" : ""}
          </span>
          {lockedCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {lockedCount} locked
            </span>
          )}
          {duplicateCount > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Copy className="h-3 w-3" />
              {duplicateCount} duplicate filename{duplicateCount > 1 ? "s" : ""}
            </span>
          )}
          {missingCategories.map((cat) => (
            <span key={cat} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Missing: {CATEGORY_LABELS[cat] || cat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachmentRow({
  attachment,
  isSuperAdmin,
  claimId,
}: {
  attachment: any;
  isSuperAdmin?: boolean;
  claimId: string;
}) {
  const { toast } = useToast();
  const [showLockReason, setShowLockReason] = useState(false);
  const [lockReason, setLockReason] = useState("");

  const lockMutation = useMutation({
    mutationFn: ({ locked, reason }: { locked: boolean; reason?: string }) =>
      apiRequest("PATCH", `/api/corporate/accidents/${claimId}/attachments/${attachment.id}/lock`, { locked, reason }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", claimId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", claimId] });
      toast({
        title: vars.locked ? "Evidence file locked" : "Evidence file unlocked",
        description: `"${attachment.fileName}" has been ${vars.locked ? "locked" : "unlocked"}.`,
      });
      setShowLockReason(false);
      setLockReason("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to update lock", description: err.message, variant: "destructive" });
    },
  });

  const integrityFlags: string[] = attachment.integrityFlags ?? [];
  const isDuplicate = integrityFlags.includes("duplicate_filename");

  return (
    <div
      className="py-3 space-y-2"
      data-testid={`evidence-row-${attachment.id}`}
    >
      {/* Row 1: File info + badges + lock button */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getFileIcon(attachment.fileType)}
          <span className="text-sm font-medium truncate">{attachment.fileName}</span>
          {attachment.isLocked && (
            <Badge
              variant="outline"
              className="shrink-0 text-xs border-destructive/50 text-destructive dark:text-destructive"
              data-testid={`badge-locked-${attachment.id}`}
            >
              <Lock className="h-3 w-3 mr-1" />
              Locked
            </Badge>
          )}
          {isDuplicate && (
            <Badge
              variant="outline"
              className="shrink-0 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400"
              data-testid={`badge-duplicate-${attachment.id}`}
            >
              <Copy className="h-3 w-3 mr-1" />
              Duplicate filename
            </Badge>
          )}
        </div>

        {isSuperAdmin && (
          <div className="shrink-0">
            {attachment.isLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => lockMutation.mutate({ locked: false })}
                    disabled={lockMutation.isPending}
                    data-testid={`button-unlock-${attachment.id}`}
                  >
                    {lockMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Unlock className="h-3.5 w-3.5" />}
                    <span className="ml-1 text-xs">Unlock</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove individual lock from this evidence file</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLockReason(!showLockReason)}
                    data-testid={`button-lock-${attachment.id}`}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span className="ml-1 text-xs">Lock</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lock this evidence file individually</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Lock reason input (shown when admin clicks Lock) */}
      {showLockReason && !attachment.isLocked && (
        <div className="flex items-center gap-2 pl-6">
          <input
            type="text"
            placeholder="Lock reason (optional)"
            value={lockReason}
            onChange={(e) => setLockReason(e.target.value)}
            className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid={`input-lock-reason-${attachment.id}`}
          />
          <Button
            size="sm"
            onClick={() => lockMutation.mutate({ locked: true, reason: lockReason || undefined })}
            disabled={lockMutation.isPending}
            data-testid={`button-confirm-lock-${attachment.id}`}
          >
            {lockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Confirm
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setShowLockReason(false); setLockReason(""); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Row 2: Chain of custody metadata */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6 sm:grid-cols-4">
        {/* Uploaded by */}
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate" data-testid={`text-uploader-${attachment.id}`}>
            {attachment.uploaderName || "Unknown"}
          </span>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate" data-testid={`text-timestamp-${attachment.id}`}>
            {formatDateTime(attachment.createdAt)}
          </span>
        </div>

        {/* Source */}
        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground" data-testid={`text-source-${attachment.id}`}>
            {SOURCE_LABELS[attachment.attachmentSource] || attachment.attachmentSource || "Internal"}
          </span>
        </div>

        {/* Category */}
        <div className="flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate" data-testid={`text-category-${attachment.id}`}>
            {CATEGORY_LABELS[attachment.category] || attachment.category || "General"}
          </span>
        </div>
      </div>

      {/* Locked by info */}
      {attachment.isLocked && attachment.lockerName && (
        <div className="pl-6 flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-destructive/70 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Locked by <span className="font-medium text-foreground">{attachment.lockerName}</span>
            {attachment.lockedAt ? ` on ${formatDateTime(attachment.lockedAt)}` : ""}
            {attachment.lockReason ? ` — ${attachment.lockReason}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

export function EvidenceChainViewer({ claimId, maxHeight = "600px", isSuperAdmin = false }: EvidenceChainViewerProps) {
  const { data: attachments = [], isLoading, error } = useQuery<any[]>({
    queryKey: ["/api/corporate/accidents", claimId, "attachments"],
    enabled: !!claimId,
  });

  if (!claimId) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        No claim ID provided
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="pl-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-sm text-destructive py-6">
        Failed to load evidence chain
      </div>
    );
  }

  const active = attachments.filter((a: any) => !a.isDeleted);

  if (active.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8 flex flex-col items-center gap-2">
        <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
        <p>No evidence files uploaded yet</p>
        <p className="text-xs">All uploaded files will be tracked here with full chain of custody metadata.</p>
      </div>
    );
  }

  // Compute integrity stats
  const lockedCount = active.filter((a: any) => a.isLocked).length;
  const duplicateIds = new Set<string>();
  const names = active.map((a: any) => a.fileName.toLowerCase().trim());
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (names[i] === names[j]) {
        duplicateIds.add(active[i].id);
        duplicateIds.add(active[j].id);
      }
    }
  }
  const duplicateCount = duplicateIds.size;

  const presentCategories = new Set(active.map((a: any) => a.category));
  const missingCategories = REQUIRED_CATEGORIES.filter((c) => !presentCategories.has(c));

  return (
    <div className="space-y-4" data-testid="evidence-chain-viewer">
      {/* Integrity summary */}
      <IntegritySummary
        attachments={active}
        duplicateCount={duplicateCount}
        lockedCount={lockedCount}
        missingCategories={missingCategories}
      />

      {/* Per-file chain of custody list */}
      <ScrollArea style={{ maxHeight }}>
        <div className="divide-y divide-border">
          {active.map((attachment: any) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              isSuperAdmin={isSuperAdmin}
              claimId={claimId}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
