import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageSquarePlus, Send, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const feedbackFormSchema = z.object({
  type: z.enum(["BUG", "FEATURE_REQUEST", "QUESTION", "DATA_ISSUE", "OTHER"]),
  area: z.enum(["DRIVER_PORTAL", "CORPORATE_DASHBOARD", "PAYROLL", "SCHEDULING", "SAFETY", "INVOICING", "REPORTS", "INTEGRATION", "OTHER"]),
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Please provide more detail").max(5000),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

const typeOptions = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" },
  { value: "DATA_ISSUE", label: "Data Issue" },
  { value: "OTHER", label: "Other" },
];

const areaOptions = [
  { value: "DRIVER_PORTAL", label: "Driver Portal" },
  { value: "CORPORATE_DASHBOARD", label: "Corporate Dashboard" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "SCHEDULING", label: "Scheduling" },
  { value: "SAFETY", label: "Safety" },
  { value: "INVOICING", label: "Invoicing" },
  { value: "REPORTS", label: "Reports" },
  { value: "INTEGRATION", label: "Integration" },
  { value: "OTHER", label: "Other" },
];

const impactOptions = [
  { value: "LOW", label: "Low - Minor inconvenience" },
  { value: "MEDIUM", label: "Medium - Affects productivity" },
  { value: "HIGH", label: "High - Significant impact" },
  { value: "CRITICAL", label: "Critical - Blocking work" },
];

const urgencyOptions = [
  { value: "LOW", label: "Low - When convenient" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High - As soon as possible" },
  { value: "URGENT", label: "Urgent - Needs immediate attention" },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      type: "BUG",
      area: "OTHER",
      title: "",
      description: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackFormValues) => {
      return apiRequest("POST", "/api/feedback", {
        ...data,
        userAgent: navigator.userAgent,
        pageUrl: window.location.href,
      });
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
      // Only clear form and close after confirmed server success
      form.reset();
      setOpen(false);
    },
    onError: (error: any) => {
      // Input is intentionally retained — do NOT reset or close
      toast({
        title: "Submission Failed",
        description: error?.message || "Failed to submit feedback. Your input has been kept — please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FeedbackFormValues) => {
    submitMutation.mutate(data);
  };

  /** Determine whether the form has meaningful user input that would be lost. */
  const isDirty = () => {
    const values = form.getValues();
    return (
      values.title.trim().length > 0 ||
      values.description.trim().length > 0
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Block close while a submission is in flight
      if (submitMutation.isPending) return;
      // Prompt before discarding unsaved input
      if (isDirty()) {
        setShowDiscardConfirm(true);
        return;
      }
    }
    setOpen(nextOpen);
  };

  const handleConfirmedDiscard = () => {
    setShowDiscardConfirm(false);
    form.reset();
    submitMutation.reset();
    setOpen(false);
  };

  const handleRetry = () => {
    form.handleSubmit(onSubmit)();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            variant="default"
            className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
            data-testid="button-feedback-open"
            onClick={() => setOpen(true)}
          >
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Submit Feedback</SheetTitle>
            <SheetDescription>
              Report a bug, request a feature, or ask a question. Your feedback helps us improve.
            </SheetDescription>
          </SheetHeader>

          {submitMutation.isError && (
            <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2">
              <span>
                {(submitMutation.error as any)?.message || "Submission failed. Your input is preserved."}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={submitMutation.isPending}
                data-testid="button-feedback-retry"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-feedback-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {typeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} data-testid={`option-type-${opt.value.toLowerCase()}`}>
                            {opt.label}
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
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-feedback-area">
                          <SelectValue placeholder="Select area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {areaOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} data-testid={`option-area-${opt.value.toLowerCase()}`}>
                            {opt.label}
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
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief summary of your feedback"
                        {...field}
                        data-testid="input-feedback-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please provide as much detail as possible..."
                        className="min-h-[120px]"
                        {...field}
                        data-testid="input-feedback-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="impact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impact (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-feedback-impact">
                          <SelectValue placeholder="How does this affect you?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {impactOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} data-testid={`option-impact-${opt.value.toLowerCase()}`}>
                            {opt.label}
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
                name="urgency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Urgency (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-feedback-urgency">
                          <SelectValue placeholder="How urgent is this?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {urgencyOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} data-testid={`option-urgency-${opt.value.toLowerCase()}`}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitMutation.isPending}
                  data-testid="button-feedback-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  data-testid="button-feedback-submit"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved input. Closing now will permanently discard what you've typed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-feedback-discard-cancel">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedDiscard}
              data-testid="button-feedback-discard-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
