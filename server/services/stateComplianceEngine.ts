import { db } from "../db";
import { recruitingComplianceChecks, recruitingApplications, recruitingRequisitions, recruitingCandidates } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export interface ComplianceRule {
  code: string;
  name: string;
  category: "disclosure" | "form" | "worker_type" | "document";
  description: string;
  blockingStages: string[];
  evaluate: (context: ComplianceContext) => Promise<ComplianceResult>;
}

export interface ComplianceContext {
  applicationId: string;
  candidateId: string;
  requisitionId: string;
  workState: string;
  workerType: string;
  currentStage: string;
  targetStage?: string;
}

export interface ComplianceResult {
  passed: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ComplianceCheckSummary {
  applicationId: string;
  state: string;
  allPassed: boolean;
  blockedReason: string | null;
  checks: Array<{
    ruleCode: string;
    ruleName: string;
    category: string;
    status: string;
    failedReason: string | null;
  }>;
}

const NY_RULES: ComplianceRule[] = [
  {
    code: "NY_SALARY_DISCLOSURE",
    name: "NY Salary Range Disclosure",
    category: "disclosure",
    description: "New York requires salary ranges to be disclosed in job postings",
    blockingStages: ["offer", "hired"],
    evaluate: async (ctx) => {
      const requisition = await db.query.recruitingRequisitions.findFirst({
        where: eq(recruitingRequisitions.id, ctx.requisitionId),
      });
      if (!requisition) return { passed: false, reason: "Requisition not found" };
      
      // Check both salaryMin/Max and compensationMin/Max fields
      const hasSalaryRange = requisition.salaryMin || requisition.salaryMax || 
                             requisition.compensationMin || requisition.compensationMax;
      return {
        passed: !!hasSalaryRange,
        reason: hasSalaryRange ? undefined : "NY requires salary range disclosure on job posting",
      };
    },
  },
  {
    code: "NY_BACKGROUND_TIMING",
    name: "NY Fair Chance Act Compliance",
    category: "form",
    description: "NY Fair Chance Act restricts when background checks can be conducted",
    blockingStages: ["interview", "offer", "hired"],
    evaluate: async (ctx) => {
      const application = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, ctx.applicationId),
      });
      if (!application) return { passed: false, reason: "Application not found" };
      
      if (application.backgroundStatus === "none" || application.backgroundStatus === "requested") {
        return { passed: true };
      }
      
      if (ctx.currentStage === "applied" || ctx.currentStage === "phone_screen") {
        return {
          passed: false,
          reason: "NY Fair Chance Act: Background check cannot be initiated before conditional offer stage",
        };
      }
      
      return { passed: true };
    },
  },
  {
    code: "NY_W2_ONLY",
    name: "NY Worker Classification",
    category: "worker_type",
    description: "Certain NY positions require W-2 employment classification",
    blockingStages: ["offer", "hired"],
    evaluate: async (ctx) => {
      // Handle both legacy format ("w2") and new enum format ("W2_DRIVER", "CORP_EMPLOYEE")
      const isW2 = ctx.workerType === "w2" || 
                   ctx.workerType === "W2_DRIVER" || 
                   ctx.workerType === "CORP_EMPLOYEE";
      if (isW2) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: "NY positions require W-2 worker classification for this role type",
      };
    },
  },
];

const CA_RULES: ComplianceRule[] = [
  {
    code: "CA_PAY_TRANSPARENCY",
    name: "CA Pay Transparency Act",
    category: "disclosure",
    description: "California requires pay scale disclosure in job postings",
    blockingStages: ["offer", "hired"],
    evaluate: async (ctx) => {
      const requisition = await db.query.recruitingRequisitions.findFirst({
        where: eq(recruitingRequisitions.id, ctx.requisitionId),
      });
      if (!requisition) return { passed: false, reason: "Requisition not found" };
      
      // Check both salaryMin/Max and compensationMin/Max fields - CA requires BOTH min and max
      const minSalary = requisition.salaryMin || requisition.compensationMin;
      const maxSalary = requisition.salaryMax || requisition.compensationMax;
      const hasSalaryRange = minSalary && maxSalary;
      return {
        passed: !!hasSalaryRange,
        reason: hasSalaryRange ? undefined : "CA Pay Transparency Act requires both min and max salary on job posting",
      };
    },
  },
  {
    code: "CA_FCRA_NOTICE",
    name: "CA FCRA Notice Requirement",
    category: "form",
    description: "California requires specific FCRA disclosure and authorization forms",
    blockingStages: ["offer", "hired"],
    evaluate: async (ctx) => {
      return { passed: true, metadata: { placeholder: true, note: "FCRA form check placeholder" } };
    },
  },
  {
    code: "CA_WORKER_CLASSIFICATION",
    name: "CA ABC Test Compliance",
    category: "worker_type",
    description: "California AB5 law requires strict worker classification under ABC test",
    blockingStages: ["offer", "hired"],
    evaluate: async (ctx) => {
      // Handle both legacy format ("w2") and new enum format ("W2_DRIVER", "CORP_EMPLOYEE")
      const isW2 = ctx.workerType === "w2" || 
                   ctx.workerType === "W2_DRIVER" || 
                   ctx.workerType === "CORP_EMPLOYEE";
      if (isW2) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: "CA AB5 law: Driver positions must be classified as W-2 employees unless exempt",
      };
    },
  },
  {
    code: "CA_SALARY_HISTORY_BAN",
    name: "CA Salary History Ban",
    category: "disclosure",
    description: "California prohibits asking for salary history",
    blockingStages: ["phone_screen", "interview", "offer", "hired"],
    evaluate: async (ctx) => {
      return { passed: true, metadata: { placeholder: true, note: "Salary history tracking placeholder" } };
    },
  },
];

const STATE_RULES: Record<string, ComplianceRule[]> = {
  NY: NY_RULES,
  CA: CA_RULES,
};

export const REGULATED_STATES = ["NY", "CA"] as const;

export function isRegulatedState(state: string | null | undefined): boolean {
  if (!state) return false;
  const normalized = state.toUpperCase().trim();
  return REGULATED_STATES.includes(normalized as any);
}

export function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.toUpperCase().trim();
  if (normalized === "NEW YORK" || normalized === "NEW-YORK") return "NY";
  if (normalized === "CALIFORNIA") return "CA";
  if (normalized === "TEXAS") return "TX";
  if (normalized.length === 2) return normalized;
  return state;
}

export function getRulesForState(state: string): ComplianceRule[] {
  const normalized = normalizeState(state);
  if (!normalized) return [];
  return STATE_RULES[normalized] || [];
}

export async function initializeComplianceChecks(
  applicationId: string,
  state: string
): Promise<void> {
  const rules = getRulesForState(state);
  if (rules.length === 0) return;

  const normalized = normalizeState(state) || state;

  for (const rule of rules) {
    const existing = await db.query.recruitingComplianceChecks.findFirst({
      where: and(
        eq(recruitingComplianceChecks.applicationId, applicationId),
        eq(recruitingComplianceChecks.ruleCode, rule.code)
      ),
    });

    if (!existing) {
      await db.insert(recruitingComplianceChecks).values({
        applicationId,
        state: normalized,
        ruleCode: rule.code,
        ruleName: rule.name,
        ruleCategory: rule.category,
        status: "pending",
      });
    }
  }
}

export async function evaluateComplianceChecks(
  applicationId: string
): Promise<ComplianceCheckSummary> {
  console.log(`[Compliance] Looking up application: ${applicationId}`);
  
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
    with: {
      requisition: true,
    },
  });

  console.log(`[Compliance] Application lookup result:`, application ? `Found - ID: ${application.id}` : 'NOT FOUND');

  if (!application) {
    throw new Error("Application not found");
  }

  const requisition = application.requisition;

  const workState = application.workState || requisition?.workState;
  const workerType = requisition?.workerType || "w2";

  if (!workState || !isRegulatedState(workState)) {
    return {
      applicationId,
      state: workState || "UNKNOWN",
      allPassed: true,
      blockedReason: null,
      checks: [],
    };
  }

  const normalizedState = normalizeState(workState) || workState;
  const rules = getRulesForState(normalizedState);

  await initializeComplianceChecks(applicationId, normalizedState);

  const context: ComplianceContext = {
    applicationId,
    candidateId: application.candidateId,
    requisitionId: application.requisitionId,
    workState: normalizedState,
    workerType,
    currentStage: application.stage || "applied",
  };

  const results: ComplianceCheckSummary["checks"] = [];
  let allPassed = true;
  let blockedReason: string | null = null;

  for (const rule of rules) {
    const result = await rule.evaluate(context);
    
    const newStatus = result.passed ? "passed" : "failed";
    
    await db
      .update(recruitingComplianceChecks)
      .set({
        status: newStatus,
        evaluatedAt: new Date(),
        passedAt: result.passed ? new Date() : null,
        failedReason: result.reason || null,
        metadata: result.metadata || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recruitingComplianceChecks.applicationId, applicationId),
          eq(recruitingComplianceChecks.ruleCode, rule.code)
        )
      );

    results.push({
      ruleCode: rule.code,
      ruleName: rule.name,
      category: rule.category,
      status: newStatus,
      failedReason: result.reason || null,
    });

    if (!result.passed) {
      allPassed = false;
      if (!blockedReason) {
        blockedReason = result.reason || `Failed: ${rule.name}`;
      }
    }
  }

  await db
    .update(recruitingApplications)
    .set({
      complianceStatus: allPassed ? "passed" : "blocked",
      complianceBlockedReason: blockedReason,
      updatedAt: new Date(),
    })
    .where(eq(recruitingApplications.id, applicationId));

  return {
    applicationId,
    state: normalizedState,
    allPassed,
    blockedReason,
    checks: results,
  };
}

export async function checkStageTransitionAllowed(
  applicationId: string,
  targetStage: string
): Promise<{ allowed: boolean; blockedReason: string | null; failedChecks: string[] }> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
    with: {
      requisition: true,
    },
  });

  if (!application) {
    return { allowed: false, blockedReason: "Application not found", failedChecks: [] };
  }

  const requisition = application.requisition;
  const workState = application.workState || requisition?.workState;

  if (!workState || !isRegulatedState(workState)) {
    return { allowed: true, blockedReason: null, failedChecks: [] };
  }

  const normalizedState = normalizeState(workState) || workState;
  const rules = getRulesForState(normalizedState);

  const blockingRules = rules.filter((rule) =>
    rule.blockingStages.includes(targetStage)
  );

  if (blockingRules.length === 0) {
    return { allowed: true, blockedReason: null, failedChecks: [] };
  }

  const workerType = requisition?.workerType || "w2";

  const context: ComplianceContext = {
    applicationId,
    candidateId: application.candidateId,
    requisitionId: application.requisitionId,
    workState: normalizedState,
    workerType,
    currentStage: application.stage || "applied",
    targetStage,
  };

  const failedChecks: string[] = [];
  let blockedReason: string | null = null;

  for (const rule of blockingRules) {
    const result = await rule.evaluate(context);
    if (!result.passed) {
      failedChecks.push(rule.code);
      if (!blockedReason) {
        blockedReason = result.reason || `Blocked by ${rule.name}`;
      }
    }
  }

  return {
    allowed: failedChecks.length === 0,
    blockedReason,
    failedChecks,
  };
}

export async function getComplianceChecksForApplication(
  applicationId: string
): Promise<ComplianceCheckSummary["checks"]> {
  const checks = await db.query.recruitingComplianceChecks.findMany({
    where: eq(recruitingComplianceChecks.applicationId, applicationId),
  });

  return checks.map((check) => ({
    ruleCode: check.ruleCode,
    ruleName: check.ruleName,
    category: check.ruleCategory,
    status: check.status,
    failedReason: check.failedReason,
  }));
}

export async function waiveComplianceCheck(
  applicationId: string,
  ruleCode: string,
  waivedBy: string,
  reason: string
): Promise<void> {
  await db
    .update(recruitingComplianceChecks)
    .set({
      status: "waived",
      waivedAt: new Date(),
      waivedBy,
      waivedReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(recruitingComplianceChecks.applicationId, applicationId),
        eq(recruitingComplianceChecks.ruleCode, ruleCode)
      )
    );

  const remainingFailed = await db.query.recruitingComplianceChecks.findFirst({
    where: and(
      eq(recruitingComplianceChecks.applicationId, applicationId),
      eq(recruitingComplianceChecks.status, "failed")
    ),
  });

  if (!remainingFailed) {
    await db
      .update(recruitingApplications)
      .set({
        complianceStatus: "passed",
        complianceBlockedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(recruitingApplications.id, applicationId));
  }
}
