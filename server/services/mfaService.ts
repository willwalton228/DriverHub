import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// Fire-and-forget security event logging (lazy import avoids circular deps)
function logSec(event: {
  userId?: string | null;
  roleClass?: string | null;
  permissionRiskLevel?: "low" | "high";
  eventType: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}): void {
  import("./securityEventService").then(({ logSecurityEvent }) => {
    logSecurityEvent(event).catch((err) =>
      console.error("[MFA] Security event log failed:", err)
    );
  }).catch(() => {});
}

// ── Constants ──────────────────────────────────────────────────────────────────
const OTP_LENGTH = 6;
const OTP_VALIDITY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// ── SMS Provider Interface ─────────────────────────────────────────────────────
export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  sendSms(to: string, body: string): Promise<SmsSendResult>;
}

// ── Heymarket Provider ─────────────────────────────────────────────────────────
class HeymarketSmsProvider implements SmsProvider {
  name = "heymarket";

  isConfigured(): boolean {
    return !!(process.env.HEYMARKET_API_KEY && process.env.HEYMARKET_2FA_INBOX_ID);
  }

  async sendSms(to: string, body: string): Promise<SmsSendResult> {
    const apiKey = process.env.HEYMARKET_API_KEY;
    const inboxId = process.env.HEYMARKET_2FA_INBOX_ID;

    if (!apiKey || !inboxId) {
      return { success: false, error: "Heymarket not configured" };
    }

    try {
      const response = await fetch("https://api.heymarket.com/messages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: to,
          text: body,
          inbox_id: parseInt(inboxId, 10),
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error(`[MFA:Heymarket] Send failed HTTP ${response.status}:`, text);
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json().catch(() => ({}));
      return { success: true, messageId: String(data.id || "") };
    } catch (err: any) {
      console.error("[MFA:Heymarket] Send error:", err.message);
      return { success: false, error: err.message };
    }
  }
}

// ── Twilio Provider (2FA-dedicated number) ─────────────────────────────────────
class TwilioMfaSmsProvider implements SmsProvider {
  name = "twilio";

  isConfigured(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_2FA_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER)
    );
  }

  async sendSms(to: string, body: string): Promise<SmsSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_2FA_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: "Twilio not configured" };
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("[MFA:Twilio] Send failed:", data);
        return { success: false, error: (data as any).message || `HTTP ${response.status}` };
      }

      const data: any = await response.json();
      return { success: true, messageId: data.sid };
    } catch (err: any) {
      console.error("[MFA:Twilio] Send error:", err.message);
      return { success: false, error: err.message };
    }
  }
}

// ── Provider Selection ─────────────────────────────────────────────────────────
const heymarketProvider = new HeymarketSmsProvider();
const twilioProvider = new TwilioMfaSmsProvider();

export function getMfaSmsProvider(): SmsProvider | null {
  if (heymarketProvider.isConfigured()) return heymarketProvider;
  if (twilioProvider.isConfigured()) return twilioProvider;
  return null;
}

export function isMfaSmsConfigured(): boolean {
  return getMfaSmsProvider() !== null;
}

// ── MFA Feature Flag ───────────────────────────────────────────────────────────
// Set ENABLE_SMS_2FA=true in environment to activate SMS 2FA enforcement.
// When unset or "false", all MFA requirements are bypassed (no enrollment modal,
// no SMS calls, no SMS_NOT_CONFIGURED errors). All MFA code and DB tables are
// preserved and will activate automatically when the flag is set to "true".
export function isSms2faEnabled(): boolean {
  return process.env.ENABLE_SMS_2FA === "true";
}

// ── MFA Policy ─────────────────────────────────────────────────────────────────
export function isMfaRequiredForUser(user: {
  mfaRequired: boolean;
  isRootSuperAdmin: boolean;
  corporateAccessAdmin: boolean;
  sensitiveFieldAccess?: any;
  actionPermissions?: any;
}): boolean {
  // Feature flag: bypass all MFA enforcement when SMS 2FA is not yet configured
  if (!isSms2faEnabled()) return false;

  if (user.mfaRequired) return true;
  if (user.isRootSuperAdmin) return true;
  if (user.corporateAccessAdmin) return true;

  const sensitive = user.sensitiveFieldAccess as Record<string, any> || {};
  if (sensitive.ssnView || sensitive.ssnEdit || sensitive.bankingView || sensitive.bankingEdit) return true;

  const perms = user.actionPermissions as Record<string, any> || {};
  if (perms.export || perms.adminSettings || perms.manageAccess) return true;

  return false;
}

// ── OTP Utilities ──────────────────────────────────────────────────────────────
function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return String(num).padStart(OTP_LENGTH, "0");
}

async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

// ── Core MFA Functions ─────────────────────────────────────────────────────────

export interface MfaStatus {
  required: boolean;
  enabled: boolean;
  enrolled: boolean;
  locked: boolean;
  lockoutUntil?: Date | null;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const required = isMfaRequiredForUser(user);
  const enrolled = !!user.mfaPhoneNumber;
  const locked = !!(user.mfaLockoutUntil && user.mfaLockoutUntil > new Date());

  return {
    required,
    enabled: user.mfaEnabled,
    enrolled,
    locked,
    lockoutUntil: user.mfaLockoutUntil,
  };
}

export interface SendOtpResult {
  success: boolean;
  maskedPhone?: string;
  error?: string;
  errorCode?: string;
}

export async function sendMfaOtp(userId: string): Promise<SendOtpResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { success: false, error: "User not found", errorCode: "USER_NOT_FOUND" };

  if (!user.mfaPhoneNumber) {
    return { success: false, error: "Phone not enrolled", errorCode: "NOT_ENROLLED" };
  }

  // Lockout check
  if (user.mfaLockoutUntil && user.mfaLockoutUntil > new Date()) {
    return {
      success: false,
      error: "Account temporarily locked due to too many attempts",
      errorCode: "MFA_LOCKED_OUT",
    };
  }

  // Resend rate limit: max 3 per 15 minutes
  const now = new Date();
  let resendCount = user.mfaResendCount || 0;
  let resendWindowStart = user.mfaResendWindowStart;

  if (resendWindowStart && now.getTime() - resendWindowStart.getTime() < RESEND_WINDOW_MS) {
    if (resendCount >= MAX_RESENDS) {
      return {
        success: false,
        error: `Too many resend attempts. Please wait before requesting a new code.`,
        errorCode: "RESEND_LIMIT_EXCEEDED",
      };
    }
    resendCount += 1;
  } else {
    resendWindowStart = now;
    resendCount = 1;
  }

  const provider = getMfaSmsProvider();
  if (!provider) {
    console.warn("[MFA] No SMS provider configured — OTP cannot be sent");
    return { success: false, error: "SMS service not available", errorCode: "SMS_NOT_CONFIGURED" };
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(now.getTime() + OTP_VALIDITY_MS);

  await db.update(users)
    .set({
      mfaCodeHash: otpHash,
      mfaCodeExpiresAt: expiresAt,
      mfaAttemptCount: 0,
      mfaResendCount: resendCount,
      mfaResendWindowStart: resendWindowStart,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  const formatted = formatPhoneNumber(user.mfaPhoneNumber);
  const result = await provider.sendSms(
    formatted,
    `Your DriverHub 360 verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`
  );

  if (!result.success) {
    console.error(`[MFA] Failed to send OTP via ${provider.name}:`, result.error);
    return { success: false, error: "Failed to send verification code", errorCode: "SEND_FAILED" };
  }

  const masked = maskPhone(user.mfaPhoneNumber);
  console.log(`[MFA] OTP sent via ${provider.name} to ${masked} for user ${userId}`);

  const eventType = resendCount > 1 ? "MFA_RESENT" : "MFA_CHALLENGE_SENT";
  logSec({ userId, roleClass: user.role, eventType, metadata: { provider: provider.name } });

  return { success: true, maskedPhone: masked };
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  attemptsRemaining?: number;
  lockoutUntil?: Date;
}

export async function verifyMfaOtp(userId: string, code: string): Promise<VerifyOtpResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { success: false, error: "User not found", errorCode: "USER_NOT_FOUND" };

  // Lockout check
  if (user.mfaLockoutUntil && user.mfaLockoutUntil > new Date()) {
    return { success: false, error: "Account temporarily locked", errorCode: "MFA_LOCKED_OUT", lockoutUntil: user.mfaLockoutUntil };
  }

  if (!user.mfaCodeHash || !user.mfaCodeExpiresAt) {
    return { success: false, error: "No active verification code. Request a new one.", errorCode: "NO_ACTIVE_OTP" };
  }

  if (new Date() > user.mfaCodeExpiresAt) {
    await db.update(users)
      .set({ mfaCodeHash: null, mfaCodeExpiresAt: null, mfaAttemptCount: 0, updatedAt: new Date() })
      .where(eq(users.id, userId));
    logSec({ userId, roleClass: user.role, eventType: "MFA_CODE_EXPIRED" });
    return { success: false, error: "Verification code has expired. Request a new one.", errorCode: "OTP_EXPIRED" };
  }

  const attemptCount = (user.mfaAttemptCount || 0) + 1;

  const isValid = await verifyOtpHash(code, user.mfaCodeHash);

  if (!isValid) {
    const remaining = MAX_VERIFY_ATTEMPTS - attemptCount;

    if (attemptCount >= MAX_VERIFY_ATTEMPTS) {
      const lockoutUntil = new Date(Date.now() + LOCKOUT_MS);
      await db.update(users)
        .set({
          mfaAttemptCount: attemptCount,
          mfaCodeHash: null,
          mfaCodeExpiresAt: null,
          mfaLockoutUntil: lockoutUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logSec({ userId, roleClass: user.role, eventType: "MFA_CODE_VERIFIED_FAILED", metadata: { attempt: attemptCount } });
      logSec({ userId, roleClass: user.role, eventType: "MFA_LOCKOUT_TRIGGERED", metadata: { lockoutUntil, attempts: attemptCount } });

      return {
        success: false,
        error: "Too many incorrect attempts. Account locked for 15 minutes.",
        errorCode: "MFA_LOCKED_OUT",
        lockoutUntil,
      };
    }

    await db.update(users)
      .set({ mfaAttemptCount: attemptCount, updatedAt: new Date() })
      .where(eq(users.id, userId));

    logSec({ userId, roleClass: user.role, eventType: "MFA_CODE_VERIFIED_FAILED", metadata: { attempt: attemptCount, remaining } });

    return {
      success: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      errorCode: "INVALID_OTP",
      attemptsRemaining: remaining,
    };
  }

  // OTP is valid — clear it and record verification
  await db.update(users)
    .set({
      mfaCodeHash: null,
      mfaCodeExpiresAt: null,
      mfaAttemptCount: 0,
      mfaLastVerifiedAt: new Date(),
      mfaLockoutUntil: null,
      mfaEnabled: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  logSec({ userId, roleClass: user.role, eventType: "MFA_CODE_VERIFIED_SUCCESS" });

  return { success: true };
}

export interface EnrollPhoneResult {
  success: boolean;
  maskedPhone?: string;
  error?: string;
  errorCode?: string;
}

export async function sendEnrollmentOtp(userId: string, rawPhone: string): Promise<EnrollPhoneResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { success: false, error: "User not found", errorCode: "USER_NOT_FOUND" };

  const phone = formatPhoneNumber(rawPhone);
  if (!isValidPhoneNumber(phone)) {
    return { success: false, error: "Invalid phone number format", errorCode: "INVALID_PHONE" };
  }

  // Lockout check
  if (user.mfaLockoutUntil && user.mfaLockoutUntil > new Date()) {
    return { success: false, error: "Account temporarily locked", errorCode: "MFA_LOCKED_OUT" };
  }

  // Resend rate limit
  const now = new Date();
  let resendCount = user.mfaResendCount || 0;
  let resendWindowStart = user.mfaResendWindowStart;

  if (resendWindowStart && now.getTime() - resendWindowStart.getTime() < RESEND_WINDOW_MS) {
    if (resendCount >= MAX_RESENDS) {
      return { success: false, error: "Too many resend attempts. Please wait.", errorCode: "RESEND_LIMIT_EXCEEDED" };
    }
    resendCount += 1;
  } else {
    resendWindowStart = now;
    resendCount = 1;
  }

  const provider = getMfaSmsProvider();
  if (!provider) {
    return { success: false, error: "SMS service not available", errorCode: "SMS_NOT_CONFIGURED" };
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(now.getTime() + OTP_VALIDITY_MS);

  await db.update(users)
    .set({
      mfaCodeHash: otpHash,
      mfaCodeExpiresAt: expiresAt,
      mfaAttemptCount: 0,
      mfaResendCount: resendCount,
      mfaResendWindowStart: resendWindowStart,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  const result = await provider.sendSms(
    phone,
    `Your DriverHub 360 enrollment code is: ${otp}. Valid for 10 minutes. Do not share this code.`
  );

  if (!result.success) {
    return { success: false, error: "Failed to send verification code", errorCode: "SEND_FAILED" };
  }

  return { success: true, maskedPhone: maskPhone(rawPhone) };
}

export async function confirmEnrollment(userId: string, rawPhone: string, code: string): Promise<VerifyOtpResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { success: false, error: "User not found", errorCode: "USER_NOT_FOUND" };

  if (user.mfaLockoutUntil && user.mfaLockoutUntil > new Date()) {
    return { success: false, error: "Account temporarily locked", errorCode: "MFA_LOCKED_OUT", lockoutUntil: user.mfaLockoutUntil };
  }

  if (!user.mfaCodeHash || !user.mfaCodeExpiresAt) {
    return { success: false, error: "No active enrollment code. Request a new one.", errorCode: "NO_ACTIVE_OTP" };
  }

  if (new Date() > user.mfaCodeExpiresAt) {
    await db.update(users)
      .set({ mfaCodeHash: null, mfaCodeExpiresAt: null, mfaAttemptCount: 0, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: false, error: "Enrollment code has expired. Request a new one.", errorCode: "OTP_EXPIRED" };
  }

  const attemptCount = (user.mfaAttemptCount || 0) + 1;
  const isValid = await verifyOtpHash(code, user.mfaCodeHash);

  if (!isValid) {
    const remaining = MAX_VERIFY_ATTEMPTS - attemptCount;
    if (attemptCount >= MAX_VERIFY_ATTEMPTS) {
      const lockoutUntil = new Date(Date.now() + LOCKOUT_MS);
      await db.update(users)
        .set({ mfaAttemptCount: attemptCount, mfaCodeHash: null, mfaCodeExpiresAt: null, mfaLockoutUntil: lockoutUntil, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { success: false, error: "Too many incorrect attempts. Account locked for 15 minutes.", errorCode: "MFA_LOCKED_OUT", lockoutUntil };
    }

    await db.update(users)
      .set({ mfaAttemptCount: attemptCount, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: false, error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`, errorCode: "INVALID_OTP", attemptsRemaining: remaining };
  }

  const phone = formatPhoneNumber(rawPhone);
  await db.update(users)
    .set({
      mfaPhoneNumber: phone,
      mfaEnabled: true,
      mfaCodeHash: null,
      mfaCodeExpiresAt: null,
      mfaAttemptCount: 0,
      mfaLastVerifiedAt: new Date(),
      mfaLockoutUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { success: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `***-***-${digits.slice(-4)}`;
  }
  return `****${digits.slice(-4)}`;
}

function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export { maskPhone };
