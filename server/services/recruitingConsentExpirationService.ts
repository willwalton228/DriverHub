import { db } from "../db";
import { eq, and, isNull, lte, desc } from "drizzle-orm";
import {
  recruitingConsentExpirationRules,
  recruitingConsents,
  recruitingAuditEvents,
  type RecruitingConsentExpirationRule,
  type RecruitingConsent,
} from "@shared/schema";

export async function getExpirationRules(): Promise<RecruitingConsentExpirationRule[]> {
  return db
    .select()
    .from(recruitingConsentExpirationRules)
    .orderBy(recruitingConsentExpirationRules.consentType);
}

export async function getExpirationRule(id: string): Promise<RecruitingConsentExpirationRule | null> {
  const [rule] = await db
    .select()
    .from(recruitingConsentExpirationRules)
    .where(eq(recruitingConsentExpirationRules.id, id))
    .limit(1);
  return rule || null;
}

export async function createExpirationRule(
  data: { consentType: string; expirationDays: number; isActive?: boolean },
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingConsentExpirationRule> {
  const [rule] = await db.insert(recruitingConsentExpirationRules).values({
    consentType: data.consentType,
    expirationDays: data.expirationDays,
    isActive: data.isActive ?? true,
    createdBy: userId,
    updatedBy: userId,
  }).returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "CONSENT_EXPIRATION_RULE_CREATED",
    entityType: "consent_expiration_rule",
    entityId: rule.id,
    userId,
    userEmail,
    source: "ui",
    newValue: JSON.stringify({ consentType: data.consentType, expirationDays: data.expirationDays, isActive: data.isActive ?? true }),
    changedFields: ["consentType", "expirationDays", "isActive"],
  });

  return rule;
}

export async function updateExpirationRule(
  id: string,
  data: { expirationDays?: number; isActive?: boolean },
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingConsentExpirationRule | null> {
  const existing = await getExpirationRule(id);
  if (!existing) return null;

  const updateData: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  if (data.expirationDays !== undefined) updateData.expirationDays = data.expirationDays;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const [updated] = await db.update(recruitingConsentExpirationRules)
    .set(updateData)
    .where(eq(recruitingConsentExpirationRules.id, id))
    .returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "CONSENT_EXPIRATION_RULE_UPDATED",
    entityType: "consent_expiration_rule",
    entityId: id,
    userId,
    userEmail,
    source: "ui",
    previousValue: JSON.stringify({ expirationDays: existing.expirationDays, isActive: existing.isActive }),
    newValue: JSON.stringify({ expirationDays: updated.expirationDays, isActive: updated.isActive }),
    changedFields: Object.keys(data),
  });

  return updated;
}

export async function deleteExpirationRule(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<boolean> {
  const existing = await getExpirationRule(id);
  if (!existing) return false;

  await db.delete(recruitingConsentExpirationRules)
    .where(eq(recruitingConsentExpirationRules.id, id));

  await db.insert(recruitingAuditEvents).values({
    actionType: "CONSENT_EXPIRATION_RULE_DELETED",
    entityType: "consent_expiration_rule",
    entityId: id,
    userId,
    userEmail,
    source: "ui",
    previousValue: JSON.stringify({ consentType: existing.consentType, expirationDays: existing.expirationDays }),
    changedFields: ["consentType", "expirationDays"],
  });

  return true;
}

interface ConsentWithExpiration {
  id: string;
  candidateId: string;
  applicationId: string | null;
  consentType: string;
  version: string;
  textHash: string | null;
  accepted: boolean;
  acceptedAt: Date;
  source: string;
  sourceDetails: unknown;
  documentId: string | null;
  witnessedBy: string | null;
  verificationMethod: string | null;
  stateCode: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
  createdAt: Date;
  createdBy: string | null;
  isExpired: boolean;
  expiresAt: string | null;
  expirationDays: number | null;
}

export async function getCandidateConsentsWithExpiration(
  candidateId: string
): Promise<ConsentWithExpiration[]> {
  const rules = await db
    .select()
    .from(recruitingConsentExpirationRules)
    .where(eq(recruitingConsentExpirationRules.isActive, true));

  const rulesMap = new Map(rules.map(r => [r.consentType, r]));

  const consents = await db
    .select()
    .from(recruitingConsents)
    .where(eq(recruitingConsents.candidateId, candidateId))
    .orderBy(desc(recruitingConsents.acceptedAt));

  const now = new Date();

  return consents.map(consent => {
    const rule = rulesMap.get(consent.consentType);
    let isExpired = false;
    let computedExpiresAt: string | null = consent.expiresAt?.toISOString() || null;

    if (consent.revokedAt) {
      isExpired = true;
    } else if (!consent.accepted) {
      isExpired = true;
    } else if (consent.expiresAt && new Date(consent.expiresAt) <= now) {
      isExpired = true;
    } else if (rule && consent.accepted && !consent.revokedAt) {
      const acceptedDate = new Date(consent.acceptedAt);
      const expirationDate = new Date(acceptedDate.getTime() + rule.expirationDays * 24 * 60 * 60 * 1000);
      computedExpiresAt = expirationDate.toISOString();
      if (expirationDate <= now) {
        isExpired = true;
      }
    }

    return {
      ...consent,
      acceptedAt: consent.acceptedAt,
      isExpired,
      expiresAt: computedExpiresAt,
      expirationDays: rule?.expirationDays || null,
    } as ConsentWithExpiration;
  });
}

export async function checkConsentBlocking(
  candidateId: string,
  commType: "sms" | "email"
): Promise<{ blocked: boolean; expiredConsents: string[] }> {
  const consentType = commType === "sms" ? "sms_opt_in" : "email_opt_in";
  const consentsWithExp = await getCandidateConsentsWithExpiration(candidateId);

  const relevantConsents = consentsWithExp.filter(c => c.consentType === consentType);

  if (relevantConsents.length === 0) {
    return { blocked: true, expiredConsents: [consentType] };
  }

  const latestConsent = relevantConsents[0];
  if (latestConsent.isExpired) {
    return { blocked: true, expiredConsents: [consentType] };
  }

  return { blocked: false, expiredConsents: [] };
}

export async function requestReconfirmation(
  candidateId: string,
  consentType: string,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  await db.insert(recruitingAuditEvents).values({
    actionType: "CONSENT_RECONFIRMATION_REQUESTED",
    entityType: "candidate",
    entityId: candidateId,
    userId,
    userEmail,
    source: "ui",
    newValue: JSON.stringify({ consentType, requestedAt: new Date().toISOString() }),
    changedFields: ["consentType"],
    reason: `Reconfirmation requested for ${consentType}`,
  });
}

export async function recordReconfirmation(
  candidateId: string,
  consentType: string,
  applicationId: string | null,
  source: string,
  userId: string | null,
  userEmail: string | null,
  sourceDetails?: Record<string, unknown>
): Promise<RecruitingConsent> {
  const existingConsents = await db
    .select()
    .from(recruitingConsents)
    .where(
      and(
        eq(recruitingConsents.candidateId, candidateId),
        eq(recruitingConsents.consentType, consentType),
        isNull(recruitingConsents.revokedAt)
      )
    )
    .orderBy(desc(recruitingConsents.acceptedAt))
    .limit(1);

  const previousVersion = existingConsents[0]?.version || "1.0";
  const versionParts = previousVersion.split(".");
  const newVersion = `${parseInt(versionParts[0]) + 1}.0`;

  const rules = await db
    .select()
    .from(recruitingConsentExpirationRules)
    .where(
      and(
        eq(recruitingConsentExpirationRules.consentType, consentType),
        eq(recruitingConsentExpirationRules.isActive, true)
      )
    )
    .limit(1);

  let expiresAt: Date | null = null;
  if (rules.length > 0) {
    expiresAt = new Date(Date.now() + rules[0].expirationDays * 24 * 60 * 60 * 1000);
  }

  const [newConsent] = await db.insert(recruitingConsents).values({
    candidateId,
    applicationId,
    consentType,
    version: newVersion,
    accepted: true,
    source,
    sourceDetails: sourceDetails || null,
    expiresAt,
    createdBy: userId,
  }).returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "CONSENT_RECONFIRMED",
    entityType: "candidate",
    entityId: candidateId,
    userId,
    userEmail,
    source,
    previousValue: existingConsents[0] ? JSON.stringify({ version: previousVersion, acceptedAt: existingConsents[0].acceptedAt }) : null,
    newValue: JSON.stringify({ consentId: newConsent.id, version: newVersion, consentType, expiresAt: expiresAt?.toISOString() }),
    changedFields: ["consentType", "version", "accepted"],
    reason: "Consent reconfirmed after expiration",
  });

  return newConsent;
}
