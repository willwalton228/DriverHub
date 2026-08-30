import { useState, useEffect, useRef } from "react";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Pencil, Archive, ArchiveRestore, Search, ExternalLink, Phone, Mail, Globe, Loader2, Building2, Filter, ArrowLeft, FileText, CalendarDays, RefreshCw, AlertTriangle, DollarSign, Clock, CheckCircle2, Users, Star, Copy, Download, Upload, Trash2, ShieldAlert, Pin, MessageSquare, Trophy, AlertCircle, ChevronLeft, ChevronRight, History, Sparkles, Brain, BadgeCheck, ListChecks, Save, ReceiptText, ScanLine, TrendingUp, TrendingDown, CircleDot, BookOpen, Eye } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeleteAttachmentDialog } from "@/components/DeleteAttachmentDialog";
import { RecordWorkspaceTabs } from "@/components/RecordWorkspaceTabs";
import type { Vendor, VendorContract, VendorPricing, VendorContact, VendorDocument, VendorNote, VendorRenewalAlert, VendorAuditLog, VendorCompliance, VendorScorecard, ContractAiReview, VendorInvoiceAudit, ContractObligation, VendorDocumentRetentionRule } from "@shared/schema";
import { X, XCircle, RotateCcw } from "lucide-react";
import { VendorAvatar } from "@/components/VendorAvatar";

type EnrichedVendor = Vendor & {
  contractEndDate: string | null;
  renewalBadge: string | null;
  missingDocs: string[] | null;
  primaryContact: { name: string; email: string | null; phone: string | null } | null;
  activeContractCount: number;
  complianceRisk?: string | null;
};

type VendorListResponse = {
  data: EnrichedVendor[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export default function Vendors() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [contractStatusFilter, setContractStatusFilter] = useState<string>("all");
  const [w9Filter, setW9Filter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [archiveVendor, setArchiveVendor] = useState<Vendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const pageSize = 25;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, contractStatusFilter, w9Filter, ownerFilter, riskFilter, debouncedSearch]);

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    vendorType: "",
    category: "",
    website: "",
    w9OnFile: false,
    paymentTerms: "",
    remitAddress: "",
    supportPhone: "",
    supportEmail: "",
    supportPortalUrl: "",
    vendorOwner: "",
    secondaryOwnerId: "",
  });

  const { data: activeUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null; role: string }[]>({
    queryKey: ["/api/vendors/owners"],
  });

  const { data: complianceSummary = {} } = useQuery<Record<string, { expired: number; expiringSoon: number; valid: number; worstStatus: string }>>({
    queryKey: ["/api/vendors/compliance-summary"],
  });

  const { data: scorecardLatest = {} } = useQuery<Record<string, VendorScorecard>>({
    queryKey: ["/api/vendors/scorecard-latest"],
  });

  const { data: spendSummary = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/vendors/spend-summary"],
  });

  function getUserName(userId: string | null | undefined): string {
    if (!userId) return "---";
    const u = activeUsers.find(user => user.id === userId);
    if (!u) return "---";
    return u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || "---";
  }

  const { data: vendorResponse, isLoading } = useQuery<VendorListResponse>({
    queryKey: ["/api/vendors", statusFilter, categoryFilter, contractStatusFilter, w9Filter, ownerFilter, riskFilter, debouncedSearch, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
      if (contractStatusFilter && contractStatusFilter !== "all") params.set("contract_status", contractStatusFilter);
      if (w9Filter !== "all") params.set("w9_on_file", w9Filter);
      if (ownerFilter && ownerFilter !== "all") params.set("owner", ownerFilter);
      if (riskFilter && riskFilter !== "all") params.set("risk_level", riskFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", currentPage.toString());
      params.set("limit", pageSize.toString());
      const res = await fetch(`/api/vendors?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return { data: [], pagination: { page: 1, limit: pageSize, total: 0, totalPages: 0 } };
      return res.json();
    },
  });

  const vendors = vendorResponse?.data ?? [];
  const pagination = vendorResponse?.pagination ?? { page: 1, limit: pageSize, total: 0, totalPages: 0 };
  const activeFilterCount = [statusFilter !== "active" && statusFilter !== "all" ? 1 : 0, categoryFilter !== "all" ? 1 : 0, contractStatusFilter !== "all" ? 1 : 0, w9Filter !== "all" ? 1 : 0, ownerFilter !== "all" ? 1 : 0, riskFilter !== "all" ? 1 : 0].reduce((a, b) => a + b, 0);

  const createMutation = useMutation({
    mutationFn: async ({ data, w9File }: { data: typeof form; w9File: File | null }) => {
      const payload = { ...data, w9OnFile: false, vendorOwner: (data.vendorOwner && data.vendorOwner !== "none") ? data.vendorOwner : null, secondaryOwnerId: (data.secondaryOwnerId && data.secondaryOwnerId !== "none") ? data.secondaryOwnerId : null };
      const res = await apiRequest("POST", "/api/vendors", payload);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to create vendor"); }
      const vendor = await res.json();
      if (w9File) {
        const fd = new FormData();
        fd.append("file", w9File);
        fd.append("documentType", "W9");
        const uploadRes = await fetch(`/api/vendors/${vendor.id}/documents`, { method: "POST", body: fd, credentials: "include" });
        if (!uploadRes.ok) { const err = await uploadRes.json(); throw new Error(err.message || "Failed to upload W-9 document"); }
      }
      return vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Vendor created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create vendor", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, w9File, removeExistingW9Id }: { id: string; data: typeof form; w9File: File | null; removeExistingW9Id: string | null }) => {
      const effectiveW9OnFile = w9File ? false : removeExistingW9Id ? false : data.w9OnFile;
      const payload = { ...data, w9OnFile: effectiveW9OnFile, vendorOwner: (data.vendorOwner && data.vendorOwner !== "none") ? data.vendorOwner : null, secondaryOwnerId: (data.secondaryOwnerId && data.secondaryOwnerId !== "none") ? data.secondaryOwnerId : null };
      const res = await apiRequest("PUT", `/api/vendors/${id}`, payload);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to update vendor"); }
      const vendor = await res.json();
      if (removeExistingW9Id) {
        await apiRequest("DELETE", `/api/vendor-documents/${removeExistingW9Id}`, { deletionReason: "W-9 replaced or removed by user" });
      }
      if (w9File) {
        const fd = new FormData();
        fd.append("file", w9File);
        fd.append("documentType", "W9");
        await fetch(`/api/vendors/${id}/documents`, { method: "POST", body: fd, credentials: "include" });
      }
      return vendor;
    },
    onSuccess: (updatedVendor: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setEditVendor(null);
      if (selectedVendor && selectedVendor.id === updatedVendor.id) {
        setSelectedVendor(updatedVendor);
      }
      resetForm();
      toast({ title: "Vendor updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update vendor", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/vendors/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setArchiveVendor(null);
      setSelectedVendor(null);
      toast({ title: "Vendor archived" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to archive vendor", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setForm({
      name: "", legalName: "", vendorType: "", category: "", website: "",
      w9OnFile: false, paymentTerms: "", remitAddress: "", supportPhone: "",
      supportEmail: "", supportPortalUrl: "", vendorOwner: "", secondaryOwnerId: "",
    });
  }

  function openEdit(v: Vendor) {
    setForm({
      name: v.name || "",
      legalName: v.legalName || "",
      vendorType: v.vendorType || "",
      category: v.category || "",
      website: v.website || "",
      w9OnFile: v.w9OnFile ?? false,
      paymentTerms: v.paymentTerms || "",
      remitAddress: v.remitAddress || "",
      supportPhone: v.supportPhone || "",
      supportEmail: v.supportEmail || "",
      supportPortalUrl: v.supportPortalUrl || "",
      vendorOwner: v.vendorOwner || "",
      secondaryOwnerId: v.secondaryOwnerId || "",
    });
    setEditVendor(v);
  }

  if (selectedVendor) {
    return (
      <>
        <VendorDetail
          vendor={selectedVendor}
          onBack={() => { setEditVendor(null); setArchiveVendor(null); setSelectedVendor(null); }}
          onEdit={() => openEdit(selectedVendor)}
          onArchive={() => setArchiveVendor(selectedVendor)}
          onVendorUpdate={(v) => setSelectedVendor(v)}
        />
        <VendorFormDialog
          open={!!editVendor}
          onOpenChange={(open) => { if (!open) setEditVendor(null); }}
          title="Edit Vendor"
          description="Update vendor information"
          form={form}
          setForm={setForm}
          vendorId={editVendor?.id}
          onSubmit={(w9File, removeExistingW9Id) => editVendor && updateMutation.mutate({ id: editVendor.id, data: form, w9File, removeExistingW9Id })}
          isPending={updateMutation.isPending}
          submitLabel="Save Changes"
        />
        <Dialog open={!!archiveVendor} onOpenChange={(open) => { if (!open) setArchiveVendor(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive Vendor</DialogTitle>
              <DialogDescription>
                Are you sure you want to archive "{archiveVendor?.name}"? This will mark the vendor as inactive.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveVendor(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => archiveVendor && archiveMutation.mutate(archiveVendor.id)}
                disabled={archiveMutation.isPending}
                data-testid="button-confirm-archive"
              >
                {archiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Archive
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-vendors-title">Vendors</h1>
          <p className="text-sm text-muted-foreground">Manage vendor records and contact information</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/vendors/renewal-calendar">
            <Button variant="outline" data-testid="button-renewal-calendar">
              <CalendarDays className="mr-2 h-4 w-4" />
              Renewal Calendar
            </Button>
          </Link>
          <Button onClick={() => { resetForm(); setCreateOpen(true); }} data-testid="button-create-vendor">
            <Plus className="mr-2 h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-vendors"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="staffing">Staffing</SelectItem>
              <SelectItem value="Fleet">Fleet</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
              <SelectItem value="Technology">Technology</SelectItem>
              <SelectItem value="Insurance">Insurance</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={contractStatusFilter} onValueChange={setContractStatusFilter}>
            <SelectTrigger className="w-[155px]" data-testid="select-contract-status-filter">
              <SelectValue placeholder="Contract Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contracts</SelectItem>
              <SelectItem value="active">Active Contract</SelectItem>
              <SelectItem value="draft">Draft Contract</SelectItem>
              <SelectItem value="expired">Expired Contract</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={w9Filter} onValueChange={setW9Filter}>
            <SelectTrigger className="w-[130px]" data-testid="select-w9-filter">
              <SelectValue placeholder="W-9" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All W-9</SelectItem>
              <SelectItem value="true">W-9 On File</SelectItem>
              <SelectItem value="false">W-9 Missing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-owner-filter">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {activeUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || u.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-risk-filter">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("active"); setCategoryFilter("all"); setContractStatusFilter("all"); setW9Filter("all"); setOwnerFilter("all"); setRiskFilter("all"); setSearchQuery(""); }} data-testid="button-clear-filters">
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span data-testid="text-vendor-count">
          {pagination.total} vendor{pagination.total !== 1 ? "s" : ""}
          {pagination.totalPages > 1 && ` (page ${pagination.page} of ${pagination.totalPages})`}
        </span>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                  <Skeleton className="h-5 w-[200px]" />
                  <Skeleton className="h-5 w-[100px]" />
                  <Skeleton className="h-5 w-[80px]" />
                  <Skeleton className="h-5 w-[100px]" />
                  <Skeleton className="h-5 w-[150px]" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium" data-testid="text-no-vendors">No vendors found</p>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch || activeFilterCount > 0 ? "Try adjusting your filters" : "Create your first vendor to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Contract End</TableHead>
                  <TableHead>Primary Contact</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>YTD Spend</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => setSelectedVendor(v)} data-testid={`row-vendor-${v.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <VendorAvatar vendor={v} size="sm" />
                        <div className="min-w-0">
                          <span className="font-medium" data-testid={`text-vendor-name-${v.id}`}>{v.name}</span>
                          {v.legalName && <p className="text-xs text-muted-foreground truncate">{v.legalName}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground" data-testid={`text-vendor-category-${v.id}`}>{v.category || "---"}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.status} data-testid={`badge-vendor-status-${v.id}`} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={v.riskLevel === "critical" ? "destructive" : v.riskLevel === "high" ? "destructive" : v.riskLevel === "medium" ? "outline" : "secondary"}
                        className={v.riskLevel === "medium" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}
                        data-testid={`badge-vendor-risk-${v.id}`}
                      >
                        {v.riskLevel === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                        {v.riskLevel === "high" && <ShieldAlert className="mr-1 h-3 w-3" />}
                        {v.riskLevel.charAt(0).toUpperCase() + v.riskLevel.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" data-testid={`text-vendor-contract-end-${v.id}`}>
                        {v.contractEndDate ? new Date(v.contractEndDate).toLocaleDateString() : "---"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {v.primaryContact ? (
                        <div className="min-w-0">
                          <span className="text-sm" data-testid={`text-vendor-contact-${v.id}`}>{v.primaryContact.name}</span>
                          {v.primaryContact.email && <p className="text-xs text-muted-foreground truncate">{v.primaryContact.email}</p>}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">---</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground" data-testid={`text-vendor-owner-${v.id}`}>
                        {getUserName(v.vendorOwner)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {scorecardLatest[v.id] ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant={scorecardLatest[v.id].overallScore >= 80 ? "default" : scorecardLatest[v.id].overallScore >= 60 ? "secondary" : "destructive"}
                              data-testid={`badge-vendor-score-${v.id}`}
                            >
                              <Star className="mr-1 h-3 w-3" />
                              {scorecardLatest[v.id].overallScore}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Latest performance score ({scorecardLatest[v.id].reviewPeriodStart} to {scorecardLatest[v.id].reviewPeriodEnd})
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-sm text-muted-foreground">---</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium" data-testid={`text-vendor-spend-${v.id}`}>
                        {spendSummary[v.id] ? `$${spendSummary[v.id].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "---"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {v.renewalBadge === "renewal_due_soon" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400" data-testid={`badge-renewal-soon-${v.id}`}>
                                <Clock className="mr-1 h-3 w-3" />
                                Renewal Due
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Contract ends within 60 days</TooltipContent>
                          </Tooltip>
                        )}
                        {v.renewalBadge === "expired" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="text-xs" data-testid={`badge-expired-${v.id}`}>
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Expired
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Contract has expired</TooltipContent>
                          </Tooltip>
                        )}
                        {v.missingDocs && v.missingDocs.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs border-red-500 text-red-600 dark:text-red-400" data-testid={`badge-missing-docs-${v.id}`}>
                                <FileText className="mr-1 h-3 w-3" />
                                Missing Docs
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Missing: {v.missingDocs.join(", ")}</TooltipContent>
                          </Tooltip>
                        )}
                        {complianceSummary[v.id]?.worstStatus === "expired" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="text-xs" data-testid={`badge-compliance-expired-${v.id}`}>
                                <ShieldAlert className="mr-1 h-3 w-3" />
                                COI Expired
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{complianceSummary[v.id].expired} expired compliance item(s)</TooltipContent>
                          </Tooltip>
                        )}
                        {complianceSummary[v.id]?.worstStatus === "expiring_soon" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400" data-testid={`badge-compliance-expiring-${v.id}`}>
                                <ShieldAlert className="mr-1 h-3 w-3" />
                                COI Expiring
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{complianceSummary[v.id].expiringSoon} compliance item(s) expiring soon</TooltipContent>
                          </Tooltip>
                        )}
                        {!v.w9OnFile && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-no-w9-${v.id}`}>No W-9</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground" data-testid="text-pagination-info">
            Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={currentPage >= pagination.totalPages}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <VendorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Vendor"
        description="Create a new vendor record"
        form={form}
        setForm={setForm}
        onSubmit={(w9File) => createMutation.mutate({ data: form, w9File })}
        isPending={createMutation.isPending}
        submitLabel="Create Vendor"
      />

    </div>
  );
}

const DRAG_ACCEPTED_EXTS = ["pdf", "doc", "docx", "jpg", "jpeg", "png"];

type BatchFile = {
  file: File;
  documentType: string;
  contractId: string;
  notes: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  error: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DOC_TYPE_OPTIONS = [
  { value: "Contract",          label: "Contract" },
  { value: "MSA",               label: "MSA" },
  { value: "SOW",               label: "SOW" },
  { value: "Agreement",         label: "Agreement" },
  { value: "Amendment",         label: "Amendment" },
  { value: "Renewal",           label: "Renewal" },
  { value: "W9",                label: "W-9" },
  { value: "COI",               label: "COI / Insurance" },
  { value: "Invoice",           label: "Invoice" },
  { value: "PricingSheet",      label: "Pricing Sheet" },
  { value: "RenewalNotice",     label: "Renewal Notice" },
  { value: "TerminationNotice", label: "Termination Notice" },
  { value: "Other",             label: "Other" },
];

const CONTRACT_DOC_TYPES = new Set(["Contract", "MSA", "SOW", "Agreement", "Amendment", "Renewal", "RenewalNotice", "TerminationNotice"]);

function LogoUploadTrigger({ vendor, onVendorUpdate }: { vendor: Vendor; onVendorUpdate: (v: Vendor) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/vendors/${vendor.id}/logo`, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
      return res.json() as Promise<Vendor>;
    },
    onSuccess: (updated) => {
      onVendorUpdate(updated);
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Logo uploaded" });
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/vendors/${vendor.id}/logo`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Remove failed"); }
    },
    onSuccess: () => {
      onVendorUpdate({ ...vendor, logoStorageKey: null });
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Logo removed" });
    },
    onError: (err: any) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const isPending = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="relative shrink-0 group" data-testid="vendor-logo-trigger">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ""; }}
        data-testid="input-vendor-logo-upload"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="button-vendor-logo-click"
            aria-label="Upload vendor logo"
          >
            {isPending ? (
              <div className={`flex items-center justify-center h-14 w-14 rounded-full bg-muted`}>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <VendorAvatar vendor={vendor} size="lg" />
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <Upload className="h-4 w-4 text-white" />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>{vendor.logoStorageKey ? "Replace logo" : "Upload logo"}</TooltipContent>
      </Tooltip>
      {vendor.logoStorageKey && !isPending && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }}
              data-testid="button-vendor-logo-remove"
            >
              <X className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove logo</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function VendorDetail({ vendor, onBack, onEdit, onArchive, onVendorUpdate }: {
  vendor: Vendor;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onVendorUpdate: (v: Vendor) => void;
}) {
  const { toast } = useToast();
  const { isSuperAdmin, isRootSuperAdmin, user: authUser } = useAuth();

  // Per-user vendor module permission overrides (additive on top of role-based access)
  const { data: myModulePermsRows = [] } = useQuery<{ moduleName: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canManageContracts: boolean; canManagePricing: boolean; canManageDocuments: boolean; canManageNotes: boolean; canManageCompliance: boolean; canManageRenewals: boolean }[]>({
    queryKey: ["/api/me/module-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/me/module-permissions", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const myVendorPerms = myModulePermsRows.find((r) => r.moduleName === "vendors") ?? null;

  const vendorAccessLevel = (() => {
    const r = authUser?.role ?? "";
    if (["super_user", "super_admin", "admin", "Admin"].includes(r)) return { label: "Admin Access", tier: "Admin", color: "text-primary" };
    if (["finance", "Finance"].includes(r)) return { label: "Finance Access", tier: "Finance", color: "text-blue-600 dark:text-blue-400" };
    if (["ops", "operations", "ops_manager"].includes(r)) return { label: "Ops Access", tier: "Operations", color: "text-green-600 dark:text-green-400" };
    if (myVendorPerms?.canView) return { label: "Override Access", tier: "Override", color: "text-orange-600 dark:text-orange-400" };
    return { label: "Read Only", tier: "Read Only", color: "text-muted-foreground" };
  })();

  const canUploadDocs = vendorAccessLevel.tier !== "Read Only" || !!(myVendorPerms?.canManageDocuments);
  const canDeleteDocs = isSuperAdmin || isRootSuperAdmin || !!(myVendorPerms?.canManageDocuments && myVendorPerms?.canDelete);
  const canManageContractsOverride = !!(myVendorPerms?.canManageContracts);
  const canManagePricingOverride = !!(myVendorPerms?.canManagePricing);
  const canManageNotesOverride = !!(myVendorPerms?.canManageNotes);
  const canManageComplianceOverride = !!(myVendorPerms?.canManageCompliance);
  const canManageRenewalsOverride = !!(myVendorPerms?.canManageRenewals);

  async function downloadVendorDoc(id: string, fileName: string) {
    try {
      const res = await fetch(`/api/vendor-documents/${id}/download`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        toast({ title: "Download failed", description: err.message ?? "File could not be retrieved", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Network error — please try again", variant: "destructive" });
    }
  }
  const [vendorActiveTab, setVendorActiveTab] = useState("overview");
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<VendorContract | null>(null);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [editingPricing, setEditingPricing] = useState<VendorPricing | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);

  // --- AI Contract Review state ---
  const [aiReviewFile, setAiReviewFile] = useState<File | null>(null);
  const [aiReviewMode, setAiReviewMode] = useState<"library" | "upload">("library");
  const [aiReviewSelectedDocId, setAiReviewSelectedDocId] = useState<string>("");
  const [aiReviewingDocIds, setAiReviewingDocIds] = useState<Set<string>>(new Set());
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [editedExtracted, setEditedExtracted] = useState<Record<string, any>>({});
  const [editedSummary, setEditedSummary] = useState("");
  const [editedRisk, setEditedRisk] = useState("");
  const [editedActionItems, setEditedActionItems] = useState<any[]>([]);

  const { data: aiReviews = [], isLoading: aiReviewsLoading } = useQuery<ContractAiReview[]>({
    queryKey: ["/api/vendors", vendor.id, "contract-ai-reviews"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/contract-ai-reviews`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selectedReview = aiReviews.find(r => r.id === selectedReviewId) ?? aiReviews[0] ?? null;

  const submitAiReviewMutation = useMutation({
    mutationFn: async () => {
      if (!aiReviewFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", aiReviewFile);
      const res = await fetch(`/api/vendors/${vendor.id}/contract-ai-review`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "AI review failed");
      return json as ContractAiReview;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contract-ai-reviews"] });
      setSelectedReviewId(data.id);
      setAiReviewFile(null);
      toast({ title: "AI contract review complete", description: `${data.fileName} analyzed successfully` });
    },
    onError: (err: Error) => {
      toast({ title: "AI review failed", description: err.message, variant: "destructive" });
    },
  });

  const submitAiReviewFromDocMutation = useMutation({
    mutationFn: async () => {
      if (!aiReviewSelectedDocId) throw new Error("No document selected");
      const res = await fetch(`/api/vendors/${vendor.id}/contract-ai-review-from-doc`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: aiReviewSelectedDocId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "AI review failed");
      return json as ContractAiReview;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contract-ai-reviews"] });
      setSelectedReviewId(data.id);
      setAiReviewSelectedDocId("");
      toast({ title: "AI review complete", description: `${data.fileName} analyzed successfully` });
    },
    onError: (err: Error) => {
      toast({ title: "AI review failed", description: err.message, variant: "destructive" });
    },
  });

  async function runAiReviewFromDoc(docId: string, fileName: string) {
    setAiReviewingDocIds((prev) => new Set(prev).add(docId));
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/contract-ai-review-from-doc`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "AI review failed");
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contract-ai-reviews"] });
      toast({ title: "AI review complete", description: `${fileName} analyzed — view in the AI Review tab.` });
    } catch (err: any) {
      toast({ title: "AI review failed", description: err.message, variant: "destructive" });
    } finally {
      setAiReviewingDocIds((prev) => { const next = new Set(prev); next.delete(docId); return next; });
    }
  }

  const saveAiReviewEditsMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendor.id}/contract-ai-reviews/${reviewId}`, {
        extractedJson: editedExtracted,
        executiveSummary: editedSummary,
        riskSummary: editedRisk,
        actionItems: editedActionItems,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contract-ai-reviews"] });
      setIsEditingReview(false);
      toast({ title: "Review edits saved" });
    },
    onError: () => {
      toast({ title: "Failed to save review edits", variant: "destructive" });
    },
  });

  function beginEditReview(review: ContractAiReview) {
    setEditedExtracted((review.extractedJson as Record<string, any>) || {});
    setEditedSummary(review.executiveSummary || "");
    setEditedRisk(review.riskSummary || "");
    setEditedActionItems((review.actionItems as any[]) || []);
    setIsEditingReview(true);
  }

  // --- Invoice Audit state ---
  const [invoiceAuditFile, setInvoiceAuditFile] = useState<File | null>(null);
  const [invoiceInputMode, setInvoiceInputMode] = useState<"file" | "text">("file");
  const [invoiceAuditText, setInvoiceAuditText] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [auditContractFilter, setAuditContractFilter] = useState<string>("auto");

  const { data: invoiceAudits = [], isLoading: invoiceAuditsLoading } = useQuery<VendorInvoiceAudit[]>({
    queryKey: ["/api/vendors", vendor.id, "invoice-audits"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/invoice-audits`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  type InvoiceAuditSummary = { total: number; matches: number; warnings: number; exceptions: number; totalVariance: number; totalInvoiced: number; totalExpected: number };
  const { data: auditSummary } = useQuery<InvoiceAuditSummary>({
    queryKey: ["/api/vendors", vendor.id, "invoice-audits-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/invoice-audits-summary`, { credentials: "include" });
      if (!res.ok) return { total: 0, matches: 0, warnings: 0, exceptions: 0, totalVariance: 0, totalInvoiced: 0, totalExpected: 0 };
      return res.json();
    },
    enabled: invoiceAudits.length > 0,
  });

  const selectedAudit = invoiceAudits.find(a => a.id === selectedAuditId) ?? invoiceAudits[0] ?? null;

  // --- License Utilization state ---
  type LicenseUtil = {
    id: number; vendorId: number; snapshotDate: string; licenseName: string;
    purchasedSeats: number; assignedSeats: number; activeLastThirtyDays: number | null;
    annualLicenseCost: string | null; utilizationPercent: string | null; estimatedUnusedCost: string | null;
    notes: string | null; createdAt: string;
  };
  const [licenseFormOpen, setLicenseFormOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<LicenseUtil | null>(null);
  const [licenseForm, setLicenseForm] = useState({
    snapshotDate: new Date().toISOString().slice(0, 10),
    licenseName: "", purchasedSeats: "", assignedSeats: "",
    activeLastThirtyDays: "", annualLicenseCost: "", notes: "",
  });

  const { data: licenseHistory = [], isLoading: licenseLoading } = useQuery<LicenseUtil[]>({
    queryKey: ["/api/vendors", vendor.id, "license-utilization"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/license-utilization`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: licenseLatest } = useQuery<LicenseUtil | null>({
    queryKey: ["/api/vendors", vendor.id, "license-utilization", "latest"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/license-utilization/latest`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });

  const saveLicenseMutation = useMutation({
    mutationFn: async (data: typeof licenseForm) => {
      const payload = {
        snapshotDate: data.snapshotDate,
        licenseName: data.licenseName || "Default License",
        purchasedSeats: parseInt(data.purchasedSeats) || 0,
        assignedSeats: parseInt(data.assignedSeats) || 0,
        activeLastThirtyDays: data.activeLastThirtyDays ? parseInt(data.activeLastThirtyDays) : null,
        annualLicenseCost: data.annualLicenseCost || null,
        notes: data.notes || null,
      };
      if (editingLicense) {
        const res = await apiRequest("PUT", `/api/license-utilization/${editingLicense.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/vendors/${vendor.id}/license-utilization`, payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "license-utilization"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "license-utilization", "latest"] });
      toast({ title: editingLicense ? "License snapshot updated" : "License snapshot recorded" });
      setLicenseFormOpen(false);
      setEditingLicense(null);
      setLicenseForm({ snapshotDate: new Date().toISOString().slice(0, 10), licenseName: "", purchasedSeats: "", assignedSeats: "", activeLastThirtyDays: "", annualLicenseCost: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteLicenseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/license-utilization/${id}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "license-utilization"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "license-utilization", "latest"] });
      toast({ title: "License snapshot deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openLicenseEdit = (lu: LicenseUtil) => {
    setEditingLicense(lu);
    setLicenseForm({
      snapshotDate: lu.snapshotDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      licenseName: lu.licenseName ?? "",
      purchasedSeats: String(lu.purchasedSeats ?? ""),
      assignedSeats: String(lu.assignedSeats ?? ""),
      activeLastThirtyDays: lu.activeLastThirtyDays != null ? String(lu.activeLastThirtyDays) : "",
      annualLicenseCost: lu.annualLicenseCost ?? "",
      notes: lu.notes ?? "",
    });
    setLicenseFormOpen(true);
  };

  // --- Value Scorecard state ---
  type ValueScorecard = {
    id: string; vendorId: string; reviewPeriodStart: string; reviewPeriodEnd: string;
    contractCostScore: string | null; utilizationScore: string | null;
    supportScore: string | null; businessValueScore: string | null; riskScore: string | null;
    overallScore: string | null; recommendation: string | null;
    recommendationOverride: string | null; overrideReason: string | null;
    aiSummary: string | null; createdBy: string | null; createdAt: string;
  };
  const defaultValueScorecardPeriod = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  };
  const [valueScorecardFormOpen, setValueScorecardFormOpen] = useState(false);
  const [editingValueScorecard, setEditingValueScorecard] = useState<ValueScorecard | null>(null);
  const [valueScorecardForm, setValueScorecardForm] = useState(() => {
    const p = defaultValueScorecardPeriod();
    return {
      reviewPeriodStart: p.start, reviewPeriodEnd: p.end,
      contractCostScore: "", utilizationScore: "", supportScore: "",
      businessValueScore: "", riskScore: "", overallScore: "",
      recommendation: "retain", recommendationOverride: "", overrideReason: "", aiSummary: "",
    };
  });
  const [scorecardOverrideEditingId, setScorecardOverrideEditingId] = useState<string | null>(null);
  const [scorecardOverrideForm, setScorecardOverrideForm] = useState({ recommendationOverride: "", overrideReason: "" });

  const { data: valueScorecardHistory = [], isLoading: valueScorecardLoading } = useQuery<ValueScorecard[]>({
    queryKey: ["/api/vendors", vendor.id, "value-scorecard"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/value-scorecard`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: valueScorecardLatest } = useQuery<ValueScorecard | null>({
    queryKey: ["/api/vendors", vendor.id, "value-scorecard", "latest"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/value-scorecard/latest`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });

  const saveValueScorecardMutation = useMutation({
    mutationFn: async (data: typeof valueScorecardForm) => {
      const payload = {
        reviewPeriodStart: data.reviewPeriodStart,
        reviewPeriodEnd: data.reviewPeriodEnd,
        contractCostScore: data.contractCostScore ? parseFloat(data.contractCostScore) : null,
        utilizationScore: data.utilizationScore ? parseFloat(data.utilizationScore) : null,
        supportScore: data.supportScore ? parseFloat(data.supportScore) : null,
        businessValueScore: data.businessValueScore ? parseFloat(data.businessValueScore) : null,
        riskScore: data.riskScore ? parseFloat(data.riskScore) : null,
        overallScore: data.overallScore ? parseFloat(data.overallScore) : null,
        recommendation: data.recommendation || null,
        aiSummary: data.aiSummary || null,
      };
      if (editingValueScorecard) {
        const res = await apiRequest("PUT", `/api/value-scorecard/${editingValueScorecard.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/vendors/${vendor.id}/value-scorecard`, payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard", "latest"] });
      toast({ title: editingValueScorecard ? "Scorecard updated" : "Scorecard saved" });
      setValueScorecardFormOpen(false);
      setEditingValueScorecard(null);
      const p = defaultValueScorecardPeriod();
      setValueScorecardForm({ reviewPeriodStart: p.start, reviewPeriodEnd: p.end, contractCostScore: "", utilizationScore: "", supportScore: "", businessValueScore: "", riskScore: "", overallScore: "", recommendation: "retain", recommendationOverride: "", overrideReason: "", aiSummary: "" });
    },
    onError: (err: any) => toast({ title: "Error saving scorecard", description: err.message, variant: "destructive" }),
  });

  const saveValueScorecardOverrideMutation = useMutation({
    mutationFn: async ({ id, override, reason }: { id: string; override: string; reason: string }) => {
      const res = await apiRequest("PUT", `/api/value-scorecard/${id}`, {
        recommendationOverride: override || null,
        overrideReason: reason || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard", "latest"] });
      toast({ title: "Override saved" });
      setScorecardOverrideEditingId(null);
    },
    onError: (err: any) => toast({ title: "Error saving override", description: err.message, variant: "destructive" }),
  });

  const deleteValueScorecardMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/value-scorecard/${id}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "value-scorecard", "latest"] });
      toast({ title: "Scorecard deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openValueScorecardEdit = (sc: ValueScorecard) => {
    setEditingValueScorecard(sc);
    setValueScorecardForm({
      reviewPeriodStart: sc.reviewPeriodStart?.slice(0, 10) ?? "",
      reviewPeriodEnd: sc.reviewPeriodEnd?.slice(0, 10) ?? "",
      contractCostScore: sc.contractCostScore ?? "",
      utilizationScore: sc.utilizationScore ?? "",
      supportScore: sc.supportScore ?? "",
      businessValueScore: sc.businessValueScore ?? "",
      riskScore: sc.riskScore ?? "",
      overallScore: sc.overallScore ?? "",
      recommendation: sc.recommendation ?? "retain",
      recommendationOverride: sc.recommendationOverride ?? "",
      overrideReason: sc.overrideReason ?? "",
      aiSummary: sc.aiSummary ?? "",
    });
    setValueScorecardFormOpen(true);
  };

  const scorecardRecommendationColors: Record<string, string> = {
    retain: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    renegotiate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    reduce_licenses: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    replace: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    terminate_review: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  const scorecardRecommendationLabels: Record<string, string> = {
    retain: "Retain", renegotiate: "Renegotiate", reduce_licenses: "Reduce Licenses",
    replace: "Replace", terminate_review: "Terminate Review",
  };

  const submitInvoiceAuditMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceAuditFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", invoiceAuditFile);
      if (auditContractFilter !== "auto") formData.append("contractId", auditContractFilter);
      const res = await fetch(`/api/vendors/${vendor.id}/invoice-audit`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Invoice audit failed");
      return json as VendorInvoiceAudit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "invoice-audits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "invoice-audits-summary"] });
      setSelectedAuditId(data.id);
      setInvoiceAuditFile(null);
      toast({ title: "Invoice audit complete", description: `Status: ${data.auditStatus.toUpperCase()}` });
    },
    onError: (err: Error) => {
      toast({ title: "Invoice audit failed", description: err.message, variant: "destructive" });
    },
  });

  const submitInvoiceAuditTextMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceAuditText.trim()) throw new Error("No invoice text provided");
      const body: Record<string, string> = { invoiceText: invoiceAuditText.trim() };
      if (auditContractFilter !== "auto") body.contractId = auditContractFilter;
      const res = await fetch(`/api/vendors/${vendor.id}/invoice-audit-text`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Invoice audit failed");
      return json as VendorInvoiceAudit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "invoice-audits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "invoice-audits-summary"] });
      setSelectedAuditId(data.id);
      setInvoiceAuditText("");
      toast({ title: "Invoice audit complete", description: `Status: ${data.auditStatus.toUpperCase()}` });
    },
    onError: (err: Error) => {
      toast({ title: "Invoice audit failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: ownerUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null; role: string }[]>({
    queryKey: ["/api/vendors/owners"],
  });

  const { data: complianceRecords = [] } = useQuery<VendorCompliance[]>({
    queryKey: [`/api/vendors/${vendor.id}/compliance`],
  });

  const expiredCompliance = complianceRecords.filter(c => c.status === "expired");
  const expiringCompliance = complianceRecords.filter(c => c.status === "expiring_soon");

  const { data: scorecards = [] } = useQuery<VendorScorecard[]>({
    queryKey: [`/api/vendors/${vendor.id}/scorecards`],
  });

  const { data: vendorSpend, isLoading: spendLoading } = useQuery<{ ytdSpend: number; priorYearSpend: number; monthlyTrend: { month: string; total: number }[]; averageMonthlySpend: number }>({
    queryKey: [`/api/vendors/${vendor.id}/spend`],
  });

  type RiskAssessment = { currentRiskLevel: string; currentRiskReason: string | null; suggestedRiskLevel: string; suggestedReasons: string[]; isEscalation: boolean };
  const { data: riskAssessment, isLoading: riskLoading } = useQuery<RiskAssessment>({
    queryKey: [`/api/vendors/${vendor.id}/risk-assessment`],
  });

  const [riskOverrideOpen, setRiskOverrideOpen] = useState(false);
  const [riskForm, setRiskForm] = useState({ riskLevel: vendor.riskLevel || "low", riskReason: vendor.riskReason || "" });

  const updateRiskMutation = useMutation({
    mutationFn: async (data: { riskLevel: string; riskReason: string }) => {
      const res = await apiRequest("PUT", `/api/vendors/${vendor.id}/risk`, data);
      return res.json();
    },
    onSuccess: (updatedVendor: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/risk-assessment`] });
      setRiskOverrideOpen(false);
      onVendorUpdate(updatedVendor);
      toast({ title: "Risk level updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update risk level", description: err.message, variant: "destructive" });
    },
  });

  const [scorecardDialogOpen, setScorecardDialogOpen] = useState(false);
  const defaultScorecardForm = { ratingQuality: "3", ratingTimeliness: "3", ratingSupport: "3", ratingCostControl: "3", reviewPeriodStart: "", reviewPeriodEnd: "", notes: "" };
  const [perfScorecardForm, setPerfScorecardForm] = useState(defaultScorecardForm);

  const createScorecardMutation = useMutation({
    mutationFn: async (data: typeof perfScorecardForm) => {
      return apiRequest("POST", `/api/vendors/${vendor.id}/scorecards`, {
        ratingQuality: parseInt(data.ratingQuality),
        ratingTimeliness: parseInt(data.ratingTimeliness),
        ratingSupport: parseInt(data.ratingSupport),
        ratingCostControl: parseInt(data.ratingCostControl),
        reviewPeriodStart: data.reviewPeriodStart,
        reviewPeriodEnd: data.reviewPeriodEnd,
        notes: data.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/scorecards`] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/scorecard-latest"] });
      setScorecardDialogOpen(false);
      setPerfScorecardForm(defaultScorecardForm);
      toast({ title: "Scorecard created" });
    },
    onError: () => { toast({ title: "Error creating scorecard", variant: "destructive" }); },
  });

  const deletePerfScorecardMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/vendor-scorecards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/scorecards`] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/scorecard-latest"] });
      toast({ title: "Performance scorecard deleted" });
    },
    onError: () => { toast({ title: "Error deleting scorecard", variant: "destructive" }); },
  });

  function getUserNameDetail(userId: string | null | undefined): string {
    if (!userId) return "---";
    const u = ownerUsers.find(user => user.id === userId);
    if (!u) return "---";
    return u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || "---";
  }

  const defaultContractForm = {
    contractName: "",
    contractType: "Other" as string,
    effectiveDate: "",
    startDate: "",
    endDate: "",
    autoRenew: false,
    renewalTermDays: "",
    noticePeriodDays: "",
    contractStatus: "draft" as string,
    slaSummary: "",
    noticeDeadlineDate: "",
    autoRenewalDate: "",
    renewalDecisionStatus: "undecided" as string,
    renewalOwnerId: "",
  };

  const [contractForm, setContractForm] = useState(defaultContractForm);
  const [contractUploadFile, setContractUploadFile] = useState<File | null>(null);
  const [selectedContract, setSelectedContract] = useState<VendorContract | null>(null);

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<VendorContract[]>({
    queryKey: ["/api/vendors", vendor.id, "contracts"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/contracts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Vendor-level obligations (all contracts)
  type VendorObligation = ContractObligation & { contractName: string | null };
  const { data: vendorObligations = [], isLoading: vendorObligationsLoading } = useQuery<VendorObligation[]>({
    queryKey: ["/api/vendors", vendor.id, "obligations"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/obligations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [obFilterStatus, setObFilterStatus] = useState("all");
  const [obFilterType, setObFilterType] = useState("all");
  const [obFilterContract, setObFilterContract] = useState("all");

  const createContractMutation = useMutation({
    mutationFn: async (data: typeof contractForm) => {
      const payload = {
        ...data,
        effectiveDate: data.effectiveDate || null,
        renewalTermDays: data.renewalTermDays ? parseInt(data.renewalTermDays) : null,
        noticePeriodDays: data.noticePeriodDays ? parseInt(data.noticePeriodDays) : null,
        noticeDeadlineDate: data.noticeDeadlineDate || null,
        autoRenewalDate: data.autoRenewalDate || null,
        renewalDecisionStatus: data.renewalDecisionStatus || "undecided",
        renewalOwnerId: data.renewalOwnerId || null,
      };
      const res = await apiRequest("POST", `/api/vendors/${vendor.id}/contracts`, payload);
      return res.json();
    },
    onSuccess: async (newContract: { id: string }) => {
      // Upload attached contract file (if any) linked to the newly-created contract
      let contractFileLinked = false;
      if (contractUploadFile && newContract?.id) {
        try {
          const docTypeMap: Record<string, string> = { MSA: "MSA", SOW: "SOW", Subscription: "Other", Other: "Other" };
          const fd = new FormData();
          fd.append("file", contractUploadFile);
          fd.append("documentType", docTypeMap[contractForm.contractType] ?? "Other");
          fd.append("contractId", newContract.id);
          const docRes = await fetch(`/api/vendors/${vendor.id}/documents`, { method: "POST", body: fd, credentials: "include" });
          if (!docRes.ok) {
            const errBody = await docRes.json().catch(() => ({}));
            throw new Error(errBody.message || `Upload failed (${docRes.status})`);
          }
          contractFileLinked = true;
          queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
        } catch (uploadErr: any) {
          toast({ title: "Contract created, but document upload failed", description: uploadErr?.message, variant: "destructive" });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contracts"] });
      setContractDialogOpen(false);
      setContractForm(defaultContractForm);
      setContractUploadFile(null);
      if (contractFileLinked) {
        toast({ title: "Contract created — document linked" });
      } else {
        toast({ title: "Contract created" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to create contract", description: err.message, variant: "destructive" });
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof contractForm }) => {
      const payload = {
        ...data,
        effectiveDate: data.effectiveDate || null,
        renewalTermDays: data.renewalTermDays ? parseInt(data.renewalTermDays) : null,
        noticePeriodDays: data.noticePeriodDays ? parseInt(data.noticePeriodDays) : null,
        noticeDeadlineDate: data.noticeDeadlineDate || null,
        autoRenewalDate: data.autoRenewalDate || null,
        renewalDecisionStatus: data.renewalDecisionStatus || "undecided",
        renewalOwnerId: data.renewalOwnerId || null,
      };
      const res = await apiRequest("PUT", `/api/contracts/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contracts"] });
      setEditingContract(null);
      setContractForm(defaultContractForm);
      toast({ title: "Contract updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update contract", description: err.message, variant: "destructive" });
    },
  });

  const defaultPricingForm = {
    contractId: "" as string,
    pricingType: "flat" as string,
    unitRate: "",
    unitDescription: "",
    minimumCommitment: "",
    effectiveStart: "",
    effectiveEnd: "",
    notes: "",
  };

  const [pricingForm, setPricingForm] = useState(defaultPricingForm);

  const { data: pricingRecords = [], isLoading: pricingLoading } = useQuery<VendorPricing[]>({
    queryKey: ["/api/vendors", vendor.id, "pricing"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/pricing`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: typeof pricingForm) => {
      const payload = {
        ...data,
        contractId: data.contractId || null,
        minimumCommitment: data.minimumCommitment || null,
        effectiveEnd: data.effectiveEnd || null,
      };
      const res = await apiRequest("POST", `/api/vendors/${vendor.id}/pricing`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "pricing"] });
      setPricingDialogOpen(false);
      setPricingForm(defaultPricingForm);
      toast({ title: "Rate card created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create rate card", description: err.message, variant: "destructive" });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof pricingForm }) => {
      const payload = {
        ...data,
        contractId: data.contractId || null,
        minimumCommitment: data.minimumCommitment || null,
        effectiveEnd: data.effectiveEnd || null,
      };
      const res = await apiRequest("PUT", `/api/vendor-pricing/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "pricing"] });
      setEditingPricing(null);
      setPricingForm(defaultPricingForm);
      toast({ title: "Rate card updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update rate card", description: err.message, variant: "destructive" });
    },
  });

  function openPricingEdit(p: VendorPricing) {
    setPricingForm({
      contractId: p.contractId || "",
      pricingType: p.pricingType,
      unitRate: p.unitRate,
      unitDescription: p.unitDescription,
      minimumCommitment: p.minimumCommitment || "",
      effectiveStart: p.effectiveStart,
      effectiveEnd: p.effectiveEnd || "",
      notes: p.notes || "",
    });
    setEditingPricing(p);
  }

  function isPricingCurrent(p: VendorPricing): boolean {
    const today = new Date().toISOString().split("T")[0];
    return p.effectiveStart <= today && (!p.effectiveEnd || p.effectiveEnd >= today);
  }

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

  const defaultContactForm = {
    name: "",
    title: "",
    email: "",
    phone: "",
    role: "primary" as string,
    escalationLevel: 1,
    isPrimary: false,
  };

  const [contactForm, setContactForm] = useState(defaultContactForm);

  const { data: contactRecords = [], isLoading: contactsLoading } = useQuery<VendorContact[]>({
    queryKey: ["/api/vendors", vendor.id, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: typeof contactForm) => {
      const res = await apiRequest("POST", `/api/vendors/${vendor.id}/contacts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contacts"] });
      setContactDialogOpen(false);
      setContactForm(defaultContactForm);
      toast({ title: "Contact added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add contact", description: err.message, variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof contactForm }) => {
      const res = await apiRequest("PUT", `/api/vendor-contacts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contacts"] });
      setEditingContact(null);
      setContactForm(defaultContactForm);
      toast({ title: "Contact updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update contact", description: err.message, variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/vendor-contacts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contacts"] });
      setDeleteContactId(null);
      toast({ title: "Contact removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove contact", description: err.message, variant: "destructive" });
    },
  });

  function openContactEdit(c: VendorContact) {
    setContactForm({
      name: c.name,
      title: c.title || "",
      email: c.email || "",
      phone: c.phone || "",
      role: c.role,
      escalationLevel: c.escalationLevel,
      isPrimary: c.isPrimary,
    });
    setEditingContact(c);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  }

  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [docUploadForm, setDocUploadForm] = useState({ documentType: "Other" as string, contractId: "" as string, notes: "", file: null as File | null });
  const [editDocDialogOpen, setEditDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<VendorDocument | null>(null);
  const [editDocForm, setEditDocForm] = useState({ documentType: "Other", contractId: "", notes: "" });
  const [showArchivedDocs, setShowArchivedDocs] = useState(false);
  const [retentionEditDoc, setRetentionEditDoc] = useState<VendorDocument | null>(null);
  const [retentionEditForm, setRetentionEditForm] = useState({ retainUntil: "", retentionCategory: "standard" });
  const [editingRetentionRule, setEditingRetentionRule] = useState<{ documentType: string; retentionDays: string; retentionCategory: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragClassifyFiles, setDragClassifyFiles] = useState<BatchFile[]>([]);
  const [dragClassifyOpen, setDragClassifyOpen] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("all");
  const [auditDocSearch, setAuditDocSearch] = useState("");

  const { data: docRecords = [], isLoading: docsLoading } = useQuery<VendorDocument[]>({
    queryKey: ["/api/vendors", vendor.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(`/api/vendors/${vendor.id}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (newDoc: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      setDocDialogOpen(false);
      setDocUploadForm({ documentType: "Other", contractId: "", notes: "", file: null });
      if (newDoc?.contractId) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contracts"] });
        toast({ title: "Document uploaded — contract record created" });
      } else {
        toast({ title: "Document uploaded" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to upload document", description: err.message, variant: "destructive" });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/vendor-documents/${id}`, body);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      setEditDocDialogOpen(false);
      setEditingDoc(null);
      setShowContractLinkPrompt(false);
      toast({ title: "Document updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update document", description: err.message, variant: "destructive" });
    },
  });

  function openCreateContractFromDoc(doc: VendorDocument) {
    const typeMap: Record<string, string> = { MSA: "MSA", SOW: "SOW", Subscription: "Subscription", RenewalNotice: "Other", Contract: "Other", Agreement: "Other", Amendment: "Other", Renewal: "Other", TerminationNotice: "Other" };
    const contractType = typeMap[doc.documentType] ?? "Other";
    const contractName = doc.fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
    setContractForm({ ...defaultContractForm, contractName, contractType });
    setContractDialogOpen(true);
  }

  async function handleQuickLinkDoc(docId: string, contractId: string) {
    if (!contractId) return;
    try {
      await apiRequest("PATCH", `/api/vendor-documents/${docId}`, { contractId });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "contracts"] });
      toast({ title: "Document linked to contract" });
    } catch {
      toast({ title: "Failed to link document", variant: "destructive" });
    }
  }

  function openEditDoc(doc: VendorDocument) {
    setEditingDoc(doc);
    setEditDocForm({ documentType: doc.documentType, contractId: doc.contractId ?? "", notes: doc.notes ?? "" });
    setEditDocDialogOpen(true);
  }

  function handleEditDocTypeChange(newType: string) {
    setEditDocForm((prev) => ({ ...prev, documentType: newType }));
  }

  function handleEditDocContractChange(contractId: string) {
    setEditDocForm((prev) => ({ ...prev, contractId: contractId === "none" ? "" : contractId }));
  }

  function handleSaveEditDoc() {
    if (!editingDoc) return;
    const body: Record<string, any> = {
      documentType: editDocForm.documentType,
      contractId: editDocForm.contractId || null,
      notes: editDocForm.notes,
    };
    updateDocMutation.mutate({ id: editingDoc.id, body });
  }

  const deleteDocMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("DELETE", `/api/vendor-documents/${id}`, { deletionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      setDeleteDocId(null);
      toast({ title: "Document removed", description: "The document has been removed and an audit record created." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove document", description: err.message || "Access denied or error occurred", variant: "destructive" });
    },
  });

  const archiveDocMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/vendor-documents/${id}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      toast({ title: "Document archived" });
    },
    onError: (err: any) => toast({ title: "Failed to archive", description: err.message, variant: "destructive" }),
  });

  const unarchiveDocMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/vendor-documents/${id}/unarchive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      toast({ title: "Document restored" });
    },
    onError: (err: any) => toast({ title: "Failed to restore", description: err.message, variant: "destructive" }),
  });

  const updateRetentionMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiRequest("PATCH", `/api/vendor-documents/${id}/retention`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });
      setRetentionEditDoc(null);
      toast({ title: "Retention settings updated" });
    },
    onError: (err: any) => toast({ title: "Failed to update retention", description: err.message, variant: "destructive" }),
  });

  interface DocAuditEntry {
    id: string; vendorId: string; documentId: string | null; documentName: string;
    documentType: string | null; action: string; userId: string; userEmail: string | null;
    userName: string | null; userRole: string | null; ipAddress: string | null;
    metadata: Record<string, unknown> | null; createdAt: string;
  }
  const { data: docAuditLogs = [], isLoading: docAuditLoading, refetch: refetchAudit } = useQuery<DocAuditEntry[]>({
    queryKey: ["/api/vendors", vendor.id, "documents", "audit"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/documents/audit`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!vendor.id,
  });

  const { data: retentionRules = [] } = useQuery<VendorDocumentRetentionRule[]>({
    queryKey: ["/api/vendor-document-retention-rules"],
    queryFn: async () => {
      const res = await fetch("/api/vendor-document-retention-rules", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ documentType, retentionDays, retentionCategory }: { documentType: string; retentionDays: number; retentionCategory: string }) =>
      apiRequest("PUT", `/api/vendor-document-retention-rules/${documentType}`, { retentionDays, retentionCategory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-document-retention-rules"] });
      setEditingRetentionRule(null);
      toast({ title: "Retention rule updated" });
    },
    onError: (err: any) => toast({ title: "Failed to update rule", description: err.message, variant: "destructive" }),
  });

  function deduplicateFiles(existing: BatchFile[], incoming: File[]): { valid: File[]; dupes: string[] } {
    const existingKeys = new Set(existing.map((f) => `${f.file.name}|${f.file.size}`));
    const valid: File[] = [];
    const dupes: string[] = [];
    for (const f of incoming) {
      const key = `${f.name}|${f.size}`;
      if (existingKeys.has(key)) {
        dupes.push(f.name);
      } else {
        valid.push(f);
        existingKeys.add(key);
      }
    }
    return { valid, dupes };
  }

  async function handleBatchUpload() {
    if (isBatchUploading) return;
    const snapshot = dragClassifyFiles;
    const pendingIndices = snapshot
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === "pending" || f.status === "failed")
      .map(({ i }) => i);
    if (pendingIndices.length === 0) return;

    setIsBatchUploading(true);
    setDragClassifyFiles((prev) =>
      prev.map((f, i) =>
        pendingIndices.includes(i) ? { ...f, status: "uploading" as const, error: "" } : f
      )
    );

    const settled = await Promise.allSettled(
      pendingIndices.map(async (idx) => {
        const item = snapshot[idx];
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("documentType", item.documentType);
        if (item.contractId) fd.append("contractId", item.contractId);
        if (item.notes) fd.append("notes", item.notes);
        const res = await fetch(`/api/vendors/${vendor.id}/documents`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to upload ${item.file.name}`);
        }
        return idx;
      })
    );

    const failMap: Record<number, string> = {};
    const successSet = new Set<number>();
    settled.forEach((r, pos) => {
      const idx = pendingIndices[pos];
      if (r.status === "fulfilled") successSet.add(idx);
      else failMap[idx] = (r as PromiseRejectedResult).reason?.message || "Upload failed";
    });

    setDragClassifyFiles((prev) =>
      prev.map((f, i) => {
        if (successSet.has(i)) return { ...f, status: "uploaded" as const, error: "" };
        if (failMap[i] !== undefined) return { ...f, status: "failed" as const, error: failMap[i] };
        return f;
      })
    );
    setIsBatchUploading(false);
    queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "documents"] });

    const succeeded = successSet.size;
    const failed = Object.keys(failMap).length;
    if (failed === 0) {
      toast({ title: `${succeeded} document${succeeded !== 1 ? "s" : ""} uploaded` });
    } else {
      toast({
        title: `${succeeded} uploaded, ${failed} failed`,
        description: "Review failed files and retry",
        variant: "destructive",
      });
    }
  }

  function handleDocUpload() {
    if (!docUploadForm.file) return;
    const fd = new FormData();
    fd.append("file", docUploadForm.file);
    fd.append("documentType", docUploadForm.documentType);
    if (docUploadForm.contractId) fd.append("contractId", docUploadForm.contractId);
    if (docUploadForm.notes) fd.append("notes", docUploadForm.notes);
    uploadDocMutation.mutate(fd);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canUploadDocs) return;
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!canUploadDocs) return;
    const all = Array.from(e.dataTransfer.files);
    const typeValid: File[] = [];
    const invalid: string[] = [];
    for (const f of all) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (DRAG_ACCEPTED_EXTS.includes(ext)) typeValid.push(f);
      else invalid.push(f.name);
    }
    if (invalid.length > 0) {
      toast({
        title: `${invalid.length} file${invalid.length !== 1 ? "s" : ""} rejected`,
        description: `Unsupported type: ${invalid.join(", ")}. Only PDF, DOC, DOCX, JPG, PNG are supported.`,
        variant: "destructive",
      });
    }
    if (typeValid.length > 0) {
      const { valid: deduped, dupes } = deduplicateFiles(dragClassifyFiles, typeValid);
      if (dupes.length > 0) {
        toast({ title: `${dupes.length} duplicate${dupes.length !== 1 ? "s" : ""} skipped`, description: dupes.join(", ") });
      }
      if (deduped.length > 0) {
        const newItems: BatchFile[] = deduped.map((f) => ({ file: f, documentType: "Other", contractId: "", notes: "", status: "pending", error: "" }));
        if (dragClassifyOpen) {
          setDragClassifyFiles((prev) => [...prev, ...newItems]);
        } else {
          setDragClassifyFiles(newItems);
          setDragClassifyOpen(true);
        }
      }
    }
  }

  function openDropzoneFilePicker(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const { valid: deduped, dupes } = deduplicateFiles(dragClassifyFiles, incoming);
    if (dupes.length > 0) {
      toast({ title: `${dupes.length} duplicate${dupes.length !== 1 ? "s" : ""} skipped`, description: dupes.join(", ") });
    }
    if (deduped.length === 0) return;
    const newItems: BatchFile[] = deduped.map((f) => ({ file: f, documentType: "Other", contractId: "", notes: "", status: "pending", error: "" }));
    if (dragClassifyOpen) {
      setDragClassifyFiles((prev) => [...prev, ...newItems]);
    } else {
      setDragClassifyFiles(newItems);
      setDragClassifyOpen(true);
    }
  }

  const filteredDocs = docRecords.filter((d) => {
    const matchesType = docTypeFilter === "all" || d.documentType === docTypeFilter;
    const matchesArchive = showArchivedDocs || (d as any).archiveStatus !== "archived";
    return matchesType && matchesArchive;
  });
  const archivedDocCount = docRecords.filter((d) => (d as any).archiveStatus === "archived").length;

  const primaryContact = contactRecords.find((c) => c.isPrimary);
  const hasPrimary = contactRecords.some((c) => c.isPrimary);
  const sortedContacts = [...contactRecords].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.escalationLevel - b.escalationLevel;
  });

  const { data: renewalAlerts = [] } = useQuery<VendorRenewalAlert[]>({
    queryKey: ["/api/vendors", vendor.id, "renewal-alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/renewal-alerts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/vendor-renewal-alerts/${alertId}/dismiss`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "renewal-alerts"] });
      toast({ title: "Alert dismissed" });
    },
  });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery<VendorAuditLog[]>({
    queryKey: ["/api/vendors", vendor.id, "audit-log"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendor.id}/audit-log?limit=50`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: auditExpanded,
  });

  function openContractEdit(c: VendorContract) {
    setContractForm({
      contractName: c.contractName,
      contractType: c.contractType,
      effectiveDate: (c as any).effectiveDate || "",
      startDate: c.startDate,
      endDate: c.endDate,
      autoRenew: c.autoRenew,
      renewalTermDays: c.renewalTermDays?.toString() || "",
      noticePeriodDays: c.noticePeriodDays?.toString() || "",
      contractStatus: c.contractStatus,
      slaSummary: c.slaSummary || "",
      noticeDeadlineDate: (c as any).noticeDeadlineDate || "",
      autoRenewalDate: (c as any).autoRenewalDate || "",
      renewalDecisionStatus: (c as any).renewalDecisionStatus || "undecided",
      renewalOwnerId: (c as any).renewalOwnerId || "",
    });
    setEditingContract(c);
  }

  function getContractStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    return "outline";
  }

  function getContractStatusClassName(status: string): string {
    switch (status) {
      case "active":      return "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "draft":       return "border-border text-muted-foreground";
      case "expired":     return "border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "terminated":  return "border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:            return "border-border text-muted-foreground";
    }
  }

  function isInRenewalWindow(c: VendorContract): boolean {
    if (!c.autoRenew || !c.noticePeriodDays || c.contractStatus !== "active") return false;
    const endDate = parseDateSafe(c.endDate);
    const noticeDate = new Date(endDate);
    noticeDate.setDate(noticeDate.getDate() - c.noticePeriodDays);
    return new Date() >= noticeDate && new Date() <= endDate;
  }

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const defaultNoteForm = { noteType: "general" as string, severity: "low" as string, noteBody: "", isPinned: false };
  const [noteForm, setNoteForm] = useState(defaultNoteForm);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(noteSearch), 300);
    return () => clearTimeout(timer);
  }, [noteSearch]);

  const { data: noteRecords = [], isLoading: notesLoading } = useQuery<VendorNote[]>({
    queryKey: ["/api/vendors", vendor.id, "notes", debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : "";
      const res = await fetch(`/api/vendors/${vendor.id}/notes${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: typeof noteForm) => {
      const res = await apiRequest("POST", `/api/vendors/${vendor.id}/notes`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "notes"] });
      setNoteDialogOpen(false);
      setNoteForm(defaultNoteForm);
      toast({ title: "Note added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add note", description: err.message, variant: "destructive" });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/vendor-notes/${id}/pin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "notes"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to toggle pin", description: err.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/vendor-notes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendor.id, "notes"] });
      setDeleteNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete note", description: err.message, variant: "destructive" });
    },
  });

  function getNoteTypeIcon(type: string) {
    switch (type) {
      case "issue": return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "win": return <Trophy className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case "billing": return <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case "compliance": return <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
      case "renewal": return <RefreshCw className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      default: return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  }

  function getSeverityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "default";
      default: return "secondary";
    }
  }

  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);
  const [editingCompliance, setEditingCompliance] = useState<VendorCompliance | null>(null);
  const defaultComplianceForm = {
    complianceType: "COI" as string,
    expirationDate: "",
    reminderDaysBefore: "30",
    documentId: "" as string,
    notes: "",
  };
  const [complianceForm, setComplianceForm] = useState(defaultComplianceForm);

  const createComplianceMutation = useMutation({
    mutationFn: async (data: typeof complianceForm) => {
      const payload = {
        ...data,
        reminderDaysBefore: parseInt(data.reminderDaysBefore) || 30,
        documentId: data.documentId || null,
      };
      const res = await apiRequest("POST", `/api/vendors/${vendor.id}/compliance`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/compliance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/compliance-summary"] });
      setComplianceDialogOpen(false);
      setComplianceForm(defaultComplianceForm);
      setEditingCompliance(null);
      toast({ title: "Compliance record created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create compliance record", description: err.message, variant: "destructive" });
    },
  });

  const updateComplianceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof complianceForm }) => {
      const payload = {
        ...data,
        reminderDaysBefore: parseInt(data.reminderDaysBefore) || 30,
        documentId: data.documentId || null,
      };
      const res = await apiRequest("PUT", `/api/vendor-compliance/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/compliance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/compliance-summary"] });
      setEditingCompliance(null);
      setComplianceForm(defaultComplianceForm);
      setComplianceDialogOpen(false);
      toast({ title: "Compliance record updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update compliance record", description: err.message, variant: "destructive" });
    },
  });

  const deleteComplianceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/vendor-compliance/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}/compliance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/compliance-summary"] });
      toast({ title: "Compliance record deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete compliance record", description: err.message, variant: "destructive" });
    },
  });

  function openComplianceEdit(c: VendorCompliance) {
    setComplianceForm({
      complianceType: c.complianceType,
      expirationDate: c.expirationDate,
      reminderDaysBefore: c.reminderDaysBefore.toString(),
      documentId: c.documentId || "",
      notes: c.notes || "",
    });
    setEditingCompliance(c);
    setComplianceDialogOpen(true);
  }

  const activeContract = contracts.find((c) => c.contractStatus === "active");
  const currentRates = pricingRecords.filter(isPricingCurrent);
  const hasExpiredContract = contracts.some((c) => c.contractStatus === "expired");
  const hasRenewalSoon = activeContract && (() => {
    const end = parseDateSafe(activeContract.endDate);
    const now = new Date();
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 60;
  })();
  const missingDocTypes: string[] = [];
  const docTypes = docRecords.map((d) => d.documentType);
  if (!docTypes.includes("W9")) missingDocTypes.push("W-9");
  if (!docTypes.includes("COI")) missingDocTypes.push("Insurance");

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ── Sticky identity header + workspace nav ── */}
      <div className="sticky top-0 z-50 bg-background -mx-4 lg:-mx-6 px-4 lg:px-6 -mt-4 lg:-mt-6 border-b border-border">
      <div className="flex items-center justify-between gap-4 flex-wrap pt-4 lg:pt-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-vendors">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <LogoUploadTrigger vendor={vendor} onVendorUpdate={onVendorUpdate} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold truncate" data-testid="text-vendor-detail-name">{vendor.name}</h1>
              <StatusBadge status={vendor.status} data-testid="badge-vendor-detail-status" />
            </div>
            {vendor.legalName && <p className="text-sm text-muted-foreground truncate">{vendor.legalName}</p>}
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {vendor.vendorOwner && (
                <span data-testid="text-vendor-detail-owner">
                  <Users className="inline h-3.5 w-3.5 mr-1" />
                  Owner: <span className="font-medium text-foreground">{getUserNameDetail(vendor.vendorOwner)}</span>
                </span>
              )}
              {vendor.secondaryOwnerId && (
                <span data-testid="text-vendor-detail-secondary-owner">
                  Secondary: <span className="font-medium text-foreground">{getUserNameDetail(vendor.secondaryOwnerId)}</span>
                </span>
              )}
              {!vendor.vendorOwner && vendor.status === "active" && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-no-owner">
                  <AlertTriangle className="mr-1 h-3 w-3" />No Owner Assigned
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasRenewalSoon && (
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-header-renewal-soon">
              <Clock className="mr-1 h-3 w-3" />Renewal Due
            </Badge>
          )}
          {hasExpiredContract && (
            <Badge variant="destructive" className="text-xs" data-testid="badge-header-expired">
              <AlertTriangle className="mr-1 h-3 w-3" />Expired Contract
            </Badge>
          )}
          {missingDocTypes.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs border-red-500 text-red-600 dark:text-red-400" data-testid="badge-header-missing-docs">
                  <FileText className="mr-1 h-3 w-3" />Missing Docs
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Missing: {missingDocTypes.join(", ")}</TooltipContent>
            </Tooltip>
          )}
          {expiredCompliance.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="text-xs" data-testid="badge-header-compliance-expired">
                  <ShieldAlert className="mr-1 h-3 w-3" />{expiredCompliance.length} Expired
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Expired: {expiredCompliance.map(c => c.complianceType).join(", ")}</TooltipContent>
            </Tooltip>
          )}
          {expiringCompliance.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-header-compliance-expiring">
                  <ShieldAlert className="mr-1 h-3 w-3" />{expiringCompliance.length} Expiring
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Expiring soon: {expiringCompliance.map(c => c.complianceType).join(", ")}</TooltipContent>
            </Tooltip>
          )}
          {!vendor.w9OnFile && (
            <Badge variant="outline" className="text-xs" data-testid="badge-header-no-w9">No W-9</Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-xs ${vendorAccessLevel.color}`} data-testid="badge-vendor-access-level">
                <ShieldAlert className="mr-1 h-3 w-3" />{vendorAccessLevel.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Vendor Access: {vendorAccessLevel.tier}. System Role: {authUser?.role ?? "unknown"}</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={onEdit} data-testid="button-edit-vendor-detail">
            <Pencil className="mr-1 h-3 w-3" />Edit
          </Button>
          {vendor.status === "active" && (
            <Button variant="outline" size="sm" onClick={onArchive} data-testid="button-archive-vendor-detail">
              <Archive className="mr-1 h-3 w-3" />Archive
            </Button>
          )}
        </div>
      </div>
      <RecordWorkspaceTabs
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "financials", label: "Financials" },
          { value: "compliance", label: "Compliance" },
          { value: "performance", label: "Performance" },
          { value: "ai-review", label: "AI Contract Review" },
          { value: "invoice-audit", label: "Invoice Audit" },
          { value: "license", label: "License & Docs" },
          { value: "scorecard", label: "Scorecard" },
          { value: "obligations", label: "Obligations" },
          { value: "default-coding", label: "Default Coding" },
          { value: "audit", label: "Audit Log" },
        ]}
        activeTab={vendorActiveTab}
        onTabChange={setVendorActiveTab}
      />
      </div>

      {(() => {
        const now = new Date();
        const threshold = new Date(); threshold.setDate(threshold.getDate() + 14);
        const overdueObs = vendorObligations.filter(ob =>
          ob.status !== "closed" && ob.status !== "waived" && ob.status !== "compliant" && ob.status !== "completed" &&
          ob.dueDate && new Date(ob.dueDate) < now
        );
        const dueSoonObs = vendorObligations.filter(ob =>
          ob.status !== "closed" && ob.status !== "waived" && ob.status !== "compliant" && ob.status !== "completed" &&
          ob.dueDate && new Date(ob.dueDate) >= now && new Date(ob.dueDate) <= threshold
        );
        if (overdueObs.length === 0 && dueSoonObs.length === 0) return null;
        return (
          <div className="space-y-2" data-testid="obligation-alerts-container">
            {overdueObs.length > 0 && (
              <div
                className="flex items-start gap-3 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
                data-testid="alert-obligations-overdue"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{overdueObs.length} Overdue Obligation{overdueObs.length !== 1 ? "s" : ""}</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    {overdueObs.slice(0, 3).map(ob => ob.title).join(", ")}{overdueObs.length > 3 ? ` +${overdueObs.length - 3} more` : ""} &bull; View the Obligations tab for details
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setVendorActiveTab("obligations")} data-testid="button-view-overdue-obligations">
                  View
                </Button>
              </div>
            )}
            {dueSoonObs.length > 0 && (
              <div
                className="flex items-start gap-3 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                data-testid="alert-obligations-due-soon"
              >
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{dueSoonObs.length} Obligation{dueSoonObs.length !== 1 ? "s" : ""} Due Within 14 Days</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    {dueSoonObs.slice(0, 3).map(ob => `${ob.title} (${formatDate(ob.dueDate!)})`).join(", ")}{dueSoonObs.length > 3 ? ` +${dueSoonObs.length - 3} more` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setVendorActiveTab("obligations")} data-testid="button-view-due-soon-obligations">
                  View
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {renewalAlerts.length > 0 && (
        <div className="space-y-2" data-testid="renewal-alerts-container">
          {renewalAlerts.map((alert) => {
            const isRenewal = alert.alertType === "renewal_due_soon";
            const linkedContract = contracts.find((c) => c.id === alert.contractId);
            return (
              <div
                key={alert.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-md border ${
                  isRenewal
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
                }`}
                data-testid={`alert-${alert.alertType}-${alert.id}`}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {isRenewal ? (
                    <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {isRenewal
                        ? `Renewal Due Soon - ${alert.daysRemaining} days remaining`
                        : `Cancellation Window Closing - ${alert.daysRemaining} days to give notice`}
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {linkedContract ? `Contract: ${linkedContract.contractName}` : ""}
                      {" \u2022 "}Ends {new Date(alert.contractEndDate).toLocaleDateString()}
                      {!isRenewal && linkedContract?.noticePeriodDays ? ` \u2022 ${linkedContract.noticePeriodDays}-day notice period` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => dismissAlertMutation.mutate(alert.id)}
                  disabled={dismissAlertMutation.isPending}
                  data-testid={`button-dismiss-alert-${alert.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div data-testid="vendor-summary-bar" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-summary-active-contracts">{contracts.filter(c => c.contractStatus === "active").length}</div>
            <p className="text-xs text-muted-foreground mt-1">{contracts.length} total contract{contracts.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Spend</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-summary-ytd-spend">
              {vendorSpend?.ytdSpend != null
                ? `$${vendorSpend.ytdSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "\u2014"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Year to date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div data-testid="text-summary-risk-level">
              {riskAssessment?.currentRiskLevel ? (
                <Badge
                  variant={riskAssessment.currentRiskLevel === "critical" || riskAssessment.currentRiskLevel === "high" ? "destructive" : riskAssessment.currentRiskLevel === "medium" ? "outline" : "secondary"}
                  className={riskAssessment.currentRiskLevel === "medium" ? "border-amber-500 text-amber-600 dark:text-amber-400 text-base" : "text-base"}
                >
                  {riskAssessment.currentRiskLevel.charAt(0).toUpperCase() + riskAssessment.currentRiskLevel.slice(1)}
                </Badge>
              ) : (
                <span className="text-2xl font-bold">{"\u2014"}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current assessment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div data-testid="text-summary-compliance">
              {expiredCompliance.length > 0 ? (
                <Badge variant="destructive" className="text-base">{expiredCompliance.length} Expired</Badge>
              ) : expiringCompliance.length > 0 ? (
                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-base">{expiringCompliance.length} Expiring</Badge>
              ) : (
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">OK</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{complianceRecords.length} record{complianceRecords.length !== 1 ? "s" : ""} tracked</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={vendorActiveTab} onValueChange={setVendorActiveTab} className="space-y-4">
        <TabsList className="hidden">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="financials" data-testid="tab-financials">Financials</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
          <TabsTrigger value="ai-review" data-testid="tab-ai-review" className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI Review
            {aiReviews.length > 0 && <Badge variant="secondary" className="text-xs ml-0.5 no-default-active-elevate">{aiReviews.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="invoice-audit" data-testid="tab-invoice-audit" className="flex items-center gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" />
            Invoice Audit
            {(auditSummary?.exceptions ?? 0) > 0 && <Badge className="text-[10px] ml-0.5 bg-red-500 text-white no-default-active-elevate">{auditSummary!.exceptions}</Badge>}
            {(auditSummary?.exceptions ?? 0) === 0 && (auditSummary?.warnings ?? 0) > 0 && <Badge className="text-[10px] ml-0.5 bg-amber-500 text-white no-default-active-elevate">{auditSummary!.warnings}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="license" data-testid="tab-license" className="flex items-center gap-1.5">
            License
            {licenseLatest && parseFloat(licenseLatest.utilizationPercent ?? "100") < 60 && (
              <Badge className="text-[10px] ml-0.5 bg-amber-500 text-white no-default-active-elevate">Low</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="scorecard" data-testid="tab-scorecard" className="flex items-center gap-1.5">
            Value Scorecard
            {valueScorecardLatest?.overallScore != null && (
              <Badge variant="secondary" className="text-[10px] ml-0.5 no-default-active-elevate">
                {parseFloat(valueScorecardLatest.overallScore).toFixed(0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="default-coding" data-testid="tab-default-coding">Default Coding</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" data-testid="tabcontent-overview">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold" data-testid="text-contracts-heading">Contracts</CardTitle>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-contract-count">{contracts.length}</Badge>
                </div>
                {(["Admin", "Finance"].includes(vendorAccessLevel.tier) || canManageContractsOverride) && (
                  <Button size="sm" onClick={() => { setContractForm(defaultContractForm); setContractDialogOpen(true); }} data-testid="button-add-contract">
                    <Plus className="mr-1 h-4 w-4" />Add Contract
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {contractsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-contracts">No contracts yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c) => (
                      <TableRow key={c.id} data-testid={`row-contract-${c.id}`} className="cursor-pointer hover-elevate" onClick={() => setSelectedContract(c)}>
                        <TableCell>
                          <span className="font-medium text-sm text-primary underline-offset-2 hover:underline" data-testid={`text-contract-name-${c.id}`}>{c.contractName}</span>
                          {c.slaSummary && <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{c.slaSummary}</p>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{c.contractType}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant={getContractStatusVariant(c.contractStatus)} className={getContractStatusClassName(c.contractStatus)} data-testid={`badge-contract-status-${c.id}`}>{c.contractStatus}</Badge>
                            {isInRenewalWindow(c) && (
                              <Badge variant="destructive" className="text-xs" data-testid={`badge-renewal-window-${c.id}`}>
                                <AlertTriangle className="mr-1 h-3 w-3" />Window
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(c.startDate)} - {formatDate(c.endDate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {c.autoRenew ? (
                              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" />Auto{c.renewalTermDays ? ` ${c.renewalTermDays}d` : ""}</span>
                            ) : (
                              <span>Manual</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openContractEdit(c)} data-testid={`button-edit-contract-${c.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold" data-testid="text-pricing-heading">Pricing & Rate Cards</CardTitle>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-pricing-count">{pricingRecords.length}</Badge>
                </div>
                {(["Admin", "Finance"].includes(vendorAccessLevel.tier) || canManagePricingOverride) && (
                  <Button size="sm" onClick={() => { setPricingForm(defaultPricingForm); setPricingDialogOpen(true); }} data-testid="button-add-pricing">
                    <Plus className="mr-1 h-4 w-4" />Add Rate Card
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pricingLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : pricingRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <DollarSign className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-pricing">No pricing records yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pricingRecords.map((p) => {
                    const current = isPricingCurrent(p);
                    const linkedContract = contracts.find((c) => c.id === p.contractId);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-2 rounded-md border" data-testid={`row-pricing-${p.id}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                          <span className="font-semibold" data-testid={`text-pricing-rate-${p.id}`}>${parseFloat(p.unitRate).toFixed(2)}</span>
                          <span className="text-sm text-muted-foreground">/ {p.unitDescription}</span>
                          <Badge variant="outline" className="text-xs capitalize">{p.pricingType.replace("_", " ")}</Badge>
                          {current ? (
                            <Badge variant="default" className="text-xs" data-testid={`badge-pricing-current-${p.id}`}>Current</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-pricing-historical-${p.id}`}>Historical</Badge>
                          )}
                          {linkedContract && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />{linkedContract.contractName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(p.effectiveStart).toLocaleDateString()}{p.effectiveEnd ? ` - ${new Date(p.effectiveEnd).toLocaleDateString()}` : "+"}
                          </span>
                          <Button variant="ghost" size="icon" onClick={() => openPricingEdit(p)} data-testid={`button-edit-pricing-${p.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={isDragOver && canUploadDocs ? "border-primary ring-1 ring-primary transition-colors" : "transition-colors"}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold" data-testid="text-documents-heading">Document Library</CardTitle>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-documents-count">{docRecords.length - archivedDocCount}</Badge>
                  {archivedDocCount > 0 && (
                    <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline" onClick={() => setShowArchivedDocs((v) => !v)} data-testid="button-toggle-archived">
                      {showArchivedDocs ? "Hide" : "Show"} {archivedDocCount} archived
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                    <SelectTrigger className="w-[140px]" data-testid="select-doc-type-filter">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {DOC_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canUploadDocs && (
                    <Button size="sm" onClick={() => { setDocUploadForm({ documentType: "Other", contractId: "", notes: "", file: null }); setDocDialogOpen(true); }} data-testid="button-upload-document">
                      <Upload className="mr-1 h-4 w-4" />Upload
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : filteredDocs.length === 0 ? (
                canUploadDocs ? (
                  <label
                    htmlFor="doc-dropzone-empty"
                    className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${isDragOver ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50"}`}
                    data-testid="dropzone-empty"
                  >
                    <Upload className="h-6 w-6 mb-2" />
                    <p className="text-sm font-medium">Drag files here or click to upload</p>
                    <p className="text-xs mt-0.5 opacity-70">PDF, DOCX, JPG, PNG supported</p>
                    <p className="text-xs mt-2 opacity-50" data-testid="text-no-documents">{docTypeFilter === "all" ? "No documents yet" : `No ${docTypeFilter} documents`}</p>
                    <input
                      id="doc-dropzone-empty"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => { openDropzoneFilePicker(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                      data-testid="input-dropzone-file"
                    />
                  </label>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-no-documents">{docTypeFilter === "all" ? "No documents yet" : `No ${docTypeFilter} documents`}</p>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {filteredDocs.map((d) => {
                      const linkedContract = contracts.find((c) => c.id === d.contractId);
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-3 p-2 rounded-md border" data-testid={`row-document-${d.id}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate" data-testid={`text-doc-name-${d.id}`}>{d.fileName}</span>
                            <Badge variant="outline" className="text-xs">{d.documentType}</Badge>
                            {(d as any).archiveStatus === "archived" && (
                              <Badge className="text-[10px] bg-muted text-muted-foreground no-default-active-elevate">Archived</Badge>
                            )}
                            {(d as any).retainUntil && (
                              <Badge variant="outline" className="text-[10px] no-default-active-elevate flex items-center gap-0.5 text-muted-foreground">
                                <CalendarDays className="h-2.5 w-2.5" />
                                Retain until {new Date((d as any).retainUntil).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                              </Badge>
                            )}
                            {linkedContract
                              ? <Badge variant="secondary" className="text-xs">{linkedContract.contractName}</Badge>
                              : CONTRACT_DOC_TYPES.has(d.documentType)
                                ? (
                                  <span className="flex items-center gap-1 flex-wrap">
                                    <span className="text-xs text-muted-foreground" data-testid={`badge-contract-doc-unlinked-${d.id}`}>Stored as document only</span>
                                    {contracts.length > 0 && (
                                      <button
                                        type="button"
                                        className="text-xs text-primary underline underline-offset-2 hover:no-underline shrink-0"
                                        onClick={(e) => { e.stopPropagation(); openEditDoc(d); }}
                                        data-testid={`button-quick-link-doc-${d.id}`}
                                      >Link to contract</button>
                                    )}
                                    <button
                                      type="button"
                                      className="text-xs text-primary underline underline-offset-2 hover:no-underline shrink-0"
                                      onClick={(e) => { e.stopPropagation(); openCreateContractFromDoc(d); }}
                                      data-testid={`button-create-contract-from-doc-${d.id}`}
                                    >Create managed contract</button>
                                  </span>
                                )
                                : null
                            }
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">{new Date(d.uploadedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" asChild data-testid={`button-view-doc-${d.id}`}>
                                  <a href={`/api/vendor-documents/${d.id}/view`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open in browser</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => downloadVendorDoc(d.id, d.fileName)} data-testid={`button-download-doc-${d.id}`}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download file</TooltipContent>
                            </Tooltip>
                            {["pdf", "doc", "docx"].includes(d.fileName.split(".").pop()?.toLowerCase() ?? "") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => runAiReviewFromDoc(d.id, d.fileName)} disabled={aiReviewingDocIds.has(d.id)} data-testid={`button-ai-review-doc-${d.id}`}>
                                    {aiReviewingDocIds.has(d.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Run AI review</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openEditDoc(d)} data-testid={`button-edit-doc-${d.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit document</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => { setRetentionEditDoc(d); setRetentionEditForm({ retainUntil: (d as any).retainUntil ?? "", retentionCategory: (d as any).retentionCategory ?? "standard" }); }} data-testid={`button-retention-doc-${d.id}`}>
                                  <CalendarDays className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit retention</TooltipContent>
                            </Tooltip>
                            {canUploadDocs && (
                              (d as any).archiveStatus === "archived" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => unarchiveDocMutation.mutate(d.id)} disabled={unarchiveDocMutation.isPending} data-testid={`button-unarchive-doc-${d.id}`}>
                                      <ArchiveRestore className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Restore from archive</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => archiveDocMutation.mutate(d.id)} disabled={archiveDocMutation.isPending} data-testid={`button-archive-doc-${d.id}`}>
                                      <Archive className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Archive document</TooltipContent>
                                </Tooltip>
                              )
                            )}
                            {canDeleteDocs && (
                              <Button variant="ghost" size="icon" onClick={() => setDeleteDocTarget({ id: d.id, fileName: d.fileName })} data-testid={`button-delete-doc-${d.id}`}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canUploadDocs && (
                    <label
                      htmlFor="doc-dropzone-compact"
                      className={`flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-3 cursor-pointer transition-colors ${isDragOver ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50"}`}
                      data-testid="dropzone-compact"
                    >
                      <Upload className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Drag files here or click to upload</span>
                      <span className="text-xs opacity-60 hidden sm:inline">PDF, DOCX, JPG, PNG</span>
                      <input
                        id="doc-dropzone-compact"
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="sr-only"
                        onChange={(e) => { openDropzoneFilePicker(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                        data-testid="input-dropzone-compact-file"
                      />
                    </label>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document Audit Trail */}
          {(() => {
            const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
              upload:          { label: "Uploaded",        icon: <Upload className="h-3.5 w-3.5" />,       color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
              download:        { label: "Downloaded",      icon: <Download className="h-3.5 w-3.5" />,     color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
              view:            { label: "Viewed",          icon: <Eye className="h-3.5 w-3.5" />,          color: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800" },
              replace:         { label: "Replaced",        icon: <RefreshCw className="h-3.5 w-3.5" />,    color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
              delete:          { label: "Deleted",         icon: <Trash2 className="h-3.5 w-3.5" />,       color: "text-destructive bg-destructive/5 border-destructive/20" },
              archive:         { label: "Archived",        icon: <Archive className="h-3.5 w-3.5" />,      color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
              restore:         { label: "Restored",        icon: <ArchiveRestore className="h-3.5 w-3.5" />, color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800" },
              metadata_update: { label: "Updated",         icon: <Pencil className="h-3.5 w-3.5" />,       color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800" },
            };

            const filteredAudit = docAuditLogs.filter((e) => {
              const matchesAction = auditActionFilter === "all" || e.action === auditActionFilter;
              const matchesDoc = !auditDocSearch.trim() || e.documentName.toLowerCase().includes(auditDocSearch.toLowerCase());
              return matchesAction && matchesDoc;
            });

            return (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold">Document Audit Trail</CardTitle>
                      <Badge variant="secondary" className="text-xs">{filteredAudit.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          placeholder="Filter by document…"
                          value={auditDocSearch}
                          onChange={(e) => setAuditDocSearch(e.target.value)}
                          className="pl-7 h-8 w-44 text-xs"
                          data-testid="input-audit-doc-search"
                        />
                      </div>
                      <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-audit-action-filter">
                          <SelectValue placeholder="All Actions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Actions</SelectItem>
                          {Object.entries(ACTION_META).map(([key, meta]) => (
                            <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => refetchAudit()} data-testid="button-refresh-audit">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {docAuditLoading ? (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
                    </div>
                  ) : filteredAudit.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {docAuditLogs.length === 0 ? "No activity recorded yet. Actions on documents will appear here." : "No events match the current filters."}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredAudit.map((entry) => {
                        const meta = ACTION_META[entry.action] ?? { label: entry.action, icon: <History className="h-3.5 w-3.5" />, color: "text-muted-foreground bg-muted border-border" };
                        const when = (() => {
                          try {
                            const d = new Date(entry.createdAt);
                            return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                          } catch { return entry.createdAt; }
                        })();
                        const actor = entry.userName || entry.userEmail || entry.userId;
                        return (
                          <div key={entry.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors" data-testid={`audit-entry-${entry.id}`}>
                            <div className={`mt-0.5 shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${meta.color}`}>
                              {meta.icon}
                              <span className="hidden sm:inline">{meta.label}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug truncate font-medium">{entry.documentName}</p>
                              {entry.documentType && (
                                <span className="text-xs text-muted-foreground">{entry.documentType}</span>
                              )}
                              {entry.action === "delete" && entry.metadata && (entry.metadata as any).deletionReason && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic truncate">
                                  Reason: {String((entry.metadata as any).deletionReason)}
                                </p>
                              )}
                              {entry.action === "metadata_update" && entry.metadata && (entry.metadata as any).changes && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  Fields: {Object.keys((entry.metadata as any).changes).join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs text-muted-foreground whitespace-nowrap">{when}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">{actor}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Retention Rules */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Default Retention Rules</CardTitle>
                  <Badge variant="secondary" className="text-xs">{retentionRules.length}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {retentionRules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No rules configured</p>
              ) : (
                <div className="space-y-1">
                  {retentionRules.map((rule) => {
                    const isEditing = editingRetentionRule?.documentType === rule.documentType;
                    const catLabel: Record<string, string> = { standard: "Standard", legal_hold: "Legal Hold", regulatory: "Regulatory", permanent: "Permanent" };
                    return (
                      <div key={rule.documentType} className="flex items-center gap-3 p-2 rounded-md border" data-testid={`row-retention-rule-${rule.documentType}`}>
                        {isEditing ? (
                          <>
                            <span className="text-xs font-medium w-32 shrink-0">{DOC_TYPE_OPTIONS.find((o) => o.value === rule.documentType)?.label ?? rule.documentType}</span>
                            <Input
                              type="number"
                              min={0}
                              className="w-24"
                              value={editingRetentionRule!.retentionDays}
                              onChange={(e) => setEditingRetentionRule((r) => r ? { ...r, retentionDays: e.target.value } : r)}
                              data-testid={`input-retention-days-${rule.documentType}`}
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                            <select
                              className="text-xs border rounded-md px-2 py-1 bg-background text-foreground"
                              value={editingRetentionRule!.retentionCategory}
                              onChange={(e) => setEditingRetentionRule((r) => r ? { ...r, retentionCategory: e.target.value } : r)}
                              data-testid={`select-retention-category-${rule.documentType}`}
                            >
                              <option value="standard">Standard</option>
                              <option value="legal_hold">Legal Hold</option>
                              <option value="regulatory">Regulatory</option>
                              <option value="permanent">Permanent</option>
                            </select>
                            <div className="flex items-center gap-1 ml-auto">
                              <Button size="sm" onClick={() => updateRuleMutation.mutate({ documentType: rule.documentType, retentionDays: parseInt(editingRetentionRule!.retentionDays) || 0, retentionCategory: editingRetentionRule!.retentionCategory })} disabled={updateRuleMutation.isPending} data-testid={`button-save-rule-${rule.documentType}`}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRetentionRule(null)} data-testid={`button-cancel-rule-${rule.documentType}`}>Cancel</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-medium w-32 shrink-0">{DOC_TYPE_OPTIONS.find((o) => o.value === rule.documentType)?.label ?? rule.documentType}</span>
                            <span className="text-xs text-foreground font-medium">{rule.retentionDays} days</span>
                            <span className="text-xs text-muted-foreground">({Math.round(rule.retentionDays / 365 * 10) / 10}y)</span>
                            <Badge variant="outline" className="text-[10px] no-default-active-elevate">{catLabel[rule.retentionCategory] ?? rule.retentionCategory}</Badge>
                            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setEditingRetentionRule({ documentType: rule.documentType, retentionDays: String(rule.retentionDays), retentionCategory: rule.retentionCategory })} data-testid={`button-edit-rule-${rule.documentType}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold" data-testid="text-notes-heading">Notes &amp; Experience Log</CardTitle>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-notes-count">{noteRecords.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search notes..."
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      className="pl-8 w-[160px]"
                      data-testid="input-note-search"
                    />
                  </div>
                  {(vendorAccessLevel.tier !== "Read Only" || canManageNotesOverride) && (
                    <Button size="sm" onClick={() => { setNoteForm(defaultNoteForm); setNoteDialogOpen(true); }} data-testid="button-add-note">
                      <Plus className="mr-1 h-4 w-4" />Add Note
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {notesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : noteRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-notes">{debouncedSearch ? "No notes match your search" : "No notes yet"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {noteRecords.map((n) => (
                    <div key={n.id} className={`p-3 rounded-md border ${n.isPinned ? "border-primary/40" : ""}`} data-testid={`card-note-${n.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getNoteTypeIcon(n.noteType)}
                            <Badge variant="outline" className="text-xs capitalize">{n.noteType}</Badge>
                            <Badge variant={getSeverityVariant(n.severity)} className="text-xs capitalize">{n.severity}</Badge>
                            {n.isPinned && (
                              <Badge variant="default" className="text-xs" data-testid={`badge-note-pinned-${n.id}`}>
                                <Pin className="mr-1 h-3 w-3" />Pinned
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">{new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap line-clamp-3" data-testid={`text-note-body-${n.id}`}>{n.noteBody}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => togglePinMutation.mutate(n.id)} data-testid={`button-pin-note-${n.id}`}>
                                <Pin className={`h-4 w-4 ${n.isPinned ? "text-primary fill-primary" : ""}`} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{n.isPinned ? "Unpin" : "Pin"} note</TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteNoteId(n.id)} data-testid={`button-delete-note-${n.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Primary Contact</CardTitle>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setContactForm(defaultContactForm); setContactDialogOpen(true); }} data-testid="button-add-contact">
                  <Plus className="mr-1 h-4 w-4" />Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : primaryContact ? (
                <div className="space-y-2" data-testid="card-primary-contact">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" data-testid="text-primary-contact-name">{primaryContact.name}</span>
                    <Button variant="ghost" size="icon" onClick={() => openContactEdit(primaryContact)} data-testid="button-edit-primary-contact">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {primaryContact.title && <p className="text-sm text-muted-foreground">{primaryContact.title}</p>}
                  <div className="space-y-1 text-sm">
                    {primaryContact.email && (
                      <button
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                        onClick={() => copyToClipboard(primaryContact.email!, "Email")}
                        data-testid="button-copy-primary-email"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{primaryContact.email}</span>
                      </button>
                    )}
                    {primaryContact.phone && (
                      <button
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                        onClick={() => copyToClipboard(primaryContact.phone!, "Phone")}
                        data-testid="button-copy-primary-phone"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatPhone(primaryContact.phone)}</span>
                      </button>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{primaryContact.role}</Badge>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No primary contact set</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Vendor Info</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {vendor.vendorType && (
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p>{vendor.vendorType}</p>
                  </div>
                )}
                {vendor.category && (
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p>{vendor.category}</p>
                  </div>
                )}
                {vendor.paymentTerms && (
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Terms</p>
                    <p>{vendor.paymentTerms}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">W-9 on File</p>
                  <p>{vendor.w9OnFile ? "Yes" : "No"}</p>
                </div>
                {vendor.supportEmail && (
                  <div>
                    <p className="text-xs text-muted-foreground">Support Email</p>
                    <button className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" onClick={() => copyToClipboard(vendor.supportEmail!, "Email")}>
                      <Mail className="h-3 w-3" />{vendor.supportEmail}
                    </button>
                  </div>
                )}
                {vendor.supportPhone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Support Phone</p>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{vendor.supportPhone}</span>
                  </div>
                )}
                {vendor.website && (
                  <div>
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                      <Globe className="h-3 w-3" />Visit
                    </a>
                  </div>
                )}
                {vendor.supportPortalUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground">Support Portal</p>
                    <a href={vendor.supportPortalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                      <ExternalLink className="h-3 w-3" />Open
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold" data-testid="text-contacts-heading">All Contacts</CardTitle>
                <Badge variant="secondary" className="text-xs" data-testid="badge-contacts-count">{contactRecords.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : contactRecords.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground" data-testid="text-no-contacts">No contacts yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {!hasPrimary && (
                    <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-400" data-testid="text-no-primary-warning">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>No primary contact set</span>
                    </div>
                  )}
                  {sortedContacts.map((c) => (
                    <div key={c.id} className={`p-2 rounded-md border text-sm ${c.isPrimary ? "border-primary/40" : ""}`} data-testid={`card-contact-${c.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm" data-testid={`text-contact-name-${c.id}`}>{c.name}</span>
                            {c.isPrimary && (
                              <Badge variant="default" className="text-xs" data-testid={`badge-contact-primary-${c.id}`}>
                                <Star className="mr-1 h-3 w-3" />Primary
                              </Badge>
                            )}
                          </div>
                          {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs capitalize">{c.role}</Badge>
                            <Badge variant="secondary" className="text-xs">L{c.escalationLevel}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openContactEdit(c)} data-testid={`button-edit-contact-${c.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteContactId(c.id)} data-testid={`button-delete-contact-${c.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {c.email && (
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full text-left" onClick={() => copyToClipboard(c.email!, "Email")} data-testid={`button-copy-email-${c.id}`}>
                            <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span>
                          </button>
                        )}
                        {c.phone && (
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full text-left" onClick={() => copyToClipboard(c.phone!, "Phone")} data-testid={`button-copy-phone-${c.id}`}>
                            <Phone className="h-3 w-3 shrink-0" /><span>{formatPhone(c.phone)}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {currentRates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Active Rates</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {currentRates.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`sidebar-rate-${p.id}`}>
                      <span className="font-semibold">${parseFloat(p.unitRate).toFixed(2)}<span className="font-normal text-muted-foreground"> / {p.unitDescription}</span></span>
                      <Badge variant="outline" className="text-xs capitalize">{p.pricingType.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="financials" data-testid="tabcontent-financials">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Spend Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vendorSpend ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">YTD Spend</p>
                  <p className="text-lg font-bold" data-testid="text-ytd-spend">${vendorSpend.ytdSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prior Year</p>
                  <p className="text-lg font-bold" data-testid="text-prior-year-spend">${vendorSpend.priorYearSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Monthly</p>
                  <p className="text-lg font-bold" data-testid="text-avg-monthly-spend">${vendorSpend.averageMonthlySpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">YoY Change</p>
                  <p className={`text-lg font-bold ${vendorSpend.priorYearSpend > 0 ? (vendorSpend.ytdSpend > vendorSpend.priorYearSpend ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400") : ""}`} data-testid="text-yoy-change">
                    {vendorSpend.priorYearSpend > 0
                      ? `${vendorSpend.ytdSpend > vendorSpend.priorYearSpend ? "+" : ""}${Math.round(((vendorSpend.ytdSpend - vendorSpend.priorYearSpend) / vendorSpend.priorYearSpend) * 100)}%`
                      : "---"}
                  </p>
                </div>
              </div>
              {vendorSpend.monthlyTrend.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Monthly Trend (Last 12 Months)</p>
                  <div className="flex items-end gap-1 h-16" data-testid="chart-monthly-trend">
                    {vendorSpend.monthlyTrend.map((m) => {
                      const maxVal = Math.max(...vendorSpend.monthlyTrend.map(t => t.total));
                      const height = maxVal > 0 ? Math.max(4, (m.total / maxVal) * 64) : 4;
                      return (
                        <Tooltip key={m.month}>
                          <TooltipTrigger asChild>
                            <div
                              className="flex-1 bg-primary/70 rounded-t-sm min-w-1"
                              style={{ height: `${height}px` }}
                              data-testid={`bar-spend-${m.month}`}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{m.month}: ${m.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : spendLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No spend data available.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="compliance" data-testid="tabcontent-compliance" className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Risk Assessment
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setRiskForm({ riskLevel: vendor.riskLevel || "low", riskReason: vendor.riskReason || "" }); setRiskOverrideOpen(true); }} data-testid="button-override-risk">
              <Pencil className="mr-1 h-3 w-3" />
              Override
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {riskLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : riskAssessment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Current Risk Level</p>
                  <Badge
                    variant={riskAssessment.currentRiskLevel === "critical" ? "destructive" : riskAssessment.currentRiskLevel === "high" ? "destructive" : riskAssessment.currentRiskLevel === "medium" ? "outline" : "secondary"}
                    className={riskAssessment.currentRiskLevel === "medium" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}
                    data-testid="badge-current-risk"
                  >
                    {riskAssessment.currentRiskLevel === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                    {riskAssessment.currentRiskLevel === "high" && <ShieldAlert className="mr-1 h-3 w-3" />}
                    {riskAssessment.currentRiskLevel.charAt(0).toUpperCase() + riskAssessment.currentRiskLevel.slice(1)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Suggested Risk Level</p>
                  <Badge
                    variant={riskAssessment.suggestedRiskLevel === "critical" ? "destructive" : riskAssessment.suggestedRiskLevel === "high" ? "destructive" : riskAssessment.suggestedRiskLevel === "medium" ? "outline" : "secondary"}
                    className={riskAssessment.suggestedRiskLevel === "medium" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}
                    data-testid="badge-suggested-risk"
                  >
                    {riskAssessment.suggestedRiskLevel.charAt(0).toUpperCase() + riskAssessment.suggestedRiskLevel.slice(1)}
                  </Badge>
                  {riskAssessment.isEscalation && (
                    <Badge variant="outline" className="ml-2 text-xs border-red-500 text-red-600 dark:text-red-400" data-testid="badge-escalation-needed">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Escalation Suggested
                    </Badge>
                  )}
                </div>
              </div>
              {riskAssessment.currentRiskReason && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Risk Reason</p>
                  <p className="text-sm" data-testid="text-risk-reason">{riskAssessment.currentRiskReason}</p>
                </div>
              )}
              {riskAssessment.suggestedReasons.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Risk Factors Detected</p>
                  <ul className="space-y-1">
                    {riskAssessment.suggestedReasons.map((reason, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                        <span data-testid={`text-risk-factor-${i}`}>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {riskAssessment.isEscalation && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setRiskForm({ riskLevel: riskAssessment.suggestedRiskLevel, riskReason: riskAssessment.suggestedReasons.join("; ") });
                    setRiskOverrideOpen(true);
                  }}
                  data-testid="button-accept-escalation"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Accept Escalation to {riskAssessment.suggestedRiskLevel.charAt(0).toUpperCase() + riskAssessment.suggestedRiskLevel.slice(1)}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No risk data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Compliance & COI Tracking
              {expiredCompliance.length > 0 && (
                <Badge variant="destructive" className="text-xs">{expiredCompliance.length} expired</Badge>
              )}
              {expiringCompliance.length > 0 && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">{expiringCompliance.length} expiring</Badge>
              )}
            </CardTitle>
            {(vendorAccessLevel.tier === "Admin" || canManageComplianceOverride) && (
              <Button size="sm" onClick={() => { setComplianceForm(defaultComplianceForm); setEditingCompliance(null); setComplianceDialogOpen(true); }} data-testid="button-add-compliance">
                <Plus className="mr-1 h-3 w-3" />Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {complianceRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No compliance records tracked yet.</p>
          ) : (
            <div className="space-y-2">
              {complianceRecords.map((c) => {
                const statusVariant = c.status === "expired" ? "destructive" : c.status === "expiring_soon" ? "outline" : "secondary";
                const statusClass = c.status === "expiring_soon" ? "border-amber-500 text-amber-600 dark:text-amber-400" : "";
                const daysUntil = Math.ceil((new Date(c.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`row-compliance-${c.id}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge variant={statusVariant} className={`text-xs ${statusClass}`} data-testid={`badge-compliance-status-${c.id}`}>
                        {c.status === "expired" ? "Expired" : c.status === "expiring_soon" ? "Expiring Soon" : "Valid"}
                      </Badge>
                      <div className="min-w-0">
                        <span className="font-medium text-sm" data-testid={`text-compliance-type-${c.id}`}>{c.complianceType}</span>
                        <p className="text-xs text-muted-foreground">
                          Expires: {formatDate(c.expirationDate)}
                          {daysUntil > 0 ? ` (${daysUntil} days)` : daysUntil === 0 ? " (today)" : ` (${Math.abs(daysUntil)} days ago)`}
                        </p>
                        {c.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{c.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openComplianceEdit(c)} data-testid={`button-edit-compliance-${c.id}`}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteComplianceMutation.mutate(c.id)} data-testid={`button-delete-compliance-${c.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="performance" data-testid="tabcontent-performance">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Performance Scorecards
              {scorecards.length > 0 && (
                <Badge variant="secondary" className="text-xs">{scorecards.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => { setValueScorecardForm(defaultScorecardForm); setScorecardDialogOpen(true); }} data-testid="button-add-scorecard">
              <Plus className="mr-1 h-3 w-3" />Add Review
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {scorecards.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No performance reviews recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {scorecards.map((sc, idx) => {
                const scoreColor = sc.overallScore >= 80 ? "text-green-600 dark:text-green-400" : sc.overallScore >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                return (
                  <div key={sc.id} className="p-3 rounded-md border" data-testid={`row-scorecard-${sc.id}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-2xl font-bold ${scoreColor}`} data-testid={`text-score-${sc.id}`}>{sc.overallScore}</span>
                        <div>
                          <p className="text-sm font-medium">
                            {sc.reviewPeriodStart} to {sc.reviewPeriodEnd}
                            {idx === 0 && <Badge variant="secondary" className="ml-2 text-xs">Latest</Badge>}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>Quality: {sc.ratingQuality}/5</span>
                            <span>Timeliness: {sc.ratingTimeliness}/5</span>
                            <span>Support: {sc.ratingSupport}/5</span>
                            <span>Cost Control: {sc.ratingCostControl}/5</span>
                          </div>
                          {sc.notes && <p className="text-xs text-muted-foreground mt-1">{sc.notes}</p>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteValueScorecardMutation.mutate(sc.id)} data-testid={`button-delete-scorecard-${sc.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="ai-review" data-testid="tabcontent-ai-review">
          <div className="space-y-4">
            {/* Run new review */}
            {(() => {
              const parseableDocs = docRecords.filter((d) => {
                const ext = d.fileName.split(".").pop()?.toLowerCase() ?? "";
                return ["pdf", "doc", "docx"].includes(ext);
              });
              const isRunning = submitAiReviewMutation.isPending || submitAiReviewFromDocMutation.isPending;
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-semibold">AI Contract Review</CardTitle>
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">Beta</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant={aiReviewMode === "library" ? "secondary" : "ghost"} onClick={() => setAiReviewMode("library")} disabled={isRunning} data-testid="button-review-mode-library">
                          From Library
                        </Button>
                        <Button size="sm" variant={aiReviewMode === "upload" ? "secondary" : "ghost"} onClick={() => setAiReviewMode("upload")} disabled={isRunning} data-testid="button-review-mode-upload">
                          Upload File
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4 space-y-3">
                    {aiReviewMode === "library" ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Select an existing document from this vendor&apos;s library — no re-upload required.
                        </p>
                        {parseableDocs.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            No PDF or Word documents found in the document library. Upload one first, or switch to Upload File mode.
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Select value={aiReviewSelectedDocId} onValueChange={setAiReviewSelectedDocId} disabled={isRunning}>
                              <SelectTrigger className="flex-1 min-w-48 text-xs h-8" data-testid="select-ai-review-doc">
                                <SelectValue placeholder="Select a document…" />
                              </SelectTrigger>
                              <SelectContent>
                                {parseableDocs.map((d) => {
                                  const linkedContract = contracts.find((c) => c.id === d.contractId);
                                  return (
                                    <SelectItem key={d.id} value={d.id}>
                                      <span className="truncate">{d.fileName}</span>
                                      {linkedContract && <span className="text-xs text-muted-foreground ml-1">· {linkedContract.contractName}</span>}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={() => submitAiReviewFromDocMutation.mutate()}
                              disabled={!aiReviewSelectedDocId || isRunning}
                              data-testid="button-run-ai-review"
                            >
                              {submitAiReviewFromDocMutation.isPending ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analyzing…</>
                              ) : (
                                <><Brain className="h-3.5 w-3.5 mr-1.5" />Analyze Contract</>
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Upload a vendor agreement (PDF or Word). A document record will be created in the library.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button variant="outline" size="sm" onClick={() => document.getElementById("ai-review-file-input")?.click()} disabled={isRunning} data-testid="button-select-contract-file">
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            {aiReviewFile ? aiReviewFile.name : "Select PDF / DOCX"}
                          </Button>
                          <input
                            id="ai-review-file-input"
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={(e) => setAiReviewFile(e.target.files?.[0] ?? null)}
                            data-testid="input-ai-review-file"
                          />
                          <Button
                            size="sm"
                            onClick={() => submitAiReviewMutation.mutate()}
                            disabled={!aiReviewFile || isRunning}
                            data-testid="button-run-ai-review-upload"
                          >
                            {submitAiReviewMutation.isPending ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analyzing…</>
                            ) : (
                              <><Brain className="h-3.5 w-3.5 mr-1.5" />Analyze Contract</>
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Review list + detail */}
            {aiReviewsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : aiReviews.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
                  <Brain className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No AI reviews yet. Upload a vendor agreement above to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Review selector (left column) */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Reviews</p>
                  {aiReviews.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedReviewId(r.id); setIsEditingReview(false); }}
                      className={`w-full text-left rounded-md border p-3 transition-colors hover-elevate ${(selectedReview?.id === r.id) ? "bg-muted border-primary/40" : "border-border bg-card"}`}
                      data-testid={`button-select-review-${r.id}`}
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                        <span className="text-xs font-medium truncate max-w-[140px]">{r.fileName}</span>
                        {r.isEdited && <Badge variant="outline" className="text-[10px] no-default-active-elevate shrink-0">Edited</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{new Date(r.reviewedAt).toLocaleDateString()}</p>
                      <p className="text-[11px] text-muted-foreground">{r.reviewedByAiModel}</p>
                    </button>
                  ))}
                </div>

                {/* Review detail (right 2/3) */}
                {selectedReview && (
                  <div className="lg:col-span-2 space-y-4">
                    {/* Action bar */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{selectedReview.fileName}</span>
                        {selectedReview.isEdited && <Badge variant="outline" className="text-xs no-default-active-elevate">Manually Edited</Badge>}
                      </div>
                      {!isEditingReview ? (
                        <Button size="sm" variant="outline" onClick={() => beginEditReview(selectedReview)} data-testid="button-edit-review">
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Values
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setIsEditingReview(false)} data-testid="button-cancel-edit-review">Cancel</Button>
                          <Button size="sm" onClick={() => saveAiReviewEditsMutation.mutate(selectedReview.id)} disabled={saveAiReviewEditsMutation.isPending} data-testid="button-save-review-edits">
                            {saveAiReviewEditsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                            Save Edits
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Executive Summary */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <BadgeCheck className="h-4 w-4 text-emerald-500" />Executive Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isEditingReview ? (
                          <Textarea
                            value={editedSummary}
                            onChange={e => setEditedSummary(e.target.value)}
                            className="text-sm min-h-[80px]"
                            data-testid="textarea-edit-summary"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground leading-relaxed">{selectedReview.executiveSummary || "No summary available."}</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Risk Summary */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />Risk Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isEditingReview ? (
                          <Textarea
                            value={editedRisk}
                            onChange={e => setEditedRisk(e.target.value)}
                            className="text-sm min-h-[80px]"
                            data-testid="textarea-edit-risk"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground leading-relaxed">{selectedReview.riskSummary || "No risk summary available."}</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Extracted Fields */}
                    {(() => {
                      const extracted = (isEditingReview ? editedExtracted : (selectedReview.extractedJson as Record<string, any>)) || {};
                      const FIELDS = [
                        { key: "vendorName", label: "Vendor Name", multi: false },
                        { key: "contractType", label: "Contract Type", multi: false },
                        { key: "effectiveDate", label: "Effective Date", multi: false },
                        { key: "startDate", label: "Start Date", multi: false },
                        { key: "endDate", label: "End Date", multi: false },
                        { key: "autoRenewalClause", label: "Auto-Renewal", multi: false },
                        { key: "renewalTerm", label: "Renewal Term", multi: false },
                        { key: "noticeOfNonRenewalDeadline", label: "Notice of Non-Renewal", multi: false },
                        { key: "terminationRights", label: "Termination Rights", multi: true },
                        { key: "pricingTerms", label: "Pricing Terms", multi: true },
                        { key: "invoicingTerms", label: "Invoicing Terms", multi: true },
                        { key: "userLicenseCounts", label: "User / License Counts", multi: false },
                        { key: "serviceLevels", label: "Service Levels / SLA", multi: true },
                        { key: "supportTerms", label: "Support Terms", multi: true },
                        { key: "indemnificationSummary", label: "Indemnification / Liability", multi: true },
                      ];
                      return (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />Extracted Terms
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="divide-y divide-border">
                              {FIELDS.map(f => (
                                <div key={f.key} className="grid grid-cols-[160px_1fr] items-start px-4 py-2 gap-2">
                                  <span className="text-xs font-medium text-muted-foreground pt-0.5 shrink-0">{f.label}</span>
                                  {isEditingReview ? (
                                    f.multi ? (
                                      <Textarea
                                        value={typeof editedExtracted[f.key] === "string" ? editedExtracted[f.key] : (editedExtracted[f.key] ?? "")}
                                        onChange={e => setEditedExtracted(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        className="text-sm min-h-[56px] py-1"
                                        data-testid={`textarea-field-${f.key}`}
                                      />
                                    ) : (
                                      <Input
                                        value={typeof editedExtracted[f.key] === "string" ? editedExtracted[f.key] : (editedExtracted[f.key] ?? "")}
                                        onChange={e => setEditedExtracted(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        className="text-sm h-8"
                                        data-testid={`input-field-${f.key}`}
                                      />
                                    )
                                  ) : (
                                    <span className="text-sm text-foreground py-0.5 break-words">
                                      {extracted[f.key] != null && extracted[f.key] !== "" ? String(extracted[f.key]) : <span className="text-muted-foreground italic">Not found</span>}
                                    </span>
                                  )}
                                </div>
                              ))}

                              {/* Obligations */}
                              {(extracted.obligationsVendor || extracted.obligationsClient) && (
                                <>
                                  <div className="grid grid-cols-[160px_1fr] items-start px-4 py-2 gap-2">
                                    <span className="text-xs font-medium text-muted-foreground pt-0.5">Vendor Obligations</span>
                                    <ul className="text-sm space-y-1 py-0.5">
                                      {(Array.isArray(extracted.obligationsVendor) ? extracted.obligationsVendor : []).map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-1.5"><span className="text-primary mt-1 shrink-0">•</span>{item}</li>
                                      ))}
                                      {(!extracted.obligationsVendor || extracted.obligationsVendor.length === 0) && <li className="italic text-muted-foreground">None extracted</li>}
                                    </ul>
                                  </div>
                                  <div className="grid grid-cols-[160px_1fr] items-start px-4 py-2 gap-2">
                                    <span className="text-xs font-medium text-muted-foreground pt-0.5">Client Obligations</span>
                                    <ul className="text-sm space-y-1 py-0.5">
                                      {(Array.isArray(extracted.obligationsClient) ? extracted.obligationsClient : []).map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-1.5"><span className="text-primary mt-1 shrink-0">•</span>{item}</li>
                                      ))}
                                      {(!extracted.obligationsClient || extracted.obligationsClient.length === 0) && <li className="italic text-muted-foreground">None extracted</li>}
                                    </ul>
                                  </div>
                                </>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* Action Items */}
                    {(() => {
                      const items: any[] = isEditingReview ? editedActionItems : ((selectedReview.actionItems as any[]) || []);
                      if (items.length === 0 && !isEditingReview) return null;
                      return (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <ListChecks className="h-4 w-4 text-blue-500" />Action Items
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {items.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No action items identified.</p>
                            ) : (
                              <div className="space-y-2">
                                {items.map((item: any, i: number) => (
                                  <div key={i} className="flex items-start gap-3 text-sm border-b border-border pb-2 last:border-0">
                                    <Badge variant="outline" className={`text-[10px] shrink-0 no-default-active-elevate mt-0.5 ${item.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : item.priority === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                                      {item.priority || "low"}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium">{item.item}</p>
                                      {item.deadline && <p className="text-xs text-muted-foreground mt-0.5">Due: {item.deadline}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* Recommended Tracked Dates */}
                    {(() => {
                      const dates: any[] = (((selectedReview.extractedJson as any) || {}).recommendedTrackedDates) || [];
                      if (dates.length === 0) return null;
                      return (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-violet-500" />Recommended Tracked Dates
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {dates.map((d: any, i: number) => (
                                <div key={i} className="flex items-start gap-3 text-sm border-b border-border pb-2 last:border-0">
                                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{d.label}</span>
                                      {d.date && <Badge variant="outline" className="text-[10px] no-default-active-elevate">{d.date}</Badge>}
                                    </div>
                                    {d.reason && <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoice-audit" data-testid="tabcontent-invoice-audit">
          <div className="space-y-4">

            {/* Upload & Run header */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">Invoice Comparison</CardTitle>
                  </div>
                  <Select value={auditContractFilter} onValueChange={setAuditContractFilter}>
                    <SelectTrigger className="w-48 text-xs" data-testid="select-audit-contract">
                      <SelectValue placeholder="Auto-detect contract" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect contract</SelectItem>
                      {contracts.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contractName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-1 mt-2 p-0.5 rounded-md border bg-muted/40 w-fit">
                  <Button
                    size="sm"
                    variant={invoiceInputMode === "file" ? "default" : "ghost"}
                    onClick={() => setInvoiceInputMode("file")}
                    data-testid="button-mode-upload"
                    className="h-7 px-3 text-xs"
                  >
                    <Upload className="h-3 w-3 mr-1.5" />
                    Upload Invoice
                  </Button>
                  <Button
                    size="sm"
                    variant={invoiceInputMode === "text" ? "default" : "ghost"}
                    onClick={() => setInvoiceInputMode("text")}
                    data-testid="button-mode-paste"
                    className="h-7 px-3 text-xs"
                  >
                    <FileText className="h-3 w-3 mr-1.5" />
                    Paste Text
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0 pb-4 space-y-3">
                {invoiceInputMode === "file" ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="invoice-audit-file-input" className="cursor-pointer">
                      <Button asChild variant="outline" size="sm" data-testid="button-select-invoice-file">
                        <span>
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {invoiceAuditFile ? invoiceAuditFile.name : "Select Invoice PDF / DOCX"}
                        </span>
                      </Button>
                    </label>
                    <input
                      id="invoice-audit-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => setInvoiceAuditFile(e.target.files?.[0] ?? null)}
                      data-testid="input-invoice-audit-file"
                    />
                    {invoiceAuditFile && (
                      <Button size="icon" variant="ghost" onClick={() => setInvoiceAuditFile(null)} data-testid="button-clear-invoice-file">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PDF, DOC, or DOCX. Stored under this vendor record.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Textarea
                      placeholder="Paste invoice text here — copy from email, PDF, or any source…"
                      value={invoiceAuditText}
                      onChange={(e) => setInvoiceAuditText(e.target.value)}
                      rows={6}
                      className="text-xs font-mono resize-y"
                      data-testid="textarea-invoice-text"
                    />
                    <p className="text-xs text-muted-foreground">Text will be stored as a document under this vendor record.</p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <p className="text-xs text-muted-foreground">
                    AI will extract line items, compare against contracted rates, and flag discrepancies.
                  </p>
                  {invoiceInputMode === "file" ? (
                    <Button
                      size="sm"
                      onClick={() => submitInvoiceAuditMutation.mutate()}
                      disabled={!invoiceAuditFile || submitInvoiceAuditMutation.isPending}
                      data-testid="button-run-invoice-audit"
                    >
                      {submitInvoiceAuditMutation.isPending
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Auditing...</>
                        : <><ScanLine className="h-3.5 w-3.5 mr-1.5" />Run Comparison</>}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => submitInvoiceAuditTextMutation.mutate()}
                      disabled={!invoiceAuditText.trim() || submitInvoiceAuditTextMutation.isPending}
                      data-testid="button-run-invoice-audit-text"
                    >
                      {submitInvoiceAuditTextMutation.isPending
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Auditing...</>
                        : <><ScanLine className="h-3.5 w-3.5 mr-1.5" />Run Comparison</>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Variance summary bar */}
            {auditSummary && auditSummary.total > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md border border-border bg-card px-4 py-3">
                  <p className="text-[11px] text-muted-foreground font-medium">Total Audited</p>
                  <p className="text-lg font-bold">{auditSummary.total}</p>
                </div>
                <div className={`rounded-md border px-4 py-3 ${auditSummary.exceptions > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/30" : "border-border bg-card"}`}>
                  <p className="text-[11px] text-muted-foreground font-medium">Exceptions</p>
                  <p className={`text-lg font-bold ${auditSummary.exceptions > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{auditSummary.exceptions}</p>
                </div>
                <div className={`rounded-md border px-4 py-3 ${auditSummary.warnings > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-border bg-card"}`}>
                  <p className="text-[11px] text-muted-foreground font-medium">Warnings</p>
                  <p className={`text-lg font-bold ${auditSummary.warnings > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{auditSummary.warnings}</p>
                </div>
                <div className="rounded-md border border-border bg-card px-4 py-3">
                  <p className="text-[11px] text-muted-foreground font-medium">Total Variance</p>
                  <p className={`text-lg font-bold ${auditSummary.totalVariance > 0 ? "text-red-600 dark:text-red-400" : auditSummary.totalVariance < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                    {auditSummary.totalVariance >= 0 ? "+" : ""}${Math.abs(auditSummary.totalVariance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}

            {/* Audit list + detail */}
            {invoiceAuditsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : invoiceAudits.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
                  <ReceiptText className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No invoice audits yet. Upload an invoice above to compare against contract terms.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Audit selector list */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Past Audits</p>
                  {invoiceAudits.map(a => {
                    const statusColors = {
                      match: "text-emerald-600 dark:text-emerald-400",
                      warning: "text-amber-600 dark:text-amber-400",
                      exception: "text-red-600 dark:text-red-400",
                    };
                    const StatusIcon = a.auditStatus === "match" ? CheckCircle2 : a.auditStatus === "warning" ? AlertTriangle : AlertCircle;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAuditId(a.id)}
                        className={`w-full text-left rounded-md border p-3 transition-colors hover-elevate ${(selectedAudit?.id === a.id) ? "bg-muted border-primary/40" : "border-border bg-card"}`}
                        data-testid={`button-select-audit-${a.id}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                          <span className="text-xs font-medium truncate max-w-[130px]">{a.invoiceNumber || a.fileName?.split("/").pop() || "Invoice"}</span>
                          <span className={`flex items-center gap-1 text-[11px] font-semibold ${statusColors[a.auditStatus]}`}>
                            <StatusIcon className="h-3 w-3" />{a.auditStatus.toUpperCase()}
                          </span>
                        </div>
                        {a.invoiceDate && <p className="text-[11px] text-muted-foreground">Date: {a.invoiceDate}</p>}
                        {a.invoiceTotal && <p className="text-[11px] text-muted-foreground">Total: ${parseFloat(a.invoiceTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>}
                        <p className="text-[11px] text-muted-foreground">{new Date(a.auditedAt).toLocaleDateString()}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Audit detail panel */}
                {selectedAudit && (() => {
                  const extracted = (selectedAudit.extractedInvoiceJson as any) || {};
                  const flaggedItems = (selectedAudit.flaggedItems as any[]) || [];
                  const lineItems = extracted.lineItems || [];
                  const statusConfig = {
                    match: { label: "Match", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", Icon: CheckCircle2 },
                    warning: { label: "Warning", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", Icon: AlertTriangle },
                    exception: { label: "Exception", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", Icon: AlertCircle },
                  };
                  const { label: statusLabel, cls: statusCls, Icon: StatusIcon } = statusConfig[selectedAudit.auditStatus];

                  return (
                    <div className="lg:col-span-2 space-y-4">
                      {/* Header strip */}
                      <Card>
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{selectedAudit.invoiceNumber ? `Invoice #${selectedAudit.invoiceNumber}` : "Invoice"}</span>
                                <Badge className={`text-xs no-default-active-elevate flex items-center gap-1 ${statusCls}`}>
                                  <StatusIcon className="h-3 w-3" />{statusLabel}
                                </Badge>
                              </div>
                              {selectedAudit.invoiceDate && <p className="text-xs text-muted-foreground">Invoice Date: {selectedAudit.invoiceDate}</p>}
                              {(selectedAudit as any).dueDate && <p className="text-xs text-muted-foreground">Due Date: {(selectedAudit as any).dueDate}</p>}
                              {selectedAudit.billingPeriod && <p className="text-xs text-muted-foreground">Billing Period: {selectedAudit.billingPeriod}</p>}
                              <p className="text-xs text-muted-foreground">Vendor: {vendor.name}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-right">
                              <div>
                                <p className="text-[11px] text-muted-foreground">Invoiced</p>
                                <p className="text-sm font-bold">{selectedAudit.invoiceTotal ? `$${parseFloat(selectedAudit.invoiceTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">Expected</p>
                                <p className="text-sm font-bold">{selectedAudit.expectedTotal ? `$${parseFloat(selectedAudit.expectedTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">Variance</p>
                                <p className={`text-sm font-bold ${selectedAudit.varianceAmount && parseFloat(selectedAudit.varianceAmount) > 0 ? "text-red-600 dark:text-red-400" : selectedAudit.varianceAmount && parseFloat(selectedAudit.varianceAmount) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                                  {selectedAudit.varianceAmount ? `${parseFloat(selectedAudit.varianceAmount) > 0 ? "+" : ""}$${Math.abs(parseFloat(selectedAudit.varianceAmount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                                  {selectedAudit.variancePercent && <span className="text-xs ml-1 font-normal text-muted-foreground">({parseFloat(selectedAudit.variancePercent) > 0 ? "+" : ""}{parseFloat(selectedAudit.variancePercent).toFixed(1)}%)</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                          {selectedAudit.exceptionNotes && (
                            <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border leading-relaxed">{selectedAudit.exceptionNotes}</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Contract Comparison */}
                      {(() => {
                        const cc = (selectedAudit as any).contractComparison;
                        if (!cc) return null;
                        const dims: { key: string; label: string; icon: any }[] = [
                          { key: "pricing", label: "Contract Pricing", icon: DollarSign },
                          { key: "dates", label: "Contract Dates", icon: CalendarDays },
                          { key: "paymentTerms", label: "Payment Terms", icon: Clock },
                          { key: "userLicenseLimits", label: "User / License Limits", icon: Users },
                        ];
                        return (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-primary" />
                                Contract Comparison
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {dims.map(({ key, label, icon: Icon }) => {
                                const dim = cc[key];
                                if (!dim) return null;
                                const status: string = dim.status ?? "not_applicable";
                                const isMatch = status === "match";
                                const isNA = status === "not_applicable";
                                const isWarning = status === "warning";
                                const isException = status === "exception";
                                const statusLabel = isMatch ? "Match" : isNA ? "N/A" : isWarning ? "Warning" : "Exception";
                                const statusCls = isMatch
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                                  : isNA
                                  ? "bg-muted text-muted-foreground"
                                  : isWarning
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300";
                                const StatusIcon = isMatch ? CheckCircle2 : isNA ? CircleDot : isWarning ? AlertTriangle : AlertCircle;
                                const discrepancies: any[] = dim.discrepancies ?? [];
                                return (
                                  <div key={key} className="rounded-md border border-border p-3 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs font-medium text-foreground">{label}</span>
                                      </div>
                                      <Badge className={`text-[10px] no-default-active-elevate flex items-center gap-1 ${statusCls}`}>
                                        <StatusIcon className="h-3 w-3" />{statusLabel}
                                      </Badge>
                                    </div>
                                    {dim.summary && <p className="text-xs text-muted-foreground leading-relaxed">{dim.summary}</p>}
                                    {discrepancies.length > 0 && (
                                      <div className="space-y-1 pt-0.5">
                                        {discrepancies.map((d: any, di: number) => (
                                          <div key={di} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-amber-300 dark:border-amber-700">
                                            {d.description && <span>{d.description}</span>}
                                            {d.item && <span className="font-medium text-foreground">{d.item}: </span>}
                                            {d.invoicedRate && <span>Invoiced {d.invoicedRate} </span>}
                                            {d.contractedRate && <span className="text-muted-foreground">vs contracted {d.contractedRate}</span>}
                                            {d.delta && <span className="text-red-600 dark:text-red-400 font-medium"> ({d.delta})</span>}
                                            {d.invoiced && !d.invoicedRate && <span>Invoice: {d.invoiced} </span>}
                                            {d.contracted && !d.contractedRate && <span className="text-muted-foreground">vs {d.contracted}</span>}
                                            {d.invoicedQty && <span>Invoiced {d.invoicedQty} </span>}
                                            {d.contractedLimit && <span className="text-muted-foreground">vs limit {d.contractedLimit}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </CardContent>
                          </Card>
                        );
                      })()}

                      {/* Flagged items */}
                      {flaggedItems.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Flagged Items
                              <Badge variant="outline" className="text-xs no-default-active-elevate">{flaggedItems.length}</Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {flaggedItems.map((f: any, i: number) => {
                              const isException = f.severity === "exception";
                              return (
                                <div key={i} className={`rounded-md border p-3 ${isException ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}>
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge className={`text-[10px] no-default-active-elevate ${isException ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"}`}>
                                      {isException ? "EXCEPTION" : "WARNING"}
                                    </Badge>
                                    <span className="text-xs font-medium text-foreground capitalize">{(f.type || "").replace(/_/g, " ")}</span>
                                  </div>
                                  <p className="text-sm text-foreground">{f.description}</p>
                                  {(f.invoicedValue || f.contractedValue) && (
                                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                                      {f.invoicedValue && <span>Invoiced: <strong className="text-foreground">{f.invoicedValue}</strong></span>}
                                      {f.contractedValue && <span>Contracted: <strong className="text-foreground">{f.contractedValue}</strong></span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}

                      {/* Line Items table */}
                      {lineItems.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <ReceiptText className="h-4 w-4 text-muted-foreground" />Extracted Line Items
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-muted/40">
                                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Description</th>
                                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Qty</th>
                                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Unit Rate</th>
                                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Contract Rate</th>
                                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Amount</th>
                                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineItems.map((item: any, i: number) => {
                                    const hasFlagBad = item.flag && item.flag !== "none" && item.flag !== null;
                                    return (
                                      <tr key={i} className={`border-b border-border last:border-0 ${hasFlagBad ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                                        <td className="px-4 py-2 text-foreground max-w-[180px]">{item.description}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{item.quantity ?? "—"}</td>
                                        <td className="px-3 py-2 text-right text-foreground">{item.unitRate != null ? `$${item.unitRate.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{item.contractedRate != null ? `$${item.contractedRate.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                                        <td className="px-3 py-2 text-right font-medium text-foreground">{item.amount != null ? `$${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                                        <td className="px-3 py-2">
                                          {hasFlagBad ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 cursor-default">
                                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                  <span className="capitalize text-[10px]">{(item.flag || "").replace(/_/g, " ")}</span>
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>{item.flagNote || item.flag}</TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[10px]">
                                              <CheckCircle2 className="h-3 w-3" />OK
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                {(extracted.taxes || extracted.fees || extracted.surcharges) && (
                                  <tfoot>
                                    <tr className="border-t-2 border-border bg-muted/20">
                                      <td colSpan={4} className="px-4 py-2 text-xs text-muted-foreground">Taxes / Fees / Surcharges</td>
                                      <td className="px-3 py-2 text-right text-xs font-medium text-foreground">
                                        ${((extracted.taxes || 0) + (extracted.fees || 0) + (extracted.surcharges || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      </td>
                                      <td />
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="license" data-testid="tabcontent-license">
          <div className="space-y-4">
            {/* Summary bar from latest snapshot */}
            {licenseLatest ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Purchased Seats", value: licenseLatest.purchasedSeats ?? "—" },
                  { label: "Assigned Seats", value: licenseLatest.assignedSeats ?? "—" },
                  { label: "Active (30d)", value: licenseLatest.activeLastThirtyDays ?? "—" },
                  { label: "Utilization", value: licenseLatest.utilizationPercent != null ? `${parseFloat(licenseLatest.utilizationPercent).toFixed(1)}%` : "—" },
                  { label: "Annual Cost", value: licenseLatest.annualLicenseCost != null ? `$${parseFloat(licenseLatest.annualLicenseCost).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—" },
                  { label: "Est. Unused Cost", value: licenseLatest.estimatedUnusedCost != null ? `$${parseFloat(licenseLatest.estimatedUnusedCost).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—" },
                ].map(({ label, value }) => (
                  <Card key={label}>
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-lg font-semibold" data-testid={`text-license-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No license utilization data recorded yet. Add a snapshot to begin tracking.
                </CardContent>
              </Card>
            )}

            {/* Low utilization warning */}
            {licenseLatest && parseFloat(licenseLatest.utilizationPercent ?? "100") < 60 && (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Low License Utilization</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Current utilization is {parseFloat(licenseLatest.utilizationPercent!).toFixed(1)}%. Consider reducing seat count at renewal to avoid wasted spend.
                  </p>
                </div>
              </div>
            )}

            {/* Snapshot history table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">Utilization Snapshots</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingLicense(null);
                      setLicenseForm({ snapshotDate: new Date().toISOString().slice(0, 10), licenseName: "", purchasedSeats: "", assignedSeats: "", activeLastThirtyDays: "", annualLicenseCost: "", notes: "" });
                      setLicenseFormOpen(true);
                    }}
                    data-testid="button-add-license-snapshot"
                  >
                    <Plus className="h-4 w-4 mr-1" />Add Snapshot
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {licenseLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : licenseHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No snapshots recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>License</TableHead>
                        <TableHead className="text-right">Purchased</TableHead>
                        <TableHead className="text-right">Assigned</TableHead>
                        <TableHead className="text-right">Active (30d)</TableHead>
                        <TableHead className="text-right">Utilization</TableHead>
                        <TableHead className="text-right">Annual Cost</TableHead>
                        <TableHead className="text-right">Est. Unused</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {licenseHistory.map((lu) => {
                        const util = lu.utilizationPercent != null ? parseFloat(lu.utilizationPercent) : null;
                        const isLow = util != null && util < 60;
                        const isMed = util != null && util >= 60 && util < 80;
                        return (
                          <TableRow key={lu.id} data-testid={`row-license-${lu.id}`}>
                            <TableCell className="text-sm">{new Date(lu.snapshotDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-sm">{lu.licenseName}</TableCell>
                            <TableCell className="text-right text-sm">{lu.purchasedSeats}</TableCell>
                            <TableCell className="text-right text-sm">{lu.assignedSeats}</TableCell>
                            <TableCell className="text-right text-sm">{lu.activeLastThirtyDays ?? "—"}</TableCell>
                            <TableCell className="text-right text-sm">
                              {util != null ? (
                                <span className={isLow ? "text-red-600 dark:text-red-400 font-medium" : isMed ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}>
                                  {util.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {lu.annualLicenseCost != null ? `$${parseFloat(lu.annualLicenseCost).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {lu.estimatedUnusedCost != null ? (
                                <span className="text-red-600 dark:text-red-400">
                                  ${parseFloat(lu.estimatedUnusedCost).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="icon" variant="ghost" onClick={() => openLicenseEdit(lu)} data-testid={`button-edit-license-${lu.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => deleteLicenseMutation.mutate(lu.id)} disabled={deleteLicenseMutation.isPending} data-testid={`button-delete-license-${lu.id}`}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* License Snapshot Form Dialog */}
          <Dialog open={licenseFormOpen} onOpenChange={(open) => { if (!open) { setLicenseFormOpen(false); setEditingLicense(null); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingLicense ? "Edit License Snapshot" : "Add License Snapshot"}</DialogTitle>
                <DialogDescription>Record a utilization snapshot to track seat usage over time.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Snapshot Date</Label>
                    <Input type="date" value={licenseForm.snapshotDate} onChange={e => setLicenseForm(p => ({ ...p, snapshotDate: e.target.value }))} data-testid="input-license-snapshot-date" />
                  </div>
                  <div>
                    <Label className="text-xs">License / Product Name</Label>
                    <Input value={licenseForm.licenseName} onChange={e => setLicenseForm(p => ({ ...p, licenseName: e.target.value }))} placeholder="e.g. Enterprise Plan" data-testid="input-license-name" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Purchased Seats</Label>
                    <Input type="number" min="0" value={licenseForm.purchasedSeats} onChange={e => setLicenseForm(p => ({ ...p, purchasedSeats: e.target.value }))} data-testid="input-license-purchased" />
                  </div>
                  <div>
                    <Label className="text-xs">Assigned Seats</Label>
                    <Input type="number" min="0" value={licenseForm.assignedSeats} onChange={e => setLicenseForm(p => ({ ...p, assignedSeats: e.target.value }))} data-testid="input-license-assigned" />
                  </div>
                  <div>
                    <Label className="text-xs">Active (Last 30d)</Label>
                    <Input type="number" min="0" value={licenseForm.activeLastThirtyDays} onChange={e => setLicenseForm(p => ({ ...p, activeLastThirtyDays: e.target.value }))} data-testid="input-license-active" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Annual License Cost ($)</Label>
                  <Input type="number" min="0" step="0.01" value={licenseForm.annualLicenseCost} onChange={e => setLicenseForm(p => ({ ...p, annualLicenseCost: e.target.value }))} placeholder="e.g. 12000" data-testid="input-license-cost" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={licenseForm.notes} onChange={e => setLicenseForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes about this snapshot" data-testid="input-license-notes" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setLicenseFormOpen(false); setEditingLicense(null); }} data-testid="button-license-cancel">Cancel</Button>
                <Button onClick={() => saveLicenseMutation.mutate(licenseForm)} disabled={saveLicenseMutation.isPending} data-testid="button-license-save">
                  {saveLicenseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingLicense ? "Update" : "Save Snapshot"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="scorecard" data-testid="tabcontent-scorecard">
          <div className="space-y-4">
            {/* Current scorecard summary */}
            {valueScorecardLatest ? (() => {
              const overall = valueScorecardLatest.overallScore != null ? parseFloat(valueScorecardLatest.overallScore) : null;
              const effectiveRec = valueScorecardLatest.recommendationOverride ?? valueScorecardLatest.recommendation ?? null;
              const scoreColor = overall == null ? "text-muted-foreground" : overall >= 75 ? "text-green-600 dark:text-green-400" : overall >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
              const dimensions = [
                { key: "contractCostScore", label: "Cost Efficiency", value: valueScorecardLatest.contractCostScore },
                { key: "utilizationScore", label: "User Adoption", value: valueScorecardLatest.utilizationScore },
                { key: "supportScore", label: "Support Responsiveness", value: valueScorecardLatest.supportScore },
                { key: "businessValueScore", label: "Business Value", value: valueScorecardLatest.businessValueScore },
                { key: "riskScore", label: "Contract Risk", value: valueScorecardLatest.riskScore },
              ] as { key: string; label: string; value: string | null }[];
              return (
                <div className="space-y-4">
                  {/* Hero card: overall score + recommendation */}
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-5">
                          <div className="text-center">
                            <p className={`text-5xl font-bold tabular-nums ${scoreColor}`} data-testid="text-overall-score">
                              {overall != null ? overall.toFixed(0) : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">/ 100</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">System Recommendation</p>
                            {effectiveRec ? (
                              <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-md ${scorecardRecommendationColors[effectiveRec] ?? ""}`} data-testid="text-recommendation">
                                {scorecardRecommendationLabels[effectiveRec] ?? effectiveRec}
                              </span>
                            ) : <span className="text-sm text-muted-foreground">Not set</span>}
                            {valueScorecardLatest.recommendationOverride && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Override from: <span className="font-medium">{scorecardRecommendationLabels[valueScorecardLatest.recommendation ?? ""] ?? valueScorecardLatest.recommendation}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => openValueScorecardEdit(valueScorecardLatest)} data-testid="button-edit-scorecard">
                            <Pencil className="h-4 w-4 mr-1" />Edit
                          </Button>
                          {scorecardOverrideEditingId !== valueScorecardLatest.id ? (
                            <Button size="sm" variant="outline" onClick={() => {
                              setScorecardOverrideEditingId(valueScorecardLatest.id);
                              setScorecardOverrideForm({ recommendationOverride: valueScorecardLatest.recommendationOverride ?? "", overrideReason: valueScorecardLatest.overrideReason ?? "" });
                            }} data-testid="button-override-recommendation">
                              Override Recommendation
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Select value={scorecardOverrideForm.recommendationOverride || "__clear__"} onValueChange={(v) => setScorecardOverrideForm(p => ({ ...p, recommendationOverride: v === "__clear__" ? "" : v }))}>
                                <SelectTrigger className="h-8 text-xs w-44" data-testid="select-override-value">
                                  <SelectValue placeholder="Select override" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__clear__">Clear override</SelectItem>
                                  <SelectItem value="retain">Retain</SelectItem>
                                  <SelectItem value="renegotiate">Renegotiate</SelectItem>
                                  <SelectItem value="reduce_licenses">Reduce Licenses</SelectItem>
                                  <SelectItem value="replace">Replace</SelectItem>
                                  <SelectItem value="terminate_review">Terminate Review</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input className="h-8 text-xs w-52" placeholder="Reason (optional)" value={scorecardOverrideForm.overrideReason} onChange={e => setScorecardOverrideForm(p => ({ ...p, overrideReason: e.target.value }))} data-testid="input-override-reason" />
                              <Button size="sm" onClick={() => saveValueScorecardOverrideMutation.mutate({ id: valueScorecardLatest.id, override: scorecardOverrideForm.recommendationOverride, reason: scorecardOverrideForm.overrideReason })} disabled={saveValueScorecardOverrideMutation.isPending} data-testid="button-save-override">
                                {saveValueScorecardOverrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setScorecardOverrideEditingId(null)} data-testid="button-cancel-override">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        Review period: {new Date(valueScorecardLatest.reviewPeriodStart).toLocaleDateString()} – {new Date(valueScorecardLatest.reviewPeriodEnd).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Dimension score bars */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Score Dimensions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {dimensions.map(({ key, label, value }) => {
                        const score = value != null ? parseFloat(value) : null;
                        const barColor = score == null ? "bg-muted" : score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
                        return (
                          <div key={key} data-testid={`dimension-${key}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm text-muted-foreground">{label}</p>
                              <p className="text-sm font-semibold tabular-nums">{score != null ? score.toFixed(1) : "—"}</p>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: score != null ? `${Math.min(score, 100)}%` : "0%" }} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {/* AI summary */}
                  {valueScorecardLatest.aiSummary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground" />Analysis Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-ai-summary">{valueScorecardLatest.aiSummary}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })() : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No value scorecard recorded yet. Add a scorecard to begin tracking vendor value.
                </CardContent>
              </Card>
            )}

            {/* Score history table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">Score History</CardTitle>
                  <Button size="sm" onClick={() => {
                    setEditingValueScorecard(null);
                    const p = defaultValueScorecardPeriod();
                    setValueScorecardForm({ reviewPeriodStart: p.start, reviewPeriodEnd: p.end, contractCostScore: "", utilizationScore: "", supportScore: "", businessValueScore: "", riskScore: "", overallScore: "", recommendation: "retain", recommendationOverride: "", overrideReason: "", aiSummary: "" });
                    setValueScorecardFormOpen(true);
                  }} data-testid="button-add-scorecard">
                    <Plus className="h-4 w-4 mr-1" />Add Scorecard
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {valueScorecardLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : valueScorecardHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No scorecards yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Review Period</TableHead>
                        <TableHead className="text-right">Overall</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Adoption</TableHead>
                        <TableHead className="text-right">Support</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Risk</TableHead>
                        <TableHead>Recommendation</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valueScorecardHistory.map((sc) => {
                        const overall = sc.overallScore != null ? parseFloat(sc.overallScore) : null;
                        const rec = sc.recommendationOverride ?? sc.recommendation;
                        const scoreColor = overall == null ? "" : overall >= 75 ? "text-green-600 dark:text-green-400" : overall >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                        return (
                          <TableRow key={sc.id} data-testid={`row-scorecard-${sc.id}`}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(sc.reviewPeriodStart).toLocaleDateString()} – {new Date(sc.reviewPeriodEnd).toLocaleDateString()}
                            </TableCell>
                            <TableCell className={`text-right font-semibold text-sm ${scoreColor}`}>{overall != null ? overall.toFixed(0) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{sc.contractCostScore != null ? parseFloat(sc.contractCostScore).toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{sc.utilizationScore != null ? parseFloat(sc.utilizationScore).toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{sc.supportScore != null ? parseFloat(sc.supportScore).toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{sc.businessValueScore != null ? parseFloat(sc.businessValueScore).toFixed(1) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{sc.riskScore != null ? parseFloat(sc.riskScore).toFixed(1) : "—"}</TableCell>
                            <TableCell>
                              {rec ? (
                                <span className={`inline-block text-xs px-2 py-0.5 rounded-md ${scorecardRecommendationColors[rec] ?? ""}`}>
                                  {scorecardRecommendationLabels[rec] ?? rec}
                                  {sc.recommendationOverride && <span className="ml-1 opacity-60">(override)</span>}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="icon" variant="ghost" onClick={() => openValueScorecardEdit(sc)} data-testid={`button-edit-sc-${sc.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => deleteValueScorecardMutation.mutate(sc.id)} disabled={deleteValueScorecardMutation.isPending} data-testid={`button-delete-sc-${sc.id}`}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scorecard Form Dialog */}
          <Dialog open={valueScorecardFormOpen} onOpenChange={(open) => { if (!open) { setValueScorecardFormOpen(false); setEditingValueScorecard(null); } }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingValueScorecard ? "Edit Scorecard" : "Add Value Scorecard"}</DialogTitle>
                <DialogDescription>Rate each dimension 0–100. Overall score is your composite judgment.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Period Start</Label>
                    <Input type="date" value={valueScorecardForm.reviewPeriodStart} onChange={e => setValueScorecardForm(p => ({ ...p, reviewPeriodStart: e.target.value }))} data-testid="input-sc-period-start" />
                  </div>
                  <div>
                    <Label className="text-xs">Period End</Label>
                    <Input type="date" value={valueScorecardForm.reviewPeriodEnd} onChange={e => setValueScorecardForm(p => ({ ...p, reviewPeriodEnd: e.target.value }))} data-testid="input-sc-period-end" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "contractCostScore", label: "Cost Efficiency (0–100)" },
                    { key: "utilizationScore", label: "User Adoption (0–100)" },
                    { key: "supportScore", label: "Support Responsiveness (0–100)" },
                    { key: "businessValueScore", label: "Business Value (0–100)" },
                    { key: "riskScore", label: "Contract Risk (0–100)" },
                    { key: "overallScore", label: "Overall Score (0–100)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number" min="0" max="100" step="0.1"
                        value={(valueScorecardForm as any)[key]}
                        onChange={e => setValueScorecardForm(p => ({ ...p, [key]: e.target.value }))}
                        placeholder="—"
                        data-testid={`input-sc-${key}`}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Recommendation</Label>
                  <Select value={valueScorecardForm.recommendation} onValueChange={v => setValueScorecardForm(p => ({ ...p, recommendation: v }))}>
                    <SelectTrigger data-testid="select-sc-recommendation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retain">Retain</SelectItem>
                      <SelectItem value="renegotiate">Renegotiate</SelectItem>
                      <SelectItem value="reduce_licenses">Reduce Licenses</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                      <SelectItem value="terminate_review">Terminate Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Analysis Summary (optional)</Label>
                  <Textarea rows={4} value={valueScorecardForm.aiSummary} onChange={e => setValueScorecardForm(p => ({ ...p, aiSummary: e.target.value }))} placeholder="Key insights about vendor performance, cost value, risk factors..." data-testid="input-sc-summary" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setValueScorecardFormOpen(false); setEditingValueScorecard(null); }} data-testid="button-sc-cancel">Cancel</Button>
                <Button onClick={() => saveValueScorecardMutation.mutate(valueScorecardForm)} disabled={saveValueScorecardMutation.isPending} data-testid="button-sc-save">
                  {saveValueScorecardMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingValueScorecard ? "Update" : "Save Scorecard"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>


        <TabsContent value="obligations" data-testid="tabcontent-obligations">
          {(() => {
            const filteredObligations = vendorObligations.filter(ob => {
              if (obFilterStatus !== "all" && ob.status !== obFilterStatus) return false;
              if (obFilterType !== "all" && ob.obligationType !== obFilterType) return false;
              if (obFilterContract !== "all" && ob.contractId !== obFilterContract) return false;
              return true;
            });

            const statusCounts: Record<string, number> = {};
            vendorObligations.forEach(ob => { statusCounts[ob.status] = (statusCounts[ob.status] ?? 0) + 1; });

            const typeIcon = (t: string) =>
              t === "insurance" ? <ShieldAlert className="h-3.5 w-3.5" /> :
              t === "payment" ? <DollarSign className="h-3.5 w-3.5" /> :
              t === "sla" ? <Clock className="h-3.5 w-3.5" /> :
              t === "notice" ? <AlertCircle className="h-3.5 w-3.5" /> :
              <FileText className="h-3.5 w-3.5" />;

            const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
              s === "overdue" ? "destructive" :
              s === "completed" ? "outline" :
              s === "waived" ? "secondary" :
              "secondary";

            const dueSoonThreshold = new Date();
            dueSoonThreshold.setDate(dueSoonThreshold.getDate() + 14);
            const dueSoonCount = vendorObligations.filter(ob => {
              if (!ob.dueDate) return false;
              if (ob.status === "completed" || ob.status === "waived") return false;
              const d = new Date(ob.dueDate);
              return d <= dueSoonThreshold && d >= new Date();
            }).length;

            const overdueCount = statusCounts["overdue"] ?? 0;

            return (
              <div className="space-y-4">
                {/* Summary strip */}
                {vendorObligations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {overdueCount > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <AlertCircle className="h-3 w-3" />{overdueCount} overdue
                      </Badge>
                    )}
                    {dueSoonCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                        <Clock className="h-3 w-3" />{dueSoonCount} due within 14 days
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs no-default-active-elevate">
                      {vendorObligations.length} total across {contracts.length} contract{contracts.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={obFilterStatus} onValueChange={setObFilterStatus}>
                    <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-ob-filter-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={obFilterType} onValueChange={setObFilterType}>
                    <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-ob-filter-type">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="reporting">Reporting</SelectItem>
                      <SelectItem value="notice">Notice</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="sla">SLA</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={obFilterContract} onValueChange={setObFilterContract}>
                    <SelectTrigger className="h-8 w-48 text-xs" data-testid="select-ob-filter-contract">
                      <SelectValue placeholder="Contract" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All contracts</SelectItem>
                      {contracts.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contractName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(obFilterStatus !== "all" || obFilterType !== "all" || obFilterContract !== "all") && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setObFilterStatus("all"); setObFilterType("all"); setObFilterContract("all"); }} data-testid="button-clear-ob-filters">
                      Clear filters
                    </Button>
                  )}
                </div>

                {/* List */}
                {vendorObligationsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
                  </div>
                ) : vendorObligations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 rounded-md border border-dashed gap-2">
                    <ListChecks className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-medium">No obligations tracked</p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">Open a contract, run Discover Obligations in the Contract Intelligence panel, then approve the suggestions.</p>
                  </div>
                ) : filteredObligations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 rounded-md border border-dashed gap-1">
                    <ListChecks className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No obligations match the selected filters</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredObligations.map(ob => {
                      const isOverdue = ob.status === "overdue";
                      const isDueSoon = (() => {
                        if (!ob.dueDate || ob.status === "completed" || ob.status === "waived") return false;
                        const d = new Date(ob.dueDate);
                        return d <= dueSoonThreshold && d >= new Date();
                      })();
                      return (
                        <div
                          key={ob.id}
                          className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${isOverdue ? "border-destructive/40 bg-destructive/5" : isDueSoon ? "border-amber-500/40 bg-amber-500/5" : ""}`}
                          data-testid={`vendor-obligation-row-${ob.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <Badge variant="outline" className="text-xs gap-1 capitalize">
                                {typeIcon(ob.obligationType)}{ob.obligationType}
                              </Badge>
                              <Badge variant={statusVariant(ob.status)} className="text-xs capitalize">
                                {ob.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-0.5" />}
                                {ob.status}
                              </Badge>
                              {ob.recurrence !== "none" && (
                                <Badge variant="outline" className="text-xs capitalize">{ob.recurrence}</Badge>
                              )}
                              {isDueSoon && (
                                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">Due soon</Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">{ob.title}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-0.5">
                              {ob.dueDate && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />Due {formatDate(ob.dueDate)}
                                </p>
                              )}
                              {ob.contractName && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <FileText className="h-3 w-3" />{ob.contractName}
                                </p>
                              )}
                            </div>
                            {ob.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ob.description}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 text-xs mt-0.5"
                            onClick={() => {
                              setSelectedContract(contracts.find(c => c.id === ob.contractId) ?? null);
                              setVendorActiveTab("overview");
                              setTimeout(() => {
                                const contractEl = document.querySelector(`[data-contract-id="${ob.contractId}"]`);
                                if (contractEl) contractEl.scrollIntoView({ behavior: "smooth", block: "center" });
                              }, 200);
                            }}
                            data-testid={`button-ob-go-to-contract-${ob.id}`}
                          >
                            View Contract
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="default-coding" data-testid="tabcontent-default-coding">
          <DefaultCodingTab vendorId={vendor.id} />
        </TabsContent>

        <TabsContent value="audit" data-testid="tabcontent-audit">
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setAuditExpanded(!auditExpanded)} data-testid="button-toggle-audit">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold" data-testid="text-audit-heading">Audit Trail</CardTitle>
              {auditLogs.length > 0 && <Badge variant="secondary" className="text-xs" data-testid="badge-audit-count">{auditLogs.length}</Badge>}
            </div>
            <Button variant="ghost" size="icon" data-testid="button-expand-audit">
              <ChevronRight className={`h-4 w-4 transition-transform ${auditExpanded ? "rotate-90" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        {auditExpanded && (
          <CardContent>
            {auditLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-audit-empty">No audit entries yet</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto" data-testid="audit-log-list">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm border-b pb-2 last:border-0" data-testid={`audit-entry-${log.id}`}>
                    <div className={`mt-1 shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      log.action === "create" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                      log.action === "update" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                      "bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}>
                      {log.action === "create" ? "+" : log.action === "update" ? "~" : "-"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`audit-user-${log.id}`}>{log.userName || "System"}</span>
                        <Badge variant="outline" className="text-xs capitalize" data-testid={`audit-action-${log.id}`}>{log.action}</Badge>
                        <Badge variant="secondary" className="text-xs" data-testid={`audit-entity-${log.id}`}>{log.entityType.replace("vendor_", "").replace("_", " ")}</Badge>
                        {log.userRole && <span className="text-xs text-muted-foreground">({log.userRole})</span>}
                      </div>
                      {log.changesJson && typeof log.changesJson === "object" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {Object.entries(log.changesJson as Record<string, any>).slice(0, 4).map(([key, val]) => {
                            if (val && typeof val === "object" && "from" in val && "to" in val) {
                              return <div key={key}><span className="font-medium">{key}</span>: {String(val.from || "\u2013")} &rarr; {String(val.to || "\u2013")}</div>;
                            }
                            return null;
                          })}
                          {Object.keys(log.changesJson as Record<string, any>).length > 4 && (
                            <span className="text-muted-foreground">+{Object.keys(log.changesJson as Record<string, any>).length - 4} more fields</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`audit-time-${log.id}`}>
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={scorecardDialogOpen} onOpenChange={setScorecardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Performance Review</DialogTitle>
            <DialogDescription>Rate the vendor across four dimensions (1-5). Overall score is auto-calculated.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quality (1-5)</Label>
                <Select value={perfScorecardForm.ratingQuality} onValueChange={(v) => setValueScorecardForm(f => ({ ...f, ratingQuality: v }))}>
                  <SelectTrigger data-testid="select-rating-quality"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timeliness (1-5)</Label>
                <Select value={perfScorecardForm.ratingTimeliness} onValueChange={(v) => setValueScorecardForm(f => ({ ...f, ratingTimeliness: v }))}>
                  <SelectTrigger data-testid="select-rating-timeliness"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Support (1-5)</Label>
                <Select value={perfScorecardForm.ratingSupport} onValueChange={(v) => setValueScorecardForm(f => ({ ...f, ratingSupport: v }))}>
                  <SelectTrigger data-testid="select-rating-support"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost Control (1-5)</Label>
                <Select value={perfScorecardForm.ratingCostControl} onValueChange={(v) => setValueScorecardForm(f => ({ ...f, ratingCostControl: v }))}>
                  <SelectTrigger data-testid="select-rating-cost-control"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Review Period Start</Label>
                <Input type="date" value={perfScorecardForm.reviewPeriodStart} onChange={(e) => setValueScorecardForm(f => ({ ...f, reviewPeriodStart: e.target.value }))} data-testid="input-review-start" />
              </div>
              <div>
                <Label>Review Period End</Label>
                <Input type="date" value={perfScorecardForm.reviewPeriodEnd} onChange={(e) => setValueScorecardForm(f => ({ ...f, reviewPeriodEnd: e.target.value }))} data-testid="input-review-end" />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={perfScorecardForm.notes} onChange={(e) => setValueScorecardForm(f => ({ ...f, notes: e.target.value }))} placeholder="Review comments..." data-testid="input-scorecard-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScorecardDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createScorecardMutation.mutate(perfScorecardForm)} disabled={createScorecardMutation.isPending || !perfScorecardForm.reviewPeriodStart || !perfScorecardForm.reviewPeriodEnd} data-testid="button-submit-scorecard">
              {createScorecardMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContractFormDialog
        open={contractDialogOpen}
        onOpenChange={(open) => { setContractDialogOpen(open); if (!open) setContractUploadFile(null); }}
        title="Add Contract"
        description={`Create a new contract for ${vendor.name}`}
        form={contractForm}
        setForm={setContractForm}
        onSubmit={() => createContractMutation.mutate(contractForm)}
        isPending={createContractMutation.isPending}
        submitLabel="Create Contract"
        uploadFile={contractUploadFile}
        onUploadFileChange={setContractUploadFile}
      />

      <ContractFormDialog
        open={!!editingContract}
        onOpenChange={(open) => { if (!open) setEditingContract(null); }}
        title="Edit Contract"
        description="Update contract details"
        form={contractForm}
        setForm={setContractForm}
        onSubmit={() => editingContract && updateContractMutation.mutate({ id: editingContract.id, data: contractForm })}
        isPending={updateContractMutation.isPending}
        submitLabel="Save Changes"
      />

      <PricingFormDialog
        open={pricingDialogOpen}
        onOpenChange={setPricingDialogOpen}
        title="Add Rate Card"
        description={`Create a new pricing record for ${vendor.name}`}
        form={pricingForm}
        setForm={setPricingForm}
        contracts={contracts}
        onSubmit={() => createPricingMutation.mutate(pricingForm)}
        isPending={createPricingMutation.isPending}
        submitLabel="Create Rate Card"
      />

      <PricingFormDialog
        open={!!editingPricing}
        onOpenChange={(open) => { if (!open) setEditingPricing(null); }}
        title="Edit Rate Card"
        description="Update pricing details"
        form={pricingForm}
        setForm={setPricingForm}
        contracts={contracts}
        onSubmit={() => editingPricing && updatePricingMutation.mutate({ id: editingPricing.id, data: pricingForm })}
        isPending={updatePricingMutation.isPending}
        submitLabel="Save Changes"
      />

      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        title="Add Contact"
        description={`Add a new contact for ${vendor.name}`}
        form={contactForm}
        setForm={setContactForm}
        onSubmit={() => createContactMutation.mutate(contactForm)}
        isPending={createContactMutation.isPending}
        submitLabel="Add Contact"
      />

      <ContactFormDialog
        open={!!editingContact}
        onOpenChange={(open) => { if (!open) setEditingContact(null); }}
        title="Edit Contact"
        description="Update contact details"
        form={contactForm}
        setForm={setContactForm}
        onSubmit={() => editingContact && updateContactMutation.mutate({ id: editingContact.id, data: contactForm })}
        isPending={updateContactMutation.isPending}
        submitLabel="Save Changes"
      />

      {/* Retention Edit Dialog */}
      <Dialog open={!!retentionEditDoc} onOpenChange={(open) => { if (!open) setRetentionEditDoc(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Retention Settings</DialogTitle>
            <DialogDescription>Set a custom retain-until date and retention category for this document.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Retain Until</label>
              <Input
                type="date"
                value={retentionEditForm.retainUntil}
                onChange={(e) => setRetentionEditForm((f) => ({ ...f, retainUntil: e.target.value }))}
                data-testid="input-retain-until"
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the default rule for this document type.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Retention Category</label>
              <select
                className="w-full text-sm border rounded-md px-3 py-2 bg-background text-foreground"
                value={retentionEditForm.retentionCategory}
                onChange={(e) => setRetentionEditForm((f) => ({ ...f, retentionCategory: e.target.value }))}
                data-testid="select-retention-category"
              >
                <option value="standard">Standard</option>
                <option value="legal_hold">Legal Hold</option>
                <option value="regulatory">Regulatory</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetentionEditDoc(null)}>Cancel</Button>
            <Button onClick={() => retentionEditDoc && updateRetentionMutation.mutate({ id: retentionEditDoc.id, body: { retainUntil: retentionEditForm.retainUntil || null, retentionCategory: retentionEditForm.retentionCategory } })} disabled={updateRetentionMutation.isPending} data-testid="button-save-retention">
              {updateRetentionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteContactId} onOpenChange={(open) => { if (!open) setDeleteContactId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contact</DialogTitle>
            <DialogDescription>Are you sure you want to remove this contact? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteContactId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)} disabled={deleteContactMutation.isPending} data-testid="button-confirm-delete-contact">
              {deleteContactMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a document for {vendor.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label required>File</Label>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(e) => setDocUploadForm({ ...docUploadForm, file: e.target.files?.[0] || null })}
                data-testid="input-doc-file"
              />
              <p className="text-xs text-muted-foreground">PDF, DOCX, JPG, PNG (max 25MB)</p>
            </div>
            <div className="space-y-2">
              <Label required>Document Type</Label>
              <Select value={docUploadForm.documentType} onValueChange={(v) => setDocUploadForm({ ...docUploadForm, documentType: v })}>
                <SelectTrigger data-testid="select-doc-upload-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={docUploadForm.notes}
                onChange={(e) => setDocUploadForm({ ...docUploadForm, notes: e.target.value })}
                placeholder="Optional notes about this document..."
                rows={2}
                data-testid="input-doc-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDocUpload} disabled={uploadDocMutation.isPending || !docUploadForm.file} data-testid="button-submit-document">
              {uploadDocMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDocDialogOpen} onOpenChange={(open) => { if (!open) { setEditDocDialogOpen(false); setEditingDoc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription className="truncate">{editingDoc?.fileName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label required>Document Type</Label>
                <Select value={editDocForm.documentType} onValueChange={handleEditDocTypeChange}>
                  <SelectTrigger data-testid="select-edit-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Linked Contract</Label>
                <Select value={editDocForm.contractId || "none"} onValueChange={handleEditDocContractChange}>
                  <SelectTrigger data-testid="select-edit-doc-contract">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.contractName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editDocForm.notes}
                onChange={(e) => setEditDocForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes about this document..."
                rows={2}
                data-testid="input-edit-doc-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDocDialogOpen(false); setEditingDoc(null); }}>Cancel</Button>
            <Button onClick={handleSaveEditDoc} disabled={updateDocMutation.isPending} data-testid="button-save-edit-doc">
              {updateDocMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={dragClassifyOpen} onOpenChange={(open) => { if (!open && !isBatchUploading) { setDragClassifyOpen(false); setDragClassifyFiles([]); } }}>
        <DialogContent className="max-w-2xl flex flex-col gap-0 p-0 max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle>Batch Upload Documents</DialogTitle>
            <DialogDescription>
              Set document type, linked contract, and notes for each file, then upload all at once.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0">
            {dragClassifyFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2" />
                <p className="text-sm">No files selected — click Add Files below</p>
              </div>
            ) : (
              <div className="divide-y">
                {dragClassifyFiles.map((item, i) => {
                  const isUploading = item.status === "uploading";
                  const isUploaded = item.status === "uploaded";
                  const isFailed = item.status === "failed";
                  return (
                    <div key={i} className="px-6 py-4 space-y-2" data-testid={`row-classify-${i}`}>
                      <div className="flex items-center gap-2">
                        <div className="shrink-0">
                          {isUploaded ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : isFailed ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" title={item.file.name}>{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)} · {item.file.name.split(".").pop()?.toUpperCase()}</p>
                        </div>
                        {item.status === "pending" && <Badge variant="secondary" className="text-xs shrink-0">Pending</Badge>}
                        {isUploading && <Badge variant="secondary" className="text-xs shrink-0">Uploading…</Badge>}
                        {isUploaded && <Badge variant="outline" className="text-xs shrink-0 text-green-600 dark:text-green-400 border-green-600 dark:border-green-400">Uploaded</Badge>}
                        {isFailed && <Badge variant="destructive" className="text-xs shrink-0">Failed</Badge>}
                        {isFailed && (
                          <Button size="icon" variant="ghost" onClick={() => setDragClassifyFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "pending", error: "" } : f))} title="Retry" data-testid={`button-retry-${i}`}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!isUploading && !isUploaded && (
                          <Button size="icon" variant="ghost" onClick={() => setDragClassifyFiles((prev) => prev.filter((_, idx) => idx !== i))} title="Remove" data-testid={`button-remove-${i}`}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {isFailed && item.error && (
                        <p className="text-xs text-destructive pl-6">{item.error}</p>
                      )}
                      {!isUploaded && (
                        <div className="grid grid-cols-3 gap-2 pl-6">
                          <Select value={item.documentType} onValueChange={(v) => setDragClassifyFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, documentType: v } : f))} disabled={isUploading}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-classify-type-${i}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOC_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={item.contractId || "none"} onValueChange={(v) => setDragClassifyFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, contractId: v === "none" ? "" : v } : f))} disabled={isUploading}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-classify-contract-${i}`}>
                              <SelectValue placeholder="No contract" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No contract</SelectItem>
                              {contracts.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.contractName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-8 text-xs"
                            placeholder="Notes (optional)"
                            value={item.notes}
                            onChange={(e) => setDragClassifyFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, notes: e.target.value } : f))}
                            disabled={isUploading}
                            data-testid={`input-classify-notes-${i}`}
                          />
                        </div>
                      )}
                      {isUploaded && (
                        <div className="flex items-center gap-2 pl-6 flex-wrap">
                          <span className="text-xs text-muted-foreground">{DOC_TYPE_OPTIONS.find((o) => o.value === item.documentType)?.label ?? item.documentType}</span>
                          {item.contractId && contracts.find((c) => c.id === item.contractId) && (
                            <span className="text-xs text-muted-foreground">· {contracts.find((c) => c.id === item.contractId)?.contractName}</span>
                          )}
                          {item.notes && <span className="text-xs text-muted-foreground">· {item.notes}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {dragClassifyFiles.length > 0 && (() => {
                const uploaded = dragClassifyFiles.filter((f) => f.status === "uploaded").length;
                const failed = dragClassifyFiles.filter((f) => f.status === "failed").length;
                const pending = dragClassifyFiles.filter((f) => f.status === "pending").length;
                const parts: string[] = [];
                if (uploaded > 0) parts.push(`${uploaded} uploaded`);
                if (failed > 0) parts.push(`${failed} failed`);
                if (pending > 0) parts.push(`${pending} pending`);
                return <span className="text-xs text-muted-foreground">{dragClassifyFiles.length} file{dragClassifyFiles.length !== 1 ? "s" : ""}{parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}</span>;
              })()}
              {!isBatchUploading && (
                <>
                  <Button size="sm" variant="outline" onClick={() => document.getElementById("batch-add-more-files")?.click()} data-testid="button-batch-add-more">
                    <Plus className="mr-1 h-3 w-3" />Add Files
                  </Button>
                  <input
                    id="batch-add-more-files"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => { openDropzoneFilePicker(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                    data-testid="input-batch-add-more"
                  />
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => { if (!isBatchUploading) { setDragClassifyOpen(false); setDragClassifyFiles([]); } }}
                disabled={isBatchUploading}
              >
                {dragClassifyFiles.length > 0 && dragClassifyFiles.every((f) => f.status === "uploaded") ? "Done" : "Cancel"}
              </Button>
              {!(dragClassifyFiles.length > 0 && dragClassifyFiles.every((f) => f.status === "uploaded")) && (() => {
                const pendingCount = dragClassifyFiles.filter((f) => f.status === "pending").length;
                const failedCount = dragClassifyFiles.filter((f) => f.status === "failed").length;
                const actionCount = pendingCount + failedCount;
                let label = `Upload ${pendingCount} File${pendingCount !== 1 ? "s" : ""}`;
                if (failedCount > 0 && pendingCount === 0) label = `Retry ${failedCount} Failed`;
                else if (failedCount > 0) label = `Upload ${pendingCount} + Retry ${failedCount}`;
                return (
                  <Button onClick={handleBatchUpload} disabled={isBatchUploading || actionCount === 0} data-testid="button-classify-upload">
                    {isBatchUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {label}
                  </Button>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteAttachmentDialog
        open={!!deleteDocTarget}
        onOpenChange={(open) => { if (!open) setDeleteDocTarget(null); }}
        fileName={deleteDocTarget?.fileName ?? ''}
        context="Vendor Document"
        onConfirm={(reason) => deleteDocTarget && deleteDocMutation.mutate({ id: deleteDocTarget.id, reason })}
        isPending={deleteDocMutation.isPending}
      />

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add a note to the vendor experience log</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label required>Type</Label>
                <Select value={noteForm.noteType} onValueChange={(v) => setNoteForm({ ...noteForm, noteType: v })}>
                  <SelectTrigger data-testid="select-note-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="win">Win</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label required>Severity</Label>
                <Select value={noteForm.severity} onValueChange={(v) => setNoteForm({ ...noteForm, severity: v })}>
                  <SelectTrigger data-testid="select-note-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label required>Note</Label>
              <Textarea
                value={noteForm.noteBody}
                onChange={(e) => setNoteForm({ ...noteForm, noteBody: e.target.value })}
                placeholder="Describe the vendor experience, issue, or outcome..."
                rows={4}
                data-testid="input-note-body"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={noteForm.isPinned}
                onCheckedChange={(checked) => setNoteForm({ ...noteForm, isPinned: checked })}
                data-testid="switch-note-pinned"
              />
              <Label>Pin this note</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createNoteMutation.mutate(noteForm)}
              disabled={createNoteMutation.isPending || !noteForm.noteBody.trim()}
              data-testid="button-submit-note"
            >
              {createNoteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteNoteId} onOpenChange={(open) => { if (!open) setDeleteNoteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>Are you sure you want to delete this note? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNoteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteNoteId && deleteNoteMutation.mutate(deleteNoteId)} disabled={deleteNoteMutation.isPending} data-testid="button-confirm-delete-note">
              {deleteNoteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={complianceDialogOpen} onOpenChange={(open) => { setComplianceDialogOpen(open); if (!open) { setEditingCompliance(null); setComplianceForm(defaultComplianceForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCompliance ? "Edit Compliance Record" : "Add Compliance Record"}</DialogTitle>
            <DialogDescription>Track insurance certificates and compliance expirations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={complianceForm.complianceType} onValueChange={(val) => setComplianceForm({ ...complianceForm, complianceType: val })}>
                <SelectTrigger data-testid="select-compliance-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COI">COI (Certificate of Insurance)</SelectItem>
                  <SelectItem value="W9">W-9</SelectItem>
                  <SelectItem value="License">License</SelectItem>
                  <SelectItem value="Agreement">Agreement</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expiration Date</Label>
              <Input type="date" value={complianceForm.expirationDate} onChange={(e) => setComplianceForm({ ...complianceForm, expirationDate: e.target.value })} data-testid="input-compliance-expiration" />
            </div>
            <div className="space-y-2">
              <Label>Reminder Days Before</Label>
              <Input type="number" value={complianceForm.reminderDaysBefore} onChange={(e) => setComplianceForm({ ...complianceForm, reminderDaysBefore: e.target.value })} data-testid="input-compliance-reminder-days" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={complianceForm.notes} onChange={(e) => setComplianceForm({ ...complianceForm, notes: e.target.value })} placeholder="Optional notes..." data-testid="input-compliance-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setComplianceDialogOpen(false); setEditingCompliance(null); setComplianceForm(defaultComplianceForm); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingCompliance) {
                  updateComplianceMutation.mutate({ id: editingCompliance.id, data: complianceForm });
                } else {
                  createComplianceMutation.mutate(complianceForm);
                }
              }}
              disabled={!complianceForm.expirationDate || createComplianceMutation.isPending || updateComplianceMutation.isPending}
              data-testid="button-save-compliance"
            >
              {(createComplianceMutation.isPending || updateComplianceMutation.isPending) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingCompliance ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={riskOverrideOpen} onOpenChange={setRiskOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Risk Level</DialogTitle>
            <DialogDescription>Manually set the vendor risk level. This change will be logged in the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Risk Level</Label>
              <Select value={riskForm.riskLevel} onValueChange={(val) => setRiskForm({ ...riskForm, riskLevel: val })}>
                <SelectTrigger data-testid="select-risk-level">
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={riskForm.riskReason}
                onChange={(e) => setRiskForm({ ...riskForm, riskReason: e.target.value })}
                placeholder="Explain why this risk level is being set..."
                data-testid="input-risk-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskOverrideOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateRiskMutation.mutate(riskForm)}
              disabled={updateRiskMutation.isPending}
              data-testid="button-save-risk"
            >
              {updateRiskMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Save Risk Level
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContractDetailSheet
        contract={selectedContract}
        open={!!selectedContract}
        onOpenChange={(open) => { if (!open) setSelectedContract(null); }}
        documents={docRecords}
        onEdit={(c) => { setSelectedContract(null); openContractEdit(c); }}
      />
    </div>
  );
}


function DefaultCodingTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const defaultForm = { defaultGlAccount: '', defaultDepartment: '', defaultClassCode: '', defaultLocation: '', defaultPaymentTerms: '', defaultBillableFlag: false };
  const [form, setForm] = useState({ ...defaultForm });

  const { data: coding, isLoading: codingLoading } = useQuery<any>({
    queryKey: ['/api/vendors', vendorId, 'default-coding'],
    queryFn: () => apiRequest('GET', `/api/vendors/${vendorId}/default-coding`),
  });

  const saveCodingMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', `/api/vendors/${vendorId}/default-coding`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendorId, 'default-coding'] });
      setEditing(false);
      toast({ title: 'Default coding saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  function startEdit() {
    setForm({
      defaultGlAccount: coding?.defaultGlAccount || '',
      defaultDepartment: coding?.defaultDepartment || '',
      defaultClassCode: coding?.defaultClassCode || '',
      defaultLocation: coding?.defaultLocation || '',
      defaultPaymentTerms: coding?.defaultPaymentTerms || '',
      defaultBillableFlag: coding?.defaultBillableFlag || false,
    });
    setEditing(true);
  }

  const codingFields: Array<[string, keyof typeof defaultForm, string]> = [
    ['Default GL Account', 'defaultGlAccount', 'e.g. 6000-Vendor Expenses'],
    ['Default Department', 'defaultDepartment', 'e.g. Operations'],
    ['Default Class', 'defaultClassCode', 'e.g. Fleet'],
    ['Default Location', 'defaultLocation', 'e.g. Chicago'],
    ['Default Payment Terms', 'defaultPaymentTerms', 'e.g. Net 30'],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Default AP Coding Rules</CardTitle>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-default-coding">
              {coding ? 'Edit' : 'Configure'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {codingLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : editing ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">These defaults will auto-populate new payables created for this vendor.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {codingFields.map(([label, key, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-sm">{label}</Label>
                  <Input value={String(form[key] || '')} onChange={(e: any) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} data-testid={`input-coding-${key}`} />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="default-billable" checked={Boolean(form.defaultBillableFlag)}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, defaultBillableFlag: e.target.checked }))}
                  data-testid="checkbox-default-billable" />
                <Label htmlFor="default-billable" className="text-sm">Mark charges as billable by default</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => saveCodingMutation.mutate(form)} disabled={saveCodingMutation.isPending} data-testid="button-save-default-coding">
                {saveCodingMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : coding ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">These defaults auto-populate on new payables for this vendor.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {([
                ['GL Account', coding.defaultGlAccount],
                ['Department', coding.defaultDepartment],
                ['Class', coding.defaultClassCode],
                ['Location', coding.defaultLocation],
                ['Payment Terms', coding.defaultPaymentTerms],
                ['Billable by Default', coding.defaultBillableFlag ? 'Yes' : 'No'],
              ] as [string, any][]).map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{label}:</span>
                  <span className="font-medium">{val || <span className="text-muted-foreground italic">Not set</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No default coding configured</p>
            <p className="text-xs mt-1">Click Configure to set GL account, department, and other AP defaults for this vendor.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContractFormDialog({
  open, onOpenChange, title, description, form, setForm, onSubmit, isPending, submitLabel,
  uploadFile, onUploadFileChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: {
    contractName: string; contractType: string; effectiveDate: string;
    startDate: string; endDate: string;
    autoRenew: boolean; renewalTermDays: string; noticePeriodDays: string;
    contractStatus: string; slaSummary: string;
    noticeDeadlineDate: string; autoRenewalDate: string;
    renewalDecisionStatus: string; renewalOwnerId: string;
  };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
  uploadFile?: File | null;
  onUploadFileChange?: (f: File | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label required>Contract Name</Label>
            <Input
              value={form.contractName}
              onChange={(e) => setForm({ ...form, contractName: e.target.value })}
              placeholder="e.g. Annual Service Agreement"
              data-testid="input-contract-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Contract Type</Label>
              <Select value={form.contractType} onValueChange={(v) => setForm({ ...form, contractType: v })}>
                <SelectTrigger data-testid="select-contract-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MSA">MSA</SelectItem>
                  <SelectItem value="SOW">SOW</SelectItem>
                  <SelectItem value="Subscription">Subscription</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.contractStatus} onValueChange={(v) => setForm({ ...form, contractStatus: v })}>
                <SelectTrigger data-testid="select-contract-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Effective Date</Label>
            <Input
              type="date"
              value={form.effectiveDate}
              onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              data-testid="input-contract-effective-date"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                data-testid="input-contract-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label required>End Date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                data-testid="input-contract-end-date"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.autoRenew}
              onCheckedChange={(checked) => setForm({ ...form, autoRenew: checked })}
              data-testid="switch-auto-renew"
            />
            <Label>Auto-renew</Label>
          </div>
          {form.autoRenew && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Renewal Term (days)</Label>
                <Input
                  type="number"
                  value={form.renewalTermDays}
                  onChange={(e) => setForm({ ...form, renewalTermDays: e.target.value })}
                  placeholder="e.g. 365"
                  data-testid="input-renewal-term-days"
                />
              </div>
              <div className="space-y-2">
                <Label>Notice Period (days)</Label>
                <Input
                  type="number"
                  value={form.noticePeriodDays}
                  onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value })}
                  placeholder="e.g. 30"
                  data-testid="input-notice-period-days"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>SLA Summary</Label>
            <Textarea
              value={form.slaSummary}
              onChange={(e) => setForm({ ...form, slaSummary: e.target.value })}
              placeholder="Key SLA terms and commitments..."
              rows={3}
              data-testid="input-sla-summary"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Renewal Decision Tracking</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Notice Deadline Date</Label>
                <Input
                  type="date"
                  value={form.noticeDeadlineDate}
                  onChange={(e) => setForm({ ...form, noticeDeadlineDate: e.target.value })}
                  data-testid="input-notice-deadline-date"
                />
                <p className="text-[11px] text-muted-foreground">Last day to give non-renewal notice</p>
              </div>
              <div className="space-y-2">
                <Label>Auto-Renewal Date</Label>
                <Input
                  type="date"
                  value={form.autoRenewalDate}
                  onChange={(e) => setForm({ ...form, autoRenewalDate: e.target.value })}
                  data-testid="input-auto-renewal-date"
                />
                <p className="text-[11px] text-muted-foreground">When contract auto-renews if no action</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Renewal Decision</Label>
              <Select value={form.renewalDecisionStatus} onValueChange={(v) => setForm({ ...form, renewalDecisionStatus: v })}>
                <SelectTrigger data-testid="select-renewal-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="undecided">Undecided</SelectItem>
                  <SelectItem value="renew">Renew</SelectItem>
                  <SelectItem value="renegotiate">Renegotiate</SelectItem>
                  <SelectItem value="terminate">Terminate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {onUploadFileChange !== undefined && (
          <div className="border-t pt-4 space-y-2">
            <Label>Contract Document <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tiff,.tif"
              onChange={(e) => onUploadFileChange(e.target.files?.[0] ?? null)}
              data-testid="input-contract-file"
            />
            {uploadFile && (
              <p className="text-xs text-muted-foreground truncate">Selected: {uploadFile.name}</p>
            )}
            <p className="text-xs text-muted-foreground">PDF, DOCX, or image scan — stored in Vendor Documents and linked to this contract</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !form.contractName.trim() || !form.startDate || !form.endDate}
            data-testid="button-submit-contract"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorFormDialog({
  open, onOpenChange, title, description, form, setForm, onSubmit, isPending, submitLabel, vendorId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: {
    name: string; legalName: string; vendorType: string; category: string;
    website: string; w9OnFile: boolean; paymentTerms: string; remitAddress: string;
    supportPhone: string; supportEmail: string; supportPortalUrl: string;
    vendorOwner: string; secondaryOwnerId: string;
  };
  setForm: (f: typeof form) => void;
  onSubmit: (w9File: File | null, removeExistingW9Id: string | null) => void;
  isPending: boolean;
  submitLabel: string;
  vendorId?: string;
}) {
  const { data: formUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null; role: string }[]>({
    queryKey: ["/api/vendors/owners"],
  });

  const { data: vendorDocs = [] } = useQuery<VendorDocument[]>({
    queryKey: ["/api/vendors", vendorId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendorId}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!vendorId && open,
  });

  const [w9File, setW9File] = useState<File | null>(null);
  const [removeExistingW9Id, setRemoveExistingW9Id] = useState<string | null>(null);
  const [w9Error, setW9Error] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingW9 = vendorDocs.find((d) => d.documentType === "W9" && !d.isDeleted) ?? null;
  const showExisting = existingW9 && !removeExistingW9Id && !w9File;

  useEffect(() => {
    if (!open) {
      setW9File(null);
      setRemoveExistingW9Id(null);
      setW9Error("");
    }
  }, [open]);

  function handleSubmit() {
    if (form.w9OnFile && !w9File && !showExisting) {
      setW9Error("W-9 document is required when 'W-9 on file' is selected.");
      return;
    }
    setW9Error("");
    onSubmit(w9File, removeExistingW9Id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Vendor name"
                data-testid="input-vendor-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Legal Name</Label>
              <Input
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                placeholder="Legal entity name"
                data-testid="input-vendor-legal-name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input
                value={form.vendorType}
                onChange={(e) => setForm({ ...form, vendorType: e.target.value })}
                placeholder="e.g. Technology, Insurance"
                data-testid="input-vendor-type"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Fleet, Operations"
                data-testid="input-vendor-category"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://..."
                data-testid="input-vendor-website"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Input
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                placeholder="e.g. Net 30"
                data-testid="input-vendor-payment-terms"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Remit Address</Label>
            <Textarea
              value={form.remitAddress}
              onChange={(e) => setForm({ ...form, remitAddress: e.target.value })}
              placeholder="Payment mailing address"
              rows={2}
              data-testid="input-vendor-remit-address"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                placeholder="support@vendor.com"
                data-testid="input-vendor-support-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Support Phone</Label>
              <Input
                value={form.supportPhone}
                onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                placeholder="(555) 123-4567"
                data-testid="input-vendor-support-phone"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Support Portal URL</Label>
            <Input
              value={form.supportPortalUrl}
              onChange={(e) => setForm({ ...form, supportPortalUrl: e.target.value })}
              placeholder="https://support.vendor.com"
              data-testid="input-vendor-support-portal"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor Owner</Label>
              <Select value={form.vendorOwner} onValueChange={(val) => setForm({ ...form, vendorOwner: val })}>
                <SelectTrigger data-testid="select-vendor-owner">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Owner</SelectItem>
                  {formUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Secondary Owner</Label>
              <Select value={form.secondaryOwnerId} onValueChange={(val) => setForm({ ...form, secondaryOwnerId: val })}>
                <SelectTrigger data-testid="select-secondary-owner">
                  <SelectValue placeholder="Select secondary" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {formUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.w9OnFile}
                onCheckedChange={(checked) => {
                  setForm({ ...form, w9OnFile: checked });
                  if (!checked) {
                    setW9File(null);
                    setW9Error("");
                  }
                }}
                data-testid="switch-vendor-w9"
              />
              <div>
                <Label>W-9 on file</Label>
                <p className="text-xs text-muted-foreground">A W-9 document must be uploaded when this is enabled</p>
              </div>
            </div>

            {form.w9OnFile && (
              <div className="space-y-2 ml-1">
                <Label className={w9Error ? "text-destructive" : ""}>
                  W-9 Document <span className="text-destructive">*</span>
                </Label>

                {showExisting && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{existingW9.fileName}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-replace-w9"
                    >
                      Replace
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setRemoveExistingW9Id(existingW9.id);
                        setForm({ ...form, w9OnFile: false });
                      }}
                      data-testid="button-remove-w9"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {w9File && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{w9File.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      onClick={() => { setW9File(null); if (!showExisting) setForm({ ...form, w9OnFile: false }); }}
                      data-testid="button-clear-w9-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {!showExisting && !w9File && (
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-w9"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload W-9
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  data-testid="input-w9-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) {
                      setW9File(f);
                      setW9Error("");
                      if (!form.w9OnFile) setForm({ ...form, w9OnFile: true });
                    }
                    e.target.value = "";
                  }}
                />

                {w9Error && (
                  <p className="text-sm text-destructive" data-testid="text-w9-error">{w9Error}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !form.name.trim()}
            data-testid="button-submit-vendor"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingFormDialog({
  open, onOpenChange, title, description, form, setForm, contracts, onSubmit, isPending, submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: {
    contractId: string; pricingType: string; unitRate: string; unitDescription: string;
    minimumCommitment: string; effectiveStart: string; effectiveEnd: string; notes: string;
  };
  setForm: (f: typeof form) => void;
  contracts: VendorContract[];
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Pricing Type</Label>
              <Select value={form.pricingType} onValueChange={(v) => setForm({ ...form, pricingType: v })}>
                <SelectTrigger data-testid="select-pricing-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="per_trip">Per Trip</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="usage">Usage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Linked Contract</Label>
              <Select value={form.contractId || "none"} onValueChange={(v) => setForm({ ...form, contractId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-pricing-contract">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.contractName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Unit Rate</Label>
              <Input
                type="number"
                step="0.01"
                value={form.unitRate}
                onChange={(e) => setForm({ ...form, unitRate: e.target.value })}
                placeholder="0.00"
                data-testid="input-pricing-unit-rate"
              />
            </div>
            <div className="space-y-2">
              <Label required>Unit Description</Label>
              <Input
                value={form.unitDescription}
                onChange={(e) => setForm({ ...form, unitDescription: e.target.value })}
                placeholder="e.g. per hour, per trip, per month"
                data-testid="input-pricing-unit-description"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Minimum Commitment</Label>
            <Input
              type="number"
              step="0.01"
              value={form.minimumCommitment}
              onChange={(e) => setForm({ ...form, minimumCommitment: e.target.value })}
              placeholder="Optional minimum amount"
              data-testid="input-pricing-minimum-commitment"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Effective Start</Label>
              <Input
                type="date"
                value={form.effectiveStart}
                onChange={(e) => setForm({ ...form, effectiveStart: e.target.value })}
                data-testid="input-pricing-effective-start"
              />
            </div>
            <div className="space-y-2">
              <Label>Effective End</Label>
              <Input
                type="date"
                value={form.effectiveEnd}
                onChange={(e) => setForm({ ...form, effectiveEnd: e.target.value })}
                data-testid="input-pricing-effective-end"
              />
              <p className="text-xs text-muted-foreground">Leave blank for ongoing</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional pricing details or conditions..."
              rows={3}
              data-testid="input-pricing-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !form.unitRate || !form.unitDescription.trim() || !form.effectiveStart}
            data-testid="button-submit-pricing"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactFormDialog({
  open, onOpenChange, title, description, form, setForm, onSubmit, isPending, submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: {
    name: string; title: string; email: string; phone: string;
    role: string; escalationLevel: number; isPrimary: boolean;
  };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contact name"
                data-testid="input-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Account Manager"
                data-testid="input-contact-title"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@vendor.com"
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 555-5555"
                data-testid="input-contact-phone"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="select-contact-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="escalation">Escalation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escalation Level (1-3)</Label>
              <Select value={form.escalationLevel.toString()} onValueChange={(v) => setForm({ ...form, escalationLevel: parseInt(v) })}>
                <SelectTrigger data-testid="select-contact-escalation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - First Line</SelectItem>
                  <SelectItem value="2">Level 2 - Manager</SelectItem>
                  <SelectItem value="3">Level 3 - Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.isPrimary}
              onCheckedChange={(checked) => setForm({ ...form, isPrimary: checked })}
              data-testid="switch-contact-primary"
            />
            <Label>Primary Contact</Label>
            <p className="text-xs text-muted-foreground">Only one contact can be primary at a time</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !form.name.trim()}
            data-testid="button-submit-contact"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Contract Detail Sheet ─────────────────────────────────────────────────────
function ContractDetailSheet({
  contract, open, onOpenChange, documents, onEdit,
}: {
  contract: VendorContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: VendorDocument[];
  onEdit: (c: VendorContract) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showExtraction, setShowExtraction] = useState(false);
  const [fullReviewPending, setFullReviewPending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<ContractAiReview | null>(null);

  // Obligations state
  const [obligationDialogOpen, setObligationDialogOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<ContractObligation | null>(null);
  const [deletingObligationId, setDeletingObligationId] = useState<string | null>(null);
  const emptyObligationForm = { obligationType: "insurance" as string, title: "", description: "", dueDate: "", recurrence: "none" as string, status: "active" as string, assignedTo: "" as string, notes: "" };
  const [obligationForm, setObligationForm] = useState(emptyObligationForm);

  const { data: obligations = [], isLoading: obligationsLoading } = useQuery<ContractObligation[]>({
    queryKey: ["/api/contracts", contract?.id, "obligations"],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load obligations");
      return res.json();
    },
    enabled: !!contract?.id && open,
  });

  const createObligationMutation = useMutation({
    mutationFn: async (body: typeof emptyObligationForm) => {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "obligations"] });
      setObligationDialogOpen(false);
      setObligationForm(emptyObligationForm);
      toast({ title: "Obligation added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateObligationMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: typeof emptyObligationForm }) => {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to update");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "obligations"] });
      setObligationDialogOpen(false);
      setEditingObligation(null);
      setObligationForm(emptyObligationForm);
      toast({ title: "Obligation updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteObligationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "obligations"] });
      setDeletingObligationId(null);
      toast({ title: "Obligation removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAddObligation() {
    setEditingObligation(null);
    setObligationForm(emptyObligationForm);
    setObligationDialogOpen(true);
  }

  function openEditObligation(o: ContractObligation) {
    setEditingObligation(o);
    setObligationForm({
      obligationType: o.obligationType,
      title: o.title,
      description: o.description ?? "",
      dueDate: o.dueDate ?? "",
      recurrence: o.recurrence,
      status: o.status,
      assignedTo: (o as any).assignedTo ?? "",
      notes: o.notes ?? "",
    });
    setObligationDialogOpen(true);
  }

  function submitObligation() {
    const payload = { ...obligationForm, dueDate: obligationForm.dueDate || undefined, description: obligationForm.description || undefined, notes: obligationForm.notes || undefined };
    if (editingObligation) {
      updateObligationMutation.mutate({ id: editingObligation.id, body: payload as typeof emptyObligationForm });
    } else {
      createObligationMutation.mutate(payload as typeof emptyObligationForm);
    }
  }

  // AI Discovery state
  type ObligationSuggestion = { obligationType: string; title: string; description: string | null; dueDate: string | null; recurrence: string; };
  const [suggestions, setSuggestions] = useState<ObligationSuggestion[]>([]);
  const [discoverSourceDoc, setDiscoverSourceDoc] = useState<string>("");
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations/discover`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Discovery failed");
      return json as { suggestions: ObligationSuggestion[]; documentName: string };
    },
    onSuccess: (data) => {
      if (!data.suggestions.length) {
        toast({ title: "No obligations found", description: "The AI could not identify any trackable obligations in the contract." });
        return;
      }
      setSuggestions(data.suggestions);
      setDiscoverSourceDoc(data.documentName);
      toast({ title: `${data.suggestions.length} obligation${data.suggestions.length !== 1 ? "s" : ""} discovered`, description: "Review and approve each suggestion below." });
    },
    onError: (e: Error) => toast({ title: "Discovery failed", description: e.message, variant: "destructive" }),
  });

  async function approveSuggestion(idx: number) {
    const s = suggestions[idx];
    setApprovingIndex(idx);
    try {
      const res = await fetch(`/api/contracts/${contract!.id}/obligations`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligationType: s.obligationType, title: s.title, description: s.description || undefined, dueDate: s.dueDate || undefined, recurrence: s.recurrence, status: "active" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to approve");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "obligations"] });
      setSuggestions(prev => prev.filter((_, i) => i !== idx));
      toast({ title: "Obligation activated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setApprovingIndex(null);
    }
  }

  function dismissSuggestion(idx: number) {
    setSuggestions(prev => prev.filter((_, i) => i !== idx));
  }

  async function downloadDoc(id: string, fileName: string) {
    try {
      const res = await fetch(`/api/vendor-documents/${id}/download`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        toast({ title: "Download failed", description: err.message ?? "File could not be retrieved", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Network error — please try again", variant: "destructive" });
    }
  }

  const { data: owners = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null }[]>({
    queryKey: ["/api/vendors/owners"],
    enabled: open,
  });

  const { data: extractions = [] } = useQuery<ContractAiReview[]>({
    queryKey: ["/api/contracts", contract?.id, "ai-extractions"],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contract!.id}/ai-extractions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load extractions");
      return res.json();
    },
    enabled: open && !!contract?.id,
  });

  const latestExtraction = pendingExtraction ?? extractions[0] ?? null;
  const latestFields = (latestExtraction?.extractedJson as Record<string, string | null> | null) ?? null;

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contract!.id}/ai-extract`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Extraction failed");
      return json as ContractAiReview;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "ai-extractions"] });
      setPendingExtraction(data);
      setShowExtraction(true);
      setReviewOpen(true);
      toast({ title: "Extraction complete", description: "Review the extracted fields before applying." });
    },
    onError: (err: Error) => {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Contract Intelligence hooks (must be before early return) ────────────────
  const [ciExpanded, setCiExpanded] = useState<string | null>(null);
  const [contractInvoiceText, setContractInvoiceText] = useState("");
  const [contractInvoiceResult, setContractInvoiceResult] = useState<any>(null);

  const { data: contractReviews = [] } = useQuery<ContractAiReview[]>({
    queryKey: ["/api/contracts", contract?.id, "ai-reviews"],
    queryFn: async () => {
      if (!contract?.id) return [];
      const res = await fetch(`/api/contracts/${contract.id}/ai-reviews`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!contract?.id,
  });

  const fullReviewFromDocMutation = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error("No contract selected");
      const docs = documents.filter(d => d.contractId === contract.id);
      const parseable = docs.find(d => ["pdf","doc","docx"].includes(d.fileName.split(".").pop()?.toLowerCase() ?? ""));
      if (!parseable) throw new Error("No readable document linked to this contract");
      const res = await fetch(`/api/vendors/${contract.vendorId}/contract-ai-review-from-doc`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: parseable.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "AI review failed");
      return json as ContractAiReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "ai-reviews"] });
      setCiExpanded("full-review");
      toast({ title: "Full AI review complete" });
    },
    onError: (e: Error) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const riskAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error("No contract selected");
      const res = await fetch(`/api/contracts/${contract.id}/ai-risk-analysis`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Risk analysis failed");
      return json as ContractAiReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "ai-reviews"] });
      setCiExpanded("risks");
      toast({ title: "Risk analysis complete" });
    },
    onError: (e: Error) => toast({ title: "Risk analysis failed", description: e.message, variant: "destructive" }),
  });

  const renewalAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error("No contract selected");
      const res = await fetch(`/api/contracts/${contract.id}/ai-renewal-analysis`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Renewal analysis failed");
      return json as ContractAiReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id, "ai-reviews"] });
      setCiExpanded("renewal");
      toast({ title: "Renewal analysis complete" });
    },
    onError: (e: Error) => toast({ title: "Renewal analysis failed", description: e.message, variant: "destructive" }),
  });

  const contractInvoiceAuditMutation = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error("No contract selected");
      if (!contractInvoiceText.trim()) throw new Error("No invoice text");
      const res = await fetch(`/api/vendors/${contract.vendorId}/invoice-audit-text`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceText: contractInvoiceText.trim(), contractId: contract.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Invoice comparison failed");
      return json;
    },
    onSuccess: (data) => {
      setContractInvoiceResult(data);
      setContractInvoiceText("");
      toast({ title: "Invoice comparison complete", description: `Status: ${data.auditStatus.toUpperCase()}` });
    },
    onError: (e: Error) => toast({ title: "Invoice comparison failed", description: e.message, variant: "destructive" }),
  });

  if (!contract) return null;

  const linkedDocs = documents.filter((d) => d.contractId === contract.id);
  const hasParseableDoc = linkedDocs.some(d => {
    const ext = d.fileName.split('.').pop()?.toLowerCase() ?? '';
    return ['pdf', 'doc', 'docx'].includes(ext);
  });
  const parseableLinkedDoc = linkedDocs.find(d => {
    const ext = d.fileName.split('.').pop()?.toLowerCase() ?? '';
    return ['pdf', 'doc', 'docx'].includes(ext);
  });

  const latestFullReview = contractReviews.find(r => r.extractionType === "full_review") ?? null;
  const latestRiskAnalysis = contractReviews.find(r => r.extractionType === "risk_analysis") ?? null;
  const latestRenewalAnalysis = contractReviews.find(r => r.extractionType === "renewal_analysis") ?? null;

  async function runFullReview() {
    if (!contract || !parseableLinkedDoc) return;
    setFullReviewPending(true);
    try {
      const res = await fetch(`/api/vendors/${contract.vendorId}/contract-ai-review-from-doc`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: parseableLinkedDoc.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "AI review failed");
      toast({ title: "Full review complete", description: "View results in the AI Review tab." });
    } catch (err: any) {
      toast({ title: "Full review failed", description: err.message, variant: "destructive" });
    } finally {
      setFullReviewPending(false);
    }
  }

  const owner = owners.find((u) => u.id === contract.renewalOwnerId);
  const ownerName = owner
    ? (owner.firstName ? `${owner.firstName} ${owner.lastName ?? ""}`.trim() : owner.email ?? "—")
    : contract.renewalOwnerId ? "Loading…" : "—";

  function fmt(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default", draft: "outline", expired: "destructive", terminated: "secondary",
  };

  const coreRows: { label: string; value: string }[] = [
    { label: "Contract Name",  value: contract.contractName },
    { label: "Contract Type",  value: contract.contractType },
    { label: "Effective Date", value: fmt((contract as any).effectiveDate) },
    { label: "Start Date",     value: fmt(contract.startDate) },
    { label: "End Date",       value: fmt(contract.endDate) },
    { label: "Contract Owner", value: ownerName },
    { label: "Auto Renew",     value: contract.autoRenew ? "Yes" : "No" },
    { label: "Renewal Term",   value: contract.renewalTermDays ? `${contract.renewalTermDays} days` : "—" },
    { label: "Notice Period",  value: contract.noticePeriodDays ? `${contract.noticePeriodDays} days` : "—" },
  ];

  const extractionFields: { key: string; label: string }[] = [
    { key: "contractName",        label: "Contract Name" },
    { key: "contractType",        label: "Contract Type" },
    { key: "effectiveDate",       label: "Effective Date" },
    { key: "startDate",           label: "Start Date" },
    { key: "endDate",             label: "End Date" },
    { key: "autoRenewalLanguage", label: "Auto-Renewal Language" },
    { key: "noticePeriod",        label: "Notice Period" },
    { key: "paymentTerms",        label: "Payment Terms" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="sheet-contract-detail">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-snug" data-testid="text-contract-detail-name">
                {contract.contractName}
              </SheetTitle>
              <SheetDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{contract.contractType}</Badge>
                <Badge
                  variant={statusVariant[contract.contractStatus] ?? "outline"}
                  className="text-xs capitalize"
                  data-testid="badge-contract-detail-status"
                >
                  {contract.contractStatus}
                </Badge>
                {extractions.length > 0 && (
                  <Badge variant="secondary" className="text-xs no-default-active-elevate">
                    <Sparkles className="h-3 w-3 mr-1" />AI Reviewed
                  </Badge>
                )}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => onEdit(contract)} data-testid="button-contract-detail-edit">
                <Pencil className="h-4 w-4 mr-1" />Edit
              </Button>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {/* Obligation due-date alerts */}
        {(() => {
          const now = new Date();
          const threshold = new Date(); threshold.setDate(threshold.getDate() + 14);
          const overdueObs = obligations.filter(ob =>
            ob.status !== "closed" && ob.status !== "waived" && ob.status !== "compliant" && ob.status !== "completed" &&
            ob.dueDate && new Date(ob.dueDate) < now
          );
          const dueSoonObs = obligations.filter(ob =>
            ob.status !== "closed" && ob.status !== "waived" && ob.status !== "compliant" && ob.status !== "completed" &&
            ob.dueDate && new Date(ob.dueDate) >= now && new Date(ob.dueDate) <= threshold
          );
          if (overdueObs.length === 0 && dueSoonObs.length === 0) return null;
          return (
            <div className="mt-4 space-y-2" data-testid="contract-obligation-alerts">
              {overdueObs.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300" data-testid="alert-contract-obligations-overdue">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="text-xs font-medium">
                    {overdueObs.length} overdue obligation{overdueObs.length !== 1 ? "s" : ""}: {overdueObs.slice(0, 2).map(o => o.title).join(", ")}{overdueObs.length > 2 ? ` +${overdueObs.length - 2} more` : ""}
                  </p>
                </div>
              )}
              {dueSoonObs.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" data-testid="alert-contract-obligations-due-soon">
                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="text-xs font-medium">
                    {dueSoonObs.length} obligation{dueSoonObs.length !== 1 ? "s" : ""} due within 14 days: {dueSoonObs.slice(0, 2).map(o => `${o.title} (${formatDate(o.dueDate!)})`).join(", ")}{dueSoonObs.length > 2 ? ` +${dueSoonObs.length - 2} more` : ""}
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Core field rows */}
        <div className="mt-4">
          {coreRows.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
            >
              <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
              <span
                className="text-sm font-medium text-right"
                data-testid={`text-contract-${label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {value}
              </span>
            </div>
          ))}
          {contract.slaSummary && (
            <div className="flex flex-col gap-1 pt-2.5">
              <span className="text-sm text-muted-foreground">SLA Summary</span>
              <span className="text-sm" data-testid="text-contract-sla-summary">{contract.slaSummary}</span>
            </div>
          )}
        </div>

        {/* ── Contract Intelligence ──────────────────────────────────── */}
        <div className="mt-6" data-testid="section-contract-intelligence">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Contract Intelligence</span>
            {(extractions.length + contractReviews.length) > 0 && (
              <Badge variant="secondary" className="text-xs no-default-active-elevate">
                {extractions.length + contractReviews.length} {extractions.length + contractReviews.length === 1 ? "analysis" : "analyses"} run
              </Badge>
            )}
          </div>

          {!hasParseableDoc && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Link a PDF or Word document to this contract to enable AI analyses. Invoice Comparison accepts pasted text and does not require a linked document.
              </p>
            </div>
          )}

          <div className="rounded-md border divide-y" data-testid="panel-intelligence-actions">
            {/* ── 1. Extract Fields ─────────────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "extract";
              const isPending = extractMutation.isPending;
              return (
                <div data-testid="ci-row-extract">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "extract")}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Extract Fields</p>
                        <p className="text-xs text-muted-foreground">Pull key dates, terms, and clauses from the document</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {latestExtraction && (
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">
                          {new Date(latestExtraction.reviewedAt).toLocaleDateString()}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={latestExtraction ? "ghost" : "outline"}
                        onClick={(e) => { e.stopPropagation(); extractMutation.mutate(); setCiExpanded("extract"); }}
                        disabled={isPending || !hasParseableDoc}
                        data-testid="button-ci-extract-fields"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : latestExtraction ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">{latestExtraction ? "Re-run" : "Run"}</span>
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20">
                      {isPending ? (
                        <div className="flex items-center gap-3 p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                          <p className="text-sm text-muted-foreground">Extracting key fields…</p>
                        </div>
                      ) : latestFields ? (
                        <div>
                          <div className="px-3 py-2 bg-muted/40 border-b flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{latestExtraction!.fileName}</span></span>
                            <span className="text-xs text-muted-foreground ml-auto">{latestExtraction!.reviewedByAiModel}</span>
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-y">
                            {extractionFields.map(({ key, label }) => {
                              const raw = latestFields[key];
                              const isDateField = ["effectiveDate","startDate","endDate"].includes(key);
                              const display = raw ? (isDateField ? fmt(raw) : raw) : <span className="italic text-muted-foreground">Not found</span>;
                              return (
                                <div key={key} className="px-3 py-2.5" data-testid={`row-extraction-${key}`}>
                                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                                  <p className="text-sm">{display}</p>
                                </div>
                              );
                            })}
                          </div>
                          <div className="px-3 py-2 border-t flex items-center gap-1.5">
                            <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground">For review only — does not update the contract record.</p>
                          </div>
                        </div>
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No extraction results yet. Run this action to extract key fields.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 2. Full AI Review ─────────────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "full-review";
              const isPending = fullReviewFromDocMutation.isPending;
              const review = latestFullReview;
              const extracted = (review?.extractedJson as any) ?? null;
              return (
                <div data-testid="ci-row-full-review">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "full-review")}
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Full AI Review</p>
                        <p className="text-xs text-muted-foreground">Comprehensive analysis: terms, pricing, SLAs, risks, action items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {review && (
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">
                          {new Date(review.reviewedAt).toLocaleDateString()}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={review ? "ghost" : "outline"}
                        onClick={(e) => { e.stopPropagation(); fullReviewFromDocMutation.mutate(); }}
                        disabled={isPending || !hasParseableDoc}
                        data-testid="button-ci-full-review"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : review ? <RefreshCw className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">{review ? "Re-run" : "Run"}</span>
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20">
                      {isPending ? (
                        <div className="flex items-center gap-3 p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                          <p className="text-sm text-muted-foreground">Running full AI review… this takes 20–40 seconds</p>
                        </div>
                      ) : review && extracted ? (
                        <div className="p-3 space-y-3">
                          {review.executiveSummary && (
                            <div className="rounded-md border bg-card p-3">
                              <p className="text-xs text-muted-foreground font-medium mb-1">Executive Summary</p>
                              <p className="text-sm">{review.executiveSummary}</p>
                            </div>
                          )}
                          {review.riskSummary && (
                            <div className="rounded-md border bg-card p-3">
                              <p className="text-xs text-muted-foreground font-medium mb-1">Risk Assessment</p>
                              <p className="text-sm">{review.riskSummary}</p>
                            </div>
                          )}
                          {Array.isArray(extracted.keyRisks) && extracted.keyRisks.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1.5">Key Risks</p>
                              <ul className="space-y-1">
                                {extracted.keyRisks.map((r: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Array.isArray(review.actionItems) && (review.actionItems as any[]).length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1.5">Action Items</p>
                              <ul className="space-y-1">
                                {(review.actionItems as any[]).map((a: any, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <Badge variant={a.priority === "high" ? "destructive" : a.priority === "medium" ? "outline" : "secondary"} className="text-xs no-default-active-elevate shrink-0">{a.priority}</Badge>
                                    {a.item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No review results yet. Run this action for a comprehensive AI analysis.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 3. Discover Obligations ───────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "obligations";
              const isPending = discoverMutation.isPending;
              return (
                <div data-testid="ci-row-obligations">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "obligations")}
                  >
                    <div className="flex items-center gap-3">
                      <ListChecks className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Discover Obligations</p>
                        <p className="text-xs text-muted-foreground">AI scans for insurance, notice, SLA, payment, and other obligations</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {obligations.length > 0 && (
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">{obligations.length} tracked</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); discoverMutation.mutate(); setCiExpanded("obligations"); }}
                        disabled={isPending || !hasParseableDoc}
                        data-testid="button-ci-discover-obligations"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">Discover</span>
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20">
                      {isPending ? (
                        <div className="flex items-center gap-3 p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                          <p className="text-sm text-muted-foreground">Scanning for obligations…</p>
                        </div>
                      ) : suggestions.length > 0 ? (
                        <div className="divide-y">
                          <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="text-xs font-medium text-muted-foreground">{suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} — approve to track</span>
                            <Button size="sm" variant="ghost" onClick={() => setSuggestions([])} className="text-xs h-7">Clear all</Button>
                          </div>
                          {suggestions.map((s, idx) => (
                            <div key={idx} className="px-3 py-2.5 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  <Badge variant="outline" className="text-xs capitalize">{s.obligationType}</Badge>
                                  {s.recurrence !== "none" && <Badge variant="secondary" className="text-xs capitalize no-default-active-elevate">{s.recurrence}</Badge>}
                                </div>
                                <p className="text-sm font-medium">{s.title}</p>
                                {s.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="outline" onClick={() => approveSuggestion(idx)} disabled={approvingIndex === idx} data-testid={`button-approve-suggestion-${idx}`}>
                                  {approvingIndex === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />}
                                  Approve
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => dismissSuggestion(idx)} data-testid={`button-dismiss-suggestion-${idx}`}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : obligations.length > 0 ? (
                        <p className="px-3 py-3 text-xs text-muted-foreground">{obligations.length} obligation{obligations.length !== 1 ? "s" : ""} currently tracked. Run Discover again to look for new ones.</p>
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No obligations found yet. Run Discover to scan the contract document.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 4. Identify Risks ─────────────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "risks";
              const isPending = riskAnalysisMutation.isPending;
              const review = latestRiskAnalysis;
              const data = (review?.extractedJson as any) ?? null;
              const severityColor = (s: string) => s === "Critical" ? "text-red-600 dark:text-red-400" : s === "High" ? "text-orange-600 dark:text-orange-400" : s === "Medium" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
              const scoreBadge = (s: string) => s === "Critical" || s === "High" ? "destructive" : s === "Medium" ? "outline" : "secondary";
              return (
                <div data-testid="ci-row-risks">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "risks")}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Identify Risks</p>
                        <p className="text-xs text-muted-foreground">Assess liability, IP, SLA, data privacy, and financial exposure</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {data?.riskScore && (
                        <Badge variant={scoreBadge(data.riskScore) as any} className="text-xs no-default-active-elevate">{data.riskScore} Risk</Badge>
                      )}
                      {review && !data?.riskScore && (
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">{new Date(review.reviewedAt).toLocaleDateString()}</Badge>
                      )}
                      <Button
                        size="sm"
                        variant={review ? "ghost" : "outline"}
                        onClick={(e) => { e.stopPropagation(); riskAnalysisMutation.mutate(); }}
                        disabled={isPending || !hasParseableDoc}
                        data-testid="button-ci-risk-analysis"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : review ? <RefreshCw className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">{review ? "Re-run" : "Run"}</span>
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20">
                      {isPending ? (
                        <div className="flex items-center gap-3 p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                          <p className="text-sm text-muted-foreground">Analyzing contract risks…</p>
                        </div>
                      ) : data ? (
                        <div className="p-3 space-y-3">
                          {data.overallAssessment && (
                            <div className="rounded-md border bg-card p-3">
                              <p className="text-xs text-muted-foreground font-medium mb-1">Overall Assessment</p>
                              <p className="text-sm">{data.overallAssessment}</p>
                            </div>
                          )}
                          {Array.isArray(data.keyRisks) && data.keyRisks.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1.5">Key Risks</p>
                              <div className="space-y-2">
                                {data.keyRisks.map((r: any, i: number) => (
                                  <div key={i} className="rounded-md border bg-card p-2.5">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className="text-xs font-medium">{r.category}</span>
                                      <span className={`text-xs font-medium ${severityColor(r.severity)}`}>{r.severity}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{r.description}</p>
                                    {r.mitigation && <p className="text-xs text-muted-foreground mt-1 italic">Mitigation: {r.mitigation}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(data.missingProtections) && data.missingProtections.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1.5">Missing Protections</p>
                              <ul className="space-y-1">
                                {data.missingProtections.map((m: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                    {m}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1.5">Recommendations</p>
                              <ul className="space-y-1">
                                {data.recommendations.map((rec: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-xs">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                    {rec}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No risk analysis yet. Run this action to assess contract risks.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 5. Review Renewal Terms ───────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "renewal";
              const isPending = renewalAnalysisMutation.isPending;
              const review = latestRenewalAnalysis;
              const data = (review?.extractedJson as any) ?? null;
              const recBadge = (r: string) => r === "Terminate" ? "destructive" : r === "Renegotiate" ? "outline" : r === "Renew" ? "secondary" : "secondary";
              return (
                <div data-testid="ci-row-renewal">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "renewal")}
                  >
                    <div className="flex items-center gap-3">
                      <RotateCcw className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Review Renewal Terms</p>
                        <p className="text-xs text-muted-foreground">Auto-renewal clauses, notice deadlines, price escalation, and recommendation</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {data?.renewalRecommendation && (
                        <Badge variant={recBadge(data.renewalRecommendation) as any} className="text-xs no-default-active-elevate">{data.renewalRecommendation}</Badge>
                      )}
                      {review && !data?.renewalRecommendation && (
                        <Badge variant="secondary" className="text-xs no-default-active-elevate">{new Date(review.reviewedAt).toLocaleDateString()}</Badge>
                      )}
                      <Button
                        size="sm"
                        variant={review ? "ghost" : "outline"}
                        onClick={(e) => { e.stopPropagation(); renewalAnalysisMutation.mutate(); }}
                        disabled={isPending || !hasParseableDoc}
                        data-testid="button-ci-renewal-analysis"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : review ? <RefreshCw className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">{review ? "Re-run" : "Run"}</span>
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20">
                      {isPending ? (
                        <div className="flex items-center gap-3 p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                          <p className="text-sm text-muted-foreground">Analyzing renewal terms…</p>
                        </div>
                      ) : data ? (
                        <div className="p-3 space-y-3">
                          {data.renewalNotes && (
                            <div className="rounded-md border bg-card p-3">
                              <p className="text-xs text-muted-foreground font-medium mb-1">Renewal Assessment</p>
                              <p className="text-sm">{data.renewalNotes}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Auto-Renewal", value: data.autoRenewalClause },
                              { label: "Renewal Term", value: data.renewalTermLength },
                              { label: "Notice Deadline", value: data.noticeDeadline },
                              { label: "Est. Notice Date", value: data.estimatedNoticeDate },
                              { label: "Price Escalation", value: data.priceEscalation },
                              { label: "Termination for Convenience", value: data.terminationForConvenience },
                            ].filter(f => f.value).map(({ label, value }) => (
                              <div key={label} className="rounded-md border bg-card px-3 py-2">
                                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                                <p className="text-sm font-medium">{value}</p>
                              </div>
                            ))}
                          </div>
                          {data.terminationNotice && (
                            <div className="rounded-md border bg-card px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Termination Notice Requirements</p>
                              <p className="text-sm">{data.terminationNotice}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No renewal analysis yet. Run this action to review renewal terms.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 6. Compare Invoice ────────────────────────────────────── */}
            {(() => {
              const isExpanded = ciExpanded === "invoice";
              const isPending = contractInvoiceAuditMutation.isPending;
              const result = contractInvoiceResult;
              const statusConfig: Record<string, { cls: string }> = {
                match: { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                warning: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
                exception: { cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
              };
              return (
                <div data-testid="ci-row-invoice">
                  <button
                    className="flex items-center justify-between w-full px-3 py-3 hover-elevate"
                    onClick={() => setCiExpanded(isExpanded ? null : "invoice")}
                  >
                    <div className="flex items-center gap-3">
                      <ScanLine className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Compare Invoice</p>
                        <p className="text-xs text-muted-foreground">Paste invoice text to compare line items against this contract's rates</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {result?.auditStatus && (
                        <Badge className={`text-xs no-default-active-elevate ${statusConfig[result.auditStatus]?.cls ?? ""}`}>
                          {result.auditStatus.toUpperCase()}
                        </Badge>
                      )}
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      <div className="space-y-1.5">
                        <Textarea
                          placeholder="Paste invoice text here — copy from email, PDF, or any source…"
                          value={contractInvoiceText}
                          onChange={(e) => setContractInvoiceText(e.target.value)}
                          rows={5}
                          className="text-xs font-mono resize-y"
                          data-testid="textarea-contract-invoice-text"
                        />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">AI will compare against this contract's rates and terms.</p>
                          <Button
                            size="sm"
                            onClick={() => contractInvoiceAuditMutation.mutate()}
                            disabled={!contractInvoiceText.trim() || isPending}
                            data-testid="button-ci-compare-invoice"
                          >
                            {isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Comparing…</> : <><ScanLine className="h-3.5 w-3.5 mr-1.5" />Compare</>}
                          </Button>
                        </div>
                      </div>
                      {result && (
                        <div className="rounded-md border bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {result.invoiceNumber && <span className="text-sm font-medium">Invoice #{result.invoiceNumber}</span>}
                            <Badge className={`text-xs no-default-active-elevate ${statusConfig[result.auditStatus]?.cls ?? ""}`}>{result.auditStatus.toUpperCase()}</Badge>
                          </div>
                          {result.exceptionNotes && <p className="text-xs text-muted-foreground">{result.exceptionNotes}</p>}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div><p className="text-xs text-muted-foreground">Invoiced</p><p className="text-sm font-bold">{result.invoiceTotal ? `$${parseFloat(result.invoiceTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">Expected</p><p className="text-sm font-bold">{result.expectedTotal ? `$${parseFloat(result.expectedTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">Variance</p><p className={`text-sm font-bold ${result.varianceAmount && parseFloat(result.varianceAmount) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{result.varianceAmount ? `${parseFloat(result.varianceAmount) > 0 ? "+" : ""}$${Math.abs(parseFloat(result.varianceAmount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                          </div>
                          {Array.isArray(result.flaggedItems) && result.flaggedItems.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1">Flagged Items</p>
                              <ul className="space-y-1">
                                {result.flaggedItems.map((f: any, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-xs">
                                    <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${f.severity === "exception" ? "text-red-500" : "text-amber-500"}`} />
                                    {f.description}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Contract Obligations */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Obligations</span>
              {obligations.length > 0 && (
                <Badge variant="secondary" className="text-xs">{obligations.length}</Badge>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={openAddObligation} data-testid="button-add-obligation">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          {/* AI Suggestions Panel */}
          {suggestions.length > 0 && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/30">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold">AI Suggestions</span>
                  <Badge variant="secondary" className="text-xs">{suggestions.length}</Badge>
                  {discoverSourceDoc && (
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">from {discoverSourceDoc}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSuggestions([])} data-testid="button-clear-suggestions">
                  <X className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              </div>
              <div className="divide-y">
                {suggestions.map((s, idx) => {
                  const typeIcon = s.obligationType === "insurance" ? <ShieldAlert className="h-3 w-3" />
                    : s.obligationType === "payment" ? <DollarSign className="h-3 w-3" />
                    : s.obligationType === "sla" ? <Clock className="h-3 w-3" />
                    : s.obligationType === "notice" ? <AlertCircle className="h-3 w-3" />
                    : <FileText className="h-3 w-3" />;
                  const isApproving = approvingIndex === idx;
                  return (
                    <div key={idx} className="flex items-start gap-3 px-3 py-2.5" data-testid={`suggestion-row-${idx}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className="text-xs gap-1 capitalize">
                            {typeIcon}
                            {s.obligationType}
                          </Badge>
                          {s.recurrence !== "none" && (
                            <Badge variant="outline" className="text-xs capitalize">{s.recurrence}</Badge>
                          )}
                          {s.dueDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(s.dueDate)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{s.title}</p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => approveSuggestion(idx)}
                              disabled={isApproving || approvingIndex !== null}
                              className="text-green-600 dark:text-green-400"
                              data-testid={`button-approve-suggestion-${idx}`}
                            >
                              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve & activate</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => dismissSuggestion(idx)}
                              disabled={approvingIndex !== null}
                              data-testid={`button-dismiss-suggestion-${idx}`}
                            >
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Dismiss</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {obligationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : obligations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 rounded-md border border-dashed gap-1">
              <ListChecks className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No obligations tracked for this contract</p>
            </div>
          ) : (
            <div className="space-y-2">
              {obligations.map((ob) => {
                const typeIcon = ob.obligationType === "insurance" ? <ShieldAlert className="h-3.5 w-3.5" />
                  : ob.obligationType === "payment" ? <DollarSign className="h-3.5 w-3.5" />
                  : ob.obligationType === "sla" ? <Clock className="h-3.5 w-3.5" />
                  : ob.obligationType === "notice" ? <AlertCircle className="h-3.5 w-3.5" />
                  : <FileText className="h-3.5 w-3.5" />;
                const statusVariant: "default" | "secondary" | "destructive" | "outline" =
                  ob.status === "overdue" || ob.status === "non_compliant" ? "destructive"
                  : ob.status === "compliant" || ob.status === "completed" ? "outline"
                  : ob.status === "waived" || ob.status === "closed" ? "secondary"
                  : "secondary";
                const statusLabel: Record<string, string> = {
                  active: "Active", in_progress: "In Progress", compliant: "Compliant",
                  non_compliant: "Non-Compliant", overdue: "Overdue", waived: "Waived",
                  completed: "Completed", closed: "Closed",
                };
                const isDeletingThis = deleteObligationMutation.isPending && deletingObligationId === ob.id;
                const obAssignedTo = (ob as any).assignedTo as string | null;
                return (
                  <div key={ob.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5" data-testid={`obligation-row-${ob.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <Badge variant="outline" className="text-xs gap-1 capitalize">
                          {typeIcon}
                          {ob.obligationType}
                        </Badge>
                        <Badge variant={statusVariant} className={`text-xs ${ob.status === "compliant" ? "border-green-500 text-green-700 dark:text-green-400" : ob.status === "non_compliant" ? "" : ""}`}>
                          {(ob.status === "compliant" || ob.status === "completed") && <CheckCircle2 className="h-3 w-3 mr-0.5" />}
                          {statusLabel[ob.status] ?? ob.status}
                        </Badge>
                        {ob.recurrence !== "none" && (
                          <Badge variant="outline" className="text-xs capitalize">{ob.recurrence}</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{ob.title}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-0.5">
                        {ob.dueDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Due {formatDate(ob.dueDate)}
                          </p>
                        )}
                        {obAssignedTo && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {obAssignedTo}
                          </p>
                        )}
                      </div>
                      {ob.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ob.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={() => openEditObligation(ob)} data-testid={`button-edit-obligation-${ob.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={() => { setDeletingObligationId(ob.id); deleteObligationMutation.mutate(ob.id); }} disabled={isDeletingThis} data-testid={`button-delete-obligation-${ob.id}`}>
                            {isDeletingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add/Edit Obligation Dialog */}
        <Dialog open={obligationDialogOpen} onOpenChange={(v) => { setObligationDialogOpen(v); if (!v) { setEditingObligation(null); setObligationForm(emptyObligationForm); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingObligation ? "Edit Obligation" : "Add Obligation"}</DialogTitle>
              <DialogDescription>Track a contractual obligation or commitment for this contract.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-type">Type <span className="text-destructive">*</span></Label>
                  <Select value={obligationForm.obligationType} onValueChange={(v) => setObligationForm(f => ({ ...f, obligationType: v }))}>
                    <SelectTrigger id="ob-type" data-testid="select-obligation-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="reporting">Reporting</SelectItem>
                      <SelectItem value="notice">Notice</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="sla">SLA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-status">Status</Label>
                  <Select value={obligationForm.status} onValueChange={(v) => setObligationForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger id="ob-status" data-testid="select-obligation-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-title">Title <span className="text-destructive">*</span></Label>
                <Input id="ob-title" placeholder="e.g. Annual liability insurance certificate" value={obligationForm.title} onChange={(e) => setObligationForm(f => ({ ...f, title: e.target.value }))} data-testid="input-obligation-title" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-description">Description</Label>
                <Textarea id="ob-description" placeholder="Details about this obligation…" value={obligationForm.description} onChange={(e) => setObligationForm(f => ({ ...f, description: e.target.value }))} rows={2} data-testid="textarea-obligation-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-due">Due Date</Label>
                  <Input id="ob-due" type="date" value={obligationForm.dueDate} onChange={(e) => setObligationForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-obligation-due-date" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-recurrence">Recurrence</Label>
                  <Select value={obligationForm.recurrence} onValueChange={(v) => setObligationForm(f => ({ ...f, recurrence: v }))}>
                    <SelectTrigger id="ob-recurrence" data-testid="select-obligation-recurrence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">One-time</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-assigned">Assigned To</Label>
                <Input id="ob-assigned" placeholder="Name or email of responsible party" value={obligationForm.assignedTo} onChange={(e) => setObligationForm(f => ({ ...f, assignedTo: e.target.value }))} data-testid="input-obligation-assigned-to" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-notes">Notes</Label>
                <Textarea id="ob-notes" placeholder="Internal notes…" value={obligationForm.notes} onChange={(e) => setObligationForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="textarea-obligation-notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setObligationDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={submitObligation}
                disabled={!obligationForm.title.trim() || !obligationForm.obligationType || createObligationMutation.isPending || updateObligationMutation.isPending}
                data-testid="button-save-obligation"
              >
                {(createObligationMutation.isPending || updateObligationMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editingObligation ? "Save Changes" : "Add Obligation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Linked Documents */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Contract Documents</span>
            <Badge variant="secondary" className="text-xs">{linkedDocs.length}</Badge>
          </div>

          {linkedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 rounded-md border border-dashed gap-1">
              <FileText className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No documents linked to this contract</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-md border"
                  data-testid={`row-contract-doc-${doc.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-doc-name-${doc.id}`}>
                        {doc.fileName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{doc.documentType}</Badge>
                        {doc.notes && (
                          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{doc.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" asChild data-testid={`button-view-doc-${doc.id}`}>
                          <a href={`/api/vendor-documents/${doc.id}/view`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open in browser</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" onClick={() => downloadDoc(doc.id, doc.fileName)} data-testid={`button-download-doc-${doc.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download file</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {latestFields && (
          <ContractReviewDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            contract={contract}
            extractedFields={latestFields}
            extractionFileName={latestExtraction?.fileName ?? ""}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Contract Review Panel (read-only) ────────────────────────────────────────

const REVIEW_FIELDS: { key: string; label: string; contractKey: keyof VendorContract; isDate: boolean }[] = [
  { key: "contractName",        label: "Contract Name",         contractKey: "contractName",        isDate: false },
  { key: "contractType",        label: "Contract Type",         contractKey: "contractType",        isDate: false },
  { key: "effectiveDate",       label: "Effective Date",        contractKey: "effectiveDate",       isDate: true  },
  { key: "startDate",           label: "Start Date",            contractKey: "startDate",           isDate: true  },
  { key: "endDate",             label: "End Date",              contractKey: "endDate",             isDate: true  },
  { key: "autoRenewalLanguage", label: "Auto-Renewal Language", contractKey: "autoRenewalLanguage", isDate: false },
  { key: "noticePeriod",        label: "Notice Period",         contractKey: "noticeRequirements",  isDate: false },
  { key: "paymentTerms",        label: "Payment Terms",         contractKey: "paymentTerms",        isDate: false },
];

function ContractReviewDialog({
  open, onOpenChange, contract, extractedFields, extractionFileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: VendorContract;
  extractedFields: Record<string, string | null>;
  extractionFileName: string;
}) {
  function fmtDisplay(val: string | null | undefined, isDate: boolean) {
    if (!val) return null;
    if (isDate) {
      const d = new Date(val + "T00:00:00");
      return isNaN(d.getTime()) ? val : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return val;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0" data-testid="dialog-contract-review">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">AI Extraction Results</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            AI-extracted values compared to the current contract data. For review only — no changes are applied to the contract.
          </DialogDescription>
          {extractionFileName && (
            <div className="mt-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Source: <span className="font-medium text-foreground">{extractionFileName}</span></span>
            </div>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-6 py-2 bg-muted/40 border-b shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Value</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Extracted</span>
        </div>

        {/* Scrollable field rows */}
        <div className="overflow-y-auto flex-1 divide-y">
          {REVIEW_FIELDS.map(({ key, label, contractKey, isDate }) => {
            const currentRaw = contract[contractKey] as string | null | undefined;
            const extractedRaw = extractedFields[key];
            const currentDisplay = fmtDisplay(currentRaw, isDate);
            const extractedDisplay = fmtDisplay(extractedRaw, isDate);
            const hasExtracted = !!extractedRaw;

            return (
              <div key={key} className="px-6 py-3 grid grid-cols-[1fr_1fr_1fr] gap-3 items-start" data-testid={`review-row-${key}`}>
                <span className="text-sm font-medium">{label}</span>
                <div className="min-w-0">
                  {currentDisplay
                    ? <span className="text-sm" data-testid={`text-current-${key}`}>{currentDisplay}</span>
                    : <span className="text-sm text-muted-foreground italic">Not set</span>
                  }
                </div>
                <div className="min-w-0">
                  {hasExtracted
                    ? <span className="text-sm font-medium text-primary" data-testid={`text-extracted-${key}`}>{extractedDisplay}</span>
                    : <span className="text-sm text-muted-foreground italic">Not found</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between gap-4 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Read-only — extracted values are not written to the contract record.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-review-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
