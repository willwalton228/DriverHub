import { db } from "../db";
import {
  recruitingCandidates,
  recruitingContactVerificationLog,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const TOKEN_EXPIRY_MINUTES = 30;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export interface VerificationInitResult {
  success: boolean;
  message: string;
  verificationId?: string;
  token?: string;
  otp?: string;
  expiresAt?: Date;
}

export interface VerificationConfirmResult {
  success: boolean;
  message: string;
  channel?: string;
}

export async function initiateVerification(
  candidateId: string,
  channel: "email" | "phone"
): Promise<VerificationInitResult> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });

  if (!candidate) {
    return { success: false, message: "Candidate not found" };
  }

  const contactValue = channel === "email" ? candidate.email : candidate.phone;
  if (!contactValue) {
    return { success: false, message: `No ${channel} on file for this candidate` };
  }

  if (channel === "email" && candidate.emailVerified) {
    return { success: false, message: "Email is already verified" };
  }
  if (channel === "phone" && candidate.phoneVerified) {
    return { success: false, message: "Phone is already verified" };
  }

  const token = channel === "email" ? generateToken() : generateOTP();
  const tokenHashed = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  const [record] = await db
    .insert(recruitingContactVerificationLog)
    .values({
      candidateId,
      channel,
      contactValue,
      tokenHash: tokenHashed,
      status: "sent",
      sentAt: new Date(),
      expiresAt,
      metadata: { initiatedAt: new Date().toISOString() },
    })
    .returning();

  return {
    success: true,
    message: `Verification ${channel === "email" ? "link" : "code"} generated. In production, this would be sent to ${contactValue}.`,
    verificationId: record.id,
    token: channel === "email" ? token : undefined,
    otp: channel === "phone" ? token : undefined,
    expiresAt,
  };
}

export async function confirmVerification(
  candidateId: string,
  channel: "email" | "phone",
  token: string
): Promise<VerificationConfirmResult> {
  const tokenHashed = hashToken(token);

  const record = await db.query.recruitingContactVerificationLog.findFirst({
    where: and(
      eq(recruitingContactVerificationLog.candidateId, candidateId),
      eq(recruitingContactVerificationLog.channel, channel),
      eq(recruitingContactVerificationLog.tokenHash, tokenHashed),
      eq(recruitingContactVerificationLog.status, "sent")
    ),
  });

  if (!record) {
    return { success: false, message: "Invalid or expired verification token" };
  }

  if (record.expiresAt && new Date() > record.expiresAt) {
    await db
      .update(recruitingContactVerificationLog)
      .set({ status: "expired", failureReason: "Token expired" })
      .where(eq(recruitingContactVerificationLog.id, record.id));
    return { success: false, message: "Verification token has expired" };
  }

  await db
    .update(recruitingContactVerificationLog)
    .set({ status: "verified", verifiedAt: new Date() })
    .where(eq(recruitingContactVerificationLog.id, record.id));

  const now = new Date();
  if (channel === "email") {
    await db
      .update(recruitingCandidates)
      .set({ emailVerified: true, emailVerifiedAt: now })
      .where(eq(recruitingCandidates.id, candidateId));
  } else {
    await db
      .update(recruitingCandidates)
      .set({ phoneVerified: true, phoneVerifiedAt: now })
      .where(eq(recruitingCandidates.id, candidateId));
  }

  return { success: true, message: `${channel} verified successfully`, channel };
}

export async function markVerifiedManually(
  candidateId: string,
  channel: "email" | "phone",
  verifiedBy: string
): Promise<VerificationConfirmResult> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });

  if (!candidate) {
    return { success: false, message: "Candidate not found" };
  }

  const contactValue = channel === "email" ? candidate.email : candidate.phone;
  const now = new Date();

  await db.insert(recruitingContactVerificationLog).values({
    candidateId,
    channel,
    contactValue: contactValue || "manual",
    status: "verified",
    sentAt: now,
    verifiedAt: now,
    metadata: { manualVerification: true, verifiedBy },
  });

  if (channel === "email") {
    await db
      .update(recruitingCandidates)
      .set({ emailVerified: true, emailVerifiedAt: now })
      .where(eq(recruitingCandidates.id, candidateId));
  } else {
    await db
      .update(recruitingCandidates)
      .set({ phoneVerified: true, phoneVerifiedAt: now })
      .where(eq(recruitingCandidates.id, candidateId));
  }

  return { success: true, message: `${channel} manually verified`, channel };
}

export async function getVerificationStatus(candidateId: string) {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
    columns: {
      id: true,
      email: true,
      phone: true,
      emailVerified: true,
      emailVerifiedAt: true,
      phoneVerified: true,
      phoneVerifiedAt: true,
    },
  });

  if (!candidate) return null;

  const logs = await db.query.recruitingContactVerificationLog.findMany({
    where: eq(recruitingContactVerificationLog.candidateId, candidateId),
    orderBy: (log, { desc }) => [desc(log.createdAt)],
    limit: 20,
  });

  return {
    candidateId: candidate.id,
    email: {
      value: candidate.email,
      verified: candidate.emailVerified,
      verifiedAt: candidate.emailVerifiedAt,
    },
    phone: {
      value: candidate.phone,
      verified: candidate.phoneVerified,
      verifiedAt: candidate.phoneVerifiedAt,
    },
    history: logs,
  };
}

export async function resetVerification(
  candidateId: string,
  channel: "email" | "phone"
): Promise<{ success: boolean; message: string }> {
  const now = new Date();

  if (channel === "email") {
    await db
      .update(recruitingCandidates)
      .set({ emailVerified: false, emailVerifiedAt: null })
      .where(eq(recruitingCandidates.id, candidateId));
  } else {
    await db
      .update(recruitingCandidates)
      .set({ phoneVerified: false, phoneVerifiedAt: null })
      .where(eq(recruitingCandidates.id, candidateId));
  }

  await db.insert(recruitingContactVerificationLog).values({
    candidateId,
    channel,
    contactValue: "reset",
    status: "reset",
    sentAt: now,
    metadata: { action: "reset", resetAt: now.toISOString() },
  });

  return { success: true, message: `${channel} verification reset` };
}
