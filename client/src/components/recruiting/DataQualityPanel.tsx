import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Shield, ShieldCheck, Mail, Phone, CheckCircle, XCircle,
  AlertTriangle, Settings, RefreshCw, Loader2
} from "lucide-react";

interface ValidationRule {
  id: string;
  ruleName: string;
  ruleCode: string;
  stage: string;
  ruleType: string;
  isActive: boolean;
  isBlocking: boolean;
  errorMessage: string | null;
  requiredFields: string[] | null;
  requireEmailVerified: boolean;
  requirePhoneVerified: boolean;
}

interface VerificationChannel {
  value: string;
  verified: boolean;
  verifiedAt: string | null;
}

interface VerificationHistoryEntry {
  id: string;
  channel: string;
  status: string;
  contactValue: string;
  sentAt: string;
  verifiedAt: string | null;
  failureReason: string | null;
}

interface VerificationStatus {
  candidateId: string;
  email: VerificationChannel;
  phone: VerificationChannel;
  history: VerificationHistoryEntry[];
}

interface DataQualityResult {
  passed: boolean;
  score: number;
  blockingFailures: Array<{ ruleCode: string; ruleName: string; message: string }>;
  warnings: Array<{ ruleCode: string; ruleName: string; message: string }>;
}

const ruleTypeLabelMap: Record<string, string> = {
  required_field: "Required Field",
  format_validation: "Format Validation",
  verification_gate: "Verification Gate",
  consistency_check: "Consistency Check",
};

function getRuleTypeVariant(ruleType: string) {
  return "outline" as const;
}

function groupByStage(rules: ValidationRule[]): Record<string, ValidationRule[]> {
  return rules.reduce((acc, rule) => {
    const stage = rule.stage || "general";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(rule);
    return acc;
  }, {} as Record<string, ValidationRule[]>);
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-green-500" :
    score >= 50 ? "bg-yellow-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-3" data-testid="indicator-quality-score">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className="text-sm font-mono font-medium tabular-nums">{score}%</span>
    </div>
  );
}

export function ValidationRulesPanel() {
  const { toast } = useToast();

  const { data: rules, isLoading } = useQuery<ValidationRule[]>({
    queryKey: ["/api/recruiting/validation-rules"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/recruiting/validation-rules/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/validation-rules"] });
      toast({ title: "Rule updated", description: "Validation rule has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="panel-validation-rules">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByStage(rules || []);
  const stages = Object.keys(grouped).sort();

  return (
    <Card data-testid="panel-validation-rules" className="hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            Validation Rules
          </CardTitle>
          <CardDescription>
            Manage data quality validation rules for each pipeline stage
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/recruiting/validation-rules"] })}
          data-testid="button-refresh-rules"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-rules">
            No validation rules configured.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table data-testid="table-validation-rules">
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Blocking</TableHead>
                  <TableHead>Error Message</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((stage) =>
                  grouped[stage].map((rule) => (
                    <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                      <TableCell className="font-medium" data-testid={`text-rule-name-${rule.id}`}>
                        {rule.ruleName}
                      </TableCell>
                      <TableCell data-testid={`text-rule-stage-${rule.id}`}>
                        <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                          {stage}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`badge-rule-type-${rule.id}`}>
                        <Badge variant={getRuleTypeVariant(rule.ruleType)}>
                          {ruleTypeLabelMap[rule.ruleType] || rule.ruleType}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`badge-blocking-${rule.id}`}>
                        {rule.isBlocking ? (
                          <Badge variant="destructive" className="no-default-hover-elevate no-default-active-elevate">
                            <Shield className="h-3 w-3 mr-1" />
                            Blocking
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
                            Non-blocking
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-sm text-muted-foreground"
                        title={rule.errorMessage || undefined}
                        data-testid={`text-error-message-${rule.id}`}
                      >
                        {rule.errorMessage}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: rule.id, isActive: checked })
                          }
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-active-${rule.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CandidateVerificationStatus({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<{ channel: "email" | "phone"; open: boolean }>({
    channel: "email",
    open: false,
  });

  const { data: status, isLoading } = useQuery<VerificationStatus>({
    queryKey: ["/api/recruiting/candidates", candidateId, "verification-status"],
  });

  const sendVerificationMutation = useMutation({
    mutationFn: async (channel: "email" | "phone") => {
      const res = await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/verify`, { channel });
      return res.json();
    },
    onSuccess: (_data, channel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "verification-status"] });
      toast({ title: "Verification sent", description: `Verification ${channel === "email" ? "email" : "SMS"} has been sent.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send verification", description: error.message, variant: "destructive" });
    },
  });

  const manualVerifyMutation = useMutation({
    mutationFn: async (channel: "email" | "phone") => {
      const res = await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/verify/manual`, { channel });
      return res.json();
    },
    onSuccess: (_data, channel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "verification-status"] });
      setConfirmDialog({ channel, open: false });
      toast({ title: "Marked as verified", description: `${channel === "email" ? "Email" : "Phone"} has been manually verified.` });
    },
    onError: (error: Error) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (channel: "email" | "phone") => {
      const res = await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/verify/reset`, { channel });
      return res.json();
    },
    onSuccess: (_data, channel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "verification-status"] });
      toast({ title: "Verification reset", description: `${channel === "email" ? "Email" : "Phone"} verification has been reset.` });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="panel-verification-status">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const channels: Array<{ key: "email" | "phone"; label: string; icon: typeof Mail; data: VerificationChannel }> = [
    { key: "email", label: "Email", icon: Mail, data: status.email },
    { key: "phone", label: "Phone", icon: Phone, data: status.phone },
  ];

  return (
    <>
      <Card data-testid="panel-verification-status" className="hover-elevate">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Verification Status
          </CardTitle>
          <CardDescription>
            Contact verification for this candidate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {channels.map(({ key, label, icon: Icon, data: channelData }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 p-3 rounded-md border"
              data-testid={`verification-channel-${key}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" data-testid={`text-${key}-value`}>
                    {channelData.value || "Not provided"}
                  </div>
                  {channelData.verifiedAt && (
                    <div className="text-xs text-muted-foreground" data-testid={`text-${key}-verified-at`}>
                      Verified {new Date(channelData.verifiedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {channelData.verified ? (
                  <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-${key}-verified`}>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-${key}-unverified`}>
                    <XCircle className="h-3 w-3 mr-1" />
                    Unverified
                  </Badge>
                )}
                {!channelData.verified && channelData.value && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendVerificationMutation.mutate(key)}
                      disabled={sendVerificationMutation.isPending}
                      data-testid={`button-send-verification-${key}`}
                    >
                      {sendVerificationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Send Verification
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDialog({ channel: key, open: true })}
                      data-testid={`button-mark-verified-${key}`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Verified
                    </Button>
                  </>
                )}
                {channelData.verified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetMutation.mutate(key)}
                    disabled={resetMutation.isPending}
                    data-testid={`button-reset-verification-${key}`}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
          ))}

          {status.history && status.history.length > 0 && (
            <div className="mt-4" data-testid="section-verification-history">
              <div className="text-sm font-medium mb-2">Verification History</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {status.history.map((entry, index) => (
                  <div
                    key={entry.id || index}
                    className="flex items-start gap-2 text-sm p-2 rounded border"
                    data-testid={`history-entry-${entry.id || index}`}
                  >
                    {entry.channel === "email" ? (
                      <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium capitalize">{entry.status}</div>
                      {entry.contactValue && entry.contactValue !== "manual" && entry.contactValue !== "reset" && (
                        <div className="text-xs text-muted-foreground">{entry.contactValue}</div>
                      )}
                      {entry.failureReason && (
                        <div className="text-xs text-destructive">{entry.failureReason}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(entry.sentAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent data-testid="dialog-confirm-manual-verify">
          <DialogHeader>
            <DialogTitle>Confirm Manual Verification</DialogTitle>
            <DialogDescription>
              Are you sure you want to manually mark this {confirmDialog.channel} as verified?
              This should only be done when verification has been confirmed through an alternative method.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
              data-testid="button-cancel-manual-verify"
            >
              Cancel
            </Button>
            <Button
              onClick={() => manualVerifyMutation.mutate(confirmDialog.channel)}
              disabled={manualVerifyMutation.isPending}
              data-testid="button-confirm-manual-verify"
            >
              {manualVerifyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DataQualityPrecheck({
  applicationId,
  targetStage,
}: {
  applicationId: string;
  targetStage: string;
}) {
  const { toast } = useToast();

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/data-quality`, {
        targetStage,
      });
      return res.json() as Promise<DataQualityResult>;
    },
    onError: (error: Error) => {
      toast({ title: "Quality check failed", description: error.message, variant: "destructive" });
    },
  });

  const result = checkMutation.data;

  return (
    <div className="space-y-3" data-testid={`precheck-${applicationId}`}>
      {!result && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
          data-testid="button-run-precheck"
        >
          {checkMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          Run Data Quality Check
        </Button>
      )}

      {result && (
        <Card data-testid="card-precheck-result">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {result.passed ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <span className="text-sm font-medium" data-testid="text-precheck-status">
                  {result.passed ? "Quality check passed" : "Quality check failed"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => checkMutation.mutate()}
                disabled={checkMutation.isPending}
                data-testid="button-rerun-precheck"
              >
                <RefreshCw className={`h-4 w-4 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <ScoreBar score={result.score} />

            {result.blockingFailures.length > 0 && (
              <div className="space-y-1" data-testid="list-blocking-failures">
                <div className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Blocking Issues ({result.blockingFailures.length})
                </div>
                {result.blockingFailures.map((failure, i) => (
                  <div
                    key={i}
                    className="text-xs p-2 rounded border border-destructive/30 bg-destructive/5"
                    data-testid={`blocking-failure-${i}`}
                  >
                    <span className="font-medium">{failure.ruleName}:</span> {failure.message}
                  </div>
                ))}
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="space-y-1" data-testid="list-warnings">
                <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Warnings ({result.warnings.length})
                </div>
                {result.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="text-xs p-2 rounded border border-yellow-500/30 bg-yellow-500/5"
                    data-testid={`warning-${i}`}
                  >
                    <span className="font-medium">{warning.ruleName}:</span> {warning.message}
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
