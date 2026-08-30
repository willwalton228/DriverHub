import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  DollarSign, 
  Check, 
  FileText, 
  Plus,
  AlertCircle,
  Loader2,
  Eye
} from "lucide-react";
import { Link } from "wouter";

interface InvoiceCandidate {
  id: string;
  invoiceId: string | null;
  customerId: string;
  moveId: string | null;
  driverId: string | null;
  serviceType: string;
  description: string | null;
  amount: string;
  currency: string | null;
  status: string;
  supportingEventIds: string[] | string;
  proofRefs: any[] | string;
  rateCardId: string | null;
  baseRate: string | null;
  addOns: any[] | string;
  approvedBy: string | null;
  approvedAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  adjustments?: InvoiceAdjustment[];
}

interface InvoiceAdjustment {
  id: string;
  invoiceId: string | null;
  candidateId: string | null;
  moveId: string | null;
  adjustmentType: string;
  amount: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

interface BillingSummary {
  draft: { count: number; amount: string };
  approved: { count: number; amount: string };
  issued: { count: number; amount: string };
}

export default function InvoiceCandidates() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCandidate, setSelectedCandidate] = useState<InvoiceCandidate | null>(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const { data: candidates = [], isLoading } = useQuery<InvoiceCandidate[]>({
    queryKey: ['/api/billing/candidates', statusFilter],
    queryFn: async () => {
      const url = statusFilter !== "all" 
        ? `/api/billing/candidates?status=${statusFilter}`
        : '/api/billing/candidates';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch candidates');
      return response.json();
    },
  });

  const { data: summary } = useQuery<BillingSummary>({
    queryKey: ['/api/billing/summary'],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/billing/candidates/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey as string[];
          return key[0]?.startsWith('/api/billing');
        }
      });
      toast({ title: "Candidate approved" });
    },
    onError: () => {
      toast({ title: "Failed to approve candidate", variant: "destructive" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('POST', `/api/billing/candidates/${id}/adjust`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey as string[];
          return key[0]?.startsWith('/api/billing');
        }
      });
      setShowAdjustDialog(false);
      setAdjustmentType("");
      setAdjustmentAmount("");
      setAdjustmentReason("");
      toast({ title: "Adjustment created" });
    },
    onError: () => {
      toast({ title: "Failed to create adjustment", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'approved':
        return <Badge className="bg-green-600 text-white">Approved</Badge>;
      case 'issued':
        return <Badge className="bg-blue-600 text-white">Issued</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: string | null) => {
    if (!amount) return '$0.00';
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleAdjust = () => {
    if (!selectedCandidate) return;
    adjustMutation.mutate({
      id: selectedCandidate.id,
      data: {
        adjustmentType,
        amount: parseFloat(adjustmentAmount),
        reason: adjustmentReason,
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoice Line Candidates</h1>
          <p className="text-muted-foreground">Review and approve billable items from completed moves</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.draft.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.draft.amount || '0')} pending review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <Check className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.approved.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.approved.amount || '0')} ready to invoice
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issued</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.issued.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.issued.amount || '0')} invoiced
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Candidates</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No invoice candidates found</p>
              <p className="text-sm text-muted-foreground">
                Candidates are automatically created when moves are completed
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Move</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.id} data-testid={`row-candidate-${candidate.id}`}>
                    <TableCell>
                      {candidate.moveId ? (
                        <Link href={`/corporate/trips/${candidate.moveId}`}>
                          <span className="text-primary hover:underline cursor-pointer">
                            {candidate.moveId.slice(0, 8)}...
                          </span>
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {candidate.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{candidate.serviceType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(candidate.amount)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(candidate.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(candidate.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedCandidate(candidate)}
                          data-testid={`button-view-${candidate.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {candidate.status === 'draft' && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setSelectedCandidate(candidate);
                                setShowAdjustDialog(true);
                              }}
                              data-testid={`button-adjust-${candidate.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleApprove(candidate.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${candidate.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCandidate && !showAdjustDialog} onOpenChange={() => setSelectedCandidate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice Candidate Details</DialogTitle>
          </DialogHeader>
          {selectedCandidate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Move ID</Label>
                  <p className="font-mono text-sm">{selectedCandidate.moveId || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p>{getStatusBadge(selectedCandidate.status)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Service Type</Label>
                  <p>{selectedCandidate.serviceType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Amount</Label>
                  <p className="font-mono text-lg font-bold">{formatCurrency(selectedCandidate.amount)}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p>{selectedCandidate.description || '-'}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Supporting Events</Label>
                <p className="text-sm text-muted-foreground">
                  {Array.isArray(selectedCandidate.supportingEventIds) 
                    ? selectedCandidate.supportingEventIds.length 
                    : JSON.parse(selectedCandidate.supportingEventIds || '[]').length} linked events
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Proof References</Label>
                <p className="text-sm text-muted-foreground">
                  {Array.isArray(selectedCandidate.proofRefs) 
                    ? selectedCandidate.proofRefs.length 
                    : JSON.parse(selectedCandidate.proofRefs || '[]').length} proofs attached
                </p>
              </div>

              {selectedCandidate.approvedAt && (
                <div>
                  <Label className="text-muted-foreground">Approved</Label>
                  <p className="text-sm">{new Date(selectedCandidate.approvedAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCandidate(null)}>
              Close
            </Button>
            {selectedCandidate?.status === 'draft' && (
              <Button onClick={() => handleApprove(selectedCandidate.id)}>
                Approve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger data-testid="select-adjustment-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Discount</SelectItem>
                  <SelectItem value="fee">Additional Fee</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="Enter amount (negative for credit)"
                data-testid="input-adjustment-amount"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="Explain the reason for this adjustment"
                data-testid="input-adjustment-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAdjust}
              disabled={!adjustmentType || !adjustmentAmount || !adjustmentReason || adjustMutation.isPending}
              data-testid="button-submit-adjustment"
            >
              {adjustMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
