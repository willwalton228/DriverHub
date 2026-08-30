import { useState } from "react";
import { parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Palmtree, Clock, Calendar, Plus, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, ArrowUpDown, Settings, TrendingUp, History
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveType: string;
  accrualMethod: string;
  accrualRateHours: string;
  accruedHours: string;
  usedHours: string;
  pendingHours: string;
  remainingHours: string;
  resetDate: string | null;
  stateOverrideFlag: boolean;
  adminOverrideEnabled: boolean;
  year: number;
}

interface TimeOffRequest {
  id: string;
  userId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  totalHours: string;
  reason: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  isFullDay: boolean;
  createdAt: string;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isPaid: boolean;
  requiresApproval: boolean;
  maxDaysPerYear: number | null;
  isActive: boolean;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick Leave",
  vacation: "Vacation",
  personal: "Personal",
  paid_holiday: "Paid Holiday",
  unpaid: "Unpaid",
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  vacation: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  personal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  paid_holiday: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  unpaid: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    pending: { className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", label: "Pending" },
    approved: { className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", label: "Approved" },
    declined: { className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", label: "Declined" },
    cancelled: { className: "bg-muted text-muted-foreground", label: "Cancelled" },
  };
  const c = config[status] || { className: "bg-muted text-muted-foreground", label: status };
  return <Badge className={c.className} data-testid={`badge-status-${status}`}>{c.label}</Badge>;
}

export default function SchedulingTimeOff() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string | null>(null);
  const [adjustHours, setAdjustHours] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [requestType, setRequestType] = useState("vacation");
  const [requestStartDate, setRequestStartDate] = useState("");
  const [requestEndDate, setRequestEndDate] = useState("");
  const [requestHours, setRequestHours] = useState("8");
  const [requestReason, setRequestReason] = useState("");
  const [initLeaveType, setInitLeaveType] = useState("vacation");
  const [initAccrualMethod, setInitAccrualMethod] = useState("per_pay_period");
  const [initAccrualRate, setInitAccrualRate] = useState("3.33");
  const [initHours, setInitHours] = useState("0");
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["/api/scheduling/leave-types"],
  });

  const { data: balances = [], isLoading: balancesLoading } = useQuery<LeaveBalance[]>({
    queryKey: ["/api/scheduling/leave-balances"],
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery<TimeOffRequest[]>({
    queryKey: ["/api/scheduling/my-time-off"],
  });

  const { data: corporateRequests = [] } = useQuery<TimeOffRequest[]>({
    queryKey: ["/api/corporate/scheduling/time-off"],
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/scheduling/time-off/with-balance", data),
    onSuccess: () => {
      toast({ title: "Time Off Requested", description: "Your request has been submitted for approval." });
      setShowRequestDialog(false);
      resetRequestForm();
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/my-time-off"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/time-off"] });
    },
    onError: (error: any) => {
      toast({ title: "Request Failed", description: error.message || "Could not submit time-off request", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes?: string }) =>
      apiRequest("POST", `/api/corporate/scheduling/time-off/${id}/approve`, { reviewNotes }),
    onSuccess: () => {
      toast({ title: "Approved", description: "Time-off request approved. Leave balance updated." });
      invalidateAll();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes?: string }) =>
      apiRequest("POST", `/api/corporate/scheduling/time-off/${id}/deny`, { reviewNotes }),
    onSuccess: () => {
      toast({ title: "Denied", description: "Time-off request denied. Pending balance restored." });
      invalidateAll();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { id: string; hours: string; reason: string }) =>
      apiRequest("POST", `/api/corporate/scheduling/leave-balances/${data.id}/adjust`, {
        hours: data.hours,
        reason: data.reason,
      }),
    onSuccess: () => {
      toast({ title: "Balance Adjusted", description: "Leave balance has been updated." });
      setShowAdjustDialog(false);
      setAdjustHours("");
      setAdjustReason("");
      invalidateAll();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const initBalanceMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/corporate/scheduling/leave-balances", data),
    onSuccess: () => {
      toast({ title: "Balance Initialized", description: "Leave balance created." });
      setShowInitDialog(false);
      invalidateAll();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/scheduling/leave-balances"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scheduling/my-time-off"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/time-off"] });
  }

  function resetRequestForm() {
    setRequestType("vacation");
    setRequestStartDate("");
    setRequestEndDate("");
    setRequestHours("8");
    setRequestReason("");
  }

  const pendingRequests = [...requests, ...corporateRequests]
    .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
    .filter(r => r.status === "pending");

  const totalAccrued = balances.reduce((sum, b) => sum + parseFloat(b.accruedHours || "0"), 0);
  const totalUsed = balances.reduce((sum, b) => sum + parseFloat(b.usedHours || "0"), 0);
  const totalRemaining = balances.reduce((sum, b) => sum + parseFloat(b.remainingHours || "0"), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Palmtree className="h-6 w-6 text-primary" />
            Time Off
          </h1>
          <p className="text-muted-foreground">
            Manage leave balances, accruals, and time-off requests
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowInitDialog(true)} data-testid="button-init-balance">
            <Settings className="h-4 w-4 mr-2" />
            Initialize Balance
          </Button>
          <Button onClick={() => setShowRequestDialog(true)} data-testid="button-new-request">
            <Plus className="h-4 w-4 mr-2" />
            Request Time Off
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Accrued</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-total-accrued">{totalAccrued.toFixed(1)}h</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Used</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-total-used">{totalUsed.toFixed(1)}h</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-total-remaining">{totalRemaining.toFixed(1)}h</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Requests</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-pending-count">{pendingRequests.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Leave Balance Cards */}
      <Card data-testid="leave-balances-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Leave Balances</CardTitle>
            <Badge variant="secondary" className="text-xs">{new Date().getFullYear()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {balancesLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading balances...
            </div>
          ) : balances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-balances">
              No leave balances set up yet. Use "Initialize Balance" to create your leave allocations.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {balances.map((balance) => {
                const accrued = parseFloat(balance.accruedHours || "0");
                const used = parseFloat(balance.usedHours || "0");
                const pending = parseFloat(balance.pendingHours || "0");
                const remaining = parseFloat(balance.remainingHours || "0");
                const usagePercent = accrued > 0 ? ((used + pending) / accrued) * 100 : 0;

                return (
                  <Card key={balance.id} data-testid={`card-balance-${balance.leaveType}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge className={LEAVE_TYPE_COLORS[balance.leaveType] || "bg-muted text-muted-foreground"}>
                          {LEAVE_TYPE_LABELS[balance.leaveType] || balance.leaveType}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setSelectedBalanceId(balance.id); setShowAdjustDialog(true); }}
                          data-testid={`button-adjust-${balance.leaveType}`}
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold" data-testid={`text-remaining-${balance.leaveType}`}>
                          {remaining.toFixed(1)}
                        </span>
                        <span className="text-sm text-muted-foreground">hours remaining</span>
                      </div>
                      <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Accrued</p>
                          <p className="font-medium" data-testid={`text-accrued-${balance.leaveType}`}>{accrued.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Used</p>
                          <p className="font-medium">{used.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Pending</p>
                          <p className="font-medium">{pending.toFixed(1)}h</p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Accrual: {balance.accrualMethod === "per_pay_period" ? `${balance.accrualRateHours}h/period` : balance.accrualMethod === "annual_lump" ? "Annual" : "Manual"}
                        {balance.adminOverrideEnabled && (
                          <Badge variant="outline" className="ml-2 text-xs">Override On</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Requests for Approval (Corporate) */}
      {pendingRequests.length > 0 && (
        <Card data-testid="pending-approvals-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg">Pending Approvals</CardTitle>
              <Badge variant="secondary" className="text-xs">{pendingRequests.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map((req) => (
                  <TableRow key={req.id} data-testid={`row-pending-${req.id}`}>
                    <TableCell>
                      <Badge className={LEAVE_TYPE_COLORS[req.requestType] || "bg-muted text-muted-foreground"}>
                        {LEAVE_TYPE_LABELS[req.requestType] || req.requestType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(parseDateSafe(req.startDate), "MMM d")} - {format(parseDateSafe(req.endDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{parseFloat(req.totalHours || "8").toFixed(1)}h</TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.reason || "-"}</TableCell>
                    <TableCell><StatusBadge status={req.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate({ id: req.id })}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${req.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => denyMutation.mutate({ id: req.id })}
                          disabled={denyMutation.isPending}
                          data-testid={`button-deny-${req.id}`}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* My Requests */}
      <Card data-testid="my-requests-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">My Requests</CardTitle>
            <Badge variant="secondary" className="text-xs">{requests.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-requests">
              No time-off requests yet. Click "Request Time Off" to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id} data-testid={`row-request-${req.id}`}>
                    <TableCell>
                      <Badge className={LEAVE_TYPE_COLORS[req.requestType] || "bg-muted text-muted-foreground"}>
                        {LEAVE_TYPE_LABELS[req.requestType] || req.requestType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(parseDateSafe(req.startDate), "MMM d")} - {format(parseDateSafe(req.endDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{parseFloat(req.totalHours || "8").toFixed(1)}h</TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.reason || "-"}</TableCell>
                    <TableCell><StatusBadge status={req.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(req.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Request Time Off Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>
              Submit a time-off request. Your leave balance will be checked before submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Leave Type</label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger data-testid="select-request-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
              {requestType !== "unpaid" && (() => {
                const bal = balances.find(b => b.leaveType === requestType);
                if (bal) {
                  const remaining = parseFloat(bal.remainingHours || "0");
                  const pending = parseFloat(bal.pendingHours || "0");
                  return (
                    <p className="text-xs text-muted-foreground mt-1" data-testid="text-available-balance">
                      Available: {(remaining - pending).toFixed(1)}h ({remaining.toFixed(1)}h remaining, {pending.toFixed(1)}h pending)
                    </p>
                  );
                }
                return <p className="text-xs text-amber-600 mt-1">No balance record found for this leave type.</p>;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Date</label>
                <Input
                  type="date"
                  value={requestStartDate}
                  onChange={(e) => setRequestStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Date</label>
                <Input
                  type="date"
                  value={requestEndDate}
                  onChange={(e) => setRequestEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Total Hours</label>
              <Input
                type="number"
                value={requestHours}
                onChange={(e) => setRequestHours(e.target.value)}
                data-testid="input-request-hours"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason</label>
              <Textarea
                placeholder="Reason for time off..."
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                data-testid="input-request-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRequestDialog(false); resetRequestForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                createRequestMutation.mutate({
                  requestType,
                  startDate: requestStartDate,
                  endDate: requestEndDate,
                  totalHours: requestHours,
                  reason: requestReason || null,
                });
              }}
              disabled={!requestStartDate || !requestEndDate || createRequestMutation.isPending}
              data-testid="button-submit-request"
            >
              {createRequestMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Leave Balance</DialogTitle>
            <DialogDescription>
              Add or deduct hours from this leave balance. Use positive numbers to add, negative to deduct.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Hours (+/-)</label>
              <Input
                type="number"
                value={adjustHours}
                onChange={(e) => setAdjustHours(e.target.value)}
                placeholder="e.g. 8 to add, -4 to deduct"
                data-testid="input-adjust-hours"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason</label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Reason for adjustment..."
                data-testid="input-adjust-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdjustDialog(false); setAdjustHours(""); setAdjustReason(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedBalanceId) {
                  adjustMutation.mutate({ id: selectedBalanceId, hours: adjustHours, reason: adjustReason });
                }
              }}
              disabled={!adjustHours || !adjustReason.trim() || adjustMutation.isPending}
              data-testid="button-submit-adjust"
            >
              {adjustMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initialize Balance Dialog */}
      <Dialog open={showInitDialog} onOpenChange={setShowInitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initialize Leave Balance</DialogTitle>
            <DialogDescription>
              Set up a leave balance for the current year. This creates the accrual tracking record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Leave Type</label>
              <Select value={initLeaveType} onValueChange={setInitLeaveType}>
                <SelectTrigger data-testid="select-init-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="paid_holiday">Paid Holiday</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Accrual Method</label>
              <Select value={initAccrualMethod} onValueChange={setInitAccrualMethod}>
                <SelectTrigger data-testid="select-init-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_pay_period">Per Pay Period</SelectItem>
                  <SelectItem value="annual_lump">Annual Lump Sum</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {initAccrualMethod === "per_pay_period" && (
              <div>
                <label className="text-sm font-medium mb-1 block">Accrual Rate (hours/period)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={initAccrualRate}
                  onChange={(e) => setInitAccrualRate(e.target.value)}
                  data-testid="input-init-rate"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Initial Hours</label>
              <Input
                type="number"
                value={initHours}
                onChange={(e) => setInitHours(e.target.value)}
                placeholder="Starting balance (0 for new accruals)"
                data-testid="input-init-hours"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                initBalanceMutation.mutate({
                  employeeId: user?.userId,
                  leaveType: initLeaveType,
                  accrualMethod: initAccrualMethod,
                  accrualRateHours: parseFloat(initAccrualRate) || 0,
                  accruedHours: parseFloat(initHours) || 0,
                  year: new Date().getFullYear(),
                });
              }}
              disabled={initBalanceMutation.isPending}
              data-testid="button-submit-init"
            >
              {initBalanceMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
