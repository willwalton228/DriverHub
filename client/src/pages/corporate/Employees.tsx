import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Users, Search, Loader2, Mail, Phone, MessageSquare, Plus, FileUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cleanPhone } from "@/lib/phone";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { PhoneInput } from "@/components/PhoneInput";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Employee } from "@shared/schema";

const addEmployeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/, "SSN must be in format XXX-XX-XXXX").optional().or(z.literal("")),
  email: z.string().email("Valid personal email is required"),
  workEmail: z.string().email("Valid work email is required"),
  phoneNumber: z.string()
    .min(1, "Mobile phone is required")
    .refine((v) => cleanPhone(v).length === 10, "Phone number must be 10 digits"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  position: z.string().min(1, "Job title is required"),
  department: z.string().min(1, "Department is required"),
  manager: z.string().min(1, "Manager is required"),
  employmentType: z.string().min(1, "Employment type is required"),
  employeeType: z.string().min(1, "Employee type is required"),
  hireDate: z.string().min(1, "Hire date is required"),
  annualSalary: z.string().optional(),
  hourlyRate: z.string().optional(),
  bonusEligible: z.string().min(1, "Bonus eligibility is required"),
  annualBonusPercentageTarget: z.string().optional(),
}).refine((data) => {
  if (data.employeeType === "Exempt (Salaried)" && !data.annualSalary) {
    return false;
  }
  return true;
}, {
  message: "Annual salary is required for exempt employees",
  path: ["annualSalary"],
}).refine((data) => {
  if (data.employeeType === "Non-Exempt (Hourly)" && !data.hourlyRate) {
    return false;
  }
  return true;
}, {
  message: "Hourly rate is required for non-exempt employees",
  path: ["hourlyRate"],
});

type AddEmployeeForm = z.infer<typeof addEmployeeSchema>;

export default function Employees() {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<string>("lastName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const form = useForm<AddEmployeeForm>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      ssn: "",
      email: "",
      workEmail: "",
      phoneNumber: "",
      dateOfBirth: "",
      position: "",
      department: "",
      manager: "",
      employmentType: "",
      employeeType: "",
      hireDate: "",
      annualSalary: "",
      hourlyRate: "",
      bonusEligible: "",
      annualBonusPercentageTarget: "",
    },
  });

  const employeeType = form.watch("employeeType");

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/corporate/employees"],
  });

  const { data: nextIdData } = useQuery<{ nextEmployeeId: string }>({
    queryKey: ["/api/corporate/employees/next-id"],
    enabled: addDialogOpen,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: AddEmployeeForm) => {
      // Convert numeric fields from strings to proper types
      const payload = {
        ...data,
        phoneNumber: cleanPhone(data.phoneNumber),
        annualSalary: data.annualSalary ? data.annualSalary : null,
        hourlyRate: data.hourlyRate ? data.hourlyRate : null,
        annualBonusPercentageTarget: data.annualBonusPercentageTarget ? data.annualBonusPercentageTarget : null,
        status: "Active", // Default status for new employees
      };
      const res = await apiRequest("POST", "/api/corporate/employees", payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create employee");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees/next-id"] });
      toast({ title: "Employee created successfully" });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create employee", description: error.message, variant: "destructive" });
    },
  });

  const onAddEmployee = (data: AddEmployeeForm) => {
    createEmployeeMutation.mutate(data);
  };

  const filteredEmployees = employees.filter((employee) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.toLowerCase();
    const firstName = (employee.firstName || "").toLowerCase();
    const lastName = (employee.lastName || "").toLowerCase();
    const email = (employee.email || "").toLowerCase();
    const phoneNumber = (employee.phoneNumber || "").toLowerCase();
    const employeeId = (employee.employeeId || "").toLowerCase();
    
    return (
      fullName.includes(search) ||
      firstName.includes(search) ||
      lastName.includes(search) ||
      email.includes(search) ||
      phoneNumber.includes(search) ||
      employeeId.includes(search)
    );
  });

  const calculateTenure = (hireDate: string | Date | null | undefined): string => {
    if (!hireDate) return "—";
    // parseDateSafe builds the Date in LOCAL time, avoiding the UTC-midnight shift
    // that `new Date("YYYY-MM-DD")` causes in US timezones (shows prior day).
    const hire = parseDateSafe(hireDate);
    const today = new Date();
    
    let years = today.getFullYear() - hire.getFullYear();
    let months = today.getMonth() - hire.getMonth();
    
    // If today's day is before the hire day, we haven't reached the monthly anniversary yet
    if (today.getDate() < hire.getDate()) {
      months--;
    }
    
    // Adjust if months is negative
    if (months < 0) {
      years--;
      months += 12;
    }
    
    // Handle case where years became negative (hire date is in the future)
    if (years < 0) {
      return "—";
    }
    
    if (years === 0 && months === 0) {
      return "< 1 month";
    }
    
    if (years === 0) {
      return `${months} month${months !== 1 ? "s" : ""}`;
    }
    
    if (months === 0) {
      return `${years} year${years !== 1 ? "s" : ""}`;
    }
    
    return `${years} year${years !== 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-employees" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">Employee Directory</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          View and manage all employees in the organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <CardTitle>All Employees</CardTitle>
              <CardDescription data-testid="text-employee-count">
                {filteredEmployees.length > pageSize 
                  ? `Showing ${pageSize} of ${filteredEmployees.length} employees`
                  : `${filteredEmployees.length} employee${filteredEmployees.length !== 1 ? "s" : ""}`}
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, phone, or employee ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-employees"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Search Options:</p>
                <ul className="text-sm space-y-0.5">
                  <li>• First or last name</li>
                  <li>• Email address</li>
                  <li>• Phone number</li>
                  <li>• Employee ID</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <Select
              value={sortField + "_" + sortDir}
              onValueChange={(val) => {
                const parts = val.split("_");
                const d = parts.pop() as "asc" | "desc";
                const f = parts.join("_");
                setSortField(f); setSortDir(d);
              }}
            >
              <SelectTrigger className="w-[160px]" data-testid="select-employee-sort">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastName_asc">Last Name A→Z</SelectItem>
                <SelectItem value="lastName_desc">Last Name Z→A</SelectItem>
                <SelectItem value="firstName_asc">First Name A→Z</SelectItem>
                <SelectItem value="status_asc">Status A→Z</SelectItem>
                <SelectItem value="role_asc">Role A→Z</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">Show:</span>
            <Select value={pageSize.toString()} onValueChange={(val) => setPageSize(Number(val))}>
              <SelectTrigger className="w-20" data-testid="select-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="75">75</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            {isSuperAdmin && (
              <Link href="/imports/employees">
                <Button variant="outline" data-testid="button-import-employees">
                  <FileUp className="h-4 w-4 mr-2" />
                  Import Employees
                </Button>
              </Link>
            )}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-employee">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Employee</DialogTitle>
                  <DialogDescription>
                    Enter the employee's information. Fields marked with * are required.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onAddEmployee)} className="space-y-4">
                    {/* Name Fields */}
                    <div className="grid grid-cols-3 gap-4">
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
                        name="middleName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Middle Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Michael" {...field} data-testid="input-middle-name" />
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
                      <FormField
                        control={form.control}
                        name="ssn"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Social Security Number</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="XXX-XX-XXXX" 
                                {...field} 
                                data-testid="input-ssn"
                                maxLength={11}
                                onChange={(e) => {
                                  let value = e.target.value.replace(/[^\d-]/g, '');
                                  // Auto-format SSN with dashes
                                  if (value.length > 0) {
                                    const digits = value.replace(/-/g, '');
                                    if (digits.length <= 3) {
                                      value = digits;
                                    } else if (digits.length <= 5) {
                                      value = `${digits.slice(0,3)}-${digits.slice(3)}`;
                                    } else {
                                      value = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5,9)}`;
                                    }
                                  }
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Email Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Personal Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="john.doe@personal.com" {...field} data-testid="input-personal-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="workEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Work Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="john.doe@company.com" {...field} data-testid="input-work-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Phone and DOB */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Mobile Phone</FormLabel>
                            <FormControl>
                              <PhoneInput
                                {...field}
                                data-testid="input-mobile-phone"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Date of Birth</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-date-of-birth" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Employee ID (auto-assigned) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <FormLabel>Employee ID (Auto-assigned)</FormLabel>
                        <Input 
                          value={nextIdData?.nextEmployeeId || "Loading..."} 
                          disabled 
                          className="mt-2 bg-muted"
                          data-testid="input-employee-id-preview"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Assigned when employee is created</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="position"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Job Title</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Operations Manager" {...field} data-testid="input-job-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Department and Manager */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Department</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Operations" {...field} data-testid="input-department" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="manager"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Manager</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Jane Smith" {...field} data-testid="input-manager" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Employment Type and Employee Type */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Employment Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-employment-type">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Full Time">Full Time</SelectItem>
                                <SelectItem value="Part Time">Part Time</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="employeeType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Employee Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-employee-type">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Exempt (Salaried)">Exempt (Salaried)</SelectItem>
                                <SelectItem value="Non-Exempt (Hourly)">Non-Exempt (Hourly)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Hire Date */}
                    <FormField
                      control={form.control}
                      name="hireDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Hire Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-hire-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional Salary/Rate Fields */}
                    {employeeType === "Exempt (Salaried)" && (
                      <FormField
                        control={form.control}
                        name="annualSalary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Annual Salary</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="e.g., 75000" {...field} data-testid="input-annual-salary" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {employeeType === "Non-Exempt (Hourly)" && (
                      <FormField
                        control={form.control}
                        name="hourlyRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Hourly Rate</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="e.g., 25.00" {...field} data-testid="input-hourly-rate" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Bonus Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="bonusEligible"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Bonus Eligible</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-bonus-eligible">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Yes">Yes</SelectItem>
                                <SelectItem value="No">No</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="annualBonusPercentageTarget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Annual Bonus % Target</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="e.g., 10" {...field} data-testid="input-bonus-target" />
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
                      <Button type="submit" disabled={createEmployeeMutation.isPending} data-testid="button-create-employee">
                        {createEmployeeMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Create Employee"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEmployees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-employees">
                {employees.length === 0 ? "No employees found" : "No employees match your search"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...filteredEmployees].sort((a, b) => {
                const dir = sortDir === "asc" ? 1 : -1;
                if (sortField === "lastName") return dir * ((a.lastName || "").localeCompare(b.lastName || ""));
                if (sortField === "firstName") return dir * ((a.firstName || "").localeCompare(b.firstName || ""));
                if (sortField === "status") return dir * ((a.status || "").localeCompare(b.status || ""));
                if (sortField === "role") return dir * ((a.role || "").localeCompare(b.role || ""));
                return 0;
              }).slice(0, pageSize).map((employee, index) => (
                <Link key={employee.id} href={`/employees/${employee.id}`}>
                  <div
                    className="border border-border rounded-lg px-4 py-3 hover-elevate"
                    data-testid={`card-employee-${index}`}
                  >
                    <div className="flex items-center gap-4">
                      <UserAvatar
                        photoUrl={employee.profilePhotoUrl}
                        firstName={employee.firstName}
                        lastName={employee.lastName}
                        email={employee.email}
                        size="md"
                        className="flex-shrink-0"
                        data-testid={`avatar-employee-${index}`}
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm" data-testid={`text-employee-name-${index}`}>
                            {employee.firstName && employee.lastName
                              ? `${employee.firstName} ${employee.lastName}`
                              : employee.email}
                          </h3>
                          <StatusBadge status={employee.status || "active"} data-testid={`badge-status-${index}`} />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          {employee.email && (
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`mailto:${employee.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                                    data-testid={`button-email-${index}`}
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Send email via Outlook</TooltipContent>
                              </Tooltip>
                              <span className="truncate max-w-[200px]">{employee.email}</span>
                            </div>
                          )}
                          {employee.phoneNumber && (
                            <div className="flex items-center gap-1 ml-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://phone.aircall.io/?phone=${cleanPhone(employee.phoneNumber)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                                    data-testid={`button-call-${index}`}
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Call via Aircall</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://app.heymarket.com/conversations/new?phone=${cleanPhone(employee.phoneNumber)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                                    data-testid={`button-text-${index}`}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Text via Heymarket</TooltipContent>
                              </Tooltip>
                              <PhoneDisplay
                                phone={employee.phoneNumber}
                                className="truncate max-w-[140px]"
                                data-testid={`text-phone-${index}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground flex-shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-center min-w-[80px]" data-testid={`stat-location-${index}`}>
                              <div className="font-semibold text-foreground truncate">
                                {employee.city || "—"}
                              </div>
                              <div className="text-xs">{employee.state || "location"}</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Employee location</TooltipContent>
                        </Tooltip>

                        <div className="text-muted-foreground min-w-[100px]" data-testid={`stat-hired-${index}`}>
                          <span>Hired: </span>
                          <span className="text-foreground">
                            {employee.hireDate 
                              ? formatDate(employee.hireDate)
                              : "—"
                            }
                          </span>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-center min-w-[120px]" data-testid={`stat-tenure-${index}`}>
                              <div className="font-semibold text-foreground">
                                {calculateTenure(employee.hireDate)}
                              </div>
                              <div className="text-xs">tenure</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Time with company</TooltipContent>
                        </Tooltip>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                        data-testid={`button-view-employee-${index}`}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
