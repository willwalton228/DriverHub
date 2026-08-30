import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  User, FileWarning, ZoomIn, History, ChevronDown, ChevronUp,
} from "lucide-react";

interface LicenseSubmission {
  id: number;
  driver_id: string;
  driver_name: string;
  submitted_by: string;
  submitted_at: string;
  status: string;
  proposed_license_number: string | null;
  proposed_license_state: string | null;
  proposed_license_expiration: string | null;
  proposed_license_class: string | null;
  proposed_endorsements: string | null;
  proposed_restrictions: string | null;
  current_license_number: string | null;
  current_license_state: string | null;
  current_license_expiration: string | null;
  front_image_key: string | null;
  back_image_key: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  priority: string;
  work_plan_item_id: string | null;
}

interface DriverRecord {
  id: string;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface AuditEntry {
  id: number;
  submission_id: number;
  action: string;
  performed_by: string | null;
  performed_at: string;
  details: any;
}

interface DetailResponse {
  submission: LicenseSubmission;
  driver: DriverRecord | null;
  audit: AuditEntry[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending_review:        { label: "Pending Review",       icon: Clock,         className: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700" },
  approved:              { label: "Approved",             icon: CheckCircle2,  className: "text-green-700 border-green-300 bg-green-50 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700" },
  rejected:              { label: "Rejected",             icon: XCircle,       className: "text-red-700 border-red-300 bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700" },
  requires_resubmission: { label: "Needs Resubmission",  icon: AlertTriangle, className: "text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700" },
};

const ACTION_LABELS: Record<string, string> = {
  submission_created:    "Submission created",
  image_uploaded_front:  "Front image uploaded",
  image_uploaded_back:   "Back image uploaded",
  approved:              "Approved",
  rejected:              "Rejected",
  requires_resubmission: "Resubmission requested",
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return v; }
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return v; }
}

function InfoRow({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className="flex gap-3 min-w-0">
      <span className="text-xs text-muted-foreground w-32 shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm font-medium flex-1 min-w-0 ${highlight ? "text-primary" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function LicenseImage({ submissionId, side }: { submissionId: number; side: "front" | "back" }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const url = `/api/compliance/license-submissions/${submissionId}/image/${side}`;

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">{side === "front" ? "Front" : "Back"}</Label>
        {failed ? (
          <div className="aspect-video rounded-md border border-dashed border-border flex items-center justify-center bg-muted/30">
            <div className="text-center">
              <FileWarning className="h-6 w-6 mx-auto text-muted-foreground opacity-40 mb-1" />
              <p className="text-xs text-muted-foreground">Image not available</p>
            </div>
          </div>
        ) : (
          <div
            className="relative rounded-md overflow-hidden border border-border cursor-zoom-in hover-elevate"
            onClick={() => setZoomOpen(true)}
            data-testid={`image-${side}`}
          >
            <img
              src={url}
              alt={`${side} of license`}
              className="w-full aspect-video object-contain bg-black/5 dark:bg-black/30"
              onError={() => setFailed(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
              <ZoomIn className="h-6 w-6 text-white" />
            </div>
          </div>
        )}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{side === "front" ? "Front" : "Back"} of License</DialogTitle>
          </DialogHeader>
          <img
            src={url}
            alt={`${side} of license (zoomed)`}
            className="w-full max-h-[70vh] object-contain rounded-md"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type ReviewAction = "approve" | "reject" | "resubmit" | null;

export default function LicenseReviewDetail() {
  const [, params] = useRoute("/compliance/license-review/:id");
  const id = params?.id;
  const { isSuperAdmin, isCorporate } = useAuth();
  const { toast } = useToast();

  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewNotes, setReviewNotes]   = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [auditOpen, setAuditOpen]       = useState(false);

  const { data, isLoading, refetch } = useQuery<DetailResponse>({
    queryKey: ["/api/compliance/license-submissions", id],
    queryFn: async () => {
      const r = await fetch(`/api/compliance/license-submissions/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: !!(id && (isSuperAdmin || isCorporate)),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/compliance/license-submissions/${id}/approve`, { reviewNotes }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/license-submissions"] });
      toast({ title: "License approved", description: "Driver record has been updated." });
      setReviewAction(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/compliance/license-submissions/${id}/reject`, { rejectionReason, reviewNotes }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/license-submissions"] });
      toast({ title: "Submission rejected" });
      setReviewAction(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Rejection failed", description: e.message, variant: "destructive" }),
  });

  const resubmitMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/compliance/license-submissions/${id}/request-resubmission`, { rejectionReason, reviewNotes }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/license-submissions"] });
      toast({ title: "Resubmission requested" });
      setReviewAction(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Request failed", description: e.message, variant: "destructive" }),
  });

  if (!id) return <div className="p-6 text-muted-foreground">Invalid submission ID.</div>;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <FileWarning className="h-10 w-10 mx-auto opacity-30 mb-3" />
        <p className="text-sm">Submission not found.</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href="/compliance/license-review"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to Queue</a>
        </Button>
      </div>
    );
  }

  const { submission: sub, driver, audit } = data;
  const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending_review;
  const Icon = cfg.icon;
  const isActionable = sub.status === "pending_review" || sub.status === "requires_resubmission";
  const isPending = approveMutation.isPending || rejectMutation.isPending || resubmitMutation.isPending;

  function handleConfirm() {
    if (reviewAction === "approve") approveMutation.mutate();
    else if (reviewAction === "reject") rejectMutation.mutate();
    else if (reviewAction === "resubmit") resubmitMutation.mutate();
  }

  const needsReason = reviewAction === "reject" || reviewAction === "resubmit";
  const confirmDisabled = isPending || (needsReason && !rejectionReason.trim());

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <a href="/compliance/license-review" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to Queue
          </a>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">License Review — {sub.driver_name || "Unknown Driver"}</h1>
            <Badge variant="outline" className={`flex items-center gap-1 ${cfg.className}`}>
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </Badge>
            {sub.priority === "urgent" && (
              <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400">Urgent</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Submission #{sub.id} · Submitted {fmtDateTime(sub.submitted_at)}</p>
        </div>
      </div>

      {/* Rejection info */}
      {sub.rejection_reason && (
        <div className="flex items-start gap-2 rounded-md px-3 py-2.5 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/40 text-sm text-red-800 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span><strong>Reason:</strong> {sub.rejection_reason}</span>
        </div>
      )}

      {/* Two-column: Current vs Proposed */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Current License on File
            </CardTitle>
            <CardDescription className="text-xs">Active record in DriverHub at time of submission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <InfoRow label="Driver Name"   value={sub.driver_name} />
            <InfoRow label="Driver ID"     value={sub.driver_id} />
            <InfoRow label="License State" value={sub.current_license_state} />
            <InfoRow label="License No."   value={sub.current_license_number} />
            <InfoRow label="Expiration"    value={fmtDate(sub.current_license_expiration)} />
            {driver && (
              <>
                <Separator className="my-1" />
                <p className="text-xs text-muted-foreground font-medium pt-1">Live Driver Record</p>
                <InfoRow label="Current State" value={driver.license_state} />
                <InfoRow label="Current No."   value={driver.license_number} />
                <InfoRow label="Current Exp."  value={fmtDate(driver.license_expiration)} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Proposed License Update
            </CardTitle>
            <CardDescription className="text-xs">Information submitted by the driver via MNM</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <InfoRow label="License State" value={sub.proposed_license_state} highlight />
            <InfoRow label="License No."   value={sub.proposed_license_number} highlight />
            <InfoRow label="Expiration"    value={fmtDate(sub.proposed_license_expiration)} highlight />
            <InfoRow label="Class"         value={sub.proposed_license_class} />
            <InfoRow label="Endorsements"  value={sub.proposed_endorsements} />
            <InfoRow label="Restrictions"  value={sub.proposed_restrictions} />
          </CardContent>
        </Card>
      </div>

      {/* Images */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">License Images</CardTitle>
          <CardDescription className="text-xs">Click an image to zoom. Images are stored securely and not publicly accessible.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <LicenseImage submissionId={sub.id} side="front" />
            <LicenseImage submissionId={sub.id} side="back" />
          </div>
        </CardContent>
      </Card>

      {/* Review Action Section */}
      {isActionable ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Review Actions</CardTitle>
            <CardDescription className="text-xs">
              {sub.status === "requires_resubmission"
                ? "Driver has resubmitted — review and take action."
                : "Review the proposed license update and take action below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Action selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={reviewAction === "approve" ? "default" : "outline"}
                onClick={() => setReviewAction(reviewAction === "approve" ? null : "approve")}
                className={reviewAction === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                data-testid="button-action-approve"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant={reviewAction === "reject" ? "default" : "outline"}
                onClick={() => setReviewAction(reviewAction === "reject" ? null : "reject")}
                className={reviewAction === "reject" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                data-testid="button-action-reject"
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Reject
              </Button>
              <Button
                size="sm"
                variant={reviewAction === "resubmit" ? "default" : "outline"}
                onClick={() => setReviewAction(reviewAction === "resubmit" ? null : "resubmit")}
                className={reviewAction === "resubmit" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                data-testid="button-action-resubmit"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Request Resubmission
              </Button>
            </div>

            {reviewAction && (
              <div className="space-y-3 pt-1">
                <Separator />
                {needsReason && (
                  <div className="space-y-1.5">
                    <Label htmlFor="rejection-reason" className="text-sm">
                      {reviewAction === "reject" ? "Rejection Reason" : "Reason for Resubmission"}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder="Explain why this submission cannot be accepted…"
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      className="min-h-[80px]"
                      data-testid="textarea-rejection-reason"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="review-notes" className="text-sm">Reviewer Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    id="review-notes"
                    placeholder="Internal notes for the review record…"
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    className="min-h-[60px]"
                    data-testid="textarea-review-notes"
                  />
                </div>
                {reviewAction === "approve" && (
                  <div className="flex items-start gap-2 rounded-md px-3 py-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 text-sm text-green-800 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Approving will update the driver's license information in DriverHub to match the proposed values.</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleConfirm}
                    disabled={confirmDisabled}
                    size="sm"
                    data-testid="button-confirm-action"
                  >
                    {isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</> :
                      reviewAction === "approve"   ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Confirm Approval</> :
                      reviewAction === "reject"    ? <><XCircle className="h-3.5 w-3.5 mr-1.5" />Confirm Rejection</> :
                      <><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Confirm Resubmission Request</>
                    }
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setReviewAction(null); setRejectionReason(""); setReviewNotes(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 px-4 flex items-center gap-3">
            <Icon className={`h-4 w-4 shrink-0 ${cfg.className.split(" ")[0]}`} />
            <div className="text-sm">
              <span className="font-medium">{cfg.label}</span>
              {sub.reviewed_at && <span className="text-muted-foreground ml-2">— reviewed {fmtDateTime(sub.reviewed_at)}</span>}
            </div>
            {sub.review_notes && <span className="text-sm text-muted-foreground ml-2 truncate">· {sub.review_notes}</span>}
          </CardContent>
        </Card>
      )}

      {/* Audit History */}
      {audit.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover-elevate rounded-md"
              onClick={() => setAuditOpen(v => !v)}
              data-testid="button-toggle-audit"
            >
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Audit History ({audit.length} event{audit.length !== 1 ? "s" : ""})
              </span>
              {auditOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {auditOpen && (
              <div className="px-4 pb-4 space-y-2">
                <Separator className="mb-3" />
                {audit.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <span className="text-xs text-muted-foreground mt-0.5 w-36 shrink-0">{fmtDateTime(entry.performed_at)}</span>
                    <span className="font-medium text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    {entry.performed_by && <span className="text-muted-foreground text-xs">by {entry.performed_by}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
