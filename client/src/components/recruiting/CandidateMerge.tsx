import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { GitMerge, AlertTriangle, Users, Check, ArrowRight, Mail, Phone, FileText, Tag, History } from "lucide-react";

interface DuplicateMatch {
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    status: string;
    source?: string;
    createdAt: string;
  };
  matchType: string;
  matchConfidence: number;
  matchReasons: string[];
}

interface MergePreview {
  sourceCandidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    status: string;
    source?: string;
    createdAt: string;
  };
  targetCandidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    status: string;
    source?: string;
    createdAt: string;
  };
  applicationsToMove: number;
  documentsToMove: number;
  tagsToMove: number;
  warnings: string[];
}

interface PossibleDuplicatesBannerProps {
  candidateId: string;
  candidateName: string;
  onMergeComplete?: () => void;
}

export function PossibleDuplicatesBanner({ candidateId, candidateName, onMergeComplete }: PossibleDuplicatesBannerProps) {
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateMatch | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const { data: duplicatesData, isLoading } = useQuery<{ duplicates: DuplicateMatch[] }>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'duplicates'],
    enabled: !!candidateId,
  });

  const duplicates = duplicatesData?.duplicates || [];

  if (isLoading || duplicates.length === 0) {
    return null;
  }

  return (
    <Alert className="mb-4 border-orange-300 bg-orange-50 dark:bg-orange-950/20" data-testid="alert-possible-duplicates">
      <Users className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-800 dark:text-orange-300">Possible Duplicates Found</AlertTitle>
      <AlertDescription className="text-orange-700 dark:text-orange-400">
        <p className="mb-3">
          {duplicates.length === 1 
            ? "1 potential duplicate record was detected." 
            : `${duplicates.length} potential duplicate records were detected.`}
        </p>
        <div className="space-y-2">
          {duplicates.slice(0, 3).map((dup) => (
            <div 
              key={dup.candidate.id} 
              className="flex items-center justify-between gap-4 p-2 bg-white dark:bg-background rounded border"
              data-testid={`duplicate-match-${dup.candidate.id}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{dup.candidate.firstName} {dup.candidate.lastName}</span>
                  <Badge variant="outline" className="text-xs" data-testid={`badge-confidence-${dup.candidate.id}`}>
                    {dup.matchConfidence}% match
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Mail className="h-3 w-3" />
                  {dup.candidate.email}
                  {dup.candidate.phone && (
                    <>
                      <Phone className="h-3 w-3 ml-2" />
                      {dup.candidate.phone}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {dup.matchReasons.join(", ")}
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setSelectedDuplicate(dup);
                  setMergeDialogOpen(true);
                }}
                data-testid={`button-merge-${dup.candidate.id}`}
              >
                <GitMerge className="h-4 w-4 mr-1" />
                Merge
              </Button>
            </div>
          ))}
          {duplicates.length > 3 && (
            <p className="text-sm text-muted-foreground">
              +{duplicates.length - 3} more potential duplicates
            </p>
          )}
        </div>
      </AlertDescription>

      {selectedDuplicate && (
        <MergePreviewDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          sourceId={selectedDuplicate.candidate.id}
          targetId={candidateId}
          matchType={selectedDuplicate.matchType}
          matchConfidence={selectedDuplicate.matchConfidence}
          matchReasons={selectedDuplicate.matchReasons}
          onMergeComplete={() => {
            setMergeDialogOpen(false);
            setSelectedDuplicate(null);
            onMergeComplete?.();
          }}
        />
      )}
    </Alert>
  );
}

interface MergePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  targetId: string;
  matchType: string;
  matchConfidence: number;
  matchReasons: string[];
  onMergeComplete?: () => void;
}

export function MergePreviewDialog({
  open,
  onOpenChange,
  sourceId,
  targetId,
  matchType,
  matchConfidence,
  matchReasons,
  onMergeComplete,
}: MergePreviewDialogProps) {
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const { data: preview, isLoading: previewLoading } = useQuery<MergePreview>({
    queryKey: ['/api/recruiting/merge/preview', { sourceId, targetId }],
    enabled: open && !!sourceId && !!targetId,
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/recruiting/merge', {
        sourceId,
        targetId,
        matchType,
        matchConfidence,
        matchReasons,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Merge Successful",
        description: "Candidates have been merged successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting'] });
      onMergeComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: "Merge Failed",
        description: error.message || "Failed to merge candidates.",
        variant: "destructive",
      });
    },
  });

  if (!preview && !previewLoading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-merge-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Candidate Records
          </DialogTitle>
          <DialogDescription>
            Review the merge preview below. The source candidate will be merged into the target, preserving all data.
          </DialogDescription>
        </DialogHeader>

        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : preview ? (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card data-testid="card-source-candidate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="secondary">Source</Badge>
                      Will be merged
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="font-medium text-lg">
                      {preview.sourceCandidate.firstName} {preview.sourceCandidate.lastName}
                    </p>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        {preview.sourceCandidate.email}
                      </div>
                      {preview.sourceCandidate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {preview.sourceCandidate.phone}
                        </div>
                      )}
                      <div>Status: <Badge variant="outline" className="ml-1">{preview.sourceCandidate.status}</Badge></div>
                      <div>Source: {preview.sourceCandidate.source || 'Unknown'}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-target-candidate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge className="bg-green-600">Target</Badge>
                      Primary record
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="font-medium text-lg">
                      {preview.targetCandidate.firstName} {preview.targetCandidate.lastName}
                    </p>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        {preview.targetCandidate.email}
                      </div>
                      {preview.targetCandidate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {preview.targetCandidate.phone}
                        </div>
                      )}
                      <div>Status: <Badge variant="outline" className="ml-1">{preview.targetCandidate.status}</Badge></div>
                      <div>Source: {preview.targetCandidate.source || 'Unknown'}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Data to be Transferred</CardTitle>
                  <CardDescription>
                    The following records will be moved from the source to the target candidate
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded" data-testid="stat-applications">
                      <FileText className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                      <p className="text-2xl font-bold">{preview.applicationsToMove}</p>
                      <p className="text-xs text-muted-foreground">Applications</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded" data-testid="stat-documents">
                      <FileText className="h-5 w-5 mx-auto mb-1 text-green-600" />
                      <p className="text-2xl font-bold">{preview.documentsToMove}</p>
                      <p className="text-xs text-muted-foreground">Documents</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded" data-testid="stat-tags">
                      <Tag className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                      <p className="text-2xl font-bold">{preview.tagsToMove}</p>
                      <p className="text-xs text-muted-foreground">Tags</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {preview.warnings.length > 0 && (
                <Alert variant="destructive" data-testid="alert-warnings">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {preview.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Match Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{matchType.replace(/_/g, ' ')}</Badge>
                    <Badge variant="secondary">{matchConfidence}% confidence</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Match reasons:</p>
                    <ul className="list-disc list-inside">
                      {matchReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="merge-notes">Merge Notes (optional)</Label>
                <Textarea
                  id="merge-notes"
                  placeholder="Add any notes about this merge..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  data-testid="input-merge-notes"
                />
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <Separator className="my-4" />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-merge"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mergeMutation.mutate()}
            disabled={mergeMutation.isPending || !preview}
            data-testid="button-confirm-merge"
          >
            {mergeMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Merging...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Confirm Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DuplicateCheckButtonProps {
  candidateId: string;
  candidateName?: string;
}

export function DuplicateCheckButton({ candidateId, candidateName }: DuplicateCheckButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateMatch | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const { data: duplicatesData, isLoading, refetch } = useQuery<{ duplicates: DuplicateMatch[] }>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'duplicates'],
    enabled: dialogOpen,
  });

  const duplicates = duplicatesData?.duplicates || [];

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Check for duplicates"
            data-testid={`button-check-duplicates-${candidateId}`}
          >
            <Users className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl" data-testid="dialog-duplicates">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Duplicate Check {candidateName && `- ${candidateName}`}
            </DialogTitle>
            <DialogDescription>
              Review potential duplicate candidate records detected by our matching system.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : duplicates.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground" data-testid="no-duplicates">
              <Check className="h-12 w-12 mx-auto mb-2 text-green-600" />
              <p className="font-medium">No Duplicates Found</p>
              <p className="text-sm">This candidate has no detected duplicate records.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {duplicates.map((dup) => (
                  <Card key={dup.candidate.id} data-testid={`duplicate-card-${dup.candidate.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {dup.candidate.firstName} {dup.candidate.lastName}
                            </span>
                            <Badge 
                              variant={dup.matchConfidence >= 90 ? "destructive" : "secondary"}
                              data-testid={`badge-match-confidence-${dup.candidate.id}`}
                            >
                              {dup.matchConfidence}% match
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3" />
                              {dup.candidate.email}
                            </div>
                            {dup.candidate.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3" />
                                {dup.candidate.phone}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <History className="h-3 w-3" />
                              Status: {dup.candidate.status}
                            </div>
                          </div>
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Match Reasons:</p>
                            <div className="flex flex-wrap gap-1">
                              {dup.matchReasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedDuplicate(dup);
                            setMergeDialogOpen(true);
                          }}
                          data-testid={`button-merge-duplicate-${dup.candidate.id}`}
                        >
                          <GitMerge className="h-4 w-4 mr-1" />
                          Merge
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {selectedDuplicate && (
        <MergePreviewDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          sourceId={selectedDuplicate.candidate.id}
          targetId={candidateId}
          matchType={selectedDuplicate.matchType}
          matchConfidence={selectedDuplicate.matchConfidence}
          matchReasons={selectedDuplicate.matchReasons}
          onMergeComplete={() => {
            setMergeDialogOpen(false);
            setSelectedDuplicate(null);
            setDialogOpen(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
