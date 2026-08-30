import { db } from "./db";
import { eq, and, sql, inArray, ne, isNull, or } from "drizzle-orm";
import {
  recruitingAssignmentRules,
  recruitingAssignmentLogs,
  recruitingApplications,
  recruitingRequisitions,
  recruiterSkills,
  recruiterSkillTags,
  userRecruitingMarkets,
  users,
} from "@shared/schema";

interface RecruiterScore {
  userId: string;
  email: string;
  marketScore: number;
  skillScore: number;
  workloadScore: number;
  totalScore: number;
  activeApplications: number;
  matchedSkills: string[];
}

interface AutoAssignResult {
  assigned: boolean;
  recruiterId: string | null;
  recruiterEmail: string | null;
  ruleId: string | null;
  ruleName: string | null;
  scores: RecruiterScore[];
  reason: string;
}

export async function autoAssignApplication(
  applicationId: string,
  requisitionId: string
): Promise<AutoAssignResult> {
  try {
    const requisition = await db.query.recruitingRequisitions.findFirst({
      where: eq(recruitingRequisitions.id, requisitionId),
      columns: { id: true, market: true, workerType: true, workType: true },
    });

    if (!requisition) {
      return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: null, ruleName: null, scores: [], reason: "Requisition not found" };
    }

    const activeRules = await db.query.recruitingAssignmentRules.findMany({
      where: and(
        eq(recruitingAssignmentRules.isActive, true),
        or(
          eq(recruitingAssignmentRules.strategy, "skill_market_scored"),
          eq(recruitingAssignmentRules.strategy, "workload_balanced"),
          eq(recruitingAssignmentRules.strategy, "market_based"),
          eq(recruitingAssignmentRules.strategy, "round_robin"),
        ),
      ),
      orderBy: (rules, { desc }) => [desc(rules.priority)],
    });

    if (activeRules.length === 0) {
      return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: null, ruleName: null, scores: [], reason: "No active assignment rules configured" };
    }

    for (const rule of activeRules) {
      if (rule.market && rule.market !== requisition.market) continue;
      if (rule.workerType && rule.workerType !== requisition.workerType) continue;

      const result = await scoreAndAssign(rule, requisition, applicationId);
      if (result.assigned) return result;
    }

    return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: null, ruleName: null, scores: [], reason: "No eligible recruiters found matching any active rule" };
  } catch (error) {
    console.error("[AssignmentEngine] Error in autoAssignApplication:", error);
    return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: null, ruleName: null, scores: [], reason: `Error: ${(error as Error).message}` };
  }
}

async function scoreAndAssign(
  rule: typeof recruitingAssignmentRules.$inferSelect,
  requisition: { id: string; market: string; workerType: string; workType: string | null },
  applicationId: string
): Promise<AutoAssignResult> {
  const eligibleUserIds = (rule.eligibleRecruiters as string[] | null) || [];

  let recruiterRows: { id: string; email: string | null }[];
  if (eligibleUserIds.length > 0) {
    recruiterRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(
        inArray(users.id, eligibleUserIds),
        inArray(users.role, ["recruiter", "recruiting_admin", "admin", "super_user"]),
      ));
  } else {
    const marketRecruiters = await db
      .select({ userId: userRecruitingMarkets.userId })
      .from(userRecruitingMarkets)
      .where(eq(userRecruitingMarkets.market, requisition.market));

    if (marketRecruiters.length === 0) {
      return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: rule.id, ruleName: rule.name, scores: [], reason: "No recruiters authorized for market: " + requisition.market };
    }

    const marketUserIds = marketRecruiters.map(r => r.userId);
    recruiterRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(
        inArray(users.id, marketUserIds),
        inArray(users.role, ["recruiter", "recruiting_admin", "admin", "super_user"]),
      ));
  }

  if (recruiterRows.length === 0) {
    return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: rule.id, ruleName: rule.name, scores: [], reason: "No eligible recruiters found" };
  }

  const recruiterIds = recruiterRows.map(r => r.id);

  const workloadCounts = await db
    .select({
      ownerId: recruitingApplications.ownerId,
      count: sql<number>`count(*)::int`,
    })
    .from(recruitingApplications)
    .where(and(
      inArray(recruitingApplications.ownerId, recruiterIds),
      isNull(recruitingApplications.disposition),
      eq(recruitingApplications.isArchived, false),
    ))
    .groupBy(recruitingApplications.ownerId);

  const workloadMap = new Map(workloadCounts.map(w => [w.ownerId, w.count]));

  const allSkills = await db
    .select({
      userId: recruiterSkills.userId,
      skillTagId: recruiterSkills.skillTagId,
      proficiencyLevel: recruiterSkills.proficiencyLevel,
    })
    .from(recruiterSkills)
    .where(inArray(recruiterSkills.userId, recruiterIds));

  const skillMap = new Map<string, { skillTagId: string; proficiency: number }[]>();
  for (const skill of allSkills) {
    const existing = skillMap.get(skill.userId) || [];
    existing.push({ skillTagId: skill.skillTagId, proficiency: skill.proficiencyLevel || 1 });
    skillMap.set(skill.userId, existing);
  }

  const marketAccessMap = new Map<string, boolean>();
  const marketAccess = await db
    .select({ userId: userRecruitingMarkets.userId })
    .from(userRecruitingMarkets)
    .where(and(
      inArray(userRecruitingMarkets.userId, recruiterIds),
      eq(userRecruitingMarkets.market, requisition.market),
    ));
  for (const ma of marketAccess) {
    marketAccessMap.set(ma.userId, true);
  }

  const requiredSkillIds = (rule.requiredSkillTagIds as string[] | null) || [];
  const maxApps = rule.maxActiveApplications || 50;
  const strategy = rule.strategy || "skill_market_scored";

  const marketWeight = strategy === "workload_balanced" ? 0
    : strategy === "round_robin" ? 0
    : (rule.marketWeight || 40);
  const skillWeight = strategy === "workload_balanced" ? 0
    : strategy === "round_robin" ? 0
    : strategy === "market_based" ? 0
    : (rule.skillWeight || 40);
  const workloadWeightVal = strategy === "round_robin" ? 100
    : strategy === "market_based" ? 10
    : (rule.workloadWeight || 20);

  const scores: RecruiterScore[] = [];

  for (const recruiter of recruiterRows) {
    const activeApps = workloadMap.get(recruiter.id) || 0;

    if (activeApps >= maxApps) continue;

    const hasMarketAccess = marketAccessMap.has(recruiter.id);

    if (strategy === "market_based" && !hasMarketAccess) continue;

    const marketScore = hasMarketAccess ? marketWeight : 0;

    let skillScore = 0;
    const matchedSkills: string[] = [];
    if (requiredSkillIds.length > 0 && skillWeight > 0) {
      const recruiterSkillSet = skillMap.get(recruiter.id) || [];
      const recruiterSkillIdSet = new Set(recruiterSkillSet.map(s => s.skillTagId));
      let matched = 0;
      for (const reqSkillId of requiredSkillIds) {
        if (recruiterSkillIdSet.has(reqSkillId)) {
          matched++;
          matchedSkills.push(reqSkillId);
        }
      }
      skillScore = requiredSkillIds.length > 0
        ? Math.round((matched / requiredSkillIds.length) * skillWeight)
        : 0;
    } else if (skillWeight > 0) {
      skillScore = skillWeight;
    }

    const workloadRatio = activeApps / maxApps;
    const workloadScore = Math.round((1 - workloadRatio) * workloadWeightVal);

    const totalScore = marketScore + skillScore + workloadScore;

    scores.push({
      userId: recruiter.id,
      email: recruiter.email || "",
      marketScore,
      skillScore,
      workloadScore,
      totalScore,
      activeApplications: activeApps,
      matchedSkills,
    });
  }

  if (scores.length === 0) {
    return { assigned: false, recruiterId: null, recruiterEmail: null, ruleId: rule.id, ruleName: rule.name, scores: [], reason: "All recruiters at capacity" };
  }

  scores.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.activeApplications - b.activeApplications;
  });

  const bestRecruiter = scores[0];

  await db.update(recruitingApplications)
    .set({ ownerId: bestRecruiter.userId, updatedAt: new Date() })
    .where(eq(recruitingApplications.id, applicationId));

  await db.insert(recruitingAssignmentLogs).values({
    applicationId,
    previousOwnerId: null,
    newOwnerId: bestRecruiter.userId,
    newOwnerEmail: bestRecruiter.email,
    assignmentType: "auto",
    assignmentRuleId: rule.id,
    reason: `Auto-assigned by rule "${rule.name}" (score: ${bestRecruiter.totalScore})`,
    scoreDetails: {
      ruleId: rule.id,
      ruleName: rule.name,
      strategy: rule.strategy,
      totalScore: bestRecruiter.totalScore,
      marketScore: bestRecruiter.marketScore,
      skillScore: bestRecruiter.skillScore,
      workloadScore: bestRecruiter.workloadScore,
      activeApplications: bestRecruiter.activeApplications,
      matchedSkills: bestRecruiter.matchedSkills,
      candidatesEvaluated: scores.length,
    },
  });

  return {
    assigned: true,
    recruiterId: bestRecruiter.userId,
    recruiterEmail: bestRecruiter.email,
    ruleId: rule.id,
    ruleName: rule.name,
    scores,
    reason: `Assigned to ${bestRecruiter.email} (score: ${bestRecruiter.totalScore})`,
  };
}
