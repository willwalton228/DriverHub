import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, UserPlus, AlertCircle, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const acceptInviteSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: inviteData, isLoading, error: fetchError } = useQuery({
    queryKey: ["/api/auth/invite", token],
    queryFn: async () => {
      const response = await fetch(`/api/auth/invite/${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invalid invitation");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (data: AcceptInviteFormData) => {
      const response = await apiRequest("POST", "/api/auth/accept-invite", {
        token,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to accept invitation. Please try again.";
      setError(message);
    },
  });

  const onSubmit = (data: AcceptInviteFormData) => {
    setError(null);
    acceptMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !inviteData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-destructive rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive-foreground" />
            </div>
            <CardTitle className="text-2xl">Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid, has already been used, or has expired.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-go-to-login">
              Go to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Complete Your Account</CardTitle>
          <CardDescription>
            You've been invited to join as <strong>{inviteData.role}</strong>.
            <br />
            Set up your account to get started.
          </CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{inviteData.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  data-testid="input-first-name"
                  {...form.register("firstName")}
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  data-testid="input-last-name"
                  {...form.register("lastName")}
                />
                {form.formState.errors.lastName && (
                  <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a strong password"
                autoComplete="new-password"
                data-testid="input-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                autoComplete="new-password"
                data-testid="input-confirm-password"
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Account
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
