import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2, Eye, EyeOff, AlertCircle, ShieldCheck,
  Smartphone, KeyRound, RotateCcw, Check, X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import heroBg from "@/assets/landing-hero.png";

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

function PasswordStrengthIndicator({ password }: { password: string }) {
  const rules = [
    { label: "At least 10 characters", met: password.length >= 10 },
    { label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { label: "One number (0–9)", met: /[0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {rules.map((rule) => (
        <li key={rule.label} className="flex items-center gap-2 text-xs">
          {rule.met
            ? <Check className="h-3 w-3 text-green-400 shrink-0" />
            : <X className="h-3 w-3 text-white/40 shrink-0" />}
          <span className={rule.met ? "text-green-300" : "text-white/50"}>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [mfaStep, setMfaStep] = useState<MfaStep>("none");
  const [mfaMaskedPhone, setMfaMaskedPhone] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaPhone, setMfaPhone] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaResendCooldown, setMfaResendCooldown] = useState(0);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { emailOrUsername: "", password: "" },
  });

  const resetForm = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPasswordValue = resetForm.watch("newPassword") ?? "";

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.requiresPasswordReset) {
        resetForm.setValue("currentPassword", form.getValues("password"));
        setShowResetDialog(true);
        return;
      }
      if (data.mfaStatus === "enrollment_required") { setMfaStep("enrollment_required"); return; }
      if (data.mfaStatus === "otp_required") { setMfaStep("otp_required"); setMfaMaskedPhone(data.maskedPhone || null); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => setError(err?.message || "Login failed. Please try again."),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordData) => {
      const res = await apiRequest("POST", "/api/auth/forced-reset", {
        email: form.getValues("emailOrUsername"),
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      setShowResetDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (err: any) => setResetError(err?.message || "Failed to change password."),
  });

  const mfaEnrollMutation = useMutation({
    mutationFn: async (phoneNumber: string) => { const res = await apiRequest("POST", "/api/auth/mfa/enroll", { phoneNumber }); return res.json(); },
    onSuccess: (data) => { setMfaError(null); setMfaMaskedPhone(data.maskedPhone || null); setMfaStep("enrollment_verify"); setMfaCode(""); startResendCooldown(); },
    onError: (err: any) => setMfaError(err?.message || "Failed to send verification code."),
  });

  const mfaConfirmEnrollMutation = useMutation({
    mutationFn: async (code: string) => { const res = await apiRequest("POST", "/api/auth/mfa/confirm-enrollment", { code }); return res.json(); },
    onSuccess: () => { setMfaStep("none"); queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); navigate("/"); },
    onError: (err: any) => setMfaError(err?.message || "Invalid code. Please try again."),
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: async (code: string) => { const res = await apiRequest("POST", "/api/auth/mfa/verify", { code }); return res.json(); },
    onSuccess: () => { setMfaStep("none"); queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); navigate("/"); },
    onError: (err: any) => setMfaError(err?.message || "Invalid code. Please try again."),
  });

  const mfaResendMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/auth/mfa/resend", {}); return res.json(); },
    onSuccess: (data) => { setMfaError(null); if (data.maskedPhone) setMfaMaskedPhone(data.maskedPhone); startResendCooldown(); },
    onError: (err: any) => setMfaError(err?.message || "Failed to resend code."),
  });

  function startResendCooldown(seconds = 30) {
    setMfaResendCooldown(seconds);
    const interval = setInterval(() => {
      setMfaResendCooldown((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
  }

  const handleEnterPlatform = () => {
    setShowForm(true);
    setTimeout(() => {
      setFormVisible(true);
      setTimeout(() => emailInputRef.current?.focus(), 80);
    }, 20);
  };

  const onSubmit = (data: LoginFormData) => { setError(null); loginMutation.mutate(data); };
  const onChangePassword = (data: ChangePasswordData) => { setResetError(null); changePasswordMutation.mutate(data); };

  const isMfaDialogOpen = mfaStep !== "none";

  const { ref: emailRegRef, ...emailRegRest } = form.register("emailOrUsername");
  const { ref: passwordRegRef, ...passwordRegRest } = form.register("password");

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundColor: "#000",
        }}
      >
        {/* Gradient wash — ensures text/form readability over any part of the image */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.72) 80%, rgba(0,0,0,0.88) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* CTA / Form — anchored to bottom third */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingBottom: "clamp(2.5rem, 8vh, 5rem)",
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
        >
          {/* "Enter Platform" button — hidden once form is shown */}
          <div
            style={{
              opacity: showForm ? 0 : 1,
              transform: showForm ? "translateY(8px)" : "translateY(0)",
              transition: "opacity 0.25s ease, transform 0.25s ease",
              pointerEvents: showForm ? "none" : "auto",
              position: showForm ? "absolute" : "relative",
            }}
          >
            <button
              onClick={handleEnterPlatform}
              data-testid="button-enter-platform"
              style={{
                backgroundColor: "#FF6B35",
                color: "#fff",
                fontFamily: "inherit",
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: "none",
                borderRadius: "0.375rem",
                height: "3.25rem",
                paddingLeft: "3.5rem",
                paddingRight: "3.5rem",
                cursor: "pointer",
                boxShadow: "0 8px 40px rgba(255,107,53,0.35), 0 2px 12px rgba(0,0,0,0.55)",
                transition: "opacity 0.15s ease, transform 0.15s ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
            >
              Enter Platform
            </button>
          </div>

          {/* Inline login form — fades in when showForm=true */}
          <div
            style={{
              width: "100%",
              maxWidth: "22rem",
              opacity: formVisible ? 1 : 0,
              transform: formVisible ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 0.3s ease, transform 0.3s ease",
              pointerEvents: formVisible ? "auto" : "none",
              display: showForm ? "block" : "none",
            }}
          >
            {/* Translucent dark glass panel */}
            <div
              style={{
                background: "rgba(10, 10, 12, 0.72)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: "0.75rem",
                border: "1px solid rgba(255,255,255,0.10)",
                padding: "1.75rem",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              }}
            >
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                <div style={{ marginBottom: "1.25rem" }}>
                  <label
                    htmlFor="landing-email"
                    style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "rgba(255,255,255,0.75)", marginBottom: "0.4rem" }}
                  >
                    Email
                  </label>
                  <input
                    id="landing-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    data-testid="input-email"
                    ref={(el) => { emailRegRef(el); (emailInputRef as any).current = el; }}
                    {...emailRegRest}
                    style={{
                      width: "100%",
                      height: "2.75rem",
                      borderRadius: "0.375rem",
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.07)",
                      color: "#fff",
                      fontSize: "0.9375rem",
                      paddingLeft: "0.875rem",
                      paddingRight: "0.875rem",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s ease",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#FF6B35"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
                  />
                  {form.formState.errors.emailOrUsername && (
                    <p style={{ color: "#f87171", fontSize: "0.75rem", marginTop: "0.3rem" }}>
                      {form.formState.errors.emailOrUsername.message}
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="landing-password"
                    style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "rgba(255,255,255,0.75)", marginBottom: "0.4rem" }}
                  >
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="landing-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      data-testid="input-password"
                      ref={(el) => { passwordRegRef(el); }}
                      {...passwordRegRest}
                      style={{
                        width: "100%",
                        height: "2.75rem",
                        borderRadius: "0.375rem",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.07)",
                        color: "#fff",
                        fontSize: "0.9375rem",
                        paddingLeft: "0.875rem",
                        paddingRight: "2.75rem",
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s ease",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#FF6B35"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      data-testid="button-toggle-password"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: "2.75rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "none",
                        border: "none",
                        color: "rgba(255,255,255,0.45)",
                        cursor: "pointer",
                        transition: "color 0.15s ease",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
                    >
                      {showPassword ? <EyeOff style={{ width: "1rem", height: "1rem" }} /> : <Eye style={{ width: "1rem", height: "1rem" }} />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p style={{ color: "#f87171", fontSize: "0.75rem", marginTop: "0.3rem" }}>
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {error && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.35)",
                      borderRadius: "0.375rem",
                      padding: "0.625rem 0.75rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <AlertCircle style={{ width: "1rem", height: "1rem", color: "#f87171", flexShrink: 0, marginTop: "0.1rem" }} />
                    <p style={{ color: "#fca5a5", fontSize: "0.8125rem", margin: 0 }}>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                  style={{
                    width: "100%",
                    height: "2.875rem",
                    backgroundColor: loginMutation.isPending ? "rgba(255,107,53,0.6)" : "#FF6B35",
                    color: "#fff",
                    fontFamily: "inherit",
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: loginMutation.isPending ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    boxShadow: "0 4px 20px rgba(255,107,53,0.3)",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  {loginMutation.isPending && (
                    <Loader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite" }} />
                  )}
                  Sign In
                </button>
              </form>
            </div>

            {/* Back link */}
            <div style={{ textAlign: "center", marginTop: "0.875rem" }}>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormVisible(false); setError(null); form.reset(); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
                data-testid="button-back-to-splash"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Forced Password Reset Dialog ──────────────────────────────── */}
      <Dialog open={showResetDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <DialogTitle>Set a New Password</DialogTitle>
            </div>
            <DialogDescription>
              For your security, you must set a new password before accessing the platform.
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
              <label className="text-sm font-medium" htmlFor="rp-current">Current Password</label>
              <div className="relative">
                <input
                  id="rp-current"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm pr-10 focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-current-password"
                  {...resetForm.register("currentPassword")}
                />
                <button type="button" onClick={() => setShowCurrentPassword((v) => !v)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground" data-testid="button-toggle-current-password">
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {resetForm.formState.errors.currentPassword && <p className="text-sm text-destructive">{resetForm.formState.errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rp-new">New Password</label>
              <div className="relative">
                <input
                  id="rp-new"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm pr-10 focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-new-password"
                  {...resetForm.register("newPassword")}
                />
                <button type="button" onClick={() => setShowNewPassword((v) => !v)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground" data-testid="button-toggle-new-password">
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={newPasswordValue} />
              {resetForm.formState.errors.newPassword && <p className="text-sm text-destructive">{resetForm.formState.errors.newPassword.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rp-confirm">Confirm New Password</label>
              <input
                id="rp-confirm"
                type="password"
                autoComplete="new-password"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-confirm-password"
                {...resetForm.register("confirmPassword")}
              />
              {resetForm.formState.errors.confirmPassword && <p className="text-sm text-destructive">{resetForm.formState.errors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
              {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set New Password & Sign In
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MFA Dialog ──────────────────────────────────────────────── */}
      <Dialog open={isMfaDialogOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>

          {mfaStep === "enrollment_required" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
                </div>
                <DialogDescription>
                  Your account requires two-factor authentication. Enter your mobile number to receive a verification code via SMS.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (!mfaPhone.trim()) return; setMfaError(null); mfaEnrollMutation.mutate(mfaPhone.trim()); }} className="space-y-4 pt-2">
                {mfaError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{mfaError}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mfa-phone">Mobile Phone Number</label>
                  <input id="mfa-phone" type="tel" placeholder="+1 (555) 000-0000" value={mfaPhone} onChange={(e) => setMfaPhone(e.target.value)} autoComplete="tel" data-testid="input-mfa-phone"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground">US numbers: 10 digits. International: include country code.</p>
                </div>
                <Button type="submit" className="w-full" disabled={mfaEnrollMutation.isPending || !mfaPhone.trim()} data-testid="button-mfa-send-enrollment">
                  {mfaEnrollMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send Verification Code
                </Button>
              </form>
            </>
          )}

          {mfaStep === "enrollment_verify" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <DialogTitle>Enter Verification Code</DialogTitle>
                </div>
                <DialogDescription>
                  A 6-digit code was sent to <span className="font-medium">{mfaMaskedPhone || "your phone"}</span>. Codes expire in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (!mfaCode.trim()) return; setMfaError(null); mfaConfirmEnrollMutation.mutate(mfaCode.replace(/\s/g, "")); }} className="space-y-4 pt-2">
                {mfaError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{mfaError}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mfa-enroll-code">Verification Code</label>
                  <input id="mfa-enroll-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="000000"
                    value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm text-center text-xl tracking-widest focus:outline-none focus:ring-1 focus:ring-ring"
                    autoComplete="one-time-code" data-testid="input-mfa-enroll-code" />
                </div>
                <Button type="submit" className="w-full" disabled={mfaConfirmEnrollMutation.isPending || mfaCode.length !== 6} data-testid="button-mfa-confirm-enrollment">
                  {mfaConfirmEnrollMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify &amp; Complete Setup
                </Button>
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => { setMfaStep("enrollment_required"); setMfaCode(""); setMfaError(null); }} className="text-sm text-muted-foreground hover:text-foreground" data-testid="button-mfa-change-phone">
                    Use a different number
                  </button>
                  <Button type="button" variant="ghost" size="sm" disabled={mfaResendCooldown > 0 || mfaResendMutation.isPending} onClick={() => { setMfaError(null); mfaResendMutation.mutate(); }} data-testid="button-mfa-resend">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {mfaResendCooldown > 0 ? `Resend in ${mfaResendCooldown}s` : "Resend Code"}
                  </Button>
                </div>
              </form>
            </>
          )}

          {mfaStep === "otp_required" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <DialogTitle>Two-Factor Authentication</DialogTitle>
                </div>
                <DialogDescription>
                  A 6-digit code was sent to <span className="font-medium">{mfaMaskedPhone || "your registered phone"}</span>. Codes expire in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (!mfaCode.trim()) return; setMfaError(null); mfaVerifyMutation.mutate(mfaCode.replace(/\s/g, "")); }} className="space-y-4 pt-2">
                {mfaError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{mfaError}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mfa-otp-code">Verification Code</label>
                  <input id="mfa-otp-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="000000"
                    value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm text-center text-xl tracking-widest focus:outline-none focus:ring-1 focus:ring-ring"
                    autoComplete="one-time-code" data-testid="input-mfa-otp-code" />
                </div>
                <Button type="submit" className="w-full" disabled={mfaVerifyMutation.isPending || mfaCode.length !== 6} data-testid="button-mfa-verify">
                  {mfaVerifyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify &amp; Sign In
                </Button>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" disabled={mfaResendCooldown > 0 || mfaResendMutation.isPending} onClick={() => { setMfaError(null); mfaResendMutation.mutate(); }} data-testid="button-mfa-resend-otp">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {mfaResendCooldown > 0 ? `Resend in ${mfaResendCooldown}s` : "Resend Code"}
                  </Button>
                </div>
              </form>
            </>
          )}

        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.28); }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff;
          -webkit-box-shadow: 0 0 0px 1000px rgba(20,20,25,0.85) inset;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </>
  );
}
