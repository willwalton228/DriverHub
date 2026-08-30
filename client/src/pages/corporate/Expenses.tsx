import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/dateFormat";
import { Loader2, CheckCircle, XCircle, DollarSign, Receipt, Truck, Users, Filter, Clock, History, AlertCircle, Plus, ArrowLeft, Calendar, Check, MoreHorizontal, Send, Edit, Trash2, Paperclip, Download, Eye, X, ChevronDown, Home } from "lucide-react";
import { format } from "date-fns";
import { type Expense, type Customer, EMPLOYEE_EXPENSE_CATEGORIES } from "@shared/schema";
import { useState, useMemo } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface CategoryBreakdown {
  category: string;
  amount: number;
}

interface ExpenseSummary {
  draft: { count: number; total: number; avgAgeDays: number; expenses: string[] };
  pending: { count: number; total: number; avgAgeDays: number; expenses: string[] };
  approved: {
    all: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    mtd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    qtd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    ytd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
  };
  reimbursed: {
    all: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    mtd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    qtd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
    ytd: { count: number; total: number; expenses: string[]; byCategory: CategoryBreakdown[] };
  };
}

type DrillDownLevel = 'dashboard' | 'status-list' | 'expense-detail';
type TimeframePeriod = 'all' | 'mtd' | 'qtd' | 'ytd';

interface DrillDownState {
  level: DrillDownLevel;
  statusFilter?: string;
  expenseId?: string;
  history: Array<{ level: DrillDownLevel; statusFilter?: string; expenseId?: string }>;
}
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ServerUploader } from "@/components/ServerUploader";

interface ExpenseApproval {
  id: string;
  expenseId: string;
  stage: string;
  approverId: string | null;
  status: string;
  notes: string | null;
  decisionAt: string | null;
  createdAt: string | null;
}

interface ExpenseWithApprovals extends Expense {
  approvals?: ExpenseApproval[];
  submitterName?: string;
  customerName?: string;
  driverClassification?: string;
  submissionDate?: string;
}

import { getStatusBadgeClass } from "@/lib/statusColors";
import { rechartsTooltipStyle } from "@/lib/chartUtils";
function getStatusColor(status: string | null): string {
  return getStatusBadgeClass(status);
}

function getApprovalStageLabel(stage: string | null): string {
  switch (stage) {
    case 'manager': return 'Awaiting Manager';
    case 'coo': return 'Awaiting COO';
    case 'executive': return 'Awaiting Executive';
    case 'completed': return 'Approved';
    default: return stage || 'Pending';
  }
}

function getExpenseTypeColor(expenseType: string | null): string {
  switch (expenseType) {
    case 'driver': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'employee': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    default: return '';
  }
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    fuel: "Fuel",
    tolls: "Tolls",
    oil: "Oil",
    parking: "Parking",
    maintenance: "Maintenance",
    airfare: "Airfare",
    meals_breakfast: "Meals - Breakfast",
    meals_lunch: "Meals - Lunch",
    meals_dinner: "Meals - Dinner",
    meals_entertainment: "Meals - Entertainment",
    hotel: "Hotel",
    rideshare_taxi: "Ride Share/Taxi",
    mileage: "Mileage",
    office_supplies: "Office Supplies",
    shipping: "Shipping",
    software_subscription: "Software Subscription",
    consulting_services: "Consulting Services",
    other: "Other",
  };
  return labels[category] || category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
}

function ApprovalHistoryDialog({ expense }: { expense: ExpenseWithApprovals }) {
  const { data: approvals = [], isLoading } = useQuery<ExpenseApproval[]>({
    queryKey: ['/api/corporate/expenses', expense.id, 'approvals'],
    enabled: !!expense.id,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`button-history-${expense.id}`}>
          <History className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approval History</DialogTitle>
          <DialogDescription>
            Review the approval timeline for this expense
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : approvals.length === 0 ? (
            <p className="text-center text-muted-foreground">No approval history yet</p>
          ) : (
            <div className="space-y-3">
              {approvals.map((approval) => (
                <div key={approval.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <Badge className={approval.status === 'approved' ? 'bg-green-100 text-green-800' : approval.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                      {approval.status === 'approved' ? 'Approved' : approval.status === 'rejected' ? 'Rejected' : 'Pending'}
                    </Badge>
                    <span className="text-sm text-muted-foreground capitalize">{approval.stage} Level</span>
                  </div>
                  {approval.decisionAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(approval.decisionAt)}
                    </p>
                  )}
                  {approval.notes && (
                    <p className="text-sm mt-2 bg-muted p-2 rounded">{approval.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ expense, onApprove }: { expense: ExpenseWithApprovals; onApprove: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    onApprove(notes);
    setNotes("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`button-approve-expense-${expense.id}`}>
          <CheckCircle className="w-4 h-4 text-green-600" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Expense</DialogTitle>
          <DialogDescription>
            Approve ${parseFloat(expense.amount || '0').toFixed(2)} for {getCategoryLabel(expense.category)}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Textarea
            placeholder="Add any notes for this approval..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ expense, onReject }: { expense: ExpenseWithApprovals; onReject: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (!notes.trim()) {
      return;
    }
    onReject(notes);
    setNotes("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`button-reject-expense-${expense.id}`}>
          <XCircle className="w-4 h-4 text-red-600" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Expense</DialogTitle>
          <DialogDescription>
            Reject ${parseFloat(expense.amount || '0').toFixed(2)} for {getCategoryLabel(expense.category)}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium">Reason for rejection (required)</label>
          <Textarea
            placeholder="Explain why this expense is being rejected..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2"
            required
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            variant="destructive"
            disabled={!notes.trim()}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const addExpenseFormSchema = z.object({
  expenseDate: z.string().min(1, "Date of Expense is required"),
  category: z.string().min(1, "Type of Expense is required"),
  customerName: z.string().min(1, "Associated Customer is required"),
  card: z.string().min(1, "Card is required"),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Amount must be greater than 0"
  ),
  notes: z.string().min(1, "Notes are required"),
});

type AddExpenseFormData = z.infer<typeof addExpenseFormSchema>;

interface Attendee {
  name: string;
  title: string;
  businessName: string;
}

interface DraftExpense {
  id: string;
  expenseDate: string;
  category: string;
  associatedCustomer: string | null;
  cardType: string | null;
  amount: string;
  description: string;
  attendees?: Attendee[];
  receiptUrl?: string | null;
  status: string;
}

function AddExpenseScreen({ 
  userName, 
  onBack,
  onSuccess 
}: { 
  userName: string; 
  onBack: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [editingExpense, setEditingExpense] = useState<DraftExpense | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<DraftExpense | null>(null);
  const [attendeesDialogOpen, setAttendeesDialogOpen] = useState(false);
  const [currentAttendees, setCurrentAttendees] = useState<Attendee[]>([]);
  const [newAttendee, setNewAttendee] = useState<Attendee>({ name: "", title: "", businessName: "" });
  const [currentReceiptUrl, setCurrentReceiptUrl] = useState<string | null>(null);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  const { data: draftExpenses = [], isLoading: draftsLoading } = useQuery<DraftExpense[]>({
    queryKey: ["/api/my/expenses/drafts"],
  });

  const createDraftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/my/expenses/drafts", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save expense");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
      toast({ title: "Expense added to draft list" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save expense", description: error.message, variant: "destructive" });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/my/expenses/drafts/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
      toast({ title: "Expense updated" });
    },
    onError: () => {
      toast({ title: "Failed to update expense", variant: "destructive" });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/my/expenses/drafts/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
      toast({ title: "Expense removed" });
    },
    onError: () => {
      toast({ title: "Failed to delete expense", variant: "destructive" });
    },
  });

  const submitDraftsMutation = useMutation({
    mutationFn: async (expenseIds: string[]) => {
      const res = await apiRequest("POST", "/api/my/expenses/drafts/submit", { expenseIds });
      return await res.json();
    },
    onSuccess: (data: { submittedCount: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/expenses"] });
      if (data.submittedCount > 0) {
        toast({ title: "Success", description: `${data.submittedCount} expense(s) submitted successfully` });
        onSuccess();
      } else {
        toast({ title: "No expenses submitted", description: "No valid draft expenses to submit", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to submit expenses", variant: "destructive" });
    },
  });

  const isSubmitting = submitDraftsMutation.isPending;

  const form = useForm<AddExpenseFormData>({
    resolver: zodResolver(addExpenseFormSchema),
    defaultValues: {
      expenseDate: "",
      category: "",
      customerName: "",
      card: "",
      amount: "",
      notes: "",
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const getCategoryDisplayLabel = (cat: string) => {
    const labels: Record<string, string> = {
      airfare: "Airfare",
      meals_breakfast: "Meals - Breakfast",
      meals_lunch: "Meals - Lunch",
      meals_dinner: "Meals - Dinner",
      meals_entertainment: "Meals - Entertainment",
      hotel: "Hotel",
      tolls: "Tolls",
      parking: "Parking",
      rideshare_taxi: "Ride Share/Taxi",
      mileage: "Mileage",
      office_supplies: "Office Supplies",
      shipping: "Shipping",
      software_subscription: "Software Subscription",
      consulting_services: "Consulting Services",
      other: "Other",
    };
    return labels[cat] || cat;
  };

  const runningTotal = draftExpenses.reduce(
    (sum, exp) => sum + parseFloat(exp.amount || "0"),
    0
  );

  const addAttendee = () => {
    if (newAttendee.name.trim()) {
      setCurrentAttendees((prev) => [...prev, { ...newAttendee }]);
      setNewAttendee({ name: "", title: "", businessName: "" });
    }
  };

  const removeAttendee = (index: number) => {
    setCurrentAttendees((prev) => prev.filter((_, i) => i !== index));
  };

  const onAddExpense = (data: AddExpenseFormData) => {
    if (data.category === "meals_entertainment" && currentAttendees.length === 0 && !editingExpense) {
      setAttendeesDialogOpen(true);
      return;
    }

    const expenseData = {
      expenseDate: data.expenseDate,
      category: data.category,
      associatedCustomer: data.customerName,
      cardType: data.card,
      amount: data.amount,
      description: data.notes || "Expense submission",
      expenseType: "employee",
      attendees: data.category === "meals_entertainment" ? currentAttendees : undefined,
      receiptUrl: currentReceiptUrl || undefined,
    };

    if (editingExpense) {
      updateDraftMutation.mutate({ id: editingExpense.id, data: expenseData });
      setEditingExpense(null);
    } else {
      createDraftMutation.mutate(expenseData);
    }
    
    setCurrentAttendees([]);
    setCurrentReceiptUrl(null);
    form.reset();
  };

  const handleEditExpense = (expense: DraftExpense) => {
    setEditingExpense(expense);
    form.setValue("expenseDate", expense.expenseDate);
    form.setValue("category", expense.category);
    form.setValue("customerName", expense.associatedCustomer || "");
    form.setValue("card", expense.cardType || "");
    form.setValue("amount", expense.amount);
    form.setValue("notes", expense.description || "");
    setCurrentAttendees((expense.attendees as Attendee[]) || []);
    setCurrentReceiptUrl(expense.receiptUrl || null);
    setActionDialogOpen(false);
  };

  const handleDeleteExpense = (id: string) => {
    deleteDraftMutation.mutate(id);
    setActionDialogOpen(false);
  };

  const handleSubmitAll = async () => {
    if (draftExpenses.length === 0) return;
    const expenseIds = draftExpenses.map(exp => exp.id);
    submitDraftsMutation.mutate(expenseIds);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }} 
          data-testid="button-back-expenses"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-add-expense-title">
            Add Expense
          </h1>
          <p className="text-muted-foreground mt-1">
            Add expenses to your list, then submit all at once
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6">
            <p className="text-sm text-muted-foreground">Submitted By</p>
            <p className="font-medium text-lg" data-testid="text-submitter-name">{userName}</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddExpense)}>
              <div className="flex flex-wrap gap-3 items-end">
                <FormField
                  control={form.control}
                  name="expenseDate"
                  render={({ field }) => (
                    <FormItem className="w-[140px]">
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          max={new Date().toISOString().split('T')[0]}
                          data-testid="input-expense-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem className="w-[180px]">
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-expense-type">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMPLOYEE_EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {getCategoryDisplayLabel(cat)}
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
                  name="customerName"
                  render={({ field }) => {
                    const activeCustomers = customers.filter(c => c.status === 'active');
                    const specialOptions = [
                      { value: "Sales Prospecting", label: "Sales Prospecting" },
                      { value: "Previous Customer", label: "Previous Customer" },
                      { value: "Trade Show", label: "Trade Show" },
                      { value: "Other Business Travel", label: "Other Business Travel" },
                    ];
                    return (
                      <FormItem className="w-[180px]">
                        <FormLabel>Customer</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-customer">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {specialOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                            {activeCustomers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.customerName}>
                                {customer.customerName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="card"
                  render={({ field }) => (
                    <FormItem className="w-[100px]">
                      <FormLabel>Card</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-card">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Company">Company</SelectItem>
                          <SelectItem value="Personal">Personal</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => {
                    const [displayValue, setDisplayValue] = useState(field.value || '');
                    const [isFocused, setIsFocused] = useState(false);
                    
                    const formatForDisplay = (value: string) => {
                      const num = parseFloat(value.replace(/[^0-9.]/g, ''));
                      if (isNaN(num) || num === 0) return '';
                      return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    };
                    
                    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '');
                      setDisplayValue(raw);
                      field.onChange(raw);
                    };
                    
                    const handleFocus = () => {
                      setIsFocused(true);
                      setDisplayValue(field.value || '');
                    };
                    
                    const handleBlur = () => {
                      setIsFocused(false);
                      if (field.value) {
                        const num = parseFloat(field.value.replace(/[^0-9.]/g, ''));
                        if (!isNaN(num)) {
                          field.onChange(num.toFixed(2));
                          setDisplayValue(num.toFixed(2));
                        }
                      }
                    };
                    
                    return (
                      <FormItem className="w-[120px]">
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={isFocused ? displayValue : formatForDisplay(field.value)}
                            onChange={handleChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            placeholder="$0.00"
                            data-testid="input-expense-amount"
                            className="[appearance:textfield]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[150px]">
                      <FormLabel>Notes</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Add notes..."
                            data-testid="input-expense-notes"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                form.handleSubmit(onAddExpense)();
                              }
                            }}
                          />
                        </FormControl>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <ServerUploader
                                maxFileSize={5242880}
                                allowedFileTypes={["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]}
                                buttonVariant={currentReceiptUrl ? "default" : "outline"}
                                testId="button-upload-receipt"
                                onComplete={(result) => {
                                  if (result.objectPath) {
                                    setCurrentReceiptUrl(result.objectPath);
                                  }
                                }}
                                onError={(error) => {
                                  console.error("Receipt upload failed:", error);
                                }}
                              >
                                <Receipt className="h-4 w-4" />
                              </ServerUploader>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {currentReceiptUrl ? "Receipt attached" : "Attach receipt"}
                          </TooltipContent>
                        </Tooltip>
                        <Button type="submit" size="icon" data-testid="button-add-expense-line">
                          {editingExpense ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>

          {draftExpenses.length > 0 && (
            <div className="mt-6 border-t pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Unsubmitted Expenses</h3>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Running Total</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-running-total">
                    ${runningTotal.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {draftExpenses.map((expense) => (
                  <div 
                    key={expense.id} 
                    className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center py-3 px-4 bg-muted/50 rounded-lg"
                    data-testid={`expense-row-${expense.id}`}
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-medium">{format(new Date(expense.expenseDate), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium">{getCategoryDisplayLabel(expense.category)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p className="font-medium">{expense.associatedCustomer || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="font-medium">${parseFloat(expense.amount).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="font-medium truncate">{expense.description || "—"}</p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedExpense(expense);
                          setActionDialogOpen(true);
                        }}
                        data-testid={`button-action-${expense.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4 mr-1" />
                        Edit / Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleSubmitAll}
                  disabled={isSubmitting}
                  size="lg"
                  data-testid="button-submit-all-expenses"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit All Expenses ({draftExpenses.length})
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit or Delete Expense</DialogTitle>
            <DialogDescription>
              What would you like to do with this expense?
            </DialogDescription>
          </DialogHeader>
          {selectedExpense && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">Selected Expense:</p>
              <p className="font-medium">
                {format(new Date(selectedExpense.expenseDate), "MMM d, yyyy")} - {getCategoryDisplayLabel(selectedExpense.category)} - ${parseFloat(selectedExpense.amount).toFixed(2)}
              </p>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => selectedExpense && handleEditExpense(selectedExpense)}
              data-testid="button-edit-expense"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedExpense && handleDeleteExpense(selectedExpense.id)}
              data-testid="button-delete-expense"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attendeesDialogOpen} onOpenChange={setAttendeesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Attendees</DialogTitle>
            <DialogDescription>
              For Meals - Entertainment expenses, please add the attendees who were present.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="attendee-name">Name</Label>
                <Input
                  id="attendee-name"
                  placeholder="Attendee name"
                  value={newAttendee.name}
                  onChange={(e) => setNewAttendee((prev) => ({ ...prev, name: e.target.value }))}
                  data-testid="input-attendee-name"
                />
              </div>
              <div>
                <Label htmlFor="attendee-title">Title</Label>
                <Input
                  id="attendee-title"
                  placeholder="Job title"
                  value={newAttendee.title}
                  onChange={(e) => setNewAttendee((prev) => ({ ...prev, title: e.target.value }))}
                  data-testid="input-attendee-title"
                />
              </div>
              <div>
                <Label htmlFor="attendee-business">Business Name</Label>
                <Input
                  id="attendee-business"
                  placeholder="Company"
                  value={newAttendee.businessName}
                  onChange={(e) => setNewAttendee((prev) => ({ ...prev, businessName: e.target.value }))}
                  data-testid="input-attendee-business"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addAttendee}
              disabled={!newAttendee.name.trim()}
              data-testid="button-add-attendee"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Attendee
            </Button>

            {currentAttendees.length > 0 && (
              <div className="mt-4">
                <Label>Added Attendees ({currentAttendees.length})</Label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {currentAttendees.map((attendee, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                      <div className="text-sm">
                        <span className="font-medium">{attendee.name}</span>
                        {attendee.title && <span className="text-muted-foreground"> - {attendee.title}</span>}
                        {attendee.businessName && <span className="text-muted-foreground"> ({attendee.businessName})</span>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttendee(index)}
                        data-testid={`button-remove-attendee-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAttendeesDialogOpen(false);
                setCurrentAttendees([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAttendeesDialogOpen(false);
                form.handleSubmit(onAddExpense)();
              }}
              disabled={currentAttendees.length === 0}
              data-testid="button-confirm-attendees"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm & Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ExpenseAlertData {
  hasOpenExpenses: boolean;
  overdueCount: number;
  message: string;
  userType: "driver" | "employee";
}

export default function Expenses() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'driver' | 'employee' | 'my-approval'>('all');
  const [showAddExpense, setShowAddExpense] = useState(false);
  
  // Timeframe selectors for Approved and Reimbursed widgets
  const [approvedPeriod, setApprovedPeriod] = useState<TimeframePeriod>('all');
  const [reimbursedPeriod, setReimbursedPeriod] = useState<TimeframePeriod>('all');
  
  // Drill-down state
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'dashboard',
    history: [],
  });

  const { data: allExpenses = [], isLoading } = useQuery<ExpenseWithApprovals[]>({
    queryKey: ['/api/corporate/expenses'],
  });
  
  // Fetch expense summary for dashboard widgets
  const { data: expenseSummary } = useQuery<ExpenseSummary>({
    queryKey: ['/api/corporate/expenses/summary'],
  });

  const { data: pendingMyApproval = [], isLoading: pendingLoading } = useQuery<ExpenseWithApprovals[]>({
    queryKey: ['/api/corporate/expenses/pending-approval'],
    enabled: !!user,
  });

  const { data: expenseAlert } = useQuery<ExpenseAlertData>({
    queryKey: ['/api/me/expense-alerts'],
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return await apiRequest('POST', `/api/corporate/expenses/${id}/approve`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/expenses/pending-approval'] });
      toast({ title: "Expense approved", description: "The expense has been advanced to the next approval stage" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      return await apiRequest('POST', `/api/corporate/expenses/${id}/reject`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/expenses/pending-approval'] });
      toast({ title: "Expense rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await apiRequest('PATCH', `/api/corporate/expenses/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/expenses'] });
      toast({ title: "Expense status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const handleApprove = (id: string, notes: string) => {
    approveMutation.mutate({ id, notes });
  };

  const handleReject = (id: string, notes: string) => {
    rejectMutation.mutate({ id, notes });
  };

  const handleReimburse = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'reimbursed' });
  };

  // Drill-down navigation helpers
  const handleDrillToStatus = (statusFilter: string) => {
    setDrillDown(prev => ({
      level: 'status-list',
      statusFilter,
      history: [...prev.history, { level: prev.level, statusFilter: prev.statusFilter, expenseId: prev.expenseId }],
    }));
  };

  const handleDrillToExpense = (expenseId: string) => {
    setDrillDown(prev => ({
      level: 'expense-detail',
      expenseId,
      statusFilter: prev.statusFilter,
      history: [...prev.history, { level: prev.level, statusFilter: prev.statusFilter, expenseId: prev.expenseId }],
    }));
  };

  const handleDrillBack = () => {
    setDrillDown(prev => {
      const history = [...prev.history];
      const lastState = history.pop();
      if (lastState) {
        return { ...lastState, history };
      }
      return { level: 'dashboard', history: [] };
    });
  };

  const handleJumpToDashboard = () => {
    setDrillDown({ level: 'dashboard', history: [] });
  };

  // Get filtered expenses based on drill-down status
  const getFilteredExpensesByStatus = (statusFilter: string) => {
    switch (statusFilter) {
      case 'draft':
        return allExpenses.filter(e => e.status === 'draft');
      case 'pending':
        // Pending Approval - approval stage other than Not-Submitted, Fully Approved, or Reimbursed
        return allExpenses.filter(e => {
          if (e.status === 'draft') return false;
          if (e.status === 'approved' || e.currentApprovalStage === 'completed') return false;
          if (e.status === 'reimbursed') return false;
          return e.currentApprovalStage && e.currentApprovalStage !== 'completed';
        });
      case 'approved':
        // Filter by timeframe - include status 'approved' OR currentApprovalStage 'completed' (Fully Approved)
        const approvedExpenses = allExpenses.filter(e => e.status === 'approved' || e.currentApprovalStage === 'completed');
        return filterByTimeframe(approvedExpenses, approvedPeriod);
      case 'reimbursed':
        const reimbursedExpenses = allExpenses.filter(e => e.status === 'reimbursed');
        return filterByTimeframe(reimbursedExpenses, reimbursedPeriod);
      default:
        return allExpenses;
    }
  };

  const filterByTimeframe = (expenses: ExpenseWithApprovals[], period: TimeframePeriod) => {
    if (period === 'all') {
      return expenses;
    }
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'mtd':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'qtd':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return expenses.filter(e => {
      const expenseDate = e.approvalDate ? new Date(e.approvalDate) : 
                         e.reimbursementDate ? new Date(e.reimbursementDate) :
                         new Date(e.createdAt || e.expenseDate);
      return expenseDate >= startDate;
    });
  };

  const getPeriodLabel = (period: TimeframePeriod) => {
    switch (period) {
      case 'all': return 'All Time';
      case 'mtd': return 'Month to Date';
      case 'qtd': return 'Quarter to Date';
      case 'ytd': return 'Year to Date';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Not-Submitted';
      case 'pending': return 'Pending Approval';
      case 'approved': return 'Approved';
      case 'reimbursed': return 'Reimbursed';
      default: return status;
    }
  };

  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User' : 'User';

  if (showAddExpense) {
    return (
      <AddExpenseScreen 
        userName={userName}
        onBack={() => setShowAddExpense(false)}
        onSuccess={() => setShowAddExpense(false)}
      />
    );
  }

  const driverExpenses = allExpenses.filter(e => e.expenseType === 'driver');
  const employeeExpenses = allExpenses.filter(e => e.expenseType === 'employee');

  // Format amount with proper currency format
  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);
  };

  // Determine if expense is submitted (not pending means it's been submitted)
  const isSubmitted = (status: string | null) => {
    return status && status !== 'pending';
  };

  // Get approval queue description
  const getApprovalQueueDescription = (expense: ExpenseWithApprovals) => {
    if (expense.status === 'approved' || expense.status === 'reimbursed' || expense.currentApprovalStage === 'completed') {
      return "Fully Approved";
    }
    if (expense.status === 'rejected') {
      return "Rejected";
    }
    switch (expense.currentApprovalStage) {
      case 'manager': return "Manager Queue";
      case 'coo': return "COO Queue";
      case 'executive': return "Exec Queue";
      default: return expense.currentApprovalStage || "Pending";
    }
  };

  const renderExpenseTable = (expenses: ExpenseWithApprovals[], showApprovalActions = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Submitter</TableHead>
          <TableHead className="w-[100px]">Date</TableHead>
          <TableHead className="w-[120px]">Status</TableHead>
          <TableHead className="w-[200px]">Customer Associated</TableHead>
          <TableHead className="w-[110px]">Total Amount</TableHead>
          <TableHead className="w-[130px]">Approval Stage</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {expenses.map((expense) => (
          <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
            <TableCell className="truncate max-w-[100px]" data-testid={`text-submitter-${expense.id}`}>
              {expense.submitterName ? expense.submitterName.substring(0, 9) : 'Unknown'}
            </TableCell>
            <TableCell data-testid={`text-expense-date-${expense.id}`}>
              {expense.submissionDate 
                ? format(new Date(expense.submissionDate), 'MM/dd/yyyy')
                : expense.expenseDate 
                  ? formatDate(expense.expenseDate) 
                  : 'N/A'}
            </TableCell>
            <TableCell data-testid={`text-expense-status-${expense.id}`}>
              <Badge className={isSubmitted(expense.status) 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}>
                {isSubmitted(expense.status) ? 'Submitted' : 'Not Submitted'}
              </Badge>
            </TableCell>
            <TableCell className="truncate max-w-[200px]" data-testid={`text-customer-${expense.id}`}>
              {expense.customerName ? expense.customerName.substring(0, 24) : '—'}
            </TableCell>
            <TableCell data-testid={`text-expense-amount-${expense.id}`}>
              {formatCurrency(expense.amount || '0')}
            </TableCell>
            <TableCell>
              <span 
                className={`text-sm truncate block max-w-[130px] ${
                  expense.status === 'approved' || expense.status === 'reimbursed' 
                    ? 'text-green-600' 
                    : expense.status === 'rejected' 
                      ? 'text-red-600' 
                      : 'text-muted-foreground'
                }`}
                data-testid={`text-approval-stage-${expense.id}`}
              >
                {getApprovalQueueDescription(expense)}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {showApprovalActions && (expense.status === 'pending' || expense.status === 'in_approval') && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <ApproveDialog 
                            expense={expense} 
                            onApprove={(notes) => handleApprove(expense.id, notes)}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Approve this expense to advance it to the next approval stage</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <RejectDialog 
                            expense={expense} 
                            onReject={(notes) => handleReject(expense.id, notes)}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reject this expense and send it back to the submitter</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                {!showApprovalActions && expense.status === 'approved' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReimburse(expense.id)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-reimburse-expense-${expense.id}`}
                      >
                        <DollarSign className="w-4 h-4 text-blue-600" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mark this expense as reimbursed to the employee</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <ApprovalHistoryDialog expense={expense} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View the complete approval history and notes for this expense</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {expenseAlert?.hasOpenExpenses && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950" data-testid="alert-expense-overdue">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-semibold">Action Required: Submit Your Expenses</AlertTitle>
          <AlertDescription>
            <p>{expenseAlert.message}</p>
            <p className="mt-2 text-sm">
              {expenseAlert.userType === "driver" 
                ? "Driver expenses should be submitted daily." 
                : "Employee expenses should be submitted by Monday afternoon each week."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Expenses</h1>
          <p className="text-muted-foreground mt-2">
            Review, approve, and manage expense submissions
          </p>
        </div>
        <Button onClick={() => setShowAddExpense(true)} data-testid="button-add-expense">
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="my-approval" data-testid="tab-my-approval" className="relative">
            <AlertCircle className="w-4 h-4 mr-2" />
            My Approval ({pendingMyApproval.length})
            {pendingMyApproval.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingMyApproval.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-expenses">
            <Filter className="w-4 h-4 mr-2" />
            All ({allExpenses.length})
          </TabsTrigger>
          <TabsTrigger value="driver" data-testid="tab-driver-expenses">
            <Truck className="w-4 h-4 mr-2" />
            Driver ({driverExpenses.length})
          </TabsTrigger>
          <TabsTrigger value="employee" data-testid="tab-employee-expenses">
            <Users className="w-4 h-4 mr-2" />
            Employee ({employeeExpenses.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Not-Submitted Widget - All Time with Average Age */}
            <Card 
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => handleDrillToStatus('draft')}
              data-testid="card-not-submitted"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Not-Submitted</CardTitle>
                <Edit className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-not-submitted-total">
                  ${(expenseSummary?.draft.total || 0).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {expenseSummary?.draft.count || 0} draft expenses
                </p>
                {(expenseSummary?.draft.avgAgeDays || 0) > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1" data-testid="text-draft-avg-age">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Avg. age: {expenseSummary?.draft.avgAgeDays} days
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Pending Approval Widget - All Time with Average Age */}
            <Card 
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => handleDrillToStatus('pending')}
              data-testid="card-pending-approval"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-pending-total">
                  ${(expenseSummary?.pending.total || 0).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {expenseSummary?.pending.count || 0} expenses in approval workflow
                </p>
                {(expenseSummary?.pending.avgAgeDays || 0) > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1" data-testid="text-pending-avg-age">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Avg. age: {expenseSummary?.pending.avgAgeDays} days
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Approved Widget - MTD/QTD/YTD Selectable */}
            <Card 
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => handleDrillToStatus('approved')}
              data-testid="card-approved"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="dropdown-approved-period">
                      {approvedPeriod.toUpperCase()}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setApprovedPeriod('all')} data-testid="option-approved-all">
                      All Time
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setApprovedPeriod('mtd')} data-testid="option-approved-mtd">
                      MTD (Month to Date)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setApprovedPeriod('qtd')} data-testid="option-approved-qtd">
                      QTD (Quarter to Date)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setApprovedPeriod('ytd')} data-testid="option-approved-ytd">
                      YTD (Year to Date)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-approved-total">
                  ${(expenseSummary?.approved[approvedPeriod]?.total || 0).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {expenseSummary?.approved[approvedPeriod]?.count || 0} expenses fully approved
                </p>
                {/* Pie Chart by Category */}
                {expenseSummary?.approved[approvedPeriod]?.byCategory && 
                 expenseSummary.approved[approvedPeriod].byCategory.length > 0 && (
                  <div className="h-[160px] mt-2" onClick={(e) => e.stopPropagation()}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseSummary.approved[approvedPeriod].byCategory}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={55}
                          innerRadius={25}
                          paddingAngle={2}
                          label={({ category, percent }) => 
                            `${category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {expenseSummary.approved[approvedPeriod].byCategory.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={[
                                '#FF6B35', '#4A90A4', '#7CB342', '#AB47BC', 
                                '#FF7043', '#26A69A', '#5C6BC0', '#78909C'
                              ][index % 8]} 
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          {...rechartsTooltipStyle}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reimbursed Widget - MTD/QTD/YTD Selectable */}
            <Card 
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => handleDrillToStatus('reimbursed')}
              data-testid="card-reimbursed"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Reimbursed</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="dropdown-reimbursed-period">
                      {reimbursedPeriod.toUpperCase()}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setReimbursedPeriod('all')} data-testid="option-reimbursed-all">
                      All Time
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReimbursedPeriod('mtd')} data-testid="option-reimbursed-mtd">
                      MTD (Month to Date)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReimbursedPeriod('qtd')} data-testid="option-reimbursed-qtd">
                      QTD (Quarter to Date)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReimbursedPeriod('ytd')} data-testid="option-reimbursed-ytd">
                      YTD (Year to Date)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-reimbursed-total">
                  ${(expenseSummary?.reimbursed[reimbursedPeriod]?.total || 0).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {expenseSummary?.reimbursed[reimbursedPeriod]?.count || 0} expenses reimbursed
                </p>
                {/* Pie Chart by Category */}
                {expenseSummary?.reimbursed[reimbursedPeriod]?.byCategory && 
                 expenseSummary.reimbursed[reimbursedPeriod].byCategory.length > 0 && (
                  <div className="h-[160px] mt-2" onClick={(e) => e.stopPropagation()}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseSummary.reimbursed[reimbursedPeriod].byCategory}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={55}
                          innerRadius={25}
                          paddingAngle={2}
                          label={({ category, percent }) => 
                            `${category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {expenseSummary.reimbursed[reimbursedPeriod].byCategory.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={[
                                '#FF6B35', '#4A90A4', '#7CB342', '#AB47BC', 
                                '#FF7043', '#26A69A', '#5C6BC0', '#78909C'
                              ][index % 8]} 
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          {...rechartsTooltipStyle}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Drill-down View - replaces tab content when active */}
        {drillDown.level === 'status-list' && drillDown.statusFilter ? (
          <div className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleDrillBack} data-testid="button-drill-back">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleJumpToDashboard} data-testid="button-jump-dashboard">
                      <Home className="h-4 w-4 mr-1" />
                      Expense Dashboard
                    </Button>
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusLabel(drillDown.statusFilter)} Expenses
                    {(drillDown.statusFilter === 'approved' || drillDown.statusFilter === 'reimbursed') && (
                      <Badge variant="secondary">
                        {drillDown.statusFilter === 'approved' ? getPeriodLabel(approvedPeriod) : getPeriodLabel(reimbursedPeriod)}
                      </Badge>
                    )}
                  </CardTitle>
                </div>
                <CardDescription>
                  Click on any expense to view details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderExpenseTable(getFilteredExpensesByStatus(drillDown.statusFilter), false)}
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
        <TabsContent value="my-approval" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                Awaiting Your Approval
              </CardTitle>
              <CardDescription>
                Expenses that require your review and approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : pendingMyApproval.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
                  <p>No expenses awaiting your approval!</p>
                </div>
              ) : (
                renderExpenseTable(pendingMyApproval, true)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>All Expenses</CardTitle>
              <CardDescription>
                View and manage all submitted expenses (Driver and Employee)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : allExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No expenses found.
                </div>
              ) : (
                renderExpenseTable(allExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="driver" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-600" />
                Driver Expenses
              </CardTitle>
              <CardDescription>
                Move-related expenses: fuel, tolls, oil, parking, maintenance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : driverExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No driver expenses found.
                </div>
              ) : (
                renderExpenseTable(driverExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employee" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Employee Expenses
              </CardTitle>
              <CardDescription>
                T&E and office expenses: travel, meals, lodging, office supplies, equipment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : employeeExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No employee expenses found.
                </div>
              ) : (
                renderExpenseTable(employeeExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
