import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Truck,
  CreditCard,
  User,
  Car,
  HelpCircle,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

const issueTypes = [
  { value: 'SERVICE', label: 'Service Issue', description: 'Problems with move execution or scheduling', icon: Truck },
  { value: 'BILLING', label: 'Billing Question', description: 'Invoice questions, payment issues', icon: CreditCard },
  { value: 'DRIVER', label: 'Driver Concern', description: 'Feedback about driver behavior or service', icon: User },
  { value: 'VEHICLE', label: 'Vehicle Issue', description: 'Vehicle condition or equipment concerns', icon: Car },
  { value: 'OTHER', label: 'Other', description: 'General questions or other issues', icon: HelpCircle },
];

const impactLevels = [
  { value: 'MINOR', label: 'Minor', description: 'Small inconvenience, no significant impact' },
  { value: 'SLOWS_WORK', label: 'Slows Operations', description: 'Causes delays but work continues' },
  { value: 'BLOCKS', label: 'Blocks Work', description: 'Cannot proceed until resolved' },
  { value: 'MONEY_PAYROLL', label: 'Financial Impact', description: 'Affects billing, payments, or costs' },
  { value: 'CLIENT_FACING', label: 'Customer-Facing', description: 'Visible to your customers' },
];

const formSchema = z.object({
  issueType: z.enum(['SERVICE', 'BILLING', 'DRIVER', 'VEHICLE', 'OTHER'], {
    required_error: "Please select an issue type",
  }),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().min(10, 'Please provide more detail (at least 10 characters)').max(5000),
  impactLevel: z.enum(['MINOR', 'SLOWS_WORK', 'BLOCKS', 'INCORRECT_DATA', 'MONEY_PAYROLL', 'CLIENT_FACING', 'COMPLIANCE_RISK'], {
    required_error: "Please select an impact level",
  }),
  impactDetail: z.string().min(1, 'Please describe how this impacts you').max(1000),
});

type FormData = z.infer<typeof formSchema>;

interface SubmitResponse {
  ticket_id: string;
  ticket_number: number;
  title: string;
  issue_type: string;
  issue_type_label: string;
  status: string;
  created_at: string;
  message: string;
}

interface CustomerUser {
  id: string;
  role: 'ACCOUNT_ADMIN' | 'ACCOUNT_VIEWER';
  customerName?: string;
}

export default function ReportIssue() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [submittedTicket, setSubmittedTicket] = useState<SubmitResponse | null>(null);

  const { data: customerUser, isLoading: isLoadingUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer/me"],
  });

  const isViewer = customerUser?.role === 'ACCOUNT_VIEWER';

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      issueType: undefined,
      title: '',
      description: '',
      impactLevel: undefined,
      impactDetail: '',
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/customer/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to submit issue');
      }
      return response.json() as Promise<SubmitResponse>;
    },
    onSuccess: (data) => {
      // Only transition to success state after confirmed server response
      setSubmittedTicket(data);
      toast({
        title: "Issue Submitted",
        description: `Your request #${data.ticket_number} has been submitted.`,
      });
    },
    onError: (error: Error) => {
      // Input is intentionally retained — do NOT reset or navigate
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit issue. Your input has been kept — please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    submitMutation.mutate(data);
  };

  const handleRetry = () => {
    form.handleSubmit(onSubmit)();
  };

  // Loading state
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Access denied for viewer users
  if (isViewer) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/customer/support/requests">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <span className="font-semibold">Support</span>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card data-testid="card-access-denied">
            <CardContent className="pt-6">
              <div className="text-center space-y-4 py-8">
                <div className="flex justify-center">
                  <ShieldAlert className="h-16 w-16 text-amber-500" />
                </div>
                <h2 className="text-2xl font-semibold">Access Restricted</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  As a viewer, you can see existing requests but cannot submit new ones.
                  Contact your account admin if you need to report an issue.
                </p>
                <Link href="/customer/support/requests">
                  <Button data-testid="button-back-to-requests">
                    Back to My Requests
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Success state
  if (submittedTicket) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="font-semibold">Support</span>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card data-testid="card-success">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </div>
                <h2 className="text-2xl font-semibold" data-testid="text-success-title">
                  Request Submitted
                </h2>
                <p className="text-muted-foreground">
                  {submittedTicket.message}
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Request Number</p>
                  <p className="text-2xl font-bold" data-testid="text-ticket-number">
                    #{submittedTicket.ticket_number}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                  <Link href="/customer/support/requests">
                    <Button data-testid="button-view-requests">
                      View My Requests
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSubmittedTicket(null);
                      form.reset();
                      submitMutation.reset();
                    }}
                    data-testid="button-submit-another"
                  >
                    Submit Another Issue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="font-semibold">Report an Issue</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card data-testid="card-report-form">
          <CardHeader>
            <CardTitle>How can we help?</CardTitle>
            <CardDescription>
              Describe your issue and we'll get back to you as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitMutation.isError && (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2">
                <span>
                  {submitMutation.error?.message || "Submission failed. Your input is preserved."}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={submitMutation.isPending}
                  data-testid="button-report-retry"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="issueType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Issue Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-issue-type">
                            <SelectValue placeholder="Select the type of issue" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {issueTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value} data-testid={`option-issue-type-${type.value.toLowerCase()}`}>
                              <div className="flex items-center gap-2">
                                <type.icon className="h-4 w-4" />
                                <span>{type.label}</span>
                              </div>
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
                      <FormLabel required>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Brief summary of the issue"
                          data-testid="input-title"
                          {...field}
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
                      <FormLabel required>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please provide details about the issue..."
                          className="min-h-[120px]"
                          data-testid="input-description"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Include any relevant details like dates, move numbers, or specifics.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="impactLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Business Impact</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-impact">
                            <SelectValue placeholder="How is this affecting you?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {impactLevels.map((level) => (
                            <SelectItem key={level.value} value={level.value} data-testid={`option-impact-${level.value.toLowerCase()}`}>
                              <div>
                                <span className="font-medium">{level.label}</span>
                                <span className="text-muted-foreground ml-2">- {level.description}</span>
                              </div>
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
                  name="impactDetail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Impact Detail</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Explain how this issue is affecting your operations..."
                          className="min-h-[80px]"
                          data-testid="input-impact-detail"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                  <Link href="/" className="flex-1 sm:flex-none">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={submitMutation.isPending}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Submit Issue
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link href="/customer/support/requests">
            <Button variant="ghost" data-testid="link-my-requests">
              View My Previous Requests
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
