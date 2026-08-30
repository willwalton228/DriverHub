import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { DriverWithUser } from "@shared/schema";
import { NETWORK_VALUES, employmentTypeOptions } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useLocation } from "wouter";
import { cleanPhone } from "@/lib/phone";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { PhoneInput } from "@/components/PhoneInput";
import { formatDate } from "@/lib/dateFormat";
import {
  Users,
  Search,
  Loader2,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Edit,
  Eye,
  StickyNote,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Copy,
  X,
} from "lucide-react";

type DriverWithStats = DriverWithUser & { movesToday: number; hoursThisWeek: number };

// ── Module-level driver list state cache ─────────────────────────────────────
// Lives OUTSIDE the React component so it survives unmount/remount cycles.
// Written synchronously the instant the user navigates into a driver detail page,
// making it immune to React re-render timing races that break sessionStorage flags.
// `pendingRestore` is the "came from detail" sentinel — only true when the user
// deliberately navigated to a driver and is coming back via the Back button.
interface _DriverListState {
  searchTerm: string;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  statusFilter: string[];
  networkFilter: string[];
  driverTypeFilter: string;
  lastAccessFilter: string;
  includeArchived: boolean;
  currentPage: number;
  pendingRestore: boolean;
}

const DRIVER_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Driver Types" },
  { value: "DriverDash", label: "DriverDash" },
  { value: "DriverShift", label: "DriverShift" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "__unassigned__", label: "Unassigned" },
] as const;
let _driverListCache: _DriverListState | null = null;

function _saveDriverListState(state: Omit<_DriverListState, "pendingRestore">) {
  _driverListCache = { ...state, pendingRestore: true };
}

const addDriverSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phoneNumber: z.string().optional(),
  driverClassification: z.string().optional(),
  driverType: z.string().optional(),
  employmentType: z.string().optional(),
  network: z.string().optional(),
  hireDate: z.string().optional(),
});

type AddDriverForm = z.infer<typeof addDriverSchema>;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface DriverNote {
  id: string;
  noteText: string;
  isImportant: boolean;
  createdAt: string;
  corporateUserId: string;
  author?: { firstName: string | null; lastName: string | null; email: string | null };
}

export default function Drivers() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // ── Restore list state from the module-level cache (set by navigateToDriver) ──
  // Using the cache instead of a sessionStorage flag avoids React re-render timing
  // races where the flag could be cleared before the component re-reads it.
  // `pendingRestore` is true ONLY when the user navigated into a driver detail page;
  // fresh sidebar navigations get clean defaults because navigateToDriver was never called.
  const _restore = _driverListCache?.pendingRestore === true;
  const [searchTerm, setSearchTerm] = useState<string>(() => _restore ? (_driverListCache!.searchTerm) : "");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [currentPage, setCurrentPage] = useState<number>(() => _restore ? (_driverListCache!.currentPage) : 1);
  const [pageSize, setPageSize] = useState<number>(() => _restore ? (_driverListCache!.pageSize) : 25);
  const [sortBy, setSortBy] = useState<string>(() => _restore ? (_driverListCache!.sortBy) : "hireDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => _restore ? (_driverListCache!.sortDir) : "desc");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => _restore ? (_driverListCache!.statusFilter) : ["Active"]);
  const [networkFilter, setNetworkFilter] = useState<string[]>(() => _restore ? (_driverListCache!.networkFilter) : []);
  const [driverTypeFilter, setDriverTypeFilter] = useState<string>(() => _restore ? (_driverListCache!.driverTypeFilter) : "all");
  const [lastAccessFilter, setLastAccessFilter] = useState<string>(() => _restore ? (_driverListCache!.lastAccessFilter) : "all");
  const [includeArchived, setIncludeArchived] = useState<boolean>(() => _restore ? (_driverListCache!.includeArchived) : false);

  const handleStatusFilterChange = (values: string[]) => setStatusFilter(values);

  // After restoring state on mount, clear the `pendingRestore` flag so that a
  // subsequent sidebar navigation to this page gets fresh defaults (not stale state).
  useEffect(() => {
    if (_driverListCache) {
      _driverListCache = { ..._driverListCache, pendingRestore: false };
    }
  }, []);

  // Write the current list state to the module-level cache immediately before
  // navigating to a driver detail page.  Done synchronously so there is no window
  // where React re-renders could read a stale value.
  const navigateToDriver = useCallback((id: string) => {
    _saveDriverListState({
      searchTerm,
      pageSize,
      sortBy,
      sortDir,
      statusFilter,
      networkFilter,
      driverTypeFilter,
      lastAccessFilter,
      includeArchived,
      currentPage,
    });
    navigate(`/drivers/${id}`);
  }, [searchTerm, pageSize, sortBy, sortDir, statusFilter, networkFilter, driverTypeFilter, lastAccessFilter, includeArchived, currentPage, navigate]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [notesDriverId, setNotesDriverId] = useState<string | null>(null);
  const [notesDriverName, setNotesDriverName] = useState("");
  const [newNoteText, setNewNoteText] = useState("");

  const form = useForm<AddDriverForm>({
    resolver: zodResolver(addDriverSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      driverClassification: "",
      driverType: "",
      employmentType: "",
      network: "",
      hireDate: "",
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, networkFilter, driverTypeFilter, lastAccessFilter, includeArchived, pageSize]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) {
      // Search mode: ignore all filters so terminated/inactive drivers are still findable
      params.set("search", debouncedSearch);
    } else {
      // Normal mode: apply all active filters
      if (statusFilter.length > 0) params.set("statuses", statusFilter.join(","));
      if (networkFilter.length > 0) params.set("networks", networkFilter.join(","));
      if (driverTypeFilter !== "all") params.set("driverTypes", driverTypeFilter);
      if (lastAccessFilter !== "all") params.set("lastAccessDays", lastAccessFilter);
      if (includeArchived) params.set("includeArchived", "true");
    }
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("limit", pageSize.toString());
    params.set("offset", ((currentPage - 1) * pageSize).toString());
    return params;
  }, [debouncedSearch, statusFilter, networkFilter, driverTypeFilter, lastAccessFilter, includeArchived, sortBy, sortDir, pageSize, currentPage]);

  const { data, isLoading } = useQuery<{ rows: DriverWithStats[]; total: number }>({
    queryKey: ["/api/corporate/drivers", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/drivers?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const drivers = data?.rows ?? [];
  const totalDrivers = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalDrivers / pageSize));

  const { data: allDriversForNetworks } = useQuery<{ rows: DriverWithStats[]; total: number }>({
    queryKey: ["/api/corporate/drivers", "networks-list"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/drivers?limit=5000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const uniqueNetworks = useMemo(() => {
    // key = lowercase for dedup, value = canonical display string
    const seen = new Map<string, string>();
    // Seed with the canonical uppercase values first so they take precedence
    for (const n of NETWORK_VALUES as unknown as string[]) {
      seen.set(n.toLowerCase(), n);
    }
    // Add any network values from driver records that aren't already represented
    for (const d of allDriversForNetworks?.rows ?? []) {
      if (d.network) {
        const lower = d.network.toLowerCase();
        if (!seen.has(lower)) {
          seen.set(lower, d.network);
        }
      }
    }
    return Array.from(seen.values()).sort();
  }, [allDriversForNetworks]);

  const uniqueStatuses = ["active", "inactive", "suspended", "terminated"];

  const { data: notes = [], isLoading: notesLoading, refetch: refetchNotes } = useQuery<DriverNote[]>({
    queryKey: ["/api/corporate/drivers", notesDriverId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/drivers/${notesDriverId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!notesDriverId && notesSheetOpen,
  });

  const createDriverMutation = useMutation({
    mutationFn: async (data: AddDriverForm) => {
      const res = await apiRequest("POST", "/api/corporate/drivers", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create driver");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/corporate/drivers");
        },
      });
      toast({ title: "Driver created successfully" });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create driver", description: error.message, variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ driverId, noteText }: { driverId: string; noteText: string }) => {
      const res = await apiRequest("POST", `/api/corporate/drivers/${driverId}/notes`, { noteText });
      if (!res.ok) throw new Error("Failed to add note");
      return res.json();
    },
    onSuccess: () => {
      refetchNotes();
      setNewNoteText("");
      toast({ title: "Note added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, driverIds }: { action: string; driverIds: string[] }) => {
      const res = await apiRequest("POST", "/api/corporate/drivers/bulk-action", { action, driverIds });
      if (!res.ok) throw new Error("Bulk action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/corporate/drivers");
        },
      });
      setSelectedIds(new Set());
      toast({ title: "Bulk action completed" });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk action failed", description: error.message, variant: "destructive" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ driverIds, mode = "visible" }: { driverIds?: string[]; mode?: "visible" | "full" }) => {
      const body: any = { mode };
      if (driverIds) body.driverIds = driverIds;
      if (debouncedSearch) body.search = debouncedSearch;
      if (statusFilter.length > 0) body.statuses = statusFilter;
      if (networkFilter.length > 0) body.networks = networkFilter;
      if (driverTypeFilter !== "all") body.driverTypes = driverTypeFilter;
      if (lastAccessFilter !== "all") body.lastAccessDays = lastAccessFilter;
      if (includeArchived) body.includeArchived = true;
      const res = await apiRequest("POST", "/api/corporate/drivers/export", body);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = mode === "full" ? "drivers-full-export.csv" : "drivers-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Export downloaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    },
  });

  const onAddDriver = (data: AddDriverForm) => {
    const payload = { ...data };
    if (payload.phoneNumber) payload.phoneNumber = cleanPhone(payload.phoneNumber);
    createDriverMutation.mutate(payload);
  };

  const toggleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortDir("asc");
      }
    },
    [sortBy],
  );

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const allOnPageSelected = drivers.length > 0 && drivers.every((d) => selectedIds.has(d.id));
  const someOnPageSelected = drivers.some((d) => selectedIds.has(d.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      drivers.forEach((d) => next.delete(d.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      drivers.forEach((d) => next.add(d.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const openNotes = (driver: DriverWithStats) => {
    setNotesDriverId(driver.id);
    setNotesDriverName(`${driver.user.firstName || ""} ${driver.user.lastName || ""}`.trim() || driver.user.email || "Driver");
    setNotesSheetOpen(true);
    setNewNoteText("");
  };

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalDrivers);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-ipad-module="drivers">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">Drivers</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-driver">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Driver
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Driver</DialogTitle>
                  <DialogDescription>
                    Enter the driver's basic information. You can add more details after creating the driver record.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onAddDriver)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>First Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John" {...field} data-testid="input-first-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Last Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Doe" {...field} data-testid="input-last-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john.doe@example.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <PhoneInput
                              {...field}
                              data-testid="input-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="driverClassification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Classification</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-classification">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Employee">Employee</SelectItem>
                                <SelectItem value="Independent Contractor">Independent Contractor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="driverType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Driver Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-driver-type">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="DriverShift">DriverShift</SelectItem>
                                <SelectItem value="DriverDash">DriverDash</SelectItem>
                                <SelectItem value="Hybrid">Hybrid</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employment Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-employment-type">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {employmentTypeOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="network"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Network</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-network">
                                  <SelectValue placeholder="Select network" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {NETWORK_VALUES.map((net) => (
                                  <SelectItem key={net} value={net}>{net}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hireDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hire Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-hire-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createDriverMutation.isPending} data-testid="button-create-driver">
                        {createDriverMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Create Driver"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
{(user as any)?.role === "super_user" || (user as any)?.isRootSuperAdmin ? (
            <Link href="/imports/drivers">
              <Button variant="outline" data-testid="button-import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </Link>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exportMutation.isPending} data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  {exportMutation.isPending ? "Exporting..." : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>All Drivers</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => exportMutation.mutate({ mode: "visible" })}
                  data-testid="menu-item-export-visible"
                >
                  Export Visible Columns
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportMutation.mutate({ mode: "full" })}
                  data-testid="menu-item-export-full"
                >
                  Export Full Dataset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedIds.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="button-bulk-actions">
                    Bulk Actions ({selectedIds.size})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => bulkActionMutation.mutate({ action: "activate", driverIds: Array.from(selectedIds) })}
                    data-testid="menu-item-activate"
                  >
                    Activate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => bulkActionMutation.mutate({ action: "deactivate", driverIds: Array.from(selectedIds) })}
                    data-testid="menu-item-deactivate"
                  >
                    Deactivate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Export Selected</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => exportMutation.mutate({ driverIds: Array.from(selectedIds), mode: "visible" })}
                    data-testid="menu-item-export-selected-visible"
                  >
                    Visible Columns
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => exportMutation.mutate({ driverIds: Array.from(selectedIds), mode: "full" })}
                    data-testid="menu-item-export-selected-full"
                  >
                    Full Dataset
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search name, email, phone, or account..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-10 ${searchTerm ? "pr-8" : ""}`}
              data-testid="input-search-drivers"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-clear-search"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {debouncedSearch && (
            <span className="text-xs text-muted-foreground italic whitespace-nowrap">
              Filters paused — searching all drivers
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
            <MultiSelectFilter
              label="Status"
              options={uniqueStatuses.map((s) => ({
                value: s,
                label: s.charAt(0).toUpperCase() + s.slice(1),
              }))}
              selected={statusFilter}
              onChange={handleStatusFilterChange}
              data-testid="filter-status"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Network:</span>
            <MultiSelectFilter
              label="Network"
              options={[
                { value: "__blank__", label: "[Blank]" },
                ...uniqueNetworks.map((net) => ({ value: net, label: net })),
              ]}
              selected={networkFilter}
              onChange={setNetworkFilter}
              data-testid="filter-network"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Driver Type:</span>
            <Select value={driverTypeFilter} onValueChange={setDriverTypeFilter}>
              <SelectTrigger className="w-44" data-testid="select-driver-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRIVER_TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Last Access:</span>
            <Select value={lastAccessFilter} onValueChange={setLastAccessFilter}>
              <SelectTrigger className="w-36" data-testid="select-last-access-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {((user as any)?.role === "admin" || (user as any)?.role === "super_admin" || (user as any)?.isSuperAdmin || (user as any)?.isRootSuperAdmin) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Archived:</span>
              <Button
                variant="outline"
                size="sm"
                className={`toggle-elevate ${includeArchived ? "toggle-elevated" : ""}`}
                onClick={() => setIncludeArchived((v) => !v)}
                data-testid="button-toggle-archived"
              >
                {includeArchived ? "Hiding" : "Show"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border" data-ipad-table="drivers">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) {
                      (el as unknown as HTMLButtonElement).dataset.state =
                        someOnPageSelected && !allOnPageSelected ? "indeterminate" : allOnPageSelected ? "checked" : "unchecked";
                    }
                  }}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("firstName")} data-testid="header-first-name">
                <span className="inline-flex items-center">First Name <SortIcon column="firstName" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastName")} data-testid="header-last-name">
                <span className="inline-flex items-center">Last Name <SortIcon column="lastName" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("email")} data-testid="header-email">
                <span className="inline-flex items-center">E-mail <SortIcon column="email" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("market")} data-testid="header-network">
                <span className="inline-flex items-center">Network <SortIcon column="market" /></span>
              </TableHead>
              <TableHead data-testid="header-mobile">Mobile</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("hireDate")} data-testid="header-hire-date">
                <span className="inline-flex items-center">Hire Date <SortIcon column="hireDate" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")} data-testid="header-status">
                <span className="inline-flex items-center">Status <SortIcon column="status" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("driverType")} data-testid="header-driver-type">
                <span className="inline-flex items-center">Driver Type <SortIcon column="driverType" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastAccessAt")} data-testid="header-last-access">
                <span className="inline-flex items-center">Last Access <SortIcon column="lastAccessAt" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("basePayPerMile")} data-testid="header-pay-rate">
                <span className="inline-flex items-center">Network Pay Rate <SortIcon column="basePayPerMile" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("driverClassification")} data-testid="header-driver-classification">
                <span className="inline-flex items-center">Classification <SortIcon column="driverClassification" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("drivershiftCustomerName")} data-testid="header-drivershift-customer">
                <span className="inline-flex items-center">Shift Customer <SortIcon column="drivershiftCustomerName" /></span>
              </TableHead>
              <TableHead className="w-12" data-testid="header-actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-12">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No drivers found</p>
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((driver) => (
                <TableRow
                  key={driver.id}
                  className="hover-elevate cursor-pointer"
                  data-testid={`row-driver-${driver.id}`}
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, label, [data-no-row-click="true"]')) return;
                    navigateToDriver(driver.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLElement;
                      if (target.closest('input, button')) return;
                      navigateToDriver(driver.id);
                    }
                  }}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(driver.id)}
                      onCheckedChange={() => toggleSelect(driver.id)}
                      data-testid={`checkbox-driver-${driver.id}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-first-name-${driver.id}`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigateToDriver(driver.id); }}
                      className="font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none text-left"
                      data-testid={`link-driver-${driver.id}`}
                    >
                      {driver.user.firstName || ""}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-last-name-${driver.id}`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigateToDriver(driver.id); }}
                      className="font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none text-left"
                      data-testid={`link-driver-last-${driver.id}`}
                    >
                      {driver.user.lastName || ""}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[220px]" data-testid={`cell-email-${driver.id}`}>
                    <div className="flex items-center gap-1 group/email">
                      <span className="truncate">{driver.user.email || ""}</span>
                      {driver.user.email && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0 invisible group-hover/email:visible"
                              data-no-row-click="true"
                              data-testid={`button-copy-email-${driver.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(driver.user.email!);
                                toast({ title: "Copied", description: driver.user.email });
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy email</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-network-${driver.id}`}>
                    {driver.network || driver.market || ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-mobile-${driver.id}`}>
                    <div className="flex items-center gap-1">
                      <PhoneDisplay
                        phone={driver.phoneNumber}
                        data-testid={`text-phone-${driver.id}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-hire-date-${driver.id}`}>
                    {formatDate((driver as any).hireDate)}
                  </TableCell>
                  <TableCell data-testid={`cell-status-${driver.id}`}>
                    <div className="flex items-center gap-1 flex-wrap">
                      <StatusBadge
                        status={(driver as any).isDeleted ? "archived" : (driver.status || "unknown")}
                        className="text-xs"
                        data-testid={`badge-status-${driver.id}`}
                      />
                      {(driver as any).isDeleted && (
                        <Badge variant="destructive" className="text-xs" data-testid={`badge-archived-${driver.id}`}>
                          Archived
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-driver-type-${driver.id}`}>
                    {driver.driverType?.trim() || "Unassigned"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-last-access-${driver.id}`}>
                    {driver.lastAccessAt ? formatDate(driver.lastAccessAt) : "Never"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-pay-rate-${driver.id}`}>
                    {driver.basePayPerMile ? `$${Number(driver.basePayPerMile).toFixed(2)}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`cell-classification-${driver.id}`}>
                    {driver.driverClassification || ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap min-w-[220px]" data-testid={`cell-shift-customer-${driver.id}`}>
                    {(driver as any).drivershiftCustomerName || ""}
                  </TableCell>
                  <TableCell data-no-row-click="true">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-actions-${driver.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigateToDriver(driver.id)}
                          data-testid={`menu-item-edit-${driver.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigateToDriver(driver.id)}
                          data-testid={`menu-item-view-${driver.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openNotes(driver)}
                          data-testid={`menu-item-notes-${driver.id}`}
                        >
                          <StickyNote className="h-4 w-4 mr-2" />
                          Notes
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Show:</span>
          <Select value={pageSize.toString()} onValueChange={(val) => setPageSize(Number(val))}>
            <SelectTrigger className="w-20" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground" data-testid="text-pagination-info">
          {totalDrivers > 0
            ? `Showing ${startIdx}-${endIdx} of ${totalDrivers} drivers`
            : "No drivers"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <Sheet open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle data-testid="text-notes-title">Internal Notes - {notesDriverName}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-3">
              <Textarea
                placeholder="Add a note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                data-testid="textarea-new-note"
              />
              <Button
                disabled={!newNoteText.trim() || addNoteMutation.isPending}
                onClick={() => {
                  if (notesDriverId && newNoteText.trim()) {
                    addNoteMutation.mutate({ driverId: notesDriverId, noteText: newNoteText.trim() });
                  }
                }}
                data-testid="button-add-note"
              >
                {addNoteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Internal Note"
                )}
              </Button>
            </div>
            <div className="border-t pt-4 space-y-3">
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="rounded-md border p-3 space-y-1" data-testid={`note-${note.id}`}>
                    <p className="text-sm">{note.noteText}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {note.author
                          ? `${note.author.firstName || ""} ${note.author.lastName || ""}`.trim() || note.author.email
                          : "Unknown"}
                      </span>
                      <span>{formatDate(note.createdAt)}</span>
                      {note.isImportant && <Badge variant="secondary" className="text-[10px]">Important</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
