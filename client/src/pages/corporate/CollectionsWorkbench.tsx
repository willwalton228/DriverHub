import { useState } from "react";
import { formatDate } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  AlertTriangle, 
  Phone, 
  Mail, 
  DollarSign, 
  User, 
  Calendar,
  Clock,
  FileText,
  Plus,
  ChevronRight,
  ArrowUpRight,
  Flag,
  AlertCircle,
  CheckCircle,
  Zap,
  RefreshCw,
  Filter,
  X
} from "lucide-react";

interface CollectionsQueueItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  balanceDue: string;
  totalAmount: string;
  status: string;
  isDisputed: boolean;
  disputedAmount: string | null;
  lastSentAt: string | null;
  sentAt: string | null;
  daysOverdue: number;
  overdueBucket: string;
  aiScore: number | null;
  aiTier: 'healthy' | 'watchlist' | 'at_risk' | 'collections_candidate' | null;
}

interface AgingBucket {
  count: number;
  amount: string;
}

interface CustomerRollup {
  customerId: string;
  openBalance: string;
  overdueInvoiceCount: number;
  oldestInvoiceAge: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: string | null;
  lastReminderSent: string | null;
  paymentMetrics: any;
  flags: any;
  agingBreakdown?: {
    days1to30: AgingBucket;
    days31to60: AgingBucket;
    days61to90: AgingBucket;
    over90: AgingBucket;
  };
  assignedOwner?: string | null;
  reminderCount?: number;
  communicationHistory?: Array<{
    id: string;
    sentAt: string;
    subject: string;
  }>;
}

interface NextBestAction {
  action: string;
  reason: string;
  priority: string;
}

interface CollectionsNote {
  id: string;
  customerId: string | null;
  invoiceId: string | null;
  noteType: string;
  content: string;
  assignedToUserId: string | null;
  followUpDate: string | null;
  followUpCompleted: boolean;
  followUpCompletedAt: string | null;
  suggestedAction: string | null;
  actionTaken: string | null;
  actionTakenAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const OVERDUE_BUCKETS = [
  { value: 'all', label: 'All Buckets' },
  { value: '1-30', label: '1-30 Days' },
  { value: '31-60', label: '31-60 Days' },
  { value: '61-90', label: '61-90 Days' },
  { value: '90+', label: '90+ Days' },
];

const NOTE_TYPES = [
  { value: 'general', label: 'General Note' },
  { value: 'call_log', label: 'Call Log' },
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'promise_to_pay', label: 'Promise to Pay' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'resolution', label: 'Resolution' },
];

const ACTION_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  send_reminder: { label: 'Send Reminder', icon: Mail, color: 'bg-blue-500' },
  call_customer: { label: 'Call Customer', icon: Phone, color: 'bg-orange-500' },
  switch_ach_only: { label: 'Switch to ACH Only', icon: DollarSign, color: 'bg-purple-500' },
  require_prepay: { label: 'Require Prepay', icon: Flag, color: 'bg-red-500' },
  escalate_collections: { label: 'Escalate to Collections', icon: AlertTriangle, color: 'bg-red-600' },
  review_dispute: { label: 'Review Dispute', icon: AlertCircle, color: 'bg-yellow-500' },
  no_action_needed: { label: 'No Action Needed', icon: CheckCircle, color: 'bg-green-500' },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export default function CollectionsWorkbench() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showFlagsDialog, setShowFlagsDialog] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [followUpDate, setFollowUpDate] = useState("");
  
  const [filters, setFilters] = useState({
    overdueBucket: 'all',
    customerId: '',
    minBalance: '',
    maxBalance: '',
    isDisputed: 'all',
    assignedToUserId: '',
    lastReminderBefore: '',
    lastReminderAfter: '',
    riskTier: 'all',
  });
  const [showFilters, setShowFilters] = useState(false);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.overdueBucket && filters.overdueBucket !== 'all') {
      params.set('overdueBucket', filters.overdueBucket);
    }
    if (filters.customerId) {
      params.set('customerId', filters.customerId);
    }
    if (filters.minBalance) {
      params.set('minBalance', filters.minBalance);
    }
    if (filters.maxBalance) {
      params.set('maxBalance', filters.maxBalance);
    }
    if (filters.isDisputed !== 'all') {
      params.set('isDisputed', filters.isDisputed);
    }
    if (filters.assignedToUserId) {
      params.set('assignedToUserId', filters.assignedToUserId);
    }
    if (filters.lastReminderBefore) {
      params.set('lastReminderBefore', filters.lastReminderBefore);
    }
    if (filters.lastReminderAfter) {
      params.set('lastReminderAfter', filters.lastReminderAfter);
    }
    if (filters.riskTier && filters.riskTier !== 'all') {
      params.set('riskTier', filters.riskTier);
    }
    return params.toString();
  };

  const { data: queueItems = [], isLoading: queueLoading, refetch: refetchQueue } = useQuery<CollectionsQueueItem[]>({
    queryKey: ['/api/corporate/collections/queue', filters],
    queryFn: async () => {
      const queryString = buildQueryParams();
      const response = await fetch(`/api/corporate/collections/queue${queryString ? `?${queryString}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch queue');
      return response.json();
    },
  });

  const { data: customerRollup, isLoading: rollupLoading } = useQuery<CustomerRollup>({
    queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'rollup'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/collections/customer/${selectedCustomerId}/rollup`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch rollup');
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: nextAction, isLoading: actionLoading } = useQuery<NextBestAction>({
    queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'next-action'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/collections/customer/${selectedCustomerId}/next-action`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch next action');
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: customerNotes = [], isLoading: notesLoading } = useQuery<CollectionsNote[]>({
    queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/collections/customer/${selectedCustomerId}/notes`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: customerFlags } = useQuery({
    queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'flags'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/collections/customer/${selectedCustomerId}/flags`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch flags');
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: customerCommitments = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/commitments', selectedCustomerId, 'customer-commitments'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/invoicing/commitments?customerId=${selectedCustomerId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch commitments');
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: missedCommitmentAlerts = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/commitments/alerts/missed'],
    queryFn: async () => {
      const response = await fetch('/api/corporate/invoicing/commitments/alerts/missed', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch missed alerts');
      return response.json();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { customerId: string; noteType: string; content: string; followUpDate?: string }) => {
      return apiRequest('POST', '/api/corporate/collections/notes', data);
    },
    onSuccess: () => {
      toast({ title: "Note created", description: "Collection note has been saved." });
      setShowNoteDialog(false);
      setNoteContent("");
      setNoteType("general");
      setFollowUpDate("");
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'notes'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create note.", variant: "destructive" });
    },
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', `/api/corporate/collections/customer/${selectedCustomerId}/flags`, data);
    },
    onSuccess: () => {
      toast({ title: "Flags updated", description: "Customer flags have been updated." });
      setShowFlagsDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'rollup'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/collections/customer', selectedCustomerId, 'next-action'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update flags.", variant: "destructive" });
    },
  });

  const customerInvoices = selectedCustomerId 
    ? queueItems.filter(item => item.customerId === selectedCustomerId)
    : [];

  const groupedByCustomer = queueItems.reduce((acc, item) => {
    if (!acc[item.customerId]) {
      acc[item.customerId] = {
        customerId: item.customerId,
        customerName: item.customerName,
        invoices: [],
        totalBalance: 0,
        oldestDaysOverdue: 0,
      };
    }
    acc[item.customerId].invoices.push(item);
    acc[item.customerId].totalBalance += parseFloat(item.balanceDue || '0');
    acc[item.customerId].oldestDaysOverdue = Math.max(acc[item.customerId].oldestDaysOverdue, item.daysOverdue);
    return acc;
  }, {} as Record<string, { customerId: string; customerName: string; invoices: CollectionsQueueItem[]; totalBalance: number; oldestDaysOverdue: number }>);

  const customerList = Object.values(groupedByCustomer).sort((a, b) => b.oldestDaysOverdue - a.oldestDaysOverdue);

  const getBucketBadgeColor = (bucket: string) => {
    switch (bucket) {
      case '1-30': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case '31-60': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case '61-90': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case '90+': return 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100';
      default: return '';
    }
  };

  const clearFilters = () => {
    setFilters({
      overdueBucket: 'all',
      customerId: '',
      minBalance: '',
      maxBalance: '',
      isDisputed: 'all',
      assignedToUserId: '',
      lastReminderBefore: '',
      lastReminderAfter: '',
      riskTier: 'all',
    });
  };

  const hasActiveFilters = filters.overdueBucket !== 'all' || 
    filters.customerId !== '' || 
    filters.minBalance !== '' || 
    filters.maxBalance !== '' || 
    filters.isDisputed !== 'all' ||
    filters.assignedToUserId !== '' ||
    filters.lastReminderBefore !== '' ||
    filters.lastReminderAfter !== '' ||
    filters.riskTier !== 'all';

  return (
    <div className="h-full flex flex-col" data-testid="collections-workbench">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">Collections Workbench</h1>
            <p className="text-muted-foreground text-sm">Manage overdue invoices and follow-up actions</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              data-testid="toggle-filters-btn"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">!</Badge>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetchQueue()} data-testid="refresh-btn">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {missedCommitmentAlerts.length > 0 && (
          <div className="mt-3 p-3 rounded border border-destructive/30 bg-destructive/5" data-testid="missed-commitments-banner">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="font-medium text-destructive">{missedCommitmentAlerts.length} missed payment commitment{missedCommitmentAlerts.length > 1 ? 's' : ''}</span>
              <span className="text-muted-foreground">across {new Set(missedCommitmentAlerts.map((a: any) => a.customerId)).size} customer{new Set(missedCommitmentAlerts.map((a: any) => a.customerId)).size > 1 ? 's' : ''} require follow-up</span>
            </div>
          </div>
        )}

        {showFilters && (
          <Card className="mt-4">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div>
                  <Label>Overdue Bucket</Label>
                  <Select value={filters.overdueBucket} onValueChange={(v) => setFilters(prev => ({ ...prev, overdueBucket: v }))}>
                    <SelectTrigger data-testid="filter-bucket">
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {OVERDUE_BUCKETS.map(bucket => (
                        <SelectItem key={bucket.value} value={bucket.value}>{bucket.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Min Balance</Label>
                  <Input 
                    type="number" 
                    placeholder="$0" 
                    value={filters.minBalance}
                    onChange={(e) => setFilters(prev => ({ ...prev, minBalance: e.target.value }))}
                    data-testid="filter-min-balance"
                  />
                </div>
                <div>
                  <Label>Max Balance</Label>
                  <Input 
                    type="number" 
                    placeholder="No limit" 
                    value={filters.maxBalance}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxBalance: e.target.value }))}
                    data-testid="filter-max-balance"
                  />
                </div>
                <div>
                  <Label>Disputed</Label>
                  <Select value={filters.isDisputed} onValueChange={(v) => setFilters(prev => ({ ...prev, isDisputed: v }))}>
                    <SelectTrigger data-testid="filter-disputed">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="true">Disputed Only</SelectItem>
                      <SelectItem value="false">Not Disputed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Risk Tier</Label>
                  <Select value={filters.riskTier} onValueChange={(v) => setFilters(prev => ({ ...prev, riskTier: v }))}>
                    <SelectTrigger data-testid="filter-risk-tier">
                      <SelectValue placeholder="All Tiers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tiers</SelectItem>
                      <SelectItem value="healthy">Healthy</SelectItem>
                      <SelectItem value="watchlist">Watchlist</SelectItem>
                      <SelectItem value="at_risk">At Risk</SelectItem>
                      <SelectItem value="collections_candidate">Collections Candidate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assigned Owner</Label>
                  <Input 
                    type="text" 
                    placeholder="User ID" 
                    value={filters.assignedToUserId}
                    onChange={(e) => setFilters(prev => ({ ...prev, assignedToUserId: e.target.value }))}
                    data-testid="filter-assigned-owner"
                  />
                </div>
                <div>
                  <Label>Last Reminder After</Label>
                  <Input 
                    type="date" 
                    value={filters.lastReminderAfter}
                    onChange={(e) => setFilters(prev => ({ ...prev, lastReminderAfter: e.target.value }))}
                    data-testid="filter-reminder-after"
                  />
                </div>
                <div>
                  <Label>Last Reminder Before</Label>
                  <Input 
                    type="date" 
                    value={filters.lastReminderBefore}
                    onChange={(e) => setFilters(prev => ({ ...prev, lastReminderBefore: e.target.value }))}
                    data-testid="filter-reminder-before"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-btn">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/3 border-r overflow-y-auto p-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Customers with Overdue Invoices ({customerList.length})
            </div>
            {queueLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : customerList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="font-medium">No Overdue Invoices</p>
                  <p className="text-sm text-muted-foreground">All invoices are current</p>
                </CardContent>
              </Card>
            ) : (
              customerList.map((customer) => (
                <Card 
                  key={customer.customerId}
                  className={`cursor-pointer transition-colors hover-elevate ${selectedCustomerId === customer.customerId ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedCustomerId(customer.customerId)}
                  data-testid={`customer-card-${customer.customerId}`}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{customer.customerName}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{customer.invoices.length} invoice{customer.invoices.length !== 1 ? 's' : ''}</span>
                          <span className="font-semibold text-foreground">${customer.totalBalance.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={getBucketBadgeColor(
                          customer.oldestDaysOverdue > 90 ? '90+' :
                          customer.oldestDaysOverdue > 60 ? '61-90' :
                          customer.oldestDaysOverdue > 30 ? '31-60' : '1-30'
                        )}>
                          {customer.oldestDaysOverdue}d
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedCustomerId ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <User className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium">Select a Customer</p>
                <p className="text-sm text-muted-foreground">Choose a customer from the list to view details and take action</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {rollupLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : customerRollup && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <CardTitle className="text-lg">{customerInvoices[0]?.customerName || 'Customer'}</CardTitle>
                        <CardDescription>Account Overview</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowFlagsDialog(true)} data-testid="manage-flags-btn">
                          <Flag className="h-4 w-4 mr-1" />
                          Flags
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowNoteDialog(true)} data-testid="add-note-btn">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Note
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Open Balance</div>
                        <div className="text-2xl font-bold">${customerRollup.openBalance}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Overdue Invoices</div>
                        <div className="text-2xl font-bold">{customerRollup.overdueInvoiceCount}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Oldest Invoice Age</div>
                        <div className="text-2xl font-bold">{customerRollup.oldestInvoiceAge} days</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Last Payment</div>
                        <div className="text-lg font-medium">
                          {customerRollup.lastPaymentDate 
                            ? new Date(customerRollup.lastPaymentDate).toLocaleDateString()
                            : 'None'}
                        </div>
                      </div>
                    </div>

                    {customerRollup.agingBreakdown && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-sm font-medium mb-2">Aging Breakdown</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-900/20">
                            <div className="text-muted-foreground text-xs">1-30 Days</div>
                            <div className="font-medium">{customerRollup.agingBreakdown.days1to30.count} inv</div>
                            <div className="text-sm">${customerRollup.agingBreakdown.days1to30.amount}</div>
                          </div>
                          <div className="p-2 rounded bg-orange-50 dark:bg-orange-900/20">
                            <div className="text-muted-foreground text-xs">31-60 Days</div>
                            <div className="font-medium">{customerRollup.agingBreakdown.days31to60.count} inv</div>
                            <div className="text-sm">${customerRollup.agingBreakdown.days31to60.amount}</div>
                          </div>
                          <div className="p-2 rounded bg-red-50 dark:bg-red-900/20">
                            <div className="text-muted-foreground text-xs">61-90 Days</div>
                            <div className="font-medium">{customerRollup.agingBreakdown.days61to90.count} inv</div>
                            <div className="text-sm">${customerRollup.agingBreakdown.days61to90.amount}</div>
                          </div>
                          <div className="p-2 rounded bg-red-100 dark:bg-red-900/40">
                            <div className="text-muted-foreground text-xs">90+ Days</div>
                            <div className="font-medium">{customerRollup.agingBreakdown.over90.count} inv</div>
                            <div className="text-sm">${customerRollup.agingBreakdown.over90.amount}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {customerRollup.paymentMetrics && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-sm font-medium mb-2">Payment Behavior</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">On-Time Rate:</span>
                            <span className="ml-1 font-medium">{customerRollup.paymentMetrics.pctOnTime || 'N/A'}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Avg Days to Pay:</span>
                            <span className="ml-1 font-medium">{customerRollup.paymentMetrics.avgDaysToPay || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Dispute Rate:</span>
                            <span className="ml-1 font-medium">{customerRollup.paymentMetrics.disputeRate || '0'}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">DSO Trend:</span>
                            <span className="ml-1 font-medium">{customerRollup.paymentMetrics.dsoTrendDirection || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Assigned Owner:</span>
                        <span className="font-medium">
                          {customerRollup.assignedOwner || 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Last Reminder:</span>
                        <span className="font-medium">
                          {customerRollup.lastReminderSent 
                            ? new Date(customerRollup.lastReminderSent).toLocaleDateString()
                            : 'Never'
                          }
                        </span>
                        {customerRollup.reminderCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {customerRollup.reminderCount} sent
                          </Badge>
                        )}
                      </div>
                    </div>

                    {customerFlags && (customerFlags.achOnlyFlag || customerFlags.requirePrepayFlag || customerFlags.escalatedToCollections) && (
                      <div className="mt-4 pt-4 border-t flex gap-2 flex-wrap">
                        {customerFlags.achOnlyFlag && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
                            <DollarSign className="h-3 w-3 mr-1" /> ACH Only
                          </Badge>
                        )}
                        {customerFlags.requirePrepayFlag && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200">
                            <Flag className="h-3 w-3 mr-1" /> Prepay Required
                          </Badge>
                        )}
                        {customerFlags.escalatedToCollections && (
                          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100">
                            <AlertTriangle className="h-3 w-3 mr-1" /> In Collections
                          </Badge>
                        )}
                      </div>
                    )}

                    {customerCommitments.length > 0 && (() => {
                      const missedIds = new Set(missedCommitmentAlerts.filter((a: any) => a.customerId === selectedCustomerId).map((a: any) => a.id));
                      const missedForCustomer = customerCommitments.filter((c: any) => missedIds.has(c.id));
                      return (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-sm font-medium mb-2 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Payment Commitments
                          {missedForCustomer.length > 0 && (
                            <Badge variant="destructive" className="text-xs" data-testid="badge-missed-commitments">
                              {missedForCustomer.length} missed
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {customerCommitments.slice(0, 5).map((c: any) => {
                            const isMissed = missedIds.has(c.id);
                            return (
                              <div key={c.id} className={`flex items-center justify-between gap-2 flex-wrap text-sm p-2 rounded ${isMissed ? 'bg-red-50 dark:bg-red-900/20' : 'bg-muted'}`} data-testid={`commitment-item-${c.id}`}>
                                <div className="flex items-center gap-2">
                                  {isMissed && <AlertCircle className="h-3 w-3 text-destructive" />}
                                  <span className="font-medium">${parseFloat(c.promisedAmount || '0').toLocaleString()}</span>
                                  <span className="text-muted-foreground">by {new Date(c.promisedDate + 'T00:00:00').toLocaleDateString()}</span>
                                </div>
                                <Badge variant={
                                  c.status === 'kept' ? 'default' :
                                  c.status === 'missed' || isMissed ? 'destructive' :
                                  'secondary'
                                } className="text-xs">
                                  {isMissed ? 'Overdue' : c.status}
                                </Badge>
                              </div>
                            );
                          })}
                          {customerCommitments.length > 5 && (
                            <p className="text-xs text-muted-foreground">+ {customerCommitments.length - 5} more</p>
                          )}
                        </div>
                      </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {actionLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : nextAction && (
                <Card className={`border-l-4 ${
                  nextAction.priority === 'critical' ? 'border-l-red-500' :
                  nextAction.priority === 'high' ? 'border-l-orange-500' :
                  nextAction.priority === 'medium' ? 'border-l-yellow-500' : 'border-l-green-500'
                }`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Next Best Action</CardTitle>
                      <Badge className={PRIORITY_COLORS[nextAction.priority] || ''}>{nextAction.priority}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        {ACTION_LABELS[nextAction.action] && (
                          <>
                            <div className={`p-2 rounded-full ${ACTION_LABELS[nextAction.action].color}`}>
                              {(() => {
                                const Icon = ACTION_LABELS[nextAction.action].icon;
                                return <Icon className="h-5 w-5 text-white" />;
                              })()}
                            </div>
                            <div>
                              <div className="font-medium">{ACTION_LABELS[nextAction.action].label}</div>
                              <div className="text-sm text-muted-foreground">{nextAction.reason}</div>
                            </div>
                          </>
                        )}
                      </div>
                      {nextAction.action !== 'no_action_needed' && (
                        <Button size="sm" data-testid="take-action-btn">
                          Take Action <ArrowUpRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="invoices" className="w-full">
                <TabsList>
                  <TabsTrigger value="invoices" data-testid="tab-invoices">
                    <FileText className="h-4 w-4 mr-1" /> Invoices ({customerInvoices.length})
                  </TabsTrigger>
                  <TabsTrigger value="notes" data-testid="tab-notes">
                    <Clock className="h-4 w-4 mr-1" /> Notes ({customerNotes.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="mt-4">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Days Overdue</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Risk Tier</TableHead>
                          <TableHead>Last Reminder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerInvoices.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              No overdue invoices
                            </TableCell>
                          </TableRow>
                        ) : customerInvoices.map((invoice) => (
                          <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                            <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                            <TableCell>
                              <Badge className={getBucketBadgeColor(invoice.overdueBucket)}>
                                {invoice.daysOverdue} days
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">${invoice.balanceDue}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Badge variant="outline">{invoice.status}</Badge>
                                {invoice.isDisputed && (
                                  <Badge variant="destructive" className="text-xs">Disputed</Badge>
                                )}
                                {(invoice as any).slaStatus === 'breach' && (
                                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 text-xs" data-testid={`badge-sla-breach-${invoice.id}`}>SLA Breach</Badge>
                                )}
                                {(invoice as any).slaStatus === 'at_risk' && (
                                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300 text-xs" data-testid={`badge-sla-atrisk-${invoice.id}`}>At Risk</Badge>
                                )}
                                {(invoice as any).escalationRequired && (
                                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 text-xs" data-testid={`badge-escalation-${invoice.id}`}>Escalation</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                            <TableCell>
                              {invoice.aiTier ? (
                                <Badge 
                                  className={`text-xs ${
                                    invoice.aiTier === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                    invoice.aiTier === 'watchlist' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                    invoice.aiTier === 'at_risk' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  }`}
                                  data-testid="badge-queue-tier"
                                >
                                  {invoice.aiTier === 'healthy' ? 'Healthy' :
                                   invoice.aiTier === 'watchlist' ? 'Watchlist' :
                                   invoice.aiTier === 'at_risk' ? 'At Risk' :
                                   'Collections'}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">--</span>
                              )}
                            </TableCell>
                              {invoice.lastSentAt 
                                ? new Date(invoice.lastSentAt).toLocaleDateString()
                                : invoice.sentAt
                                  ? new Date(invoice.sentAt).toLocaleDateString()
                                  : 'Never'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <Card>
                    <CardContent className="py-4">
                      {notesLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : customerNotes.length === 0 ? (
                        <div className="text-center py-8">
                          <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                          <p className="font-medium">No Notes Yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Add notes to track collection activities</p>
                          <Button size="sm" onClick={() => setShowNoteDialog(true)}>
                            <Plus className="h-4 w-4 mr-1" /> Add First Note
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {customerNotes.map((note) => (
                            <div key={note.id} className="border rounded-lg p-3" data-testid={`note-${note.id}`}>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <Badge variant="outline">{note.noteType.replace('_', ' ')}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(note.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm">{note.content}</p>
                              {note.followUpDate && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  Follow-up: {new Date(note.followUpDate).toLocaleDateString()}
                                  {note.followUpCompleted && (
                                    <Badge variant="secondary" className="ml-2 text-xs">Completed</Badge>
                                  )}
                                </div>
                              )}
                              {note.actionTaken && (
                                <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                                  Action taken: {note.actionTaken}
                                </div>
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
          )}
        </div>
      </div>

      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Collection Note</DialogTitle>
            <DialogDescription>Record notes and follow-up actions for this customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Note Type</Label>
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger data-testid="note-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note Content</Label>
              <Textarea 
                placeholder="Enter note details..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={4}
                data-testid="note-content-input"
              />
            </div>
            <div>
              <Label>Follow-up Date (optional)</Label>
              <Input 
                type="date" 
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                data-testid="follow-up-date-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (selectedCustomerId && noteContent) {
                  createNoteMutation.mutate({
                    customerId: selectedCustomerId,
                    noteType,
                    content: noteContent,
                    followUpDate: followUpDate || undefined,
                  });
                }
              }}
              disabled={!noteContent || createNoteMutation.isPending}
              data-testid="save-note-btn"
            >
              {createNoteMutation.isPending ? 'Saving...' : 'Save Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFlagsDialog} onOpenChange={setShowFlagsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Customer Flags</DialogTitle>
            <DialogDescription>Set payment restrictions and escalation status</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">ACH Only</Label>
                <p className="text-sm text-muted-foreground">Restrict payment methods to ACH only</p>
              </div>
              <Checkbox 
                checked={customerFlags?.achOnlyFlag || false}
                onCheckedChange={(checked) => {
                  updateFlagsMutation.mutate({ achOnlyFlag: !!checked });
                }}
                data-testid="ach-only-checkbox"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Require Prepayment</Label>
                <p className="text-sm text-muted-foreground">Customer must prepay before service</p>
              </div>
              <Checkbox 
                checked={customerFlags?.requirePrepayFlag || false}
                onCheckedChange={(checked) => {
                  updateFlagsMutation.mutate({ requirePrepayFlag: !!checked });
                }}
                data-testid="prepay-checkbox"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Escalated to Collections</Label>
                <p className="text-sm text-muted-foreground">Account sent to collections agency</p>
              </div>
              <Checkbox 
                checked={customerFlags?.escalatedToCollections || false}
                onCheckedChange={(checked) => {
                  updateFlagsMutation.mutate({ escalatedToCollections: !!checked });
                }}
                data-testid="escalated-checkbox"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlagsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
