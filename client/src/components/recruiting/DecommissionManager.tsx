import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Archive,
  RotateCcw,
  AlertTriangle,
  Loader2,
  GitBranch,
  FileText,
  ClipboardList,
  Layers,
} from "lucide-react";

interface WorkflowStage {
  id: string;
  stageKey: string;
  displayName: string;
  sortOrder: number;
  isRetired: boolean;
  retiredAt: string | null;
  retiredReason: string | null;
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  market: string | null;
  workerType: string | null;
  isDefault: boolean;
  isRetired: boolean;
  retiredAt: string | null;
  retiredReason: string | null;
  stages: WorkflowStage[];
}

interface DocTemplate {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isDefault: boolean;
  version: number;
}

interface ScreeningTemplate {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  isBuiltIn: boolean;
}

interface DecommissionSummary {
  workflows: Workflow[];
  documentTemplates: DocTemplate[];
  screeningTemplates: ScreeningTemplate[];
}

function RetireDialog({
  entityLabel,
  entityName,
  onConfirm,
  isPending,
}: {
  entityLabel: string;
  entityName: string;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setOpen(false);
      setReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-retire-${entityName}`}>
          <Archive className="h-4 w-4" />
          Retire
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire {entityLabel}</DialogTitle>
          <DialogDescription>
            This will mark "{entityName}" as retired. It will become inaccessible for new use but all existing data will be preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>Reason for retirement</Label>
          <Input
            placeholder="Enter reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid={`input-retire-reason-${entityName}`}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason.trim() || isPending}
            data-testid={`button-confirm-retire-${entityName}`}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Retire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ retired, isActive }: { retired?: boolean; isActive?: boolean }) {
  if (retired || isActive === false) {
    return (
      <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate no-default-active-elevate">
        <Archive className="h-3 w-3 mr-1" />
        Retired
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-700 dark:text-green-400 no-default-hover-elevate no-default-active-elevate">
      Active
    </Badge>
  );
}

export default function DecommissionManager() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<DecommissionSummary>({
    queryKey: ["/api/recruiting/decommission/summary"],
  });

  const retireMutation = useMutation({
    mutationFn: async ({ type, id, reason }: { type: string; id: string; reason: string }) => {
      await apiRequest("POST", `/api/recruiting/decommission/${type}/${id}/retire`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/decommission/summary"] });
      toast({ title: "Successfully retired" });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot retire", description: error.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      await apiRequest("POST", `/api/recruiting/decommission/${type}/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/decommission/summary"] });
      toast({ title: "Successfully restored" });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot restore", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="decommission-no-data">
        Unable to load data. Ensure you have admin access.
      </div>
    );
  }

  const { workflows, documentTemplates, screeningTemplates } = data;

  const retiredWorkflowCount = workflows.filter(w => w.isRetired).length;
  const retiredStageCount = workflows.reduce((acc, w) => acc + w.stages.filter(s => s.isRetired).length, 0);
  const retiredDocTemplateCount = documentTemplates.filter(t => !t.isActive).length;
  const retiredScreeningCount = screeningTemplates.filter(t => !t.isActive).length;
  const totalRetired = retiredWorkflowCount + retiredStageCount + retiredDocTemplateCount + retiredScreeningCount;

  return (
    <div className="space-y-6" data-testid="panel-decommission-manager">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Archive className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Feature Decommissioning</h2>
          {totalRetired > 0 && (
            <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
              {totalRetired} retired
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Safely retire workflows, stages, and templates without deleting data
        </p>
      </div>

      <Accordion type="multiple" defaultValue={["workflows"]} className="space-y-3">
        <AccordionItem value="workflows" className="border rounded-md px-4">
          <AccordionTrigger className="hover:no-underline" data-testid="accordion-workflows">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Workflows</span>
              <Badge variant="outline" className="ml-2 no-default-hover-elevate no-default-active-elevate">
                {workflows.length} total
              </Badge>
              {retiredWorkflowCount > 0 && (
                <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate no-default-active-elevate">
                  {retiredWorkflowCount} retired
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-2">
              {workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No workflows found</p>
              ) : (
                workflows.map((wf) => (
                  <Card key={wf.id} data-testid={`decommission-workflow-${wf.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{wf.name}</span>
                              <StatusBadge retired={wf.isRetired} />
                              {wf.isDefault && (
                                <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">Default</Badge>
                              )}
                              <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{wf.status}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {wf.market && <span>Market: {wf.market}</span>}
                              {wf.workerType && <span>Type: {wf.workerType}</span>}
                              <span>{wf.stages.length} stages</span>
                              {wf.retiredReason && <span>Reason: {wf.retiredReason}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {wf.isRetired ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreMutation.mutate({ type: "workflow", id: wf.id })}
                              disabled={restoreMutation.isPending}
                              data-testid={`button-restore-workflow-${wf.id}`}
                            >
                              {restoreMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              Restore
                            </Button>
                          ) : (
                            <RetireDialog
                              entityLabel="Workflow"
                              entityName={wf.name}
                              onConfirm={(reason) =>
                                retireMutation.mutate({ type: "workflow", id: wf.id, reason })
                              }
                              isPending={retireMutation.isPending}
                            />
                          )}
                        </div>
                      </div>

                      {wf.stages.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            Stages
                          </div>
                          {wf.stages.map((stage) => (
                            <div
                              key={stage.id}
                              className="flex items-center justify-between gap-4 py-1.5 flex-wrap"
                              data-testid={`decommission-stage-${stage.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm truncate">{stage.displayName}</span>
                                <span className="text-xs text-muted-foreground">({stage.stageKey})</span>
                                <StatusBadge retired={stage.isRetired} />
                                {stage.retiredReason && (
                                  <span className="text-xs text-muted-foreground">- {stage.retiredReason}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {stage.isRetired ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => restoreMutation.mutate({ type: "stage", id: stage.id })}
                                    disabled={restoreMutation.isPending}
                                    data-testid={`button-restore-stage-${stage.id}`}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Restore
                                  </Button>
                                ) : (
                                  <RetireDialog
                                    entityLabel="Stage"
                                    entityName={stage.displayName}
                                    onConfirm={(reason) =>
                                      retireMutation.mutate({ type: "stage", id: stage.id, reason })
                                    }
                                    isPending={retireMutation.isPending}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="doc-templates" className="border rounded-md px-4">
          <AccordionTrigger className="hover:no-underline" data-testid="accordion-doc-templates">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Document Templates</span>
              <Badge variant="outline" className="ml-2 no-default-hover-elevate no-default-active-elevate">
                {documentTemplates.length} total
              </Badge>
              {retiredDocTemplateCount > 0 && (
                <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate no-default-active-elevate">
                  {retiredDocTemplateCount} retired
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-2">
              {documentTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No document templates found</p>
              ) : (
                documentTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center justify-between gap-4 p-3 border rounded-md flex-wrap"
                    data-testid={`decommission-doc-template-${tmpl.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{tmpl.name}</span>
                      <StatusBadge isActive={tmpl.isActive} />
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{tmpl.type}</Badge>
                      {tmpl.isDefault && (
                        <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">Default</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!tmpl.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMutation.mutate({ type: "doc-template", id: tmpl.id })}
                          disabled={restoreMutation.isPending}
                          data-testid={`button-restore-doc-template-${tmpl.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                      ) : (
                        <RetireDialog
                          entityLabel="Document Template"
                          entityName={tmpl.name}
                          onConfirm={(reason) =>
                            retireMutation.mutate({ type: "doc-template", id: tmpl.id, reason })
                          }
                          isPending={retireMutation.isPending}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="screening-templates" className="border rounded-md px-4">
          <AccordionTrigger className="hover:no-underline" data-testid="accordion-screening-templates">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Screening Form Templates</span>
              <Badge variant="outline" className="ml-2 no-default-hover-elevate no-default-active-elevate">
                {screeningTemplates.length} total
              </Badge>
              {retiredScreeningCount > 0 && (
                <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate no-default-active-elevate">
                  {retiredScreeningCount} retired
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-2">
              {screeningTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No screening form templates found</p>
              ) : (
                screeningTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center justify-between gap-4 p-3 border rounded-md flex-wrap"
                    data-testid={`decommission-screening-template-${tmpl.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{tmpl.name}</span>
                      <StatusBadge isActive={tmpl.isActive} />
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{tmpl.category}</Badge>
                      {tmpl.isBuiltIn && (
                        <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">Built-in</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!tmpl.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMutation.mutate({ type: "screening-template", id: tmpl.id })}
                          disabled={restoreMutation.isPending}
                          data-testid={`button-restore-screening-template-${tmpl.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                      ) : (
                        <RetireDialog
                          entityLabel="Screening Form Template"
                          entityName={tmpl.name}
                          onConfirm={(reason) =>
                            retireMutation.mutate({ type: "screening-template", id: tmpl.id, reason })
                          }
                          isPending={retireMutation.isPending}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">About Decommissioning</p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Retired features are preserved but hidden from active use</li>
                <li>Features with active applications or in-use references cannot be retired</li>
                <li>All retire/restore actions are logged in the audit trail</li>
                <li>Restored features return to their previous active state</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
