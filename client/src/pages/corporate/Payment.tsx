import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Lock, Download, FileText, Loader2, AlertCircle, CheckCircle, XCircle, RefreshCw, Database, History, ChevronDown, ChevronUp, Bug, ClipboardCheck, Circle, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDate } from "@/lib/dateFormat";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PayPeriodSummary {
  totalMoves: number;
  includedMoves: number;
  excludedMoves: number;
}

interface PayPeriodReconciliationChecklist {
  movesReconciled: boolean;
  expensesApproved: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface PayPeriod {
  id: string;
  payGroup: string;
  periodType?: 'DRIVERS_WEEKLY' | 'DRIVERS_BIWEEKLY';
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'PROCESSING' | 'LOCKED';
  createdAt: string;
  createdBy?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  exportedAt?: string | null;
  exportType?: string | null;
  exportStatus?: string | null;
  summary?: PayPeriodSummary;
  // Reconciliation Checklist fields
  movesReconciled?: boolean;
  expensesApproved?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

const AUTHORIZED_CREATORS = [
  'will.walton@driverhub360.com',
  'david.forman@driverhub360.com',
  'luis.valdez@driverhub360.com',
];

const AUTHORIZED_LOCKERS = [
  'will.walton@driverhub360.com',
  'david.forman@driverhub360.com',
];

interface PayPeriodsResponse {
  payPeriods: PayPeriod[];
  count: number;
}

interface ExportHistoryEntry {
  id: string;
  payPeriodId: string;
  exportType: 'ADP_CSV' | 'OPENFORCE_CSV';
  fileName: string;
  fileHash: string;
  rowCount: number;
  totalAmountCents: number;
  createdAt: string;
  createdBy?: string;
}

interface AuditEvent {
  id: string;
  action: 'PAY_PERIOD_CREATED' | 'START_PROCESSING' | 'PAY_PERIOD_LOCKED' | 'EXPORT_GENERATED' | 'MOVE_CREATED_MANUAL';
  userId: string | null;
  payPeriodId: string | null;
  timestamp: string;
  metadata: Record<string, any> | null;
  actorName?: string;
}

const ADMIN_ROLES = ['super_user', 'admin'];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'OPEN': return 'default';
    case 'PROCESSING': return 'secondary';
    case 'LOCKED': return 'outline';
    default: return 'secondary';
  }
}

interface PermissionDebugInfo {
  userId: string;
  userEmail: string;
  userName: string;
  computedRoles: string[];
  canOpenPayPeriod: boolean;
  canStartProcessing: boolean;
  canLock: boolean;
  canExport: boolean;
  gatingReasons: string[];
}

function PermissionDebugPanel({ info }: { info: PermissionDebugInfo }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="border-amber-500/50 bg-amber-500/5" data-testid="permission-debug-panel">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                  Role / Permission Debug Panel
                </CardTitle>
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Admin Only
                </Badge>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-amber-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-amber-600" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">User Info</p>
                  <div className="space-y-1 bg-muted/50 rounded-md p-2">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">ID:</span>
                      <code className="text-xs bg-background px-1 rounded truncate max-w-[200px]" data-testid="debug-user-id">
                        {info.userId || 'N/A'}
                      </code>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Email:</span>
                      <code className="text-xs bg-background px-1 rounded truncate max-w-[200px]" data-testid="debug-user-email">
                        {info.userEmail || 'N/A'}
                      </code>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Name:</span>
                      <span data-testid="debug-user-name">{info.userName || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Computed Roles</p>
                  <div className="flex flex-wrap gap-1" data-testid="debug-computed-roles">
                    {info.computedRoles.length > 0 ? (
                      info.computedRoles.map((role, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{role}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">No roles</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Permissions</p>
                  <div className="space-y-1 bg-muted/50 rounded-md p-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">canOpenPayPeriod:</span>
                      <Badge variant={info.canOpenPayPeriod ? "default" : "outline"} className="text-xs" data-testid="debug-can-open">
                        {info.canOpenPayPeriod ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {info.canOpenPayPeriod ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">canStartProcessing:</span>
                      <Badge variant={info.canStartProcessing ? "default" : "outline"} className="text-xs" data-testid="debug-can-start-processing">
                        {info.canStartProcessing ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {info.canStartProcessing ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">canLock:</span>
                      <Badge variant={info.canLock ? "default" : "outline"} className="text-xs" data-testid="debug-can-lock">
                        {info.canLock ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {info.canLock ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">canExport:</span>
                      <Badge variant={info.canExport ? "default" : "outline"} className="text-xs" data-testid="debug-can-export">
                        {info.canExport ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {info.canExport ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Gating Reasons</p>
                  <div className="bg-muted/50 rounded-md p-2 max-h-24 overflow-y-auto" data-testid="debug-gating-reasons">
                    {info.gatingReasons.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {info.gatingReasons.map((reason, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground text-xs">No gating restrictions</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function Payment() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string>("");
  const [periodTypeFilter, setPeriodTypeFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPeriodType, setNewPeriodType] = useState<'DRIVERS_WEEKLY' | 'DRIVERS_BIWEEKLY'>('DRIVERS_WEEKLY');
  const [newPeriodStart, setNewPeriodStart] = useState<string>("");
  const [newPeriodEnd, setNewPeriodEnd] = useState<string>("");
  
  const userEmail = user?.email?.toLowerCase() || '';
  const userRole = (user as any)?.role || '';
  const canCreatePayPeriods = AUTHORIZED_CREATORS.includes(userEmail);
  const canLockPayPeriods = AUTHORIZED_LOCKERS.includes(userEmail);
  const isAdmin = ADMIN_ROLES.includes(userRole);

  const { data: payPeriodsData, isLoading, refetch } = useQuery<PayPeriodsResponse>({
    queryKey: ["/api/payroll/pay-periods", periodTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (periodTypeFilter && periodTypeFilter !== "all") {
        params.set("periodType", periodTypeFilter);
      }
      const res = await fetch(`/api/payroll/pay-periods?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch pay periods");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const payPeriods = payPeriodsData?.payPeriods || [];
  const selectedPayPeriod = payPeriods.find(pp => pp.id === selectedPayPeriodId);

  const startProcessingMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiRequest("PATCH", `/api/payroll/pay-periods/${periodId}/status`, { status: 'PROCESSING' });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing Started",
        description: "The pay period is now being processed. Verify moves and expenses before locking.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Processing",
        description: error.message || "Could not start processing.",
        variant: "destructive",
      });
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiRequest("PATCH", `/api/payroll/pay-periods/${periodId}/status`, { status: 'LOCKED' });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Pay Period Locked",
        description: "The pay period has been successfully locked and is ready for export.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Lock",
        description: error.message || "Could not lock the pay period.",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ periodId, exportType }: { periodId: string; exportType: 'ADP_CSV' | 'OPENFORCE_CSV' }) => {
      const response = await fetch(`/api/payroll/exports/${periodId}/generate?type=${exportType}`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Export failed');
      }
      
      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `export_${exportType}_${periodId}.csv`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return { success: true, filename };
    },
    onSuccess: (data) => {
      toast({
        title: "Export Generated",
        description: `Downloaded ${data.filename}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
    },
    onError: (error: any) => {
      const message = error.message || "Could not generate the export.";
      const isPeriodNotLocked = message.includes('LOCKED') || message.includes('PAY_PERIOD_NOT_LOCKED');
      toast({
        title: isPeriodNotLocked ? "Pay Period Not Locked" : "Export Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const openPayPeriodMutation = useMutation({
    mutationFn: async (data: { payGroup: string; periodType?: string; periodStart: string; periodEnd: string }) => {
      const response = await apiRequest("POST", "/api/payroll/pay-periods", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Pay Period Created",
        description: "A new pay period has been opened.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create",
        description: error.message || "Could not create pay period.",
        variant: "destructive",
      });
    },
  });

  const seedTestDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payroll/seed-test-data");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Data Seeded",
        description: `Created pay period with ${data.moves?.length || 5} demo moves (${data.summary?.passCount || 3} PASS, ${data.summary?.warnCount || 1} WARN, ${data.summary?.failCount || 1} FAIL)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
      if (data.payPeriod?.id) {
        setSelectedPayPeriodId(data.payPeriod.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Seed Test Data",
        description: error.message || "Could not seed test data. Admin access required.",
        variant: "destructive",
      });
    },
  });

  const triggerImportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/trigger-scheduled-import");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Import Triggered",
        description: "Scheduled move import job has been triggered.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Trigger Import",
        description: error.message || "Could not trigger import. Admin access required.",
        variant: "destructive",
      });
    },
  });

  // Export history query
  const { data: exportHistoryData } = useQuery<{ exports: ExportHistoryEntry[] }>({
    queryKey: ["/api/payroll/pay-periods", selectedPayPeriodId, "export-history"],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/pay-periods/${selectedPayPeriodId}/export-history`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch export history");
      return res.json();
    },
    enabled: isAuthenticated && !!selectedPayPeriodId,
  });

  const exportHistory = exportHistoryData?.exports || [];

  // Audit events query (last 10 events)
  const { data: auditEventsData } = useQuery<{ auditEvents: AuditEvent[] }>({
    queryKey: ["/api/payroll/audit-events"],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/audit-events?limit=10`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch audit events");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const auditEvents = auditEventsData?.auditEvents || [];

  const canLock = selectedPayPeriod && 
    selectedPayPeriod.status === 'PROCESSING' && 
    canLockPayPeriods;

  const hasIncludedMoves = selectedPayPeriod && 
    (selectedPayPeriod.summary?.includedMoves ?? 0) > 0;

  const canStartProcessing = selectedPayPeriod && 
    selectedPayPeriod.status === 'OPEN' && 
    canCreatePayPeriods &&
    hasIncludedMoves;

  const canExport = selectedPayPeriod && selectedPayPeriod.status === 'LOCKED';

  // Compute gating reasons for debug panel - using SAME logic as buttons
  const computeGatingReasons = (): string[] => {
    const reasons: string[] = [];
    
    // Authorization checks
    if (!AUTHORIZED_CREATORS.includes(userEmail)) {
      reasons.push(`Email "${userEmail}" not in AUTHORIZED_CREATORS list`);
    }
    if (!AUTHORIZED_LOCKERS.includes(userEmail)) {
      reasons.push(`Email "${userEmail}" not in AUTHORIZED_LOCKERS list`);
    }
    
    // Pay period state checks
    if (!selectedPayPeriod) {
      reasons.push('No pay period selected');
    } else {
      if (selectedPayPeriod.status === 'OPEN' && !hasIncludedMoves) {
        reasons.push('No eligible moves found in this period. At least 1 included move is required to start processing.');
      }
      if (selectedPayPeriod.status !== 'OPEN' && selectedPayPeriod.status !== 'PROCESSING' && selectedPayPeriod.status !== 'LOCKED') {
        reasons.push(`Pay period status is "${selectedPayPeriod.status}"`);
      }
      if (selectedPayPeriod.status !== 'LOCKED' && !canExport) {
        reasons.push(`Pay period status is "${selectedPayPeriod.status}" (not LOCKED) - cannot export`);
      }
    }
    
    return reasons;
  };

  // Build debug info using the same logic as the buttons
  const permissionDebugInfo: PermissionDebugInfo = {
    userId: (user as any)?.id || user?.sub || '',
    userEmail: userEmail,
    userName: user ? `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || user.email || '' : '',
    computedRoles: [
      userRole,
      ...(isAdmin ? ['isAdmin'] : []),
      ...(canCreatePayPeriods ? ['AUTHORIZED_CREATOR'] : []),
      ...(canLockPayPeriods ? ['AUTHORIZED_LOCKER'] : []),
    ].filter(Boolean),
    canOpenPayPeriod: canCreatePayPeriods,
    canStartProcessing: !!canStartProcessing,
    canLock: !!canLock,
    canExport: !!canExport,
    gatingReasons: computeGatingReasons(),
  };

  const handleStartProcessing = () => {
    if (selectedPayPeriodId) {
      startProcessingMutation.mutate(selectedPayPeriodId);
    }
  };

  const handleLock = () => {
    if (selectedPayPeriodId) {
      lockMutation.mutate(selectedPayPeriodId);
    }
  };

  const handleExport = (exportType: 'ADP_CSV' | 'OPENFORCE_CSV') => {
    if (selectedPayPeriodId) {
      exportMutation.mutate({ periodId: selectedPayPeriodId, exportType });
    }
  };

  const handleOpenCreateModal = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    
    if (newPeriodType === 'DRIVERS_BIWEEKLY') {
      weekEnd.setDate(weekStart.getDate() + 13);
    } else {
      weekEnd.setDate(weekStart.getDate() + 6);
    }
    
    setNewPeriodStart(weekStart.toISOString().split('T')[0]);
    setNewPeriodEnd(weekEnd.toISOString().split('T')[0]);
    setIsCreateModalOpen(true);
  };
  
  const handlePeriodTypeChange = (type: 'DRIVERS_WEEKLY' | 'DRIVERS_BIWEEKLY') => {
    setNewPeriodType(type);
    if (newPeriodStart) {
      const startDate = new Date(newPeriodStart);
      const endDate = new Date(startDate);
      if (type === 'DRIVERS_BIWEEKLY') {
        endDate.setDate(startDate.getDate() + 13);
      } else {
        endDate.setDate(startDate.getDate() + 6);
      }
      setNewPeriodEnd(endDate.toISOString().split('T')[0]);
    }
  };

  const handleCreatePayPeriod = () => {
    if (!newPeriodStart || !newPeriodEnd) {
      toast({
        title: "Error",
        description: "Please select start and end dates",
        variant: "destructive",
      });
      return;
    }
    
    openPayPeriodMutation.mutate({
      payGroup: newPeriodType,
      periodType: newPeriodType,
      periodStart: newPeriodStart,
      periodEnd: newPeriodEnd,
    });
    setIsCreateModalOpen(false);
  };

  const [isAddMoveModalOpen, setIsAddMoveModalOpen] = useState(false);
  const [manualMoveData, setManualMoveData] = useState({
    tripDate: new Date().toISOString().split('T')[0],
    marketId: '',
    estimatedMinutes: 60,
    notes: '',
    driverId: '',
    customerId: ''
  });
  
  // Audit event detail drawer state
  const [selectedAuditEvent, setSelectedAuditEvent] = useState<AuditEvent | null>(null);
  const [isAuditDetailOpen, setIsAuditDetailOpen] = useState(false);

  // Driver autocomplete state
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [selectedDriverDisplay, setSelectedDriverDisplay] = useState('');
  const [isDriverDropdownOpen, setIsDriverDropdownOpen] = useState(false);

  // Customer autocomplete state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerDisplay, setSelectedCustomerDisplay] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Driver search query
  const { data: driverSearchResults = [], isLoading: driverSearchLoading } = useQuery<any[]>({
    queryKey: [`/api/drivers/search?q=${encodeURIComponent(driverSearchQuery)}`],
  });

  // Customer search query
  const { data: customerSearchResults = [], isLoading: customerSearchLoading } = useQuery<any[]>({
    queryKey: [`/api/customers/search?q=${encodeURIComponent(customerSearchQuery)}`],
  });

  const addManualMoveMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/corporate/trips/manual", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      const eligStatus = data?.eligibility?.status || 'UNKNOWN';
      const eligReasons = data?.eligibility?.reasons?.length > 0 
        ? ` (${data.eligibility.reasons.join(', ')})` 
        : '';
      toast({
        title: "Move Created",
        description: `Manual move saved. Eligibility: ${eligStatus}${eligReasons}`,
        variant: eligStatus === 'FAIL' ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/pay-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/pay-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/trips"] });
      setIsAddMoveModalOpen(false);
      // Reset form
      setManualMoveData({
        tripDate: new Date().toISOString().split('T')[0],
        marketId: '',
        estimatedMinutes: 60,
        notes: '',
        driverId: '',
        customerId: ''
      });
      setDriverSearchQuery('');
      setSelectedDriverDisplay('');
      setCustomerSearchQuery('');
      setSelectedCustomerDisplay('');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Move",
        description: error.message || "Could not save manual move entry.",
        variant: "destructive",
      });
    },
  });

  const handleCreateManualMove = () => {
    if (!manualMoveData.driverId || !manualMoveData.customerId) {
      toast({
        title: "Validation Error",
        description: "Driver and Customer are required.",
        variant: "destructive"
      });
      return;
    }
    if (!manualMoveData.marketId || !manualMoveData.notes) {
      toast({
        title: "Validation Error",
        description: "Market and Notes are required.",
        variant: "destructive"
      });
      return;
    }
    addManualMoveMutation.mutate(manualMoveData);
  };

  const canSaveMove = !!(manualMoveData.driverId && manualMoveData.customerId && manualMoveData.marketId && manualMoveData.notes && manualMoveData.estimatedMinutes > 0);

  const { data: markets = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/markets"],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Payment</h1>
          <p className="text-muted-foreground mt-2">
            Manage pay periods, lock for processing, and generate payroll exports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsAddMoveModalOpen(true)}
            data-testid="button-add-manual-move"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Manual Move
          </Button>
          {isAdmin && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => seedTestDataMutation.mutate()}
                    disabled={seedTestDataMutation.isPending}
                    data-testid="button-seed-test-data"
                  >
                    {seedTestDataMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Seed Test Data
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Create a test pay period with 5 demo moves (PASS/WARN/FAIL)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => triggerImportMutation.mutate()}
                    disabled={triggerImportMutation.isPending}
                    data-testid="button-trigger-import"
                  >
                    {triggerImportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Trigger Import
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Manually trigger the scheduled move import job</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {isAdmin && (
        <PermissionDebugPanel info={permissionDebugInfo} />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>Pay Period Management</CardTitle>
          </div>
          <CardDescription>
            Select a pay period to view details, lock for processing, or generate exports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Select Pay Period</label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedPayPeriodId} 
                  onValueChange={setSelectedPayPeriodId}
                  data-testid="select-pay-period"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a pay period..." />
                  </SelectTrigger>
                  <SelectContent>
                    {payPeriods.length === 0 ? (
                      <SelectItem value="_none" disabled>No pay periods available</SelectItem>
                    ) : (
                      payPeriods.map((pp) => (
                        <SelectItem key={pp.id} value={pp.id} data-testid={`option-pay-period-${pp.id}`}>
                          {formatDate(pp.periodStart)} - {formatDate(pp.periodEnd)} ({pp.payGroup}) [{pp.status}]
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div className="min-w-[150px]">
              <label className="text-sm font-medium mb-2 block">Period Type</label>
              <Select value={periodTypeFilter} onValueChange={setPeriodTypeFilter}>
                <SelectTrigger data-testid="select-period-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="DRIVERS_WEEKLY">Drivers Weekly</SelectItem>
                  <SelectItem value="DRIVERS_BIWEEKLY">Drivers Bi-Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {canCreatePayPeriods && (
              <div className="min-w-[150px]">
                <label className="text-sm font-medium mb-2 block">&nbsp;</label>
                <Button onClick={handleOpenCreateModal} data-testid="button-create-period-modal">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pay Period
                </Button>
              </div>
            )}
          </div>

          {selectedPayPeriod && (
            <>
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={getStatusBadgeVariant(selectedPayPeriod.status)} data-testid="badge-period-status">
                        {selectedPayPeriod.status === 'LOCKED' && <Lock className="h-3 w-3 mr-1" />}
                        {selectedPayPeriod.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xl font-bold">{selectedPayPeriod.payGroup}</span>
                      <Badge variant="outline" data-testid="badge-period-type">
                        {selectedPayPeriod.periodType === 'DRIVERS_BIWEEKLY' ? 'Bi-Weekly' : 'Weekly'}
                      </Badge>
                    </div>
                    {selectedPayPeriod.lockedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Locked: {formatDate(selectedPayPeriod.lockedAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Moves</span>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2">
                      <span className="text-3xl font-bold" data-testid="text-total-moves">
                        {selectedPayPeriod.summary?.totalMoves ?? 0}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          Included
                        </span>
                        <span className="font-bold text-green-600" data-testid="text-included-moves">
                          {selectedPayPeriod.summary?.includedMoves ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          Excluded (Eligibility)
                        </span>
                        <span className="font-bold text-red-600" data-testid="text-excluded-moves">
                          {selectedPayPeriod.summary?.excludedMoves ?? 0}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-3">
                {selectedPayPeriod.status === 'OPEN' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          onClick={handleStartProcessing}
                          disabled={!canStartProcessing || startProcessingMutation.isPending}
                          variant={canStartProcessing ? "default" : "outline"}
                          data-testid="button-start-processing"
                        >
                          {startProcessingMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2" />
                          )}
                          Start Processing
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canStartProcessing && (
                      <TooltipContent>
                        <p>
                          {!canCreatePayPeriods 
                            ? "Only Will Walton, David Forman, or Luis Valdez can start processing" 
                            : "Start Processing is disabled until at least one eligible move is included."}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}

                {selectedPayPeriod.status === 'PROCESSING' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          onClick={handleLock}
                          disabled={!canLock || lockMutation.isPending}
                          variant={canLock ? "default" : "outline"}
                          data-testid="button-lock-period"
                        >
                          {lockMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Lock className="h-4 w-4 mr-2" />
                          )}
                          Lock Pay Period
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canLock && (
                      <TooltipContent>
                        <p>Only Will Walton or David Forman can lock pay periods</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={() => handleExport('ADP_CSV')}
                        disabled={!canExport || exportMutation.isPending}
                        variant="outline"
                        data-testid="button-export-adp"
                      >
                        {exportMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Generate Export (ADP)
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canExport && (
                    <TooltipContent>
                      <p>Pay period must be LOCKED before exporting</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={() => handleExport('OPENFORCE_CSV')}
                        disabled={!canExport || exportMutation.isPending}
                        variant="outline"
                        data-testid="button-export-openforce"
                      >
                        {exportMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Generate Export (OpenForce)
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canExport && (
                    <TooltipContent>
                      <p>Pay period must be LOCKED before exporting</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>

              {selectedPayPeriod.status === 'OPEN' && !canCreatePayPeriods && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    Only Will Walton, David Forman, or Luis Valdez can start processing
                  </span>
                </div>
              )}

              {selectedPayPeriod.status === 'PROCESSING' && !canLockPayPeriods && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    Only Will Walton or David Forman can lock pay periods
                  </span>
                </div>
              )}

              {!canExport && selectedPayPeriod.status !== 'LOCKED' && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    Pay period must be LOCKED before generating exports
                  </span>
                </div>
              )}

              {selectedPayPeriod.exportedAt && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Last exported: {formatDate(selectedPayPeriod.exportedAt)} ({selectedPayPeriod.exportType})
                  </span>
                </div>
              )}

              {/* Reconciliation Checklist (Read-Only) */}
              <Separator />
              <div data-testid="reconciliation-checklist">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Reconciliation Checklist</span>
                  <Badge variant="outline" className="text-xs">Read-Only</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border" data-testid="checklist-moves-reconciled">
                    {selectedPayPeriod.movesReconciled ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">Moves Reconciled</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedPayPeriod.movesReconciled ? 'All moves have been verified' : 'Pending verification'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border" data-testid="checklist-expenses-approved">
                    {selectedPayPeriod.expensesApproved ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">Expenses Approved</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedPayPeriod.expensesApproved ? 'All expenses have been approved' : 'Pending approval'}
                      </p>
                    </div>
                  </div>
                </div>
                {selectedPayPeriod.reviewedBy && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Reviewed by: {selectedPayPeriod.reviewedBy}
                    {selectedPayPeriod.reviewedAt && ` on ${formatDate(selectedPayPeriod.reviewedAt)}`}
                  </div>
                )}
              </div>

              {exportHistory.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Export History</span>
                    </div>
                    <div className="space-y-2">
                      {exportHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                          data-testid={`export-history-${entry.id}`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{entry.fileName}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {entry.exportType === 'ADP_CSV' ? 'ADP' : 'OpenForce'}
                              </Badge>
                              <span>{entry.rowCount} rows</span>
                              <span>{formatCurrency(entry.totalAmountCents)}</span>
                              <span>{formatDate(entry.createdAt)}</span>
                            </div>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  toast({
                                    title: "Download not available",
                                    description: "Export artifacts are stored for audit. Original export is available upon request.",
                                  });
                                }}
                                data-testid={`button-download-${entry.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Download {entry.fileName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {!selectedPayPeriod && !isLoading && payPeriods.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No pay periods available</p>
              {canCreatePayPeriods && (
                <Button onClick={handleOpenCreateModal} variant="outline" data-testid="button-create-period">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pay Period
                </Button>
              )}
            </div>
          )}
        </CardContent>
        
        {payPeriods.length > 0 && !selectedPayPeriod && (
          <CardFooter className="text-sm text-muted-foreground">
            Select a pay period from the dropdown to view details and actions
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pay Periods Overview</CardTitle>
          <CardDescription>
            {payPeriods.length} pay period(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payPeriods.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pay periods to display</p>
          ) : (
            <div className="space-y-2">
              {payPeriods.map((pp) => (
                <div 
                  key={pp.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPayPeriodId === pp.id 
                      ? 'bg-primary/10 border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedPayPeriodId(pp.id)}
                  data-testid={`row-pay-period-${pp.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">
                        {formatDate(pp.periodStart)} - {formatDate(pp.periodEnd)}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">({pp.payGroup})</span>
                      <Badge variant="outline" className="ml-2 text-xs" data-testid={`badge-period-type-${pp.id}`}>
                        {pp.periodType === 'DRIVERS_BIWEEKLY' ? 'Bi-Weekly' : 'Weekly'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {pp.summary?.totalMoves ?? 0} moves
                    </span>
                    <Badge variant={getStatusBadgeVariant(pp.status)}>
                      {pp.status === 'LOCKED' && <Lock className="h-3 w-3 mr-1" />}
                      {pp.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay Period Audit Log (Read-Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Pay Period Audit Log
          </CardTitle>
          <CardDescription>
            Last 10 payroll-critical actions (read-only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No audit events recorded yet</p>
          ) : (
            <div className="space-y-2" data-testid="audit-events-list">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 cursor-pointer hover-elevate"
                  data-testid={`audit-event-${event.id}`}
                  onClick={() => {
                    setSelectedAuditEvent(event);
                    setIsAuditDetailOpen(true);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${
                      event.action === 'PAY_PERIOD_CREATED' ? 'bg-green-500' :
                      event.action === 'START_PROCESSING' ? 'bg-blue-500' :
                      event.action === 'PAY_PERIOD_LOCKED' ? 'bg-orange-500' :
                      event.action === 'EXPORT_GENERATED' ? 'bg-purple-500' :
                      event.action === 'MOVE_CREATED_MANUAL' ? 'bg-teal-500' : 'bg-gray-500'
                    }`} />
                    <div>
                      <span className="font-medium text-sm">
                        {event.action === 'PAY_PERIOD_CREATED' ? 'Pay Period Created' :
                         event.action === 'START_PROCESSING' ? 'Started Processing' :
                         event.action === 'PAY_PERIOD_LOCKED' ? 'Pay Period Locked' :
                         event.action === 'EXPORT_GENERATED' ? 'Export Generated' :
                         event.action === 'MOVE_CREATED_MANUAL' ? 'Manual Move Created' :
                         event.action}
                      </span>
                      {event.metadata?.moveNumber && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({event.metadata.moveNumber})
                        </span>
                      )}
                      {event.metadata?.payGroup && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({event.metadata.payGroup})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="truncate max-w-[150px]" title={event.actorName || event.userId || 'System'}>
                      {event.actorName || event.userId || 'System'}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatDate(event.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Pay Period Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent data-testid="dialog-create-pay-period">
          <DialogHeader>
            <DialogTitle>Create Pay Period</DialogTitle>
            <DialogDescription>
              Create a new pay period for driver payroll processing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="period-type">Period Type</Label>
              <Select value={newPeriodType} onValueChange={(value) => handlePeriodTypeChange(value as 'DRIVERS_WEEKLY' | 'DRIVERS_BIWEEKLY')}>
                <SelectTrigger id="period-type" data-testid="select-new-period-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRIVERS_WEEKLY">Drivers Weekly (7 days)</SelectItem>
                  <SelectItem value="DRIVERS_BIWEEKLY">Drivers Bi-Weekly (14 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period-start">Start Date</Label>
                <Input 
                  id="period-start"
                  type="date"
                  value={newPeriodStart}
                  onChange={(e) => {
                    setNewPeriodStart(e.target.value);
                    if (e.target.value) {
                      const startDate = new Date(e.target.value);
                      const endDate = new Date(startDate);
                      if (newPeriodType === 'DRIVERS_BIWEEKLY') {
                        endDate.setDate(startDate.getDate() + 13);
                      } else {
                        endDate.setDate(startDate.getDate() + 6);
                      }
                      setNewPeriodEnd(endDate.toISOString().split('T')[0]);
                    }
                  }}
                  data-testid="input-period-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-end">End Date</Label>
                <Input 
                  id="period-end"
                  type="date"
                  value={newPeriodEnd}
                  onChange={(e) => setNewPeriodEnd(e.target.value)}
                  data-testid="input-period-end"
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {newPeriodStart && newPeriodEnd && (
                <span>
                  Period: {formatDate(newPeriodStart)} - {formatDate(newPeriodEnd)}
                </span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePayPeriod} 
              disabled={openPayPeriodMutation.isPending || !newPeriodStart || !newPeriodEnd}
              data-testid="button-confirm-create"
            >
              {openPayPeriodMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Manual Move Modal */}
      <Dialog open={isAddMoveModalOpen} onOpenChange={setIsAddMoveModalOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-add-manual-move">
          <DialogHeader>
            <DialogTitle>Add Manual Move Entry</DialogTitle>
            <DialogDescription>
              Create a manual move record for the system of record. Eligibility will be snapshotted on creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Service Date</Label>
              <Input 
                type="date" 
                value={manualMoveData.tripDate}
                onChange={(e) => setManualMoveData(prev => ({ ...prev, tripDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Market / Zone</Label>
              <Select 
                value={manualMoveData.marketId} 
                onValueChange={(v) => setManualMoveData(prev => ({ ...prev, marketId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select market..." />
                </SelectTrigger>
                <SelectContent>
                  {markets.map((m: any) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Est. Minutes (Required)</Label>
              <Input 
                type="number" 
                value={manualMoveData.estimatedMinutes}
                onChange={(e) => setManualMoveData(prev => ({ ...prev, estimatedMinutes: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2 relative">
              <Label>Driver (Required)</Label>
              <Input 
                placeholder="Search driver by name..."
                value={selectedDriverDisplay || driverSearchQuery}
                onChange={(e) => {
                  setDriverSearchQuery(e.target.value);
                  setSelectedDriverDisplay('');
                  setManualMoveData(prev => ({ ...prev, driverId: '' }));
                  setIsDriverDropdownOpen(true);
                }}
                onFocus={() => setIsDriverDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsDriverDropdownOpen(false), 200)}
                data-testid="input-driver-search"
              />
              {isDriverDropdownOpen && !selectedDriverDisplay && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                  {driverSearchLoading ? (
                    <div className="p-2 text-muted-foreground" data-testid="driver-search-loading">Loading...</div>
                  ) : driverSearchResults.length === 0 ? (
                    <div className="p-2 text-muted-foreground" data-testid="driver-search-empty">No drivers found</div>
                  ) : (
                    driverSearchResults.map((d: any) => (
                      <div
                        key={d.id}
                        className="p-2 cursor-pointer hover-elevate"
                        data-testid={`driver-option-${d.id}`}
                        onClick={() => {
                          setManualMoveData(prev => ({ ...prev, driverId: d.id.toString() }));
                          setSelectedDriverDisplay(d.displayName);
                          setIsDriverDropdownOpen(false);
                        }}
                      >
                        {d.displayName}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2 relative">
              <Label>Customer (Required)</Label>
              <Input 
                placeholder="Search customer by name..."
                value={selectedCustomerDisplay || customerSearchQuery}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setSelectedCustomerDisplay('');
                  setManualMoveData(prev => ({ ...prev, customerId: '' }));
                  setIsCustomerDropdownOpen(true);
                }}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)}
                data-testid="input-customer-search"
              />
              {isCustomerDropdownOpen && !selectedCustomerDisplay && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                  {customerSearchLoading ? (
                    <div className="p-2 text-muted-foreground" data-testid="customer-search-loading">Loading...</div>
                  ) : customerSearchResults.length === 0 ? (
                    <div className="p-2 text-muted-foreground" data-testid="customer-search-empty">No customers found</div>
                  ) : (
                    customerSearchResults.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-2 cursor-pointer hover-elevate"
                        data-testid={`customer-option-${c.id}`}
                        onClick={() => {
                          setManualMoveData(prev => ({ ...prev, customerId: c.id.toString() }));
                          setSelectedCustomerDisplay(c.name);
                          setIsCustomerDropdownOpen(false);
                        }}
                      >
                        {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Notes (Required)</Label>
              <Input 
                placeholder="Reason for manual entry..." 
                value={manualMoveData.notes}
                onChange={(e) => setManualMoveData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMoveModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateManualMove}
              disabled={!canSaveMove || addManualMoveMutation.isPending}
            >
              {addManualMoveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Move Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Event Detail Drawer */}
      <Dialog open={isAuditDetailOpen} onOpenChange={setIsAuditDetailOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-audit-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Event Details
            </DialogTitle>
            <DialogDescription>
              Read-only view of audit event payload
            </DialogDescription>
          </DialogHeader>
          {selectedAuditEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Action</Label>
                  <p className="font-medium">
                    {selectedAuditEvent.action === 'PAY_PERIOD_CREATED' ? 'Pay Period Created' :
                     selectedAuditEvent.action === 'START_PROCESSING' ? 'Started Processing' :
                     selectedAuditEvent.action === 'PAY_PERIOD_LOCKED' ? 'Pay Period Locked' :
                     selectedAuditEvent.action === 'EXPORT_GENERATED' ? 'Export Generated' :
                     selectedAuditEvent.action === 'MOVE_CREATED_MANUAL' ? 'Manual Move Created' :
                     selectedAuditEvent.action}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Timestamp</Label>
                  <p className="font-medium">{formatDate(selectedAuditEvent.timestamp)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Actor</Label>
                  <p className="font-medium">{selectedAuditEvent.actorName || selectedAuditEvent.userId || 'System'}</p>
                </div>
                {selectedAuditEvent.payPeriodId && (
                  <div>
                    <Label className="text-muted-foreground">Pay Period ID</Label>
                    <p className="font-mono text-sm">{selectedAuditEvent.payPeriodId}</p>
                  </div>
                )}
                {selectedAuditEvent.metadata?.moveId && (
                  <div>
                    <Label className="text-muted-foreground">Move ID</Label>
                    <Link href={`/trips/${selectedAuditEvent.metadata.moveId}`}>
                      <span className="font-mono text-sm text-primary hover:underline cursor-pointer" data-testid="link-move-detail">
                        {selectedAuditEvent.metadata.moveNumber || selectedAuditEvent.metadata.moveId}
                      </span>
                    </Link>
                  </div>
                )}
              </div>
              
              <div>
                <Label className="text-muted-foreground">Payload (JSON)</Label>
                <pre className="mt-2 p-4 rounded-lg bg-muted text-sm overflow-auto max-h-80 font-mono" data-testid="audit-payload-json">
                  {JSON.stringify(selectedAuditEvent.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAuditDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
