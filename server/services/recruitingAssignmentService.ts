import { db } from "../db";
import { 
  recruitingApplications, 
  recruitingAssignmentRules, 
  recruitingAssignmentLogs,
  recruitingCandidates,
  users,
  type InsertRecruitingAssignmentLog,
  type RecruitingAssignmentRule
} from "@shared/schema";
import { eq, and, sql, isNull, desc, asc, count, inArray, ne } from "drizzle-orm";

export type AssignmentResult = {
  success: boolean;
  applicationId: string;
  newOwnerId: string | null;
  previousOwnerId: string | null;
  assignmentType: string;
  error?: string;
};

export type RecruiterWorkload = {
  recruiterId: string;
  recruiterEmail: string;
  recruiterName: string;
  activeApplications: number;
  slaBreachedCount: number;
};

class RecruitingAssignmentService {
  async assignApplication(
    applicationId: string,
    newOwnerId: string | null,
    performedBy: string | null,
    reason?: string,
    assignmentType: string = "manual"
  ): Promise<AssignmentResult> {
    try {
      const [application] = await db
        .select({
          id: recruitingApplications.id,
          ownerId: recruitingApplications.ownerId,
        })
        .from(recruitingApplications)
        .where(eq(recruitingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return {
          success: false,
          applicationId,
          newOwnerId,
          previousOwnerId: null,
          assignmentType,
          error: "Application not found",
        };
      }

      const previousOwnerId = application.ownerId;

      let previousOwnerEmail: string | null = null;
      let newOwnerEmail: string | null = null;
      let performedByEmail: string | null = null;

      if (previousOwnerId) {
        const [prevOwner] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, previousOwnerId))
          .limit(1);
        previousOwnerEmail = prevOwner?.email || null;
      }

      if (newOwnerId) {
        const [newOwner] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, newOwnerId))
          .limit(1);
        newOwnerEmail = newOwner?.email || null;
      }

      if (performedBy) {
        const [performer] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, performedBy))
          .limit(1);
        performedByEmail = performer?.email || null;
      }

      await db
        .update(recruitingApplications)
        .set({
          ownerId: newOwnerId,
          updatedAt: new Date(),
          updatedBy: performedBy,
        })
        .where(eq(recruitingApplications.id, applicationId));

      const logEntry: InsertRecruitingAssignmentLog = {
        applicationId,
        previousOwnerId,
        newOwnerId,
        previousOwnerEmail,
        newOwnerEmail,
        assignmentType,
        reason,
        performedBy,
        performedByEmail,
      };

      await db.insert(recruitingAssignmentLogs).values(logEntry);

      return {
        success: true,
        applicationId,
        newOwnerId,
        previousOwnerId,
        assignmentType,
      };
    } catch (error) {
      console.error("Error assigning application:", error);
      return {
        success: false,
        applicationId,
        newOwnerId,
        previousOwnerId: null,
        assignmentType,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async bulkAssign(
    applicationIds: string[],
    newOwnerId: string | null,
    performedBy: string,
    reason?: string
  ): Promise<{ results: AssignmentResult[]; successCount: number; failCount: number }> {
    const results: AssignmentResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const applicationId of applicationIds) {
      const result = await this.assignApplication(
        applicationId,
        newOwnerId,
        performedBy,
        reason,
        "bulk"
      );
      results.push(result);
      if (result.success) successCount++;
      else failCount++;
    }

    return { results, successCount, failCount };
  }

  async autoAssignApplication(applicationId: string, market?: string): Promise<AssignmentResult> {
    try {
      const rules = await db
        .select()
        .from(recruitingAssignmentRules)
        .where(
          and(
            eq(recruitingAssignmentRules.isActive, true),
            market 
              ? eq(recruitingAssignmentRules.market, market)
              : isNull(recruitingAssignmentRules.market)
          )
        )
        .orderBy(desc(recruitingAssignmentRules.priority))
        .limit(1);

      if (rules.length === 0) {
        const fallbackRules = await db
          .select()
          .from(recruitingAssignmentRules)
          .where(
            and(
              eq(recruitingAssignmentRules.isActive, true),
              isNull(recruitingAssignmentRules.market)
            )
          )
          .orderBy(desc(recruitingAssignmentRules.priority))
          .limit(1);

        if (fallbackRules.length === 0) {
          return {
            success: false,
            applicationId,
            newOwnerId: null,
            previousOwnerId: null,
            assignmentType: "auto",
            error: "No active assignment rules found",
          };
        }

        return this.executeAssignmentRule(applicationId, fallbackRules[0]);
      }

      return this.executeAssignmentRule(applicationId, rules[0]);
    } catch (error) {
      console.error("Error in auto-assignment:", error);
      return {
        success: false,
        applicationId,
        newOwnerId: null,
        previousOwnerId: null,
        assignmentType: "auto",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async executeAssignmentRule(
    applicationId: string,
    rule: RecruitingAssignmentRule
  ): Promise<AssignmentResult> {
    const eligibleRecruiters = (rule.eligibleRecruiters as string[]) || [];
    
    if (eligibleRecruiters.length === 0) {
      return {
        success: false,
        applicationId,
        newOwnerId: null,
        previousOwnerId: null,
        assignmentType: "auto",
        error: "No eligible recruiters configured for this rule",
      };
    }

    let selectedRecruiter: string | null = null;

    switch (rule.strategy) {
      case "round_robin":
        selectedRecruiter = await this.roundRobinSelect(rule, eligibleRecruiters);
        break;
      case "workload_balanced":
        selectedRecruiter = await this.workloadBalancedSelect(
          eligibleRecruiters,
          rule.maxActiveApplications || 50
        );
        break;
      case "market_based":
        selectedRecruiter = await this.workloadBalancedSelect(
          eligibleRecruiters,
          rule.maxActiveApplications || 50
        );
        break;
      case "manual":
      default:
        return {
          success: false,
          applicationId,
          newOwnerId: null,
          previousOwnerId: null,
          assignmentType: "auto",
          error: "Manual assignment strategy - no auto-assignment performed",
        };
    }

    if (!selectedRecruiter) {
      return {
        success: false,
        applicationId,
        newOwnerId: null,
        previousOwnerId: null,
        assignmentType: "auto",
        error: "All eligible recruiters are at capacity",
      };
    }

    return this.assignApplication(
      applicationId,
      selectedRecruiter,
      null,
      `Auto-assigned by rule: ${rule.name}`,
      "auto"
    );
  }

  private async roundRobinSelect(
    rule: RecruitingAssignmentRule,
    eligibleRecruiters: string[]
  ): Promise<string | null> {
    const currentIndex = rule.lastAssignedRecruiterIndex || 0;
    const nextIndex = (currentIndex + 1) % eligibleRecruiters.length;

    await db
      .update(recruitingAssignmentRules)
      .set({
        lastAssignedRecruiterIndex: nextIndex,
        updatedAt: new Date(),
      })
      .where(eq(recruitingAssignmentRules.id, rule.id));

    return eligibleRecruiters[nextIndex];
  }

  private async workloadBalancedSelect(
    eligibleRecruiters: string[],
    maxActiveApplications: number
  ): Promise<string | null> {
    const workloads = await this.getRecruiterWorkloads(eligibleRecruiters);
    
    const availableRecruiters = workloads
      .filter((w) => w.activeApplications < maxActiveApplications)
      .sort((a, b) => a.activeApplications - b.activeApplications);

    if (availableRecruiters.length === 0) {
      return null;
    }

    return availableRecruiters[0].recruiterId;
  }

  async getRecruiterWorkloads(recruiterIds?: string[]): Promise<RecruiterWorkload[]> {
    const baseQuery = db
      .select({
        recruiterId: users.id,
        recruiterEmail: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        activeApplications: count(recruitingApplications.id),
      })
      .from(users)
      .leftJoin(
        recruitingApplications,
        and(
          eq(recruitingApplications.ownerId, users.id),
          eq(recruitingApplications.isArchived, false),
          ne(recruitingApplications.currentStage, "hired"),
          ne(recruitingApplications.currentStage, "rejected")
        )
      )
      .groupBy(users.id, users.email, users.firstName, users.lastName);

    let results;
    if (recruiterIds && recruiterIds.length > 0) {
      results = await baseQuery.where(inArray(users.id, recruiterIds));
    } else {
      results = await baseQuery.where(
        inArray(users.role, ["recruiter", "admin", "hr_admin"])
      );
    }

    const workloadsWithSla: RecruiterWorkload[] = [];

    for (const r of results) {
      const [slaResult] = await db
        .select({
          slaBreachedCount: count(recruitingApplications.id),
        })
        .from(recruitingApplications)
        .where(
          and(
            eq(recruitingApplications.ownerId, r.recruiterId),
            eq(recruitingApplications.isArchived, false),
            sql`${recruitingApplications.currentStageEnteredAt} < NOW() - INTERVAL '7 days'`
          )
        );

      workloadsWithSla.push({
        recruiterId: r.recruiterId,
        recruiterEmail: r.recruiterEmail || "",
        recruiterName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.recruiterEmail || "Unknown",
        activeApplications: Number(r.activeApplications) || 0,
        slaBreachedCount: Number(slaResult?.slaBreachedCount) || 0,
      });
    }

    return workloadsWithSla;
  }

  async getAssignmentLogs(
    applicationId?: string,
    recruiterId?: string,
    limit: number = 50
  ): Promise<any[]> {
    let query = db
      .select({
        id: recruitingAssignmentLogs.id,
        applicationId: recruitingAssignmentLogs.applicationId,
        previousOwnerId: recruitingAssignmentLogs.previousOwnerId,
        newOwnerId: recruitingAssignmentLogs.newOwnerId,
        previousOwnerEmail: recruitingAssignmentLogs.previousOwnerEmail,
        newOwnerEmail: recruitingAssignmentLogs.newOwnerEmail,
        assignmentType: recruitingAssignmentLogs.assignmentType,
        reason: recruitingAssignmentLogs.reason,
        performedBy: recruitingAssignmentLogs.performedBy,
        performedByEmail: recruitingAssignmentLogs.performedByEmail,
        createdAt: recruitingAssignmentLogs.createdAt,
      })
      .from(recruitingAssignmentLogs)
      .orderBy(desc(recruitingAssignmentLogs.createdAt))
      .limit(limit);

    if (applicationId) {
      return query.where(eq(recruitingAssignmentLogs.applicationId, applicationId));
    }

    if (recruiterId) {
      return query.where(
        sql`${recruitingAssignmentLogs.previousOwnerId} = ${recruiterId} OR ${recruitingAssignmentLogs.newOwnerId} = ${recruiterId}`
      );
    }

    return query;
  }

  async getAssignmentRules(): Promise<RecruitingAssignmentRule[]> {
    return db
      .select()
      .from(recruitingAssignmentRules)
      .where(eq(recruitingAssignmentRules.isActive, true))
      .orderBy(desc(recruitingAssignmentRules.priority));
  }

  async createAssignmentRule(
    data: Omit<RecruitingAssignmentRule, "id" | "createdAt" | "updatedAt" | "lastAssignedRecruiterIndex">
  ): Promise<RecruitingAssignmentRule> {
    const [rule] = await db
      .insert(recruitingAssignmentRules)
      .values(data)
      .returning();
    return rule;
  }

  async updateAssignmentRule(
    ruleId: string,
    data: Partial<RecruitingAssignmentRule>,
    updatedBy: string
  ): Promise<RecruitingAssignmentRule | null> {
    const [updated] = await db
      .update(recruitingAssignmentRules)
      .set({
        ...data,
        updatedAt: new Date(),
        updatedBy,
      })
      .where(eq(recruitingAssignmentRules.id, ruleId))
      .returning();
    return updated || null;
  }

  async deleteAssignmentRule(ruleId: string): Promise<boolean> {
    const [deleted] = await db
      .update(recruitingAssignmentRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recruitingAssignmentRules.id, ruleId))
      .returning();
    return !!deleted;
  }

  async getEligibleRecruiters(): Promise<{ id: string; email: string; name: string }[]> {
    const recruiters = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(
        and(
          inArray(users.role, ["recruiter", "admin", "hr_admin"]),
          eq(users.status, "ACTIVE")
        )
      )
      .orderBy(asc(users.email));

    return recruiters.map((r) => ({
      id: r.id,
      email: r.email || "",
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
    }));
  }
}

export const recruitingAssignmentService = new RecruitingAssignmentService();
