import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Eye, 
  Filter, 
  FileWarning, 
  Shield, 
  Truck, 
  User,
  MessageSquare,
  ExternalLink,
  Image
} from "lucide-react";
import { Link } from "wouter";
import { ProofGallery } from "@/components/ProofViewer";

interface CaseData {
  id: string;
  caseType: string;
  severity: string;
  status: string;
  moveId: string | null;
  driverId: string | null;
  customerId: string | null;
  assignedQueue: string | null;
  title: string;
  description: string | null;
  exceptionType: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CaseSummary {
  byStatus: { open: number; in_review: number; resolved: number; closed: number };
  byType: { QA: number; CLAIMS: number };
  bySeverity: { low: number; medium: number; high: number };
  total: number;
}

interface CaseActivity {
  id: number;
  caseId: string;
  action: string;
  actorId: string | null;
  actorType: string;
  previousValue: string | null;
  newValue: string | null;
  notes: string | null;
  occurredAt: string;
}

interface CaseWithActivity extends CaseData {
  activity: CaseActivity[];
}

export default function QAQueue() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  // Check for caseId in URL for deep-linking
  const urlParams = new URLSearchParams(window.location.search);
  const linkedCaseId = urlParams.get('caseId');
  
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [selectedCase, setSelectedCase] = useState<CaseWithActivity | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Auto-open linked case from URL
  const { data: linkedCaseData } = useQuery<CaseWithActivity>({
    queryKey: ['/api/cases', linkedCaseId],
    enabled: isAuthenticated && !!linkedCaseId,
    queryFn: async () => {
      const response = await fetch(`/api/cases/${linkedCaseId}`, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch linked case");
      return response.json();
    },
  });

  // Open case detail dialog when linked case is loaded (using useEffect to avoid render-time side effects)
  useEffect(() => {
    if (linkedCaseData && linkedCaseId) {
      setSelectedCase(linkedCaseData);
      setShowDetailDialog(true);
      // Clean up URL
      window.history.replaceState({}, '', '/claims/case-queue');
    }
  }, [linkedCaseData, linkedCaseId]);

  const { data: cases, isLoading } = useQuery<CaseData[]>({
    queryKey: ['/api/cases', statusFilter, typeFilter, severityFilter, queueFilter],
    enabled: isAuthenticated,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter !== 'all') params.append('caseType', typeFilter);
      if (severityFilter !== 'all') params.append('severity', severityFilter);
      if (queueFilter !== 'all') params.append('assignedQueue', queueFilter);
      const response = await fetch(`/api/cases?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch cases");
      return response.json();
    },
  });

  const { data: summary } = useQuery<CaseSummary>({
    queryKey: ['/api/cases/summary'],
    enabled: isAuthenticated,
  });

  // Fetch proofs for the selected case's move
  const { data: moveProofs, isLoading: proofsLoading, error: proofsError } = useQuery({
    queryKey: ['/api/moves', selectedCase?.moveId, 'proofs'],
    enabled: isAuthenticated && !!selectedCase?.moveId && showDetailDialog,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${selectedCase?.moveId}/proofs`, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch proofs");
      const data = await response.json();
      return data.proofs || [];
    },
    retry: false,
  });

  const fetchCaseDetails = async (id: string) => {
    const response = await fetch(`/api/cases/${id}`, { credentials: 'include' });
    if (!response.ok) throw new Error("Failed to fetch case details");
    return response.json();
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, resolutionSummary }: { id: string; status: string; resolutionSummary?: string }) => {
      return apiRequest('PATCH', `/api/cases/${id}/status`, { status, resolutionSummary });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey as string[];
          return key[0]?.startsWith('/api/cases');
        }
      });
      setShowStatusDialog(false);
      setNewStatus("");
      setResolutionSummary("");
      toast({ title: "Case status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      return apiRequest('POST', `/api/cases/${id}/activity`, { action: 'note_added', notes });
    },
    onSuccess: async () => {
      if (selectedCase) {
        const updated = await fetchCaseDetails(selectedCase.id);
        setSelectedCase(updated);
      }
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey as string[];
          return key[0]?.startsWith('/api/cases');
        }
      });
      setShowNoteDialog(false);
      setNoteText("");
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <Badge className="bg-red-600 text-white" data-testid="badge-severity-high">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 text-black" data-testid="badge-severity-medium">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary" data-testid="badge-severity-low">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    return <Badge className={getStatusBadgeClass(status)} data-testid={`badge-status-${status.replace(/[^a-z0-9]/gi, '-')}`}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>;
  };

  const getTypeBadge = (caseType: string) => {
    switch (caseType) {
      case 'QA':
        return <Badge variant="outline" className="border-blue-500 text-blue-500">QA</Badge>;
      case 'CLAIMS':
        return <Badge variant="outline" className="border-orange-500 text-orange-500">Claims</Badge>;
      default:
        return <Badge variant="outline">{caseType}</Badge>;
    }
  };

  const handleViewCase = async (caseItem: CaseData) => {
    try {
      const details = await fetchCaseDetails(caseItem.id);
      setSelectedCase(details);
      setShowDetailDialog(true);
    } catch (error) {
      toast({ title: "Failed to load case details", variant: "destructive" });
    }
  };

  const handleStatusChange = (caseItem: CaseData) => {
    setSelectedCase(caseItem as CaseWithActivity);
    setNewStatus(caseItem.status);
    setShowStatusDialog(true);
  };

  const handleAddNote = () => {
    setShowNoteDialog(true);
  };

  const filteredCases = cases?.filter(c => 
    searchQuery === "" || 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.moveId?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="title-qa-queue">Case Queue</h1>
          <p className="text-muted-foreground">
            Manage exceptions, QA reviews, and case workflows
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-summary-open">
          <CardHeader className="pb-2">
            <CardDescription>Open Cases</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{summary?.byStatus.open || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="card-summary-review">
          <CardHeader className="pb-2">
            <CardDescription>In Review</CardDescription>
            <CardTitle className="text-2xl text-purple-600">{summary?.byStatus.in_review || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="card-summary-qa">
          <CardHeader className="pb-2">
            <CardDescription>QA Cases</CardDescription>
            <CardTitle className="text-2xl">{summary?.byType.QA || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="card-summary-claims">
          <CardHeader className="pb-2">
            <CardDescription>Claims Cases</CardDescription>
            <CardTitle className="text-2xl text-orange-500">{summary?.byType.CLAIMS || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by title, case ID, or move ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-cases"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="QA">QA</SelectItem>
                <SelectItem value="CLAIMS">Claims</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-severity-filter">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={queueFilter} onValueChange={setQueueFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-queue-filter">
                <SelectValue placeholder="Queue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Queues</SelectItem>
                <SelectItem value="claims_team">Claims Team</SelectItem>
                <SelectItem value="damage_review">Damage Review</SelectItem>
                <SelectItem value="operations_team">Operations Team</SelectItem>
                <SelectItem value="qa_team">QA Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cases List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5" />
            Cases
            {filteredCases.length > 0 && (
              <Badge variant="secondary" className="ml-2">{filteredCases.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading cases...</p>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cases found matching your filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="p-4 rounded-lg border hover-elevate cursor-pointer"
                  data-testid={`case-item-${caseItem.id}`}
                  onClick={() => handleViewCase(caseItem)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {getTypeBadge(caseItem.caseType)}
                        {getSeverityBadge(caseItem.severity)}
                        {getStatusBadge(caseItem.status)}
                        {caseItem.exceptionType && (
                          <Badge variant="outline" className="text-xs">
                            {caseItem.exceptionType.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-medium truncate" data-testid={`case-title-${caseItem.id}`}>
                        {caseItem.title}
                      </h3>
                      {caseItem.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {caseItem.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {caseItem.moveId && (
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            Move: {caseItem.moveId.slice(0, 8)}...
                          </span>
                        )}
                        {caseItem.assignedQueue && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {caseItem.assignedQueue.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(caseItem.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(caseItem);
                        }}
                        data-testid={`button-update-status-${caseItem.id}`}
                      >
                        Update
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewCase(caseItem);
                        }}
                        data-testid={`button-view-case-${caseItem.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Case Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCase?.caseType === 'CLAIMS' ? (
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              ) : (
                <Shield className="h-5 w-5 text-blue-500" />
              )}
              Case Details
            </DialogTitle>
            <DialogDescription>
              Case ID: {selectedCase?.id}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCase && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {getTypeBadge(selectedCase.caseType)}
                {getSeverityBadge(selectedCase.severity)}
                {getStatusBadge(selectedCase.status)}
              </div>

              <div>
                <h3 className="font-semibold mb-1">{selectedCase.title}</h3>
                {selectedCase.description && (
                  <p className="text-sm text-muted-foreground">{selectedCase.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedCase.moveId && (
                  <div>
                    <p className="text-muted-foreground">Move</p>
                    <Link href={`/corporate/trips/${selectedCase.moveId}`}>
                      <span className="text-primary hover:underline flex items-center cursor-pointer" data-testid="link-case-move">
                        {selectedCase.moveId.slice(0, 12)}...
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </span>
                    </Link>
                  </div>
                )}
                {selectedCase.exceptionType && (
                  <div>
                    <p className="text-muted-foreground">Exception Type</p>
                    <p>{selectedCase.exceptionType.replace(/_/g, ' ')}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Assigned Queue</p>
                  <p>{selectedCase.assignedQueue?.replace(/_/g, ' ') || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(selectedCase.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Evidence / Proofs Section */}
              {selectedCase.moveId && (
                <div data-testid="case-proofs-section">
                  <div className="flex items-center gap-2 mb-2">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium">Evidence / Proofs</h4>
                    {proofsLoading && (
                      <Badge variant="outline" className="text-xs">Loading...</Badge>
                    )}
                  </div>
                  {proofsError ? (
                    <p className="text-sm text-destructive" data-testid="proofs-error">
                      Failed to load proofs: {(proofsError as Error).message}
                    </p>
                  ) : moveProofs && moveProofs.length > 0 ? (
                    <ProofGallery 
                      proofs={moveProofs} 
                      context={selectedCase.caseType === 'CLAIMS' ? 'claims' : 'qa'} 
                      size="sm"
                      emptyMessage="No proofs captured for this move"
                    />
                  ) : !proofsLoading ? (
                    <p className="text-sm text-muted-foreground">No proofs available for this move.</p>
                  ) : null}
                </div>
              )}

              {/* Activity Timeline */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Activity</h4>
                  <Button size="sm" variant="outline" onClick={handleAddNote} data-testid="button-add-note">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Add Note
                  </Button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {selectedCase.activity?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  ) : (
                    selectedCase.activity?.map((act) => (
                      <div key={act.id} className="p-2 rounded border text-sm" data-testid={`activity-${act.id}`}>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{act.action.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(act.occurredAt).toLocaleString()}
                          </span>
                        </div>
                        {act.previousValue && act.newValue && (
                          <p className="text-xs mt-1">
                            {act.previousValue} → {act.newValue}
                          </p>
                        )}
                        {act.notes && (
                          <p className="mt-1 text-muted-foreground">{act.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setShowDetailDialog(false);
              if (selectedCase) handleStatusChange(selectedCase);
            }} data-testid="button-update-from-detail">
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Case Status</DialogTitle>
            <DialogDescription>
              Change the status of this case
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="select-new-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {(newStatus === 'resolved' || newStatus === 'closed') && (
              <div>
                <label className="text-sm font-medium">Resolution Summary</label>
                <Textarea
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="Describe how this case was resolved..."
                  data-testid="input-resolution-summary"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCase) {
                  updateStatusMutation.mutate({
                    id: selectedCase.id,
                    status: newStatus,
                    resolutionSummary: resolutionSummary || undefined,
                  });
                }
              }}
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-status-update"
            >
              {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Add a note to this case
            </DialogDescription>
          </DialogHeader>
          
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Enter your note..."
            rows={4}
            data-testid="input-note-text"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCase && noteText.trim()) {
                  addNoteMutation.mutate({ id: selectedCase.id, notes: noteText });
                }
              }}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              data-testid="button-confirm-add-note"
            >
              {addNoteMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
