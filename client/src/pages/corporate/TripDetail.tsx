import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Truck, Loader2, Check, XCircle, ShieldAlert, AlertOctagon, Clock, User, FileWarning, ExternalLink, Activity, MapPin, Image, MessageSquare, DollarSign, Shield, ShieldCheck, Building2, AlertTriangle, CheckCircle2, RotateCcw, Info, ChevronsUpDown, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { ReportIncidentDialog } from "@/components/ReportIncidentDialog";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDate, parseFormDate } from "@/lib/dateFormat";
import type { Trip, InsertTrip } from "@shared/schema";

// Local interfaces for enriched trip data returned by GET /api/corporate/trips/:id
interface DriverReturn {
  id: string;
  redcapId?: number | null;
  sourceTripId?: string | null;
  tripDate?: string | null;
  status?: string | null;
  minutes?: string | null;
  milesEstimate?: string | null;
  baseCost?: string | null;
  customerBilled?: string | null;
  customerTotal?: string | null;
  driverName?: string | null;
  sourceSystemKey?: string | null;
  roNumber?: string | null;
  vehicleYear?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  dealerName?: string | null;
  batchId?: string | null;
}

interface TripWithRelations extends Trip {
  driverName?: string | null;
  driverType?: string | null;
  driverClassification?: string | null;
  customerName?: string | null;
  customerNumber?: string | null;
  dealerId?: string | null;
  driverReturns?: DriverReturn[];
}
import { ExcelDownloadButton } from "@/components/ExcelDownloadButton";
import type { ExcelColumn } from "@/lib/excelExport";
import { PhotoComplianceCard } from "@/components/PhotoComplianceCard";
import { EvidenceChainViewer } from "@/components/EvidenceChainViewer";
import { insertTripSchema, updateTripSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";

// ── Status color helper ──────────────────────────────────────────────────────
function statusColor(status: string): string {
  const map: Record<string, string> = {
    completed:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scheduled:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    cancelled:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

// ── AccountCombobox ──────────────────────────────────────────────────────────
// Searchable selector following the established DriverHub Popover + Command pattern.
// Fires onSave(accountId) immediately when the user picks a result; the parent
// wires this to autoSaveMutation so the page-level Saving… / Saved indicator works.
interface AccountResult {
  id: string;
  name: string;
  customerNumber?: string | null;
  dealerId?: string | null;
}

function AccountCombobox({
  currentId,
  currentName,
  onSave,
  disabled,
}: {
  currentId?: string | null;
  currentName?: string | null;
  onSave: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { data: results = [] } = useQuery<AccountResult[]>({
    queryKey: ["/api/accounts/search", debouncedTerm],
    queryFn: async () => {
      if (!debouncedTerm.trim()) return [];
      const res = await fetch(`/api/accounts/search?q=${encodeURIComponent(debouncedTerm)}&limit=25`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!debouncedTerm.trim(),
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearchTerm(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="btn-account-combobox"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span>{currentName || (currentId ? currentId.slice(0, 8) : "No account linked")}</span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or dealer ID…"
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {!debouncedTerm.trim() && (
              <CommandEmpty>Type to search accounts.</CommandEmpty>
            )}
            {debouncedTerm.trim() && results.length === 0 && (
              <CommandEmpty>No accounts found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((acct) => (
                  <CommandItem
                    key={acct.id}
                    value={acct.id}
                    onSelect={() => {
                      onSave(acct.id);
                      setOpen(false);
                      setSearchTerm("");
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{acct.name}</span>
                      {(acct.customerNumber || acct.dealerId) && (
                        <span className="text-xs text-muted-foreground">
                          {[acct.customerNumber && `Acct #${acct.customerNumber}`, acct.dealerId && `Dealer ${acct.dealerId}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── DriverCombobox ───────────────────────────────────────────────────────────
interface DriverResult {
  id: string;
  displayName: string;
  employeeId?: string | null;
  status?: string | null;
}

function DriverCombobox({
  currentId,
  currentName,
  onSave,
  disabled,
}: {
  currentId?: string | null;
  currentName?: string | null;
  onSave: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { data: results = [] } = useQuery<DriverResult[]>({
    queryKey: ["/api/drivers/search", debouncedTerm],
    queryFn: async () => {
      if (!debouncedTerm.trim()) return [];
      const res = await fetch(`/api/drivers/search?q=${encodeURIComponent(debouncedTerm)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!debouncedTerm.trim(),
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearchTerm(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="btn-driver-combobox"
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span>{currentName || (currentId ? currentId.slice(0, 8) : "No driver linked")}</span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name…"
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {!debouncedTerm.trim() && (
              <CommandEmpty>Type to search drivers.</CommandEmpty>
            )}
            {debouncedTerm.trim() && results.length === 0 && (
              <CommandEmpty>No drivers found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((driver) => (
                  <CommandItem
                    key={driver.id}
                    value={driver.id}
                    onSelect={() => {
                      onSave(driver.id);
                      setOpen(false);
                      setSearchTerm("");
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{driver.displayName}</span>
                      {driver.employeeId && (
                        <span className="text-xs text-muted-foreground">{driver.employeeId}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const isNewTrip = !id || id === "new";

  const { data: trip, isLoading } = useQuery<TripWithRelations>({
    queryKey: ["/api/corporate/trips", id],
    enabled: isAuthenticated && !isNewTrip,
    queryFn: async () => {
      const response = await fetch(`/api/corporate/trips/${id}`);
      if (!response.ok) throw new Error("Failed to fetch trip");
      return response.json();
    },
  });

  interface MoveIncident {
    id: string;
    move_id: string;
    incident_type: string;
    occurred_at: string;
    description: string;
    severity: string;
    reported_by_user_id: string;
    reported_by_name: string;
    accident_id: string | null;
    created_at: string;
  }

  interface MoveClaim {
    id: string;
    accidentDate: string;
    location: string;
    incidentType: string | null;
    claimStatus: string;
    description: string | null;
    reporter: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }

  const { data: incidents = [] } = useQuery<MoveIncident[]>({
    queryKey: ['/api/moves', id, 'incidents'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${id}/incidents`);
      if (!response.ok) throw new Error("Failed to fetch incidents");
      return response.json();
    },
  });

  const { data: claims = [], isLoading: claimsLoading } = useQuery<MoveClaim[]>({
    queryKey: ['/api/moves', id, 'claims'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${id}/claims`);
      if (!response.ok) throw new Error("Failed to fetch claims");
      return response.json();
    },
  });

  // Check if this move is under a legal hold
  const { data: legalHoldStatus } = useQuery<{ isHeld: boolean; holdCount: number }>({
    queryKey: ['/api/legal-holds/check', 'move', id],
    enabled: isAuthenticated && !isNewTrip && !!id,
  });

  // Execution Timeline (Ticket 17)
  interface ExecutionTimelineEntry {
    id: number;
    eventId: string;
    eventType: string;
    occurredAt: string;
    payload: any;
    annotation: string | null;
    annotatedAt: string | null;
    driverId: string | null;
  }

  interface ExecutionTimelineResponse {
    moveId: string;
    timeline: ExecutionTimelineEntry[];
    count: number;
  }

  const { data: executionTimeline, isLoading: timelineLoading } = useQuery<ExecutionTimelineResponse>({
    queryKey: ['/api/moves', id, 'execution-timeline'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${id}/execution-timeline`);
      if (!response.ok) throw new Error("Failed to fetch execution timeline");
      return response.json();
    },
  });

  interface CurrentStateResponse {
    moveId: string;
    currentState: string;
    stateChangedAt: string;
    driverId: string | null;
    sourceEventId: string;
  }

  const { data: executionCurrentState } = useQuery<CurrentStateResponse>({
    queryKey: ['/api/moves', id, 'current-state'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${id}/current-state`);
      if (!response.ok) return null;
      return response.json();
    },
  });

  interface ProofEntry {
    id: number;
    proofType: string;
    mediaRef: string | null;
    occurredAt: string;
    geo: { lat: number; lng: number; accuracy: number | null } | null;
    eventId: string;
    metadata: any;
    driverId: string | null;
  }

  interface ProofsResponse {
    moveId: string;
    proofs: ProofEntry[];
    count: number;
  }

  const { data: proofsData, isLoading: proofsLoading } = useQuery<ProofsResponse>({
    queryKey: ['/api/moves', id, 'proofs'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/moves/${id}/proofs`);
      if (!response.ok) throw new Error("Failed to fetch proofs");
      return response.json();
    },
  });

  interface BillingCandidate {
    id: string;
    moveId: string | null;
    customerId: string;
    status: string;
    amount: string;
    serviceType: string;
    description: string | null;
    supportingEventIds: string[];
    proofRefs: any[];
    approvedBy: string | null;
    approvedAt: string | null;
    adjustments?: {
      id: string;
      adjustmentType: string;
      amount: string;
      reason: string;
      createdAt: string;
    }[];
  }

  interface Case {
    id: string;
    caseNumber: string;
    caseType: string;
    status: string;
    severity: string;
    exceptionType: string | null;
    createdAt: string;
    activityCount?: number;
  }

  const { data: billingCandidate, isLoading: billingLoading } = useQuery<BillingCandidate>({
    queryKey: ['/api/billing/candidates/move', id],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/billing/candidates/move/${id}`, { credentials: 'include' });
      if (!response.ok) return null;
      return response.json();
    },
  });

  const { data: moveCases, isLoading: casesLoading } = useQuery<Case[]>({
    queryKey: ['/api/cases/move', id],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/cases/move/${id}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // ── Feature 4.1: Move Exception Management ─────────────────────────────
  interface MoveException {
    type: string;
    reason: string;
    active: boolean;
    override: {
      status: 'open' | 'resolved';
      resolvedBy: string | null;
      resolvedAt: string | null;
      resolutionNote: string | null;
      createdAt: string;
    } | null;
  }

  const EXCEPTION_TYPE_LABELS: Record<string, string> = {
    ELIGIBILITY_FAIL:  "Eligibility Check Failed",
    MISSING_DRIVER:    "Missing Driver",
    MISSING_ACCOUNT:   "Missing Account",
    CANCELLED:         "Move Cancelled",
    MISSING_MOVE_TYPE: "Missing Move Type",
  };

  const { data: moveExceptions, refetch: refetchExceptions } = useQuery<MoveException[]>({
    queryKey: ['/api/corporate/trips', id, 'exceptions'],
    enabled: isAuthenticated && !isNewTrip && !!id,
    queryFn: async () => {
      const response = await fetch(`/api/corporate/trips/${id}/exceptions`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // ── Exception resolution ────────────────────────────────────────────────
  // Required-action guidance shown in the resolution mode banner per exception type.
  const EXCEPTION_REQUIRED_ACTION: Record<string, string> = {
    MISSING_MOVE_TYPE: "Select DriverShift or DriverDash in the Move Type field below.",
    MISSING_DRIVER:    "Assign a driver to this move using the Relationships section.",
    MISSING_ACCOUNT:   "Assign an account to this move using the Relationships section.",
    ELIGIBILITY_FAIL:  "Review and correct the eligibility issue in the driver's profile.",
    CANCELLED:         "Update the move status, or resolve to acknowledge this cancelled move.",
  };

  // State for resolve dialog
  const [resolvingType, setResolvingType] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  // null = not yet verified, true = condition corrected, false = still active after save
  const [resolutionVerified, setResolutionVerified] = useState<boolean | null>(null);

  // Refs kept in sync so async mutation callbacks see the latest values
  const moveExceptionsRef = useRef<MoveException[]>([]);
  const resolvingTypeRef  = useRef<string | null>(null);

  // ── Auto-save state ─────────────────────────────────────────────────────
  type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Resolution workflow helpers ──────────────────────────────────────────
  // Keep resolveNote in a ref so the auto-resolve timer closure always sees the latest value
  const resolveNoteRef = useRef<string>('');
  // Track the last auto-saved field so the auto-generated note is meaningful
  const lastSavedFieldRef = useRef<{ field: string; label: string; value: string } | null>(null);
  // Timer ref for the 2.5-second auto-resolve countdown
  const autoResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const FIELD_LABELS: Record<string, string> = {
    moveType:    "Move Type",
    status:      "Status",
    driverId:    "Driver",
    customerId:  "Account",
    distance:    "Distance (mi)",
    origin:      "Origin",
    destination: "Destination",
    tripDate:    "Move Date",
    moveNumber:  "Move Number",
  };

  const resolveMutation = useMutation({
    mutationFn: async ({ type, note }: { type: string; note: string }) => {
      const res = await fetch(`/api/corporate/trips/${id}/exceptions/${type}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNote: note }),
      });
      if (!res.ok) throw new Error("Failed to resolve exception");
      return res.json();
    },
    onSuccess: () => {
      // Capture navigation context from refs (stale-closure safe)
      const type       = resolvingTypeRef.current;
      const exceptions = moveExceptionsRef.current;
      const remainingActive = exceptions.filter(e => e.active && e.type !== type).length;

      refetchExceptions();
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/trips', id] });
      setResolvingType(null);
      setResolveNote('');
      setResolutionVerified(null);
      toast({ title: "Exception resolved", description: "The exception has been recorded and resolved." });

      // Navigate to the appropriate list after a brief delay so the toast renders
      setTimeout(() => {
        if (remainingActive > 0) {
          // Other exceptions remain — return to the Exceptions queue
          setLocation('/trips?exceptions=true&viewName=Exceptions');
        } else {
          // Move is clean — return to default Moves list
          setLocation('/trips');
        }
      }, 900);
    },
    onError: () => toast({ title: "Error", description: "Could not resolve exception.", variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await fetch(`/api/corporate/trips/${id}/exceptions/${type}/reopen`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error("Failed to reopen exception");
      return res.json();
    },
    onSuccess: () => {
      refetchExceptions();
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/trips', id] });
      toast({ title: "Exception reopened", description: "The exception has been marked as open." });
    },
    onError: () => toast({ title: "Error", description: "Could not reopen exception.", variant: "destructive" }),
  });

  const formSchema = isNewTrip ? insertTripSchema.partial() : updateTripSchema;
  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moveNumber: "",
      driverId: "",
      customerId: "",
      tripDate: "",
      origin: "",
      destination: "",
      distance: "",
      duration: "",
      status: "completed",
      moveType: "",
      vehicleType: "",
      billRate: "",
      payRate: "",
      grossProfit: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (trip) {
      form.reset({
        moveNumber: trip.moveNumber || "",
        driverId: trip.driverId || "",
        customerId: trip.customerId || "",
        tripDate: trip.tripDate ? parseFormDate(trip.tripDate) : "",
        origin: trip.origin || "",
        destination: trip.destination || "",
        distance: trip.distance?.toString() || "",
        duration: trip.duration || "",
        status: trip.status || "completed",
        moveType: trip.moveType || "",
        vehicleType: trip.vehicleType || "",
        billRate: trip.billRate?.toString() || "",
        payRate: trip.payRate?.toString() || "",
        grossProfit: trip.grossProfit?.toString() || "",
        notes: trip.notes || "",
      });
    }
  }, [trip]);

  // Keep refs in sync for stale-closure safety in async callbacks
  useEffect(() => { moveExceptionsRef.current = moveExceptions ?? []; }, [moveExceptions]);
  useEffect(() => { resolvingTypeRef.current = resolvingType; }, [resolvingType]);
  useEffect(() => { resolveNoteRef.current = resolveNote; }, [resolveNote]);

  // After every auto-save the exceptions query is invalidated and refetched.
  // If we are currently in resolution mode, determine whether the exception
  // condition is now satisfied (exception no longer active) or still open.
  useEffect(() => {
    if (!resolvingType || !moveExceptions) return;
    const isStillActive = moveExceptions.some(e => e.type === resolvingType && e.active);
    setResolutionVerified(!isStillActive);
  }, [moveExceptions, resolvingType]);

  // Auto-resolve: when the exception condition is verified as corrected, fire
  // the resolve mutation automatically after a 2.5-second window. This gives
  // the dispatcher a chance to see the confirmation and optionally add a note
  // before the workflow completes without requiring a manual button click.
  useEffect(() => {
    if (resolutionVerified !== true || !resolvingType) return;
    if (autoResolveTimerRef.current) clearTimeout(autoResolveTimerRef.current);
    autoResolveTimerRef.current = setTimeout(() => {
      const currentType = resolvingTypeRef.current;
      if (!currentType) return; // user cancelled before timer fired
      const note = resolveNoteRef.current.trim();
      const field = lastSavedFieldRef.current;
      const autoNote = note || (field ? `${field.label} set to "${field.value}"` : 'Corrected via field update');
      resolveMutation.mutate({ type: currentType, note: autoNote });
    }, 2500);
    return () => {
      if (autoResolveTimerRef.current) clearTimeout(autoResolveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionVerified, resolvingType]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/corporate/trips", data);
    },
    onSuccess: (newTrip: Trip) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/trips"] });
      toast({ title: "Move created successfully" });
      setLocation(`/trips/${newTrip.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create move",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ── Auto-save mutation — single-field PATCH for existing trips ──────────
  // Kept separate from createMutation to isolate new-move creation from the
  // per-field auto-save flow used on existing moves.
  const autoSaveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/corporate/trips/${id}`, payload),
    onMutate: () => {
      setAutoSaveStatus('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    },
    onSuccess: () => {
      // Re-fetch exceptions so the revalidation effect can assess the new state
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/trips', id, 'exceptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/trips', id] });
      setAutoSaveStatus('saved');
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2500);
    },
    onError: () => {
      setAutoSaveStatus('error');
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 4000);
      toast({
        title: "Save failed",
        description: "Could not save the change. Please try again.",
        variant: "destructive",
      });
    },
  });

  /** Auto-save a single field change.  Only fired for existing trips. */
  function handleAutoSave(fieldName: string, rawValue: unknown) {
    if (isNewTrip || !id) return;
    const payload: Record<string, unknown> = {};
    switch (fieldName) {
      case 'tripDate': {
        if (rawValue) payload.tripDate = new Date(rawValue as string);
        else return; // required — skip empty
        break;
      }
      case 'distance':
      case 'billRate':
      case 'payRate':
      case 'grossProfit': {
        const n = parseFloat(rawValue as string);
        if (!isNaN(n)) payload[fieldName] = n;
        else return;
        break;
      }
      case 'moveNumber':
      case 'origin':
      case 'destination': {
        if (!(rawValue as string)?.trim()) return; // required — skip blank
        payload[fieldName] = rawValue;
        break;
      }
      default:
        payload[fieldName] = rawValue;
    }
    if (Object.keys(payload).length === 0) return;
    // Track what was corrected so the auto-resolve note is meaningful
    if (resolvingTypeRef.current) {
      const label = FIELD_LABELS[fieldName] ?? fieldName;
      lastSavedFieldRef.current = { field: fieldName, label, value: String(rawValue) };
    }
    autoSaveMutation.mutate(payload);
  }

  const onSubmit = (data: FormData) => {
    // onSubmit is only reached for new trips (existing trips use auto-save).
    if (!isNewTrip) return;
    const transformedData: any = {};
    if (data.moveNumber) transformedData.moveNumber = data.moveNumber;
    if (data.driverId) transformedData.driverId = data.driverId;
    if (data.customerId) transformedData.customerId = data.customerId || null;
    if (data.tripDate) transformedData.tripDate = new Date(data.tripDate);
    if (data.origin) transformedData.origin = data.origin;
    if (data.destination) transformedData.destination = data.destination;
    if (data.distance) transformedData.distance = parseFloat(data.distance as string);
    if (data.duration) transformedData.duration = data.duration;
    if (data.status) transformedData.status = data.status;
    if (data.moveType) transformedData.moveType = data.moveType;
    if (data.vehicleType) transformedData.vehicleType = data.vehicleType;
    if (data.billRate) transformedData.billRate = parseFloat(data.billRate as string);
    if (data.payRate) transformedData.payRate = parseFloat(data.payRate as string);
    if (data.grossProfit) transformedData.grossProfit = parseFloat(data.grossProfit as string);
    if (data.notes) transformedData.notes = data.notes;
    createMutation.mutate(transformedData);
  };

  if (isLoading && !isNewTrip) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const displayData = trip || {};
  const isPending = createMutation.isPending;

  const tripExportColumns: ExcelColumn[] = [
    { header: "Move Number", key: "moveNumber", width: 15 },
    { header: "Move Date", key: "tripDate", width: 15 },
    { header: "Origin", key: "origin", width: 25 },
    { header: "Destination", key: "destination", width: 25 },
    { header: "Distance", key: "distance", width: 12 },
    { header: "Duration", key: "duration", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Move Type", key: "moveType", width: 15 },
    { header: "Vehicle Type", key: "vehicleType", width: 15 },
    { header: "Bill Rate", key: "billRate", width: 12 },
    { header: "Pay Rate", key: "payRate", width: 12 },
    { header: "Gross Profit", key: "grossProfit", width: 12 },
    { header: "Notes", key: "notes", width: 30 },
  ];

  const tripExportData = trip ? [{
    moveNumber: trip.moveNumber || "",
    tripDate: formatDate(trip.tripDate),
    origin: trip.origin || "",
    destination: trip.destination || "",
    distance: trip.distance || "",
    duration: trip.duration || "",
    status: trip.status || "",
    moveType: trip.moveType || "",
    vehicleType: trip.vehicleType || "",
    billRate: trip.billRate ? `$${trip.billRate}` : "",
    payRate: trip.payRate ? `$${trip.payRate}` : "",
    grossProfit: trip.grossProfit ? `$${trip.grossProfit}` : "",
    notes: trip.notes || "",
  }] : [];

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="pb-3 border-b">
        <div className="flex items-start justify-between gap-4 flex-wrap">

          {/* Left: back button + identity block */}
          <div className="flex items-start gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 mt-0.5 shrink-0"
              onClick={() => window.history.back()}
              data-testid="button-back-to-trips"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div>
              {/* Title row — move number + status + type + legal hold */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">
                  {isNewTrip ? "New Move" : `Move ${displayData.moveNumber || ""}`}
                </h1>
                {displayData.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(displayData.status)}`}>
                    {displayData.status === 'in-progress' ? 'In Progress' : displayData.status.charAt(0).toUpperCase() + displayData.status.slice(1)}
                  </span>
                )}
                {displayData.moveType && (
                  <Badge variant="outline" className="text-xs font-normal">{displayData.moveType}</Badge>
                )}
                {legalHoldStatus?.isHeld && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="destructive" className="gap-1 text-xs" data-testid="badge-legal-hold">
                        <ShieldCheck className="h-3 w-3" />
                        Legal Hold
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This move is under {legalHoldStatus.holdCount} legal hold(s)</p>
                      <p className="text-xs text-muted-foreground">Evidence preservation enforced</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Move date + auto-save status */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {displayData.tripDate && (
                  <span className="text-xs text-muted-foreground">{formatDate(displayData.tripDate)}</span>
                )}
                {isNewTrip && (
                  <span className="text-xs text-muted-foreground">Create a new move record</span>
                )}
                {!isNewTrip && autoSaveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="autosave-saving">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                  </span>
                )}
                {!isNewTrip && autoSaveStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400" data-testid="autosave-saved">
                    <Check className="h-3 w-3" /> Saved
                  </span>
                )}
                {!isNewTrip && autoSaveStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive" data-testid="autosave-error">
                    <XCircle className="h-3 w-3" /> Save failed — try again
                  </span>
                )}
              </div>

              {/* Account · Driver summary links */}
              {!isNewTrip && trip && (
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {trip.customerId ? (
                    <button
                      type="button"
                      onClick={() => setLocation(`/customers/${trip.customerId}`)}
                      className="text-xs font-medium hover:underline text-foreground"
                    >
                      {trip.customerName || trip.customerId}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">No account linked</span>
                  )}
                  <span className="text-muted-foreground/40 select-none">·</span>
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {trip.driverId ? (
                    <button
                      type="button"
                      onClick={() => setLocation(`/drivers/${trip.driverId}`)}
                      className="text-xs font-medium hover:underline text-foreground"
                    >
                      {trip.driverName || trip.driverId}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Driver: Not Linked</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: actions */}
          {!isNewTrip && trip && (
            <div className="flex items-center gap-2 shrink-0">
              <ReportIncidentDialog
                moveId={trip.id}
                moveNumber={trip.moveNumber || "Unknown"}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    More
                    <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem asChild>
                    <Link href={`/claims/new?moveId=${trip.id}`} className="flex items-center gap-2 cursor-pointer w-full">
                      <ShieldAlert className="h-4 w-4" />
                      File Claim
                    </Link>
                  </DropdownMenuItem>
                  <div className="px-1 py-0.5">
                    <ExcelDownloadButton
                      data={tripExportData}
                      columns={tripExportColumns}
                      filename={`Move_${trip.moveNumber || "Details"}`}
                      label="Download Excel"
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* ── Exception Panel ──────────────────────────────────────────────── */}
      {!isNewTrip && moveExceptions && moveExceptions.length > 0 && (
        <div className="space-y-2">

          {/* Resolution mode banner — compact */}
          {resolvingType && (
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10">
              <CardContent className="py-3 px-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Resolving: {EXCEPTION_TYPE_LABELS[resolvingType]}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-xs"
                    onClick={() => { setResolvingType(null); setResolveNote(''); setResolutionVerified(null); }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="rounded bg-blue-100/70 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                  {EXCEPTION_REQUIRED_ACTION[resolvingType] ?? "Correct the underlying issue in the fields below."}
                </div>
                {resolutionVerified === null && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Make the required correction below. The system will verify automatically.
                  </p>
                )}
                {resolutionVerified === false && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Exception condition not yet resolved — review the correction above.
                  </div>
                )}
                {resolutionVerified === true && (
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">{EXCEPTION_TYPE_LABELS[resolvingType]} corrected</span>
                      {(() => {
                        const otherActive = (moveExceptions || []).filter(e => e.active && e.type !== resolvingType);
                        return otherActive.length > 0 ? (
                          <span className="text-muted-foreground font-normal">— {otherActive.length} other exception{otherActive.length > 1 ? 's' : ''} still open</span>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">
                        Resolution note <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <textarea
                        className="mt-1 w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        rows={2}
                        placeholder="Add context (auto-filled from field change if left blank)"
                        value={resolveNote}
                        onChange={e => setResolveNote(e.target.value)}
                        data-testid="textarea-resolution-note"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      {resolveMutation.isPending ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Resolving…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" /> Resolving automatically…
                        </span>
                      )}
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (autoResolveTimerRef.current) clearTimeout(autoResolveTimerRef.current);
                            lastSavedFieldRef.current = null;
                            setResolvingType(null);
                            setResolveNote('');
                            setResolutionVerified(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={resolveMutation.isPending}
                          onClick={() => {
                            if (autoResolveTimerRef.current) clearTimeout(autoResolveTimerRef.current);
                            const field = lastSavedFieldRef.current;
                            const autoNote = resolveNote.trim() || (field ? `${field.label} set to "${field.value}"` : 'Corrected via field update');
                            resolveMutation.mutate({ type: resolvingType, note: autoNote });
                          }}
                          data-testid="button-resolve-exception-confirm"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve Now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Exception list — compact rows */}
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Move Exceptions</span>
              <span className="text-xs text-muted-foreground">
                {moveExceptions.filter(e => e.active).length} active
                {moveExceptions.some(e => !e.active) && `, ${moveExceptions.filter(e => !e.active).length} resolved`}
              </span>
            </div>
            {moveExceptions.map((exc) => {
              const isResolving = resolvingType === exc.type;
              return (
                <div
                  key={exc.type}
                  className={`flex items-start justify-between gap-3 px-3 py-2.5 border-b last:border-0 ${
                    isResolving ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {isResolving
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                      : exc.active
                      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">
                        {EXCEPTION_TYPE_LABELS[exc.type] ?? exc.type}
                        {isResolving && (
                          <span className="ml-2 font-normal text-blue-600 dark:text-blue-400">— In progress ↑</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{exc.reason}</p>
                      {!exc.active && exc.override && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Resolved{exc.override.resolvedAt
                            ? ` ${new Date(exc.override.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : ''}
                          {exc.override.resolutionNote && ` — "${exc.override.resolutionNote}"`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {exc.active ? (
                      isResolving ? (
                        <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">See above ↑</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2.5 text-xs"
                          disabled={!!resolvingType}
                          onClick={() => {
                            setResolvingType(exc.type);
                            setResolveNote('');
                            setResolutionVerified(null);
                            // Scroll to the field that needs correction
                            setTimeout(() => {
                              const fieldIdMap: Record<string, string> = {
                                MISSING_MOVE_TYPE: 'field-move-type',
                                MISSING_DRIVER:    'field-driver',
                                MISSING_ACCOUNT:   'field-account',
                                CANCELLED:         'field-status',
                              };
                              const targetId = fieldIdMap[exc.type];
                              if (targetId) {
                                const el = document.getElementById(targetId);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  const focusable = el.querySelector<HTMLElement>('button,select,input');
                                  if (focusable) setTimeout(() => focusable.focus(), 400);
                                }
                              }
                            }, 80);
                          }}
                          data-testid={`button-resolve-${exc.type}`}
                        >
                          Fix
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        disabled={reopenMutation.isPending}
                        onClick={() => reopenMutation.mutate(exc.type)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Form ────────────────────────────────────────────────────── */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* ── Move Details ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">

              {/* Row 1: Date / Status / Move Type */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="tripDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Move Date</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("tripDate", e.target.value); }} data-testid="input-trip-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div id="field-status">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Status</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            onChange={(e) => { field.onChange(e); handleAutoSave("status", e.target.value); }}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            data-testid="select-status"
                          >
                            <option value="completed">Completed</option>
                            <option value="in-progress">In Progress</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div id="field-move-type">
                  <FormField
                    control={form.control}
                    name="moveType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Move Type</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            onChange={(e) => { field.onChange(e); handleAutoSave("moveType", e.target.value); }}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            data-testid="select-move-type"
                          >
                            <option value="">— Select —</option>
                            <option value="DriverShift">DriverShift</option>
                            <option value="DriverDash">DriverDash</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Row 2: Account / Driver / Vehicle Type (existing trips) */}
              {!isNewTrip && trip && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div id="field-account">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Account</p>
                    <AccountCombobox
                      currentId={trip.customerId}
                      currentName={trip.customerName}
                      onSave={(accountId) => handleAutoSave('customerId', accountId)}
                      disabled={autoSaveMutation.isPending}
                    />
                    {trip.customerId && (trip.customerNumber || trip.dealerId) && (
                      <div className="mt-0.5 flex gap-x-2 flex-wrap">
                        {trip.customerNumber && <p className="text-xs text-muted-foreground">Acct #{trip.customerNumber}</p>}
                        {trip.dealerId && <p className="text-xs text-muted-foreground">Dealer {trip.dealerId}</p>}
                      </div>
                    )}
                    {trip.customerId && (
                      <button type="button" onClick={() => setLocation(`/customers/${trip.customerId}`)} className="mt-1 text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> View Account
                      </button>
                    )}
                  </div>
                  <div id="field-driver">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Driver</p>
                    <DriverCombobox
                      currentId={trip.driverId}
                      currentName={trip.driverName}
                      onSave={(driverId) => handleAutoSave('driverId', driverId)}
                      disabled={autoSaveMutation.isPending}
                    />
                    {trip.driverId && (trip.driverType || trip.driverClassification) && (
                      <div className="mt-0.5 flex gap-x-2 flex-wrap">
                        {trip.driverType && <p className="text-xs text-muted-foreground">{trip.driverType}</p>}
                        {trip.driverClassification && <p className="text-xs text-muted-foreground">{trip.driverClassification}</p>}
                      </div>
                    )}
                    {trip.driverId && (
                      <button type="button" onClick={() => setLocation(`/drivers/${trip.driverId}`)} className="mt-1 text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> View Driver
                      </button>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Vehicle Type</FormLabel>
                        <FormControl>
                          <Input className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("vehicleType", e.target.value); }} placeholder="e.g., Van, Truck" data-testid="input-vehicle-type" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Vehicle Type only — new trips */}
              {isNewTrip && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Vehicle Type</FormLabel>
                        <FormControl>
                          <Input className="h-8 text-sm" {...field} placeholder="e.g., Van, Truck" data-testid="input-vehicle-type" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Row 3: Origin / Destination / Distance / Duration */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Origin</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("origin", e.target.value); }} placeholder="Starting location" data-testid="input-origin" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Destination</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("destination", e.target.value); }} placeholder="Ending location" data-testid="input-destination" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="distance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Distance (mi)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("distance", e.target.value); }} placeholder="0.00" data-testid="input-distance" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Duration</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("duration", e.target.value); }} placeholder="2h 30m" data-testid="input-duration" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Move Number — new trips only (existing trips show it in the header) */}
              {isNewTrip && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="moveNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Move Number</FormLabel>
                        <FormControl>
                          <Input className="h-8 text-sm" {...field} placeholder="e.g., MOVE-001" data-testid="input-move-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Financial Details ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">

              {/* Transaction Summary — read-only imported data */}
              {!isNewTrip && trip && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Transaction Summary
                    <span className="text-muted-foreground/60"> · Imported · Read only</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Move Charges</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {trip.customerCharges ? `$${parseFloat(trip.customerCharges as string).toFixed(2)}` : <span className="text-muted-foreground font-normal">—</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Driver Pay</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {trip.driverPay ? `$${parseFloat(trip.driverPay as string).toFixed(2)}` : <span className="text-muted-foreground font-normal">—</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Reimbursements</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {trip.driverReturnCharges ? `$${parseFloat(trip.driverReturnCharges as string).toFixed(2)}` : <span className="text-muted-foreground font-normal">—</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Margin</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {trip.grossMargin ? `${parseFloat(trip.grossMargin as string).toFixed(1)}%` : <span className="text-muted-foreground font-normal">—</span>}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Rate Configuration — editable */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Rate Configuration
                  <span className="text-muted-foreground/60"> · DriverHub editable</span>
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="billRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Bill Rate ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("billRate", e.target.value); }} placeholder="0.00" data-testid="input-bill-rate" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="payRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Pay Rate ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("payRate", e.target.value); }} placeholder="0.00" data-testid="input-pay-rate" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="grossProfit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Gross Profit ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" className="h-8 text-sm" {...field} onBlur={(e) => { field.onBlur(); handleAutoSave("grossProfit", e.target.value); }} placeholder="0.00" data-testid="input-gross-profit" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        className="text-sm resize-none"
                        {...field}
                        onBlur={(e) => { field.onBlur(); handleAutoSave("notes", e.target.value); }}
                        placeholder="Additional notes about this move"
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Form actions — new trips only; existing trips auto-save */}
          {isNewTrip && (
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => window.history.back()} data-testid="button-cancel">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-trip">
                {createMutation.isPending ? "Creating..." : "Create Move"}
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* DriverReturn Charges Section */}
      {!isNewTrip && trip && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              DriverReturn Charges
            </CardTitle>
            <CardDescription>DriverReturn records linked to this move</CardDescription>
          </CardHeader>
          <CardContent>
            {!trip.driverReturns || trip.driverReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No DriverReturn records are linked to this move.</p>
            ) : (
              <div className="space-y-4">
                {trip.driverReturns.map((dr) => {
                  const sourceLabel = dr.sourceSystemKey === "uber" ? "Uber DriverReturn" : "RedCap DriverReturn";
                  const charge = dr.customerBilled ?? dr.baseCost;
                  return (
                    <div key={dr.id} className="border border-border rounded-lg p-4 space-y-3">
                      {/* Source badge + financial summary */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" className="font-medium">{sourceLabel}</Badge>
                        <div className="flex items-center gap-4">
                          {dr.customerBilled && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Charge</p>
                              <p className="text-lg font-bold tabular-nums">${parseFloat(dr.customerBilled).toFixed(2)}</p>
                            </div>
                          )}
                          {dr.customerTotal && dr.customerTotal !== dr.customerBilled && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Net Charge</p>
                              <p className="text-base font-semibold tabular-nums">${parseFloat(dr.customerTotal).toFixed(2)}</p>
                            </div>
                          )}
                          {dr.baseCost && dr.baseCost !== dr.customerBilled && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Driver Cost</p>
                              <p className="text-base font-semibold tabular-nums text-muted-foreground">${parseFloat(dr.baseCost).toFixed(2)}</p>
                            </div>
                          )}
                          {!dr.customerBilled && dr.baseCost && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Charge</p>
                              <p className="text-lg font-bold tabular-nums">${parseFloat(dr.baseCost).toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Detail fields */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                        {dr.redcapId && (
                          <div>
                            <p className="text-xs text-muted-foreground">RedCap ID</p>
                            <p className="font-mono font-medium">{dr.redcapId}</p>
                          </div>
                        )}
                        {dr.sourceTripId && (
                          <div>
                            <p className="text-xs text-muted-foreground">Reference #</p>
                            <p className="font-mono font-medium">{dr.sourceTripId}</p>
                          </div>
                        )}
                        {dr.milesEstimate && (
                          <div>
                            <p className="text-xs text-muted-foreground">Miles</p>
                            <p className="font-medium">{parseFloat(dr.milesEstimate).toFixed(1)} mi</p>
                          </div>
                        )}
                        {dr.minutes && (
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="font-medium">{Math.round(parseFloat(dr.minutes))} min</p>
                          </div>
                        )}
                        {dr.tripDate && (
                          <div>
                            <p className="text-xs text-muted-foreground">Date</p>
                            <p className="font-medium">{formatDate(dr.tripDate)}</p>
                          </div>
                        )}
                        {dr.status && (
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <p className="font-medium capitalize">{dr.status}</p>
                          </div>
                        )}
                        {dr.roNumber && (
                          <div>
                            <p className="text-xs text-muted-foreground">RO Number</p>
                            <p className="font-mono font-medium">{dr.roNumber}</p>
                          </div>
                        )}
                        {dr.dealerName && (
                          <div>
                            <p className="text-xs text-muted-foreground">Dealer</p>
                            <p className="font-medium">{dr.dealerName}</p>
                          </div>
                        )}
                        {(dr.vehicleYear || dr.vehicleMake || dr.vehicleModel) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Vehicle</p>
                            <p className="font-medium">{[dr.vehicleYear, dr.vehicleMake, dr.vehicleModel].filter(Boolean).join(" ")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Photo Compliance Section */}
      {!isNewTrip && trip && id && (
        <PhotoComplianceCard moveId={id} isAdmin={true} />
      )}

      {/* Evidence Chain Section */}
      {!isNewTrip && id && (
        <EvidenceChainViewer moveId={id} maxHeight="500px" />
      )}

      {/* Incidents Section */}
      {!isNewTrip && trip && (
        <Card data-testid="card-incidents">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              Recorded Incidents
            </CardTitle>
            <CardDescription>
              Incidents reported for this move (damage, accidents, injuries, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No incidents have been reported for this move.</p>
            ) : (
              <div className="space-y-3">
                {incidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="p-3 rounded-lg border"
                    data-testid={`incident-item-${incident.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={
                            incident.severity === 'HIGH' ? 'destructive' :
                            incident.severity === 'MEDIUM' ? 'secondary' :
                            'outline'
                          }>
                            {incident.severity}
                          </Badge>
                          <Badge variant="outline">{incident.incident_type}</Badge>
                          {incident.accident_id && (
                            <Badge variant="default">Linked to Claim</Badge>
                          )}
                        </div>
                        <p className="text-sm">{incident.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Occurred: {new Date(incident.occurred_at).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Reported by: {incident.reported_by_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Claims Section */}
      {!isNewTrip && trip && (
        <Card data-testid="card-claims">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-orange-500" />
              Related Claims
              {claims.length > 0 && (
                <Badge variant="secondary" className="ml-2">{claims.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Claims filed for incidents on this move
            </CardDescription>
          </CardHeader>
          <CardContent>
            {claimsLoading ? (
              <p className="text-sm text-muted-foreground">Loading claims...</p>
            ) : claims.length === 0 ? (
              <p className="text-sm text-muted-foreground">No claims have been filed for this move.</p>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3 rounded-lg border hover-elevate"
                    data-testid={`claim-item-${claim.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={
                            claim.claimStatus === 'CLOSED' || claim.claimStatus === 'PAID' ? 'default' :
                            claim.claimStatus === 'DENIED' ? 'destructive' :
                            'secondary'
                          }>
                            {claim.claimStatus || 'DRAFT'}
                          </Badge>
                          {claim.incidentType && (
                            <Badge variant="outline">{claim.incidentType}</Badge>
                          )}
                        </div>
                        <p className="text-sm">{claim.description || claim.location || 'No description'}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(claim.accidentDate)}
                          </span>
                          {claim.reporter && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {claim.reporter.firstName} {claim.reporter.lastName}
                            </span>
                          )}
                        </div>
                      </div>
                      <Link href={`/accidents/${claim.id}`}>
                        <Button variant="outline" size="sm" data-testid={`button-view-claim-${claim.id}`}>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Claim
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Execution Current State (Ticket 17) */}
      {!isNewTrip && trip && (
        <Card data-testid="card-execution-state">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Execution State
            </CardTitle>
            <CardDescription>
              Current state derived from execution events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!executionCurrentState ? (
              <p className="text-sm text-muted-foreground">No execution state recorded for this move.</p>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="default" data-testid="badge-current-state">
                  {executionCurrentState.currentState}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Changed: {new Date(executionCurrentState.stateChangedAt).toLocaleString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Execution Timeline (Ticket 17) */}
      {!isNewTrip && trip && (
        <Card data-testid="card-execution-timeline">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-500" />
              Execution Timeline
              {executionTimeline && executionTimeline.count > 0 && (
                <Badge variant="secondary" className="ml-2">{executionTimeline.count}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Chronological execution events from the system of record
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timelineLoading ? (
              <p className="text-sm text-muted-foreground">Loading timeline...</p>
            ) : !executionTimeline || executionTimeline.count === 0 ? (
              <p className="text-sm text-muted-foreground">No execution events recorded for this move.</p>
            ) : (
              <div className="space-y-3">
                {executionTimeline.timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-lg border flex items-start gap-3"
                    data-testid={`timeline-entry-${entry.id}`}
                  >
                    <div className="mt-1">
                      {entry.eventType.includes('state') || entry.eventType.includes('completed') || entry.eventType.includes('assigned') ? (
                        <Activity className="h-4 w-4 text-blue-500" />
                      ) : entry.eventType.includes('proof') ? (
                        <Image className="h-4 w-4 text-green-500" />
                      ) : entry.eventType.includes('message') ? (
                        <MessageSquare className="h-4 w-4 text-purple-500" />
                      ) : entry.eventType.includes('location') ? (
                        <MapPin className="h-4 w-4 text-orange-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline">{entry.eventType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.payload && (
                        <div className="text-sm text-muted-foreground">
                          {entry.payload.state && <span>State: {entry.payload.state}</span>}
                          {entry.payload.status && <span>Status: {entry.payload.status}</span>}
                          {entry.payload.message && <span>{entry.payload.message}</span>}
                        </div>
                      )}
                      {entry.annotation && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <span className="font-medium">Annotation:</span> {entry.annotation}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Proofs Index (Ticket 17) */}
      {!isNewTrip && trip && (
        <Card data-testid="card-proofs-index">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-green-500" />
              Captured Proofs
              {proofsData && proofsData.count > 0 && (
                <Badge variant="secondary" className="ml-2">{proofsData.count}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Photos, signatures, and documents captured during execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proofsLoading ? (
              <p className="text-sm text-muted-foreground">Loading proofs...</p>
            ) : !proofsData || proofsData.count === 0 ? (
              <p className="text-sm text-muted-foreground">No proofs captured for this move.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {proofsData.proofs.map((proof) => (
                  <div
                    key={proof.id}
                    className="p-3 rounded-lg border"
                    data-testid={`proof-entry-${proof.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{proof.proofType}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(proof.occurredAt).toLocaleString()}
                      </div>
                      {proof.geo && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {proof.geo.lat.toFixed(4)}, {proof.geo.lng.toFixed(4)}
                        </div>
                      )}
                      {proof.mediaRef && (
                        <div className="mt-2">
                          <a 
                            href={proof.mediaRef} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary flex items-center gap-1"
                            data-testid={`link-view-media-${proof.id}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Media
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Billing Summary (Ticket 19) */}
      {!isNewTrip && trip && (
        <Card data-testid="card-billing-summary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Billing Summary
            </CardTitle>
            <CardDescription>
              Invoice candidate generated from completed move
            </CardDescription>
          </CardHeader>
          <CardContent>
            {billingLoading ? (
              <p className="text-sm text-muted-foreground">Loading billing data...</p>
            ) : !billingCandidate ? (
              <div className="text-sm text-muted-foreground">
                <p>No billing candidate created yet.</p>
                <p className="text-xs mt-1">A candidate is auto-created when the move reaches COMPLETED status.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div data-testid="billing-status-field">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge 
                      variant={billingCandidate.status === 'approved' ? 'default' : 'secondary'}
                      className={billingCandidate.status === 'approved' ? 'bg-green-600 text-white' : ''}
                      data-testid="billing-status-badge"
                    >
                      {billingCandidate.status.charAt(0).toUpperCase() + billingCandidate.status.slice(1)}
                    </Badge>
                  </div>
                  <div data-testid="billing-amount-field">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-lg font-bold font-mono" data-testid="billing-amount-value">
                      ${parseFloat(billingCandidate.amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div data-testid="billing-service-type-field">
                    <p className="text-xs text-muted-foreground">Service Type</p>
                    <p data-testid="billing-service-type-value">{billingCandidate.serviceType}</p>
                  </div>
                  <div data-testid="billing-events-field">
                    <p className="text-xs text-muted-foreground">Supporting Events</p>
                    <p data-testid="billing-events-count">{Array.isArray(billingCandidate.supportingEventIds) ? billingCandidate.supportingEventIds.length : 0} linked</p>
                  </div>
                </div>

                {billingCandidate.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm">{billingCandidate.description}</p>
                  </div>
                )}

                {billingCandidate.adjustments && billingCandidate.adjustments.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Adjustments</p>
                    <div className="space-y-2">
                      {billingCandidate.adjustments.map((adj) => (
                        <div key={adj.id} className="flex items-center justify-between p-2 rounded border text-sm">
                          <div>
                            <Badge variant="outline">{adj.adjustmentType}</Badge>
                            <span className="ml-2 text-muted-foreground">{adj.reason}</span>
                          </div>
                          <span className={`font-mono ${parseFloat(adj.amount) < 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {parseFloat(adj.amount) >= 0 ? '+' : ''}${parseFloat(adj.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {billingCandidate.approvedAt && (
                  <div className="text-xs text-muted-foreground">
                    Approved: {new Date(billingCandidate.approvedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Case Links (Ticket 20) */}
      {!isNewTrip && (
        <Card data-testid="card-case-links">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Linked Cases
            </CardTitle>
            <CardDescription>QA and claims cases for this move</CardDescription>
          </CardHeader>
          <CardContent>
            {casesLoading ? (
              <p className="text-sm text-muted-foreground">Loading cases...</p>
            ) : !moveCases || moveCases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases linked to this move.</p>
            ) : (
              <div className="space-y-3">
                {moveCases.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`case-link-${c.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={c.severity === 'high' ? 'destructive' : c.severity === 'medium' ? 'secondary' : 'outline'}
                        data-testid={`case-severity-${c.id}`}
                      >
                        {c.severity}
                      </Badge>
                      <div>
                        <p className="font-medium">{c.caseNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.caseType === 'CLAIMS' ? 'Claims' : 'QA'} 
                          {c.exceptionType && ` - ${c.exceptionType.replace(/_/g, ' ')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={c.status === 'resolved' || c.status === 'closed' ? 'default' : 'secondary'}
                        className={c.status === 'resolved' || c.status === 'closed' ? 'bg-green-600 text-white' : ''}
                        data-testid={`case-status-${c.id}`}
                      >
                        {c.status}
                      </Badge>
                      <Link href={`/qa-queue?caseId=${c.id}`}>
                        <Button variant="ghost" size="sm" data-testid={`case-view-${c.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
