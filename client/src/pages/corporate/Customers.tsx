import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Search, X, TrendingUp, TrendingDown, Minus, Settings, Filter, RotateCcw, Eye, Trash2, Pencil, ChevronDown, ChevronUp, ArrowUpDown, Bookmark, Star, AlertTriangle, Bell, FileUp, Library, Download, DollarSign, Save } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Customer, User } from "@shared/schema";
import { HubSpotIntegration } from "@/components/HubSpotIntegration";
import { AccountMetricsDashboard, type MetricFilter } from "@/components/AccountMetricsDashboard";
import { format, formatDistanceToNow, isPast, isWithinInterval, addDays, isToday, isBefore, startOfDay } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DRIVER_MODEL_OPTIONS, PROGRAM_OPTIONS, REGION_OPTIONS, CUSTOMER_STATUS_VALUES } from "@shared/schema";

type HealthFilter = "all" | "green" | "yellow" | "red" | "red,yellow";
type StatusFilter = "all" | typeof CUSTOMER_STATUS_VALUES[number];

interface SavedAccountView {
  id: string;
  userId: string;
  name: string;
  isSystemDefault: boolean;
  filterStatus: string | null;
  filterHealth: string | null;
  filterOwner: string | null;
  filterAccountType: string | null;
  filterParentAccount: string | null;
  filterNeedsContact: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface ViewPreference {
  lastSelectedViewId: string | null;
}

export default function Customers() {
  const { isAuthenticated, isAdmin, isSuperAdmin, user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Parse URL params once for initial state — all filter state is URL-backed so
  // the browser back button restores the exact filtered working set.
  const _initParams = new URLSearchParams(searchString);
  // True when the user arrived with pre-existing URL params (e.g., Back from Account Detail).
  // Used to suppress the saved-view auto-apply that runs on fresh navigation.
  const _hasInitialUrlFilters = useRef(
    ["q","status","health","owner","accountType","driverModel","program",
     "network","region","parentAccount","needsContact","sortField","view"]
      .some(k => _initParams.has(k))
  ).current;

  const [searchTerm, setSearchTerm] = useState(_initParams.get("q") ?? "");
  // Default sort: Account Name A→Z. Overridden by an explicit URL param (back-nav restores user's sort).
  const [sortField, setSortField] = useState<string | null>(_initParams.get("sortField") ?? "customerName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">((_initParams.get("sortDir") as "asc" | "desc") ?? "asc");
  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") { setSortDir("desc"); }
      // Third click on any column resets to the A→Z default.
      else { setSortField("customerName"); setSortDir("asc"); }
    } else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50 inline" />;
    return sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-1 inline" /> : <ChevronDown className="h-3.5 w-3.5 ml-1 inline" />;
  };
  const [activeFilter, setActiveFilter] = useState<MetricFilter>("all");
  const [filterIds, setFilterIds] = useState<string[]>([]);

  // All filter/sort/view state is initialized from URL params so that navigating
  // to an Account Detail and using the Back button restores the exact working set.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (_initParams.get("status") as StatusFilter) ?? "Active"
  );
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(
    (_initParams.get("health") as HealthFilter) ?? "all"
  );
  const [ownerFilter, setOwnerFilter] = useState<string>(_initParams.get("owner") ?? "all");
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>(_initParams.get("accountType") ?? "all");
  const [driverModelFilter, setDriverModelFilter] = useState<string>(_initParams.get("driverModel") ?? "all");
  const [programFilter, setProgramFilter] = useState<string>(_initParams.get("program") ?? "all");
  const [networkFilter, setNetworkFilter] = useState<string>(_initParams.get("network") ?? "all");
  const [regionFilter, setRegionFilter] = useState<string>(_initParams.get("region") ?? "all");
  const [parentAccountFilter, setParentAccountFilter] = useState<string>(_initParams.get("parentAccount") ?? "all");
  const [needsContactFilter, setNeedsContactFilter] = useState<boolean>(_initParams.get("needsContact") === "1");

  const [selectedViewId, setSelectedViewId] = useState<string | null>(_initParams.get("view") ?? null);

  // Keep the URL in sync with filter state via replaceState (no new history entry).
  // When the user clicks into an Account and later presses Back, the browser
  // restores this URL and all filters re-initialize from params above.
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm)                       p.set("q",             searchTerm);
    if (statusFilter !== "Active")        p.set("status",        statusFilter);
    if (healthFilter !== "all")           p.set("health",        healthFilter);
    if (ownerFilter !== "all")            p.set("owner",         ownerFilter);
    if (accountTypeFilter !== "all")      p.set("accountType",   accountTypeFilter);
    if (driverModelFilter !== "all")      p.set("driverModel",   driverModelFilter);
    if (programFilter !== "all")          p.set("program",       programFilter);
    if (networkFilter !== "all")          p.set("network",       networkFilter);
    if (regionFilter !== "all")           p.set("region",        regionFilter);
    if (parentAccountFilter !== "all")    p.set("parentAccount", parentAccountFilter);
    if (needsContactFilter)               p.set("needsContact",  "1");
    // Only encode sort in the URL when it differs from the A→Z default so the URL
    // stays clean on fresh navigation. Back-nav detection (_hasInitialUrlFilters)
    // depends on this: a non-default sort will always produce a sortField param.
    if (sortField && !(sortField === "customerName" && sortDir === "asc")) p.set("sortField", sortField);
    if (sortDir !== "asc" && sortField !== "customerName") p.set("sortDir", sortDir);
    if (selectedViewId)                   p.set("view",          selectedViewId);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/customers?${qs}` : "/customers");
  }, [searchTerm, statusFilter, healthFilter, ownerFilter, accountTypeFilter,
      driverModelFilter, programFilter, networkFilter, regionFilter,
      parentAccountFilter, needsContactFilter, sortField, sortDir, selectedViewId]);

  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [editingView, setEditingView] = useState<SavedAccountView | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Declare the customers query BEFORE the auto-focus effect so that `isLoading`
  // is initialized by the time the effect's dependency array is evaluated.
  // (Moving this below the useEffect caused a TDZ crash in the production bundle.)
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
    enabled: isAuthenticated,
  });

  // Auto-focus the search input on fresh navigation (not on back-nav which has URL params).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (_hasInitialUrlFilters) return;   // back-nav: preserve existing state, don't steal focus
    if (isLoading) return;               // wait until the list is rendered
    // Brief timeout lets any higher-priority focus events (dialogs, tooltips) settle first.
    const t = setTimeout(() => { searchRef.current?.focus(); }, 50);
    return () => clearTimeout(t);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/corporate/users"],
    enabled: isAuthenticated,
  });

  const { data: savedViews = [], isLoading: viewsLoading } = useQuery<SavedAccountView[]>({
    queryKey: ["/api/corporate/account-views"],
    enabled: isAuthenticated,
  });

  const { data: viewPreference } = useQuery<ViewPreference>({
    queryKey: ["/api/corporate/account-views/preference"],
    enabled: isAuthenticated,
  });

  const savePreferenceMutation = useMutation({
    mutationFn: async (viewId: string | null) => {
      return apiRequest("POST", "/api/corporate/account-views/preference", { viewId });
    },
  });

  const createViewMutation = useMutation({
    mutationFn: async (view: Partial<SavedAccountView>) => {
      return apiRequest("POST", "/api/corporate/account-views", view);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/account-views"] });
      toast({ title: "View created", description: "Your custom view has been saved." });
      setIsCreateViewOpen(false);
      setNewViewName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create view.", variant: "destructive" });
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SavedAccountView> }) => {
      return apiRequest("PATCH", `/api/corporate/account-views/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/account-views"] });
      toast({ title: "View updated", description: "Your custom view has been updated." });
      setEditingView(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update view.", variant: "destructive" });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/corporate/account-views/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/account-views"] });
      toast({ title: "View deleted", description: "Your custom view has been deleted." });
      if (selectedViewId === editingView?.id) {
        setSelectedViewId(null);
        clearAllFilters();
      }
      setEditingView(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete view.", variant: "destructive" });
    },
  });

  useEffect(() => {
    // Skip auto-apply when the user arrived via Back (URL already carries their state).
    if (_hasInitialUrlFilters) return;
    if (viewPreference?.lastSelectedViewId && savedViews.length > 0 && !selectedViewId) {
      const view = savedViews.find(v => v.id === viewPreference.lastSelectedViewId);
      if (view) {
        applyView(view);
      }
    }
  }, [viewPreference, savedViews]);

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  const uniqueStatuses = CUSTOMER_STATUS_VALUES;

  const uniqueAccountTypes = useMemo(() => {
    const types = new Set<string>();
    customers.forEach(c => {
      if (c.customerType) types.add(c.customerType);
    });
    return Array.from(types).sort();
  }, [customers]);

  const uniqueNetworkValues = useMemo(() => {
    const nets = new Set<string>();
    customers.forEach(c => {
      if ((c as any).network) nets.add((c as any).network);
    });
    return Array.from(nets).sort();
  }, [customers]);

  const parentAccounts = useMemo(() => {
    const parents = customers.filter(c => 
      customers.some(child => child.parentAccountId === c.id)
    );
    return parents.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
  }, [customers]);

  const accountOwners = useMemo(() => {
    const ownerIds = new Set<string>();
    customers.forEach(c => {
      if (c.accountOwnerId) ownerIds.add(c.accountOwnerId);
    });
    return users.filter(u => ownerIds.has(u.id)).sort((a, b) => {
      const nameA = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email || '';
      const nameB = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.email || '';
      return nameA.localeCompare(nameB);
    });
  }, [customers, users]);

  const applyView = (view: SavedAccountView) => {
    setSelectedViewId(view.id);
    savePreferenceMutation.mutate(view.id);
    
    setStatusFilter((view.filterStatus as StatusFilter) || "Active");
    
    if (view.filterHealth) {
      try {
        const healthArr = JSON.parse(view.filterHealth);
        if (Array.isArray(healthArr) && healthArr.length > 0) {
          if (healthArr.includes("red") && healthArr.includes("yellow") && healthArr.length === 2) {
            setHealthFilter("red,yellow");
          } else {
            setHealthFilter(healthArr[0] as HealthFilter);
          }
        } else {
          setHealthFilter("all");
        }
      } catch {
        setHealthFilter("all");
      }
    } else {
      setHealthFilter("all");
    }
    
    setOwnerFilter(view.filterOwner || "all");
    setAccountTypeFilter(view.filterAccountType || "all");
    setParentAccountFilter(view.filterParentAccount || "all");
    setNeedsContactFilter(view.filterNeedsContact || false);
    
    setActiveFilter("all");
    setFilterIds([]);
    setSearchTerm("");
  };

  const handleFilterChange = (filter: MetricFilter, ids: string[]) => {
    setActiveFilter(filter);
    setFilterIds(ids);
    setSearchTerm("");
    setSelectedViewId(null);
  };

  const clearFilter = () => {
    setActiveFilter("all");
    setFilterIds([]);
  };

  const clearAllFilters = () => {
    setActiveFilter("all");
    setFilterIds([]);
    setSearchTerm("");
    setStatusFilter("Active");
    setHealthFilter("all");
    setOwnerFilter("all");
    setDriverModelFilter("all");
    setProgramFilter("all");
    setNetworkFilter("all");
    setRegionFilter("all");
    setParentAccountFilter("all");
    setNeedsContactFilter(false);
    setSelectedViewId(null);
    // Restore the A→Z default sort when the user resets all filters.
    setSortField("customerName");
    setSortDir("asc");
    savePreferenceMutation.mutate(null);
  };

  const hasActiveFilters = statusFilter !== "Active" || healthFilter !== "all" || 
    ownerFilter !== "all" || driverModelFilter !== "all" ||
    programFilter !== "all" || networkFilter !== "all" || regionFilter !== "all" || parentAccountFilter !== "all" || activeFilter !== "all" ||
    searchTerm !== "" || needsContactFilter;

  const getParentAccountName = (parentId: string | null | undefined) => {
    if (!parentId) return null;
    const parent = customerMap.get(parentId);
    return parent?.customerName || null;
  };

  const getAccountOwnerName = (ownerId: string | null | undefined) => {
    if (!ownerId) return null;
    const owner = userMap.get(ownerId);
    if (!owner) return null;
    return [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email || null;
  };

  const runExport = async (
    exportRows: Customer[],
    exportType: string,
    sheetName: string,
    filePrefix: string,
    emptyMessage: string,
  ) => {
    if (exportRows.length === 0) {
      toast({
        title: `No accounts to export`,
        description: emptyMessage,
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const formatDate = (val: string | null | undefined): Date | string => {
        if (!val) return "";
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : d;
      };

      const formatPhone = (val: string | null | undefined): string => {
        if (!val) return "";
        const digits = val.replace(/\D/g, "");
        if (digits.length === 10) {
          return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        }
        if (digits.length === 11 && digits[0] === "1") {
          return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
        }
        return val;
      };

      const rows = exportRows.map(c => ({
        "Account Number": c.customerNumber ?? "",
        "Dealer ID": (c as any).dealerId ?? "",
        "Account Name": c.customerName ?? "",
        "Parent Account": getParentAccountName(c.parentAccountId) ?? "",
        "Industry": (c as any).industry ?? c.customerType ?? "",
        "Segment": (c as any).segment ?? (c as any).program ?? "",
        "Status": c.status ?? "",
        "Primary Contact Name": c.primaryContactName ?? "",
        "Primary Contact Email": c.primaryContactEmail ?? "",
        "Primary Contact Phone": formatPhone(c.primaryContactNumber ?? (c as any).primaryContactCell),
        "City": c.customerCity ?? "",
        "State": c.customerState ?? "",
        "Go Live Date": formatDate(c.implementationDate as any),
        "Network": (c as any).network ?? "",
        "Health Status": c.health ?? "",
        "Created Date": formatDate((c as any).createdAt),
        "Last Updated Date": formatDate((c as any).updatedAt),
      }));

      const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });

      const headerRow = ["Account Number","Dealer ID","Account Name","Parent Account","Industry","Segment","Status",
        "Primary Contact Name","Primary Contact Email","Primary Contact Phone","City","State",
        "Go Live Date","Network","Health Status","Created Date","Last Updated Date"];
      const colWidths = headerRow.map(h => {
        const maxLen = Math.max(
          h.length,
          ...rows.map(r => String((r as any)[h] ?? "").length)
        );
        return { wch: Math.min(maxLen + 2, 60) };
      });
      ws["!cols"] = colWidths;

      const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = { font: { bold: true } };
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      XLSX.writeFile(wb, `${filePrefix}_${dateStr}.xlsx`);

      toast({
        title: "Export complete",
        description: `${exportRows.length} account${exportRows.length !== 1 ? "s" : ""} exported.`,
      });

      apiRequest("POST", "/api/corporate/customers/export-log", {
        recordCount: exportRows.length,
        exportType,
        filters: { statusFilter, healthFilter, ownerFilter, accountTypeFilter, searchTerm },
      }).catch(err => console.warn("[export audit] log failed:", err));
    } catch (err) {
      console.error("Export error:", err);
      toast({ title: "Export failed", description: "An error occurred during export.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  // Server-side export: queries dealer_id DIRECTLY from the database.
  // This ensures the Dealer ID column always reflects the actual dealer_id field,
  // not any cached or transformed frontend state.
  const handleServerExport = async (exportType: "active" | "all") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/corporate/customers/export?exportType=${exportType}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).message || "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Accounts_${exportType === "active" ? "Active" : "All"}_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const count = exportType === "active"
        ? customers.filter(c => c.status === "Active").length
        : customers.length;
      toast({
        title: "Export complete",
        description: `${count} account${count !== 1 ? "s" : ""} exported.`,
      });
      apiRequest("POST", "/api/corporate/customers/export-log", {
        recordCount: count,
        exportType: exportType === "active" ? "active_accounts" : "all_accounts",
        filters: { statusFilter, healthFilter, ownerFilter, accountTypeFilter, searchTerm },
      }).catch(err => console.warn("[export audit] log failed:", err));
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export failed", description: err.message || "An error occurred during export.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportActive = () => handleServerExport("active");
  const handleExportAll    = () => handleServerExport("all");

  const handleExportCurrentView = () =>
    runExport(
      filteredAndSortedCustomers,
      "current_view",
      "Current View",
      "Accounts_CurrentView",
      "No accounts match the current view filters.",
    );

  const filteredAndSortedCustomers = useMemo(() => {
    const today = startOfDay(new Date());
    
    let result = customers.filter((customer) => {
      if (activeFilter !== "all") {
        if (!filterIds.includes(customer.id)) return false;
      }
      
      if (statusFilter === "all") {
        if (customer.status === "Inactive" || customer.status === "Cancelled") return false;
      } else if (customer.status !== statusFilter) {
        return false;
      }
      
      if (healthFilter !== "all") {
        if (healthFilter === "red,yellow") {
          if (customer.health !== "red" && customer.health !== "yellow") return false;
        } else if (customer.health !== healthFilter) {
          return false;
        }
      }
      
      if (ownerFilter !== "all" && customer.accountOwnerId !== ownerFilter) return false;
      if (driverModelFilter !== "all" && (customer as any).driverModel !== driverModelFilter) return false;
      if (programFilter !== "all" && (customer as any).program !== programFilter) return false;
      if (networkFilter !== "all" && (customer as any).network !== networkFilter) return false;
      if (regionFilter !== "all" && (customer as any).region !== regionFilter) return false;
      if (parentAccountFilter !== "all" && customer.parentAccountId !== parentAccountFilter) return false;
      
      if (needsContactFilter) {
        if (!customer.nextRequiredTouchDate) return false;
        const touchDate = startOfDay(new Date(customer.nextRequiredTouchDate));
        if (!isBefore(touchDate, today) && !isToday(new Date(customer.nextRequiredTouchDate))) return false;
      }
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const customerName = (customer.customerName || "").toLowerCase();
        const customerNumber = (customer.customerNumber || "").toLowerCase();
        const parentName = (getParentAccountName(customer.parentAccountId) || "").toLowerCase();

        if (!customerName.includes(search) && 
            !customerNumber.includes(search) && 
            !parentName.includes(search)) {
          return false;
        }
      }
      
      return true;
    });

    if (sortField) {
      result.sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortField === "dealerId") return dir * ((a as any).dealerId || "").localeCompare((b as any).dealerId || "");
        if (sortField === "customerName") return dir * (a.customerName || "").localeCompare(b.customerName || "");
        if (sortField === "customerType") return dir * (a.customerType || "").localeCompare(b.customerType || "");
        if (sortField === "status") return dir * (a.status || "").localeCompare(b.status || "");
        if (sortField === "health") {
          const hp: Record<string,number> = {red:0,yellow:1,green:2};
          return dir * ((hp[a.health||''] ?? 3) - (hp[b.health||''] ?? 3));
        }
        if (sortField === "network") {
          return dir * ((a as any).network || "").localeCompare((b as any).network || "");
        }
        if (sortField === "nextRequiredTouchDate") {
          const da = a.nextRequiredTouchDate ? new Date(a.nextRequiredTouchDate).getTime() : Number.MAX_SAFE_INTEGER;
          const db2 = b.nextRequiredTouchDate ? new Date(b.nextRequiredTouchDate).getTime() : Number.MAX_SAFE_INTEGER;
          return da - db2;
        }
        return 0;
      });
    } else {
      result.sort((a, b) => {
        const getFlagPriority = (c: Customer) => {
          if (c.requiresExecAttention) return 0;
          if (c.isStrategicAccount) return 1;
          if (c.isHighSensitivity) return 2;
          if (c.isCarrierVisible) return 3;
          return 4;
        };
        const flagDiff = getFlagPriority(a) - getFlagPriority(b);
        if (flagDiff !== 0) return flagDiff;
        const hp: Record<string,number> = {red:0,yellow:1,green:2};
        const healthDiff = (hp[a.health||''] ?? 3) - (hp[b.health||''] ?? 3);
        if (healthDiff !== 0) return healthDiff;
        const da = a.nextRequiredTouchDate ? new Date(a.nextRequiredTouchDate).getTime() : Number.MAX_SAFE_INTEGER;
        const db2 = b.nextRequiredTouchDate ? new Date(b.nextRequiredTouchDate).getTime() : Number.MAX_SAFE_INTEGER;
        return da - db2;
      });
    }

    return result;
  }, [customers, activeFilter, filterIds, statusFilter, healthFilter, ownerFilter, driverModelFilter, programFilter, networkFilter, regionFilter, parentAccountFilter, needsContactFilter, searchTerm, customerMap, sortField, sortDir]);

  const getFilterLabel = (filter: MetricFilter): string => {
    switch (filter) {
      case "active": return "Active Accounts";
      case "at-risk": return "At-Risk Accounts";
      case "past-due": return "Past Due (AR)";
      case "no-activity": return "No Activity (30d)";
      case "contracts-expiring": return "Expiring Contracts (90d)";
      default: return "";
    }
  };

  const getHealthColor = (health: string | null | undefined) => {
    switch (health) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      default: return '';
    }
  };

  const getHealthTrendIcon = (trend: string | null | undefined) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'stable': return <Minus className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };


  const formatLastActivity = (date: string | null | undefined, lastInvoiceDate: string | null | undefined) => {
    const activityDate = date || lastInvoiceDate;
    if (!activityDate) return <span className="text-muted-foreground">-</span>;
    
    const dateObj = new Date(activityDate);
    const daysAgo = Math.floor((Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysAgo > 30) {
      return <span className="text-red-500 font-medium">{formatDistanceToNow(dateObj, { addSuffix: true })}</span>;
    } else if (daysAgo > 14) {
      return <span className="text-yellow-600">{formatDistanceToNow(dateObj, { addSuffix: true })}</span>;
    }
    return <span>{formatDistanceToNow(dateObj, { addSuffix: true })}</span>;
  };

  const formatNextTouch = (date: string | null | undefined) => {
    if (!date) return <span className="text-muted-foreground">-</span>;
    
    const dateObj = new Date(date);
    const today = new Date();
    
    if (isPast(dateObj) && dateObj.toDateString() !== today.toDateString()) {
      return <span className="text-red-500 font-medium">Overdue: {format(dateObj, 'MMM d')}</span>;
    } else if (isWithinInterval(dateObj, { start: today, end: addDays(today, 7) })) {
      return <span className="text-yellow-600">{format(dateObj, 'MMM d')}</span>;
    }
    return <span>{format(dateObj, 'MMM d, yyyy')}</span>;
  };

  const handleRowClick = (customerId: string) => {
    setLocation(`/customers/${customerId}`);
  };

  const handleCreateView = () => {
    if (!newViewName.trim()) return;
    
    const filterPayload: Partial<SavedAccountView> = {
      name: newViewName.trim(),
      filterStatus: statusFilter !== "all" ? statusFilter : null,
      filterHealth: healthFilter !== "all" 
        ? JSON.stringify(healthFilter === "red,yellow" ? ["red", "yellow"] : [healthFilter]) 
        : null,
      filterOwner: ownerFilter !== "all" ? ownerFilter : null,
      filterAccountType: accountTypeFilter !== "all" ? accountTypeFilter : null,
      filterParentAccount: parentAccountFilter !== "all" ? parentAccountFilter : null,
      filterNeedsContact: needsContactFilter || null,
    };
    
    createViewMutation.mutate(filterPayload);
  };

  const handleUpdateView = () => {
    if (!editingView || !editingView.name.trim()) return;
    
    updateViewMutation.mutate({
      id: editingView.id,
      updates: {
        name: editingView.name,
        filterStatus: statusFilter !== "all" ? statusFilter : null,
        filterHealth: healthFilter !== "all" 
          ? JSON.stringify(healthFilter === "red,yellow" ? ["red", "yellow"] : [healthFilter]) 
          : null,
        filterOwner: ownerFilter !== "all" ? ownerFilter : null,
        filterAccountType: accountTypeFilter !== "all" ? accountTypeFilter : null,
        filterParentAccount: parentAccountFilter !== "all" ? parentAccountFilter : null,
        filterNeedsContact: needsContactFilter || null,
      },
    });
  };

  const selectedView = savedViews.find(v => v.id === selectedViewId);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-ipad-module="accounts">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">Manage account information and details</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/standard-documents">
            <Button variant="outline" data-testid="button-document-library">
              <Library className="mr-2 h-4 w-4" />
              Document Library
            </Button>
          </Link>
          {isAdmin && (
            <Link href="/accounts/billing-rates">
              <Button variant="outline" data-testid="button-billing-rates">
                <DollarSign className="mr-2 h-4 w-4" />
                Billing Rates
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/customers/setup">
              <Button variant="outline" data-testid="button-accounts-setup">
                <Settings className="mr-2 h-4 w-4" />
                Setup
              </Button>
            </Link>
          )}
          {isSuperAdmin && (
            <Link href="/imports/accounts">
              <Button variant="outline" data-testid="button-import-accounts">
                <FileUp className="mr-2 h-4 w-4" />
                Import Accounts
              </Button>
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isExporting}
                data-testid="button-export-accounts"
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting..." : "Export"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportActive}
                data-testid="menu-export-active"
              >
                Export Active Accounts
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportCurrentView}
                data-testid="menu-export-current-view"
              >
                Export Current View
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleExportAll}
                data-testid="menu-export-all"
              >
                Export All Accounts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/customers/new">
            <Button data-testid="button-add-account">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </Link>
        </div>
      </div>

      <AccountMetricsDashboard 
        activeFilter={activeFilter} 
        onFilterChange={handleFilterChange} 
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {/* FAR LEFT: Title + count */}
              <div className="shrink-0">
                <CardTitle className="flex items-center gap-2">
                  {activeFilter === "all" ? (selectedView ? selectedView.name : "All Accounts") : getFilterLabel(activeFilter)}
                  {activeFilter !== "all" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={clearFilter}
                      data-testid="button-clear-filter"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  {filteredAndSortedCustomers.length} {filteredAndSortedCustomers.length === 1 ? 'account' : 'accounts'} found
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      Filtered
                    </Badge>
                  )}
                </CardDescription>
              </div>

              {/* CENTER-LEFT: Search bar — grows to fill available space */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Search by name, number, or parent..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-customers"
                />
              </div>

              {/* FAR RIGHT: Saved Views */}
              <div className="ml-auto shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2" data-testid="dropdown-saved-views">
                      <Bookmark className="h-4 w-4" />
                      {selectedView ? selectedView.name : "Saved Views"}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={clearAllFilters} data-testid="view-all-accounts">
                      <Eye className="mr-2 h-4 w-4" />
                      All Accounts
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {savedViews.filter(v => v.isSystemDefault).map(view => (
                      <DropdownMenuItem 
                        key={view.id} 
                        onClick={() => applyView(view)}
                        data-testid={`view-${view.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Bookmark className="mr-2 h-4 w-4" />
                        {view.name}
                        {selectedViewId === view.id && (
                          <Badge variant="secondary" className="ml-auto">Active</Badge>
                        )}
                      </DropdownMenuItem>
                    ))}
                    {savedViews.filter(v => !v.isSystemDefault).length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Custom Views
                        </div>
                        {savedViews.filter(v => !v.isSystemDefault).map(view => (
                          <DropdownMenuItem 
                            key={view.id} 
                            className="flex items-center justify-between"
                            data-testid={`view-custom-${view.id}`}
                          >
                            <div 
                              className="flex items-center flex-1 cursor-pointer"
                              onClick={() => applyView(view)}
                            >
                              <Bookmark className="mr-2 h-4 w-4" />
                              {view.name}
                            </div>
                            <div className="flex items-center gap-1">
                              {selectedViewId === view.id && (
                                <Badge variant="secondary" className="mr-1">Active</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingView(view);
                                }}
                                data-testid={`button-edit-view-${view.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsCreateViewOpen(true)} data-testid="button-create-view">
                      <Plus className="mr-2 h-4 w-4" />
                      Save Current as View
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>Filters:</span>
              </div>
              
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[130px] h-8" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {uniqueStatuses.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={healthFilter} onValueChange={(v) => { setHealthFilter(v as HealthFilter); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-health">
                  <SelectValue placeholder="Health" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  <SelectItem value="red,yellow">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      At Risk + Watch
                    </div>
                  </SelectItem>
                  <SelectItem value="red">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      At Risk
                    </div>
                  </SelectItem>
                  <SelectItem value="yellow">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Watch
                    </div>
                  </SelectItem>
                  <SelectItem value="green">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Healthy
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[150px] h-8" data-testid="filter-owner">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {accountOwners.map(owner => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {[owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={driverModelFilter} onValueChange={(v) => { setDriverModelFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[160px] h-8" data-testid="filter-driver-model">
                  <SelectValue placeholder="Driver Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Driver Models</SelectItem>
                  {DRIVER_MODEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={programFilter} onValueChange={(v) => { setProgramFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[160px] h-8" data-testid="filter-program">
                  <SelectValue placeholder="Program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  {PROGRAM_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={networkFilter} onValueChange={(v) => { setNetworkFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-network-accounts">
                  <SelectValue placeholder="Network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Networks</SelectItem>
                  {uniqueNetworkValues.map(net => (
                    <SelectItem key={net} value={net}>{net}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-region">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {REGION_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={parentAccountFilter} onValueChange={(v) => { setParentAccountFilter(v); setSelectedViewId(null); }}>
                <SelectTrigger className="w-[160px] h-8" data-testid="filter-parent-account">
                  <SelectValue placeholder="Parent Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parents</SelectItem>
                  {parentAccounts.map(parent => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={needsContactFilter ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => { setNeedsContactFilter(!needsContactFilter); setSelectedViewId(null); }}
                data-testid="filter-needs-contact"
              >
                Needs Contact
              </Button>

              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="h-8"
                  data-testid="button-clear-all-filters"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAndSortedCustomers.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No accounts found</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {hasActiveFilters 
                  ? "Try adjusting your search or filters" 
                  : "Get started by adding your first account"}
              </p>
              {!hasActiveFilters && (
                <Link href="/customers/new">
                  <Button className="mt-4" data-testid="button-add-first-account">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Account
                  </Button>
                </Link>
              )}
              {hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearAllFilters} data-testid="button-clear-filters-empty">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto" data-ipad-table="accounts">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("dealerId")} aria-sort={sortField==="dealerId" ? sortDir : undefined} data-testid="th-account-number">Dealer ID <SortIcon field="dealerId" /></TableHead>
                    <TableHead className="min-w-[200px] cursor-pointer select-none" onClick={() => handleSort("customerName")} aria-sort={sortField==="customerName" ? sortDir : undefined} data-testid="th-account-name">Account Name <SortIcon field="customerName" /></TableHead>
                    <TableHead className="min-w-[150px]">Parent Account</TableHead>
                    <TableHead className="min-w-[160px]" data-testid="th-driver-model">Driver Model</TableHead>
                    <TableHead className="min-w-[140px]" data-testid="th-program">Program</TableHead>
                    <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("network")} aria-sort={sortField==="network" ? sortDir : undefined} data-testid="th-network">Network <SortIcon field="network" /></TableHead>
                    <TableHead className="min-w-[110px]" data-testid="th-region">Region</TableHead>
                    <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} aria-sort={sortField==="status" ? sortDir : undefined} data-testid="th-status">Status <SortIcon field="status" /></TableHead>
                    <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("health")} aria-sort={sortField==="health" ? sortDir : undefined} data-testid="th-health">Health <SortIcon field="health" /></TableHead>
                    <TableHead className="min-w-[150px]">Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id} 
                      className="hover-elevate cursor-pointer"
                      onClick={() => handleRowClick(customer.id)}
                      data-testid={`row-account-${customer.id}`}
                    >
                      <TableCell className="font-mono text-sm" data-testid={`text-account-number-${customer.id}`}>
                        {(customer as any).dealerId || '-'}
                      </TableCell>
                      <TableCell data-testid={`text-customer-name-${customer.id}`}>
                        <div className="flex items-center gap-2 font-medium">
                          <span className="truncate max-w-[180px]">{customer.customerName}</span>
                          {/* Strategic & Sensitivity Flag Icons */}
                          {customer.requiresExecAttention && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Bell className="h-4 w-4 text-destructive flex-shrink-0" data-testid={`flag-exec-attention-${customer.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>Executive Attention Required</TooltipContent>
                            </Tooltip>
                          )}
                          {customer.isStrategicAccount && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" data-testid={`flag-strategic-${customer.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>Strategic Account</TooltipContent>
                            </Tooltip>
                          )}
                          {customer.isHighSensitivity && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" data-testid={`flag-sensitivity-${customer.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>High Sensitivity</TooltipContent>
                            </Tooltip>
                          )}
                          {customer.isCarrierVisible && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Eye className="h-4 w-4 text-blue-500 flex-shrink-0" data-testid={`flag-carrier-visible-${customer.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>Carrier Visible</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getParentAccountName(customer.parentAccountId) ? (
                          <span className="text-sm text-muted-foreground">
                            {getParentAccountName(customer.parentAccountId)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-driver-model-${customer.id}`}>
                        {(() => {
                          const dm = (customer as any).driverModel;
                          const opt = DRIVER_MODEL_OPTIONS.find(o => o.value === dm);
                          return opt ? (
                            <Badge variant="secondary" className="font-normal text-xs">
                              {opt.label}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell data-testid={`text-program-${customer.id}`}>
                        {(customer as any).program ? (
                          <Badge variant="outline" className="font-normal text-xs">
                            {(customer as any).program}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-network-${customer.id}`}>
                        {(customer as any).network ? (
                          <Badge variant="outline" className="font-normal text-xs">
                            {(customer as any).network}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-region-${customer.id}`}>
                        {(customer as any).region ? (
                          <Badge variant="outline" className="font-normal text-xs">
                            {(customer as any).region}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={customer.status} />
                      </TableCell>
                      <TableCell>
                        {customer.health ? (
                          <div className="flex items-center gap-2">
                            <span 
                              className={`w-3 h-3 rounded-full ${getHealthColor(customer.health)}`}
                              data-testid={`health-indicator-${customer.id}`}
                            />
                            <span className="text-sm">
                              {customer.health === "green" ? "Healthy" : customer.health === "yellow" ? "Watch" : customer.health === "red" ? "At Risk" : customer.health}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getAccountOwnerName(customer.accountOwnerId) || (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateViewOpen} onOpenChange={setIsCreateViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Save your current filter settings as a reusable view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                placeholder="e.g., My Priority Accounts"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                data-testid="input-view-name"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Current filters:</p>
              <ul className="list-disc list-inside space-y-1">
                {statusFilter !== "all" && <li>Status: {statusFilter}</li>}
                {healthFilter !== "all" && <li>Health: {healthFilter === "red,yellow" ? "At Risk + Watch" : healthFilter === "red" ? "At Risk" : healthFilter === "yellow" ? "Watch" : healthFilter === "green" ? "Healthy" : healthFilter}</li>}
                {ownerFilter !== "all" && <li>Owner: {getAccountOwnerName(ownerFilter)}</li>}
                {networkFilter !== "all" && <li>Network: {networkFilter}</li>}
                {parentAccountFilter !== "all" && <li>Parent: {getParentAccountName(parentAccountFilter)}</li>}
                {needsContactFilter && <li>Needs Contact: Yes</li>}
                {!hasActiveFilters && <li className="text-muted-foreground italic">No filters applied</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateViewOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateView} 
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-save-view"
            >
              <Save className="mr-2 h-4 w-4" />
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingView} onOpenChange={(open) => !open && setEditingView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit View</DialogTitle>
            <DialogDescription>
              Update the view name or delete this custom view.
            </DialogDescription>
          </DialogHeader>
          {editingView && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-view-name">View Name</Label>
                <Input
                  id="edit-view-name"
                  value={editingView.name}
                  onChange={(e) => setEditingView({ ...editingView, name: e.target.value })}
                  data-testid="input-edit-view-name"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Updating will save the current filter settings to this view.
              </p>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              onClick={() => editingView && deleteViewMutation.mutate(editingView.id)}
              disabled={deleteViewMutation.isPending}
              data-testid="button-delete-view"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingView(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateView}
                disabled={!editingView?.name.trim() || updateViewMutation.isPending}
                data-testid="button-update-view"
              >
                Update View
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HubSpotIntegration />
    </div>
  );
}
