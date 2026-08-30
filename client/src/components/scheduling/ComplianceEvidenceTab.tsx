import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Shield, Download, FileText, Clock, Hash, Loader2, AlertTriangle, CheckCircle, Eye } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const reportTypeLabels: Record<string, string> = {
  ot_alerts: "OT Alerts & Responses",
  break_compliance: "Break Compliance",
  missed_shift_handling: "Missed Shift Handling",
  override_justifications: "Override Justifications",
};

const reportTypeDescriptions: Record<string, string> = {
  ot_alerts: "Overtime threshold alerts with timesheet review status and approver actions",
  break_compliance: "Break duration compliance against labor rules with geofence verification",
  missed_shift_handling: "No-show and declined shift incidents with backup driver activation records",
  override_justifications: "Manual overrides and schedule changes with actor identity and justification",
};

interface EvidencePack {
  packId: string;
  reportType: string;
  recordCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  generatedAt: string;
  generatedBy: string;
}

interface EvidenceRecord {
  id: string;
  snapshotData: Record<string, any>;
  contentHash: string;
  createdAt: string;
}

export default function ComplianceEvidenceTab() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState<string>("ot_alerts");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [viewPackId, setViewPackId] = useState<string | null>(null);

  const packsQuery = useQuery<{ packs: EvidencePack[] }>({
    queryKey: ["/api/corporate/scheduling/compliance-evidence/packs"],
  });

  const recordsQuery = useQuery<{ packId: string; reportType: string; records: EvidenceRecord[]; total: number }>({
    queryKey: ["/api/corporate/scheduling/compliance-evidence", viewPackId, "records"],
    enabled: !!viewPackId,
  });

  const generateMutation = useMutation({
    mutationFn: async (params: { reportType: string; startDate: string; endDate: string }) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/compliance-evidence/generate", params);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Evidence pack generated",
        description: `${data.recordCount} records captured for ${reportTypeLabels[data.reportType] || data.reportType}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/compliance-evidence/packs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Could not generate compliance evidence",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!startDate || !endDate) {
      toast({ title: "Missing dates", description: "Select both start and end dates", variant: "destructive" });
      return;
    }
    generateMutation.mutate({ reportType, startDate, endDate });
  };

  const handleDownload = (packId: string) => {
    window.open(`/api/corporate/scheduling/compliance-evidence/${packId}/download`, "_blank");
  };

  const packs = packsQuery.data?.packs || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 flex-wrap" data-testid="text-compliance-evidence-title">
              <Shield className="h-5 w-5" />
              Compliance Evidence Pack
            </CardTitle>
            <CardDescription>
              Generate defensible evidence reports for insurers, auditors, and regulators
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Report Type</label>
              <Select value={reportType} onValueChange={setReportType} data-testid="select-report-type">
                <SelectTrigger className="w-[220px]" data-testid="select-trigger-report-type">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ot_alerts" data-testid="select-item-ot-alerts">OT Alerts & Responses</SelectItem>
                  <SelectItem value="break_compliance" data-testid="select-item-break-compliance">Break Compliance</SelectItem>
                  <SelectItem value="missed_shift_handling" data-testid="select-item-missed-shift">Missed Shift Handling</SelectItem>
                  <SelectItem value="override_justifications" data-testid="select-item-overrides">Override Justifications</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              data-testid="button-generate-evidence"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-1" />
              )}
              Generate Evidence
            </Button>
          </div>

          <div className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{reportTypeLabels[reportType]}:</span>{" "}
                {reportTypeDescriptions[reportType]}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generated Evidence Packs</CardTitle>
          <CardDescription>
            Immutable, time-stamped evidence with SHA-256 content hashes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {packsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-packs">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No evidence packs generated yet</p>
              <p className="text-xs mt-1">Use the form above to generate your first compliance evidence report</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pack ID</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((pack) => (
                  <TableRow key={pack.packId} data-testid={`row-pack-${pack.packId}`}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs">{pack.packId.substring(0, 16)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {reportTypeLabels[pack.reportType] || pack.reportType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium" data-testid={`text-record-count-${pack.packId}`}>
                        {pack.recordCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {pack.dateRangeStart} to {pack.dateRangeEnd}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {pack.generatedAt ? format(new Date(pack.generatedAt), "MMM d, yyyy h:mm a") : "N/A"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{pack.generatedBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewPackId(pack.packId)}
                          data-testid={`button-view-${pack.packId}`}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(pack.packId)}
                          data-testid={`button-download-${pack.packId}`}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          CSV
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewPackId} onOpenChange={(open) => !open && setViewPackId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Evidence Records
            </DialogTitle>
            <DialogDescription>
              Immutable evidence records with SHA-256 integrity hashes
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {recordsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : recordsQuery.data && recordsQuery.data.records.length > 0 ? (
              <div className="space-y-3 p-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">{recordsQuery.data.total} records</Badge>
                  <Badge variant="outline">{reportTypeLabels[recordsQuery.data.reportType] || recordsQuery.data.reportType}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(recordsQuery.data.records[0]?.snapshotData || {}).map((key) => (
                        <TableHead key={key} className="text-xs whitespace-nowrap">{key}</TableHead>
                      ))}
                      <TableHead className="text-xs">Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordsQuery.data.records.map((record) => (
                      <TableRow key={record.id}>
                        {Object.values(record.snapshotData).map((val, i) => (
                          <TableCell key={i} className="text-xs max-w-[200px] truncate">
                            {String(val ?? "")}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {record.contentHash.substring(0, 12)}...
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No records found</div>
            )}
          </div>
          <DialogFooter>
            {viewPackId && (
              <Button
                variant="outline"
                onClick={() => handleDownload(viewPackId)}
                data-testid="button-download-from-dialog"
              >
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewPackId(null)} data-testid="button-close-dialog">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
