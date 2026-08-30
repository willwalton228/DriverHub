import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, Shield, AlertCircle, CheckCircle2, XCircle, Clock, User, 
  Calendar, History, Eye, Loader2, Building2, FileCheck, AlertTriangle,
  ChevronRight, Download
} from "lucide-react";

interface ComplianceEvidenceBundle {
  generatedAt: string;
  generatedBy: { id: string; email: string };
  
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: string | null;
    createdAt: string;
  };
  
  application: {
    id: string;
    requisitionTitle: string;
    market: string;
    currentStage: string;
    readinessStatus: string;
    readinessScore: number;
    readinessReasons: unknown;
    readinessLastCalculatedAt: string | null;
    backgroundCheckStatus: string | null;
    docsComplete: boolean | null;
    consentCaptured: boolean | null;
    complianceStatus: string | null;
    complianceBlockedReason: string | null;
    appliedAt: string;
    disposition: string | null;
    dispositionReason: string | null;
    disposedAt: string | null;
  };
  
  documents: {
    id: string;
    type: string;
    name: string;
    status: string;
    esignStatus: string | null;
    esignSentAt: string | null;
    esignSignedAt: string | null;
    createdAt: string;
    finalizedAt: string | null;
  }[];
  
  stageHistory: {
    id: string;
    fromStage: string | null;
    toStage: string;
    transitionedAt: string;
    transitionedBy: string | null;
    transitionedByEmail: string | null;
    reason: string | null;
    notes: string | null;
  }[];
  
  auditEvents: {
    id: string;
    actionType: string;
    entityType: string;
    entityId: string;
    userId: string | null;
    userEmail: string | null;
    changedFields: string[] | null;
    reason: string | null;
    occurredAt: string;
  }[];
  
  summary: {
    totalDocuments: number;
    completedDocuments: number;
    pendingDocuments: number;
    totalStageTransitions: number;
    totalAuditEvents: number;
    daysInPipeline: number;
    isCompliant: boolean;
    complianceIssues: string[];
  };
}

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  ready: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: CheckCircle2 },
  passed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: CheckCircle2 },
  in_review: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", icon: Clock },
  not_ready: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: XCircle },
  blocked: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: AlertCircle },
  pending: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", icon: Clock },
  failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: XCircle },
  finalized: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: FileCheck },
  signed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: FileCheck },
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", icon: FileText },
  sent_for_signature: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", icon: Clock },
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const config = statusColors[status] || statusColors.pending;
  const Icon = config.icon;
  return (
    <Badge className={`${config.bg} ${config.text} gap-1 shrink-0`}>
      <Icon className="h-3 w-3" />
      {label || status.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

interface ComplianceEvidenceViewProps {
  applicationId: string;
  trigger?: React.ReactNode;
}

export function ComplianceEvidenceView({ applicationId, trigger }: ComplianceEvidenceViewProps) {
  const { data, isLoading, error } = useQuery<ComplianceEvidenceBundle>({
    queryKey: ['/api/recruiting/compliance', applicationId],
    enabled: !!applicationId,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid={`button-view-compliance-${applicationId}`}>
            <Eye className="h-4 w-4 mr-1" />
            Compliance View
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-compliance-evidence">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Compliance Evidence Bundle
          </DialogTitle>
          <DialogDescription>
            Read-only compliance view for legal and insurer review
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-red-600 dark:text-red-400">Failed to load compliance data</p>
            <p className="text-sm text-muted-foreground mt-1">Please try again or contact support</p>
          </div>
        )}

        {data && <ComplianceEvidenceContent data={data} />}
      </DialogContent>
    </Dialog>
  );
}

function ComplianceEvidenceContent({ data }: { data: ComplianceEvidenceBundle }) {
  const { candidate, application, documents, stageHistory, auditEvents, summary } = data;

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-6 pr-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Generated: {formatDate(data.generatedAt)}</span>
          <span>By: {data.generatedBy.email}</span>
        </div>

        <div className={`p-4 rounded-lg border ${summary.isCompliant ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
          <div className="flex items-center gap-3">
            {summary.isCompliant ? (
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            )}
            <div>
              <h3 className={`text-lg font-semibold ${summary.isCompliant ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {summary.isCompliant ? 'Fully Compliant' : 'Compliance Issues Detected'}
              </h3>
              {!summary.isCompliant && summary.complianceIssues.length > 0 && (
                <ul className="text-sm text-red-600 dark:text-red-400 mt-1 list-disc list-inside">
                  {summary.complianceIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-3">
            <div className="text-2xl font-bold">{summary.daysInPipeline}</div>
            <div className="text-xs text-muted-foreground">Days in Pipeline</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold">{summary.completedDocuments}/{summary.totalDocuments}</div>
            <div className="text-xs text-muted-foreground">Documents Complete</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold">{summary.totalStageTransitions}</div>
            <div className="text-xs text-muted-foreground">Stage Transitions</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold">{summary.totalAuditEvents}</div>
            <div className="text-xs text-muted-foreground">Audit Events</div>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-compliance-overview">Overview</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-compliance-documents">Documents ({documents.length})</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-compliance-history">Stage History ({stageHistory.length})</TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-compliance-audit">Audit Trail ({auditEvents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Candidate Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <span className="ml-2 font-medium">{candidate.firstName} {candidate.lastName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <span className="ml-2">{candidate.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="ml-2">{candidate.phone || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2">{candidate.status || '-'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Application Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Position:</span>
                    <span className="ml-2 font-medium">{application.requisitionTitle}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Market:</span>
                    <span className="ml-2">{application.market}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Stage:</span>
                    <span className="ml-2">{application.currentStage.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Applied:</span>
                    <span className="ml-2">{formatDate(application.appliedAt)}</span>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Readiness:</span>
                    <StatusBadge status={application.readinessStatus} />
                    <span className="text-xs font-mono">({application.readinessScore}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Background:</span>
                    <StatusBadge status={application.backgroundCheckStatus || 'pending'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Compliance:</span>
                    <StatusBadge status={application.complianceStatus || 'pending'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Docs Complete:</span>
                    {application.docsComplete ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Yes
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <XCircle className="h-3 w-3 mr-1" />
                        No
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Consent:</span>
                    {application.consentCaptured ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Captured
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Captured
                      </Badge>
                    )}
                  </div>
                </div>

                {application.complianceBlockedReason && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">Blocked Reason:</span>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{application.complianceBlockedReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Document Evidence
                </CardTitle>
                <CardDescription>
                  {summary.completedDocuments} of {summary.totalDocuments} documents completed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No documents found</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div 
                        key={doc.id} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        data-testid={`document-${doc.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{doc.name}</div>
                            <div className="text-xs text-muted-foreground">{doc.type.replace(/_/g, ' ')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={doc.status} />
                          {doc.esignSignedAt && (
                            <span className="text-xs text-muted-foreground">
                              Signed: {formatDate(doc.esignSignedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Stage Transition History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stageHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No stage history found</p>
                ) : (
                  <div className="space-y-3">
                    {stageHistory.map((stage, idx) => (
                      <div 
                        key={stage.id} 
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        data-testid={`stage-history-${stage.id}`}
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <ChevronRight className="h-4 w-4 text-primary" />
                          </div>
                          {idx < stageHistory.length - 1 && (
                            <div className="w-0.5 h-8 bg-border mt-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">{stage.fromStage?.replace(/_/g, ' ') || 'Start'}</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            <Badge>{stage.toStage.replace(/_/g, ' ')}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDate(stage.transitionedAt)}
                            {stage.transitionedByEmail && ` by ${stage.transitionedByEmail}`}
                          </div>
                          {stage.reason && (
                            <div className="text-sm mt-1">{stage.reason}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Audit Trail
                </CardTitle>
                <CardDescription>Immutable record of all changes</CardDescription>
              </CardHeader>
              <CardContent>
                {auditEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No audit events found</p>
                ) : (
                  <div className="space-y-2">
                    {auditEvents.map((event) => (
                      <div 
                        key={event.id} 
                        className="p-3 rounded-lg border bg-card text-sm"
                        data-testid={`audit-event-${event.id}`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{event.actionType.replace(/_/g, ' ')}</Badge>
                            <span className="text-muted-foreground">{event.entityType}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(event.occurredAt)}</span>
                        </div>
                        {event.userEmail && (
                          <div className="text-xs text-muted-foreground mt-1">By: {event.userEmail}</div>
                        )}
                        {event.changedFields && event.changedFields.length > 0 && (
                          <div className="text-xs mt-1">
                            <span className="text-muted-foreground">Changed: </span>
                            {event.changedFields.join(', ')}
                          </div>
                        )}
                        {event.reason && (
                          <div className="text-xs mt-1">{event.reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}

export default ComplianceEvidenceView;
