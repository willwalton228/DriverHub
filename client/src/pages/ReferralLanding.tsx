import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

// ─── Form schema ─────────────────────────────────────────────────────────────
const applySchema = z.object({
  firstName:   z.string().min(1, "First name required"),
  lastName:    z.string().min(1, "Last name required"),
  email:       z.string().email("Valid email required"),
  phone:       z.string().min(10, "Valid phone required"),
  driverType:  z.string().min(1, "Driver type required"),
  city:        z.string().optional(),
  state:       z.string().optional(),
  consent:     z.boolean().refine((v) => v, "You must agree to continue"),
});
type ApplyForm = z.infer<typeof applySchema>;

// ─── Success state ────────────────────────────────────────────────────────────
function SuccessView({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 px-4 text-center">
      <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-5">
        <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Thanks, {name}! Your application is being reviewed. We'll be in touch soon.
        </p>
      </div>
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────
export default function ReferralLanding() {
  const { code } = useParams<{ code: string }>();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");

  const { data: referrer, isLoading, isError } = useQuery<{
    code: string;
    driverName: string;
    driverPhoto: string | null;
    orgName: string;
  }>({
    queryKey: ["/api/public/referral", code],
    queryFn: async () => {
      const res = await fetch(`/api/public/referral/${code}`);
      if (!res.ok) throw new Error("Invalid referral code");
      return res.json();
    },
    retry: false,
  });

  const form = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "",
      driverType: "", city: "", state: "", consent: false,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ApplyForm) => {
      const res = await fetch(`/api/public/referral/${code}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Submission failed");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setSubmittedName(variables.firstName);
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !referrer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4">
        <Logo variant="icon" className="h-12 w-12" />
        <h1 className="text-xl font-bold text-foreground">Invalid Referral Link</h1>
        <p className="text-muted-foreground text-sm text-center max-w-xs">
          This referral code does not exist or has been deactivated. Please ask your referrer to share their current link.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b px-4 py-3 flex items-center gap-2">
          <Logo variant="icon" className="h-7 w-7" />
          <span className="font-semibold text-foreground">{referrer.orgName}</span>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <SuccessView name={submittedName} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center gap-2">
        <Logo variant="icon" className="h-7 w-7" />
        <span className="font-semibold text-foreground">{referrer.orgName}</span>
        <Badge variant="secondary" className="ml-auto">Driver Application</Badge>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md flex flex-col gap-5">
          {/* Referrer card */}
          <Card>
            <CardContent className="pt-5 pb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                {referrer.driverPhoto ? (
                  <img src={referrer.driverPhoto} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <UserCircle className="h-12 w-12 text-primary" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">You were referred by</p>
                <p className="text-base font-semibold text-foreground mt-0.5">{referrer.driverName}</p>
                <p className="text-xs text-muted-foreground">{referrer.orgName} Driver</p>
              </div>
            </CardContent>
          </Card>

          {/* Application form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Begin Your Application</CardTitle>
              <CardDescription>Fill out the form below to apply for a driver position</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="flex flex-col gap-4">
                  {/* Referral code — locked */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Referral Code</label>
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2 border">
                      <span className="font-mono font-semibold text-primary flex-1" data-testid="text-locked-code">{referrer.code}</span>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">Referral attribution is permanent and cannot be changed.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} data-testid="input-first-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} data-testid="input-last-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input type="tel" {...field} data-testid="input-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="driverType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-driver-type">
                            <SelectValue placeholder="Select driver type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="shift">Shift Driver</SelectItem>
                          <SelectItem value="ondemand">On-Demand Driver</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                          <SelectItem value="cdl">CDL Driver</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl><Input {...field} data-testid="input-city" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="state" render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl><Input {...field} maxLength={2} data-testid="input-state" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="consent" render={({ field }) => (
                    <FormItem className="flex items-start gap-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-consent" className="mt-0.5" />
                      </FormControl>
                      <div className="flex flex-col">
                        <FormLabel className="font-normal text-sm leading-snug">
                          I consent to share my information for driver recruitment purposes
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )} />

                  <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="button-submit-application">
                    {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Submit Application
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            By applying, you agree to our terms and privacy policy. Referral attribution is handled automatically.
          </p>
        </div>
      </main>
    </div>
  );
}
