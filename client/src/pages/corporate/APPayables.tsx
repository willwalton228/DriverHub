
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Inbox, FileText, AlertTriangle, RefreshCw, DollarSign, Search,
  Plus, Eye, CheckCircle, XCircle, AlertCircle, Clock, ArrowRight,
  Building2, Calendar, Hash, Loader2, Trash2, Upload, BarChart3, RepeatIcon,
  ThumbsUp, SendToBack, Ban, Eraser, Filter, ExternalLink,
} from "lucide-react";

type Payable = {
  id: string; vendorId?: string; vendorName?: string; invoiceNumber?: string;
  invoiceDate?: string; dueDate?: string; totalAmount?: string; taxAmount?: string;
  status: string; approvalStatus: string; duplicateStatus: string;
  qbSyncStatus: string; codingStatus: string; createdFrom: string;
  isRebillable: boolean; rebillStatus?: string; glAccount?: string;
  department?: string; notes?: string; extractedVendorName?: string;
  createdAt: string; updatedAt?: string; paymentTerms?: string;
  customerName?: string; billingDescription?: string;
};

type InboxMessage = {
  id: string; fromEmail: string; subject?: string; receivedAt: string;
  processedStatus: string; vendorName?: string; attachmentCount?: number;
  confidenceScore?: string; exceptionReason?: string;
};

type ApStats = {
  totalPayables: number; pendingReview: number; approved: number;
  exceptions: number; probableDuplicates: number; notSynced: number;
  syncFailed: number; inboxNew: number; inboxExceptions: number; rebillableQueued: number;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    exception: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    rejected: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    processed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    synced: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    not_synced: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    probable_duplicate: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    clear: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    coded: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    uncoded: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    partially_coded: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    queued_for_invoice: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    billed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return map[status] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

function fmtStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtCurrency(val?: string | null) {
  if (!val) return "—";
  return "$" + parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

const defaultPayableForm = {
  vendorId: "", invoiceNumber: "", invoiceDate: "", dueDate: "",
  totalAmount: "", taxAmount: "", paymentTerms: "", status: "pending_review",
  createdFrom: "manual", glAccount: "", department: "", classCode: "",
  location: "", codingNotes: "", notes: "", isRebillable: false,
};

const defaultInboxForm = {
  fromEmail: "", subject: "", emailBodyText: "", attachmentCount: "0",
};

export default function APPayables() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("inbox");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createPayableOpen, setCreatePayableOpen] = useState(false);
  const [createInboxOpen, setCreateInboxOpen] = useState(false);
  const [payableForm, setPayableForm] = useState({ ...defaultPayableForm });
  const [inboxForm, setInboxForm] = useState({ ...defaultInboxForm });
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [rebillStatusFilter, setRebillStatusFilter] = useState("all");
  const [rebillNoteDialogOpen, setRebillNoteDialogOpen] = useState(false);
  const [rebillNoteAction, setRebillNoteAction] = useState<{ id: string; action: string } | null>(null);
  const [rebillActionNote, setRebillActionNote] = useState("");

  const { data: stats } = useQuery<ApStats>({ queryKey: ["/api/ap-stats"] });

  const { data: inboxMessages = [], isLoading: inboxLoading } = useQuery<InboxMessage[]>({
    queryKey: ["/api/ap-inbox"],
  });

  const { data: allPayables = [], isLoading: payablesLoading } = useQuery<Payable[]>({
    queryKey: ["/api/payables"],
  });

  const { data: payableDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/payables", selectedPayable?.id],
    queryFn: () => apiRequest("GET", `/api/payables/${selectedPayable?.id}`).then(r => r.json()),
    enabled: !!selectedPayable?.id && detailOpen,
  });

  const { data: rebillableCharges = [], isLoading: rebillableLoading } = useQuery<any[]>({
    queryKey: ["/api/rebillable-charges"],
  });

  const { data: rebillableStats } = useQuery<any>({
    queryKey: ["/api/rebillable-stats"],
  });

  const { data: vendorList = [] } = useQuery<any[]>({ queryKey: ["/api/vendors"] });

  const createPayableMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/payables", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      setCreatePayableOpen(false);
      setPayableForm({ ...defaultPayableForm });
      toast({ title: "Payable created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createInboxMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ap-inbox", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ap-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      setCreateInboxOpen(false);
      setInboxForm({ ...defaultInboxForm });
      toast({ title: "Inbox message added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePayableMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/payables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      toast({ title: "Payable updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/payables/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      toast({ title: "Payable approved" });
    },
    onError: (e: any) => toast({ title: "Cannot approve", description: e.message, variant: "destructive" }),
  });

  const rebillApproveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest("POST", `/api/payables/${id}/approve-for-billing`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      setRebillNoteDialogOpen(false); setRebillActionNote("");
      toast({ title: "Charge approved for billing" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rebillQueueMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest("POST", `/api/payables/${id}/queue-for-invoice`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      setRebillNoteDialogOpen(false); setRebillActionNote("");
      toast({ title: "Charge queued for next invoice" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rebillDisputeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("POST", `/api/payables/${id}/dispute`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-stats"] });
      setRebillNoteDialogOpen(false); setRebillActionNote("");
      toast({ title: "Charge marked as disputed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rebillWriteOffMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("POST", `/api/payables/${id}/write-off`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rebillable-stats"] });
      setRebillNoteDialogOpen(false); setRebillActionNote("");
      toast({ title: "Charge written off" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openRebillAction(id: string, action: string) {
    setRebillNoteAction({ id, action });
    setRebillActionNote("");
    setRebillNoteDialogOpen(true);
  }

  function executeRebillAction() {
    if (!rebillNoteAction) return;
    const { id, action } = rebillNoteAction;
    if (action === "approve-for-billing") rebillApproveMutation.mutate({ id, notes: rebillActionNote });
    else if (action === "queue-for-invoice") rebillQueueMutation.mutate({ id, notes: rebillActionNote });
    else if (action === "dispute") rebillDisputeMutation.mutate({ id, reason: rebillActionNote });
    else if (action === "write-off") rebillWriteOffMutation.mutate({ id, reason: rebillActionNote });
  }

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/payables/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      setRejectDialogOpen(false);
      setRejectReason("");
      toast({ title: "Payable rejected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const overrideDupeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/payables/${id}/override-duplicate`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      setOverrideDialogOpen(false);
      setOverrideReason("");
      toast({ title: "Duplicate override applied" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const qbSyncMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/payables/${id}/qb-sync`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      toast({ title: "Synced to QuickBooks" });
    },
    onError: (e: any) => toast({ title: "QB Sync failed", description: e.message, variant: "destructive" }),
  });

  const dupCheckMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/payables/${id}/run-duplicate-check`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      if (data.matches?.length > 0) {
        toast({ title: `${data.matches.length} potential duplicate(s) found`, description: `Status: ${fmtStatus(data.duplicateStatus)}`, variant: "destructive" });
      } else {
        toast({ title: "No duplicates found" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => apiRequest("DELETE", `/api/payable-documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      toast({ title: "Document removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const uploadDocMutation = useMutation({
    mutationFn: async ({ payableId, file }: { payableId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`/api/payables/${payableId}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) throw new Error(await resp.text());
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables", selectedPayable?.id] });
      setUploadDialogOpen(false);
      setUploadingFile(null);
      toast({ title: "Document uploaded" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteInboxMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ap-inbox/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ap-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap-stats"] });
      toast({ title: "Message removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openDetail(p: Payable) {
    setSelectedPayable(p);
    setDetailOpen(true);
  }

  const filteredPayables = allPayables.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.invoiceNumber?.toLowerCase().includes(q) ||
      p.vendorName?.toLowerCase().includes(q) || p.extractedVendorName?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingPayables = filteredPayables.filter(p => p.status === "pending_review");
  const approvedPayables = filteredPayables.filter(p => p.approvalStatus === "approved");
  const exceptionPayables = filteredPayables.filter(p => p.status === "exception" || p.duplicateStatus === "probable_duplicate");
  const qbQueue = allPayables.filter(p => p.approvalStatus === "approved" && (p.qbSyncStatus === "not_synced" || p.qbSyncStatus === "failed"));

  return (
    <div className="flex flex-col">
      <div className="p-6 border-b bg-background flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AP Payables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Accounts Payable intake, review, and QuickBooks sync</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setCreateInboxOpen(true)} data-testid="button-add-inbox">
            <Inbox className="w-4 h-4 mr-2" /> Add Inbox Message
          </Button>
          <Button onClick={() => setCreatePayableOpen(true)} data-testid="button-create-payable">
            <Plus className="w-4 h-4 mr-2" /> Create Payable
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex flex-wrap gap-3 px-6 py-4 border-b bg-background">
          {[
            { label: "Inbox (New)", value: stats.inboxNew, icon: Inbox, color: "text-blue-600" },
            { label: "Pending Review", value: stats.pendingReview, icon: Clock, color: "text-yellow-600" },
            { label: "Exceptions", value: stats.exceptions + stats.inboxExceptions, icon: AlertCircle, color: "text-red-600" },
            { label: "Duplicates", value: stats.probableDuplicates, icon: AlertTriangle, color: "text-orange-600" },
            { label: "QB Queue", value: stats.notSynced, icon: RefreshCw, color: "text-purple-600" },
            { label: "Rebillable Queue", value: stats.rebillableQueued, icon: RepeatIcon, color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-sm">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-muted-foreground">{s.label}:</span>
              <span className="font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <TabsList>
              <TabsTrigger value="inbox" data-testid="tab-ap-inbox">AP Inbox</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">Pending Review</TabsTrigger>
              <TabsTrigger value="exceptions" data-testid="tab-exceptions">Exceptions</TabsTrigger>
              <TabsTrigger value="qb-sync" data-testid="tab-qb-sync">QB Sync Queue</TabsTrigger>
              <TabsTrigger value="rebillable" data-testid="tab-rebillable">Rebillable</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">All Payables</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-8 w-48" data-testid="input-ap-search" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AP INBOX TAB */}
          <TabsContent value="inbox">
            <Card>
              <CardContent className="p-0">
                {inboxLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : inboxMessages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No inbox messages</p>
                    <p className="text-sm mt-1">Use the "Add Inbox Message" button to simulate email intake</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">From</th>
                        <th className="text-left px-4 py-3 font-medium">Subject</th>
                        <th className="text-left px-4 py-3 font-medium">Received</th>
                        <th className="text-left px-4 py-3 font-medium">Vendor Match</th>
                        <th className="text-left px-4 py-3 font-medium">Attachments</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inboxMessages.map(msg => (
                        <tr key={msg.id} className="border-b hover-elevate" data-testid={`row-inbox-${msg.id}`}>
                          <td className="px-4 py-3 font-mono text-xs">{msg.fromEmail}</td>
                          <td className="px-4 py-3">{msg.subject || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDate(msg.receivedAt)}</td>
                          <td className="px-4 py-3">
                            {msg.vendorName ? (
                              <span className="text-green-600 dark:text-green-400 font-medium">{msg.vendorName}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Unmatched</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{msg.attachmentCount ?? 0}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(msg.processedStatus)}`}>
                              {fmtStatus(msg.processedStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="icon" variant="ghost" onClick={() => deleteInboxMutation.mutate(msg.id)} data-testid={`button-delete-inbox-${msg.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PENDING REVIEW TAB */}
          <TabsContent value="pending">
            <PayableTable
              payables={pendingPayables} loading={payablesLoading}
              onView={openDetail} onApprove={id => approveMutation.mutate(id)}
              onRunDupeCheck={id => dupCheckMutation.mutate(id)}
              approving={approveMutation.isPending} emptyLabel="No pending payables"
            />
          </TabsContent>

          {/* EXCEPTIONS TAB */}
          <TabsContent value="exceptions">
            <PayableTable
              payables={exceptionPayables} loading={payablesLoading}
              onView={openDetail} onApprove={id => approveMutation.mutate(id)}
              onRunDupeCheck={id => dupCheckMutation.mutate(id)}
              approving={approveMutation.isPending} emptyLabel="No exceptions"
            />
          </TabsContent>

          {/* QB SYNC QUEUE TAB */}
          <TabsContent value="qb-sync">
            <Card>
              <CardContent className="p-0">
                {qbQueue.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>All approved payables are synced</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Vendor</th>
                        <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                        <th className="text-left px-4 py-3 font-medium">Amount</th>
                        <th className="text-left px-4 py-3 font-medium">QB Status</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qbQueue.map(p => (
                        <tr key={p.id} className="border-b hover-elevate" data-testid={`row-qb-${p.id}`}>
                          <td className="px-4 py-3">{p.vendorName || p.extractedVendorName || "Unknown"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.invoiceNumber || "—"}</td>
                          <td className="px-4 py-3 font-semibold">{fmtCurrency(p.totalAmount)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.qbSyncStatus)}`}>
                              {fmtStatus(p.qbSyncStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openDetail(p)} data-testid={`button-view-qb-${p.id}`}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> View
                            </Button>
                            <Button size="sm" onClick={() => qbSyncMutation.mutate(p.id)} disabled={qbSyncMutation.isPending} data-testid={`button-qb-sync-${p.id}`}>
                              <RefreshCw className="w-3.5 h-3.5 mr-1" />
                              {p.qbSyncStatus === "failed" ? "Retry" : "Sync to QB"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* REBILLABLE PASS-THROUGH TAB */}
          <TabsContent value="rebillable">
            {/* Stats bar */}
            {rebillableStats && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Pending Review", value: rebillableStats.pendingReview, color: "text-yellow-600" },
                  { label: "Approved", value: rebillableStats.approvedForBilling, color: "text-blue-600" },
                  { label: "Queued for Invoice", value: rebillableStats.queuedForInvoice, color: "text-purple-600" },
                  { label: "Unbilled Total", value: `$${Number(rebillableStats.totalUnbilledAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-green-600" },
                ].map(s => (
                  <Card key={s.label}>
                    <CardContent className="p-3 text-center">
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={rebillStatusFilter} onValueChange={setRebillStatusFilter}>
                <SelectTrigger className="w-44" data-testid="select-rebill-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved_for_billing">Approved for Billing</SelectItem>
                  <SelectItem value="queued_for_invoice">Queued for Invoice</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                  <SelectItem value="written_off">Written Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardContent className="p-0">
                {rebillableLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : (() => {
                  const filteredRebill = rebillableCharges.filter(p =>
                    rebillStatusFilter === "all" || p.rebillStatus === rebillStatusFilter
                  );
                  if (filteredRebill.length === 0) return (
                    <div className="text-center py-12 text-muted-foreground">
                      <RepeatIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No rebillable charges found</p>
                      <p className="text-sm mt-1">Mark vendor charges as rebillable in the Payable Detail screen</p>
                    </div>
                  );
                  return (
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Vendor</th>
                          <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                          <th className="text-left px-4 py-3 font-medium">Customer</th>
                          <th className="text-left px-4 py-3 font-medium">Rebill Amt</th>
                          <th className="text-left px-4 py-3 font-medium">Markup</th>
                          <th className="text-left px-4 py-3 font-medium">Status</th>
                          <th className="text-left px-4 py-3 font-medium">Related To</th>
                          <th className="text-right px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRebill.map((p: any) => (
                          <tr key={p.id} className="border-b hover-elevate" data-testid={`row-rebill-${p.id}`}>
                            <td className="px-4 py-3">{p.vendorName || "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs">{p.invoiceNumber || "—"}</td>
                            <td className="px-4 py-3">{p.customerName || "—"}</td>
                            <td className="px-4 py-3 font-semibold">{fmtCurrency(p.rebillAmount ?? p.totalAmount)}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {p.markupType === "flat" ? `+$${p.markupValue}` :
                                p.markupType === "percent" ? `+${p.markupValue}%` : "None"}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.rebillStatus || "")}`}>
                                {fmtStatus(p.rebillStatus || "—")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {p.relatedRecordType ? `${fmtStatus(p.relatedRecordType)} #${p.relatedRecordId || ""}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openDetail(p)} data-testid={`button-view-rebill-${p.id}`}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {p.rebillStatus === "pending_review" && (
                                  <Button size="icon" variant="ghost" onClick={() => openRebillAction(p.id, "approve-for-billing")} data-testid={`button-approve-rebill-${p.id}`} title="Approve for Billing">
                                    <ThumbsUp className="w-4 h-4 text-green-600" />
                                  </Button>
                                )}
                                {p.rebillStatus === "approved_for_billing" && (
                                  <Button size="icon" variant="ghost" onClick={() => openRebillAction(p.id, "queue-for-invoice")} data-testid={`button-queue-rebill-${p.id}`} title="Queue for Invoice">
                                    <SendToBack className="w-4 h-4 text-purple-600" />
                                  </Button>
                                )}
                                {!["billed", "written_off", "disputed"].includes(p.rebillStatus || "") && (
                                  <>
                                    <Button size="icon" variant="ghost" onClick={() => openRebillAction(p.id, "dispute")} data-testid={`button-dispute-rebill-${p.id}`} title="Mark Disputed">
                                      <Ban className="w-4 h-4 text-orange-500" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => openRebillAction(p.id, "write-off")} data-testid={`button-writeoff-rebill-${p.id}`} title="Write Off">
                                      <Eraser className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </>
                                )}
                                {p.linkedInvoiceNumber && (
                                  <span className="text-xs text-muted-foreground ml-1 flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" /> {p.linkedInvoiceNumber}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ALL PAYABLES TAB */}
          <TabsContent value="all">
            <PayableTable
              payables={filteredPayables} loading={payablesLoading}
              onView={openDetail} onApprove={id => approveMutation.mutate(id)}
              onRunDupeCheck={id => dupCheckMutation.mutate(id)}
              approving={approveMutation.isPending} emptyLabel="No payables found"
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* PAYABLE DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payable Detail</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : payableDetail ? (
            <PayableDetailView
              payable={payableDetail}
              onApprove={() => approveMutation.mutate(payableDetail.id)}
              onReject={() => { setRejectDialogOpen(true); }}
              onQbSync={() => qbSyncMutation.mutate(payableDetail.id)}
              onDupeCheck={() => dupCheckMutation.mutate(payableDetail.id)}
              onOverrideDupe={() => setOverrideDialogOpen(true)}
              onUpload={() => setUploadDialogOpen(true)}
              onDeleteDoc={(docId: string) => deleteDocMutation.mutate(docId)}
              onUpdate={(data: any) => updatePayableMutation.mutate({ id: payableDetail.id, data })}
              onApproveForBilling={() => openRebillAction(payableDetail.id, "approve-for-billing")}
              onQueueForInvoice={() => openRebillAction(payableDetail.id, "queue-for-invoice")}
              onDisputeRebill={() => openRebillAction(payableDetail.id, "dispute")}
              onWriteOffRebill={() => openRebillAction(payableDetail.id, "write-off")}
              approving={approveMutation.isPending}
              syncing={qbSyncMutation.isPending}
              vendorList={vendorList}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* REBILL ACTION NOTE DIALOG */}
      <Dialog open={rebillNoteDialogOpen} onOpenChange={setRebillNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rebillNoteAction?.action === "approve-for-billing" && "Approve for Billing"}
              {rebillNoteAction?.action === "queue-for-invoice" && "Queue for Invoice"}
              {rebillNoteAction?.action === "dispute" && "Mark as Disputed"}
              {rebillNoteAction?.action === "write-off" && "Write Off Charge"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Notes (optional)</Label>
            <Textarea value={rebillActionNote} onChange={e => setRebillActionNote(e.target.value)}
              placeholder={
                rebillNoteAction?.action === "dispute" ? "Reason for dispute..." :
                rebillNoteAction?.action === "write-off" ? "Reason for write-off..." :
                "Add a note..."
              }
              rows={3} data-testid="input-rebill-action-note" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebillNoteDialogOpen(false)}>Cancel</Button>
            <Button
              variant={rebillNoteAction?.action === "dispute" || rebillNoteAction?.action === "write-off" ? "destructive" : "default"}
              onClick={executeRebillAction}
              disabled={rebillApproveMutation.isPending || rebillQueueMutation.isPending || rebillDisputeMutation.isPending || rebillWriteOffMutation.isPending}
              data-testid="button-confirm-rebill-action"
            >
              {(rebillApproveMutation.isPending || rebillQueueMutation.isPending || rebillDisputeMutation.isPending || rebillWriteOffMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT DIALOG */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject Payable</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..." data-testid="input-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate({ id: selectedPayable!.id, reason: rejectReason })}
              disabled={rejectMutation.isPending} data-testid="button-confirm-reject">
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OVERRIDE DUPLICATE DIALOG */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Override Duplicate Warning</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Provide a reason to override the duplicate detection and proceed with approval.</p>
          <div className="space-y-3">
            <Label>Override Reason</Label>
            <Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
              placeholder="Why is this not a duplicate?" data-testid="input-override-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => overrideDupeMutation.mutate({ id: selectedPayable!.id, reason: overrideReason })}
              disabled={overrideDupeMutation.isPending || !overrideReason} data-testid="button-confirm-override">
              {overrideDupeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UPLOAD DOCUMENT DIALOG */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-6 text-center">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">Select a file to upload</p>
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx"
                onChange={e => setUploadingFile(e.target.files?.[0] || null)}
                className="block mx-auto text-sm" data-testid="input-upload-file" />
            </div>
            {uploadingFile && (
              <p className="text-sm text-muted-foreground">Selected: {uploadingFile.name}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setUploadingFile(null); }}>Cancel</Button>
            <Button onClick={() => uploadingFile && uploadDocMutation.mutate({ payableId: selectedPayable!.id, file: uploadingFile })}
              disabled={!uploadingFile || uploadDocMutation.isPending} data-testid="button-confirm-upload">
              {uploadDocMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE PAYABLE DIALOG */}
      <Dialog open={createPayableOpen} onOpenChange={setCreatePayableOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Payable</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={payableForm.vendorId} onValueChange={v => setPayableForm(f => ({ ...f, vendorId: v }))}>
                  <SelectTrigger data-testid="select-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendorList.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input value={payableForm.invoiceNumber} onChange={e => setPayableForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder="INV-001" data-testid="input-invoice-number" />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Date</Label>
                <Input type="date" value={payableForm.invoiceDate} onChange={e => setPayableForm(f => ({ ...f, invoiceDate: e.target.value }))} data-testid="input-invoice-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={payableForm.dueDate} onChange={e => setPayableForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-due-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Total Amount</Label>
                <Input type="number" step="0.01" value={payableForm.totalAmount}
                  onChange={e => setPayableForm(f => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="0.00" data-testid="input-total-amount" />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Amount</Label>
                <Input type="number" step="0.01" value={payableForm.taxAmount}
                  onChange={e => setPayableForm(f => ({ ...f, taxAmount: e.target.value }))}
                  placeholder="0.00" data-testid="input-tax-amount" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Input value={payableForm.paymentTerms} onChange={e => setPayableForm(f => ({ ...f, paymentTerms: e.target.value }))}
                  placeholder="Net 30" data-testid="input-payment-terms" />
              </div>
              <div className="space-y-1.5">
                <Label>GL Account</Label>
                <Input value={payableForm.glAccount} onChange={e => setPayableForm(f => ({ ...f, glAccount: e.target.value }))}
                  placeholder="e.g. 6000-Expenses" data-testid="input-gl-account" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={payableForm.notes} onChange={e => setPayableForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..." data-testid="input-payable-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePayableOpen(false)}>Cancel</Button>
            <Button onClick={() => createPayableMutation.mutate(payableForm)} disabled={createPayableMutation.isPending} data-testid="button-save-payable">
              {createPayableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Payable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE INBOX MESSAGE DIALOG */}
      <Dialog open={createInboxOpen} onOpenChange={setCreateInboxOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Inbox Message</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Simulate an incoming vendor invoice email for review.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>From Email</Label>
              <Input value={inboxForm.fromEmail} onChange={e => setInboxForm(f => ({ ...f, fromEmail: e.target.value }))}
                placeholder="billing@vendor.com" data-testid="input-inbox-from" />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={inboxForm.subject} onChange={e => setInboxForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Invoice #INV-001 for services" data-testid="input-inbox-subject" />
            </div>
            <div className="space-y-1.5">
              <Label>Email Body</Label>
              <Textarea value={inboxForm.emailBodyText} onChange={e => setInboxForm(f => ({ ...f, emailBodyText: e.target.value }))}
                placeholder="Please find attached our invoice..." rows={3} data-testid="input-inbox-body" />
            </div>
            <div className="space-y-1.5">
              <Label>Attachment Count</Label>
              <Input type="number" value={inboxForm.attachmentCount} onChange={e => setInboxForm(f => ({ ...f, attachmentCount: e.target.value }))}
                placeholder="1" data-testid="input-inbox-attachments" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInboxOpen(false)}>Cancel</Button>
            <Button onClick={() => createInboxMutation.mutate({ ...inboxForm, attachmentCount: parseInt(inboxForm.attachmentCount) || 0 })}
              disabled={createInboxMutation.isPending || !inboxForm.fromEmail} data-testid="button-save-inbox">
              {createInboxMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayableTable({ payables, loading, onView, onApprove, onRunDupeCheck, approving, emptyLabel }: {
  payables: Payable[]; loading: boolean; onView: (p: Payable) => void;
  onApprove: (id: string) => void; onRunDupeCheck: (id: string) => void;
  approving: boolean; emptyLabel: string;
}) {
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (payables.length === 0) return (
    <Card><CardContent>
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>{emptyLabel}</p>
      </div>
    </CardContent></Card>
  );
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 font-medium">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium">Invoice Date</th>
              <th className="text-left px-4 py-3 font-medium">Due Date</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Duplicate</th>
              <th className="text-left px-4 py-3 font-medium">QB</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payables.map(p => (
              <tr key={p.id} className="border-b hover-elevate" data-testid={`row-payable-${p.id}`}>
                <td className="px-4 py-3 font-medium">{p.vendorName || p.extractedVendorName || <span className="text-muted-foreground text-xs">Unknown</span>}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.invoiceNumber || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.invoiceDate)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.dueDate)}</td>
                <td className="px-4 py-3 font-semibold">{fmtCurrency(p.totalAmount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.status)}`}>
                    {fmtStatus(p.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.duplicateStatus !== "clear" && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.duplicateStatus)}`}>
                      <AlertTriangle className="w-3 h-3 mr-1" />{fmtStatus(p.duplicateStatus)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.qbSyncStatus)}`}>
                    {fmtStatus(p.qbSyncStatus)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onView(p)} data-testid={`button-view-payable-${p.id}`}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    {p.status === "pending_review" && (
                      <Button size="icon" variant="ghost" onClick={() => onApprove(p.id)} disabled={approving} data-testid={`button-approve-payable-${p.id}`}>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PayableDetailView({ payable, onApprove, onReject, onQbSync, onDupeCheck, onOverrideDupe, onUpload, onDeleteDoc, onUpdate, onApproveForBilling, onQueueForInvoice, onDisputeRebill, onWriteOffRebill, approving, syncing, vendorList }: any) {
  const [editingCoding, setEditingCoding] = useState(false);
  const [editingRebill, setEditingRebill] = useState(false);
  const [codingForm, setCodingForm] = useState({
    glAccount: payable.glAccount || "", department: payable.department || "",
    classCode: payable.classCode || "", location: payable.location || "",
    codingNotes: payable.codingNotes || "",
  });
  const [rebillForm, setRebillForm] = useState({
    isRebillable: payable.isRebillable || false, rebillStatus: payable.rebillStatus || "not_rebillable",
    rebillAmount: payable.rebillAmount || "", markupType: payable.markupType || "none",
    markupValue: payable.markupValue || "", billingDescription: payable.billingDescription || "",
  });

  const statusColor: Record<string, string> = {
    approved: "text-green-600", rejected: "text-red-600", exception: "text-red-600",
    pending_review: "text-yellow-600", unapproved: "text-yellow-600",
  };

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{payable.vendorName || payable.extractedVendorName || "Unknown Vendor"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono">{payable.invoiceNumber || "No invoice number"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-base">{fmtCurrency(payable.totalAmount)}</span>
            {payable.taxAmount && <span className="text-muted-foreground text-xs">(+{fmtCurrency(payable.taxAmount)} tax)</span>}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Invoice:</span>
            <span>{fmtDate(payable.invoiceDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Due:</span>
            <span>{fmtDate(payable.dueDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Source:</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.createdFrom)}`}>
              {fmtStatus(payable.createdFrom)}
            </span>
          </div>
        </div>
      </div>

      {/* Status badges row */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Status:</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.status)}`}>{fmtStatus(payable.status)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Approval:</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.approvalStatus)}`}>{fmtStatus(payable.approvalStatus)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">QB Sync:</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.qbSyncStatus)}`}>{fmtStatus(payable.qbSyncStatus)}</span>
        </div>
        {payable.qbReferenceId && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">QB Ref:</span>
            <span className="font-mono text-xs">{payable.qbReferenceId}</span>
          </div>
        )}
      </div>

      {/* Duplicate warning */}
      {payable.duplicateStatus !== "clear" && (
        <div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3">
          <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300 font-medium text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            {payable.duplicateStatus === "probable_duplicate" ? "Probable Duplicate Detected" : "Possible Duplicate Warning"}
          </div>
          {payable.duplicateChecks?.length > 0 && (
            <ul className="text-xs text-orange-700 dark:text-orange-400 space-y-1 mt-1">
              {payable.duplicateChecks.map((d: any) => (
                <li key={d.id}>Match type: <strong>{d.matchType}</strong> — {d.matchReason}</li>
              ))}
            </ul>
          )}
          {!payable.duplicateOverriddenBy && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onOverrideDupe} data-testid="button-override-dupe">
              Override &amp; Proceed
            </Button>
          )}
          {payable.duplicateOverriddenBy && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">Override applied: {payable.duplicateOverrideReason}</p>
          )}
        </div>
      )}

      {/* QB Sync Error */}
      {payable.qbSyncStatus === "failed" && payable.qbSyncError && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          <strong>QB Sync Error:</strong> {payable.qbSyncError}
        </div>
      )}

      <Separator />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {payable.approvalStatus !== "approved" && payable.approvalStatus !== "rejected" && (
          <>
            <Button size="sm" onClick={onApprove} disabled={approving} data-testid="button-detail-approve">
              {approving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject} data-testid="button-detail-reject">
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
            </Button>
          </>
        )}
        {payable.approvalStatus === "approved" && payable.qbSyncStatus !== "synced" && (
          <Button size="sm" variant="outline" onClick={onQbSync} disabled={syncing} data-testid="button-detail-qb-sync">
            {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            {payable.qbSyncStatus === "failed" ? "Retry QB Sync" : "Sync to QuickBooks"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onDupeCheck} data-testid="button-detail-dupe-check">
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Run Duplicate Check
        </Button>
        <Button size="sm" variant="outline" onClick={onUpload} data-testid="button-detail-upload">
          <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Document
        </Button>
      </div>

      <Separator />

      {/* Coding section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Accounting Coding</h3>
          <Button size="sm" variant="outline" onClick={() => setEditingCoding(!editingCoding)} data-testid="button-edit-coding">
            {editingCoding ? "Cancel" : "Edit Coding"}
          </Button>
        </div>
        {editingCoding ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">GL Account</Label>
                <Input value={codingForm.glAccount} onChange={e => setCodingForm(f => ({ ...f, glAccount: e.target.value }))}
                  placeholder="e.g. 6000-Expenses" data-testid="input-gl-account-edit" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Input value={codingForm.department} onChange={e => setCodingForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Operations" data-testid="input-department-edit" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Class</Label>
                <Input value={codingForm.classCode} onChange={e => setCodingForm(f => ({ ...f, classCode: e.target.value }))}
                  placeholder="e.g. Fleet" data-testid="input-class-edit" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Input value={codingForm.location} onChange={e => setCodingForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Chicago" data-testid="input-location-edit" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Coding Notes</Label>
              <Textarea value={codingForm.codingNotes} onChange={e => setCodingForm(f => ({ ...f, codingNotes: e.target.value }))}
                rows={2} data-testid="input-coding-notes-edit" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                const coded = Object.values(codingForm).some(v => v);
                onUpdate({ ...codingForm, codingStatus: coded ? "coded" : "uncoded" });
                setEditingCoding(false);
              }} data-testid="button-save-coding">Save Coding</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingCoding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["GL Account", payable.glAccount],
              ["Department", payable.department],
              ["Class", payable.classCode],
              ["Location", payable.location],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
                <span>{val || <span className="text-muted-foreground italic">Not set</span>}</span>
              </div>
            ))}
            <div className="flex gap-2 col-span-2">
              <span className="text-muted-foreground w-24 shrink-0">Coding Status:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.codingStatus)}`}>{fmtStatus(payable.codingStatus)}</span>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Rebillable section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Rebillable Pass-Through</h3>
          <Button size="sm" variant="outline" onClick={() => setEditingRebill(!editingRebill)} data-testid="button-edit-rebill">
            {editingRebill ? "Cancel" : "Edit"}
          </Button>
        </div>
        {editingRebill ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="rebillable-toggle" checked={rebillForm.isRebillable}
                onChange={e => setRebillForm(f => ({ ...f, isRebillable: e.target.checked }))}
                data-testid="checkbox-rebillable" />
              <Label htmlFor="rebillable-toggle">Rebill to Customer</Label>
            </div>
            {rebillForm.isRebillable && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rebill Status</Label>
                  <Select value={rebillForm.rebillStatus} onValueChange={v => setRebillForm(f => ({ ...f, rebillStatus: v }))}>
                    <SelectTrigger data-testid="select-rebill-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["not_rebillable", "pending_review", "approved_for_billing", "queued_for_invoice", "billed", "disputed", "written_off"].map(s => (
                        <SelectItem key={s} value={s}>{fmtStatus(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rebill Amount</Label>
                  <Input type="number" step="0.01" value={rebillForm.rebillAmount}
                    onChange={e => setRebillForm(f => ({ ...f, rebillAmount: e.target.value }))}
                    data-testid="input-rebill-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Markup Type</Label>
                  <Select value={rebillForm.markupType} onValueChange={v => setRebillForm(f => ({ ...f, markupType: v }))}>
                    <SelectTrigger data-testid="select-markup-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="flat">Flat ($)</SelectItem>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rebillForm.markupType !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Markup Value</Label>
                    <Input type="number" step="0.01" value={rebillForm.markupValue}
                      onChange={e => setRebillForm(f => ({ ...f, markupValue: e.target.value }))}
                      data-testid="input-markup-value" />
                  </div>
                )}
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Billing Description</Label>
                  <Textarea value={rebillForm.billingDescription} onChange={e => setRebillForm(f => ({ ...f, billingDescription: e.target.value }))}
                    rows={2} data-testid="input-billing-desc" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onUpdate(rebillForm); setEditingRebill(false); }} data-testid="button-save-rebill">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingRebill(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="text-sm space-y-1.5">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-32 shrink-0">Rebillable:</span>
              <span>{payable.isRebillable ? "Yes" : "No"}</span>
            </div>
            {payable.isRebillable && (
              <>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-32 shrink-0">Rebill Status:</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(payable.rebillStatus || "")}`}>{fmtStatus(payable.rebillStatus || "")}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-32 shrink-0">Rebill Amount:</span>
                  <span className="font-semibold">{fmtCurrency(payable.rebillAmount)}</span>
                </div>
                {payable.markupType !== "none" && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Markup:</span>
                    <span>{payable.markupType === "percent" ? `${payable.markupValue}%` : `$${payable.markupValue}`}</span>
                  </div>
                )}
                {payable.billingDescription && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Billing Desc:</span>
                    <span className="text-muted-foreground">{payable.billingDescription}</span>
                  </div>
                )}
                {/* Rebill workflow action buttons */}
                {!["billed", "written_off"].includes(payable.rebillStatus || "") && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {payable.rebillStatus === "pending_review" && (
                      <Button size="sm" variant="outline" onClick={onApproveForBilling} data-testid="button-approve-for-billing">
                        <ThumbsUp className="w-3.5 h-3.5 mr-1 text-green-600" /> Approve for Billing
                      </Button>
                    )}
                    {payable.rebillStatus === "approved_for_billing" && (
                      <Button size="sm" variant="outline" onClick={onQueueForInvoice} data-testid="button-queue-for-invoice">
                        <SendToBack className="w-3.5 h-3.5 mr-1 text-purple-600" /> Queue for Invoice
                      </Button>
                    )}
                    {!["disputed"].includes(payable.rebillStatus || "") && (
                      <Button size="sm" variant="outline" onClick={onDisputeRebill} data-testid="button-dispute-rebill">
                        <Ban className="w-3.5 h-3.5 mr-1 text-orange-500" /> Dispute
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={onWriteOffRebill} data-testid="button-writeoff-rebill">
                      <Eraser className="w-3.5 h-3.5 mr-1 text-red-500" /> Write Off
                    </Button>
                  </div>
                )}
                {payable.rebillStatus === "billed" && payable.linkedCustomerInvoiceId && (
                  <div className="flex gap-2 mt-1">
                    <span className="text-muted-foreground w-32 shrink-0">Billed on:</span>
                    <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Invoice added
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Documents */}
      <div>
        <h3 className="font-medium text-sm mb-3">Attached Documents</h3>
        {payable.documents?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents attached</p>
        ) : (
          <div className="space-y-2">
            {payable.documents?.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 text-sm" data-testid={`doc-row-${doc.id}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span>{doc.originalFileName || doc.fileName}</span>
                  {doc.fileSize && <span className="text-muted-foreground text-xs">({Math.round(doc.fileSize / 1024)}KB)</span>}
                </div>
                <div className="flex gap-1">
                  {doc.hasFile && (
                    <Button size="icon" variant="ghost" asChild data-testid={`button-download-doc-${doc.id}`}>
                      <a href={`/api/payable-documents/${doc.id}/download`} download={doc.originalFileName || doc.fileName}>
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => onDeleteDoc(doc.id)} data-testid={`button-delete-doc-${doc.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Audit Log */}
      <div>
        <h3 className="font-medium text-sm mb-3">Audit Log</h3>
        {payable.auditLog?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries</p>
        ) : (
          <div className="space-y-2">
            {payable.auditLog?.map((entry: any) => (
              <div key={entry.id} className="text-xs flex items-start gap-3 py-1.5" data-testid={`audit-entry-${entry.id}`}>
                <span className="text-muted-foreground shrink-0 w-32">{fmtDate(entry.actionAt)}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium shrink-0 ${statusBadge(entry.actionType)}`}>{fmtStatus(entry.actionType)}</span>
                <span className="text-muted-foreground">{entry.notes}</span>
                <span className="text-muted-foreground shrink-0 ml-auto">{entry.actionByName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
