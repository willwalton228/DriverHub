import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, AlertCircle, ShieldCheck, Eye, EyeOff, Check, X,
  Smartphone, KeyRound, RotateCcw, Zap, BarChart3, TrendingUp,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  clearPasswordResetExpiration,
  getPasswordResetExpiration,
  setPasswordResetExpiration,
} from "@/lib/passwordResetSession";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "Email is required").email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type ChangePasswordData = z.infer<typeof changePasswordSchema>;

type MfaStep = "none" | "enrollment_required" | "enrollment_verify" | "otp_required";

async function readLoginResponse(response: Response): Promise<Record<string, any> | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Password Strength ────────────────────────────────────────────────────────

function PasswordStrengthIndicator({ password }: { password: string }) {
  const rules = [
    { label: "At least 10 characters",    met: password.length >= 10 },
    { label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { label: "One number (0–9)",           met: /[0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {rules.map((rule) => (
        <li key={rule.label} className="flex items-center gap-2 text-xs">
          {rule.met
            ? <Check className="h-3 w-3 text-green-600 shrink-0" />
            : <X className="h-3 w-3 text-muted-foreground shrink-0" />}
          <span className={rule.met ? "text-green-700" : "text-muted-foreground"}>
            {rule.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Value Points ─────────────────────────────────────────────────────────────

const VALUE_POINTS = [
  {
    icon: Zap,
    title: "Operational Efficiency",
    desc: "Streamline workflows and reduce manual effort.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Visibility",
    desc: "Monitor drivers, moves, recruiting, claims, and daily operations from one platform.",
  },
  {
    icon: TrendingUp,
    title: "Scalable Growth",
    desc: "Support expanding teams, customers, locations, and operational volume.",
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Login() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Login form
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Password reset dialog
  const [resetExpiresAt, setResetExpiresAt] = useState<number | null>(
    () => getPasswordResetExpiration(),
  );
  const [showResetDialog, setShowResetDialog] = useState(
    () => getPasswordResetExpiration() !== null,
  );
  const [resetError, setResetError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Forgot password dialog
  const [showForgotDialog, setShowForgotDialog] = useState(false);

  // MFA
  const [mfaStep, setMfaStep] = useState<MfaStep>("none");
  const [mfaMaskedPhone, setMfaMaskedPhone] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaPhone, setMfaPhone] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaResendCooldown, setMfaResendCooldown] = useState(0);

  // Forms
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { emailOrUsername: "", password: "" },
  });
  const resetForm = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onChange",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const newPasswordValue = resetForm.watch("newPassword") ?? "";

  useEffect(() => {
    if (!resetExpiresAt) return;

    const expireResetSession = () => {
      clearPasswordResetExpiration();
      setResetExpiresAt(null);
      setShowResetDialog(false);
      resetForm.reset();
      setError("Your password reset session has expired. Please sign in again to continue.");
    };

    const remainingMs = resetExpiresAt - Date.now();
    if (remainingMs <= 0) {
      expireResetSession();
      return;
    }

    const timeoutId = window.setTimeout(expireResetSession, remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [resetExpiresAt, resetForm]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = await readLoginResponse(response);
      if (!response.ok) {
        const fallbackMessage = response.status >= 500
          ? "We couldn't sign you in right now. Please try again in a moment."
          : "Login failed. Please try again.";
        const err = new Error(json?.message || fallbackMessage) as any;
        err.errorCode = json?.error;
        err.statusCode = response.status;
        throw err;
      }
      if (!json) {
        throw new Error("The sign-in service returned an invalid response. Please try again.");
      }
      return json;
    },
    onSuccess: (data) => {
      if (data.requiresPasswordReset) {
        const serverExpiresAt = Number(data.passwordResetExpiresAt);
        if (!Number.isFinite(serverExpiresAt) || serverExpiresAt <= Date.now()) {
          setError("Your password reset session has expired. Please sign in again to continue.");
          return;
        }
        setPasswordResetExpiration(serverExpiresAt);
        setResetExpiresAt(serverExpiresAt);
        queryClient.cancelQueries({ queryKey: ["/api/auth/me"] });
        queryClient.removeQueries({ queryKey: ["/api/auth/me"] });
        resetForm.setValue("currentPassword", form.getValues("password"));
        setShowResetDialog(true);
        return;
      }
      clearPasswordResetExpiration();
      setResetExpiresAt(null);
      if (data.mfaStatus === "enrollment_required") { setMfaStep("enrollment_required"); return; }
      if (data.mfaStatus === "otp_required") {
        setMfaStep("otp_required");
        setMfaMaskedPhone(data.maskedPhone || null);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => setError(err?.message || "Login failed. Please try again."),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordData) => {
      const response = await apiRequest("POST", "/api/auth/forced-reset", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      await response.json();

      // Do not navigate on the reset response alone. Verify the newly-issued
      // full session and application access context through the canonical
      // auth-status endpoint first.
      const authResponse = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const authData = await readLoginResponse(authResponse);
      if (!authResponse.ok || !authData?.userId || !authData?.role || !authData?.orgId) {
        throw new Error(authData?.message || "Your password changed, but your application access could not be verified. Please sign in again.");
      }
      return authData;
    },
    onSuccess: (authData) => {
      clearPasswordResetExpiration();
      setResetExpiresAt(null);
      setShowResetDialog(false);
      queryClient.setQueryData(["/api/auth/me"], authData);
      navigate("/");
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to change password. Please try again.";
      if (
        err?.status === 401 &&
        (message.includes("reset session") || message.includes("sign in again"))
      ) {
        clearPasswordResetExpiration();
        setResetExpiresAt(null);
        setShowResetDialog(false);
        resetForm.reset();
        setError("Your password reset session has expired. Please sign in again to continue.");
        return;
      }
      setResetError(message);
    },
  });

  const mfaEnrollMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const res = await apiRequest("POST", "/api/auth/mfa/enroll", { phoneNumber });
      return res.json();
    },
    onSuccess: (data) => {
      setMfaError(null);
      setMfaMaskedPhone(data.maskedPhone || null);
      setMfaStep("enrollment_verify");
      setMfaCode("");
      startResendCooldown();
    },
    onError: (err: any) => setMfaError(err?.message || "Failed to send verification code."),
  });

  const mfaConfirmEnrollMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/mfa/confirm-enrollment", { code });
      return res.json();
    },
    onSuccess: () => {
      setMfaStep("none");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => setMfaError(err?.message || "Invalid code. Please try again."),
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/mfa/verify", { code });
      return res.json();
    },
    onSuccess: () => {
      setMfaStep("none");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => setMfaError(err?.message || "Invalid code. Please try again."),
  });

  const mfaResendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/resend", {});
      return res.json();
    },
    onSuccess: (data) => {
      setMfaError(null);
      if (data.maskedPhone) setMfaMaskedPhone(data.maskedPhone);
      startResendCooldown();
    },
    onError: (err: any) => setMfaError(err?.message || "Failed to resend code."),
  });

  function startResendCooldown(seconds = 30) {
    setMfaResendCooldown(seconds);
    const interval = setInterval(() => {
      setMfaResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const onSubmit = (data: LoginFormData) => { setError(null); loginMutation.mutate(data); };
  const onChangePassword = (data: ChangePasswordData) => { setResetError(null); changePasswordMutation.mutate(data); };
  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPhone.trim()) return;
    setMfaError(null);
    mfaEnrollMutation.mutate(mfaPhone.trim());
  };
  const handleConfirmEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) return;
    setMfaError(null);
    mfaConfirmEnrollMutation.mutate(mfaCode.replace(/\s/g, ""));
  };
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) return;
    setMfaError(null);
    mfaVerifyMutation.mutate(mfaCode.replace(/\s/g, ""));
  };

  const isMfaDialogOpen = mfaStep !== "none";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white overflow-x-hidden">

      {/* ══ LEFT HERO PANEL ══════════════════════════════════════════════════════ */}
      <div className="relative flex flex-col lg:w-[60%] overflow-hidden
                      min-h-[280px] sm:min-h-[340px] lg:min-h-screen">

        {/* Background photograph */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/login-hero.jpg')",
          }}
          role="img"
          aria-label=""
        />

        {/* Subtle brand overlay — 15% DriverHub navy */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(31, 31, 104, 0.15)" }}
          aria-hidden="true"
        />

        {/* Dark-to-transparent gradient at the bottom for text legibility */}
        <div
          className="absolute inset-x-0 bottom-0 h-3/4"
          style={{
            background:
              "linear-gradient(to top, rgba(15, 15, 72, 0.80) 0%, rgba(15, 15, 72, 0.40) 50%, transparent 100%)",
          }}
          aria-hidden="true"
        />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col h-full p-8 md:p-10 xl:p-14 min-h-[280px] sm:min-h-[340px] lg:min-h-screen">

          {/* Logo — top of hero */}
          <div className="mb-auto">
            <img
              src="/dh-logo-white.svg"
              alt="DriverHub 360"
              className="h-[42px] md:h-[52px] w-auto"
              style={{ maxWidth: "286px" }}
              loading="eager"
            />
          </div>

          {/* Headline and value points — bottom of hero */}
          <div className="mt-auto">
            <h1 className="text-2xl sm:text-3xl md:text-4xl xl:text-[2.6rem] font-bold text-white leading-tight mb-3 md:mb-4"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
              The Command Center<br className="hidden sm:block" /> for Automotive Operations
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-white/90 mb-6 md:mb-10 max-w-lg leading-relaxed"
               style={{ textShadow: "0 1px 2px rgba(0,0,0,0.20)" }}>
              DriverHub 360 brings together drivers, moves, recruiting, scheduling,
              claims, invoicing, reporting, and customer operations in one unified platform.
            </p>

            {/* Value points — hidden on smallest mobile to keep it clean */}
            <div className="hidden sm:flex flex-col gap-4 md:gap-5">
              {VALUE_POINTS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 rounded-md p-1.5 mt-0.5"
                    style={{ background: "rgba(255,255,255,0.15)" }}
                  >
                    <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-snug"
                       style={{ textShadow: "0 1px 2px rgba(0,0,0,0.20)" }}>
                      {title}
                    </p>
                    <p className="text-xs text-white/80 leading-relaxed mt-0.5"
                       style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ RIGHT LOGIN PANEL ════════════════════════════════════════════════════ */}
      <div className="flex-1 lg:w-[40%] flex flex-col items-center justify-center
                      px-6 py-10 md:py-12 lg:py-0 bg-white lg:overflow-y-auto">
        <div className="w-full max-w-sm">

          {/* DriverHub 360 wordmark */}
          <div className="mb-8 text-center">
            <img
              src="/dh-logo-color.svg"
              alt="DriverHub 360"
              className="inline-block h-8 md:h-9 w-auto"
              style={{ maxWidth: "210px" }}
              loading="eager"
            />
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>
              Welcome Back
            </h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Sign in to access your DriverHub 360 workspace.
            </p>
          </div>

          {/* ── Login Form ── */}
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {/* Error alert */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Email */}
            <div className="mb-4">
              <Label htmlFor="emailOrUsername" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="emailOrUsername"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                data-testid="input-email"
                className="mt-1.5 h-10 focus-visible:ring-[#1F1F68]"
                {...form.register("emailOrUsername")}
              />
              {form.formState.errors.emailOrUsername && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {form.formState.errors.emailOrUsername.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => setShowForgotDialog(true)}
                  className="text-xs font-medium focus:outline-none focus-visible:underline"
                  style={{ color: "#1F1F68" }}
                  data-testid="button-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="pr-10 h-10 focus-visible:ring-[#1F1F68]"
                  data-testid="input-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F1F68] rounded-r-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-password"
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 mb-5 mt-3">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-gray-300 data-[state=checked]:bg-[#1F1F68] data-[state=checked]:border-[#1F1F68]"
                data-testid="checkbox-remember-me"
              />
              <Label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
                Remember me
              </Label>
            </div>

            {/* Sign In button */}
            <Button
              type="submit"
              className="w-full h-10 font-semibold text-sm focus-visible:ring-[#1F1F68] focus-visible:ring-offset-2"
              style={{ background: "#1F1F68" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#2d2d8a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1F1F68")}
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign In
            </Button>
          </form>

          {/* Account note */}
          <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
            Don't have an account? Contact your administrator for an invitation.
          </p>

          {/* ── Powered by NexCopy ── */}
          <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col items-center gap-2">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium">
              Powered by
            </p>
            <img
              src="/nexcopy-logo.png"
              alt="NexCopy"
              className="opacity-70 hover:opacity-90 transition-opacity"
              style={{ height: "28px", width: "auto", maxWidth: "160px" }}
              loading="lazy"
            />
          </div>

        </div>
      </div>

      {/* ══ FORGOT PASSWORD DIALOG ═══════════════════════════════════════════════ */}
      <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5" style={{ color: "#1F1F68" }} />
              <DialogTitle>Forgot Your Password?</DialogTitle>
            </div>
            <DialogDescription>
              Password resets for DriverHub 360 are managed by your administrator.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Contact your DriverHub administrator or IT support team to have your
            password reset. They can reset your credentials and send you a new
            temporary password.
          </p>
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setShowForgotDialog(false)}
              data-testid="button-forgot-close"
            >
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ FORCED PASSWORD RESET DIALOG ════════════════════════════════════════ */}
      <Dialog open={showResetDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <DialogTitle>Set a New Password</DialogTitle>
            </div>
            <DialogDescription>
              For your security, you must set a new password before accessing the platform.
              Your password must meet all requirements below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={resetForm.handleSubmit(onChangePassword)} className="space-y-4 pt-2">
            {resetError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resetError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  data-testid="input-current-password"
                  {...resetForm.register("currentPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground
                             hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-current-password"
                  tabIndex={0}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {resetForm.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  data-testid="input-new-password"
                  {...resetForm.register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground
                             hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-new-password"
                  tabIndex={0}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={newPasswordValue} />
              {resetForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                data-testid="input-confirm-password"
                {...resetForm.register("confirmPassword")}
              />
              {resetForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={changePasswordMutation.isPending || !resetForm.formState.isValid}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set New Password &amp; Sign In
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ MFA DIALOG ═══════════════════════════════════════════════════════════ */}
      <Dialog open={isMfaDialogOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>

          {/* Step: Phone Enrollment */}
          {mfaStep === "enrollment_required" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
                </div>
                <DialogDescription>
                  Your account requires two-factor authentication. Enter your mobile number
                  to receive a verification code via SMS.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEnrollSubmit} className="space-y-4 pt-2">
                {mfaError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{mfaError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mfa-phone">Mobile Phone Number</Label>
                  <Input
                    id="mfa-phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={mfaPhone}
                    onChange={(e) => setMfaPhone(e.target.value)}
                    autoComplete="tel"
                    data-testid="input-mfa-phone"
                  />
                  <p className="text-xs text-muted-foreground">
                    US numbers: 10 digits. International: include country code.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={mfaEnrollMutation.isPending || !mfaPhone.trim()}
                  data-testid="button-mfa-send-enrollment"
                >
                  {mfaEnrollMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send Verification Code
                </Button>
              </form>
            </>
          )}

          {/* Step: Enrollment OTP Verify */}
          {mfaStep === "enrollment_verify" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <DialogTitle>Enter Verification Code</DialogTitle>
                </div>
                <DialogDescription>
                  A 6-digit code was sent to{" "}
                  <span className="font-medium">{mfaMaskedPhone || "your phone"}</span>.
                  Enter it below to enroll your number. Codes expire in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleConfirmEnroll} className="space-y-4 pt-2">
                {mfaError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{mfaError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mfa-enroll-code">Verification Code</Label>
                  <Input
                    id="mfa-enroll-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-xl tracking-widest"
                    autoComplete="one-time-code"
                    data-testid="input-mfa-enroll-code"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={mfaConfirmEnrollMutation.isPending || mfaCode.length !== 6}
                  data-testid="button-mfa-confirm-enrollment"
                >
                  {mfaConfirmEnrollMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify &amp; Complete Setup
                </Button>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setMfaStep("enrollment_required"); setMfaCode(""); setMfaError(null); }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                    data-testid="button-mfa-change-phone"
                  >
                    Use a different number
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={mfaResendCooldown > 0 || mfaResendMutation.isPending}
                    onClick={() => { setMfaError(null); mfaResendMutation.mutate(); }}
                    data-testid="button-mfa-resend"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {mfaResendCooldown > 0 ? `Resend in ${mfaResendCooldown}s` : "Resend Code"}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* Step: OTP Challenge (enrolled user) */}
          {mfaStep === "otp_required" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <DialogTitle>Two-Factor Authentication</DialogTitle>
                </div>
                <DialogDescription>
                  A 6-digit code was sent to{" "}
                  <span className="font-medium">{mfaMaskedPhone || "your registered phone"}</span>.
                  Enter it below to sign in. Codes expire in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleVerifyOtp} className="space-y-4 pt-2">
                {mfaError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{mfaError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mfa-otp-code">Verification Code</Label>
                  <Input
                    id="mfa-otp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-xl tracking-widest"
                    autoComplete="one-time-code"
                    data-testid="input-mfa-otp-code"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={mfaVerifyMutation.isPending || mfaCode.length !== 6}
                  data-testid="button-mfa-verify"
                >
                  {mfaVerifyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify &amp; Sign In
                </Button>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={mfaResendCooldown > 0 || mfaResendMutation.isPending}
                    onClick={() => { setMfaError(null); mfaResendMutation.mutate(); }}
                    data-testid="button-mfa-resend-otp"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {mfaResendCooldown > 0 ? `Resend in ${mfaResendCooldown}s` : "Resend Code"}
                  </Button>
                </div>
              </form>
            </>
          )}

        </DialogContent>
      </Dialog>
    </div>
  );
}
