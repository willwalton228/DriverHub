import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, FileSpreadsheet, Clock, DollarSign, Users, History, AlertTriangle } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { parseDateSafe } from "@/lib/dateFormat";

interface PayrollExportRecord {
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftDate: string;
  locationName: string | null;
  scheduledHours: number;
  actualHours: number;
  hourlyRate: number;
  estimatedPay: number;
  actualPay: number;
  isOvertime: boolean;
  status: string;
}

interface PayrollExportResult {
  exportId: string;
  records: PayrollExportRecord[];
  summary: {
    totalRecords: number;
    totalScheduledHours: number;
    totalActualHours: number;
    totalLaborCost: number;
    overtimeRecords: number;
  };
}

interface ExportHistory {
  id: string;
  exportType: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  totalRecords: number;
  totalScheduledHours: string;
  totalActualHours: string;
  totalLaborCost: string;
  exportedAt: string;
  fileName: string | null;
  status: string;
}

export function PayrollExportTab() {
  const { toast } = useToast();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [previewData, setPreviewData] = useState<PayrollExportResult | null>(null);

  const exportHistoryQuery = useQuery<ExportHistory[]>({
    queryKey: ['/api/scheduling/payroll-exports'],
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduling/payroll-export', {
        startDate,
        endDate,
      });
      return res.json();
    },
    onSuccess: (data: PayrollExportResult) => {
      setPreviewData(data);
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/payroll-exports'] });
      toast({
        title: "Export Generated",
        description: `${data.summary.totalRecords} records ready for download`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to generate export",
        variant: "destructive",
      });
    },
  });

  const downloadCSV = async () => {
    try {
      const res = await apiRequest('POST', '/api/scheduling/payroll-export/csv', {
        startDate,
        endDate,
      });
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_export_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/payroll-exports'] });
      
      toast({
        title: "CSV Downloaded",
        description: "Payroll export CSV has been downloaded",
      });
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download CSV",
        variant: "destructive",
      });
    }
  };

  const setDateRange = (range: 'thisMonth' | 'lastMonth' | 'last2Weeks') => {
    if (range === 'thisMonth') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
    } else if (range === 'lastMonth') {
      const lastMonth = subMonths(today, 1);
      setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    } else {
      const twoWeeksAgo = new Date(today);
      twoWeeksAgo.setDate(today.getDate() - 14);
      setStartDate(format(twoWeeksAgo, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    }
    setPreviewData(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-payroll-export-title">Payroll & HRIS Export</h2>
          <p className="text-muted-foreground">Generate payroll-ready exports of worked time and schedule data</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Generate Export
          </CardTitle>
          <CardDescription>
            Select a date range to export employee schedules, hours worked, and overtime data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPreviewData(null); }}
                className="w-40"
                data-testid="input-export-start-date"
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPreviewData(null); }}
                className="w-40"
                data-testid="input-export-end-date"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDateRange('last2Weeks')} data-testid="button-last-2-weeks">
                Last 2 Weeks
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange('thisMonth')} data-testid="button-this-month">
                This Month
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange('lastMonth')} data-testid="button-last-month">
                Last Month
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              data-testid="button-preview-export"
            >
              {previewMutation.isPending ? 'Generating...' : 'Preview Export'}
            </Button>
            <Button
              variant="outline"
              onClick={downloadCSV}
              disabled={previewMutation.isPending}
              data-testid="button-download-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewData && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-records">
                  {previewData.summary.totalRecords}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Scheduled Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-export-scheduled-hours">
                  {previewData.summary.totalScheduledHours.toFixed(1)} hrs
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Actual Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-export-actual-hours">
                  {previewData.summary.totalActualHours.toFixed(1)} hrs
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Total Labor Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-export-labor-cost">
                  ${previewData.summary.totalLaborCost.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Export Preview</span>
                {previewData.summary.overtimeRecords > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {previewData.summary.overtimeRecords} overtime shifts
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewData.records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No records found for the selected date range
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Employee ID</th>
                        <th className="text-left py-2 px-3">Employee Name</th>
                        <th className="text-left py-2 px-3">Shift Date</th>
                        <th className="text-left py-2 px-3">Location</th>
                        <th className="text-right py-2 px-3">Scheduled Hrs</th>
                        <th className="text-right py-2 px-3">Actual Hrs</th>
                        <th className="text-right py-2 px-3">Hourly Rate</th>
                        <th className="text-right py-2 px-3">Est. Pay</th>
                        <th className="text-right py-2 px-3">Actual Pay</th>
                        <th className="text-center py-2 px-3">Overtime</th>
                        <th className="text-left py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.records.slice(0, 50).map((record, idx) => (
                        <tr key={idx} className="border-b hover-elevate" data-testid={`row-export-${idx}`}>
                          <td className="py-2 px-3 font-mono text-xs">{record.employeeId}</td>
                          <td className="py-2 px-3">{record.employeeName || 'N/A'}</td>
                          <td className="py-2 px-3">{format(parseDateSafe(record.shiftDate), 'MMM d, yyyy')}</td>
                          <td className="py-2 px-3">{record.locationName || 'N/A'}</td>
                          <td className="text-right py-2 px-3">{record.scheduledHours.toFixed(1)}</td>
                          <td className="text-right py-2 px-3">{record.actualHours.toFixed(1)}</td>
                          <td className="text-right py-2 px-3">${record.hourlyRate.toFixed(2)}</td>
                          <td className="text-right py-2 px-3">${record.estimatedPay.toFixed(2)}</td>
                          <td className="text-right py-2 px-3">${record.actualPay.toFixed(2)}</td>
                          <td className="text-center py-2 px-3">
                            {record.isOvertime ? (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-700">Yes</Badge>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline">{record.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.records.length > 50 && (
                    <p className="text-center py-2 text-muted-foreground text-sm">
                      Showing 50 of {previewData.records.length} records. Download CSV for full export.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Export History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exportHistoryQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (exportHistoryQuery.data?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No previous exports
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Date Range</th>
                    <th className="text-left py-2 px-3">Exported At</th>
                    <th className="text-right py-2 px-3">Records</th>
                    <th className="text-right py-2 px-3">Scheduled Hrs</th>
                    <th className="text-right py-2 px-3">Actual Hrs</th>
                    <th className="text-right py-2 px-3">Labor Cost</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exportHistoryQuery.data?.map((exp) => (
                    <tr key={exp.id} className="border-b hover-elevate" data-testid={`row-history-${exp.id}`}>
                      <td className="py-2 px-3">
                        {format(parseDateSafe(exp.dateRangeStart), 'MMM d')} - {format(parseDateSafe(exp.dateRangeEnd), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 px-3">
                        {format(new Date(exp.exportedAt), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="text-right py-2 px-3">{exp.totalRecords}</td>
                      <td className="text-right py-2 px-3">{parseFloat(exp.totalScheduledHours || '0').toFixed(1)}</td>
                      <td className="text-right py-2 px-3">{parseFloat(exp.totalActualHours || '0').toFixed(1)}</td>
                      <td className="text-right py-2 px-3">${parseFloat(exp.totalLaborCost || '0').toFixed(2)}</td>
                      <td className="py-2 px-3">
                        <Badge variant={exp.status === 'completed' ? 'default' : 'secondary'}>
                          {exp.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
