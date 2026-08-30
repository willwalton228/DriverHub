import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Archive, Search, Eye, Play, FileText, MessageSquare, Shield, Clock, User, Briefcase, ChevronLeft, ChevronRight, Rocket, AlertTriangle, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ArchiveSnapshot {
  candidateProfile: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    location?: string;
    currentTitle?: string;
    currentCompany?: string;
    yearsExperience?: number;
    source?: string;
    skills?: string;
    education?: string;
  };
  application: {
    id: string;
    status: string;
    stage: string;
    appliedAt?: string;
    rejectedAt?: string;
    hiredAt?: string;
    withdrawnAt?: string;
    rejectionReason?: string;
    withdrawnReason?: string;
    screeningScore?: number;
    rating?: number;
    backgroundStatus?: string;
    complianceStatus?: string;
    assignedTo?: string;
  };
  requisitionSummary: {
    id: string;
    title: string;
    department?: string;
    location?: string;
    employmentType?: string;
  };
  stageHistory: Array<{
    id: string;
    fromStage: string;
    toStage: string;
    transitionedAt?: string;
    transitionedBy?: string;
    notes?: string;
  }>;
  documentsMetadata: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt?: string;
  }>;
  communicationsSummary: {
    totalCount: number;
    byType: Record<string, number>;
    lastCommunicationAt: string | null;
    entries: Array<{
      id: string;
      type: string;
      direction?: string;
      subject?: string;
      sentAt?: string;
      isAutomated?: boolean;
    }>;
  };
  consents: Array<{
    id: string;
    consentType: string;
    version: string;
    accepted: boolean;
    acceptedAt?: string;
    source?: string;
  }>;
}

interface ArchiveRecord {
  id: string;
  applicationId: string;
  candidateId: string;
  requisitionId: string;
  closureStatus: string;
  closedAt: string;
  archivedAt: string;
  snapshotVersion: string;
  snapshot: ArchiveSnapshot;
  archiveReason: string;
  createdBy: string | null;
  source: string;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function closureStatusBadge(status: string) {
  const variants: Record<string, string> = {
    hired: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    withdrawn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  };
  return (
    <Badge variant="outline" className={variants[status] || ""} data-testid={`badge-closure-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ArchiveDetailDialog({ archive, open, onClose }: { archive: ArchiveRecord; open: boolean; onClose: () => void }) {
  const snap = archive.snapshot;
  const [activeSection, setActiveSection] = useState("candidate");

  const sections = [
    { key: "candidate", label: "Candidate Profile", icon: User },
    { key: "application", label: "Application", icon: Briefcase },
    { key: "stages", label: "Stage History", icon: Clock },
    { key: "documents", label: "Documents", icon: FileText },
    { key: "communications", label: "Communications", icon: MessageSquare },
    { key: "consents", label: "Consents", icon: Shield },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-archive-detail-title">
            <Archive className="h-5 w-5" />
            Archive Snapshot
          </DialogTitle>
          <DialogDescription>
            Frozen record for {snap.candidateProfile.firstName} {snap.candidateProfile.lastName} &mdash; {snap.requisitionSummary.title || "Unknown Position"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Badge variant="secondary" data-testid="badge-snapshot-version">v{archive.snapshotVersion}</Badge>
          {closureStatusBadge(archive.closureStatus)}
          <span className="text-sm text-muted-foreground">
            Archived {formatDate(archive.archivedAt)}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {sections.map((s) => (
            <Button
              key={s.key}
              variant={activeSection === s.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveSection(s.key)}
              data-testid={`button-section-${s.key}`}
            >
              <s.icon className="h-3.5 w-3.5 mr-1.5" />
              {s.label}
            </Button>
          ))}
        </div>

        {activeSection === "candidate" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Candidate Profile (as-of)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span data-testid="text-archive-candidate-name">{snap.candidateProfile.firstName} {snap.candidateProfile.lastName}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span data-testid="text-archive-candidate-email">{snap.candidateProfile.email}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> {snap.candidateProfile.phone || "N/A"}</div>
                <div><span className="text-muted-foreground">Location:</span> {snap.candidateProfile.location || "N/A"}</div>
                <div><span className="text-muted-foreground">Title:</span> {snap.candidateProfile.currentTitle || "N/A"}</div>
                <div><span className="text-muted-foreground">Company:</span> {snap.candidateProfile.currentCompany || "N/A"}</div>
                <div><span className="text-muted-foreground">Experience:</span> {snap.candidateProfile.yearsExperience != null ? `${snap.candidateProfile.yearsExperience} years` : "N/A"}</div>
                <div><span className="text-muted-foreground">Source:</span> {snap.candidateProfile.source || "N/A"}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeSection === "application" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Application Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Position:</span> {snap.requisitionSummary.title}</div>
                <div><span className="text-muted-foreground">Department:</span> {snap.requisitionSummary.department || "N/A"}</div>
                <div><span className="text-muted-foreground">Status:</span> {snap.application.status}</div>
                <div><span className="text-muted-foreground">Stage:</span> {snap.application.stage}</div>
                <div><span className="text-muted-foreground">Applied:</span> {formatDate(snap.application.appliedAt)}</div>
                <div><span className="text-muted-foreground">Screening Score:</span> {snap.application.screeningScore ?? "N/A"}</div>
                <div><span className="text-muted-foreground">Rating:</span> {snap.application.rating ?? "N/A"}</div>
                <div><span className="text-muted-foreground">Background:</span> {snap.application.backgroundStatus || "N/A"}</div>
                {snap.application.rejectedAt && (
                  <>
                    <div><span className="text-muted-foreground">Rejected:</span> {formatDate(snap.application.rejectedAt)}</div>
                    <div><span className="text-muted-foreground">Reason:</span> {snap.application.rejectionReason || "N/A"}</div>
                  </>
                )}
                {snap.application.withdrawnAt && (
                  <>
                    <div><span className="text-muted-foreground">Withdrawn:</span> {formatDate(snap.application.withdrawnAt)}</div>
                    <div><span className="text-muted-foreground">Reason:</span> {snap.application.withdrawnReason || "N/A"}</div>
                  </>
                )}
                {snap.application.hiredAt && (
                  <div><span className="text-muted-foreground">Hired:</span> {formatDate(snap.application.hiredAt)}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeSection === "stages" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Stage History ({snap.stageHistory.length} transitions)</CardTitle></CardHeader>
            <CardContent>
              {snap.stageHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stage transitions recorded.</p>
              ) : (
                <div className="space-y-2">
                  {snap.stageHistory.map((sh, i) => (
                    <div key={sh.id || i} className="flex items-center gap-2 text-sm border-b pb-2 last:border-b-0" data-testid={`row-stage-${i}`}>
                      <Badge variant="outline" className="text-xs">{sh.fromStage || "start"}</Badge>
                      <span className="text-muted-foreground">&rarr;</span>
                      <Badge variant="outline" className="text-xs">{sh.toStage}</Badge>
                      <span className="text-muted-foreground ml-auto text-xs">{formatDate(sh.transitionedAt)}</span>
                      {sh.notes && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{sh.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeSection === "documents" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Documents Metadata ({snap.documentsMetadata.length})</CardTitle></CardHeader>
            <CardContent>
              {snap.documentsMetadata.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents recorded.</p>
              ) : (
                <div className="space-y-2">
                  {snap.documentsMetadata.map((doc, i) => (
                    <div key={doc.id || i} className="flex items-center gap-2 text-sm border-b pb-2 last:border-b-0" data-testid={`row-document-${i}`}>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{doc.name}</span>
                      <Badge variant="secondary" className="text-xs">{doc.type}</Badge>
                      <Badge variant="outline" className="text-xs">{doc.status}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDate(doc.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeSection === "communications" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Communications Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><span className="text-muted-foreground">Total:</span> {snap.communicationsSummary.totalCount}</div>
                <div><span className="text-muted-foreground">Last Contact:</span> {formatDate(snap.communicationsSummary.lastCommunicationAt)}</div>
                {Object.entries(snap.communicationsSummary.byType).map(([type, count]) => (
                  <div key={type}><span className="text-muted-foreground">{type}:</span> {count}</div>
                ))}
              </div>
              {snap.communicationsSummary.entries.length > 0 && (
                <div className="space-y-2 border-t pt-2">
                  {snap.communicationsSummary.entries.slice(0, 20).map((comm, i) => (
                    <div key={comm.id || i} className="flex items-center gap-2 text-sm" data-testid={`row-comm-${i}`}>
                      <Badge variant="outline" className="text-xs">{comm.type}</Badge>
                      {comm.direction && <Badge variant="secondary" className="text-xs">{comm.direction}</Badge>}
                      <span className="truncate max-w-[200px]">{comm.subject || "(no subject)"}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDate(comm.sentAt)}</span>
                    </div>
                  ))}
                  {snap.communicationsSummary.entries.length > 20 && (
                    <p className="text-xs text-muted-foreground">...and {snap.communicationsSummary.entries.length - 20} more</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeSection === "consents" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Consents ({snap.consents.length})</CardTitle></CardHeader>
            <CardContent>
              {snap.consents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No consents recorded.</p>
              ) : (
                <div className="space-y-2">
                  {snap.consents.map((c, i) => (
                    <div key={c.id || i} className="flex items-center gap-2 text-sm border-b pb-2 last:border-b-0" data-testid={`row-consent-${i}`}>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{c.consentType.replace(/_/g, " ")}</span>
                      <Badge variant={c.accepted ? "default" : "destructive"} className="text-xs">
                        {c.accepted ? "Accepted" : "Declined"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{c.version}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDate(c.acceptedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-archive">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArchiveViewer() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveRecord | null>(null);
  const [thresholdDays, setThresholdDays] = useState("90");
  const PAGE_SIZE = 20;

  const { data, isLoading, refetch } = useQuery<{ archives: ArchiveRecord[]; total: number }>({
    queryKey: ["/api/recruiting/archives", statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (statusFilter !== "all") params.set("closureStatus", statusFilter);
      const res = await fetch(`/api/recruiting/archives?${params}`);
      if (!res.ok) throw new Error("Failed to fetch archives");
      return res.json();
    },
  });

  const batchMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await apiRequest("POST", "/api/recruiting/archives/run", {
        thresholdDays: parseInt(thresholdDays, 10) || 90,
        dryRun,
      });
      return res.json();
    },
    onSuccess: (result, { dryRun }) => {
      if (dryRun) {
        toast({
          title: "Dry Run Complete",
          description: `${result.eligible} application(s) eligible for archive (closed > ${thresholdDays} days).`,
        });
      } else {
        toast({
          title: "Archive Complete",
          description: `${result.archived} of ${result.eligible} application(s) archived.${result.errors?.length ? ` ${result.errors.length} error(s).` : ""}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/recruiting/archives"] });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to run archive batch.", variant: "destructive" });
    },
  });

  const archives = data?.archives || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = search
    ? archives.filter((a) => {
        const snap = a.snapshot;
        const name = `${snap.candidateProfile.firstName} ${snap.candidateProfile.lastName}`.toLowerCase();
        const email = snap.candidateProfile.email.toLowerCase();
        const title = (snap.requisitionSummary.title || "").toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || email.includes(q) || title.includes(q);
      })
    : archives;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-archive-title">
            <Archive className="h-5 w-5" />
            Recruiting Archives
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or position..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-archive-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="select-archive-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="hired">Hired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">Batch Archive:</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Closed &gt;</span>
                  <Input
                    type="number"
                    value={thresholdDays}
                    onChange={(e) => setThresholdDays(e.target.value)}
                    className="w-20"
                    min={1}
                    data-testid="input-threshold-days"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => batchMutation.mutate({ dryRun: true })}
                  disabled={batchMutation.isPending}
                  data-testid="button-archive-dry-run"
                >
                  {batchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => batchMutation.mutate({ dryRun: false })}
                  disabled={batchMutation.isPending}
                  data-testid="button-archive-run"
                >
                  {batchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Run Archive
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-archive-empty">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No archived records found.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {filtered.map((archive) => (
                  <div
                    key={archive.id}
                    className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                    onClick={() => setSelectedArchive(archive)}
                    data-testid={`row-archive-${archive.id}`}
                  >
                    <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-archive-name-${archive.id}`}>
                          {archive.snapshot.candidateProfile.firstName} {archive.snapshot.candidateProfile.lastName}
                        </span>
                        {closureStatusBadge(archive.closureStatus)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {archive.snapshot.requisitionSummary.title || "Unknown Position"} &middot; Closed {formatDate(archive.closedAt)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      Archived {formatDate(archive.archivedAt)}
                    </div>
                    <Button variant="ghost" size="icon" data-testid={`button-view-archive-${archive.id}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {total} record(s) total
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      data-testid="button-archive-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      data-testid="button-archive-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedArchive && (
        <ArchiveDetailDialog
          archive={selectedArchive}
          open={!!selectedArchive}
          onClose={() => setSelectedArchive(null)}
        />
      )}
    </div>
  );
}

// ── Campaign Archives Section ──────────────────────────────────────────────────

function safeDateStr(val: string | null | undefined) {
  if (!val) return "—";
  try {
    const d = typeof val === "string" && val.includes("T") ? parseISO(val) : new Date(val);
    return format(d, "MMM d, yyyy h:mm a");
  } catch { return String(val); }
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  expedite: "Expedite",
  standard: "Standard",
  other: "Other",
};

const URGENCY_LABELS: Record<number, string> = {
  1: "Low", 2: "Med-Low", 3: "Medium", 4: "High", 5: "Critical",
};

export function CampaignArchivesSection() {
  const [search, setSearch] = useState("");

  const { data: archived = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests/archived"],
  });

  const filtered = archived.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [c.dealershipName, c.location, c.campaignType, c.archivedBy, c.archiveReason]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3" data-testid="section-campaign-archives">
      <div className="flex items-center gap-2">
        <Archive className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Archived Campaigns</h2>
        <Badge variant="outline" className="text-[10px]">{archived.length} archived</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Campaigns that have been archived are listed here. Original requests, approval history, and audit trails are preserved.
      </p>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search archived campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
          data-testid="input-campaign-archive-search"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading archived campaigns…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />Failed to load archived campaigns.
        </div>
      ) : archived.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <Archive className="h-8 w-8 text-muted-foreground/30 shrink-0" />
            <div>
              <p className="font-medium text-sm">No archived campaigns</p>
              <p className="text-xs text-muted-foreground mt-0.5">Campaigns archived from the Active Campaigns list will appear here.</p>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No archived campaigns match your search.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Account / Campaign", "Type", "Urgency", "Driver Type", "Target #", "Prev. Status", "Archived By", "Archived At", "Reason"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  data-testid={`row-archived-campaign-${c.id}`}
                  className={`text-sm ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                >
                  <td className="px-3 py-2.5 align-top">
                    <p className="font-medium text-sm">{c.dealershipName || <span className="text-muted-foreground">—</span>}</p>
                    {c.location && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{c.location}</p>}
                  </td>
                  <td className="px-3 py-2.5 align-top capitalize text-sm">
                    {CAMPAIGN_TYPE_LABELS[c.campaignType] ?? c.campaignType ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-sm">
                    {c.urgency != null ? (URGENCY_LABELS[c.urgency] ?? String(c.urgency)) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-sm">
                    {c.driverType || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top tabular-nums text-sm">
                    {c.targetDriverCount ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {c.archivePreviousStatus ?? c.requestStatus ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 align-top text-sm text-muted-foreground whitespace-nowrap">
                    {c.archivedBy || "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top text-sm text-muted-foreground whitespace-nowrap">
                    {safeDateStr(c.archivedAt)}
                  </td>
                  <td className="px-3 py-2.5 align-top text-sm max-w-[200px]">
                    <span className="text-muted-foreground italic line-clamp-2">{c.archiveReason || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
