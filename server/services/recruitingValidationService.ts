import { db } from "../db";
import {
  recruitingValidationRules,
  recruitingValidationAudit,
  recruitingCandidates,
  recruitingApplications,
  recruitingRequisitions,
  type RecruitingValidationRule,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface ValidationFailure {
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  isBlocking: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface DataQualityResult {
  passed: boolean;
  score: number;
  blockingFailures: ValidationFailure[];
  warnings: ValidationFailure[];
  allFailures: ValidationFailure[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-+().]{7,20}$/;

function evaluateRequiredFields(
  candidate: Record<string, any>,
  requiredFields: string[]
): { missing: string[] } {
  const missing: string[] = [];
  for (const field of requiredFields) {
    const value = candidate[field];
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }
  return { missing };
}

function evaluateFormatValidation(
  candidate: Record<string, any>,
  fields: string[]
): { invalidFields: Array<{ field: string; reason: string }> } {
  const invalidFields: Array<{ field: string; reason: string }> = [];
  for (const field of fields) {
    const value = candidate[field];
    if (!value || typeof value !== "string") continue;

    if (field === "email" && !EMAIL_REGEX.test(value.trim())) {
      invalidFields.push({ field: "email", reason: "Invalid email format" });
    }
    if (field === "phone" && !PHONE_REGEX.test(value.replace(/\s/g, ""))) {
      invalidFields.push({ field: "phone", reason: "Invalid phone format" });
    }
  }
  return { invalidFields };
}

export async function getActiveRulesForStage(stage: string): Promise<RecruitingValidationRule[]> {
  return db.query.recruitingValidationRules.findMany({
    where: and(
      eq(recruitingValidationRules.stage, stage),
      eq(recruitingValidationRules.isActive, true)
    ),
  });
}

export async function evaluateDataQuality(
  applicationId: string,
  targetStage: string,
  userId?: string
): Promise<DataQualityResult> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });
  if (!application) {
    return { passed: false, score: 0, blockingFailures: [{ ruleCode: "SYSTEM", ruleName: "System", ruleType: "system", isBlocking: true, message: "Application not found" }], warnings: [], allFailures: [] };
  }

  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, application.candidateId),
  });
  if (!candidate) {
    return { passed: false, score: 0, blockingFailures: [{ ruleCode: "SYSTEM", ruleName: "System", ruleType: "system", isBlocking: true, message: "Candidate not found" }], warnings: [], allFailures: [] };
  }

  const requisition = await db.query.recruitingRequisitions.findFirst({
    where: eq(recruitingRequisitions.id, application.requisitionId),
  });

  const rules = await getActiveRulesForStage(targetStage);
  const blockingFailures: ValidationFailure[] = [];
  const warnings: ValidationFailure[] = [];
  let totalRules = rules.length;
  let passedRules = 0;

  for (const rule of rules) {
    const failures = await evaluateRule(rule, candidate as Record<string, any>, requisition as Record<string, any> | null);

    if (failures.length === 0) {
      passedRules++;
      continue;
    }

    for (const failure of failures) {
      const vf: ValidationFailure = {
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        ruleType: rule.ruleType,
        isBlocking: rule.isBlocking,
        message: failure.message,
        details: failure.details,
      };

      if (rule.isBlocking) {
        blockingFailures.push(vf);
      } else {
        warnings.push(vf);
      }

      await db.insert(recruitingValidationAudit).values({
        applicationId,
        candidateId: candidate.id,
        targetStage,
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        failureMessage: failure.message,
        failureDetails: failure.details || null,
        wasBlocking: rule.isBlocking,
        userId: userId || null,
      });
    }
  }

  const score = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100;

  return {
    passed: blockingFailures.length === 0,
    score,
    blockingFailures,
    warnings,
    allFailures: [...blockingFailures, ...warnings],
  };
}

async function evaluateRule(
  rule: RecruitingValidationRule,
  candidate: Record<string, any>,
  requisition: Record<string, any> | null
): Promise<Array<{ message: string; details?: Record<string, any> }>> {
  const failures: Array<{ message: string; details?: Record<string, any> }> = [];

  switch (rule.ruleType) {
    case "required_field": {
      if (rule.requiredFields && rule.requiredFields.length > 0) {
        const { missing } = evaluateRequiredFields(candidate, rule.requiredFields);
        if (missing.length > 0) {
          failures.push({
            message: rule.errorMessage || `Missing required fields: ${missing.join(", ")}`,
            details: { missingFields: missing },
          });
        }
      }
      break;
    }

    case "format_validation": {
      if (rule.requiredFields && rule.requiredFields.length > 0) {
        const { invalidFields } = evaluateFormatValidation(candidate, rule.requiredFields);
        for (const inv of invalidFields) {
          failures.push({
            message: rule.errorMessage || `${inv.field}: ${inv.reason}`,
            details: { field: inv.field, reason: inv.reason },
          });
        }
      }
      break;
    }

    case "verification_gate": {
      if (rule.requireEmailVerified && !candidate.emailVerified) {
        failures.push({
          message: rule.errorMessage || "Email must be verified",
          details: { verificationRequired: "email" },
        });
      }
      if (rule.requirePhoneVerified && !candidate.phoneVerified) {
        failures.push({
          message: rule.errorMessage || "Phone must be verified",
          details: { verificationRequired: "phone" },
        });
      }
      break;
    }

    case "consistency_check": {
      if (rule.enforceMarketConsistency && requisition) {
        const candidateMarket = candidate.preferredMarket || candidate.market;
        const requisitionMarket = requisition.market || requisition.location;
        if (candidateMarket && requisitionMarket && candidateMarket !== requisitionMarket) {
          failures.push({
            message: "Candidate preferred market does not match requisition market",
            details: { candidateMarket, requisitionMarket },
          });
        }
      }
      if (rule.enforceWorkerTypeConsistency && requisition) {
        const candidateWorkerType = candidate.preferredWorkerType || candidate.workerType;
        const requisitionWorkerType = requisition.workerType;
        if (candidateWorkerType && requisitionWorkerType && candidateWorkerType !== requisitionWorkerType) {
          failures.push({
            message: "Candidate worker type preference does not match requisition worker type",
            details: { candidateWorkerType, requisitionWorkerType },
          });
        }
      }
      break;
    }

    default:
      break;
  }

  return failures;
}

export async function getValidationAuditForApplication(applicationId: string) {
  return db.query.recruitingValidationAudit.findMany({
    where: eq(recruitingValidationAudit.applicationId, applicationId),
    orderBy: (audit, { desc }) => [desc(audit.createdAt)],
  });
}

export async function getAllValidationRules() {
  return db.query.recruitingValidationRules.findMany({
    orderBy: (rules, { asc }) => [asc(rules.stage), asc(rules.ruleName)],
  });
}

export async function updateValidationRule(
  ruleId: string,
  updates: { isActive?: boolean; isBlocking?: boolean; errorMessage?: string }
) {
  return db
    .update(recruitingValidationRules)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(recruitingValidationRules.id, ruleId))
    .returning();
}
