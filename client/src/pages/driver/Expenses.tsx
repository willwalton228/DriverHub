import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDate, parseFormDate } from "@/lib/dateFormat";
import { Plus, X, Receipt, DollarSign, Calendar, FileText, AlertCircle } from "lucide-react";
import { ServerUploader } from "@/components/ServerUploader";
import type { Expense } from "@shared/schema";
import { DRIVER_EXPENSE_CATEGORIES } from "@shared/schema";

interface ExpenseAlert {
  hasOpenExpenses: boolean;
  overdueCount: number;
  message: string;
  userType: "driver" | "employee";
}

interface DraftExpense {
  id: string;
  expenseDate: string;
  category: string;
  amount: string;
  description: string;
  receiptUrl: string | null;
  status: string;
}

interface LocalExpense {
  draftId?: string;
  expenseDate: string;
  category: string;
  amount: string;
  description: string;
  receiptUrl: string;
}

const emptyExpense: LocalExpense = {
  expenseDate: "",
  category: "",
  amount: "",
  description: "",
  receiptUrl: "",
};

export default function Expenses() {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<LocalExpense[]>([{ ...emptyExpense }]);
  const [isInitialized, setIsInitialized] = useState(false);
  const saveTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const { data: submittedExpenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/driver/expenses"],
  });

  const { data: draftExpenses = [], isLoading: draftsLoading } = useQuery<DraftExpense[]>({
    queryKey: ["/api/my/expenses/drafts"],
  });

  const { data: expenseAlert } = useQuery<ExpenseAlert>({
    queryKey: ["/api/me/expense-alerts"],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!draftsLoading && !isInitialized) {
      if (draftExpenses.length > 0) {
        const loaded = draftExpenses.map((d) => ({
          draftId: d.id,
          expenseDate: d.expenseDate || "",
          category: d.category || "",
          amount: d.amount || "",
          description: d.description || "",
          receiptUrl: d.receiptUrl || "",
        }));
        setExpenses(loaded.length > 0 ? loaded : [{ ...emptyExpense }]);
      }
      setIsInitialized(true);
    }
  }, [draftExpenses, draftsLoading, isInitialized]);

  const createDraftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/my/expenses/drafts", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/my/expenses/drafts/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/my/expenses/drafts/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
    },
  });

  const submitDraftsMutation = useMutation({
    mutationFn: async (expenseIds: string[]) => {
      const res = await apiRequest("POST", "/api/my/expenses/drafts/submit", { expenseIds });
      return await res.json();
    },
    onSuccess: (data: { submittedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my/expenses/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/expenses"] });
      if (data.submittedCount > 0) {
        toast({
          title: "Success",
          description: `${data.submittedCount} expense(s) submitted successfully`,
        });
        setExpenses([{ ...emptyExpense }]);
        setIsInitialized(false);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit expenses",
        variant: "destructive",
      });
    },
  });

  const saveDraft = async (index: number, expense: LocalExpense) => {
    if (!expense.expenseDate && !expense.category && !expense.amount) {
      return;
    }

    const draftData = {
      expenseDate: expense.expenseDate || new Date().toISOString().split('T')[0],
      category: expense.category || "other",
      amount: expense.amount || "0",
      description: expense.description || "Draft expense",
      expenseType: "driver",
      receiptUrl: expense.receiptUrl || undefined,
    };

    if (expense.draftId) {
      updateDraftMutation.mutate({ id: expense.draftId, data: draftData });
    } else {
      const result = await createDraftMutation.mutateAsync(draftData);
      if (result?.id) {
        setExpenses((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], draftId: result.id };
          }
          return updated;
        });
      }
    }
  };

  const debouncedSave = (index: number, expense: LocalExpense) => {
    const existingTimeout = saveTimeouts.current.get(index);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    const timeout = setTimeout(() => {
      saveDraft(index, expense);
    }, 1500);
    saveTimeouts.current.set(index, timeout);
  };

  const addExpense = () => {
    setExpenses([...expenses, { ...emptyExpense }]);
  };

  const removeExpense = (index: number) => {
    if (expenses.length > 1) {
      const expense = expenses[index];
      if (expense.draftId) {
        deleteDraftMutation.mutate(expense.draftId);
      }
      setExpenses(expenses.filter((_, i) => i !== index));
    }
  };

  const updateExpense = (index: number, field: keyof LocalExpense, value: string) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], [field]: value };
    setExpenses(updated);
    debouncedSave(index, updated[index]);
  };

  const handleFileComplete = (index: number, result: { objectPath: string; uploadURL: string }) => {
    if (result.objectPath) {
      updateExpense(index, "receiptUrl", result.objectPath);
      toast({
        title: "Success",
        description: "Receipt uploaded successfully",
      });
    }
  };

  const validateForm = (): boolean => {
    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses[i];
      
      if (!exp.expenseDate) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: Date is required`,
          variant: "destructive",
        });
        return false;
      }

      const expDate = new Date(exp.expenseDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (expDate > today) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: Date cannot be in the future`,
          variant: "destructive",
        });
        return false;
      }

      if (!exp.category) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: Item Purchased is required`,
          variant: "destructive",
        });
        return false;
      }

      if (exp.category === "other" && (!exp.description || exp.description.trim().length < 15)) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: When 'Other' is selected, please provide a detailed description (at least 15 characters)`,
          variant: "destructive",
        });
        return false;
      }

      if (!exp.amount || parseFloat(exp.amount) <= 0) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: Amount is required and must be greater than 0`,
          variant: "destructive",
        });
        return false;
      }

      if (!exp.receiptUrl) {
        toast({
          title: "Validation Error",
          description: `Expense ${i + 1}: Receipt upload is required`,
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const expensesWithDrafts = expenses.filter(e => e.draftId);
    const expensesWithoutDrafts = expenses.filter(e => !e.draftId);

    for (const expense of expensesWithoutDrafts) {
      await saveDraft(expenses.indexOf(expense), expense);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const allDraftIds = expenses
      .map(e => e.draftId)
      .filter((id): id is string => !!id);

    if (allDraftIds.length === 0) {
      toast({
        title: "Error",
        description: "No expenses to submit. Please wait for drafts to save.",
        variant: "destructive",
      });
      return;
    }

    submitDraftsMutation.mutate(allDraftIds);
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      fuel: "Fuel",
      tolls: "Tolls",
      oil: "Oil",
      parking: "Parking",
      maintenance: "Maintenance",
      other: "Other",
    };
    return labels[category] || category;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-600";
      case "rejected":
        return "text-red-600";
      case "reimbursed":
        return "text-blue-600";
      default:
        return "text-yellow-600";
    }
  };

  return (
    <div className="space-y-6">
      {expenseAlert?.hasOpenExpenses && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950" data-testid="alert-expense-overdue">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-semibold">Action Required: Submit Your Expenses</AlertTitle>
          <AlertDescription>
            <p>{expenseAlert.message}</p>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Expenses
        </h1>
        <p className="text-muted-foreground mt-2">
          Submit expenses for reimbursement. <span className="font-medium">Driver expenses should be submitted daily.</span>
        </p>
      </div>

      {/* Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Expense Request</CardTitle>
          <CardDescription>
            Add one or more expenses to submit for reimbursement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {expenses.map((expense, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-4 relative">
              {expenses.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => removeExpense(index)}
                  data-testid={`button-remove-expense-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}

              <h3 className="font-semibold">Expense #{index + 1}</h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`date-${index}`}>
                    Date of Expense {!expense.expenseDate && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`date-${index}`}
                      type="date"
                      value={expense.expenseDate}
                      onChange={(e) => updateExpense(index, "expenseDate", e.target.value)}
                      className="pl-10"
                      data-testid={`input-expense-date-${index}`}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`category-${index}`}>
                    Item Purchased {!expense.category && <span className="text-destructive">*</span>}
                  </Label>
                  <Select
                    value={expense.category}
                    onValueChange={(value) => updateExpense(index, "category", value)}
                  >
                    <SelectTrigger data-testid={`select-category-${index}`}>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {DRIVER_EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {getCategoryLabel(cat)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`amount-${index}`}>
                    Amount {!expense.amount && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`amount-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={expense.amount}
                      onChange={(e) => updateExpense(index, "amount", e.target.value)}
                      className="pl-10"
                      placeholder="0.00"
                      data-testid={`input-amount-${index}`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Upload Receipt {!expense.receiptUrl && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="flex items-center gap-2">
                    <ServerUploader
                      onComplete={(result) => handleFileComplete(index, result)}
                      onError={(error) => {
                        console.error("Receipt upload failed:", error);
                      }}
                      maxFileSize={10485760}
                      allowedFileTypes={["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]}
                      buttonVariant={expense.receiptUrl ? "outline" : "default"}
                      buttonClassName="w-full"
                      testId={`button-upload-receipt-${index}`}
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      {expense.receiptUrl ? "Receipt Uploaded" : "Upload Receipt"}
                    </ServerUploader>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`description-${index}`}>
                  {expense.category === "other" ? (
                    <>
                      Detail {(!expense.description || expense.description.trim().length < 15) && <span className="text-destructive">* (min 15 characters)</span>}
                    </>
                  ) : (
                    "Comments (optional)"
                  )}
                </Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Textarea
                    id={`description-${index}`}
                    value={expense.description}
                    onChange={(e) => updateExpense(index, "description", e.target.value)}
                    placeholder={
                      expense.category === "other"
                        ? "Please describe the expense in detail (minimum 15 characters)"
                        : "Add any additional comments"
                    }
                    className="pl-10 min-h-[80px]"
                    data-testid={`input-description-${index}`}
                  />
                </div>
                {expense.category === "other" && expense.description && (
                  <p className="text-xs text-muted-foreground">
                    {expense.description.trim().length} / 15 characters
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={addExpense}
              variant="outline"
              data-testid="button-add-another"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Expense
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={submitDraftsMutation.isPending}
              data-testid="button-submit-expenses"
            >
              {submitDraftsMutation.isPending ? "Submitting..." : `Submit ${expenses.length} Expense${expenses.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Submitted Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle>Submitted Expenses</CardTitle>
          <CardDescription>
            View your expense submission history and status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading expenses...</p>
          ) : !submittedExpenses || submittedExpenses.length === 0 ? (
            <p className="text-muted-foreground">No expenses submitted yet</p>
          ) : (
            <div className="space-y-3">
              {submittedExpenses.map((expense) => (
                <Card key={expense.id} className="hover-elevate">
                  <CardContent className="pt-4">
                    <div className="grid md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="font-medium">{formatDate(expense.expenseDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Category</p>
                        <p className="font-medium">{getCategoryLabel(expense.category)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p className="font-medium">${parseFloat(expense.amount.toString()).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <p className={`font-medium capitalize ${getStatusColor(expense.status || "pending")}`}>
                          {expense.status || "pending"}
                        </p>
                      </div>
                    </div>
                    {expense.description && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-muted-foreground">Comments:</p>
                        <p className="text-sm">{expense.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
