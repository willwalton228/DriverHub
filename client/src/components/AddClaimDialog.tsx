import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { validateIncidentDate } from "@shared/schema";
import { todayDateString } from "@/lib/dateFormat";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, ChevronsUpDown, Check } from "lucide-react";

const VALID_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "abandoned", label: "Abandoned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "denied", label: "Denied" },
  { value: "driver_paid", label: "Driver Paid" },
  { value: "insurance_paid", label: "Insurance Paid" },
  { value: "dod_paid", label: "DoD Paid" },
] as const;

const addClaimSchema = z.object({
  accidentDate: z.string().min(1, "Date of incident is required").refine(
    (val) => validateIncidentDate(val).valid,
    (val) => ({ message: validateIncidentDate(val).error || "Invalid incident date" })
  ),
  status: z.string().default("pending"),
  driverId: z.string().min(1, "Driver is required"),
  customerId: z.string().optional(),
  location: z.string().min(1, "Customer / Account is required"),
  policeReportFiled: z.string().default("no"),
  dodAtFault: z.string().optional(),
  vehicleInvolved: z.string().optional(),
  zendeskTicketNumber: z.string().optional(),
  incidentType: z.string().optional(),
  notesReceived: z.string().optional(),
});

type AddClaimFormData = z.infer<typeof addClaimSchema>;

export interface AddClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDriverId?: string;
  defaultDriverName?: string;
  defaultCustomerId?: string;
  onSuccess?: (claimId: string) => void;
}

export function AddClaimDialog({
  open,
  onOpenChange,
  defaultDriverId,
  defaultDriverName,
  defaultCustomerId,
  onSuccess,
}: AddClaimDialogProps) {
  const { toast } = useToast();

  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [driverSearchQuery, setDriverSearchQuery] = useState("");
  const [selectedDriverName, setSelectedDriverName] = useState(defaultDriverName ?? "");

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");

  const form = useForm<AddClaimFormData>({
    resolver: zodResolver(addClaimSchema),
    defaultValues: {
      accidentDate: "",
      status: "pending",
      driverId: defaultDriverId ?? "",
      customerId: "",
      location: "",
      policeReportFiled: "no",
      dodAtFault: "",
      vehicleInvolved: "",
      zendeskTicketNumber: "",
      incidentType: "",
      notesReceived: "",
    },
  });

  const { data: customerLookup } = useQuery<{ id: string; customerName: string } | null>({
    queryKey: ["/api/corporate/customers", defaultCustomerId],
    enabled: !!defaultCustomerId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        accidentDate: "",
        status: "pending",
        driverId: defaultDriverId ?? "",
        customerId: defaultCustomerId ?? "",
        location: "",
        policeReportFiled: "no",
        dodAtFault: "",
        vehicleInvolved: "",
        zendeskTicketNumber: "",
        incidentType: "",
        notesReceived: "",
      });
      setSelectedDriverName(defaultDriverName ?? "");
      setDriverSearchQuery("");
      setDriverPickerOpen(false);
      setCustomerSearchQuery("");
      setCustomerPickerOpen(false);
      setSelectedCustomerName("");
    }
  }, [open, defaultDriverId, defaultDriverName, defaultCustomerId]);

  useEffect(() => {
    if (customerLookup && open) {
      form.setValue("customerId", customerLookup.id);
      form.setValue("location", customerLookup.customerName);
      setSelectedCustomerName(customerLookup.customerName);
    }
  }, [customerLookup, open]);

  const { data: driverSearchResults = [], isLoading: driverSearchLoading } = useQuery<
    { id: string; displayName: string; employeeId: string | null; status: string }[]
  >({
    queryKey: [`/api/drivers/search?q=${encodeURIComponent(driverSearchQuery)}&active=true`],
    enabled: open,
  });

  const { data: customerSearchResults = [], isLoading: customerSearchLoading } = useQuery<
    { id: string; customerName: string; customerType: string | null }[]
  >({
    queryKey: [`/api/corporate/customers/search/drivershift?q=${encodeURIComponent(customerSearchQuery)}`],
    enabled: open,
  });

  const createClaimMutation = useMutation({
    mutationFn: async (data: AddClaimFormData) => {
      const res = await apiRequest("POST", "/api/corporate/accidents", {
        ...data,
        policeReportFiled: data.policeReportFiled === "yes",
      });
      return await res.json();
    },
    onSuccess: (result: any) => {
      const newId = result?.id ?? "";
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents"] });
      toast({
        title: "Claim Created",
        description: newId
          ? `Claim successfully created (ID: ${newId.substring(0, 8)}).`
          : "Claim successfully created.",
      });
      onOpenChange(false);
      onSuccess?.(newId);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create claim.",
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    onOpenChange(false);
    form.reset();
    setSelectedDriverName(defaultDriverName ?? "");
    setDriverSearchQuery("");
    setDriverPickerOpen(false);
    setSelectedCustomerName("");
    setCustomerSearchQuery("");
    setCustomerPickerOpen(false);
  };

  const isDriverLocked = !!defaultDriverId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Claim</DialogTitle>
          <DialogDescription>Enter the initial claim information below.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createClaimMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <FormField
                control={form.control}
                name="accidentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Date of Incident</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} max={todayDateString()} data-testid="input-accident-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VALID_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel required>Driver</FormLabel>
                    {isDriverLocked ? (
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                        {selectedDriverName || defaultDriverId}
                      </div>
                    ) : (
                      <Popover open={driverPickerOpen} onOpenChange={setDriverPickerOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={driverPickerOpen}
                              className="w-full justify-between font-normal"
                              data-testid="select-driver"
                            >
                              <span className={!field.value ? "text-muted-foreground" : ""}>
                                {field.value && selectedDriverName ? selectedDriverName : "Search for a driver…"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Type a name to search…"
                              value={driverSearchQuery}
                              onValueChange={setDriverSearchQuery}
                              data-testid="input-driver-search"
                            />
                            <CommandList>
                              {driverSearchLoading ? (
                                <div className="flex items-center justify-center p-4">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  <span className="text-sm text-muted-foreground">Searching…</span>
                                </div>
                              ) : driverSearchResults.length === 0 ? (
                                <CommandEmpty>No active drivers found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {driverSearchResults.map((driver) => (
                                    <CommandItem
                                      key={driver.id}
                                      value={driver.id}
                                      onSelect={() => {
                                        field.onChange(driver.id);
                                        setSelectedDriverName(driver.displayName);
                                        setDriverPickerOpen(false);
                                        setDriverSearchQuery("");
                                      }}
                                      data-testid={`option-driver-${driver.id}`}
                                    >
                                      <Check className={`mr-2 h-4 w-4 ${field.value === driver.id ? "opacity-100" : "opacity-0"}`} />
                                      <div className="flex flex-col">
                                        <span>{driver.displayName}</span>
                                        {driver.employeeId && (
                                          <span className="text-xs text-muted-foreground">ID: {driver.employeeId}</span>
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
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel required>Customer / Account</FormLabel>
                    <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={customerPickerOpen}
                            className="w-full justify-between font-normal"
                            data-testid="select-customer-account"
                          >
                            <span className={!field.value ? "text-muted-foreground" : ""}>
                              {field.value && selectedCustomerName ? selectedCustomerName : field.value || "Search for an account…"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Type an account name…"
                            value={customerSearchQuery}
                            onValueChange={setCustomerSearchQuery}
                            data-testid="input-customer-search"
                          />
                          <CommandList>
                            {customerSearchLoading ? (
                              <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                <span className="text-sm text-muted-foreground">Searching…</span>
                              </div>
                            ) : customerSearchResults.length === 0 ? (
                              <CommandEmpty>No active accounts found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {customerSearchResults.map((account) => (
                                  <CommandItem
                                    key={account.id}
                                    value={account.id}
                                    onSelect={() => {
                                      field.onChange(account.customerName);
                                      form.setValue("customerId", account.id);
                                      setSelectedCustomerName(account.customerName);
                                      setCustomerPickerOpen(false);
                                      setCustomerSearchQuery("");
                                    }}
                                    data-testid={`option-account-${account.id}`}
                                  >
                                    <Check className={`mr-2 h-4 w-4 ${field.value === account.customerName ? "opacity-100" : "opacity-0"}`} />
                                    <div className="flex flex-col">
                                      <span>{account.customerName}</span>
                                      {account.customerType && (
                                        <span className="text-xs text-muted-foreground capitalize">{account.customerType.replace(/_/g, " ")}</span>
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

              <FormField
                control={form.control}
                name="policeReportFiled"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Police Report</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-police-report">
                          <SelectValue placeholder="Police report filed?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dodAtFault"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DoD At Fault</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-dod-at-fault">
                          <SelectValue placeholder="Select fault status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vehicleInvolved"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle Involved</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter vehicle info" {...field} data-testid="input-vehicle" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="zendeskTicketNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZenDesk Ticket #</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter ticket number" {...field} data-testid="input-zendesk" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="incidentType"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Incident Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-incident-type">
                          <SelectValue placeholder="Select incident type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="collision">Collision</SelectItem>
                        <SelectItem value="property_damage">Property Damage</SelectItem>
                        <SelectItem value="injury">Injury</SelectItem>
                        <SelectItem value="theft">Theft</SelectItem>
                        <SelectItem value="vandalism">Vandalism</SelectItem>
                        <SelectItem value="careless_driving">Careless Driving</SelectItem>
                        <SelectItem value="hit_and_run">Hit and Run</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notesReceived"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes / Comments</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any additional notes or comments about this incident..."
                      className="min-h-[100px]"
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                data-testid="button-cancel-claim"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createClaimMutation.isPending}
                data-testid="button-submit-claim"
              >
                {createClaimMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Claim
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
