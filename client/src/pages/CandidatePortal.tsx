import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, CheckCircle2, Clock, AlertCircle,
  Calendar, MapPin, Video, Phone, Loader2, XCircle,
  Briefcase, User, FileUp, ExternalLink
} from "lucide-react";

const STAGE_DISPLAY: Record<string, { label: string; description: string }> = {
  applied: { label: "Application Received", description: "Your application has been received and is being reviewed." },
  phone_screen: { label: "Phone Screen", description: "We'd like to schedule a phone conversation with you." },
  interview_scheduled: { label: "Interview Scheduled", description: "Your interview has been scheduled." },
  interview_completed: { label: "Interview Completed", description: "Your interview is complete. We're reviewing the results." },
  background_check: { label: "Background Check", description: "Your background check is in progress." },
  drug_test: { label: "Drug Test", description: "Your drug test is being processed." },
  mvr_check: { label: "Motor Vehicle Record Check", description: "Your driving record is being reviewed." },
  offer_extended: { label: "Offer Extended", description: "An offer has been extended to you." },
  offer_accepted: { label: "Offer Accepted", description: "Congratulations! Your offer has been accepted." },
  offer_declined: { label: "Offer Declined", description: "The offer was declined." },
  onboarding: { label: "Onboarding", description: "Welcome aboard! Your onboarding process has started." },
  hired: { label: "Hired", description: "You've been hired! Welcome to the team." },
  rejected: { label: "Not Selected", description: "We appreciate your interest but have decided to move forward with other candidates." },
  withdrawn: { label: "Withdrawn", description: "This application has been withdrawn." },
  no_show: { label: "No Show", description: "A no-show was recorded for this application." },
};

const STAGE_ORDER = [
  "applied", "phone_screen", "interview_scheduled", "interview_completed",
  "background_check", "drug_test", "mvr_check", "offer_extended",
  "offer_accepted", "onboarding", "hired"
];

function getStageProgress(currentStage: string): number {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

function isTerminalStage(stage: string): boolean {
  return ["rejected", "withdrawn", "no_show", "offer_declined", "hired"].includes(stage);
}

function DocStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" data-testid="badge-doc-pending"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "uploaded":
      return <Badge variant="secondary" data-testid="badge-doc-uploaded"><FileUp className="h-3 w-3 mr-1" />Uploaded</Badge>;
    case "approved":
      return <Badge className="bg-green-600 text-white" data-testid="badge-doc-approved"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive" data-testid="badge-doc-rejected"><XCircle className="h-3 w-3 mr-1" />Needs Revision</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function InterviewTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "video": return <Video className="h-4 w-4" />;
    case "phone": return <Phone className="h-4 w-4" />;
    case "in_person": return <MapPin className="h-4 w-4" />;
    default: return <Calendar className="h-4 w-4" />;
  }
}

export default function CandidatePortal() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const { toast } = useToast();
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{
    candidate: { firstName: string; lastName: string; email: string } | null;
    application: { id: string; currentStage: string; currentStageEnteredAt: string; appliedAt: string; docsComplete: boolean; backgroundCheckStatus: string } | null;
    requisition: { title: string; market: string } | null;
    interviews: Array<{ id: string; title: string; interviewType: string; status: string; startTime: string; endTime: string; durationMinutes: number; timezone: string; location: string | null; meetingLink: string | null }>;
    documentRequests: Array<{ id: string; documentType: string; label: string; description: string | null; required: boolean; status: string; uploadedFileName: string | null; uploadedAt: string | null; reviewNotes: string | null }>;
  }>({
    queryKey: ["/api/portal/candidate", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/candidate/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to load" }));
        throw new Error(err.message || "Failed to load portal");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ docRequestId, file }: { docRequestId: string; file: File }) => {
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(",")[1];
            const res = await fetch(`/api/portal/candidate/${token}/documents/${docRequestId}/upload`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: file.name,
                fileSize: String(file.size),
                mimeType: file.type,
                fileData: base64,
              }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ message: "Upload failed" }));
              throw new Error(err.message);
            }
            resolve(await res.json());
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      toast({ title: "Document uploaded", description: "Your document has been submitted for review." });
      setUploadingDocId(null);
      refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadingDocId(null);
    },
  });

  const handleFileSelect = useCallback((docRequestId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "File too large", description: "Please upload a file smaller than 10 MB.", variant: "destructive" });
          return;
        }
        setUploadingDocId(docRequestId);
        uploadMutation.mutate({ docRequestId, file });
      }
    };
    input.click();
  }, [token, uploadMutation, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="portal-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="portal-error">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to Access Portal</h2>
            <p className="text-muted-foreground text-sm">
              {(error as Error)?.message || "This link may be invalid, expired, or revoked. Please contact your recruiter for a new link."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { candidate, application, requisition, interviews, documentRequests } = data;
  const stageInfo = application ? STAGE_DISPLAY[application.currentStage] || { label: application.currentStage, description: "" } : null;
  const progress = application ? getStageProgress(application.currentStage) : 0;
  const terminal = application ? isTerminalStage(application.currentStage) : false;
  const pendingDocs = documentRequests.filter(d => d.status === "pending" || d.status === "rejected");
  const completedDocs = documentRequests.filter(d => d.status === "uploaded" || d.status === "approved");

  return (
    <div className="min-h-screen bg-background" data-testid="candidate-portal">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-portal-title">DriverHub 360</h1>
            <p className="text-xs text-muted-foreground">Candidate Portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {candidate && (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold" data-testid="text-candidate-name">
                {candidate.firstName} {candidate.lastName}
              </h2>
              {requisition && (
                <p className="text-sm text-muted-foreground" data-testid="text-position">
                  {requisition.title} — {requisition.market}
                </p>
              )}
            </div>
          </div>
        )}

        {application && stageInfo && (
          <Card data-testid="card-application-status">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                Application Status
                <Badge
                  variant={terminal ? (application.currentStage === "hired" ? "default" : "destructive") : "secondary"}
                  data-testid="badge-current-stage"
                >
                  {stageInfo.label}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground" data-testid="text-stage-description">
                {stageInfo.description}
              </p>

              {!terminal && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="progress-bar">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {application.appliedAt && (
                  <span data-testid="text-applied-date">
                    Applied: {format(new Date(application.appliedAt), "MMM d, yyyy")}
                  </span>
                )}
                {application.currentStageEnteredAt && (
                  <span data-testid="text-stage-since">
                    Current stage since: {format(new Date(application.currentStageEnteredAt), "MMM d, yyyy")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {pendingDocs.length > 0 && (
          <Card data-testid="card-pending-documents">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Action Required — Documents
                <Badge variant="outline">{pendingDocs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border"
                  data-testid={`doc-request-${doc.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm" data-testid={`text-doc-label-${doc.id}`}>{doc.label}</span>
                      {doc.required && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Required</Badge>}
                      <DocStatusBadge status={doc.status} />
                    </div>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                    )}
                    {doc.status === "rejected" && doc.reviewNotes && (
                      <p className="text-xs text-destructive mt-1" data-testid={`text-review-notes-${doc.id}`}>
                        Feedback: {doc.reviewNotes}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleFileSelect(doc.id)}
                    disabled={uploadingDocId === doc.id}
                    data-testid={`button-upload-${doc.id}`}
                  >
                    {uploadingDocId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Upload className="h-4 w-4 mr-1" />{doc.status === "rejected" ? "Re-upload" : "Upload"}</>
                    )}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {interviews.length > 0 && (
          <Card data-testid="card-interviews">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Calendar className="h-4 w-4" />
                Scheduled Interviews
                <Badge variant="outline">{interviews.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="p-3 rounded-md border space-y-2"
                  data-testid={`interview-${interview.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <InterviewTypeIcon type={interview.interviewType} />
                    <span className="font-medium text-sm" data-testid={`text-interview-title-${interview.id}`}>
                      {interview.title}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {interview.interviewType.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span data-testid={`text-interview-time-${interview.id}`}>
                      {format(new Date(interview.startTime), "EEE, MMM d, yyyy 'at' h:mm a")}
                      {" "}({interview.durationMinutes} min)
                    </span>
                    {interview.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{interview.location}
                      </span>
                    )}
                  </div>
                  {interview.meetingLink && (
                    <a
                      href={interview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      data-testid={`link-meeting-${interview.id}`}
                    >
                      <ExternalLink className="h-3 w-3" />Join Meeting
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {completedDocs.length > 0 && (
          <Card data-testid="card-completed-documents">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Submitted Documents
                <Badge variant="outline">{completedDocs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-md border"
                  data-testid={`completed-doc-${doc.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{doc.label}</span>
                      {doc.uploadedFileName && (
                        <span className="text-xs text-muted-foreground block truncate">{doc.uploadedFileName}</span>
                      )}
                    </div>
                  </div>
                  <DocStatusBadge status={doc.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {documentRequests.length === 0 && interviews.length === 0 && application && !terminal && (
          <Card data-testid="card-no-tasks">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <p className="font-medium">No outstanding tasks</p>
              <p className="text-sm text-muted-foreground mt-1">
                You're all caught up! We'll update this portal when there's something new.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t mt-8">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          <p>DriverHub 360 — Candidate Portal</p>
          <p className="mt-1">This link is personal and confidential. Do not share it with others.</p>
        </div>
      </footer>
    </div>
  );
}