import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const schema = z.object({
  newPassword: z.string().min(10, "Password must be at least 10 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function Bootstrap() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!token) {
      setVerifyError("No bootstrap token provided in URL.");
      setVerifying(false);
      return;
    }

    fetch(`/api/auth/bootstrap/verify?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setVerifyError(body.message || "Invalid or expired bootstrap token.");
        } else {
          setVerifiedEmail(body.email);
        }
      })
      .catch(() => setVerifyError("Could not reach the server. Try again."))
      .finally(() => setVerifying(false));
  }, [token]);

  const setPasswordMut = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/auth/bootstrap", {
        token,
        newPassword: data.newPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate("/"), 2000);
    },
    onError: (e: any) => {
      form.setError("root" as any, { message: e?.message || "Failed to set password." });
    },
  });

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Bootstrap Token Invalid</CardTitle>
            <CardDescription>{verifyError}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Ensure <code className="text-xs bg-muted px-1 py-0.5 rounded">ROOT_SUPER_ADMIN_BOOTSTRAP_TOKEN</code> is set in the server environment and the URL token matches exactly.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Password Set</CardTitle>
            <CardDescription>Redirecting to dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Set Administrator Password</CardTitle>
          <CardDescription>
            Setting password for <span className="font-medium text-foreground">{verifiedEmail}</span>
          </CardDescription>
        </CardHeader>

        <form onSubmit={form.handleSubmit((d) => setPasswordMut.mutate(d))}>
          <CardContent className="space-y-4">
            {(form.formState.errors as any).root && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{(form.formState.errors as any).root.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  placeholder="At least 10 characters"
                  autoComplete="new-password"
                  className="pr-10"
                  data-testid="input-new-password"
                  {...form.register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                  aria-label={showNew ? "Hide password" : "Show password"}
                  tabIndex={0}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.newPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="pr-10"
                  data-testid="input-confirm-password"
                  {...form.register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  tabIndex={0}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={setPasswordMut.isPending}
              data-testid="button-set-password"
            >
              {setPasswordMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set Password & Sign In
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              This link is protected by a server-side secret. Only use it once; then remove or rotate the token.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
