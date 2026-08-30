import { useState, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Link2, Copy, ExternalLink, Loader2, Plus, Trash2,
  FileText, CheckCircle2, Clock, XCircle, Upload, Eye,
  Shield, AlertCircle
} from "lucide-react";
import { format } from "date-fns";

interface CandidatePortalManagerProps {
  applicationId: string;
}

export function CandidatePortalDialog({ applicationId, trigger }: { applicationId: string; trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]" data-testid="dialog-candidate-portal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Candidate Portal Management
          </DialogTitle>
          <DialogDescription>
            Generate a secure link for the candidate to view their application status and upload requested documents.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <CandidatePortalManager applicationId={applicationId} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

const DOC_TYPES = [
  { value: "drivers_license", label: "Driver's License" },
  { value: "commercial_license", label: "Commercial License (CDL)" },
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "vehicle_registration", label: "Vehicle Registration" },
  { value: "proof_of_address", label: "Proof of Address" },
  { value: "ssn_card", label: "Social Security Card" },
  { value: "w9_form", label: "W-9 Form" },
  { value: "background_consent", label: "Background Check Consent" },
  { value: "drug_test_consent", label: "Drug Test Consent" },
  { value: "other", label: "Other" },
];

function DocStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "uploaded":
      return <Badge variant="secondary"><Upload className="h-3 w-3 mr-1" />Uploaded</Badge>;
    case "approved":
      return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function CandidatePortalManager({ applicationId }: CandidatePortalManagerProps) {
  const { toast } = useToast();
  const [showAddDocDialog, setShowAddDocDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [newDoc, setNewDoc] = useState({ documentType: "", label: "", description: "", required: true });
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const tokensQuery = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "portal-token"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruiting/applications/${applicationId}/portal-token`);
      return res.json();
    },
  });

  const docRequestsQuery = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "document-requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruiting/applications/${applicationId}/document-requests`);
      return res.json();
    },
  });

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/portal-token`, {});
      return res.json();
    },
    onSuccess: (data) => {
      const portalUrl = `${window.location.origin}/portal/candidate/${data.token}`;
      setGeneratedToken(portalUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "portal-token"] });
      toast({ title: "Portal link generated", description: "Copy the link and share it with the candidate." });
    },
    onError: () => {
      toast({ title: "Failed to generate link", variant: "destructive" });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await apiRequest("DELETE", `/api/recruiting/applications/${applicationId}/portal-token/${tokenId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "portal-token"] });
      toast({ title: "Token revoked" });
    },
  });

  const createDocRequestMutation = useMutation({
    mutationFn: async (data: { documentType: string; label: string; description: string; required: boolean }) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/document-requests`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      setShowAddDocDialog(false);
      setNewDoc({ documentType: "", label: "", description: "", required: true });
      toast({ title: "Document request created" });
    },
    onError: () => {
      toast({ title: "Failed to create request", variant: "destructive" });
    },
  });

  const reviewDocMutation = useMutation({
    mutationFn: async ({ docId, status, reviewNotes }: { docId: string; status: string; reviewNotes: string }) => {
      const res = await apiRequest("PATCH", `/api/recruiting/applications/${applicationId}/document-requests/${docId}/review`, { status, reviewNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      setShowReviewDialog(null);
      setReviewNotes("");
      toast({ title: "Document reviewed" });
    },
  });

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const activeToken = tokensQuery.data?.find((t: any) => !t.isRevoked && new Date(t.expiresAt) > new Date());
  const documents = docRequestsQuery.data || [];
  const uploadedDocs = documents.filter((d: any) => d.status === "uploaded");

  return (
    <div className="space-y-4" data-testid="candidate-portal-manager">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
            <Shield className="h-4 w-4" />
            Candidate Portal Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {generatedToken && (
            <div className="p-3 rounded-md border bg-muted/50 space-y-2" data-testid="portal-link-display">
              <Label className="text-xs font-medium">Portal Link (share with candidate)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={generatedToken}
                  readOnly
                  className="text-xs font-mono"
                  data-testid="input-portal-link"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopyLink(generatedToken)}
                  data-testid="button-copy-link"
                >
                  {copiedLink ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This link will expire after 30 days of inactivity. Previous links have been revoked.
              </p>
            </div>
          )}

          {activeToken && !generatedToken && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-md border text-xs" data-testid="active-token-info">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-green-600" />
                <span>Active portal link</span>
                {activeToken.lastAccessedAt && (
                  <span className="text-muted-foreground">
                    Last accessed: {format(new Date(activeToken.lastAccessedAt), "MMM d, h:mm a")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                  Expires {format(new Date(activeToken.expiresAt), "MMM d, yyyy")}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => revokeTokenMutation.mutate(activeToken.id)}
                  data-testid="button-revoke-token"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => {
                setGeneratedToken(null);
                generateTokenMutation.mutate();
              }}
              disabled={generateTokenMutation.isPending}
              data-testid="button-generate-portal-link"
            >
              {generateTokenMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Link2 className="h-4 w-4 mr-1" />
              )}
              {activeToken ? "Regenerate Link" : "Generate Portal Link"}
            </Button>
            {activeToken && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/portal/candidate/preview`, "_blank")}
                data-testid="button-preview-portal"
              >
                <Eye className="h-4 w-4 mr-1" />Preview
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Document Requests
              {uploadedDocs.length > 0 && (
                <Badge variant="secondary">{uploadedDocs.length} awaiting review</Badge>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddDocDialog(true)}
              data-testid="button-add-doc-request"
            >
              <Plus className="h-4 w-4 mr-1" />Request Doc
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-doc-requests">
              No document requests yet. Add requests for the candidate to upload.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-md border"
                  data-testid={`recruiter-doc-${doc.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{doc.label}</span>
                        {doc.required && <Badge variant="outline" className="text-[10px]">Required</Badge>}
                      </div>
                      {doc.uploadedFileName && (
                        <span className="text-xs text-muted-foreground block truncate">{doc.uploadedFileName}</span>
                      )}
                      {doc.uploadedAt && (
                        <span className="text-xs text-muted-foreground">
                          Uploaded {format(new Date(doc.uploadedAt), "MMM d, h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DocStatusBadge status={doc.status} />
                    {doc.status === "uploaded" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowReviewDialog(doc.id);
                          setReviewStatus("approved");
                          setReviewNotes("");
                        }}
                        data-testid={`button-review-doc-${doc.id}`}
                      >
                        Review
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDocDialog} onOpenChange={setShowAddDocDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-add-doc-request">
          <DialogHeader>
            <DialogTitle>Request Document from Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={newDoc.documentType} onValueChange={(v) => {
                const found = DOC_TYPES.find(d => d.value === v);
                setNewDoc(prev => ({ ...prev, documentType: v, label: found?.label || prev.label }));
              }}>
                <SelectTrigger data-testid="select-doc-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Display Label</Label>
              <Input
                value={newDoc.label}
                onChange={(e) => setNewDoc(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Commercial Driver's License (front & back)"
                data-testid="input-doc-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions for Candidate (optional)</Label>
              <Textarea
                value={newDoc.description}
                onChange={(e) => setNewDoc(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Please upload a clear photo or scan..."
                className="resize-none"
                data-testid="input-doc-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDocDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createDocRequestMutation.mutate(newDoc)}
              disabled={!newDoc.documentType || !newDoc.label || createDocRequestMutation.isPending}
              data-testid="button-submit-doc-request"
            >
              {createDocRequestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showReviewDialog} onOpenChange={() => setShowReviewDialog(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-review-doc">
          <DialogHeader>
            <DialogTitle>Review Uploaded Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Decision</Label>
              <Select value={reviewStatus} onValueChange={(v: "approved" | "rejected") => setReviewStatus(v)}>
                <SelectTrigger data-testid="select-review-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="rejected">Reject (request re-upload)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes {reviewStatus === "rejected" && "(visible to candidate)"}</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={reviewStatus === "rejected" ? "Please explain what needs to be corrected..." : "Optional notes..."}
                className="resize-none"
                data-testid="input-review-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(null)}>Cancel</Button>
            <Button
              onClick={() => showReviewDialog && reviewDocMutation.mutate({ docId: showReviewDialog, status: reviewStatus, reviewNotes })}
              disabled={reviewDocMutation.isPending}
              data-testid="button-submit-review"
            >
              {reviewDocMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {reviewStatus === "approved" ? "Approve" : "Reject & Request Re-upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}