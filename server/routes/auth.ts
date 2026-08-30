import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, withDbRetry } from "../db";
import { users, superAdminAuditLog } from "@shared/schema";
import { eq, or, and, sql } from "drizzle-orm";
import {
  isMfaRequiredForUser,
  sendMfaOtp,
  verifyMfaOtp,
  sendEnrollmentOtp,
  confirmEnrollment,
  getMfaStatus,
  isMfaSmsConfigured,
} from "../services/mfaService";

const router = Router();
const RESET_SESSION_TTL_MS = 15 * 60 * 1000;

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

async function establishPasswordSession(
  req: Request,
  userId: string,
  credentialVersion: number,
): Promise<void> {
  await regenerateSession(req);
  const authSession = req.session as any;
  authSession.userId = userId;
  authSession.authMethod = "password";
  authSession.credentialVersion = credentialVersion;
  authSession.mustReset = false;
  await saveSession(req);
}

async function establishPasswordResetSession(
  req: Request,
  userId: string,
  credentialVersion: number,
): Promise<number> {
  await regenerateSession(req);
  const authSession = req.session as any;
  const expiresAt = Date.now() + RESET_SESSION_TTL_MS;
  authSession.passwordResetPending = {
    userId,
    credentialVersion,
    expiresAt,
  };
  await saveSession(req);
  return expiresAt;
}

// ── Password complexity validator ─────────────────────────────────────────────
// Min 10 chars, at least 1 uppercase, 1 lowercase, 1 digit
function meetsComplexity(password: string): { ok: boolean; message?: string } {
  if (password.length < 10) return { ok: false, message: "Password must be at least 10 characters" };
  if (!/[A-Z]/.test(password)) return { ok: false, message: "Password must contain at least one uppercase letter" };
  if (!/[a-z]/.test(password)) return { ok: false, message: "Password must contain at least one lowercase letter" };
  if (!/[0-9]/.test(password)) return { ok: false, message: "Password must contain at least one number" };
  return { ok: true };
}

// ── Audit helper ──────────────────────────────────────────────────────────────
async function logAuthAudit(
  userId: string,
  email: string,
  action: string,
  ipAddress?: string,
  details?: any
): Promise<void> {
  try {
    await db.insert(superAdminAuditLog).values({
      actorId: userId,
      actorEmail: email || "",
      action,
      category: "auth",
      targetType: "user",
      targetId: userId,
      targetLabel: email,
      details: details ?? null,
      ipAddress: ipAddress ?? null,
    });
  } catch (err) {
    console.error("[Auth] Failed to log audit event:", err);
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: validation.error.errors[0]?.message,
      });
    }

    const { emailOrUsername, password } = validation.data;
    const canonicalEmail = emailOrUsername.trim().toLowerCase();

    const rows = await withDbRetry(() =>
      db.select()
        .from(users)
        .where(sql`lower(trim(${users.email})) = ${canonicalEmail}`)
        .limit(1)
    );
    const [user] = rows;

    if (!user) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }

    if (!user.passwordHash || user.passwordHash.trim() === "") {
      return res.status(401).json({
        error: "NO_PASSWORD_SET",
        message: "Password login not enabled for this account. Use SSO login.",
      });
    }

    if (user.status === "DISABLED") {
      return res.status(403).json({ error: "ACCOUNT_DISABLED", message: "Your account has been disabled. Contact your administrator." });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Contact your administrator." });
    }

    if (user.status === "INVITED") {
      return res.status(403).json({
        error: "INVITE_PENDING",
        message: "Please complete your invitation to set your password.",
      });
    }

    // Validate credentials FIRST — must_reset_password does NOT cause INVALID_CREDENTIALS
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }

    const responseUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      orgId: user.orgId,
      isProvisioned: user.isProvisioned,
      isRootSuperAdmin: user.isRootSuperAdmin ?? false,
    };

    // Check if account is security-suspended (CRITICAL risk level)
    if (user.securitySuspendedUntil && user.securitySuspendedUntil > new Date()) {
      return res.status(423).json({
        error: "ACCOUNT_SUSPENDED",
        message: "Your account has been temporarily suspended due to security concerns. Please contact your administrator.",
        suspendedUntil: user.securitySuspendedUntil,
      });
    }

    // Check if password reset is required (takes precedence over MFA)
    if (user.forcePasswordReset) {
      const passwordResetExpiresAt = await establishPasswordResetSession(
        req,
        user.id,
        user.passwordSetAt?.getTime() ?? 0,
      );
      logAuthAudit(user.id, user.email || "", "PASSWORD_RESET_REQUIRED",
        req.ip, { reason: "forcePasswordReset flag set" });
      return res.json({
        success: true,
        requiresPasswordReset: true,
        passwordResetExpiresAt,
        user: responseUser,
      });
    }

    // Check if MFA is required for this user
    const mfaNeeded = isMfaRequiredForUser(user);
    if (mfaNeeded) {
      // Check lockout first
      if (user.mfaLockoutUntil && user.mfaLockoutUntil > new Date()) {
        return res.status(423).json({
          error: "MFA_LOCKED_OUT",
          message: "Account temporarily locked due to too many failed attempts. Please try again later.",
          lockoutUntil: user.mfaLockoutUntil,
        });
      }

      const enrolled = !!user.mfaPhoneNumber;

      if (!enrolled) {
        // Must enroll a phone first
        (req.session as any).mfaPending = { userId: user.id, step: "enrollment" };
        return res.status(202).json({
          success: true,
          mfaStatus: "enrollment_required",
          message: "Two-factor authentication is required for your account. Please enroll a phone number.",
          user: responseUser,
        });
      }

      // Enrolled — send OTP and require challenge
      const sendResult = await sendMfaOtp(user.id);
      (req.session as any).mfaPending = { userId: user.id, step: "otp" };

      if (!sendResult.success) {
        if (sendResult.errorCode === "SMS_NOT_CONFIGURED") {
          // SMS not configured — skip MFA (dev mode)
          console.warn(`[Auth] MFA required for ${user.email} but SMS not configured — bypassing in dev`);
        } else {
          return res.status(202).json({
            success: true,
            mfaStatus: "otp_required",
            maskedPhone: null,
            sendError: sendResult.error,
            message: "Verification code could not be sent. Please use the resend option.",
            user: responseUser,
          });
        }
      } else {
        return res.status(202).json({
          success: true,
          mfaStatus: "otp_required",
          maskedPhone: sendResult.maskedPhone,
          message: `A verification code was sent to ${sendResult.maskedPhone}`,
          user: responseUser,
        });
      }
    }

    await establishPasswordSession(
      req,
      user.id,
      user.passwordSetAt?.getTime() ?? 0,
    );

    // Normal successful login — update lastLoginAt
    try {
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
    } catch (err) {
      console.error("[Auth] Failed to update lastLoginAt (non-blocking):", err);
    }

    res.json({ success: true, user: responseUser });
  } catch (error: any) {
    const msg: string = error?.message || "";
    const isDbDisabled =
      msg.includes("endpoint has been disabled") ||
      msg.includes("endpoint is disabled") ||
      msg.includes("Control plane request failed");
    if (isDbDisabled) {
      console.error("[Auth] Login blocked — Neon endpoint is disabled:", msg);
      return res.status(503).json({
        error: "DATABASE_UNAVAILABLE",
        message: "The system database is temporarily offline. Please try again in a moment, or contact your administrator.",
      });
    }
    console.error("[Auth] Login error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Login failed. Please try again." });
  }
});

// ── POST /forced-reset ────────────────────────────────────────────────────────
// Handles the mandatory first-login password reset.
const forcedResetSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(10, "New password must be at least 10 characters"),
  confirmPassword: z.string().min(1, "New password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

router.post("/forced-reset", async (req: Request, res: Response) => {
  try {
    const resetSession = (req.session as any)?.passwordResetPending;
    if (!resetSession?.userId || typeof resetSession.expiresAt !== "number") {
      return res.status(401).json({
        error: "RESET_SESSION_REQUIRED",
        message: "Your password reset session is missing. Please sign in again.",
      });
    }
    if (resetSession.expiresAt <= Date.now()) {
      await regenerateSession(req);
      await saveSession(req);
      return res.status(401).json({
        error: "RESET_SESSION_EXPIRED",
        message: "Your password reset session has expired. Please sign in again to continue.",
      });
    }

    const validation = forcedResetSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const { currentPassword, newPassword } = validation.data;

    const [user] = await db.select().from(users).where(eq(users.id, resetSession.userId)).limit(1);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid password reset session" });
    }
    const currentPasswordHash = user.passwordHash;

    if (user.status === "DISABLED" || user.status === "SUSPENDED") {
      return res.status(403).json({ error: "ACCOUNT_INACTIVE", message: "Your account is inactive. Contact your administrator." });
    }

    const currentCredentialVersion = user.passwordSetAt?.getTime() ?? 0;
    if (resetSession.credentialVersion !== currentCredentialVersion) {
      return res.status(409).json({
        error: "CREDENTIALS_CHANGED",
        message: "Your credentials changed during this reset. Please sign in again.",
      });
    }

    const isValid = await bcrypt.compare(currentPassword, currentPasswordHash);
    if (!isValid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }

    if (!user.forcePasswordReset) {
      return res.status(400).json({ error: "RESET_NOT_REQUIRED", message: "Password reset is not required for this account. Use the standard change-password flow." });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: "SAME_PASSWORD", message: "New password must differ from your current password" });
    }

    // Enforce complexity
    const complexity = meetsComplexity(newPassword);
    if (!complexity.ok) {
      return res.status(400).json({ error: "WEAK_PASSWORD", message: complexity.message });
    }

    const now = new Date();
    const newHash = await bcrypt.hash(newPassword, 12);

    const updatedUser = await db.transaction(async (tx) => {
      const [persisted] = await tx.update(users)
        .set({
          passwordHash: newHash,
          forcePasswordReset: false,
          status: "ACTIVE",
          passwordSetAt: now,
          firstLoginCompletedAt: now,
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(users.id, user.id),
          eq(users.passwordHash, currentPasswordHash),
          eq(users.forcePasswordReset, true),
        ))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          orgId: users.orgId,
          isProvisioned: users.isProvisioned,
          isRootSuperAdmin: users.isRootSuperAdmin,
          passwordHash: users.passwordHash,
          passwordSetAt: users.passwordSetAt,
        });

      if (!persisted || persisted.passwordHash !== newHash) {
        throw Object.assign(new Error("Credentials changed during password reset"), {
          code: "CREDENTIALS_CHANGED",
        });
      }

      const persistedNewPassword = await bcrypt.compare(newPassword, persisted.passwordHash);
      const persistedOldPassword = await bcrypt.compare(currentPassword, persisted.passwordHash);
      if (!persistedNewPassword || persistedOldPassword) {
        throw new Error("Password reset persistence verification failed");
      }
      return persisted;
    });

    // Only issue a full application session after the credential transaction
    // commits and the persisted replacement hash has been verified.
    await establishPasswordSession(
      req,
      updatedUser.id,
      updatedUser.passwordSetAt?.getTime() ?? now.getTime(),
    );

    console.log(`[Auth] Forced password reset completed for user: ${user.id} (${user.email})`);

    // Audit log (non-blocking)
    logAuthAudit(user.id, user.email || "", "PASSWORD_RESET_COMPLETED",
      req.ip, { method: "forced_reset" });

    res.json({
      success: true,
      message: "Password set successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        orgId: updatedUser.orgId,
        isProvisioned: updatedUser.isProvisioned,
        isRootSuperAdmin: updatedUser.isRootSuperAdmin ?? false,
      },
    });
  } catch (error: any) {
    if (error?.code === "CREDENTIALS_CHANGED") {
      return res.status(409).json({
        error: "CREDENTIALS_CHANGED",
        message: "Your credentials changed during this request. Please sign in again.",
      });
    }
    console.error("[Auth] Forced reset error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reset password. Please try again." });
  }
});

// ── POST /change-password ─────────────────────────────────────────────────────
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(10, "New password must be at least 10 characters"),
});

router.post("/change-password", async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req.session as any)?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Not logged in" });
    }

    const validation = changePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const { currentPassword, newPassword } = validation.data;

    const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);
    if (!user || !user.passwordHash) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Current password is incorrect" });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: "SAME_PASSWORD", message: "New password must differ from current password" });
    }

    const complexity = meetsComplexity(newPassword);
    if (!complexity.ok) {
      return res.status(400).json({ error: "WEAK_PASSWORD", message: complexity.message });
    }

    const now = new Date();
    const newHash = await bcrypt.hash(newPassword, 12);
    const [updatedUser] = await db.update(users)
      .set({ passwordHash: newHash, forcePasswordReset: false, passwordSetAt: now, updatedAt: now })
      .where(and(eq(users.id, sessionUserId), eq(users.passwordHash, user.passwordHash)))
      .returning({ passwordSetAt: users.passwordSetAt });

    if (!updatedUser) {
      return res.status(409).json({ error: "CREDENTIALS_CHANGED", message: "Your credentials changed during this request. Please sign in again." });
    }
    (req.session as any).credentialVersion = updatedUser.passwordSetAt?.getTime() ?? now.getTime();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("[Auth] Change password error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to change password. Please try again." });
  }
});

// ── POST /logout ──────────────────────────────────────────────────────────────
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[Auth] Logout error:", err);
      return res.status(500).json({ error: "LOGOUT_FAILED", message: "Failed to logout" });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// ── POST /accept-invite ───────────────────────────────────────────────────────
router.post("/accept-invite", async (req: Request, res: Response) => {
  try {
    const validation = acceptInviteSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: validation.error.errors[0]?.message,
      });
    }

    const { token, password, firstName, lastName } = validation.data;

    const [user] = await db.select()
      .from(users)
      .where(eq(users.inviteToken, token))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "INVALID_TOKEN", message: "Invalid or expired invite token" });
    }

    if (user.status !== "INVITED") {
      return res.status(400).json({ error: "ALREADY_ACTIVATED", message: "This invitation has already been used" });
    }

    if (user.inviteTokenExpiresAt && new Date() > user.inviteTokenExpiresAt) {
      return res.status(400).json({ error: "TOKEN_EXPIRED", message: "This invitation has expired. Contact your administrator for a new invite." });
    }

    const complexity = meetsComplexity(password);
    if (!complexity.ok) {
      return res.status(400).json({ error: "WEAK_PASSWORD", message: complexity.message });
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.update(users)
      .set({
        firstName,
        lastName,
        passwordHash,
        status: "ACTIVE",
        isProvisioned: true,
        forcePasswordReset: false,
        passwordSetAt: now,
        firstLoginCompletedAt: now,
        lastLoginAt: now,
        inviteToken: null,
        inviteTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    (req.session as any).userId = user.id;
    (req.session as any).authMethod = "password";
    (req.session as any).mustReset = false;
    (req.session as any).credentialVersion = now.getTime();

    logAuthAudit(user.id, user.email || "", "PASSWORD_RESET_COMPLETED",
      req.ip, { method: "invite_acceptance" });

    res.json({
      success: true,
      message: "Account activated successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName,
        lastName,
        role: user.role,
        orgId: user.orgId,
        isProvisioned: true,
      },
    });
  } catch (error) {
    console.error("[Auth] Accept invite error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to accept invitation. Please try again." });
  }
});

// ── GET /invite/:token ────────────────────────────────────────────────────────
router.get("/invite/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const [user] = await db.select({
      email: users.email,
      role: users.role,
      status: users.status,
      inviteTokenExpiresAt: users.inviteTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.inviteToken, token))
    .limit(1);

    if (!user) {
      return res.status(404).json({ error: "INVALID_TOKEN", message: "Invalid invite token" });
    }

    if (user.status !== "INVITED") {
      return res.status(400).json({ error: "ALREADY_ACTIVATED", message: "This invitation has already been used" });
    }

    if (user.inviteTokenExpiresAt && new Date() > user.inviteTokenExpiresAt) {
      return res.status(400).json({ error: "TOKEN_EXPIRED", message: "This invitation has expired" });
    }

    res.json({
      email: user.email,
      role: user.role,
      valid: true,
    });
  } catch (error) {
    console.error("[Auth] Get invite error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to verify invitation" });
  }
});

// ── POST /dev-reset-password (dev/staging only) ───────────────────────────────
const devResetSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(8),
  adminSecret: z.string(),
});

router.post("/dev-reset-password", async (req: Request, res: Response) => {
  const devSecret = process.env.DEV_RESET_SECRET;

  if (!devSecret) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not available" });
  }

  try {
    const validation = devResetSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: validation.error.errors[0]?.message,
      });
    }

    const { email, newPassword, adminSecret } = validation.data;

    if (adminSecret !== devSecret) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Invalid admin secret" });
    }

    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users)
      .set({ passwordHash, status: "ACTIVE", updatedAt: new Date() })
      .where(eq(users.id, user.id));

    console.log("[Auth] DEV: Password reset for user:", user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Auth] Dev reset password error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reset password" });
  }
});

// ── Bootstrap token routes ────────────────────────────────────────────────────
// Allows root super admin to set/reset their password using a server-side secret token.

const bootstrapSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(10, "Password must be at least 10 characters"),
});

router.get("/bootstrap/verify", async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  const envToken = process.env.ROOT_SUPER_ADMIN_BOOTSTRAP_TOKEN;

  if (!envToken) {
    return res.status(404).json({ error: "NOT_CONFIGURED", message: "Bootstrap token not configured on this server" });
  }
  if (!token || token !== envToken) {
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired bootstrap token" });
  }

  const [admin] = await db.select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.isRootSuperAdmin, true))
    .limit(1);

  if (!admin) {
    return res.status(404).json({ error: "NO_ADMIN", message: "Root super admin account not found" });
  }

  res.json({ valid: true, email: admin.email });
});

router.post("/bootstrap", async (req: Request, res: Response) => {
  const envToken = process.env.ROOT_SUPER_ADMIN_BOOTSTRAP_TOKEN;

  if (!envToken) {
    return res.status(404).json({ error: "NOT_CONFIGURED", message: "Bootstrap token not configured on this server" });
  }

  const validation = bootstrapSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
  }

  const { token, newPassword } = validation.data;

  if (token !== envToken) {
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired bootstrap token" });
  }

  const [admin] = await db.select()
    .from(users)
    .where(eq(users.isRootSuperAdmin, true))
    .limit(1);

  if (!admin) {
    return res.status(404).json({ error: "NO_ADMIN", message: "Root super admin account not found" });
  }

  const complexity = meetsComplexity(newPassword);
  if (!complexity.ok) {
    return res.status(400).json({ error: "WEAK_PASSWORD", message: complexity.message });
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.update(users)
    .set({ passwordHash, forcePasswordReset: false, status: "ACTIVE", passwordSetAt: now, updatedAt: now })
    .where(eq(users.id, admin.id));

  console.log(`[Auth] Bootstrap password reset completed for root super admin: ${admin.id}`);

  (req.session as any).userId = admin.id;
  (req.session as any).authMethod = "password";
  (req.session as any).mustReset = false;

  res.json({
    success: true,
    message: "Password set successfully",
    user: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      isRootSuperAdmin: true,
    },
  });
});

// ── MFA Routes ────────────────────────────────────────────────────────────────
// All MFA routes require session.mfaPending to be set (set during login).
// They are exempt from isAuthenticated middleware (handled inline).

// GET /api/auth/mfa/status — check MFA status for current session user
router.get("/mfa/status", async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req.session as any)?.userId;
    const mfaPending = (req.session as any)?.mfaPending;
    const userId = sessionUserId || mfaPending?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHENTICATED", message: "Not logged in" });

    const status = await getMfaStatus(userId);
    res.json({ ...status, smsConfigured: isMfaSmsConfigured() });
  } catch (error) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to get MFA status" });
  }
});

// POST /api/auth/mfa/enroll — initiate phone enrollment (sends OTP to new phone)
router.post("/mfa/enroll", async (req: Request, res: Response) => {
  try {
    const mfaPending = (req.session as any)?.mfaPending;
    if (!mfaPending?.userId || mfaPending.step !== "enrollment") {
      return res.status(403).json({ error: "INVALID_SESSION", message: "No pending MFA enrollment session" });
    }

    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Phone number is required" });
    }

    const result = await sendEnrollmentOtp(mfaPending.userId, phoneNumber);
    if (!result.success) {
      const status = result.errorCode === "MFA_LOCKED_OUT" ? 423 : result.errorCode === "RESEND_LIMIT_EXCEEDED" ? 429 : 400;
      return res.status(status).json({ error: result.errorCode, message: result.error });
    }

    // Store pending phone number in session for verification step
    (req.session as any).mfaPending = {
      ...mfaPending,
      step: "enrollment_verify",
      pendingPhone: phoneNumber,
    };

    res.json({ success: true, maskedPhone: result.maskedPhone, message: `Verification code sent to ${result.maskedPhone}` });
  } catch (error) {
    console.error("[Auth] MFA enroll error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to send enrollment code" });
  }
});

// POST /api/auth/mfa/confirm-enrollment — verify enrollment OTP and save phone
router.post("/mfa/confirm-enrollment", async (req: Request, res: Response) => {
  try {
    const mfaPending = (req.session as any)?.mfaPending;
    if (!mfaPending?.userId || mfaPending.step !== "enrollment_verify" || !mfaPending.pendingPhone) {
      return res.status(403).json({ error: "INVALID_SESSION", message: "No pending enrollment verification" });
    }

    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Verification code is required" });
    }

    const result = await confirmEnrollment(mfaPending.userId, mfaPending.pendingPhone, code);
    if (!result.success) {
      const status = result.errorCode === "MFA_LOCKED_OUT" ? 423 : result.errorCode === "INVALID_OTP" ? 400 : 400;
      return res.status(status).json({ error: result.errorCode, message: result.error, attemptsRemaining: result.attemptsRemaining, lockoutUntil: result.lockoutUntil });
    }

    const [user] = await db.select().from(users).where(eq(users.id, mfaPending.userId)).limit(1);
    if (!user) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Your account could not be resolved. Please sign in again." });
    }

    // Enrollment successful — grant full session
    (req.session as any).userId = mfaPending.userId;
    (req.session as any).authMethod = "password";
    (req.session as any).credentialVersion = user?.passwordSetAt?.getTime() ?? 0;
    (req.session as any).mfaPending = null;

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, mfaPending.userId));
    logAuthAudit(mfaPending.userId, "", "MFA_ENROLLED", (req as any).ip, { provider: "sms" });

    res.json({
      success: true,
      message: "Phone enrolled and verified successfully",
      user: user ? {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, orgId: user.orgId, isProvisioned: user.isProvisioned, isRootSuperAdmin: user.isRootSuperAdmin,
      } : null,
    });
  } catch (error) {
    console.error("[Auth] MFA confirm-enrollment error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to confirm enrollment" });
  }
});

// POST /api/auth/mfa/verify — verify OTP challenge during login
router.post("/mfa/verify", async (req: Request, res: Response) => {
  try {
    const mfaPending = (req.session as any)?.mfaPending;
    if (!mfaPending?.userId || mfaPending.step !== "otp") {
      return res.status(403).json({ error: "INVALID_SESSION", message: "No pending MFA challenge" });
    }

    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Verification code is required" });
    }

    const result = await verifyMfaOtp(mfaPending.userId, code);
    if (!result.success) {
      const status = result.errorCode === "MFA_LOCKED_OUT" ? 423 : 400;
      return res.status(status).json({ error: result.errorCode, message: result.error, attemptsRemaining: result.attemptsRemaining, lockoutUntil: result.lockoutUntil });
    }

    // OTP valid — grant full session
    (req.session as any).userId = mfaPending.userId;
    (req.session as any).authMethod = "password";
    (req.session as any).mfaPending = null;

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, mfaPending.userId));
    logAuthAudit(mfaPending.userId, "", "MFA_VERIFIED", (req as any).ip);

    const [user] = await db.select().from(users).where(eq(users.id, mfaPending.userId)).limit(1);
    (req.session as any).credentialVersion = user?.passwordSetAt?.getTime() ?? 0;
    res.json({
      success: true,
      user: user ? {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, orgId: user.orgId, isProvisioned: user.isProvisioned, isRootSuperAdmin: user.isRootSuperAdmin,
      } : null,
    });
  } catch (error) {
    console.error("[Auth] MFA verify error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to verify code" });
  }
});

// POST /api/auth/mfa/resend — resend OTP to enrolled phone
router.post("/mfa/resend", async (req: Request, res: Response) => {
  try {
    const mfaPending = (req.session as any)?.mfaPending;
    if (!mfaPending?.userId) {
      return res.status(403).json({ error: "INVALID_SESSION", message: "No pending MFA session" });
    }

    if (mfaPending.step === "enrollment_verify" && mfaPending.pendingPhone) {
      const result = await sendEnrollmentOtp(mfaPending.userId, mfaPending.pendingPhone);
      if (!result.success) {
        const status = result.errorCode === "RESEND_LIMIT_EXCEEDED" ? 429 : result.errorCode === "MFA_LOCKED_OUT" ? 423 : 400;
        return res.status(status).json({ error: result.errorCode, message: result.error });
      }
      return res.json({ success: true, maskedPhone: result.maskedPhone });
    }

    const result = await sendMfaOtp(mfaPending.userId);
    if (!result.success) {
      const status = result.errorCode === "RESEND_LIMIT_EXCEEDED" ? 429 : result.errorCode === "MFA_LOCKED_OUT" ? 423 : 400;
      return res.status(status).json({ error: result.errorCode, message: result.error });
    }

    res.json({ success: true, maskedPhone: result.maskedPhone });
  } catch (error) {
    console.error("[Auth] MFA resend error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resend code" });
  }
});

export default router;
