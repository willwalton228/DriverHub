import { db } from "../db";
import {
  recruitingCandidates,
  recruitingApplications,
  recruitingRequisitions,
  candidateRiskFlags,
  recruitingCommunications,
} from "@shared/schema";
import { eq, and, desc, sql, ne, isNull, or } from "drizzle-orm";

export interface CandidateSummaryCardData {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredMarkets: string[] | null;
  isDnr: boolean;
  applications: Array<{
    applicationId: string;
    currentStage: string;
    readinessStatus: string;
    readinessScore: number;
    market: string;
    requisitionTitle: string;
    updatedAt: string;
    isArchived: boolean;
  }>;
  riskFlags: Array<{
    id: string;
    flagType: string;
    severity: string;
    label: string;
    description: string | null;
    isDismissed: boolean;
  }>;
  lastActivity: string | null;
}

export async function getCandidateSummaryCard(candidateId: string): Promise<CandidateSummaryCardData | null> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });

  if (!candidate) return null;

  const applications = await db
    .select({
      applicationId: recruitingApplications.id,
      currentStage: recruitingApplications.currentStage,
      readinessStatus: recruitingApplications.readinessStatus,
      readinessScore: recruitingApplications.readinessScore,
      market: recruitingRequisitions.market,
      requisitionTitle: recruitingRequisitions.title,
      updatedAt: recruitingApplications.updatedAt,
      isArchived: recruitingApplications.isArchived,
    })
    .from(recruitingApplications)
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(eq(recruitingApplications.candidateId, candidateId))
    .orderBy(desc(recruitingApplications.updatedAt));

  const flags = await db
    .select({
      id: candidateRiskFlags.id,
      flagType: candidateRiskFlags.flagType,
      severity: candidateRiskFlags.severity,
      label: candidateRiskFlags.label,
      description: candidateRiskFlags.description,
      isDismissed: candidateRiskFlags.isDismissed,
    })
    .from(candidateRiskFlags)
    .where(eq(candidateRiskFlags.candidateId, candidateId));

  const lastComm = await db
    .select({ sentAt: recruitingCommunications.sentAt })
    .from(recruitingCommunications)
    .where(eq(recruitingCommunications.candidateId, candidateId))
    .orderBy(desc(recruitingCommunications.sentAt))
    .limit(1);

  const lastActivityDates = [
    candidate.updatedAt,
    ...applications.map(a => a.updatedAt),
    ...(lastComm.length > 0 && lastComm[0].sentAt ? [lastComm[0].sentAt] : []),
  ].filter(Boolean).map(d => new Date(d!).getTime());

  const lastActivity = lastActivityDates.length > 0
    ? new Date(Math.max(...lastActivityDates)).toISOString()
    : null;

  return {
    candidateId: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    preferredMarkets: candidate.preferredMarkets as string[] | null,
    isDnr: candidate.isDnr ?? false,
    applications: applications.map(a => ({
      applicationId: a.applicationId,
      currentStage: a.currentStage,
      readinessStatus: a.readinessStatus,
      readinessScore: a.readinessScore,
      market: a.market,
      requisitionTitle: a.requisitionTitle,
      updatedAt: new Date(a.updatedAt).toISOString(),
      isArchived: a.isArchived,
    })),
    riskFlags: flags.map(f => ({
      id: f.id,
      flagType: f.flagType,
      severity: f.severity,
      label: f.label,
      description: f.description,
      isDismissed: f.isDismissed,
    })),
    lastActivity,
  };
}

export async function searchCandidateSummaryCards(options: {
  search?: string;
  market?: string;
  readinessStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: CandidateSummaryCardData[]; total: number }> {
  const { search, market, readinessStatus, limit = 20, offset = 0 } = options;

  const needsAppJoin = !!(market || readinessStatus);

  let baseQuery = db
    .selectDistinct({ id: recruitingCandidates.id, updatedAt: recruitingCandidates.updatedAt })
    .from(recruitingCandidates);

  const conditions: any[] = [];

  if (needsAppJoin) {
    baseQuery = baseQuery
      .innerJoin(recruitingApplications, eq(recruitingApplications.candidateId, recruitingCandidates.id))
      .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id)) as any;

    if (market) {
      conditions.push(eq(recruitingRequisitions.market, market));
    }
    if (readinessStatus) {
      conditions.push(sql`${recruitingApplications.readinessStatus} = ${readinessStatus}`);
    }
    conditions.push(eq(recruitingApplications.isArchived, false));
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        sql`${recruitingCandidates.firstName} ILIKE ${term}`,
        sql`${recruitingCandidates.lastName} ILIKE ${term}`,
        sql`${recruitingCandidates.email} ILIKE ${term}`,
        sql`${recruitingCandidates.phone} ILIKE ${term}`
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(DISTINCT ${recruitingCandidates.id})` })
    .from(recruitingCandidates)
    .$dynamic();

  let countQuery = countResult;
  if (needsAppJoin) {
    countQuery = db
      .select({ count: sql<number>`count(DISTINCT ${recruitingCandidates.id})` })
      .from(recruitingCandidates)
      .innerJoin(recruitingApplications, eq(recruitingApplications.candidateId, recruitingCandidates.id))
      .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
      .where(whereClause) as any;
  } else {
    countQuery = db
      .select({ count: sql<number>`count(DISTINCT ${recruitingCandidates.id})` })
      .from(recruitingCandidates)
      .where(whereClause) as any;
  }

  const totalRows = await countQuery;
  const total = Number(totalRows[0]?.count ?? 0);

  const candidateRows = await (baseQuery as any)
    .where(whereClause)
    .orderBy(desc(recruitingCandidates.updatedAt))
    .limit(limit)
    .offset(offset);

  const candidateIds = candidateRows.map((r: any) => r.id);

  if (candidateIds.length === 0) {
    return { data: [], total };
  }

  const allApps = await db
    .select({
      candidateId: recruitingApplications.candidateId,
      applicationId: recruitingApplications.id,
      currentStage: recruitingApplications.currentStage,
      readinessStatus: recruitingApplications.readinessStatus,
      readinessScore: recruitingApplications.readinessScore,
      market: recruitingRequisitions.market,
      requisitionTitle: recruitingRequisitions.title,
      updatedAt: recruitingApplications.updatedAt,
      isArchived: recruitingApplications.isArchived,
    })
    .from(recruitingApplications)
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(sql`${recruitingApplications.candidateId} IN (${sql.join(candidateIds.map((id: string) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(recruitingApplications.updatedAt));

  const allFlags = await db
    .select({
      candidateId: candidateRiskFlags.candidateId,
      id: candidateRiskFlags.id,
      flagType: candidateRiskFlags.flagType,
      severity: candidateRiskFlags.severity,
      label: candidateRiskFlags.label,
      description: candidateRiskFlags.description,
      isDismissed: candidateRiskFlags.isDismissed,
    })
    .from(candidateRiskFlags)
    .where(sql`${candidateRiskFlags.candidateId} IN (${sql.join(candidateIds.map((id: string) => sql`${id}`), sql`, `)})`);

  const allCandidates = await db
    .select()
    .from(recruitingCandidates)
    .where(sql`${recruitingCandidates.id} IN (${sql.join(candidateIds.map((id: string) => sql`${id}`), sql`, `)})`);

  const appsByCandidate = new Map<string, typeof allApps>();
  for (const app of allApps) {
    const arr = appsByCandidate.get(app.candidateId) || [];
    arr.push(app);
    appsByCandidate.set(app.candidateId, arr);
  }

  const flagsByCandidate = new Map<string, typeof allFlags>();
  for (const flag of allFlags) {
    const arr = flagsByCandidate.get(flag.candidateId) || [];
    arr.push(flag);
    flagsByCandidate.set(flag.candidateId, arr);
  }

  const candidateMap = new Map<string, typeof allCandidates[0]>();
  for (const c of allCandidates) {
    candidateMap.set(c.id, c);
  }

  const summaries: CandidateSummaryCardData[] = [];
  for (const id of candidateIds) {
    const candidate = candidateMap.get(id);
    if (!candidate) continue;

    const apps = appsByCandidate.get(id) || [];
    const flags = flagsByCandidate.get(id) || [];

    const lastActivityDates = [
      candidate.updatedAt,
      ...apps.map(a => a.updatedAt),
    ].filter(Boolean).map(d => new Date(d!).getTime());

    const lastActivity = lastActivityDates.length > 0
      ? new Date(Math.max(...lastActivityDates)).toISOString()
      : null;

    summaries.push({
      candidateId: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      preferredMarkets: candidate.preferredMarkets as string[] | null,
      isDnr: candidate.isDnr ?? false,
      applications: apps.map(a => ({
        applicationId: a.applicationId,
        currentStage: a.currentStage,
        readinessStatus: a.readinessStatus,
        readinessScore: a.readinessScore,
        market: a.market,
        requisitionTitle: a.requisitionTitle,
        updatedAt: new Date(a.updatedAt).toISOString(),
        isArchived: a.isArchived,
      })),
      riskFlags: flags.map(f => ({
        id: f.id,
        flagType: f.flagType,
        severity: f.severity,
        label: f.label,
        description: f.description,
        isDismissed: f.isDismissed,
      })),
      lastActivity,
    });
  }

  return { data: summaries, total };
}
