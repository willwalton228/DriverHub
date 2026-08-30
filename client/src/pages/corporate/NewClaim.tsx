import { useState, useEffect } from "react";
import { todayDateString, formatDate } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Loader2, AlertTriangle, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@shared/schema";
import {
  claimCategories,
  claimCategoryOptions,
  claimIncidentTypeOptions,
  claimIncidentTypeValues,
  claimSeverities,
  validateIncidentDate,
} from "@shared/schema";

// ── Local types ──────────────────────────────────────────────────────────────

/** Shape returned by GET /api/corporate/trips (getTripsPage) */
interface MoveSearchResult {
  id: string;
  moveNumber: string;
  origin: string | null;
  destination: string | null;
  tripDate: string | null;
  driverId: string | null;
  driverName: string | null;        // pre-joined by server
  driverFirstName: string | null;
  driverLastName: string | null;
  customerId: string | null;
  customerName: string | null;      // pre-joined by server
}

/** Shape returned by GET /api/drivers/search */
interface DriverSearchResult {
  id: string;
  displayName: string;
  employeeId: string | null;
  status: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  moveId: z.string().min(1, "Move is required"),
  // Claim Type (authoritative — Insurance Claim vs Internal Claim). DH-002340.
  claimCategory: z.enum(claimCategories, { required_error: "Claim type is required" }),
  incidentType: z.enum(claimIncidentTypeValues, { required_error: "Incident type is required" }),
  incidentDate: z.string().min(1, "Incident date is required").refine(
    (val) => validateIncidentDate(val).valid,
    (val) => ({ message: validateIncidentDate(val).error || "Invalid incident date" })
  ),
  incidentTime: z.string().optional(),
  driverId: z.string().min(1, "Driver is required"),
  customerId: z.string().optional().nullable(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  severity: z.enum(claimSeverities, { required_error: "Severity is required" }),
  location: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewClaim() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);

  const { toast } = useToast();

  // ── Move combobox state ────────────────────────────────────────────────────
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");
  const [selectedMoveLabel, setSelectedMoveLabel] = useState("");
  const [selectedMove, setSelectedMove] = useState<MoveSearchResult | null>(null);

  // ── Driver combobox state ──────────────────────────────────────────────────
  const [driverOpen, setDriverOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriverLabel, setSelectedDriverLabel] = useState("");

  // ── Move search query — server-side, fires when combobox is open ──────────
  const {
    data: moveSearchData,
    isFetching: movesSearching,
    isError: moveSearchFailed,
  } = useQuery<{
    trips: MoveSearchResult[];
    total: number;
  }>({
    queryKey: ["/api/corporate/trips", "claim-search", moveSearch],
    queryFn: () =>
      fetch(
        `/api/corporate/trips?moveNumber=${encodeURIComponent(moveSearch)}&limit=30&sortBy=tripDate&sortDir=desc`,
        { credentials: "include", headers: { "Cache-Control": "no-cache" } }
      ).then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.message || "Move search failed");
        }
        return r.json();
      }),
    enabled: moveOpen,
    staleTime: 30_000,
  });
  const moveResults: MoveSearchResult[] = moveSearchData?.trips ?? [];

  // ── Driver search query — fires when combobox is open ─────────────────────
  const { data: driverResults = [], isFetching: driverSearching } = useQuery<DriverSearchResult[]>({
    queryKey: ["/api/drivers/search", "claim-search", driverSearch],
    queryFn: () =>
      fetch(
        `/api/drivers/search?q=${encodeURIComponent(driverSearch)}&active=false`,
        { credentials: "include", headers: { "Cache-Control": "no-cache" } }
      ).then((r) => r.json()),
    enabled: driverOpen,
    staleTime: 30_000,
  });

  // ── Customers (static, optional field) ────────────────────────────────────
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moveId: "",
      claimCategory: undefined,
      incidentType: undefined,
      incidentDate: todayDateString(),
      incidentTime: "",
      driverId: "",
      customerId: null,
      description: "",
      severity: undefined,
      location: "",
    },
  });

  // ── Pre-fill moveId from URL param (e.g. ?moveId=some-uuid) ──────────────
  useEffect(() => {
    const urlMoveId = urlParams.get("moveId");
    if (!urlMoveId) return;
    // Fetch the specific move so we can display it properly
    fetch(
      `/api/corporate/trips?limit=1`,
      { credentials: "include", headers: { "Cache-Control": "no-cache" } }
    )
      .then((r) => r.json())
      .catch(() => null);
    // Just set the ID — the combobox label will show the raw ID until the user
    // opens the picker and selects a move. This is an edge-case path.
    form.setValue("moveId", urlMoveId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-populate Driver + Customer when a Move is selected ───────────────
  useEffect(() => {
    if (!selectedMove) return;

    // Auto-fill driverId if the move has a driver
    if (selectedMove.driverId) {
      form.setValue("driverId", selectedMove.driverId, { shouldValidate: true });
      const label =
        selectedMove.driverName ||
        [selectedMove.driverFirstName, selectedMove.driverLastName].filter(Boolean).join(" ") ||
        selectedMove.driverId;
      setSelectedDriverLabel(label);
    }

    // Auto-fill customerId if the move has a customer
    if (selectedMove.customerId) {
      form.setValue("customerId", selectedMove.customerId);
    }
  }, [selectedMove]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/corporate/claims", data);
      return await res.json();
    },
    onSuccess: (result: any) => {
      const displayId =
        result?.displayClaimId || (result?.id ? result.id.substring(0, 8) : "");
      toast({
        title: "Claim Submitted",
        description: displayId
          ? `Claim successfully created (Claim ID: ${displayId}).`
          : "Claim successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents"] });
      navigate("/dashboard/claims");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create claim",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard/claims")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Claim</h1>
          <p className="text-muted-foreground">Submit a new claim for an incident</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Claim Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* ── MOVE — unified search + select combobox ── */}
              <FormField
                control={form.control}
                name="moveId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Move</FormLabel>
                    <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={moveOpen}
                            className={cn(
                              "w-full justify-between font-normal",
                              !selectedMoveLabel && "text-muted-foreground"
                            )}
                            data-testid="button-select-move"
                          >
                            {selectedMoveLabel || "Search by Move ID or route…"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(560px,90vw)] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Type Move ID, origin, or destination…"
                            value={moveSearch}
                            onValueChange={setMoveSearch}
                            data-testid="input-move-search"
                          />
                          <CommandList>
                            {movesSearching && (
                              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Searching…
                              </div>
                            )}
                            {!movesSearching && moveSearchFailed && (
                              <div
                                className="px-4 py-6 text-center text-sm text-destructive"
                                data-testid="move-search-error"
                              >
                                Move search could not be completed. Please try again.
                              </div>
                            )}
                            {!movesSearching && !moveSearchFailed && moveResults.length === 0 && (
                              <CommandEmpty>
                                {moveSearch.length > 0
                                  ? "No moves found. Try a different search."
                                  : "Type to search moves…"}
                              </CommandEmpty>
                            )}
                            {!movesSearching && moveResults.length > 0 && (
                              <CommandGroup>
                                {moveResults.map((move) => (
                                  <CommandItem
                                    key={move.id}
                                    value={move.id}
                                    onSelect={() => {
                                      field.onChange(move.id);
                                      setSelectedMove(move);
                                      const label = [
                                        move.moveNumber,
                                        move.origin && move.destination
                                          ? `${move.origin} → ${move.destination}`
                                          : move.origin || move.destination,
                                      ]
                                        .filter(Boolean)
                                        .join(" — ");
                                      setSelectedMoveLabel(label);
                                      setMoveOpen(false);
                                    }}
                                    data-testid={`option-move-${move.id}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        field.value === move.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm">
                                        {move.moveNumber}
                                        {move.driverName && (
                                          <span className="ml-2 font-normal text-muted-foreground">
                                            — {move.driverName}
                                          </span>
                                        )}
                                      </div>
                                      {(move.origin || move.destination) && (
                                        <div className="text-xs text-muted-foreground truncate">
                                          {[move.origin, move.destination]
                                            .filter(Boolean)
                                            .join(" → ")}
                                        </div>
                                      )}
                                      {move.tripDate && (
                                        <div className="text-xs text-muted-foreground">
                                          {formatDate(move.tripDate)}
                                          {move.customerName && ` · ${move.customerName}`}
                                        </div>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Selected Move summary banner ── */}
              {selectedMove && (
                <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                  <p><strong>Move:</strong> {selectedMove.moveNumber}</p>
                  {(selectedMove.origin || selectedMove.destination) && (
                    <p>
                      <strong>Route:</strong>{" "}
                      {[selectedMove.origin, selectedMove.destination].filter(Boolean).join(" → ")}
                    </p>
                  )}
                  {selectedMove.tripDate && (
                    <p><strong>Date:</strong> {formatDate(selectedMove.tripDate)}</p>
                  )}
                  {selectedMove.driverName && (
                    <p><strong>Driver:</strong> {selectedMove.driverName} <span className="text-muted-foreground text-xs">(auto-populated below — change if needed)</span></p>
                  )}
                  {selectedMove.customerName && (
                    <p><strong>Account:</strong> {selectedMove.customerName}</p>
                  )}
                </div>
              )}

              {/* ── Claim Type + Incident Type + Severity ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="claimCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Claim Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-claim-type">
                            <SelectValue placeholder="Select Claim Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {claimCategoryOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incidentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Incident Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-incident-type">
                            <SelectValue placeholder="Select Incident Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {claimIncidentTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Severity</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-severity">
                            <SelectValue placeholder="Select severity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="CRITICAL">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Incident Date + Time ── */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="incidentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Incident Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          max={todayDateString()}
                          data-testid="input-incident-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incidentTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Incident Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-incident-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── DRIVER — combobox with live search, all statuses ── */}
              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Driver</FormLabel>
                    <Popover open={driverOpen} onOpenChange={setDriverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={driverOpen}
                            className={cn(
                              "w-full justify-between font-normal",
                              !selectedDriverLabel && "text-muted-foreground"
                            )}
                            data-testid="button-select-driver"
                          >
                            {selectedDriverLabel || "Search for driver…"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(440px,90vw)] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search by name…"
                            value={driverSearch}
                            onValueChange={setDriverSearch}
                            data-testid="input-driver-search"
                          />
                          <CommandList>
                            {driverSearching && (
                              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Searching…
                              </div>
                            )}
                            {!driverSearching && driverResults.length === 0 && (
                              <CommandEmpty>No drivers found.</CommandEmpty>
                            )}
                            {!driverSearching && driverResults.length > 0 && (
                              <CommandGroup>
                                {driverResults.map((driver) => (
                                  <CommandItem
                                    key={driver.id}
                                    value={driver.id}
                                    onSelect={() => {
                                      field.onChange(driver.id);
                                      setSelectedDriverLabel(driver.displayName);
                                      setDriverOpen(false);
                                    }}
                                    data-testid={`option-driver-${driver.id}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        field.value === driver.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium">{driver.displayName}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {driver.status !== "active" && (
                                          <span className="capitalize text-amber-600 dark:text-amber-400 mr-1">
                                            {driver.status}
                                          </span>
                                        )}
                                        {driver.employeeId && `ID: ${driver.employeeId}`}
                                      </div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">
                      Includes inactive and terminated drivers. Search by name to find historical records.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Customer (optional) ── */}
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-customer">
                          <SelectValue placeholder="Select customer (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Location ── */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Where did the incident occur?"
                        {...field}
                        data-testid="input-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Description ── */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the incident in detail…"
                        className="min-h-[120px]"
                        {...field}
                        data-testid="textarea-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Actions ── */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard/claims")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  data-testid="button-submit-claim"
                >
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Claim
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
