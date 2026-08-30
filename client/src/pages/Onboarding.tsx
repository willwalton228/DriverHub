import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cleanPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";
import { Building2, User, Briefcase, Loader2, Truck, Shield, Calculator, Radio } from "lucide-react";

const onboardingSchema = z.object({
  org_name: z.string().min(2, "Organization name must be at least 2 characters"),
  selected_role: z.enum(["admin", "ops_manager", "payroll_admin", "dispatcher", "driver"]),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  job_title: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrator", description: "Full system access", icon: Shield },
  { value: "ops_manager", label: "Operations Manager", description: "Manage drivers and moves", icon: Briefcase },
  { value: "payroll_admin", label: "Payroll Admin", description: "Process payroll and payments", icon: Calculator },
  { value: "dispatcher", label: "Dispatcher", description: "Assign and track moves", icon: Radio },
  { value: "driver", label: "Driver", description: "Complete moves and track earnings", icon: Truck },
];

export default function Onboarding() {
  const { toast } = useToast();
  const [step, setStep] = useState<"org" | "role" | "profile">("org");

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      org_name: "",
      selected_role: "admin",
      first_name: "",
      last_name: "",
      job_title: "",
      phone: "",
      department: "",
    },
  });

  const initializeMutation = useMutation({
    mutationFn: async (data: OnboardingFormData) => {
      const payload = {
        org_name: data.org_name,
        selected_role: data.selected_role,
        profile: {
          first_name: data.first_name,
          last_name: data.last_name,
          job_title: data.job_title,
          phone: cleanPhone(data.phone),
          department: data.department,
        },
      };
      const response = await apiRequest("POST", "/api/onboarding/initialize", payload);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Setup Complete",
        description: "Your account has been set up successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/session/context"] });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OnboardingFormData) => {
    initializeMutation.mutate(data);
  };

  const goToRole = () => {
    const orgName = form.getValues("org_name");
    if (!orgName || orgName.length < 2) {
      form.setError("org_name", { message: "Organization name must be at least 2 characters" });
      return;
    }
    setStep("role");
  };

  const goToProfile = () => {
    const role = form.getValues("selected_role");
    if (!role) {
      form.setError("selected_role", { message: "Please select a role" });
      return;
    }
    setStep("profile");
  };

  const getStepIcon = () => {
    switch (step) {
      case "org": return <Building2 className="w-6 h-6 text-primary" />;
      case "role": return <Briefcase className="w-6 h-6 text-primary" />;
      case "profile": return <User className="w-6 h-6 text-primary" />;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case "org": return "Set Up Your Organization";
      case "role": return "Select Your Role";
      case "profile": return "Create Your Profile";
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case "org": return "Enter your organization details to get started with DriverHub 360";
      case "role": return "Choose how you'll be using the platform";
      case "profile": return "Complete your personal information";
    }
  };

  const selectedRole = form.watch("selected_role");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            {getStepIcon()}
          </div>
          <CardTitle className="text-2xl">{getStepTitle()}</CardTitle>
          <CardDescription>{getStepDescription()}</CardDescription>
          <div className="flex justify-center gap-2 mt-4">
            {["org", "role", "profile"].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full ${
                  step === s ? "bg-primary" : 
                  (step === "role" && s === "org") || (step === "profile" && (s === "org" || s === "role"))
                    ? "bg-primary/50" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {step === "org" && (
                <>
                  <FormField
                    control={form.control}
                    name="org_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Acme Transportation Inc." 
                            data-testid="input-org-name"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="button" 
                    className="w-full" 
                    onClick={goToRole}
                    data-testid="button-next-step"
                  >
                    Continue
                  </Button>
                </>
              )}

              {step === "role" && (
                <>
                  <FormField
                    control={form.control}
                    name="selected_role"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="space-y-3"
                          >
                            {ROLE_OPTIONS.map((role) => {
                              const Icon = role.icon;
                              return (
                                <div
                                  key={role.value}
                                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    field.value === role.value 
                                      ? "border-primary bg-primary/5" 
                                      : "border-border hover:border-primary/50"
                                  }`}
                                  onClick={() => field.onChange(role.value)}
                                  data-testid={`role-option-${role.value}`}
                                >
                                  <RadioGroupItem value={role.value} id={role.value} />
                                  <Icon className="w-5 h-5 text-muted-foreground" />
                                  <div className="flex-1">
                                    <Label htmlFor={role.value} className="cursor-pointer font-medium">
                                      {role.label}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">{role.description}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setStep("org")}
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button 
                      type="button" 
                      className="flex-1"
                      onClick={goToProfile}
                      data-testid="button-next-role"
                    >
                      Continue
                    </Button>
                  </div>
                </>
              )}

              {step === "profile" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John" 
                              data-testid="input-first-name"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Doe" 
                              data-testid="input-last-name"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {selectedRole !== "driver" && (
                    <>
                      <FormField
                        control={form.control}
                        name="job_title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Operations Manager" 
                                data-testid="input-job-title"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Operations" 
                                data-testid="input-department"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (Optional)</FormLabel>
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

                  <div className="flex gap-2 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setStep("role")}
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1"
                      disabled={initializeMutation.isPending}
                      data-testid="button-complete-setup"
                    >
                      {initializeMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Complete Setup"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
