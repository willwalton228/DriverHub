import { db } from "./db";
import {
  recruitingCandidates,
  recruitingRequisitions,
  recruitingApplications,
  recruitingStageHistory,
  recruitingAuditEvents,
  recruitingWorkflows,
  recruitingWorkflowStages,
  recruitingWorkflowTransitions,
  recruitingCalendarConnections,
  recruitingInterviews,
  recruitingScreeningFormTemplates,
  recruitingScreeningTokens,
  recruitingScreeningResponses,
  recruitingApplicationTags,
  recruitingBulkActions,
  recruitingTags,
  recruitingCandidateTags,
  recruitingCommunications,
  candidateTrainingRecords,
  TRAINING_TYPES,
  recruitingDocuments,
  recruitingDocumentTemplates,
  recruitingRetentionRules,
  recruitingPurgeRuns,
  InsertRecruitingCandidate,
  InsertRecruitingRequisition,
  InsertRecruitingApplication,
  InsertRecruitingCalendarConnection,
  InsertRecruitingInterview,
  InsertRecruitingScreeningToken,
  InsertRecruitingScreeningResponse,
  InsertRecruitingTag,
  InsertRecruitingCandidateTag,
  InsertRecruitingRetentionRule,
  RecruitingCandidate,
  RecruitingRequisition,
  RecruitingApplication,
  RecruitingWorkflow,
  RecruitingWorkflowStage,
  RecruitingWorkflowTransition,
  RecruitingAuditEvent,
  RecruitingStageHistory,
  RecruitingCalendarConnection,
  RecruitingInterview,
  RecruitingRetentionRule,
  RecruitingPurgeRun,
  RecruitingScreeningFormTemplate,
  RecruitingScreeningToken,
  RecruitingScreeningResponse,
  RecruitingApplicationTag,
  RecruitingBulkAction,
  RecruitingTag,
  RecruitingCandidateTag,
  applicationStages,
  users,
  ReadinessStatus,
  recruitingApplicationLocks,
  recruitingConsents,
  recruitingFeatureFlags,
} from "@shared/schema";
import crypto from "crypto";
import { eq, and, desc, or, ilike, sql, gte, lte, isNull, asc, inArray, gt } from "drizzle-orm";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function normalizeCandidateValues<T extends Partial<InsertRecruitingCandidate>>(data: T): T {
  return {
    ...data,
    ...(typeof data.email === "string" ? { email: data.email.trim() } : {}),
    ...(data.phone !== undefined ? { phone: normalizePhone(data.phone) } : {}),
    ...(typeof data.state === "string" ? { state: data.state.trim().toUpperCase() || null } : {}),
  } as T;
}

async function writeAuditEvent(
  actionType: string,
  entityType: string,
  entityId: string,
  userId: string | null,
  userEmail: string | null,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  changedFields: string[] | null,
  reason?: string,
  actorRole?: string | null,
  source?: string
): Promise<void> {
  await db.insert(recruitingAuditEvents).values({
    actionType,
    entityType,
    entityId,
    userId,
    userEmail,
    actorRole: actorRole || null,
    source: source || 'ui',
    previousValue: previousValue ? JSON.stringify(previousValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
    changedFields,
    reason,
  });
}

async function resolveUserId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  return user?.id || null;
}

export async function createCandidate(
  data: InsertRecruitingCandidate,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingCandidate> {
  data = normalizeCandidateValues(data);
  const VALID_AUTHORIZATION_TYPES = ['citizen', 'permanent_resident', 'work_visa', 'ead', 'other'];
  const VALID_ENDORSEMENTS = ['H', 'N', 'P', 'T', 'X', 'S'];
  if (data.authorizationType && !VALID_AUTHORIZATION_TYPES.includes(data.authorizationType)) {
    throw new Error(`Invalid authorization type: ${data.authorizationType}. Must be one of: ${VALID_AUTHORIZATION_TYPES.join(', ')}`);
  }
  if (data.source === "other" && !data.sourceDetails?.trim()) {
    throw new Error("Other source details are required when Candidate source is Other");
  }
  if (data.endorsements?.some(endorsement => !VALID_ENDORSEMENTS.includes(endorsement))) {
    throw new Error(`Invalid endorsement. Must be one of: ${VALID_ENDORSEMENTS.join(', ')}`);
  }

  const MVR_INT_FIELDS = ['mvrYearsLicensed', 'mvrViolations3yr', 'mvrViolations5yr', 'mvrAtFaultAccidents'] as const;
  for (const field of MVR_INT_FIELDS) {
    const val = data[field];
    if (val !== undefined && val !== null && (typeof val !== 'number' || val < 0 || !Number.isInteger(val))) {
      throw new Error(`Invalid ${field}: must be a non-negative integer`);
    }
  }

  const emailNormalized = normalizeEmail(data.email);
  const phoneNormalized = normalizePhone(data.phone);

  const existing = await db.query.recruitingCandidates.findFirst({
    where: or(
      eq(recruitingCandidates.emailNormalized, emailNormalized),
      phoneNormalized ? eq(recruitingCandidates.phoneNormalized, phoneNormalized) : undefined
    ),
  });

  if (existing && !existing.mergedIntoId) {
    const matchedOn: string[] = [];
    if (existing.emailNormalized === emailNormalized) matchedOn.push("email");
    if (phoneNormalized && existing.phoneNormalized === phoneNormalized) matchedOn.push("phone");

    await writeAuditEvent(
      "DUPLICATE_CANDIDATE_ATTEMPT",
      "candidate",
      existing.id,
      userId,
      userEmail,
      null,
      { attemptedEmail: data.email, attemptedPhone: data.phone, matchedOn, existingCandidateId: existing.id },
      null
    );

    const error: any = new Error("DUPLICATE_CANDIDATE");
    error.code = "DUPLICATE_CANDIDATE";
    error.existingCandidate = {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      status: existing.status,
    };
    error.matchedOn = matchedOn;
    throw error;
  }

  const resolvedUserId = await resolveUserId(userId);

  const hasMvrData = data.mvrYearsLicensed !== undefined || data.mvrViolations3yr !== undefined || data.mvrViolations5yr !== undefined || data.mvrAtFaultAccidents !== undefined || data.mvrDuiDwi !== undefined;

  const [candidate] = await db.insert(recruitingCandidates).values({
    ...data,
    emailNormalized,
    phoneNormalized,
    ...(hasMvrData ? { mvrLastUpdated: new Date() } : {}),
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "CANDIDATE_CREATED",
    "candidate",
    candidate.id,
    userId,
    userEmail,
    null,
    { id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email },
    null
  );

  return candidate;
}

export async function updateCandidate(
  id: string,
  data: Partial<InsertRecruitingCandidate>,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingCandidate | null> {
  data = normalizeCandidateValues(data);
  const existing = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, id),
  });

  if (!existing) return null;

  const VALID_AUTHORIZATION_TYPES = ['citizen', 'permanent_resident', 'work_visa', 'ead', 'other'];
  const VALID_ENDORSEMENTS = ['H', 'N', 'P', 'T', 'X', 'S'];
  if (data.authorizationType && !VALID_AUTHORIZATION_TYPES.includes(data.authorizationType)) {
    throw new Error(`Invalid authorization type: ${data.authorizationType}. Must be one of: ${VALID_AUTHORIZATION_TYPES.join(', ')}`);
  }
  const proposedSource = data.source ?? existing.source;
  const proposedSourceDetails = data.sourceDetails !== undefined ? data.sourceDetails : existing.sourceDetails;
  if ((data.source !== undefined || data.sourceDetails !== undefined) && proposedSource === "other" && !proposedSourceDetails?.trim()) {
    throw new Error("Other source details are required when Candidate source is Other");
  }
  if (data.endorsements?.some(endorsement => !VALID_ENDORSEMENTS.includes(endorsement))) {
    throw new Error(`Invalid endorsement. Must be one of: ${VALID_ENDORSEMENTS.join(', ')}`);
  }

  const MVR_INT_FIELDS = ['mvrYearsLicensed', 'mvrViolations3yr', 'mvrViolations5yr', 'mvrAtFaultAccidents'] as const;
  for (const field of MVR_INT_FIELDS) {
    const val = (data as any)[field];
    if (val !== undefined && val !== null && (typeof val !== 'number' || val < 0 || !Number.isInteger(val))) {
      throw new Error(`Invalid ${field}: must be a non-negative integer`);
    }
  }

  const resolvedUserId = await resolveUserId(userId);
  const hasMvrData = (data as any).mvrYearsLicensed !== undefined || (data as any).mvrViolations3yr !== undefined || (data as any).mvrViolations5yr !== undefined || (data as any).mvrAtFaultAccidents !== undefined || (data as any).mvrDuiDwi !== undefined;
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date(), updatedBy: resolvedUserId, ...(hasMvrData ? { mvrLastUpdated: new Date() } : {}) };

  if (data.email) {
    updateData.emailNormalized = normalizeEmail(data.email);
  }
  if (data.phone !== undefined) {
    updateData.phoneNormalized = normalizePhone(data.phone);
  }

  const proposedEmail = typeof data.email === "string"
    ? normalizeEmail(data.email)
    : existing.emailNormalized;
  const proposedPhone = data.phone !== undefined
    ? normalizePhone(data.phone)
    : existing.phoneNormalized;
  if (proposedEmail !== existing.emailNormalized || proposedPhone !== existing.phoneNormalized) {
    const duplicate = await db.query.recruitingCandidates.findFirst({
      where: and(
        sql`${recruitingCandidates.id} <> ${id}`,
        or(
          eq(recruitingCandidates.emailNormalized, proposedEmail),
          proposedPhone ? eq(recruitingCandidates.phoneNormalized, proposedPhone) : undefined,
        ),
      ),
    });
    if (duplicate && !duplicate.mergedIntoId) {
      const matchedOn: string[] = [];
      if (duplicate.emailNormalized === proposedEmail) matchedOn.push("email");
      if (proposedPhone && duplicate.phoneNormalized === proposedPhone) matchedOn.push("phone");
      await writeAuditEvent(
        "DUPLICATE_CANDIDATE_ATTEMPT",
        "candidate",
        duplicate.id,
        userId,
        userEmail,
        null,
        { attemptedEmail: data.email, attemptedPhone: data.phone, matchedOn, existingCandidateId: duplicate.id },
        null,
      );
      const error: any = new Error("DUPLICATE_CANDIDATE");
      error.code = "DUPLICATE_CANDIDATE";
      error.existingCandidate = {
        id: duplicate.id,
        firstName: duplicate.firstName,
        lastName: duplicate.lastName,
        email: duplicate.email,
        phone: duplicate.phone,
        status: duplicate.status,
      };
      error.matchedOn = matchedOn;
      throw error;
    }
  }

  try {
    const { recordIdentityChanges } = await import("./services/recruitingIdentityService");
    await recordIdentityChanges(
      id,
      existing as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
      resolvedUserId,
      userEmail,
      "ui"
    );
  } catch (err) {
    console.error("[Recruiting] Non-blocking: Failed to record identity changes:", err);
  }

  const [updated] = await db.update(recruitingCandidates)
    .set(updateData)
    .where(eq(recruitingCandidates.id, id))
    .returning();

  const changedFields = Object.keys(data);
  const beforeSnapshot: Record<string, unknown> = { id: existing.id, firstName: existing.firstName, lastName: existing.lastName };
  const afterSnapshot: Record<string, unknown> = { id: updated.id, firstName: updated.firstName, lastName: updated.lastName };
  for (const field of changedFields) {
    beforeSnapshot[field] = (existing as Record<string, unknown>)[field];
    afterSnapshot[field] = (updated as Record<string, unknown>)[field];
  }
  await writeAuditEvent(
    "CANDIDATE_UPDATED",
    "candidate",
    id,
    userId,
    userEmail,
    beforeSnapshot,
    afterSnapshot,
    changedFields
  );

  const geoRelatedFields = ['zipCode', 'latitude', 'longitude', 'maxTravelRadius', 'city', 'state'];
  const hasGeoChanges = changedFields.some(f => geoRelatedFields.includes(f));
  if (hasGeoChanges) {
    try {
      const { refreshGeoForCandidate } = await import("./services/geoEligibilityService");
      await refreshGeoForCandidate(id);
      console.log(`[Recruiting] Refreshed geo-eligibility for candidate ${id} after location change`);
    } catch (err) {
      console.error("[Recruiting] Geo refresh failed (non-blocking):", err);
    }
  }

  const licenseRelatedFields = ['licenseClass', 'licenseState', 'endorsements', 'hasCommercialLicense'];
  const hasLicenseChanges = changedFields.some(f => licenseRelatedFields.includes(f));
  if (hasLicenseChanges) {
    try {
      const { refreshLicenseForCandidate } = await import("./services/licenseEligibilityService");
      await refreshLicenseForCandidate(id);
      console.log(`[Recruiting] Refreshed license eligibility for candidate ${id} after license change`);
    } catch (err) {
      console.error("[Recruiting] License refresh failed (non-blocking):", err);
    }
  }

  return updated;
}

export async function getCandidate(id: string): Promise<RecruitingCandidate | null> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, id),
  });
  return candidate || null;
}

export async function getCandidates(filters?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
  authorizedMarkets?: string[] | null;
}): Promise<{ candidates: Array<RecruitingCandidate & { latestApplication: {
  id: string;
  stage: string;
  appliedAt: Date | null;
  requisitionId: string;
  requisitionTitle: string | null;
  campaignName: string | null;
  recruiterName: string | null;
} | null }>; total: number }> {
  const conditions = [];

  // By default, exclude archived candidates unless explicitly requested
  if (!filters?.includeArchived) {
    conditions.push(eq(recruitingCandidates.isArchived, false));
  }

  if (filters?.status) {
    conditions.push(sql`${recruitingCandidates.status} = ${filters.status}`);
  }

  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    const phoneSearch = filters.search.replace(/\D/g, "");
    conditions.push(
      or(
        ilike(recruitingCandidates.firstName, searchTerm),
        ilike(recruitingCandidates.lastName, searchTerm),
        ilike(sql`concat_ws(' ', ${recruitingCandidates.firstName}, ${recruitingCandidates.lastName})`, searchTerm),
        ilike(recruitingCandidates.email, searchTerm),
        phoneSearch.length >= 4
          ? ilike(recruitingCandidates.phoneNormalized, `%${phoneSearch}%`)
          : undefined,
      )
    );
  }

  // Market isolation: filter candidates by their applications' markets or preferred markets
  if (filters?.authorizedMarkets && filters.authorizedMarkets.length > 0) {
    const marketsArray = filters.authorizedMarkets.map(m => `'${m.replace(/'/g, "''")}'`).join(', ');
    conditions.push(
      sql`(${recruitingCandidates.id} IN (
        SELECT DISTINCT ra.candidate_id 
        FROM recruiting_applications ra 
        JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id 
        WHERE rr.market = ANY(ARRAY[${sql.raw(marketsArray)}]::text[])
      ) OR ${recruitingCandidates.preferredMarkets} && ARRAY[${sql.raw(marketsArray)}]::text[])`
    );
  } else if (filters?.authorizedMarkets !== null && filters?.authorizedMarkets?.length === 0) {
    // Empty array = no access to any market (return no results)
    conditions.push(sql`1 = 0`);
  }
  // null = admin access, no market filter applied

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const candidates = await db.query.recruitingCandidates.findMany({
    where: whereClause,
    orderBy: [desc(recruitingCandidates.createdAt)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
  });

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingCandidates)
    .where(whereClause);

  if (candidates.length === 0) {
    return { candidates: [], total: countResult?.count || 0 };
  }

  const applicationRows = await db
    .select({
      id: recruitingApplications.id,
      candidateId: recruitingApplications.candidateId,
      stage: recruitingApplications.currentStage,
      appliedAt: recruitingApplications.appliedAt,
      requisitionId: recruitingApplications.requisitionId,
      requisitionTitle: recruitingRequisitions.title,
      campaignName: recruitingRequisitions.title,
      recruiterFirstName: users.firstName,
      recruiterLastName: users.lastName,
    })
    .from(recruitingApplications)
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .leftJoin(users, eq(recruitingApplications.ownerId, users.id))
    .where(inArray(recruitingApplications.candidateId, candidates.map(candidate => candidate.id)))
    .orderBy(desc(recruitingApplications.appliedAt));

  const latestByCandidate = new Map<string, typeof applicationRows[number]>();
  for (const application of applicationRows) {
    if (!latestByCandidate.has(application.candidateId)) {
      latestByCandidate.set(application.candidateId, application);
    }
  }

  return {
    candidates: candidates.map(candidate => {
      const application = latestByCandidate.get(candidate.id);
      return {
        ...candidate,
        latestApplication: application ? {
          id: application.id,
          stage: application.stage,
          appliedAt: application.appliedAt,
          requisitionId: application.requisitionId,
          requisitionTitle: application.requisitionTitle,
          campaignName: application.campaignName,
          recruiterName: [application.recruiterFirstName, application.recruiterLastName].filter(Boolean).join(" ") || null,
        } : null,
      };
    }),
    total: countResult?.count || 0,
  };
}

/**
 * Global candidate search with fuzzy matching
 * Supports: name (partial), email, phone (including last 4 digits)
 * Respects market isolation
 * Uses parameterized queries to prevent SQL injection
 */
export async function searchCandidatesGlobal(filters: {
  query: string;
  authorizedMarkets?: string[] | null; // null = admin, [] = no access
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}): Promise<{ 
  candidates: Array<Partial<RecruitingCandidate> & {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    applications: Array<{ id: string; requisitionTitle: string; market: string | null; stage: string }>;
  }>;
  total: number;
  query: string;
}> {
  const searchQuery = filters.query?.trim() || '';
  
  if (searchQuery.length < 2) {
    return { candidates: [], total: 0, query: searchQuery };
  }

  // Validate and sanitize limit/offset
  const limit = Math.min(Math.max(1, filters.limit || 20), 100); // Max 100
  const offset = Math.max(0, filters.offset || 0);

  // Market isolation: empty array = no access
  if (filters.authorizedMarkets !== null && filters.authorizedMarkets?.length === 0) {
    return { candidates: [], total: 0, query: searchQuery };
  }

  const searchTerm = `%${searchQuery}%`;
  
  // Check if query looks like phone number (digits only or with common formatting)
  const digitsOnly = searchQuery.replace(/\D/g, '');
  const isPhoneSearch = digitsOnly.length >= 4;
  const last4Pattern = isPhoneSearch ? `%${digitsOnly.slice(-4)}` : null;

  // Build conditions array for WHERE clause
  const hasMarketFilter = filters.authorizedMarkets && filters.authorizedMarkets.length > 0;
  const includeArchived = filters.includeArchived === true;

  try {
    // Use Drizzle's parameterized sql template for all user inputs
    let candidateResults: any;
    let countResults: any;

    if (hasMarketFilter && isPhoneSearch) {
      // Full query with market filter and phone search
      [candidateResults, countResults] = await Promise.all([
        db.execute(sql`
          WITH ranked_candidates AS (
            SELECT 
              c.*,
              GREATEST(
                COALESCE(similarity(c.first_name, ${searchQuery}), 0),
                COALESCE(similarity(c.last_name, ${searchQuery}), 0),
                CASE WHEN c.email ILIKE ${searchTerm} THEN 0.8 ELSE 0 END,
                CASE WHEN c.phone_normalized LIKE ${last4Pattern} THEN 0.9 ELSE 0 END
              ) as relevance_score
            FROM recruiting_candidates c
            WHERE (
              c.first_name ILIKE ${searchTerm}
              OR c.last_name ILIKE ${searchTerm}
              OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
              OR c.email ILIKE ${searchTerm}
              OR similarity(c.first_name, ${searchQuery}) > 0.3
              OR similarity(c.last_name, ${searchQuery}) > 0.3
              OR c.phone_normalized LIKE ${last4Pattern}
            )
            AND (${includeArchived} OR c.is_archived = false)
            AND (c.id IN (
              SELECT DISTINCT ra.candidate_id 
              FROM recruiting_applications ra 
              JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id 
              WHERE rr.market = ANY(${filters.authorizedMarkets}::text[])
            ) OR c.preferred_markets && ${filters.authorizedMarkets}::text[])
          )
          SELECT * FROM ranked_candidates
          ORDER BY relevance_score DESC, created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) as count
          FROM recruiting_candidates c
          WHERE (
            c.first_name ILIKE ${searchTerm}
            OR c.last_name ILIKE ${searchTerm}
            OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
            OR c.email ILIKE ${searchTerm}
            OR similarity(c.first_name, ${searchQuery}) > 0.3
            OR similarity(c.last_name, ${searchQuery}) > 0.3
            OR c.phone_normalized LIKE ${last4Pattern}
          )
          AND (${includeArchived} OR c.is_archived = false)
          AND (c.id IN (
            SELECT DISTINCT ra.candidate_id 
            FROM recruiting_applications ra 
            JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id 
            WHERE rr.market = ANY(${filters.authorizedMarkets}::text[])
          ) OR c.preferred_markets && ${filters.authorizedMarkets}::text[])
        `)
      ]);
    } else if (hasMarketFilter) {
      // Market filter without phone search
      [candidateResults, countResults] = await Promise.all([
        db.execute(sql`
          WITH ranked_candidates AS (
            SELECT 
              c.*,
              GREATEST(
                COALESCE(similarity(c.first_name, ${searchQuery}), 0),
                COALESCE(similarity(c.last_name, ${searchQuery}), 0),
                CASE WHEN c.email ILIKE ${searchTerm} THEN 0.8 ELSE 0 END
              ) as relevance_score
            FROM recruiting_candidates c
            WHERE (
              c.first_name ILIKE ${searchTerm}
              OR c.last_name ILIKE ${searchTerm}
              OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
              OR c.email ILIKE ${searchTerm}
              OR similarity(c.first_name, ${searchQuery}) > 0.3
              OR similarity(c.last_name, ${searchQuery}) > 0.3
            )
            AND (${includeArchived} OR c.is_archived = false)
            AND (c.id IN (
              SELECT DISTINCT ra.candidate_id 
              FROM recruiting_applications ra 
              JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id 
              WHERE rr.market = ANY(${filters.authorizedMarkets}::text[])
            ) OR c.preferred_markets && ${filters.authorizedMarkets}::text[])
          )
          SELECT * FROM ranked_candidates
          ORDER BY relevance_score DESC, created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) as count
          FROM recruiting_candidates c
          WHERE (
            c.first_name ILIKE ${searchTerm}
            OR c.last_name ILIKE ${searchTerm}
            OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
            OR c.email ILIKE ${searchTerm}
            OR similarity(c.first_name, ${searchQuery}) > 0.3
            OR similarity(c.last_name, ${searchQuery}) > 0.3
          )
          AND (${includeArchived} OR c.is_archived = false)
          AND (c.id IN (
            SELECT DISTINCT ra.candidate_id 
            FROM recruiting_applications ra 
            JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id 
            WHERE rr.market = ANY(${filters.authorizedMarkets}::text[])
          ) OR c.preferred_markets && ${filters.authorizedMarkets}::text[])
        `)
      ]);
    } else if (isPhoneSearch) {
      // Phone search without market filter (admin access)
      [candidateResults, countResults] = await Promise.all([
        db.execute(sql`
          WITH ranked_candidates AS (
            SELECT 
              c.*,
              GREATEST(
                COALESCE(similarity(c.first_name, ${searchQuery}), 0),
                COALESCE(similarity(c.last_name, ${searchQuery}), 0),
                CASE WHEN c.email ILIKE ${searchTerm} THEN 0.8 ELSE 0 END,
                CASE WHEN c.phone_normalized LIKE ${last4Pattern} THEN 0.9 ELSE 0 END
              ) as relevance_score
            FROM recruiting_candidates c
            WHERE (
              c.first_name ILIKE ${searchTerm}
              OR c.last_name ILIKE ${searchTerm}
              OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
              OR c.email ILIKE ${searchTerm}
              OR similarity(c.first_name, ${searchQuery}) > 0.3
              OR similarity(c.last_name, ${searchQuery}) > 0.3
              OR c.phone_normalized LIKE ${last4Pattern}
            )
            AND (${includeArchived} OR c.is_archived = false)
          )
          SELECT * FROM ranked_candidates
          ORDER BY relevance_score DESC, created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) as count
          FROM recruiting_candidates c
          WHERE (
            c.first_name ILIKE ${searchTerm}
            OR c.last_name ILIKE ${searchTerm}
            OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
            OR c.email ILIKE ${searchTerm}
            OR similarity(c.first_name, ${searchQuery}) > 0.3
            OR similarity(c.last_name, ${searchQuery}) > 0.3
            OR c.phone_normalized LIKE ${last4Pattern}
          )
          AND (${includeArchived} OR c.is_archived = false)
        `)
      ]);
    } else {
      // No market filter, no phone search (admin access)
      [candidateResults, countResults] = await Promise.all([
        db.execute(sql`
          WITH ranked_candidates AS (
            SELECT 
              c.*,
              GREATEST(
                COALESCE(similarity(c.first_name, ${searchQuery}), 0),
                COALESCE(similarity(c.last_name, ${searchQuery}), 0),
                CASE WHEN c.email ILIKE ${searchTerm} THEN 0.8 ELSE 0 END
              ) as relevance_score
            FROM recruiting_candidates c
            WHERE (
              c.first_name ILIKE ${searchTerm}
              OR c.last_name ILIKE ${searchTerm}
              OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
              OR c.email ILIKE ${searchTerm}
              OR similarity(c.first_name, ${searchQuery}) > 0.3
              OR similarity(c.last_name, ${searchQuery}) > 0.3
            )
            AND (${includeArchived} OR c.is_archived = false)
          )
          SELECT * FROM ranked_candidates
          ORDER BY relevance_score DESC, created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) as count
          FROM recruiting_candidates c
          WHERE (
            c.first_name ILIKE ${searchTerm}
            OR c.last_name ILIKE ${searchTerm}
            OR (c.first_name || ' ' || c.last_name) ILIKE ${searchTerm}
            OR c.email ILIKE ${searchTerm}
            OR similarity(c.first_name, ${searchQuery}) > 0.3
            OR similarity(c.last_name, ${searchQuery}) > 0.3
          )
          AND (${includeArchived} OR c.is_archived = false)
        `)
      ]);
    }

    const rawCandidates = (candidateResults.rows || []) as any[];
    const total = parseInt((countResults.rows?.[0] as any)?.count || '0', 10);

    // Fetch active applications for each candidate
    const candidateIds = rawCandidates.map(c => c.id);
    
    let applicationsMap: Map<string, Array<{ id: string; requisitionTitle: string; market: string | null; stage: string }>> = new Map();
    
    if (candidateIds.length > 0) {
      const candidateIdArray = `{${candidateIds.join(',')}}`;
      const applications = await db.execute(sql`
        SELECT 
          ra.id,
          ra.candidate_id,
          ra.current_stage as stage,
          rr.title as requisition_title,
          rr.market
        FROM recruiting_applications ra
        JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id
        WHERE ra.candidate_id = ANY(${candidateIdArray}::text[])
          AND ra.current_stage != 'withdrawn'
        ORDER BY ra.created_at DESC
      `);

      for (const app of (applications.rows || []) as any[]) {
        const candidateApps = applicationsMap.get(app.candidate_id) || [];
        candidateApps.push({
          id: app.id,
          requisitionTitle: app.requisition_title,
          market: app.market,
          stage: app.stage,
        });
        applicationsMap.set(app.candidate_id, candidateApps);
      }
    }

    // Map raw results to typed candidates with applications
    const candidates = rawCandidates.map(raw => ({
      id: raw.id,
      firstName: raw.first_name,
      lastName: raw.last_name,
      middleName: raw.middle_name,
      email: raw.email,
      emailNormalized: raw.email_normalized,
      phone: raw.phone,
      phoneNormalized: raw.phone_normalized,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      zipCode: raw.zip_code,
      source: raw.source,
      sourceDetails: raw.source_details,
      referredBy: raw.referred_by,
      status: raw.status,
      yearsExperience: raw.years_experience,
      hasCommercialLicense: raw.has_commercial_license,
      licenseClass: raw.license_class,
      licenseState: raw.license_state,
      licenseExpiration: raw.license_expiration,
      endorsements: raw.endorsements,
      preferredMarkets: raw.preferred_markets,
      preferredWorkType: raw.preferred_work_type,
      preferredWorkerType: raw.preferred_worker_type,
      preferredChannel: raw.preferred_channel,
      contactHoursStart: raw.contact_hours_start,
      contactHoursEnd: raw.contact_hours_end,
      contactTimezone: raw.contact_timezone,
      doNotContact: raw.do_not_contact,
      doNotContactReason: raw.do_not_contact_reason,
      doNotContactSetAt: raw.do_not_contact_set_at,
      doNotContactSetBy: raw.do_not_contact_set_by,
      languagePreference: raw.language_preference,
      languagePreferenceSetAt: raw.language_preference_set_at,
      languagePreferenceSetBy: raw.language_preference_set_by,
      notes: raw.notes,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      createdBy: raw.created_by,
      updatedBy: raw.updated_by,
      mergedIntoId: raw.merged_into_id,
      mergedAt: raw.merged_at,
      isArchived: raw.is_archived,
      archivedAt: raw.archived_at,
      archivedBy: raw.archived_by,
      archiveReason: raw.archive_reason,
      reactivatedAt: raw.reactivated_at,
      reactivatedBy: raw.reactivated_by,
      reactivationCount: raw.reactivation_count,
      latitude: raw.latitude,
      longitude: raw.longitude,
      maxTravelRadius: raw.max_travel_radius,
      applications: applicationsMap.get(raw.id) || [],
    }));

    return { candidates, total, query: searchQuery };
  } catch (error) {
    console.error('[Recruiting Search] Error executing search:', error);
    throw error;
  }
}

export async function findCandidateByEmailOrPhone(
  email: string,
  phone?: string
): Promise<RecruitingCandidate | null> {
  const emailNormalized = normalizeEmail(email);
  const phoneNormalized = normalizePhone(phone);

  const candidate = await db.query.recruitingCandidates.findFirst({
    where: or(
      eq(recruitingCandidates.emailNormalized, emailNormalized),
      phoneNormalized ? eq(recruitingCandidates.phoneNormalized, phoneNormalized) : undefined
    ),
  });

  return candidate || null;
}

export async function createRequisition(
  data: InsertRecruitingRequisition,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingRequisition> {
  const resolvedUserId = await resolveUserId(userId);
  
  const [requisition] = await db.insert(recruitingRequisitions).values({
    ...data,
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "REQUISITION_CREATED",
    "requisition",
    requisition.id,
    userId,
    userEmail,
    null,
    { id: requisition.id, title: requisition.title, market: requisition.market, status: requisition.status },
    null
  );

  return requisition;
}

export async function updateRequisition(
  id: string,
  data: Partial<InsertRecruitingRequisition>,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingRequisition | null> {
  const existing = await db.query.recruitingRequisitions.findFirst({
    where: eq(recruitingRequisitions.id, id),
  });

  if (!existing) return null;

  const resolvedUserId = await resolveUserId(userId);
  const statusChanged = data.status && data.status !== existing.status;
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date(), updatedBy: resolvedUserId };

  if (data.status === 'open' && !existing.openedAt) {
    updateData.openedAt = new Date();
  }
  if (data.status === 'closed' || data.status === 'cancelled' || data.status === 'filled') {
    updateData.closedAt = new Date();
  }

  const [updated] = await db.update(recruitingRequisitions)
    .set(updateData)
    .where(eq(recruitingRequisitions.id, id))
    .returning();

  const actionType = statusChanged ? "REQUISITION_STATUS_CHANGED" : "REQUISITION_UPDATED";
  await writeAuditEvent(
    actionType,
    "requisition",
    id,
    userId,
    userEmail,
    { status: existing.status, title: existing.title },
    { status: updated.status, title: updated.title },
    Object.keys(data)
  );

  const licenseFields = ['requiredLicenseClass', 'requiredEndorsements', 'licenseGateEnabled'];
  const hasLicenseChanges = Object.keys(data).some(f => licenseFields.includes(f));
  if (hasLicenseChanges) {
    try {
      const { refreshLicenseForRequisition } = await import("./services/licenseEligibilityService");
      await refreshLicenseForRequisition(id);
      console.log(`[Recruiting] Refreshed license eligibility for requisition ${id} after requirements change`);
    } catch (err) {
      console.error("[Recruiting] License refresh for requisition failed (non-blocking):", err);
    }
  }

  return updated;
}

export async function getRequisition(id: string): Promise<RecruitingRequisition | null> {
  const requisition = await db.query.recruitingRequisitions.findFirst({
    where: eq(recruitingRequisitions.id, id),
  });
  return requisition || null;
}

export async function getRequisitions(filters?: {
  market?: string;
  status?: string;
  limit?: number;
  offset?: number;
  authorizedMarkets?: string[] | null;
}): Promise<{ requisitions: RecruitingRequisition[]; total: number }> {
  const conditions = [];

  // Single market filter (from query params)
  if (filters?.market) {
    conditions.push(eq(recruitingRequisitions.market, filters.market));
  }

  // Market isolation: filter by authorized markets
  if (filters?.authorizedMarkets && filters.authorizedMarkets.length > 0) {
    const marketsArray = filters.authorizedMarkets.map(m => `'${m.replace(/'/g, "''")}'`).join(', ');
    conditions.push(
      sql`${recruitingRequisitions.market} = ANY(ARRAY[${sql.raw(marketsArray)}]::text[])`
    );
  } else if (filters?.authorizedMarkets !== null && filters?.authorizedMarkets?.length === 0) {
    // Empty array = no access to any market (return no results)
    conditions.push(sql`1 = 0`);
  }
  // null = admin access, no market filter applied

  if (filters?.status) {
    conditions.push(sql`${recruitingRequisitions.status} = ${filters.status}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const requisitions = await db.query.recruitingRequisitions.findMany({
    where: whereClause,
    orderBy: [desc(recruitingRequisitions.createdAt)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
  });

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingRequisitions)
    .where(whereClause);

  return { requisitions, total: countResult?.count || 0 };
}

export async function createApplication(
  data: InsertRecruitingApplication,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingApplication> {
  const requisition = await getRequisition(data.requisitionId);
  if (!requisition) {
    throw new Error("Requisition not found");
  }

  if (requisition.status !== 'open') {
    throw new Error("Applications can only be created for open requisitions");
  }

  const existingApplication = await db.query.recruitingApplications.findFirst({
    where: and(
      eq(recruitingApplications.candidateId, data.candidateId),
      eq(recruitingApplications.requisitionId, data.requisitionId)
    ),
  });

  if (existingApplication) {
    throw new Error("Candidate is already attached to this job posting.");
  }

  // DNR enforcement: block application creation for DNR candidates without override
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, data.candidateId),
    columns: { isDnr: true, dnrOverrideAt: true, dnrReasonCode: true },
  });
  if (candidate?.isDnr && !candidate.dnrOverrideAt) {
    throw new Error("Candidate is flagged as Do-Not-Rehire and cannot have new applications created");
  }

  let initialStage: string | null = null;
  if (requisition.workflowId) {
    const entryStage = await db.query.recruitingWorkflowStages.findFirst({
      where: and(
        eq(recruitingWorkflowStages.workflowId, requisition.workflowId),
        eq(recruitingWorkflowStages.isInitial, true)
      ),
      orderBy: [recruitingWorkflowStages.sortOrder],
    });
    if (entryStage) {
      initialStage = entryStage.stageKey;
    } else {
      const firstStage = await db.query.recruitingWorkflowStages.findFirst({
        where: eq(recruitingWorkflowStages.workflowId, requisition.workflowId),
        orderBy: [recruitingWorkflowStages.sortOrder],
      });
      if (firstStage) {
        initialStage = firstStage.stageKey;
      }
    }
    if (!initialStage) {
      throw new Error("Workflow template has no stages configured. Cannot create application without a valid initial stage.");
    }
  } else {
    initialStage = 'applied';
  }

  const resolvedUserId = await resolveUserId(userId);

  const { currentStage: _ignoredStage, ...safeData } = data as any;
  const [application] = await db.insert(recruitingApplications).values({
    ...safeData,
    currentStage: initialStage,
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await db.insert(recruitingStageHistory).values({
    applicationId: application.id,
    fromStage: null,
    toStage: initialStage,
    transitionedBy: resolvedUserId,
    sourceAction: 'application_created',
  });

  await writeAuditEvent(
    "APPLICATION_CREATED",
    "application",
    application.id,
    userId,
    userEmail,
    null,
    { id: application.id, candidateId: application.candidateId, requisitionId: application.requisitionId, currentStage: application.currentStage },
    null
  );

  if (!application.ownerId) {
    try {
      const { autoAssignApplication } = await import("./assignmentEngine");
      const assignResult = await autoAssignApplication(application.id, data.requisitionId);
      if (assignResult.assigned) {
        console.log(`[Recruiting] Auto-assigned application ${application.id} to ${assignResult.recruiterEmail} via rule "${assignResult.ruleName}"`);
        const [updated] = await db.select().from(recruitingApplications).where(eq(recruitingApplications.id, application.id));
        if (updated) return updated;
      }
    } catch (err) {
      console.error("[Recruiting] Auto-assignment failed (non-blocking):", err);
    }
  }

  try {
    const { computeAndUpdateGeoEligibility } = await import("./services/geoEligibilityService");
    const geoResult = await computeAndUpdateGeoEligibility(application.id);
    if (geoResult) {
      console.log(`[Recruiting] Geo-eligibility computed for application ${application.id}: ${geoResult.distanceMiles}mi, eligible=${geoResult.geoEligible}`);
    }
  } catch (err) {
    console.error("[Recruiting] Geo-eligibility computation failed (non-blocking):", err);
  }

  try {
    const { computeAndUpdateLicenseEligibility } = await import("./services/licenseEligibilityService");
    await computeAndUpdateLicenseEligibility(application.id);
  } catch (err) {
    console.error("[Recruiting] License eligibility computation failed (non-blocking):", err);
  }

  // Fire-and-forget: AI pre-screen scoring (targets recruiting_applications)
  import("./services/prescreenScoringService").then(({ runPrescreenScoring }) => {
    runPrescreenScoring(application.id)
      .catch((e: unknown) => console.error("[PrescreenScoring] createApplication trigger error:", e));
  }).catch(() => {});

  return application;
}

export async function transitionApplicationStage(
  applicationId: string,
  toStage: string,
  userId: string | null,
  userEmail: string | null,
  reason?: string,
  adminOverride?: boolean
): Promise<RecruitingApplication> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });

  if (!application) {
    throw new Error("Application not found");
  }

  const requisition = await getRequisition(application.requisitionId);
  if (!requisition) {
    throw new Error("Requisition not found");
  }

  if (requisition.workflowId) {
    const validationResult = await validateTransition(
      requisition.workflowId,
      application.currentStage,
      toStage
    );

    if (!validationResult.valid) {
      if (!adminOverride) {
        throw new Error(`Invalid stage transition from '${application.currentStage}' to '${toStage}'`);
      }
      console.log(`[Recruiting] Admin override: forcing transition from '${application.currentStage}' to '${toStage}' by user ${userId}`);
    }

    if (validationResult.transition?.requiresReason && (!reason || reason.trim().length === 0)) {
      throw new Error(`Reason is required for transition from '${application.currentStage}' to '${toStage}'`);
    }
  }

  // Background check gate: Block transition to approved/ready stages if gate is enabled
  const gatedStages = ['approved', 'ready', 'ready_to_work', 'hired'];
  if (gatedStages.includes(toStage.toLowerCase())) {
    const { checkBackgroundGate } = await import("./services/backgroundCheckService");
    const gateResult = await checkBackgroundGate(applicationId);
    if (!gateResult.canProceed) {
      throw new Error(`Cannot transition to '${toStage}': ${gateResult.reason}`);
    }
  }

  // License gate: Block transition to approved/ready stages if license gate is enabled
  if (gatedStages.includes(toStage.toLowerCase())) {
    const { checkLicenseGate } = await import("./services/licenseEligibilityService");
    const licenseResult = await checkLicenseGate(applicationId);
    if (!licenseResult.canProceed) {
      throw new Error(`Cannot transition to '${toStage}': ${licenseResult.reason}`);
    }
  }

  const timeInPreviousStage = application.currentStageEnteredAt
    ? Math.floor((Date.now() - new Date(application.currentStageEnteredAt).getTime()) / (1000 * 60))
    : null;

  const fromStage = application.currentStage;
  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(recruitingApplications)
    .set({
      currentStage: toStage,
      currentStageEnteredAt: new Date(),
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(recruitingApplications.id, applicationId))
    .returning();

  await db.insert(recruitingStageHistory).values({
    applicationId,
    fromStage,
    toStage,
    transitionedBy: resolvedUserId,
    reason,
    timeInPreviousStageMinutes: timeInPreviousStage,
    sourceAction: 'manual',
  });

  await writeAuditEvent(
    "APPLICATION_STAGE_CHANGED",
    "application",
    applicationId,
    userId,
    userEmail,
    { currentStage: fromStage },
    { currentStage: toStage },
    ['currentStage'],
    reason
  );

  // Check for referral milestone rewards on stage transitions
  if (toStage === 'hired' || toStage === 'ready_to_work') {
    try {
      await checkAndCreateMilestoneReward(applicationId, toStage, userId, userEmail);
    } catch (error) {
      console.error("[Recruiting] Error checking milestone reward:", error);
    }
  }

  return updated;
}

export async function validateTransition(
  workflowId: string,
  fromStageKey: string,
  toStageKey: string
): Promise<{ valid: boolean; transition?: RecruitingWorkflowTransition }> {
  const fromStage = await db.query.recruitingWorkflowStages.findFirst({
    where: and(
      eq(recruitingWorkflowStages.workflowId, workflowId),
      eq(recruitingWorkflowStages.stageKey, fromStageKey)
    ),
  });

  const toStage = await db.query.recruitingWorkflowStages.findFirst({
    where: and(
      eq(recruitingWorkflowStages.workflowId, workflowId),
      eq(recruitingWorkflowStages.stageKey, toStageKey)
    ),
  });

  if (!fromStage || !toStage) {
    return { valid: false };
  }

  const transition = await db.query.recruitingWorkflowTransitions.findFirst({
    where: and(
      eq(recruitingWorkflowTransitions.workflowId, workflowId),
      eq(recruitingWorkflowTransitions.fromStageId, fromStage.id),
      eq(recruitingWorkflowTransitions.toStageId, toStage.id)
    ),
  });

  return transition ? { valid: true, transition } : { valid: false };
}

export async function getApplication(id: string): Promise<RecruitingApplication | null> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, id),
  });
  return application || null;
}

export async function getApplicationWithDetails(id: string) {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, id),
    with: {
      candidate: true,
      requisition: true,
      stageHistory: {
        orderBy: [desc(recruitingStageHistory.transitionedAt)],
      },
    },
  });
  return application || null;
}

type ApplicationWithRelations = RecruitingApplication & {
  candidate?: RecruitingCandidate | null;
  requisition?: RecruitingRequisition | null;
};

export async function getApplications(filters?: {
  requisitionId?: string;
  candidateId?: string;
  market?: string;
  stage?: string;
  source?: string;
  createdFrom?: string;
  createdTo?: string;
  slaBreached?: boolean;
  readinessStatus?: string;
  tag?: string;
  geoEligible?: boolean | null;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
  authorizedMarkets?: string[] | null;
}): Promise<{ applications: (ApplicationWithRelations & { tags?: string[] })[]; total: number }> {
  const conditions = [];

  if (!filters?.includeArchived) {
    conditions.push(eq(recruitingApplications.isArchived, false));
  }

  if (filters?.requisitionId) {
    conditions.push(eq(recruitingApplications.requisitionId, filters.requisitionId));
  }

  if (filters?.candidateId) {
    conditions.push(eq(recruitingApplications.candidateId, filters.candidateId));
  }

  if (filters?.stage) {
    conditions.push(eq(recruitingApplications.currentStage, filters.stage));
  }

  if (filters?.readinessStatus) {
    conditions.push(eq(recruitingApplications.readinessStatus, filters.readinessStatus));
  }

  if (filters?.geoEligible === true) {
    conditions.push(eq(recruitingApplications.geoEligible, true));
  } else if (filters?.geoEligible === false) {
    conditions.push(eq(recruitingApplications.geoEligible, false));
  }

  if (filters?.source) {
    // Match on application-level source (Ticket 23) OR candidate-level source (legacy)
    conditions.push(
      sql`(${recruitingApplications.source} = ${filters.source} OR (
        ${recruitingApplications.source} IS NULL AND
        ${recruitingApplications.candidateId} IN (
          SELECT id FROM recruiting_candidates WHERE source = ${filters.source}
        )
      ))`
    );
  }

  if (filters?.createdFrom) {
    conditions.push(sql`${recruitingApplications.createdAt} >= ${filters.createdFrom}::timestamp`);
  }

  if (filters?.createdTo) {
    conditions.push(sql`${recruitingApplications.createdAt} <= (${filters.createdTo}::date + interval '1 day')`);
  }

  // Market isolation: filter by authorized markets at query level
  if (filters?.authorizedMarkets && filters.authorizedMarkets.length > 0) {
    const marketsArray = filters.authorizedMarkets.map(m => `'${m.replace(/'/g, "''")}'`).join(', ');
    conditions.push(
      sql`${recruitingApplications.requisitionId} IN (
        SELECT id FROM recruiting_requisitions 
        WHERE market = ANY(ARRAY[${sql.raw(marketsArray)}]::text[])
      )`
    );
  } else if (filters?.authorizedMarkets !== null && filters?.authorizedMarkets?.length === 0) {
    // Empty array = no access to any market (return no results)
    conditions.push(sql`1 = 0`);
  }
  // null = admin access, no market filter applied

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let applications = await db.query.recruitingApplications.findMany({
    where: whereClause,
    orderBy: [desc(recruitingApplications.updatedAt)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
    with: {
      candidate: true,
      requisition: true,
    },
  });

  // Additional single market filter (from query params, not permission-based)
  if (filters?.market) {
    applications = applications.filter(app => app.requisition?.market === filters.market);
  }

  // Fetch tags for all applications
  const applicationIds = applications.map(app => app.id);
  const allTags = applicationIds.length > 0 ? await db.query.recruitingApplicationTags.findMany({
    where: or(...applicationIds.map(id => eq(recruitingApplicationTags.applicationId, id))),
  }) : [];

  // Group tags by application ID
  const tagsByAppId: Record<string, string[]> = {};
  for (const tagRow of allTags) {
    if (!tagsByAppId[tagRow.applicationId]) {
      tagsByAppId[tagRow.applicationId] = [];
    }
    tagsByAppId[tagRow.applicationId].push(tagRow.tag);
  }

  // Add tags to applications
  let applicationsWithTags = applications.map(app => ({
    ...app,
    tags: tagsByAppId[app.id] || [],
  }));

  // Filter by tag if specified
  if (filters?.tag) {
    applicationsWithTags = applicationsWithTags.filter(app => 
      app.tags.includes(filters.tag!)
    );
    // When tag filter is applied, return the filtered count
    return { applications: applicationsWithTags, total: applicationsWithTags.length };
  }

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingApplications)
    .where(whereClause);

  return { applications: applicationsWithTags, total: countResult?.count || 0 };
}

export async function getStageHistory(applicationId: string): Promise<RecruitingStageHistory[]> {
  const history = await db.query.recruitingStageHistory.findMany({
    where: eq(recruitingStageHistory.applicationId, applicationId),
    orderBy: [desc(recruitingStageHistory.transitionedAt)],
  });
  return history;
}

export function computeFieldDiffs(previousValue: string | null, newValue: string | null, changedFields: string[] | null): Array<{ field: string; before: any; after: any }> {
  const diffs: Array<{ field: string; before: any; after: any }> = [];
  try {
    const prev = previousValue ? JSON.parse(previousValue) : {};
    const next = newValue ? JSON.parse(newValue) : {};
    const fields = changedFields && changedFields.length > 0
      ? changedFields
      : Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
    for (const field of fields) {
      const before = prev[field];
      const after = next[field];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ field, before: before ?? null, after: after ?? null });
      }
    }
  } catch {
    if (previousValue || newValue) {
      diffs.push({ field: '_raw', before: previousValue, after: newValue });
    }
  }
  return diffs;
}

export async function getAuditEvents(filters?: {
  entityType?: string;
  entityId?: string;
  userId?: string;
  actionType?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  includeDiffs?: boolean;
}): Promise<{ events: any[]; total: number }> {
  const conditions = [];

  if (filters?.entityType) {
    conditions.push(eq(recruitingAuditEvents.entityType, filters.entityType));
  }

  if (filters?.entityId) {
    conditions.push(eq(recruitingAuditEvents.entityId, filters.entityId));
  }

  if (filters?.userId) {
    conditions.push(eq(recruitingAuditEvents.userId, filters.userId));
  }

  if (filters?.actionType) {
    conditions.push(eq(recruitingAuditEvents.actionType, filters.actionType));
  }

  if (filters?.source) {
    conditions.push(eq(recruitingAuditEvents.source, filters.source));
  }

  if (filters?.dateFrom) {
    conditions.push(gte(recruitingAuditEvents.occurredAt, new Date(filters.dateFrom)));
  }

  if (filters?.dateTo) {
    conditions.push(lte(recruitingAuditEvents.occurredAt, new Date(filters.dateTo)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const events = await db.query.recruitingAuditEvents.findMany({
    where: whereClause,
    orderBy: [desc(recruitingAuditEvents.occurredAt)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
  });

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingAuditEvents)
    .where(whereClause);

  if (filters?.includeDiffs) {
    const enriched = events.map(e => ({
      ...e,
      diffs: computeFieldDiffs(e.previousValue, e.newValue, e.changedFields),
    }));
    return { events: enriched, total: countResult?.count || 0 };
  }

  return { events, total: countResult?.count || 0 };
}

export async function getDistinctAuditActionTypes(): Promise<string[]> {
  const results = await db.selectDistinct({ actionType: recruitingAuditEvents.actionType })
    .from(recruitingAuditEvents)
    .orderBy(recruitingAuditEvents.actionType);
  return results.map(r => r.actionType);
}

export async function getDistinctAuditEntityTypes(): Promise<string[]> {
  const results = await db.selectDistinct({ entityType: recruitingAuditEvents.entityType })
    .from(recruitingAuditEvents)
    .orderBy(recruitingAuditEvents.entityType);
  return results.map(r => r.entityType);
}

export async function createWorkflow(
  data: {
    name: string;
    description?: string;
    market?: string;
    workerType?: "W2_DRIVER" | "IC_DRIVER" | "CORP_EMPLOYEE";
    isDefault?: boolean;
  },
  userId: string | null
): Promise<RecruitingWorkflow> {
  const resolvedUserId = await resolveUserId(userId);
  
  const [workflow] = await db.insert(recruitingWorkflows).values({
    ...data,
    status: 'draft',
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  return workflow;
}

export async function getWorkflows(): Promise<RecruitingWorkflow[]> {
  return db.query.recruitingWorkflows.findMany({
    orderBy: [desc(recruitingWorkflows.createdAt)],
  });
}

export async function getWorkflow(id: string): Promise<RecruitingWorkflow | null> {
  const workflow = await db.query.recruitingWorkflows.findFirst({
    where: eq(recruitingWorkflows.id, id),
  });
  return workflow || null;
}

export async function getWorkflowWithStages(id: string) {
  const workflow = await db.query.recruitingWorkflows.findFirst({
    where: eq(recruitingWorkflows.id, id),
    with: {
      stages: {
        orderBy: [recruitingWorkflowStages.sortOrder],
      },
      transitions: true,
    },
  });
  return workflow || null;
}

export async function createWorkflowStage(
  data: {
    workflowId: string;
    stageKey: string;
    displayName: string;
    description?: string;
    sortOrder: number;
    stageSlaHours?: number;
    isInitial?: boolean;
    isTerminal?: boolean;
    color?: string;
    icon?: string;
  }
): Promise<RecruitingWorkflowStage> {
  const [stage] = await db.insert(recruitingWorkflowStages).values(data).returning();
  return stage;
}

export async function createWorkflowTransition(
  data: {
    workflowId: string;
    fromStageId: string;
    toStageId: string;
    name?: string;
    requiresReason?: boolean;
  }
): Promise<RecruitingWorkflowTransition> {
  const [transition] = await db.insert(recruitingWorkflowTransitions).values(data).returning();
  return transition;
}

export async function activateWorkflow(
  id: string,
  userId: string | null
): Promise<RecruitingWorkflow> {
  const resolvedUserId = await resolveUserId(userId);
  
  const [updated] = await db.update(recruitingWorkflows)
    .set({ status: 'active', updatedAt: new Date(), updatedBy: resolvedUserId })
    .where(eq(recruitingWorkflows.id, id))
    .returning();

  return updated;
}

export async function getDefaultWorkflow(): Promise<RecruitingWorkflow | null> {
  const workflow = await db.query.recruitingWorkflows.findFirst({
    where: and(
      eq(recruitingWorkflows.isDefault, true),
      eq(recruitingWorkflows.status, 'active')
    ),
  });
  return workflow || null;
}

export async function getApplicationsWithSlaStatus(filters?: {
  requisitionId?: string;
  candidateId?: string;
  market?: string;
  stage?: string;
  source?: string;
  createdFrom?: string;
  createdTo?: string;
  slaBreached?: boolean;
  readinessStatus?: string;
  tag?: string;
  geoEligible?: boolean | null;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
  authorizedMarkets?: string[] | null;
}) {
  const { applications, total } = await getApplications(filters);

  // OPTIMIZATION: Batch load all workflow stages to prevent N+1 queries
  // Collect unique workflow IDs from applications
  const workflowIds = [...new Set(
    applications
      .map(app => app.requisition?.workflowId)
      .filter((id): id is string => !!id)
  )];

  // Single batch query for all workflow stages using parameterized query
  const allStages = workflowIds.length > 0
    ? await db.query.recruitingWorkflowStages.findMany({
        where: inArray(recruitingWorkflowStages.workflowId, workflowIds),
      })
    : [];

  // Create lookup map: workflowId:stageKey -> stage
  const stageMap = new Map<string, typeof allStages[0]>();
  for (const stage of allStages) {
    stageMap.set(`${stage.workflowId}:${stage.stageKey}`, stage);
  }

  // Process applications with cached stage data (no additional queries)
  const applicationsWithSla = applications.map((app) => {
    let slaBreached = false;
    let slaBreachedMinutes: number | null = null;

    if (app.requisition?.workflowId) {
      const stage = stageMap.get(`${app.requisition.workflowId}:${app.currentStage}`);

      if (stage?.stageSlaHours) {
        const hoursInStage = (Date.now() - new Date(app.currentStageEnteredAt).getTime()) / (1000 * 60 * 60);
        if (hoursInStage > stage.stageSlaHours) {
          slaBreached = true;
          slaBreachedMinutes = Math.floor((hoursInStage - stage.stageSlaHours) * 60);
        }
      }
    }

    return { ...app, slaBreached, slaBreachedMinutes };
  });

  if (filters?.slaBreached !== undefined) {
    const filtered = applicationsWithSla.filter(app => app.slaBreached === filters.slaBreached);
    return { applications: filtered, total: filtered.length };
  }

  return { applications: applicationsWithSla, total };
}

export async function seedDefaultWorkflow(): Promise<RecruitingWorkflow> {
  const existing = await getDefaultWorkflow();
  if (existing) {
    return existing;
  }

  const workflow = await createWorkflow({
    name: "Standard Driver Pipeline",
    description: "Default recruiting workflow for driver positions",
    isDefault: true,
  }, null);

  const mvpStages = [
    { stageKey: "applied", displayName: "New / Applied", sortOrder: 0, isInitial: true, stageSlaHours: 24, color: "#3B82F6", icon: "inbox" },
    { stageKey: "screening", displayName: "Screening", sortOrder: 1, stageSlaHours: 48, color: "#8B5CF6", icon: "search" },
    { stageKey: "docs_pending", displayName: "Docs Pending", sortOrder: 2, stageSlaHours: 72, color: "#F59E0B", icon: "file-text" },
    { stageKey: "background_pending", displayName: "Background Pending", sortOrder: 3, stageSlaHours: 168, color: "#EF4444", icon: "shield" },
    { stageKey: "approved", displayName: "Approved", sortOrder: 4, stageSlaHours: 24, color: "#10B981", icon: "check-circle" },
    { stageKey: "ready_to_work", displayName: "Ready-to-Work", sortOrder: 5, isTerminal: true, color: "#22C55E", icon: "user-check" },
    { stageKey: "rejected", displayName: "Rejected", sortOrder: 6, isTerminal: true, color: "#DC2626", icon: "x-circle" },
    { stageKey: "withdrawn", displayName: "Withdrawn", sortOrder: 7, isTerminal: true, color: "#9CA3AF", icon: "user-x" },
    { stageKey: "on_hold", displayName: "On Hold", sortOrder: 8, color: "#6B7280", icon: "pause-circle" },
  ];

  const stageMap: Record<string, RecruitingWorkflowStage> = {};
  for (const stageData of mvpStages) {
    const stage = await createWorkflowStage({
      workflowId: workflow.id,
      ...stageData,
    });
    stageMap[stageData.stageKey] = stage;
  }

  const transitions = [
    { from: "applied", to: "screening", name: "Start Screening" },
    { from: "applied", to: "rejected", name: "Reject", requiresReason: true },
    { from: "applied", to: "withdrawn", name: "Withdraw", requiresReason: true },
    { from: "applied", to: "on_hold", name: "Put on Hold" },
    { from: "screening", to: "docs_pending", name: "Request Documents" },
    { from: "screening", to: "rejected", name: "Reject", requiresReason: true },
    { from: "screening", to: "withdrawn", name: "Withdraw", requiresReason: true },
    { from: "screening", to: "on_hold", name: "Put on Hold" },
    { from: "docs_pending", to: "background_pending", name: "Start Background Check" },
    { from: "docs_pending", to: "rejected", name: "Reject", requiresReason: true },
    { from: "docs_pending", to: "withdrawn", name: "Withdraw", requiresReason: true },
    { from: "docs_pending", to: "on_hold", name: "Put on Hold" },
    { from: "background_pending", to: "approved", name: "Approve" },
    { from: "background_pending", to: "rejected", name: "Reject", requiresReason: true },
    { from: "background_pending", to: "withdrawn", name: "Withdraw", requiresReason: true },
    { from: "background_pending", to: "on_hold", name: "Put on Hold" },
    { from: "approved", to: "ready_to_work", name: "Mark Ready to Work" },
    { from: "approved", to: "rejected", name: "Reject", requiresReason: true },
    { from: "approved", to: "withdrawn", name: "Withdraw", requiresReason: true },
    { from: "on_hold", to: "screening", name: "Resume Screening" },
    { from: "on_hold", to: "docs_pending", name: "Resume Documents" },
    { from: "on_hold", to: "rejected", name: "Reject", requiresReason: true },
    { from: "on_hold", to: "withdrawn", name: "Withdraw", requiresReason: true },
  ];

  for (const t of transitions) {
    await createWorkflowTransition({
      workflowId: workflow.id,
      fromStageId: stageMap[t.from].id,
      toStageId: stageMap[t.to].id,
      name: t.name,
      requiresReason: t.requiresReason || false,
    });
  }

  await activateWorkflow(workflow.id, null);

  return workflow;
}

export async function getReadyDrivers(filters?: {
  market?: string;
}): Promise<{ candidateId: string; applicationId: string; candidateName: string; market: string }[]> {
  const applications = await db.query.recruitingApplications.findMany({
    where: eq(recruitingApplications.currentStage, 'ready_to_work'),
    with: {
      candidate: true,
      requisition: true,
    },
  });

  let filtered = applications;
  if (filters?.market) {
    filtered = applications.filter(app => app.requisition?.market === filters.market);
  }

  return filtered.map(app => ({
    candidateId: app.candidateId,
    applicationId: app.id,
    candidateName: `${app.candidate?.firstName} ${app.candidate?.lastName}`,
    market: app.requisition?.market || 'unknown',
  }));
}

// ============================================================================
// READINESS SCORE - Deployable Driver Gate
// ============================================================================

export interface ReadinessRule {
  id: string;
  name: string;
  weight: number;
  check: (app: RecruitingApplication) => { passed: boolean; reason: string };
}

export interface ReadinessResult {
  rule: string;
  name: string;
  passed: boolean;
  reason: string;
  weight: number;
}

const READINESS_RULES: ReadinessRule[] = [
  {
    id: 'consent',
    name: 'Consent Captured',
    weight: 20,
    check: (app) => ({
      passed: app.consentCaptured === true,
      reason: app.consentCaptured ? 'Consent captured' : 'Consent not captured',
    }),
  },
  {
    id: 'docs',
    name: 'Required Documents Complete',
    weight: 25,
    check: (app) => ({
      passed: app.docsComplete === true,
      reason: app.docsComplete ? 'All documents complete' : 'Required documents incomplete or expired',
    }),
  },
  {
    id: 'background',
    name: 'Background Check Passed',
    weight: 30,
    check: (app) => ({
      passed: app.backgroundCheckStatus === 'passed',
      reason: app.backgroundCheckStatus === 'passed' 
        ? 'Background check passed'
        : `Background check: ${app.backgroundCheckStatus || 'pending'}`,
    }),
  },
  {
    id: 'responsiveness',
    name: 'Candidate Responsiveness',
    weight: 15,
    check: (app) => {
      if (!app.lastContactedAt) {
        return { passed: false, reason: 'No contact recorded' };
      }
      if (!app.lastResponseAt) {
        return { passed: false, reason: 'No response recorded' };
      }
      const contactDate = new Date(app.lastContactedAt);
      const responseDate = new Date(app.lastResponseAt);
      const hoursSinceContact = (Date.now() - contactDate.getTime()) / (1000 * 60 * 60);
      const hasRecentResponse = responseDate >= contactDate || hoursSinceContact < 72;
      return {
        passed: hasRecentResponse,
        reason: hasRecentResponse ? 'Candidate responsive' : 'No response in 72+ hours',
      };
    },
  },
  {
    id: 'stage',
    name: 'Pipeline Stage',
    weight: 10,
    check: (app) => {
      const readyStages = ['approved', 'ready_to_work'];
      const passed = readyStages.includes(app.currentStage);
      return {
        passed,
        reason: passed ? `Stage: ${app.currentStage}` : `Not in final stage (current: ${app.currentStage})`,
      };
    },
  },
];

export function calculateReadiness(app: RecruitingApplication): {
  score: number;
  status: ReadinessStatus;
  reasons: ReadinessResult[];
} {
  const reasons: ReadinessResult[] = [];
  let totalScore = 0;

  for (const rule of READINESS_RULES) {
    const result = rule.check(app);
    reasons.push({
      rule: rule.id,
      name: rule.name,
      passed: result.passed,
      reason: result.reason,
      weight: rule.weight,
    });
    if (result.passed) {
      totalScore += rule.weight;
    }
  }

  let status: ReadinessStatus = 'not_ready';
  if (totalScore >= 90) {
    status = 'ready';
  } else if (totalScore >= 60) {
    status = 'in_review';
  }

  return { score: totalScore, status, reasons };
}

export async function recalculateReadiness(
  applicationId: string,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingApplication | null> {
  const app = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });

  if (!app) return null;

  const { score: baseScore, status: baseStatus, reasons } = calculateReadiness(app);
  let finalScore = baseScore;
  let finalStatus = baseStatus;

  try {
    const candidate = app.candidateId ? await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, app.candidateId),
    }) : null;

    if (candidate) {
      const market = app.market || null;
      let workAuthFlagEnabled = false;
      if (market) {
        const flag = await db.query.recruitingFeatureFlags.findFirst({
          where: and(
            eq(recruitingFeatureFlags.flagKey, 'work_auth_required'),
            eq(recruitingFeatureFlags.isEnabled, true),
            or(
              eq(recruitingFeatureFlags.scope, 'global'),
              and(eq(recruitingFeatureFlags.scope, 'market'), eq(recruitingFeatureFlags.market, market))
            )
          ),
        });
        workAuthFlagEnabled = !!flag;
      }

      if (workAuthFlagEnabled) {
        const isAuthorized = candidate.authorizedToWork === true;
        const expDate = candidate.authorizationExpiration ? new Date(candidate.authorizationExpiration) : null;
        const isExpired = expDate ? expDate.getTime() < Date.now() : false;
        const workAuthPassed = isAuthorized && !isExpired;

        reasons.push({
          rule: 'work_auth',
          name: 'Work Authorization',
          passed: workAuthPassed,
          reason: !isAuthorized
            ? 'Candidate not authorized to work'
            : isExpired
            ? 'Work authorization has expired'
            : `Work authorization valid${candidate.authorizationType ? ` (${candidate.authorizationType})` : ''}`,
          weight: 0,
        });

        if (!workAuthPassed && finalStatus === 'ready') {
          finalStatus = 'in_review';
        }
      }
    }
  } catch (err) {
    console.error("[Recruiting] Non-blocking: Failed to check work auth for readiness:", err);
  }

  // CDL License Verification (Ticket 25) — runs when the requisition is CDL-required
  try {
    const { recruitingRequisitions: reqTable, recruitingCandidates: candTable } = await import("@shared/schema");
    const requisition = app.requisitionId
      ? await db.query.recruitingRequisitions.findFirst({
          where: eq(reqTable.id, app.requisitionId),
        })
      : null;

    if (requisition?.cdlRequired) {
      const candidate = app.candidateId
        ? await db.query.recruitingCandidates.findFirst({
            where: eq(candTable.id, app.candidateId),
          })
        : null;

      const hasCDL = candidate?.hasCommercialLicense === true;
      const validCDLClass = ['A', 'B', 'C'].includes(candidate?.licenseClass || '');
      const licExpDate = candidate?.licenseExpiration ? new Date(candidate.licenseExpiration) : null;
      const licenseExpired = licExpDate ? licExpDate.getTime() < Date.now() : false;

      let cdlReason: string;
      let cdlPassed: boolean;

      if (app.licenseEligible === false) {
        cdlPassed = false;
        cdlReason = app.licenseMismatchReason || 'License class does not meet requisition requirements';
      } else if (!hasCDL) {
        cdlPassed = false;
        cdlReason = 'No commercial license on file';
      } else if (!validCDLClass) {
        cdlPassed = false;
        cdlReason = `License class ${candidate?.licenseClass || 'unknown'} is not a valid CDL (Class A, B, or C required)`;
      } else if (licenseExpired) {
        cdlPassed = false;
        cdlReason = 'CDL has expired';
      } else {
        cdlPassed = true;
        cdlReason = `CDL-${candidate?.licenseClass} verified`;
      }

      // Check required endorsements
      if (cdlPassed && requisition.requiredEndorsements && requisition.requiredEndorsements.length > 0) {
        const candidateEndorsements = candidate?.endorsements || [];
        const missingEndorsements = requisition.requiredEndorsements.filter(
          (e) => !candidateEndorsements.includes(e)
        );
        if (missingEndorsements.length > 0) {
          cdlPassed = false;
          cdlReason = `Missing required endorsements: ${missingEndorsements.join(', ')}`;
        }
      }

      reasons.push({
        rule: 'cdl_license',
        name: 'CDL License Verification',
        passed: cdlPassed,
        reason: cdlReason,
        weight: 0,
      });

      if (!cdlPassed && finalStatus === 'ready') {
        finalStatus = 'in_review';
      }
    }
  } catch (err) {
    console.error("[Recruiting] Non-blocking: Failed to check CDL requirements for readiness:", err);
  }

  try {
    const { requisitionRequiredDocuments, candidateDocumentRequests } = await import("@shared/schema");
    const reqDocs = await db.select().from(requisitionRequiredDocuments)
      .where(eq(requisitionRequiredDocuments.requisitionId, app.requisitionId));

    if (reqDocs.length > 0) {
      const candidateDocs = await db.select().from(candidateDocumentRequests)
        .where(eq(candidateDocumentRequests.applicationId, applicationId));

      const now = new Date();
      let allDocsSatisfied = true;
      const docReasons: string[] = [];

      for (const req of reqDocs) {
        if (!req.required) continue;
        const matching = candidateDocs.filter(cd => cd.documentType === req.docType || cd.label === req.docType);
        const approved = matching.find(cd => cd.status === "approved");
        const uploaded = matching.find(cd => cd.uploadedFileName);
        const isExpired = req.expirationRequired && approved?.expirationDate
          ? new Date(approved.expirationDate) < now : false;

        if (!uploaded) {
          allDocsSatisfied = false;
          docReasons.push(req.label || req.docType + ": not uploaded");
        } else if (!approved) {
          allDocsSatisfied = false;
          docReasons.push((req.label || req.docType) + ": not approved");
        } else if (isExpired) {
          allDocsSatisfied = false;
          docReasons.push((req.label || req.docType) + ": expired");
        }
      }

      reasons.push({
        rule: "req_docs",
        name: "Requisition Document Requirements",
        passed: allDocsSatisfied,
        reason: allDocsSatisfied ? "All required documents satisfied" : docReasons.join("; "),
        weight: 0,
      });

      if (!allDocsSatisfied && finalStatus === "ready") {
        finalStatus = "in_review";
      }

      const docRule = reasons.find(r => r.rule === "docs");
      if (docRule) {
        docRule.passed = allDocsSatisfied && docRule.passed;
        if (!allDocsSatisfied) {
          docRule.reason = docReasons.join("; ");
        }
      }
    }
  } catch (err) {
    console.error("[Recruiting] Non-blocking: Failed to check doc requirements for readiness:", err);
  }

  const previousStatus = app.readinessStatus;
  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(recruitingApplications)
    .set({
      readinessScore: finalScore,
      readinessStatus: finalStatus,
      readinessReasons: JSON.stringify(reasons),
      readinessLastCalculatedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(recruitingApplications.id, applicationId))
    .returning();

  if (previousStatus !== finalStatus) {
    await writeAuditEvent(
      "READINESS_STATUS_CHANGED",
      "application",
      applicationId,
      userId,
      userEmail,
      { readinessStatus: previousStatus, readinessScore: app.readinessScore },
      { readinessStatus: finalStatus, readinessScore: finalScore },
      ['readinessStatus', 'readinessScore']
    );

    const failedReasons = reasons.filter((r: any) => !r.passed).map((r: any) => r.reason || r.rule).join('; ');
    await db.insert(recruitingAuditEvents).values({
      actionType: 'readiness.changed',
      entityType: 'application',
      entityId: applicationId,
      userId,
      userEmail,
      actorRole: null,
      source: 'system',
      previousValue: JSON.stringify({ readinessStatus: previousStatus }),
      newValue: JSON.stringify({ readinessStatus: finalStatus }),
      changedFields: ['readinessStatus'],
      reason: failedReasons || `Readiness ${finalStatus === 'ready' ? 'achieved' : 'changed'}`,
      metadata: { previous_status: previousStatus, new_status: finalStatus, reason_summary: failedReasons || `All checks passed (score: ${finalScore}%)` },
    });
  }

  return updated;
}

export async function updateReadinessInputs(
  applicationId: string,
  inputs: {
    consentCaptured?: boolean;
    docsComplete?: boolean;
    backgroundCheckStatus?: string;
    lastContactedAt?: Date;
    lastResponseAt?: Date;
  },
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingApplication | null> {
  const resolvedUserId = await resolveUserId(userId);

  await db.update(recruitingApplications)
    .set({
      ...inputs,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(recruitingApplications.id, applicationId));

  return recalculateReadiness(applicationId, userId, userEmail);
}

export async function getDeployableDrivers(filters?: {
  market?: string;
  workerType?: string;
}): Promise<{
  candidateId: string;
  applicationId: string;
  candidateName: string;
  email: string;
  phone: string | null;
  market: string;
  workerType: string | null;
  readinessScore: number;
}[]> {
  const applications = await db.query.recruitingApplications.findMany({
    where: eq(recruitingApplications.readinessStatus, 'ready'),
    with: {
      candidate: true,
      requisition: true,
    },
  });

  let filtered = applications;
  if (filters?.market) {
    filtered = filtered.filter(app => app.requisition?.market === filters.market);
  }
  if (filters?.workerType) {
    filtered = filtered.filter(app => app.requisition?.workerType === filters.workerType);
  }

  return filtered.map(app => ({
    candidateId: app.candidateId,
    applicationId: app.id,
    candidateName: `${app.candidate?.firstName} ${app.candidate?.lastName}`,
    email: app.candidate?.email || '',
    phone: app.candidate?.phone || null,
    market: app.requisition?.market || 'unknown',
    workerType: app.requisition?.workerType || null,
    readinessScore: app.readinessScore,
  }));
}

// ============================================================================
// INTERVIEW SCHEDULING
// ============================================================================

export async function createInterview(
  data: InsertRecruitingInterview,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingInterview> {
  const resolvedUserId = await resolveUserId(userId);

  const [interview] = await db.insert(recruitingInterviews).values({
    ...data,
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "INTERVIEW_SCHEDULED",
    "interview",
    interview.id,
    userId,
    userEmail,
    null,
    { 
      applicationId: interview.applicationId, 
      startTime: interview.startTime, 
      interviewType: interview.interviewType 
    },
    null
  );

  // Email invite stub for v1 - log to console (actual email sending to be implemented later)
  try {
    const application = await db.query.recruitingApplications.findFirst({
      where: eq(recruitingApplications.id, interview.applicationId),
      with: {
        candidate: true,
      },
    });

    if (application?.candidate?.email) {
      console.log("[Recruiting] Email invite stub - would send to:", {
        to: application.candidate.email,
        subject: `Interview Scheduled: ${interview.title}`,
        interviewDate: interview.startTime,
        interviewType: interview.interviewType,
        meetingLink: interview.meetingLink || null,
      });
    }
  } catch (error) {
    console.error("[Recruiting] Failed to log email invite stub:", error);
  }

  return interview;
}

export async function getInterview(id: string): Promise<RecruitingInterview | null> {
  const interview = await db.query.recruitingInterviews.findFirst({
    where: eq(recruitingInterviews.id, id),
  });
  return interview || null;
}

export async function getInterviewsForApplication(applicationId: string): Promise<RecruitingInterview[]> {
  return db.query.recruitingInterviews.findMany({
    where: eq(recruitingInterviews.applicationId, applicationId),
    orderBy: [desc(recruitingInterviews.startTime)],
  });
}

export async function updateInterview(
  id: string,
  data: Partial<InsertRecruitingInterview>,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingInterview | null> {
  const existing = await getInterview(id);
  if (!existing) return null;

  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(recruitingInterviews)
    .set({
      ...data,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(recruitingInterviews.id, id))
    .returning();

  await writeAuditEvent(
    "INTERVIEW_UPDATED",
    "interview",
    id,
    userId,
    userEmail,
    { status: existing.status, startTime: existing.startTime },
    { status: updated.status, startTime: updated.startTime },
    Object.keys(data)
  );

  return updated;
}

export async function cancelInterview(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingInterview | null> {
  return updateInterview(id, { status: 'cancelled' }, userId, userEmail);
}

// Calendar connection management
export async function getCalendarConnection(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<RecruitingCalendarConnection | null> {
  const connection = await db.query.recruitingCalendarConnections.findFirst({
    where: and(
      eq(recruitingCalendarConnections.userId, userId),
      eq(recruitingCalendarConnections.provider, provider)
    ),
  });
  return connection || null;
}

export async function getUserCalendarConnections(userId: string): Promise<RecruitingCalendarConnection[]> {
  return db.query.recruitingCalendarConnections.findMany({
    where: eq(recruitingCalendarConnections.userId, userId),
  });
}

export async function upsertCalendarConnection(
  data: InsertRecruitingCalendarConnection
): Promise<RecruitingCalendarConnection> {
  const existing = await getCalendarConnection(data.userId, data.provider);
  
  if (existing) {
    const [updated] = await db.update(recruitingCalendarConnections)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(recruitingCalendarConnections.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(recruitingCalendarConnections).values(data).returning();
  return created;
}

export async function disconnectCalendar(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<void> {
  await db.update(recruitingCalendarConnections)
    .set({
      syncStatus: 'disconnected',
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(recruitingCalendarConnections.userId, userId),
      eq(recruitingCalendarConnections.provider, provider)
    ));
}

// Slot generation (stub for v1 - will integrate with actual calendar API later)
export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export async function generateAvailableSlots(
  recruiterId: string,
  daysAhead: number = 7,
  durationMinutes: number = 30
): Promise<TimeSlot[]> {
  const slots: TimeSlot[] = [];
  const now = new Date();
  
  for (let day = 1; day <= daysAhead; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    
    // Generate slots from 9 AM to 5 PM
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += durationMinutes) {
        const start = new Date(date);
        start.setHours(hour, minute, 0, 0);
        
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + durationMinutes);
        
        // Check if this slot conflicts with existing interviews
        const existingInterviews = await db.query.recruitingInterviews.findMany({
          where: and(
            sql`${recruitingInterviews.organizerId} = ${recruiterId}`,
            sql`${recruitingInterviews.status} != 'cancelled'`,
            sql`${recruitingInterviews.startTime} < ${end.toISOString()}`,
            sql`${recruitingInterviews.endTime} > ${start.toISOString()}`
          ),
        });
        
        slots.push({
          start,
          end,
          available: existingInterviews.length === 0,
        });
      }
    }
  }
  
  return slots.filter(slot => slot.available);
}

export async function getUpcomingInterviews(
  recruiterId: string,
  limit: number = 10
): Promise<RecruitingInterview[]> {
  return db.query.recruitingInterviews.findMany({
    where: and(
      eq(recruitingInterviews.organizerId, recruiterId),
      sql`${recruitingInterviews.startTime} > NOW()`,
      sql`${recruitingInterviews.status} IN ('scheduled', 'confirmed')`
    ),
    orderBy: [asc(recruitingInterviews.startTime)],
    limit,
  });
}

// ============================================================================
// REFERRAL SERVICE
// ============================================================================

import {
  recruitingReferrals,
  referralStatusHistory,
  referralRewardsLedger,
  referralProgramConfig,
  referralOutboundEvents,
  InsertRecruitingReferral,
  RecruitingReferral,
  ReferralStatusHistory,
  ReferralRewardsLedger,
  InsertReferralRewardsLedger,
  ReferralStatus,
  ReferralProgramConfig,
  InsertReferralProgramConfig,
  ReferralBonusMilestone,
} from "@shared/schema";

function generateDedupeHash(email: string, phone?: string | null): string {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : '';
  const input = `${normalizedEmail}|${normalizedPhone}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
}

function getCurrentReferralPeriodKey(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${quarter}`;
}

export async function checkDuplicateReferral(
  email: string,
  phone?: string | null,
  periodKey?: string
): Promise<RecruitingReferral | null> {
  const dedupeHash = generateDedupeHash(email, phone);
  const currentPeriod = periodKey || getCurrentReferralPeriodKey();
  
  const existing = await db.query.recruitingReferrals.findFirst({
    where: and(
      eq(recruitingReferrals.dedupeHash, dedupeHash),
      eq(recruitingReferrals.referralPeriodKey, currentPeriod),
      sql`${recruitingReferrals.status} NOT IN ('duplicate', 'expired', 'rejected', 'withdrawn')`
    ),
  });
  
  return existing || null;
}

export async function createReferral(
  data: {
    referrerId: string;
    referredFirstName: string;
    referredLastName: string;
    referredEmail: string;
    referredPhone?: string;
    requisitionId?: string;
    market?: string;
    roleType?: string;
    notes?: string;
    relationship?: string;
  },
  userId: string | null,
  userEmail: string | null
): Promise<{ referral: RecruitingReferral; isDuplicate: boolean }> {
  const resolvedUserId = await resolveUserId(userId);
  const periodKey = getCurrentReferralPeriodKey();
  const dedupeHash = generateDedupeHash(data.referredEmail, data.referredPhone);
  
  const existingReferral = await checkDuplicateReferral(
    data.referredEmail,
    data.referredPhone,
    periodKey
  );
  
  if (existingReferral) {
    return { referral: existingReferral, isDuplicate: true };
  }
  
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);
  
  const [referral] = await db.insert(recruitingReferrals).values({
    referrerId: data.referrerId,
    referredFirstName: data.referredFirstName,
    referredLastName: data.referredLastName,
    referredEmail: data.referredEmail,
    referredPhone: data.referredPhone || null,
    requisitionId: data.requisitionId || null,
    market: data.market || null,
    roleType: data.roleType || null,
    notes: data.notes || null,
    relationship: data.relationship || null,
    status: 'submitted',
    referralPeriodKey: periodKey,
    dedupeHash,
    expiresAt,
  }).returning();
  
  await db.insert(referralStatusHistory).values({
    referralId: referral.id,
    fromStatus: null,
    toStatus: 'submitted',
    reason: 'Initial submission',
    changedBy: resolvedUserId,
    changedByEmail: userEmail,
  });
  
  await writeAuditEvent(
    "REFERRAL_SUBMITTED",
    "referral",
    referral.id,
    userId,
    userEmail,
    null,
    {
      referredEmail: data.referredEmail,
      referrerId: data.referrerId,
      market: data.market,
      roleType: data.roleType,
    },
    null
  );
  
  return { referral, isDuplicate: false };
}

export async function getReferral(id: string): Promise<RecruitingReferral | null> {
  const referral = await db.query.recruitingReferrals.findFirst({
    where: eq(recruitingReferrals.id, id),
  });
  return referral || null;
}

export async function getReferralsByReferrer(
  referrerId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ referrals: RecruitingReferral[]; total: number }> {
  const referrals = await db.query.recruitingReferrals.findMany({
    where: eq(recruitingReferrals.referrerId, referrerId),
    orderBy: [desc(recruitingReferrals.createdAt)],
    limit: options?.limit || 50,
    offset: options?.offset || 0,
  });
  
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingReferrals)
    .where(eq(recruitingReferrals.referrerId, referrerId));
  
  return { referrals, total: countResult?.count || 0 };
}

export async function getAllReferrals(
  filters?: {
    status?: ReferralStatus;
    market?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ referrals: RecruitingReferral[]; total: number }> {
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(recruitingReferrals.status, filters.status));
  }
  if (filters?.market) {
    conditions.push(eq(recruitingReferrals.market, filters.market));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const referrals = await db.query.recruitingReferrals.findMany({
    where: whereClause,
    orderBy: [desc(recruitingReferrals.createdAt)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
    with: {
      referrer: true,
      candidate: true,
      requisition: true,
    },
  });
  
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(recruitingReferrals)
    .where(whereClause);
  
  return { referrals, total: countResult?.count || 0 };
}

export async function updateReferralStatus(
  id: string,
  newStatus: ReferralStatus,
  userId: string | null,
  userEmail: string | null,
  reason?: string,
  notes?: string
): Promise<RecruitingReferral | null> {
  const existing = await getReferral(id);
  if (!existing) return null;
  
  const resolvedUserId = await resolveUserId(userId);
  const oldStatus = existing.status;
  
  const [updated] = await db.update(recruitingReferrals)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(recruitingReferrals.id, id))
    .returning();
  
  await db.insert(referralStatusHistory).values({
    referralId: id,
    fromStatus: oldStatus,
    toStatus: newStatus,
    reason: reason || null,
    notes: notes || null,
    changedBy: resolvedUserId,
    changedByEmail: userEmail,
  });
  
  await writeAuditEvent(
    "REFERRAL_STATUS_CHANGED",
    "referral",
    id,
    userId,
    userEmail,
    { status: oldStatus },
    { status: newStatus, reason },
    ['status']
  );
  
  return updated;
}

export async function linkReferralToCandidate(
  referralId: string,
  candidateId: string,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingReferral | null> {
  const existing = await getReferral(referralId);
  if (!existing) return null;
  
  const [updated] = await db.update(recruitingReferrals)
    .set({
      candidateId,
      status: 'candidate_created',
      updatedAt: new Date(),
    })
    .where(eq(recruitingReferrals.id, referralId))
    .returning();
  
  await db.insert(referralStatusHistory).values({
    referralId,
    fromStatus: existing.status,
    toStatus: 'candidate_created',
    reason: 'Linked to candidate record',
    changedBy: await resolveUserId(userId),
    changedByEmail: userEmail,
  });
  
  await writeAuditEvent(
    "REFERRAL_LINKED_TO_CANDIDATE",
    "referral",
    referralId,
    userId,
    userEmail,
    { candidateId: null },
    { candidateId },
    ['candidateId']
  );
  
  return updated;
}

export async function linkReferralToApplication(
  referralId: string,
  applicationId: string,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingReferral | null> {
  const existing = await getReferral(referralId);
  if (!existing) return null;
  
  const [updated] = await db.update(recruitingReferrals)
    .set({
      applicationId,
      status: 'application_submitted',
      updatedAt: new Date(),
    })
    .where(eq(recruitingReferrals.id, referralId))
    .returning();
  
  await db.insert(referralStatusHistory).values({
    referralId,
    fromStatus: existing.status,
    toStatus: 'application_submitted',
    reason: 'Application submitted',
    changedBy: await resolveUserId(userId),
    changedByEmail: userEmail,
  });
  
  return updated;
}

export async function getReferralStatusHistory(referralId: string): Promise<ReferralStatusHistory[]> {
  return db.query.referralStatusHistory.findMany({
    where: eq(referralStatusHistory.referralId, referralId),
    orderBy: [desc(referralStatusHistory.changedAt)],
  });
}

export async function findReferralByCandidate(candidateId: string): Promise<RecruitingReferral | null> {
  const referral = await db.query.recruitingReferrals.findFirst({
    where: eq(recruitingReferrals.candidateId, candidateId),
  });
  return referral || null;
}

export async function findReferralByEmail(email: string): Promise<RecruitingReferral | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const referral = await db.query.recruitingReferrals.findFirst({
    where: sql`LOWER(${recruitingReferrals.referredEmail}) = ${normalizedEmail}`,
    orderBy: [desc(recruitingReferrals.createdAt)],
  });
  return referral || null;
}

// Rewards ledger functions
export async function createRewardEntry(
  data: {
    referralId: string;
    referrerId: string;
    amount: string;
    triggerEvent: string;
    triggerStage?: string;
    notes?: string;
  },
  userId: string | null,
  userEmail: string | null
): Promise<ReferralRewardsLedger> {
  const [reward] = await db.insert(referralRewardsLedger).values({
    referralId: data.referralId,
    referrerId: data.referrerId,
    amount: data.amount,
    currency: 'USD',
    triggerEvent: data.triggerEvent,
    triggerStage: data.triggerStage || null,
    status: 'pending',
    notes: data.notes || null,
  }).returning();
  
  await writeAuditEvent(
    "REFERRAL_REWARD_CREATED",
    "reward",
    reward.id,
    userId,
    userEmail,
    null,
    {
      referralId: data.referralId,
      amount: data.amount,
      triggerEvent: data.triggerEvent,
    },
    null
  );
  
  return reward;
}

export async function getRewardsForReferrer(
  referrerId: string
): Promise<ReferralRewardsLedger[]> {
  return db.query.referralRewardsLedger.findMany({
    where: eq(referralRewardsLedger.referrerId, referrerId),
    orderBy: [desc(referralRewardsLedger.createdAt)],
  });
}

export async function approveReward(
  rewardId: string,
  userId: string | null,
  userEmail: string | null
): Promise<ReferralRewardsLedger | null> {
  const resolvedUserId = await resolveUserId(userId);
  
  const [updated] = await db.update(referralRewardsLedger)
    .set({
      status: 'approved',
      approvedBy: resolvedUserId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referralRewardsLedger.id, rewardId))
    .returning();
  
  if (updated) {
    await writeAuditEvent(
      "REFERRAL_REWARD_APPROVED",
      "reward",
      rewardId,
      userId,
      userEmail,
      { status: 'pending' },
      { status: 'approved' },
      ['status', 'approvedBy', 'approvedAt']
    );
  }
  
  return updated || null;
}

export async function markRewardPaid(
  rewardId: string,
  paymentReference: string | null,
  userId: string | null,
  userEmail: string | null
): Promise<ReferralRewardsLedger | null> {
  const [updated] = await db.update(referralRewardsLedger)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentReference: paymentReference || null,
      updatedAt: new Date(),
    })
    .where(eq(referralRewardsLedger.id, rewardId))
    .returning();
  
  if (updated) {
    await writeAuditEvent(
      "REFERRAL_REWARD_PAID",
      "reward",
      rewardId,
      userId,
      userEmail,
      { status: 'approved' },
      { status: 'paid', paymentReference },
      ['status', 'paidAt', 'paymentReference']
    );
  }
  
  return updated || null;
}

// ============================================================================
// AUTO CANDIDATE CREATION FROM REFERRAL
// ============================================================================

export async function autoCreateCandidateFromReferral(
  referralId: string,
  userId: string | null,
  userEmail: string | null
): Promise<{ candidate: any; alreadyExisted: boolean } | null> {
  const referral = await getReferral(referralId);
  if (!referral) return null;
  if (referral.candidateId) {
    const existing = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, referral.candidateId),
    });
    return existing ? { candidate: existing, alreadyExisted: true } : null;
  }

  // Check if a candidate already exists with this email
  const existingByEmail = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.email, referral.referredEmail.toLowerCase().trim()),
  });

  if (existingByEmail) {
    // Link referral to existing candidate
    await linkReferralToCandidate(referralId, existingByEmail.id, userId, userEmail);
    await emitReferralOutboundEvent(referralId, 'candidate_linked', {
      candidateId: existingByEmail.id,
      alreadyExisted: true,
    });
    return { candidate: existingByEmail, alreadyExisted: true };
  }

  // Create a new candidate
  const resolvedUserId = await resolveUserId(userId);
  const [candidate] = await db.insert(recruitingCandidates).values({
    firstName: referral.referredFirstName,
    lastName: referral.referredLastName,
    email: referral.referredEmail.toLowerCase().trim(),
    phone: (referral as any).referredPhone || null,
    city: (referral as any).referredCity || null,
    state: (referral as any).referredState || null,
    status: 'new',
    source: (referral as any).sourceSystem === 'mnm' ? 'driver_referral' : 'referral',
    notes: `Auto-created from referral submitted by referrer ID ${referral.referrerId}. ${referral.notes || ''}`.trim(),
    createdBy: resolvedUserId,
  } as any).returning();

  // Update referral: link candidate + mark auto-created
  await db.update(recruitingReferrals)
    .set({
      candidateId: candidate.id,
      status: 'candidate_created',
      updatedAt: new Date(),
      autoCandidateCreated: true,
      autoCandidateCreatedAt: new Date(),
    } as any)
    .where(eq(recruitingReferrals.id, referralId));

  await db.insert(referralStatusHistory).values({
    referralId,
    fromStatus: referral.status,
    toStatus: 'candidate_created',
    reason: 'Auto-created candidate record',
    changedBy: resolvedUserId,
    changedByEmail: userEmail,
  });

  await writeAuditEvent(
    "REFERRAL_AUTO_CANDIDATE_CREATED",
    "referral",
    referralId,
    userId,
    userEmail,
    { candidateId: null },
    { candidateId: candidate.id },
    ['candidateId']
  );

  await emitReferralOutboundEvent(referralId, 'candidate_created', {
    candidateId: candidate.id,
    referrerDriverId: (referral as any).referrerDriverId || null,
  });

  return { candidate, alreadyExisted: false };
}

// ============================================================================
// REFERRAL OUTBOUND EVENT EMITTER
// ============================================================================

export async function emitReferralOutboundEvent(
  referralId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(referralOutboundEvents).values({
      referralId,
      eventType,
      payload,
    });
  } catch (err) {
    console.error('[ReferralEvents] Failed to emit event:', eventType, err);
  }
}

export async function getPendingOutboundEvents(
  consumer: 'mnm' | 'dod',
  limit = 100
): Promise<any[]> {
  const consumedCol = consumer === 'mnm' ? 'consumed_by_mnm' : 'consumed_by_dod';
  const result = await db.execute(
    sql`SELECT * FROM referral_outbound_events WHERE ${sql.raw(consumedCol)} = false ORDER BY created_at ASC LIMIT ${limit}`
  );
  return result.rows;
}

export async function markOutboundEventsConsumed(
  ids: string[],
  consumer: 'mnm' | 'dod'
): Promise<void> {
  if (!ids.length) return;
  const now = new Date();
  if (consumer === 'mnm') {
    await db.update(referralOutboundEvents)
      .set({ consumedByMnm: true, consumedByMnmAt: now })
      .where(inArray(referralOutboundEvents.id, ids));
  } else {
    await db.update(referralOutboundEvents)
      .set({ consumedByDod: true, consumedByDodAt: now })
      .where(inArray(referralOutboundEvents.id, ids));
  }
}

// ============================================================================
// PROGRAM CONFIG SERVICE
// ============================================================================

export async function getReferralProgramConfig(): Promise<ReferralProgramConfig | null> {
  const config = await db.query.referralProgramConfig.findFirst({
    where: eq(referralProgramConfig.isActive, true),
    orderBy: [desc(referralProgramConfig.createdAt)],
  });
  return config || null;
}

export async function upsertReferralProgramConfig(
  data: Partial<InsertReferralProgramConfig>,
  userId: string | null,
  userEmail: string | null
): Promise<ReferralProgramConfig> {
  const existing = await getReferralProgramConfig();
  const resolvedUserId = await resolveUserId(userId);

  if (existing) {
    const [updated] = await db.update(referralProgramConfig)
      .set({ ...data, updatedAt: new Date(), updatedBy: resolvedUserId })
      .where(eq(referralProgramConfig.id, existing.id))
      .returning();
    await writeAuditEvent("REFERRAL_CONFIG_UPDATED", "referral_program_config", existing.id, userId, userEmail, existing as any, data as any, Object.keys(data));
    return updated;
  } else {
    const [created] = await db.insert(referralProgramConfig)
      .values({ ...data, createdBy: resolvedUserId, updatedBy: resolvedUserId } as any)
      .returning();
    await writeAuditEvent("REFERRAL_CONFIG_CREATED", "referral_program_config", created.id, userId, userEmail, null, data as any, null);
    return created;
  }
}

// ============================================================================
// REFERRAL DASHBOARD METRICS
// ============================================================================

export async function getReferralDashboardMetrics(options: {
  periodKey?: string;
  market?: string;
  sourceSystem?: string;
} = {}): Promise<{
  totalReferrals: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  conversionRate: number;
  totalRewardsEarned: string;
  totalRewardsPaid: string;
  totalRewardsPending: string;
  autoCreatedCandidates: number;
  recentReferrals: any[];
  topReferrers: any[];
}> {
  const periodKey = options.periodKey || getCurrentReferralPeriodKey();

  const conditions: any[] = [eq(recruitingReferrals.referralPeriodKey, periodKey)];
  if (options.market) conditions.push(eq(recruitingReferrals.market, options.market));

  const allReferrals = await db.query.recruitingReferrals.findMany({
    where: and(...conditions),
    orderBy: [desc(recruitingReferrals.createdAt)],
    limit: 500,
  });

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let hired = 0;

  for (const r of allReferrals) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const src = (r as any).sourceSystem || 'direct';
    bySource[src] = (bySource[src] || 0) + 1;
    if (r.status === 'hired') hired++;
  }

  const conversionRate = allReferrals.length > 0 ? Math.round((hired / allReferrals.length) * 100) : 0;

  // Reward totals
  const rewardRows = await db.execute(sql`
    SELECT 
      COALESCE(SUM(amount::numeric), 0) AS total_earned,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount::numeric ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN amount::numeric ELSE 0 END), 0) AS total_pending
    FROM referral_rewards_ledger
    JOIN recruiting_referrals ON referral_rewards_ledger.referral_id = recruiting_referrals.id
    WHERE recruiting_referrals.referral_period_key = ${periodKey}
  `);
  const rewardTotals = rewardRows.rows[0] as any;

  // Auto-created count
  const autoCreatedResult = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM recruiting_referrals
    WHERE referral_period_key = ${periodKey} AND auto_candidate_created = true
  `);
  const autoCreated = parseInt((autoCreatedResult.rows[0] as any)?.cnt || '0');

  // Top referrers (by count in period)
  const topReferrersResult = await db.execute(sql`
    SELECT r.referrer_id, u.email, u.first_name, u.last_name,
           COUNT(*) AS referral_count,
           SUM(CASE WHEN r.status = 'hired' THEN 1 ELSE 0 END) AS hired_count
    FROM recruiting_referrals r
    LEFT JOIN users u ON u.id = r.referrer_id
    WHERE r.referral_period_key = ${periodKey}
    GROUP BY r.referrer_id, u.email, u.first_name, u.last_name
    ORDER BY referral_count DESC
    LIMIT 10
  `);

  return {
    totalReferrals: allReferrals.length,
    byStatus,
    bySource,
    conversionRate,
    totalRewardsEarned: rewardTotals?.total_earned?.toString() || '0',
    totalRewardsPaid: rewardTotals?.total_paid?.toString() || '0',
    totalRewardsPending: rewardTotals?.total_pending?.toString() || '0',
    autoCreatedCandidates: autoCreated,
    recentReferrals: allReferrals.slice(0, 10),
    topReferrers: topReferrersResult.rows,
  };
}

export async function getAllReferralPeriods(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT referral_period_key FROM recruiting_referrals ORDER BY referral_period_key DESC
  `);
  return result.rows.map((r: any) => r.referral_period_key);
}

// ============================================================================
// CONSUMER API — MoveNow Mobile + Driver on Demand feed
// ============================================================================

export async function submitExternalReferral(data: {
  referrerDriverId: string;
  referredFirstName: string;
  referredLastName: string;
  referredEmail: string;
  referredPhone?: string;
  referredCity?: string;
  referredState?: string;
  referredDriverType?: string;
  referredYearsExp?: number;
  referredHasCdl?: boolean;
  consentToShare?: boolean;
  sourceSystem: 'mnm' | 'dod' | 'direct' | 'referral_link';
  campaignSource?: string;
  referralCode?: string;
  market?: string;
  roleType?: string;
  notes?: string;
  relationship?: string;
  apiKey?: string;
}): Promise<{ referral: RecruitingReferral; isDuplicate: boolean; candidateId?: string }> {
  // Map referrerDriverId → internal user by id (best-effort; fall back to raw driver id)
  const driverUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, data.referrerDriverId),
  }).catch(() => null);

  // For external submissions, use a system-level referrer ID if no user found
  const referrerId = driverUser?.id || data.referrerDriverId;

  const resolvedPeriodKey = getCurrentReferralPeriodKey();
  const dedupeHash = generateDedupeHash(data.referredEmail, data.referredPhone);

  // Dedupe check
  const existingReferral = await checkDuplicateReferral(data.referredEmail, data.referredPhone, resolvedPeriodKey);
  if (existingReferral) {
    return { referral: existingReferral, isDuplicate: true, candidateId: existingReferral.candidateId || undefined };
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);

  const [referral] = await db.insert(recruitingReferrals).values({
    referrerId,
    referredFirstName: data.referredFirstName,
    referredLastName: data.referredLastName,
    referredEmail: data.referredEmail,
    referredPhone: data.referredPhone || null,
    market: data.market || null,
    roleType: data.roleType || null,
    notes: data.notes || null,
    relationship: data.relationship || null,
    status: 'submitted',
    referralPeriodKey: resolvedPeriodKey,
    dedupeHash,
    expiresAt,
    // Extended fields from migration 0016
    referrerDriverId: data.referrerDriverId,
    referredCity: data.referredCity || null,
    referredState: data.referredState || null,
    referredDriverType: data.referredDriverType || null,
    referredYearsExp: data.referredYearsExp ?? null,
    referredHasCdl: data.referredHasCdl ?? null,
    consentToShare: data.consentToShare ?? true,
    sourceSystem: data.sourceSystem,
    autoCandidateCreated: false,
    referralCode: data.referralCode || null,
    campaignSource: data.campaignSource || null,
  } as any).returning();

  await db.insert(referralStatusHistory).values({
    referralId: referral.id,
    fromStatus: null,
    toStatus: 'submitted',
    reason: `External submission via ${data.sourceSystem.toUpperCase()}`,
    changedBy: null,
    changedByEmail: null,
  });

  await writeAuditEvent(
    "REFERRAL_EXTERNAL_SUBMITTED",
    "referral",
    referral.id,
    null,
    null,
    null,
    { sourceSystem: data.sourceSystem, referredEmail: data.referredEmail, referrerDriverId: data.referrerDriverId },
    null
  );

  // Auto-create candidate
  const result = await autoCreateCandidateFromReferral(referral.id, null, null);

  await emitReferralOutboundEvent(referral.id, 'referral_submitted', {
    referrerDriverId: data.referrerDriverId,
    sourceSystem: data.sourceSystem,
    referredEmail: data.referredEmail,
    market: data.market,
  });

  // Grant achievements to the referring driver
  try {
    await checkAndGrantAchievements(data.referrerDriverId);
  } catch { /* non-fatal */ }

  return {
    referral,
    isDuplicate: false,
    candidateId: result?.candidate?.id,
  };
}

// Milestone reward configuration (configurable per-deployment)
const MILESTONE_REWARD_RULES: { stage: string; amount: string; event: string }[] = [
  { stage: 'hired', amount: '250.00', event: 'hired' },
  { stage: 'ready_to_work', amount: '100.00', event: '30_day_retention' },
];

export async function checkAndCreateMilestoneReward(
  applicationId: string,
  newStage: string,
  userId: string | null,
  userEmail: string | null
): Promise<ReferralRewardsLedger | null> {
  const application = await getApplication(applicationId);
  if (!application || !application.candidateId) return null;
  
  const referral = await findReferralByCandidate(application.candidateId);
  if (!referral) return null;
  
  const rule = MILESTONE_REWARD_RULES.find(r => r.stage === newStage);
  if (!rule) return null;
  
  const existingReward = await db.query.referralRewardsLedger.findFirst({
    where: and(
      eq(referralRewardsLedger.referralId, referral.id),
      eq(referralRewardsLedger.triggerStage, newStage)
    ),
  });
  
  if (existingReward) return null;
  
  await db.update(recruitingReferrals)
    .set({
      milestoneReached: newStage,
      milestoneReachedAt: new Date(),
      status: newStage === 'hired' ? 'hired' : referral.status,
      updatedAt: new Date(),
    })
    .where(eq(recruitingReferrals.id, referral.id));
  
  return createRewardEntry(
    {
      referralId: referral.id,
      referrerId: referral.referrerId,
      amount: rule.amount,
      triggerEvent: rule.event,
      triggerStage: newStage,
      notes: `Automatic reward for reaching ${newStage} milestone`,
    },
    userId,
    userEmail
  );
}

// ============================================================================
// SCREENING FORMS (Assessment v2)
// ============================================================================

export async function getScreeningFormTemplates(activeOnly: boolean = true): Promise<RecruitingScreeningFormTemplate[]> {
  const conditions = activeOnly 
    ? eq(recruitingScreeningFormTemplates.isActive, true)
    : undefined;
  
  return db.query.recruitingScreeningFormTemplates.findMany({
    where: conditions,
    orderBy: [asc(recruitingScreeningFormTemplates.category), asc(recruitingScreeningFormTemplates.name)],
  });
}

export async function getScreeningFormTemplate(id: string): Promise<RecruitingScreeningFormTemplate | undefined> {
  return db.query.recruitingScreeningFormTemplates.findFirst({
    where: eq(recruitingScreeningFormTemplates.id, id),
  });
}

export async function assignScreeningFormToRequisition(
  requisitionId: string,
  formTemplateId: string | null,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  const requisition = await getRequisition(requisitionId);
  if (!requisition) {
    throw new Error("Requisition not found");
  }

  if (formTemplateId) {
    const template = await getScreeningFormTemplate(formTemplateId);
    if (!template) {
      throw new Error("Screening form template not found");
    }
  }

  await db.update(recruitingRequisitions)
    .set({
      screeningFormTemplateId: formTemplateId,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(recruitingRequisitions.id, requisitionId));

  await writeAuditEvent(
    formTemplateId ? "SCREENING_FORM_ASSIGNED" : "SCREENING_FORM_REMOVED",
    "requisition",
    requisitionId,
    userId,
    userEmail,
    { screeningFormTemplateId: requisition.screeningFormTemplateId },
    { screeningFormTemplateId: formTemplateId },
    null
  );
}

export async function generateScreeningFormLink(
  applicationId: string,
  formTemplateId: string,
  userId: string | null,
  userEmail: string | null,
  expiresInDays: number = 7
): Promise<RecruitingScreeningToken> {
  const application = await getApplication(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const template = await getScreeningFormTemplate(formTemplateId);
  if (!template) {
    throw new Error("Screening form template not found");
  }

  // Generate secure token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [screeningToken] = await db.insert(recruitingScreeningTokens)
    .values({
      token,
      applicationId,
      formTemplateId,
      status: "pending",
      expiresAt,
      createdBy: userId,
    })
    .returning();

  await writeAuditEvent(
    "SCREENING_LINK_GENERATED",
    "application",
    applicationId,
    userId,
    userEmail,
    null,
    { tokenId: screeningToken.id, formTemplateId, expiresAt: expiresAt.toISOString() },
    null
  );

  return screeningToken;
}

export async function getScreeningTokenByToken(token: string): Promise<RecruitingScreeningToken | undefined> {
  return db.query.recruitingScreeningTokens.findFirst({
    where: eq(recruitingScreeningTokens.token, token),
    with: {
      application: {
        with: {
          candidate: true,
        },
      },
      formTemplate: true,
    },
  });
}

export async function submitScreeningForm(
  token: string,
  responses: Record<string, unknown>
): Promise<RecruitingScreeningResponse> {
  const screeningToken = await getScreeningTokenByToken(token);
  if (!screeningToken) {
    throw new Error("Invalid or expired link");
  }

  if (screeningToken.status === "completed") {
    throw new Error("This form has already been submitted");
  }

  if (screeningToken.status === "expired" || new Date() > new Date(screeningToken.expiresAt)) {
    throw new Error("This link has expired");
  }

  // Check auto-flag rules
  const template = await getScreeningFormTemplate(screeningToken.formTemplateId);
  const { needsReview, flagReasons } = evaluateAutoFlagRules(template?.autoFlagRules, responses);

  // Save responses
  const [response] = await db.insert(recruitingScreeningResponses)
    .values({
      applicationId: screeningToken.applicationId,
      formTemplateId: screeningToken.formTemplateId,
      responses,
      needsReview,
      flagReasons,
      submittedVia: "secure_link",
    })
    .returning();

  // Mark token as completed
  await db.update(recruitingScreeningTokens)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(recruitingScreeningTokens.id, screeningToken.id));

  // Log audit event (no user context since candidate is submitting)
  await writeAuditEvent(
    "SCREENING_FORM_SUBMITTED",
    "application",
    screeningToken.applicationId,
    null,
    null,
    null,
    { 
      responseId: response.id, 
      formTemplateId: screeningToken.formTemplateId,
      needsReview,
      flagReasons,
    },
    null
  );

  return response;
}

function evaluateAutoFlagRules(
  autoFlagRules: unknown,
  responses: Record<string, unknown>
): { needsReview: boolean; flagReasons: string[] | null } {
  if (!autoFlagRules || !Array.isArray(autoFlagRules)) {
    return { needsReview: false, flagReasons: null };
  }

  const flagReasons: string[] = [];

  for (const rule of autoFlagRules) {
    const { questionId, operator, value, flagReason } = rule as {
      questionId: string;
      operator: string;
      value: unknown;
      flagReason: string;
    };

    const answer = responses[questionId];

    let matches = false;
    switch (operator) {
      case "equals":
        matches = answer === value;
        break;
      case "notEquals":
        matches = answer !== value;
        break;
      case "contains":
        matches = typeof answer === "string" && answer.includes(String(value));
        break;
      case "greaterThan":
        matches = typeof answer === "number" && answer > Number(value);
        break;
      case "lessThan":
        matches = typeof answer === "number" && answer < Number(value);
        break;
      default:
        break;
    }

    if (matches) {
      flagReasons.push(flagReason);
    }
  }

  return {
    needsReview: flagReasons.length > 0,
    flagReasons: flagReasons.length > 0 ? flagReasons : null,
  };
}

export async function getScreeningResponsesForApplication(
  applicationId: string
): Promise<RecruitingScreeningResponse[]> {
  return db.query.recruitingScreeningResponses.findMany({
    where: eq(recruitingScreeningResponses.applicationId, applicationId),
    with: {
      formTemplate: true,
      reviewedByUser: true,
    },
    orderBy: [desc(recruitingScreeningResponses.submittedAt)],
  });
}

export async function markScreeningResponseReviewed(
  responseId: string,
  reviewNotes: string | null,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  const response = await db.query.recruitingScreeningResponses.findFirst({
    where: eq(recruitingScreeningResponses.id, responseId),
  });

  if (!response) {
    throw new Error("Screening response not found");
  }

  await db.update(recruitingScreeningResponses)
    .set({
      reviewedAt: new Date(),
      reviewedBy: userId,
      reviewNotes,
    })
    .where(eq(recruitingScreeningResponses.id, responseId));

  await writeAuditEvent(
    "SCREENING_RESPONSE_REVIEWED",
    "application",
    response.applicationId,
    userId,
    userEmail,
    null,
    { responseId, reviewNotes },
    null
  );
}

export async function getPendingScreeningTokensForApplication(
  applicationId: string
): Promise<RecruitingScreeningToken[]> {
  return db.query.recruitingScreeningTokens.findMany({
    where: and(
      eq(recruitingScreeningTokens.applicationId, applicationId),
      eq(recruitingScreeningTokens.status, "pending")
    ),
    with: {
      formTemplate: true,
    },
    orderBy: [desc(recruitingScreeningTokens.createdAt)],
  });
}

// ============================================================================
// BULK ACTIONS
// ============================================================================

export interface BulkActionResult {
  applicationId: string;
  success: boolean;
  error?: string;
}

export interface BulkActionResponse {
  bulkActionId: string;
  successCount: number;
  failureCount: number;
  results: BulkActionResult[];
}

/**
 * Bulk assign recruiter to multiple applications
 */
export async function bulkAssignRecruiter(
  applicationIds: string[],
  recruiterId: string,
  userId: string | null,
  userEmail: string | null
): Promise<BulkActionResponse> {
  const results: BulkActionResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Validate recruiter exists
  const recruiter = await db.query.users.findFirst({
    where: eq(users.id, recruiterId),
  });

  if (!recruiter) {
    throw new Error("Recruiter not found");
  }

  // Create bulk action record
  const [bulkAction] = await db.insert(recruitingBulkActions).values({
    actionType: "assign_recruiter",
    userId,
    userEmail,
    applicationIds,
    parameters: { recruiterId, recruiterEmail: recruiter.email },
  }).returning();

  // Process each application
  for (const applicationId of applicationIds) {
    try {
      const application = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, applicationId),
      });

      if (!application) {
        results.push({ applicationId, success: false, error: "Application not found" });
        failureCount++;
        continue;
      }

      const previousOwnerId = application.ownerId;

      await db.update(recruitingApplications)
        .set({
          ownerId: recruiterId,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(recruitingApplications.id, applicationId));

      // Write individual audit event
      await writeAuditEvent(
        "APPLICATION_OWNER_CHANGED",
        "application",
        applicationId,
        userId,
        userEmail,
        { ownerId: previousOwnerId },
        { ownerId: recruiterId },
        ['ownerId'],
        `Bulk action: assigned to ${recruiter.email}`
      );

      results.push({ applicationId, success: true });
      successCount++;
    } catch (error: any) {
      results.push({ applicationId, success: false, error: error.message });
      failureCount++;
    }
  }

  // Update bulk action with results
  await db.update(recruitingBulkActions)
    .set({
      successCount,
      failureCount,
      results,
      completedAt: new Date(),
    })
    .where(eq(recruitingBulkActions.id, bulkAction.id));

  return {
    bulkActionId: bulkAction.id,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Bulk move stage for multiple applications with workflow validation
 */
export async function bulkMoveStage(
  applicationIds: string[],
  toStage: string,
  reason: string | null,
  userId: string | null,
  userEmail: string | null
): Promise<BulkActionResponse> {
  const results: BulkActionResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Create bulk action record
  const [bulkAction] = await db.insert(recruitingBulkActions).values({
    actionType: "move_stage",
    userId,
    userEmail,
    applicationIds,
    parameters: { toStage, reason },
  }).returning();

  // Process each application
  for (const applicationId of applicationIds) {
    try {
      const application = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, applicationId),
      });

      if (!application) {
        results.push({ applicationId, success: false, error: "Application not found" });
        failureCount++;
        continue;
      }

      // Get requisition to check workflow
      const requisition = await getRequisition(application.requisitionId);
      if (!requisition) {
        results.push({ applicationId, success: false, error: "Requisition not found" });
        failureCount++;
        continue;
      }

      // Validate workflow transition if workflow exists
      if (requisition.workflowId) {
        const validationResult = await validateTransition(
          requisition.workflowId,
          application.currentStage,
          toStage
        );

        if (!validationResult.valid) {
          results.push({ 
            applicationId, 
            success: false, 
            error: `Invalid transition from '${application.currentStage}' to '${toStage}'` 
          });
          failureCount++;
          continue;
        }
      }

      // Background check gate for certain stages
      const gatedStages = ['approved', 'ready', 'ready_to_work', 'hired'];
      if (gatedStages.includes(toStage.toLowerCase())) {
        const { checkBackgroundGate } = await import("./services/backgroundCheckService");
        const gateResult = await checkBackgroundGate(applicationId);
        if (!gateResult.canProceed) {
          results.push({ 
            applicationId, 
            success: false, 
            error: `Cannot move to '${toStage}': ${gateResult.reason}` 
          });
          failureCount++;
          continue;
        }
      }

      const timeInPreviousStage = application.currentStageEnteredAt
        ? Math.floor((Date.now() - new Date(application.currentStageEnteredAt).getTime()) / (1000 * 60))
        : null;

      const fromStage = application.currentStage;

      // Update application stage
      await db.update(recruitingApplications)
        .set({
          currentStage: toStage,
          currentStageEnteredAt: new Date(),
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(recruitingApplications.id, applicationId));

      // Insert stage history with bulk_action source
      await db.insert(recruitingStageHistory).values({
        applicationId,
        fromStage,
        toStage,
        transitionedBy: userId,
        reason: reason || "Bulk stage move",
        timeInPreviousStageMinutes: timeInPreviousStage,
        sourceAction: 'bulk_action',
      });

      // Write individual audit event
      await writeAuditEvent(
        "APPLICATION_STAGE_CHANGED",
        "application",
        applicationId,
        userId,
        userEmail,
        { currentStage: fromStage },
        { currentStage: toStage },
        ['currentStage'],
        `Bulk action: ${reason || 'Bulk stage move'}`
      );

      // Check for referral milestone rewards on stage transitions
      if (toStage === 'hired' || toStage === 'ready_to_work') {
        try {
          await checkAndCreateMilestoneReward(applicationId, toStage, userId, userEmail);
        } catch (error) {
          console.error("[Recruiting] Error checking milestone reward:", error);
        }
      }

      results.push({ applicationId, success: true });
      successCount++;
    } catch (error: any) {
      results.push({ applicationId, success: false, error: error.message });
      failureCount++;
    }
  }

  // Update bulk action with results
  await db.update(recruitingBulkActions)
    .set({
      successCount,
      failureCount,
      results,
      completedAt: new Date(),
    })
    .where(eq(recruitingBulkActions.id, bulkAction.id));

  return {
    bulkActionId: bulkAction.id,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Bulk add tags to multiple applications
 */
export async function bulkAddTags(
  applicationIds: string[],
  tags: string[],
  userId: string | null,
  userEmail: string | null
): Promise<BulkActionResponse> {
  const results: BulkActionResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Create bulk action record
  const [bulkAction] = await db.insert(recruitingBulkActions).values({
    actionType: "add_tag",
    userId,
    userEmail,
    applicationIds,
    parameters: { tags },
  }).returning();

  // Process each application
  for (const applicationId of applicationIds) {
    try {
      const application = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, applicationId),
      });

      if (!application) {
        results.push({ applicationId, success: false, error: "Application not found" });
        failureCount++;
        continue;
      }

      // Add each tag
      for (const tag of tags) {
        // Check if tag already exists (using upsert pattern)
        const existingTag = await db.query.recruitingApplicationTags.findFirst({
          where: and(
            eq(recruitingApplicationTags.applicationId, applicationId),
            eq(recruitingApplicationTags.tag, tag)
          ),
        });

        if (!existingTag) {
          await db.insert(recruitingApplicationTags).values({
            applicationId,
            tag,
            createdBy: userId,
            sourceAction: 'bulk_action',
          });
        }
      }

      // Write individual audit event
      await writeAuditEvent(
        "APPLICATION_TAGS_ADDED",
        "application",
        applicationId,
        userId,
        userEmail,
        null,
        { tags },
        null,
        `Bulk action: added tags ${tags.join(', ')}`
      );

      results.push({ applicationId, success: true });
      successCount++;
    } catch (error: any) {
      results.push({ applicationId, success: false, error: error.message });
      failureCount++;
    }
  }

  // Update bulk action with results
  await db.update(recruitingBulkActions)
    .set({
      successCount,
      failureCount,
      results,
      completedAt: new Date(),
    })
    .where(eq(recruitingBulkActions.id, bulkAction.id));

  return {
    bulkActionId: bulkAction.id,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Bulk send message to candidates (placeholder - would integrate with email/SMS provider)
 */
export async function bulkSendMessage(
  applicationIds: string[],
  messageTemplateId: string,
  messageType: 'email' | 'sms',
  userId: string | null,
  userEmail: string | null
): Promise<BulkActionResponse> {
  const results: BulkActionResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Create bulk action record
  const [bulkAction] = await db.insert(recruitingBulkActions).values({
    actionType: "send_message",
    userId,
    userEmail,
    applicationIds,
    parameters: { messageTemplateId, messageType },
  }).returning();

  // Process each application
  for (const applicationId of applicationIds) {
    try {
      const application = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, applicationId),
        with: {
          candidate: true,
        },
      });

      if (!application) {
        results.push({ applicationId, success: false, error: "Application not found" });
        failureCount++;
        continue;
      }

      if (!application.candidate) {
        results.push({ applicationId, success: false, error: "Candidate not found" });
        failureCount++;
        continue;
      }

      // TODO: Integrate with actual email/SMS provider
      // For now, log the intent and mark as success (placeholder)
      console.log(`[BulkMessage] Would send ${messageType} to ${application.candidate.email} using template ${messageTemplateId}`);

      // Write individual audit event
      await writeAuditEvent(
        "APPLICATION_MESSAGE_SENT",
        "application",
        applicationId,
        userId,
        userEmail,
        null,
        { messageTemplateId, messageType, recipientEmail: application.candidate.email },
        null,
        `Bulk action: sent ${messageType} using template`
      );

      results.push({ applicationId, success: true });
      successCount++;
    } catch (error: any) {
      results.push({ applicationId, success: false, error: error.message });
      failureCount++;
    }
  }

  // Update bulk action with results
  await db.update(recruitingBulkActions)
    .set({
      successCount,
      failureCount,
      results,
      completedAt: new Date(),
    })
    .where(eq(recruitingBulkActions.id, bulkAction.id));

  return {
    bulkActionId: bulkAction.id,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Get tags for an application
 */
export async function getApplicationTags(applicationId: string): Promise<RecruitingApplicationTag[]> {
  return db.query.recruitingApplicationTags.findMany({
    where: eq(recruitingApplicationTags.applicationId, applicationId),
    orderBy: [desc(recruitingApplicationTags.createdAt)],
  });
}

/**
 * Get all unique tags used in the system
 */
export async function getAllTags(): Promise<string[]> {
  const result = await db.selectDistinct({ tag: recruitingApplicationTags.tag })
    .from(recruitingApplicationTags)
    .orderBy(recruitingApplicationTags.tag);
  return result.map(r => r.tag);
}

/**
 * Get bulk action history
 */
export async function getBulkActionHistory(limit: number = 50): Promise<RecruitingBulkAction[]> {
  return db.query.recruitingBulkActions.findMany({
    orderBy: [desc(recruitingBulkActions.startedAt)],
    limit,
  });
}

// ============================================================================
// TAG MANAGEMENT - CRUD Operations for Recruiting Tags
// ============================================================================

/**
 * Get all active tags from the master tags table
 */
export async function getRecruitingTags(includeInactive: boolean = false): Promise<RecruitingTag[]> {
  if (includeInactive) {
    return db.query.recruitingTags.findMany({
      orderBy: [asc(recruitingTags.category), asc(recruitingTags.name)],
    });
  }
  return db.query.recruitingTags.findMany({
    where: eq(recruitingTags.isActive, true),
    orderBy: [asc(recruitingTags.category), asc(recruitingTags.name)],
  });
}

/**
 * Get a tag by ID
 */
export async function getRecruitingTagById(id: string): Promise<RecruitingTag | undefined> {
  return db.query.recruitingTags.findFirst({
    where: eq(recruitingTags.id, id),
  });
}

/**
 * Create a new tag
 */
export async function createRecruitingTag(
  data: { name: string; description?: string; category?: string; color?: string },
  userId?: string,
  userEmail?: string
): Promise<RecruitingTag> {
  const normalizedName = data.name.toLowerCase().trim();
  
  // Check for duplicate
  const existing = await db.query.recruitingTags.findFirst({
    where: eq(recruitingTags.normalizedName, normalizedName),
  });
  
  if (existing) {
    if (!existing.isActive) {
      // Reactivate inactive tag
      const [reactivated] = await db.update(recruitingTags)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(recruitingTags.id, existing.id))
        .returning();
      return reactivated;
    }
    throw new Error(`Tag "${data.name}" already exists`);
  }
  
  const [tag] = await db.insert(recruitingTags).values({
    name: data.name.trim(),
    normalizedName,
    description: data.description,
    category: (data.category as any) || "custom",
    color: data.color,
    createdBy: userId,
    isSystem: false,
    isActive: true,
  }).returning();
  
  // Audit the creation
  await writeAuditEvent(
    "TAG_CREATED",
    "tag",
    tag.id,
    userId,
    userEmail,
    null,
    { name: tag.name, category: tag.category },
    ['name', 'category'],
    `Created tag: ${tag.name}`
  );
  
  return tag;
}

/**
 * Update a tag
 */
export async function updateRecruitingTag(
  id: string,
  data: { name?: string; description?: string; category?: string; color?: string },
  userId?: string,
  userEmail?: string
): Promise<RecruitingTag> {
  const existing = await getRecruitingTagById(id);
  if (!existing) {
    throw new Error("Tag not found");
  }
  
  if (existing.isSystem && data.name && data.name !== existing.name) {
    throw new Error("Cannot rename system tags");
  }
  
  const updateData: any = { updatedAt: new Date() };
  if (data.name) {
    updateData.name = data.name.trim();
    updateData.normalizedName = data.name.toLowerCase().trim();
  }
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category) updateData.category = data.category;
  if (data.color !== undefined) updateData.color = data.color;
  
  const [updated] = await db.update(recruitingTags)
    .set(updateData)
    .where(eq(recruitingTags.id, id))
    .returning();
  
  // Audit the update
  await writeAuditEvent(
    "TAG_UPDATED",
    "tag",
    id,
    userId,
    userEmail,
    { name: existing.name, description: existing.description },
    { name: updated.name, description: updated.description },
    Object.keys(data),
    `Updated tag: ${updated.name}`
  );
  
  return updated;
}

/**
 * Delete a tag (soft delete)
 */
export async function deleteRecruitingTag(
  id: string,
  userId?: string,
  userEmail?: string
): Promise<void> {
  const existing = await getRecruitingTagById(id);
  if (!existing) {
    throw new Error("Tag not found");
  }
  
  if (existing.isSystem) {
    throw new Error("Cannot delete system tags");
  }
  
  await db.update(recruitingTags)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(recruitingTags.id, id));
  
  // Audit the deletion
  await writeAuditEvent(
    "TAG_DELETED",
    "tag",
    id,
    userId,
    userEmail,
    { name: existing.name, isActive: true },
    { isActive: false },
    ['isActive'],
    `Deleted tag: ${existing.name}`
  );
}

// ============================================================================
// CANDIDATE TAG MANAGEMENT - Apply/Remove Tags from Candidates
// ============================================================================

/**
 * Get tags for a candidate
 */
export async function getCandidateTags(candidateId: string): Promise<(RecruitingCandidateTag & { tag: RecruitingTag })[]> {
  const candidateTags = await db.query.recruitingCandidateTags.findMany({
    where: eq(recruitingCandidateTags.candidateId, candidateId),
    orderBy: [desc(recruitingCandidateTags.createdAt)],
  });
  
  // Get tag details
  const results: (RecruitingCandidateTag & { tag: RecruitingTag })[] = [];
  for (const ct of candidateTags) {
    const tag = await getRecruitingTagById(ct.tagId);
    if (tag && tag.isActive) {
      results.push({ ...ct, tag });
    }
  }
  
  return results;
}

/**
 * Add a tag to a candidate
 */
export async function addTagToCandidate(
  candidateId: string,
  tagId: string,
  userId?: string,
  userEmail?: string,
  sourceAction: string = 'manual'
): Promise<RecruitingCandidateTag> {
  // Verify candidate exists
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });
  if (!candidate) {
    throw new Error("Candidate not found");
  }
  
  // Verify tag exists and is active
  const tag = await getRecruitingTagById(tagId);
  if (!tag || !tag.isActive) {
    throw new Error("Tag not found or inactive");
  }
  
  // Check if already applied
  const existing = await db.query.recruitingCandidateTags.findFirst({
    where: and(
      eq(recruitingCandidateTags.candidateId, candidateId),
      eq(recruitingCandidateTags.tagId, tagId)
    ),
  });
  
  if (existing) {
    return existing;
  }
  
  const [candidateTag] = await db.insert(recruitingCandidateTags).values({
    candidateId,
    tagId,
    createdBy: userId,
    sourceAction,
  }).returning();
  
  // Audit the tag application
  await writeAuditEvent(
    "CANDIDATE_TAG_ADDED",
    "candidate",
    candidateId,
    userId,
    userEmail,
    null,
    { tagId, tagName: tag.name },
    ['tags'],
    `Added tag "${tag.name}" to candidate`
  );
  
  return candidateTag;
}

/**
 * Remove a tag from a candidate
 */
export async function removeTagFromCandidate(
  candidateId: string,
  tagId: string,
  userId?: string,
  userEmail?: string
): Promise<void> {
  const tag = await getRecruitingTagById(tagId);
  
  const existing = await db.query.recruitingCandidateTags.findFirst({
    where: and(
      eq(recruitingCandidateTags.candidateId, candidateId),
      eq(recruitingCandidateTags.tagId, tagId)
    ),
  });
  
  if (!existing) {
    return; // Already removed
  }
  
  await db.delete(recruitingCandidateTags)
    .where(and(
      eq(recruitingCandidateTags.candidateId, candidateId),
      eq(recruitingCandidateTags.tagId, tagId)
    ));
  
  // Audit the tag removal
  await writeAuditEvent(
    "CANDIDATE_TAG_REMOVED",
    "candidate",
    candidateId,
    userId,
    userEmail,
    { tagId, tagName: tag?.name },
    null,
    ['tags'],
    `Removed tag "${tag?.name || tagId}" from candidate`
  );
}

/**
 * Get candidates by tag
 */
export async function getCandidatesByTag(tagId: string): Promise<RecruitingCandidate[]> {
  const candidateTags = await db.query.recruitingCandidateTags.findMany({
    where: eq(recruitingCandidateTags.tagId, tagId),
  });
  
  const candidateIds = candidateTags.map(ct => ct.candidateId);
  if (candidateIds.length === 0) return [];
  
  const candidates = await db.query.recruitingCandidates.findMany({
    where: or(...candidateIds.map(id => eq(recruitingCandidates.id, id))),
    orderBy: [desc(recruitingCandidates.createdAt)],
  });
  
  return candidates;
}

/**
 * Get applications by tag (using the existing application tags)
 */
export async function getApplicationsByTag(tagName: string): Promise<string[]> {
  const appTags = await db.query.recruitingApplicationTags.findMany({
    where: eq(recruitingApplicationTags.tag, tagName),
  });
  return appTags.map(at => at.applicationId);
}

/**
 * Add tag to application (link to master tag by name)
 */
export async function addTagToApplication(
  applicationId: string,
  tagId: string,
  userId?: string,
  userEmail?: string,
  sourceAction: string = 'manual'
): Promise<RecruitingApplicationTag> {
  // Get tag name from master table
  const tag = await getRecruitingTagById(tagId);
  if (!tag || !tag.isActive) {
    throw new Error("Tag not found or inactive");
  }
  
  // Check if already applied
  const existing = await db.query.recruitingApplicationTags.findFirst({
    where: and(
      eq(recruitingApplicationTags.applicationId, applicationId),
      eq(recruitingApplicationTags.tag, tag.name)
    ),
  });
  
  if (existing) {
    return existing;
  }
  
  const [appTag] = await db.insert(recruitingApplicationTags).values({
    applicationId,
    tag: tag.name,
    createdBy: userId,
    sourceAction,
  }).returning();
  
  // Audit the tag application
  await writeAuditEvent(
    "APPLICATION_TAGS_ADDED",
    "application",
    applicationId,
    userId,
    userEmail,
    null,
    { tagId, tagName: tag.name },
    ['tags'],
    `Added tag "${tag.name}" to application`
  );
  
  return appTag;
}

/**
 * Remove tag from application
 */
export async function removeTagFromApplication(
  applicationId: string,
  tagName: string,
  userId?: string,
  userEmail?: string
): Promise<void> {
  const existing = await db.query.recruitingApplicationTags.findFirst({
    where: and(
      eq(recruitingApplicationTags.applicationId, applicationId),
      eq(recruitingApplicationTags.tag, tagName)
    ),
  });
  
  if (!existing) {
    return;
  }
  
  await db.delete(recruitingApplicationTags)
    .where(and(
      eq(recruitingApplicationTags.applicationId, applicationId),
      eq(recruitingApplicationTags.tag, tagName)
    ));
  
  // Audit the tag removal
  await writeAuditEvent(
    "APPLICATION_TAG_REMOVED",
    "application",
    applicationId,
    userId,
    userEmail,
    { tagName },
    null,
    ['tags'],
    `Removed tag "${tagName}" from application`
  );
}

// ============================================================================
// ACTIVITY TIMELINE - Unified chronological view of all candidate/application events
// ============================================================================

export interface TimelineEntry {
  id: string;
  type: 'stage_change' | 'communication' | 'document' | 'interview' | 'audit' | 'compliance' | 'consent';
  timestamp: Date;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string;
}

export async function getApplicationTimeline(
  applicationId: string,
  filters?: {
    eventTypes?: string[];
    limit?: number;
    offset?: number;
  }
): Promise<{ events: TimelineEntry[]; total: number }> {
  const allEvents: TimelineEntry[] = [];

  // 1. Fetch stage history
  const stageHistory = await db
    .select({
      id: recruitingStageHistory.id,
      applicationId: recruitingStageHistory.applicationId,
      fromStage: recruitingStageHistory.fromStage,
      toStage: recruitingStageHistory.toStage,
      transitionedAt: recruitingStageHistory.transitionedAt,
      transitionedBy: recruitingStageHistory.transitionedBy,
      reason: recruitingStageHistory.reason,
      notes: recruitingStageHistory.notes,
      sourceAction: recruitingStageHistory.sourceAction,
      timeInPreviousStageMinutes: recruitingStageHistory.timeInPreviousStageMinutes,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
    })
    .from(recruitingStageHistory)
    .leftJoin(users, eq(recruitingStageHistory.transitionedBy, users.id))
    .where(eq(recruitingStageHistory.applicationId, applicationId));

  for (const stage of stageHistory) {
    const actorName = stage.userFirstName || stage.userLastName
      ? `${stage.userFirstName || ''} ${stage.userLastName || ''}`.trim()
      : stage.userEmail || null;
    allEvents.push({
      id: `stage-${stage.id}`,
      type: 'stage_change',
      timestamp: stage.transitionedAt,
      title: stage.fromStage 
        ? `Stage changed from ${stage.fromStage} to ${stage.toStage}`
        : `Application started in ${stage.toStage}`,
      description: stage.reason || stage.notes || undefined,
      metadata: {
        fromStage: stage.fromStage,
        toStage: stage.toStage,
        sourceAction: stage.sourceAction,
        timeInPreviousStageMinutes: stage.timeInPreviousStageMinutes,
      },
      actorId: stage.transitionedBy,
      actorName,
      entityType: 'application',
      entityId: applicationId,
    });
  }

  // 2. Fetch audit events for this application
  const auditEvents = await db
    .select()
    .from(recruitingAuditEvents)
    .where(and(
      eq(recruitingAuditEvents.entityType, 'application'),
      eq(recruitingAuditEvents.entityId, applicationId)
    ));

  for (const event of auditEvents) {
    // Skip stage change audit events as we already have detailed stage history
    if (event.actionType === 'STAGE_TRANSITION' || event.actionType === 'APPLICATION_STAGE_CHANGED') {
      continue;
    }
    
    allEvents.push({
      id: `audit-${event.id}`,
      type: event.actionType.includes('COMPLIANCE') ? 'compliance' : 'audit',
      timestamp: event.occurredAt,
      title: formatAuditActionType(event.actionType),
      description: event.reason || undefined,
      metadata: {
        actionType: event.actionType,
        changedFields: event.changedFields,
        previousValue: event.previousValue ? JSON.parse(event.previousValue) : null,
        newValue: event.newValue ? JSON.parse(event.newValue) : null,
      },
      actorId: event.userId,
      actorName: event.userEmail || null,
      entityType: event.entityType,
      entityId: event.entityId,
    });
  }

  // 3. Fetch interviews
  const interviews = await db
    .select({
      id: recruitingInterviews.id,
      applicationId: recruitingInterviews.applicationId,
      title: recruitingInterviews.title,
      interviewType: recruitingInterviews.interviewType,
      status: recruitingInterviews.status,
      startTime: recruitingInterviews.startTime,
      endTime: recruitingInterviews.endTime,
      outcome: recruitingInterviews.outcome,
      outcomeNotes: recruitingInterviews.outcomeNotes,
      location: recruitingInterviews.location,
      meetingLink: recruitingInterviews.meetingLink,
      organizerId: recruitingInterviews.organizerId,
      createdAt: recruitingInterviews.createdAt,
      updatedAt: recruitingInterviews.updatedAt,
      updatedBy: recruitingInterviews.updatedBy,
      orgFirstName: users.firstName,
      orgLastName: users.lastName,
      orgEmail: users.email,
    })
    .from(recruitingInterviews)
    .leftJoin(users, eq(recruitingInterviews.organizerId, users.id))
    .where(eq(recruitingInterviews.applicationId, applicationId));

  for (const interview of interviews) {
    const organizerName = interview.orgFirstName || interview.orgLastName
      ? `${interview.orgFirstName || ''} ${interview.orgLastName || ''}`.trim()
      : interview.orgEmail || null;
    allEvents.push({
      id: `interview-${interview.id}`,
      type: 'interview',
      timestamp: interview.createdAt,
      title: `Interview scheduled: ${interview.title}`,
      description: `${interview.interviewType} interview - ${interview.status}`,
      metadata: {
        interviewType: interview.interviewType,
        status: interview.status,
        startTime: interview.startTime,
        endTime: interview.endTime,
        outcome: interview.outcome,
        location: interview.location,
        meetingLink: interview.meetingLink,
      },
      actorId: interview.organizerId,
      actorName: organizerName,
      entityType: 'application',
      entityId: applicationId,
    });

    // Add completed interview as separate event if applicable
    if (interview.outcome && interview.updatedAt > interview.createdAt) {
      allEvents.push({
        id: `interview-completed-${interview.id}`,
        type: 'interview',
        timestamp: interview.updatedAt,
        title: `Interview completed: ${interview.title}`,
        description: `Outcome: ${interview.outcome}${interview.outcomeNotes ? ` - ${interview.outcomeNotes}` : ''}`,
        metadata: {
          interviewType: interview.interviewType,
          status: 'completed',
          outcome: interview.outcome,
        },
        actorId: interview.updatedBy,
        actorName: null,
        entityType: 'application',
        entityId: applicationId,
      });
    }
  }

  // 4. Fetch documents
  const documents = await db
    .select({
      id: recruitingDocuments.id,
      applicationId: recruitingDocuments.applicationId,
      name: recruitingDocuments.name,
      type: recruitingDocuments.type,
      status: recruitingDocuments.status,
      esignStatus: recruitingDocuments.esignStatus,
      esignSentAt: recruitingDocuments.esignSentAt,
      esignSignedAt: recruitingDocuments.esignSignedAt,
      esignProvider: recruitingDocuments.esignProvider,
      signedDocumentUrl: recruitingDocuments.signedDocumentUrl,
      createdAt: recruitingDocuments.createdAt,
      createdBy: recruitingDocuments.createdBy,
      docUserFirstName: users.firstName,
      docUserLastName: users.lastName,
      docUserEmail: users.email,
    })
    .from(recruitingDocuments)
    .leftJoin(users, eq(recruitingDocuments.createdBy, users.id))
    .where(eq(recruitingDocuments.applicationId, applicationId));

  for (const doc of documents) {
    const docActorName = doc.docUserFirstName || doc.docUserLastName
      ? `${doc.docUserFirstName || ''} ${doc.docUserLastName || ''}`.trim()
      : doc.docUserEmail || null;
    allEvents.push({
      id: `doc-${doc.id}`,
      type: 'document',
      timestamp: doc.createdAt,
      title: `Document created: ${doc.name}`,
      description: `${doc.type} document - ${doc.status}`,
      metadata: {
        documentType: doc.type,
        status: doc.status,
        esignStatus: doc.esignStatus,
        esignSentAt: doc.esignSentAt,
        esignSignedAt: doc.esignSignedAt,
      },
      actorId: doc.createdBy,
      actorName: docActorName,
      entityType: 'application',
      entityId: applicationId,
    });

    // Add e-sign events
    if (doc.esignSentAt) {
      allEvents.push({
        id: `doc-esign-sent-${doc.id}`,
        type: 'document',
        timestamp: doc.esignSentAt,
        title: `Document sent for signature: ${doc.name}`,
        description: `Sent via ${doc.esignProvider || 'e-signature'}`,
        metadata: { documentId: doc.id, esignProvider: doc.esignProvider },
        actorId: doc.createdBy,
        actorName: null,
        entityType: 'application',
        entityId: applicationId,
      });
    }

    if (doc.esignSignedAt) {
      allEvents.push({
        id: `doc-esign-signed-${doc.id}`,
        type: 'document',
        timestamp: doc.esignSignedAt,
        title: `Document signed: ${doc.name}`,
        description: 'Document was signed electronically',
        metadata: { documentId: doc.id, signedDocumentUrl: doc.signedDocumentUrl },
        actorId: null,
        actorName: 'Candidate',
        entityType: 'application',
        entityId: applicationId,
      });
    }
  }

  // 5. Fetch communications - need to get application's candidate first
  const [application] = await db
    .select({ candidateId: recruitingApplications.candidateId })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  if (application?.candidateId) {
    const communications = await db
      .select({
        id: recruitingCommunications.id,
        type: recruitingCommunications.type,
        direction: recruitingCommunications.direction,
        subject: recruitingCommunications.subject,
        content: recruitingCommunications.content,
        sentAt: recruitingCommunications.sentAt,
        createdAt: recruitingCommunications.createdAt,
        sentBy: recruitingCommunications.sentBy,
        isAutomated: recruitingCommunications.isAutomated,
        providerStatus: recruitingCommunications.providerStatus,
        deliveredAt: recruitingCommunications.deliveredAt,
        openedAt: recruitingCommunications.openedAt,
        repliedAt: recruitingCommunications.repliedAt,
        commUserFirstName: users.firstName,
        commUserLastName: users.lastName,
        commUserEmail: users.email,
      })
      .from(recruitingCommunications)
      .leftJoin(users, eq(recruitingCommunications.sentBy, users.id))
      .where(or(
        eq(recruitingCommunications.applicationId, applicationId),
        and(
          eq(recruitingCommunications.candidateId, application.candidateId),
          sql`${recruitingCommunications.applicationId} IS NULL`
        )
      ));

    for (const comm of communications) {
      const directionLabel = comm.direction === 'inbound' ? 'Received' : 
                            comm.direction === 'outbound' ? 'Sent' : 'Internal note';
      const commActorName = comm.commUserFirstName || comm.commUserLastName
        ? `${comm.commUserFirstName || ''} ${comm.commUserLastName || ''}`.trim()
        : comm.commUserEmail || (comm.direction === 'inbound' ? 'Candidate' : null);
      allEvents.push({
        id: `comm-${comm.id}`,
        type: 'communication',
        timestamp: comm.sentAt || comm.createdAt || new Date(),
        title: `${comm.type.charAt(0).toUpperCase() + comm.type.slice(1)} ${directionLabel.toLowerCase()}${comm.subject ? `: ${comm.subject}` : ''}`,
        description: comm.content ? comm.content.substring(0, 200) + (comm.content.length > 200 ? '...' : '') : undefined,
        metadata: {
          communicationType: comm.type,
          direction: comm.direction,
          subject: comm.subject,
          isAutomated: comm.isAutomated,
          providerStatus: comm.providerStatus,
          deliveredAt: comm.deliveredAt,
          openedAt: comm.openedAt,
          repliedAt: comm.repliedAt,
        },
        actorId: comm.sentBy,
        actorName: commActorName,
        entityType: 'application',
        entityId: applicationId,
      });
    }
  }

  // 6. Fetch consents
  const candidateIdForConsents = application?.candidateId;
  if (candidateIdForConsents) {
    const consents = await db
      .select()
      .from(recruitingConsents)
      .where(or(
        eq(recruitingConsents.applicationId, applicationId),
        and(
          eq(recruitingConsents.candidateId, candidateIdForConsents),
          sql`${recruitingConsents.applicationId} IS NULL`
        )
      ));

    for (const consent of consents) {
      const consentTimestamp = consent.accepted
        ? (consent.acceptedAt || consent.createdAt)
        : (consent.createdAt || new Date());
      if (!consentTimestamp) continue;

      allEvents.push({
        id: `consent-${consent.id}`,
        type: 'consent',
        timestamp: consentTimestamp,
        title: `Consent ${consent.accepted ? 'given' : 'declined'}: ${consent.consentType.replace(/_/g, ' ')}`,
        description: consent.source ? `Via ${consent.source.replace(/_/g, ' ')}` : undefined,
        metadata: {
          consentType: consent.consentType,
          accepted: consent.accepted,
          version: consent.version,
          source: consent.source,
          stateCode: consent.stateCode,
          verificationMethod: consent.verificationMethod,
          expiresAt: consent.expiresAt,
          revokedAt: consent.revokedAt,
        },
        actorId: consent.witnessedBy || consent.createdBy,
        actorName: null,
        entityType: 'application',
        entityId: applicationId,
      });

      if (consent.revokedAt) {
        allEvents.push({
          id: `consent-revoked-${consent.id}`,
          type: 'consent',
          timestamp: consent.revokedAt,
          title: `Consent revoked: ${consent.consentType.replace(/_/g, ' ')}`,
          description: consent.revocationReason || undefined,
          metadata: {
            consentType: consent.consentType,
            revokedBy: consent.revokedBy,
          },
          actorId: consent.revokedBy,
          actorName: null,
          entityType: 'application',
          entityId: applicationId,
        });
      }
    }
  }

  // Filter by event types if specified
  let filteredEvents = allEvents;
  if (filters?.eventTypes && filters.eventTypes.length > 0) {
    filteredEvents = allEvents.filter(e => filters.eventTypes!.includes(e.type));
  }

  // Sort by timestamp descending (most recent first)
  filteredEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = filteredEvents.length;

  // Apply pagination
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  const paginatedEvents = filteredEvents.slice(offset, offset + limit);

  return { events: paginatedEvents, total };
}

// Helper to format audit action types for display
function formatAuditActionType(actionType: string): string {
  const mappings: Record<string, string> = {
    'APPLICATION_CREATED': 'Application created',
    'APPLICATION_UPDATED': 'Application updated',
    'APPLICATION_DELETED': 'Application deleted',
    'CANDIDATE_CREATED': 'Candidate created',
    'CANDIDATE_UPDATED': 'Candidate updated',
    'CANDIDATE_TAG_ADDED': 'Tag added',
    'CANDIDATE_TAG_REMOVED': 'Tag removed',
    'APPLICATION_TAG_ADDED': 'Tag added',
    'APPLICATION_TAG_REMOVED': 'Tag removed',
    'COMPLIANCE_CHECK_PASSED': 'Compliance check passed',
    'COMPLIANCE_CHECK_FAILED': 'Compliance check failed',
    'COMPLIANCE_REQUIREMENT_ADDED': 'Compliance requirement added',
    'BACKGROUND_CHECK_INITIATED': 'Background check initiated',
    'BACKGROUND_CHECK_COMPLETED': 'Background check completed',
    'OFFER_EXTENDED': 'Offer extended',
    'OFFER_ACCEPTED': 'Offer accepted',
    'OFFER_DECLINED': 'Offer declined',
    'REQUISITION_ASSIGNED': 'Assigned to requisition',
    'RECRUITER_ASSIGNED': 'Recruiter assigned',
    'AVAILABILITY_CHANGED': 'Availability updated (readiness set to In Review)',
    'AVAILABILITY_ALERT_RESOLVED': 'Availability change alert resolved',
  };
  
  return mappings[actionType] || actionType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

// Get timeline for a candidate (across all their applications)
export async function getCandidateTimeline(
  candidateId: string,
  filters?: {
    eventTypes?: string[];
    limit?: number;
    offset?: number;
  }
): Promise<{ events: TimelineEntry[]; total: number }> {
  // Get all applications for this candidate
  const applications = await db.query.recruitingApplications.findMany({
    where: eq(recruitingApplications.candidateId, candidateId),
  });

  // Aggregate events from all applications
  let allEvents: TimelineEntry[] = [];

  for (const app of applications) {
    const { events } = await getApplicationTimeline(app.id, { ...filters, limit: 1000 });
    allEvents = allEvents.concat(events);
  }

  // Also get candidate-level audit events
  const candidateAudits = await db.query.recruitingAuditEvents.findMany({
    where: and(
      eq(recruitingAuditEvents.entityType, 'candidate'),
      eq(recruitingAuditEvents.entityId, candidateId)
    ),
  });

  for (const event of candidateAudits) {
    allEvents.push({
      id: `audit-${event.id}`,
      type: event.actionType.includes('COMPLIANCE') ? 'compliance' : 'audit',
      timestamp: event.occurredAt,
      title: formatAuditActionType(event.actionType),
      description: event.reason || undefined,
      metadata: {
        actionType: event.actionType,
        changedFields: event.changedFields,
      },
      actorId: event.userId,
      actorName: event.userEmail || null,
      entityType: 'candidate',
      entityId: candidateId,
    });
  }

  // Filter by event types if specified
  if (filters?.eventTypes && filters.eventTypes.length > 0) {
    allEvents = allEvents.filter(e => filters.eventTypes!.includes(e.type));
  }

  // Sort by timestamp descending
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Remove duplicates (same ID)
  const uniqueEvents = allEvents.filter((event, index, self) => 
    index === self.findIndex(e => e.id === event.id)
  );

  const total = uniqueEvents.length;

  // Apply pagination
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  const paginatedEvents = uniqueEvents.slice(offset, offset + limit);

  return { events: paginatedEvents, total };
}

// ============================================================================
// SOFT DELETE / ARCHIVAL OPERATIONS

// ============================================================================

export async function archiveCandidate(
  candidateId: string,
  archivedBy: string,
  reason?: string
): Promise<RecruitingCandidate | undefined> {
  const [candidate] = await db.update(recruitingCandidates)
    .set({
      isArchived: true,
      archivedAt: new Date(),
      archivedBy,
      archiveReason: reason || null,
      updatedAt: new Date(),
      updatedBy: archivedBy,
    })
    .where(eq(recruitingCandidates.id, candidateId))
    .returning();

  if (candidate) {
    await writeAuditEvent(
      "archived",
      "candidate",
      candidateId,
      archivedBy,
      null,
      { isArchived: false },
      { isArchived: true, archiveReason: reason || null },
      ["isArchived", "archiveReason"],
      reason
    );
  }

  return candidate;
}

export async function restoreCandidate(
  candidateId: string,
  restoredBy: string
): Promise<RecruitingCandidate | undefined> {
  const [candidate] = await db.update(recruitingCandidates)
    .set({
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      updatedAt: new Date(),
      updatedBy: restoredBy,
    })
    .where(eq(recruitingCandidates.id, candidateId))
    .returning();

  if (candidate) {
    await writeAuditEvent(
      "restored",
      "candidate",
      candidateId,
      restoredBy,
      null,
      { isArchived: true },
      { isArchived: false },
      ["isArchived", "archiveReason"]
    );
  }

  return candidate;
}

export async function archiveApplication(
  applicationId: string,
  archivedBy: string,
  reason?: string
): Promise<RecruitingApplication | undefined> {
  const [application] = await db.update(recruitingApplications)
    .set({
      isArchived: true,
      archivedAt: new Date(),
      archivedBy,
      archiveReason: reason || null,
      updatedAt: new Date(),
      updatedBy: archivedBy,
    })
    .where(eq(recruitingApplications.id, applicationId))
    .returning();

  if (application) {
    await writeAuditEvent(
      "archived",
      "application",
      applicationId,
      archivedBy,
      null,
      { isArchived: false },
      { isArchived: true, archiveReason: reason || null },
      ["isArchived", "archiveReason"],
      reason
    );
  }

  return application;
}

export async function restoreApplication(
  applicationId: string,
  restoredBy: string
): Promise<RecruitingApplication | undefined> {
  const [application] = await db.update(recruitingApplications)
    .set({
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      updatedAt: new Date(),
      updatedBy: restoredBy,
    })
    .where(eq(recruitingApplications.id, applicationId))
    .returning();

  if (application) {
    await writeAuditEvent(
      "restored",
      "application",
      applicationId,
      restoredBy,
      null,
      { isArchived: true },
      { isArchived: false },
      ["isArchived", "archiveReason"]
    );
  }

  return application;
}

export async function archiveRequisition(
  requisitionId: string,
  archivedBy: string,
  reason?: string
): Promise<RecruitingRequisition | undefined> {
  const [requisition] = await db.update(recruitingRequisitions)
    .set({
      isArchived: true,
      archivedAt: new Date(),
      archivedBy,
      archiveReason: reason || null,
      updatedAt: new Date(),
      updatedBy: archivedBy,
    })
    .where(eq(recruitingRequisitions.id, requisitionId))
    .returning();

  if (requisition) {
    await writeAuditEvent(
      "archived",
      "requisition",
      requisitionId,
      archivedBy,
      null,
      { isArchived: false },
      { isArchived: true, archiveReason: reason || null },
      ["isArchived", "archiveReason"],
      reason
    );
  }

  return requisition;
}

export async function restoreRequisition(
  requisitionId: string,
  restoredBy: string
): Promise<RecruitingRequisition | undefined> {
  const [requisition] = await db.update(recruitingRequisitions)
    .set({
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      updatedAt: new Date(),
      updatedBy: restoredBy,
    })
    .where(eq(recruitingRequisitions.id, requisitionId))
    .returning();

  if (requisition) {
    await writeAuditEvent(
      "restored",
      "requisition",
      requisitionId,
      restoredBy,
      null,
      { isArchived: true },
      { isArchived: false },
      ["isArchived", "archiveReason"]
    );
  }

  return requisition;
}

export async function getArchivedCandidates(): Promise<RecruitingCandidate[]> {
  return await db.select()
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.isArchived, true))
    .orderBy(desc(recruitingCandidates.archivedAt));
}

export async function getArchivedApplications(): Promise<RecruitingApplication[]> {
  return await db.select()
    .from(recruitingApplications)
    .where(eq(recruitingApplications.isArchived, true))
    .orderBy(desc(recruitingApplications.archivedAt));
}

export async function getArchivedRequisitions(): Promise<RecruitingRequisition[]> {
  return await db.select()
    .from(recruitingRequisitions)
    .where(eq(recruitingRequisitions.isArchived, true))
    .orderBy(desc(recruitingRequisitions.archivedAt));
}

export async function bulkArchiveApplications(
  applicationIds: string[],
  archivedBy: string,
  reason?: string
): Promise<{ archived: number; failed: string[] }> {
  let archived = 0;
  const failed: string[] = [];

  for (const id of applicationIds) {
    try {
      const result = await archiveApplication(id, archivedBy, reason);
      if (result) {
        archived++;
      } else {
        failed.push(id);
      }
    } catch (error) {
      failed.push(id);
    }
  }

  await db.insert(recruitingBulkActions).values({
    actionType: "archive",
    applicationIds: applicationIds,
    userId: archivedBy,
    successCount: archived,
    failureCount: failed.length,
    parameters: { reason },
  });

  return { archived, failed };
}

export async function bulkRestoreApplications(
  applicationIds: string[],
  restoredBy: string
): Promise<{ restored: number; failed: string[] }> {
  let restored = 0;
  const failed: string[] = [];

  for (const id of applicationIds) {
    try {
      const result = await restoreApplication(id, restoredBy);
      if (result) {
        restored++;
      } else {
        failed.push(id);
      }
    } catch (error) {
      failed.push(id);
    }
  }

  await db.insert(recruitingBulkActions).values({
    actionType: "restore",
    applicationIds: applicationIds,
    userId: restoredBy,
    successCount: restored,
    failureCount: failed.length,
  });
  return { restored, failed };
}

// ============================================================================
// RECRUITING RETENTION RULES - State/Market-Specific Data Retention
// ============================================================================

// Default retention rules for recruiting data
export const DEFAULT_RECRUITING_RETENTION_RULES = [
  // Base rules (priority 0) - Apply when no state/market-specific rule exists
  {
    ruleName: "Default Candidates Retention",
    description: "Base retention period for candidate records after archival",
    entityType: "candidates",
    retentionDays: 1095, // 3 years
    priority: 0,
    complianceRequirement: "Federal EEOC record-keeping requirements (29 CFR 1602.14)",
  },
  {
    ruleName: "Default Applications Retention",
    description: "Base retention period for application records after archival",
    entityType: "applications",
    retentionDays: 1095, // 3 years
    priority: 0,
    complianceRequirement: "Federal EEOC record-keeping requirements (29 CFR 1602.14)",
  },
  {
    ruleName: "Default Requisitions Retention",
    description: "Base retention period for requisition records after archival",
    entityType: "requisitions",
    retentionDays: 730, // 2 years
    priority: 0,
    complianceRequirement: "Standard business record retention",
  },
  // New York State rules (priority 10)
  {
    ruleName: "NY Candidates Retention",
    description: "Extended retention for candidates in New York due to state labor law requirements",
    entityType: "candidates",
    state: "NY",
    retentionDays: 2555, // 7 years
    priority: 10,
    complianceRequirement: "NY Labor Law Section 195 - Personnel file retention requirements",
  },
  {
    ruleName: "NY Applications Retention",
    description: "Extended retention for applications in New York due to state labor law requirements",
    entityType: "applications",
    state: "NY",
    retentionDays: 2555, // 7 years
    priority: 10,
    complianceRequirement: "NY Labor Law Section 195 - Personnel file retention requirements",
  },
  // California rules (priority 10)
  {
    ruleName: "CA Candidates Retention",
    description: "Extended retention for candidates in California due to CCPA and state labor requirements",
    entityType: "candidates",
    state: "CA",
    retentionDays: 1460, // 4 years
    priority: 10,
    complianceRequirement: "CCPA data retention requirements and CA Labor Code Section 1198.5",
  },
  {
    ruleName: "CA Applications Retention",
    description: "Extended retention for applications in California due to CCPA and state labor requirements",
    entityType: "applications",
    state: "CA",
    retentionDays: 1460, // 4 years
    priority: 10,
    complianceRequirement: "CCPA data retention requirements and CA Labor Code Section 1198.5",
  },
];

// Seed default retention rules
export async function seedRecruitingRetentionRules(): Promise<void> {
  console.log("[Recruiting Retention] Seeding default retention rules...");
  
  for (const rule of DEFAULT_RECRUITING_RETENTION_RULES) {
    // Check if rule already exists (by name)
    const [existing] = await db.select()
      .from(recruitingRetentionRules)
      .where(eq(recruitingRetentionRules.ruleName, rule.ruleName))
      .limit(1);
    
    if (!existing) {
      await db.insert(recruitingRetentionRules).values(rule);
      console.log(`[Recruiting Retention] Created rule: ${rule.ruleName}`);
    }
  }
  
  console.log("[Recruiting Retention] Default rules ready");
}

// Get all retention rules
export async function getRecruitingRetentionRules(): Promise<RecruitingRetentionRule[]> {
  return db.select()
    .from(recruitingRetentionRules)
    .orderBy(desc(recruitingRetentionRules.priority), asc(recruitingRetentionRules.entityType));
}

// Get applicable retention rule for an entity (respects priority)
export async function getApplicableRetentionRule(
  entityType: string,
  state?: string | null,
  market?: string | null,
  options?: { stateOnlyMode?: boolean }
): Promise<RecruitingRetentionRule | null> {
  // Normalize inputs to prevent matching failures
  const normalizedState = state?.toUpperCase()?.trim() || null;
  const normalizedMarket = market?.trim() || null;
  const stateOnlyMode = options?.stateOnlyMode || false;
  
  // Specificity order (most specific first):
  // 1. market+state match (highest specificity) - skipped in stateOnlyMode
  // 2. market-only match (if market provided) - skipped in stateOnlyMode
  // 3. state-only match (if state provided)
  // 4. base rule (no state or market - fallback)
  
  const rules = await db.select()
    .from(recruitingRetentionRules)
    .where(
      and(
        eq(recruitingRetentionRules.entityType, entityType),
        eq(recruitingRetentionRules.isActive, true)
      )
    );
  
  // Categorize rules by specificity
  let marketAndStateRule: RecruitingRetentionRule | null = null;
  let marketOnlyRule: RecruitingRetentionRule | null = null;
  let stateOnlyRule: RecruitingRetentionRule | null = null;
  let baseRule: RecruitingRetentionRule | null = null;
  
  for (const rule of rules) {
    // Normalize rule values for comparison
    const ruleState = rule.state?.toUpperCase()?.trim() || null;
    const ruleMarket = rule.market?.trim() || null;
    
    const matchesMarket = ruleMarket && normalizedMarket && ruleMarket === normalizedMarket;
    const matchesState = ruleState && normalizedState && ruleState === normalizedState;
    const hasMarket = !!ruleMarket;
    const hasState = !!ruleState;
    
    // 1. Market + State rule (both specified and both match) - skip in stateOnlyMode
    if (!stateOnlyMode && hasMarket && hasState && matchesMarket && matchesState) {
      // Take highest priority if multiple
      if (!marketAndStateRule || (rule.priority > marketAndStateRule.priority)) {
        marketAndStateRule = rule;
      }
    }
    // 2. Market-only rule (market specified, no state) - skip in stateOnlyMode
    else if (!stateOnlyMode && hasMarket && !hasState && matchesMarket) {
      if (!marketOnlyRule || (rule.priority > marketOnlyRule.priority)) {
        marketOnlyRule = rule;
      }
    }
    // 3. State-only rule (state specified, no market)
    else if (hasState && !hasMarket && matchesState) {
      if (!stateOnlyRule || (rule.priority > stateOnlyRule.priority)) {
        stateOnlyRule = rule;
      }
    }
    // 4. Base rule (no state and no market)
    else if (!hasState && !hasMarket) {
      if (!baseRule || (rule.priority > baseRule.priority)) {
        baseRule = rule;
      }
    }
  }
  
  // Return most specific matching rule (market rules skipped if stateOnlyMode)
  if (stateOnlyMode) {
    return stateOnlyRule || baseRule;
  }
  return marketAndStateRule || marketOnlyRule || stateOnlyRule || baseRule;
}

// Create a new retention rule
export async function createRecruitingRetentionRule(
  data: InsertRecruitingRetentionRule,
  createdBy?: string
): Promise<RecruitingRetentionRule> {
  const [rule] = await db.insert(recruitingRetentionRules)
    .values({
      ...data,
      createdBy,
      updatedBy: createdBy,
    })
    .returning();
  
  return rule;
}

// Update a retention rule
export async function updateRecruitingRetentionRule(
  ruleId: string,
  updates: Partial<InsertRecruitingRetentionRule>,
  updatedBy?: string
): Promise<RecruitingRetentionRule | null> {
  const [rule] = await db.update(recruitingRetentionRules)
    .set({
      ...updates,
      updatedAt: new Date(),
      updatedBy,
    })
    .where(eq(recruitingRetentionRules.id, ruleId))
    .returning();
  
  return rule || null;
}

// Delete a retention rule
export async function deleteRecruitingRetentionRule(ruleId: string): Promise<boolean> {
  const result = await db.delete(recruitingRetentionRules)
    .where(eq(recruitingRetentionRules.id, ruleId))
    .returning();
  
  return result.length > 0;
}

// Get purge run history
export async function getRecruitingPurgeRuns(limit: number = 50): Promise<RecruitingPurgeRun[]> {
  return db.select()
    .from(recruitingPurgeRuns)
    .orderBy(desc(recruitingPurgeRuns.startedAt))
    .limit(limit);
}

// Execute purge for archived recruiting records
export async function executeRecruitingPurge(
  entityType: string,
  triggeredBy?: string
): Promise<{ success: boolean; recordsPurged: number; recordsSkipped: number; error?: string }> {
  console.log(`[Recruiting Retention] Starting purge for ${entityType}...`);
  
  // Create purge run record
  const [purgeRun] = await db.insert(recruitingPurgeRuns)
    .values({
      entityType,
      status: "running",
      triggeredBy,
    })
    .returning();
  
  try {
    let recordsPurged = 0;
    let recordsSkipped = 0;
    
    if (entityType === "applications") {
      // Get all archived applications with their requisition market info
      const archivedApplications = await db.select({
        application: recruitingApplications,
        requisitionMarket: recruitingRequisitions.market,
      })
        .from(recruitingApplications)
        .leftJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
        .where(eq(recruitingApplications.isArchived, true));
      
      for (const { application: app, requisitionMarket } of archivedApplications) {
        // Get applicable rule for this application's state and market
        const rule = await getApplicableRetentionRule(entityType, app.workState, requisitionMarket);
        
        if (!rule) {
          recordsSkipped++;
          continue;
        }
        
        // Check legal hold at rule level
        if (rule.legalHoldEnabled) {
          recordsSkipped++;
          continue;
        }
        
        // Calculate if past retention period
        if (app.archivedAt) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - rule.retentionDays);
          
          if (new Date(app.archivedAt) < cutoffDate) {
            // Delete the application (will cascade to related records)
            await db.delete(recruitingApplications)
              .where(eq(recruitingApplications.id, app.id));
            recordsPurged++;
          }
        }
      }
    } else if (entityType === "candidates") {
      // Get all archived candidates
      const archivedCandidates = await db.select()
        .from(recruitingCandidates)
        .where(eq(recruitingCandidates.isArchived, true));
      
      for (const candidate of archivedCandidates) {
        // Find the most restrictive state from candidate's applications
        // This ensures compliance with the strictest state requirement
        const candidateApplications = await db.select({
          workState: recruitingApplications.workState,
        })
          .from(recruitingApplications)
          .where(eq(recruitingApplications.candidateId, candidate.id));
        
        // Find the most restrictive state-based rule
        let mostRestrictiveRule: RecruitingRetentionRule | null = null;
        
        // First check with all unique states from applications
        const uniqueStates = [...new Set(candidateApplications.map(a => a.workState).filter(Boolean))];
        
        if (uniqueStates.length > 0) {
          for (const state of uniqueStates) {
            // Use stateOnlyMode to ensure we only consider state-specific rules
            // This prevents market-only rules from being selected when determining
            // the most restrictive state-based retention requirement
            const rule = await getApplicableRetentionRule(entityType, state, null, { stateOnlyMode: true });
            if (rule && (!mostRestrictiveRule || rule.retentionDays > mostRestrictiveRule.retentionDays)) {
              mostRestrictiveRule = rule;
            }
          }
        }
        
        // If no state-specific rules found, use base rule
        if (!mostRestrictiveRule) {
          mostRestrictiveRule = await getApplicableRetentionRule(entityType, null, null, { stateOnlyMode: true });
        }
        
        if (!mostRestrictiveRule) {
          recordsSkipped++;
          continue;
        }
        
        // Check legal hold
        if (mostRestrictiveRule.legalHoldEnabled) {
          recordsSkipped++;
          continue;
        }
        
        // Calculate if past retention period
        if (candidate.archivedAt) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - mostRestrictiveRule.retentionDays);
          
          if (new Date(candidate.archivedAt) < cutoffDate) {
            // Delete the candidate (will cascade to applications)
            await db.delete(recruitingCandidates)
              .where(eq(recruitingCandidates.id, candidate.id));
            recordsPurged++;
          }
        }
      }
    } else if (entityType === "requisitions") {
      // Get all archived requisitions
      const archivedRequisitions = await db.select()
        .from(recruitingRequisitions)
        .where(eq(recruitingRequisitions.isArchived, true));
      
      for (const req of archivedRequisitions) {
        const rule = await getApplicableRetentionRule(entityType, req.complianceState, req.market);
        
        if (!rule) {
          recordsSkipped++;
          continue;
        }
        
        // Check legal hold
        if (rule.legalHoldEnabled) {
          recordsSkipped++;
          continue;
        }
        
        // Calculate if past retention period
        if (req.archivedAt) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - rule.retentionDays);
          
          if (new Date(req.archivedAt) < cutoffDate) {
            // Delete the requisition
            await db.delete(recruitingRequisitions)
              .where(eq(recruitingRequisitions.id, req.id));
            recordsPurged++;
          }
        }
      }
    }
    
    // Update purge run record
    await db.update(recruitingPurgeRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        recordsPurged,
        recordsSkipped,
      })
      .where(eq(recruitingPurgeRuns.id, purgeRun.id));
    
    console.log(`[Recruiting Retention] Purge complete. Purged: ${recordsPurged}, Skipped: ${recordsSkipped}`);
    return { success: true, recordsPurged, recordsSkipped };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Recruiting Retention] Purge failed:`, error);
    
    await db.update(recruitingPurgeRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(recruitingPurgeRuns.id, purgeRun.id));
    
    return { success: false, recordsPurged: 0, recordsSkipped: 0, error: errorMessage };
  }
}

export async function cloneApplication(
  sourceApplicationId: string,
  targetRequisitionId: string,
  userId: string | null,
  userEmail: string | null
): Promise<{ application: RecruitingApplication; clonedTags: string[]; complianceSummary: any }> {
  const sourceApp = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, sourceApplicationId),
  });

  if (!sourceApp) {
    throw new Error("Source application not found");
  }

  const targetReq = await getRequisition(targetRequisitionId);
  if (!targetReq) {
    throw new Error("Target requisition not found");
  }

  if (targetReq.status !== 'open') {
    throw new Error("Target requisition is not open for applications");
  }

  if (targetReq.isArchived) {
    throw new Error("Target requisition is archived");
  }

  if (targetReq.isPaused) {
    throw new Error("Target requisition is paused due to a hiring freeze");
  }

  if (sourceApp.requisitionId === targetRequisitionId) {
    throw new Error("Cannot clone application to the same requisition");
  }

  const existingApp = await db.query.recruitingApplications.findFirst({
    where: and(
      eq(recruitingApplications.candidateId, sourceApp.candidateId),
      eq(recruitingApplications.requisitionId, targetRequisitionId)
    ),
  });

  if (existingApp) {
    throw new Error("Candidate is already attached to this job posting.");
  }

  let initialStage = 'applied';
  if (targetReq.workflowId) {
    const entryStage = await db.query.recruitingWorkflowStages.findFirst({
      where: and(
        eq(recruitingWorkflowStages.workflowId, targetReq.workflowId),
        eq(recruitingWorkflowStages.isInitial, true)
      ),
    });
    if (entryStage) {
      initialStage = entryStage.stageKey;
    }
  }

  const resolvedUserId = await resolveUserId(userId);

  const [newApplication] = await db.insert(recruitingApplications).values({
    candidateId: sourceApp.candidateId,
    requisitionId: targetRequisitionId,
    currentStage: initialStage,
    ownerId: sourceApp.ownerId,
    workState: targetReq.workState || sourceApp.workState,
    internalNotes: `Cloned from application ${sourceApp.id}`,
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await db.insert(recruitingStageHistory).values({
    applicationId: newApplication.id,
    fromStage: null,
    toStage: initialStage,
    transitionedBy: resolvedUserId,
    sourceAction: 'application_cloned',
  });

  const sourceTags = await db.select()
    .from(recruitingApplicationTags)
    .where(eq(recruitingApplicationTags.applicationId, sourceApplicationId));

  const clonedTagNames: string[] = [];
  for (const tag of sourceTags) {
    await db.insert(recruitingApplicationTags).values({
      applicationId: newApplication.id,
      tag: tag.tag,
      createdBy: resolvedUserId,
      sourceAction: 'cloned',
    });
    clonedTagNames.push(tag.tag);
  }

  let complianceSummary = null;
  try {
    const { evaluateComplianceChecks } = await import("./services/stateComplianceEngine");
    complianceSummary = await evaluateComplianceChecks(newApplication.id);
  } catch (e: any) {
    complianceSummary = { status: 'pending', message: 'Compliance evaluation deferred' };
  }

  await writeAuditEvent(
    "APPLICATION_CLONED",
    "application",
    newApplication.id,
    userId,
    userEmail,
    null,
    {
      id: newApplication.id,
      sourceApplicationId: sourceApp.id,
      sourceRequisitionId: sourceApp.requisitionId,
      targetRequisitionId: targetRequisitionId,
      candidateId: sourceApp.candidateId,
      currentStage: initialStage,
      clonedTags: clonedTagNames,
      carriedForward: ['candidateId', 'ownerId', 'workState', 'tags'],
      notCarried: ['stageHistory', 'interviews', 'rejectionReasons', 'disposition', 'readinessScore', 'complianceStatus', 'documents', 'screeningResponses'],
    },
    null,
    `Cloned from application ${sourceApp.id} to requisition ${targetRequisitionId}`
  );

  return { application: newApplication, clonedTags: clonedTagNames, complianceSummary };
}

// ============================================================================
// APPLICATION LOCKING & CONCURRENCY CONTROL
// ============================================================================

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function cleanupExpiredLocks(): Promise<void> {
  await db.delete(recruitingApplicationLocks)
    .where(lte(recruitingApplicationLocks.expiresAt, new Date()));
}

export async function acquireApplicationLock(
  applicationId: string,
  userId: string,
  userEmail: string,
  actorRole?: string | null
): Promise<{ success: boolean; lock?: any; conflict?: { lockedBy: string; lockedByEmail: string; expiresAt: Date } }> {
  await cleanupExpiredLocks();

  const existing = await db.select().from(recruitingApplicationLocks)
    .where(eq(recruitingApplicationLocks.applicationId, applicationId))
    .limit(1);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  if (existing.length > 0) {
    const lock = existing[0];
    if (lock.lockedBy === userId) {
      const [updated] = await db.update(recruitingApplicationLocks)
        .set({ expiresAt, lastRefreshedAt: now })
        .where(eq(recruitingApplicationLocks.id, lock.id))
        .returning();
      return { success: true, lock: updated };
    }
    return {
      success: false,
      conflict: {
        lockedBy: lock.lockedBy,
        lockedByEmail: lock.lockedByEmail,
        expiresAt: lock.expiresAt,
      },
    };
  }

  const [newLock] = await db.insert(recruitingApplicationLocks).values({
    applicationId,
    lockedBy: userId,
    lockedByEmail: userEmail,
    expiresAt,
  }).returning();

  await writeAuditEvent(
    "LOCK_ACQUIRED",
    "application",
    applicationId,
    userId,
    userEmail,
    null,
    { lockedBy: userId, lockedByEmail: userEmail, expiresAt: expiresAt.toISOString() },
    ["lockedBy", "expiresAt"],
    undefined,
    actorRole,
    "ui"
  );

  return { success: true, lock: newLock };
}

export async function refreshApplicationLock(
  applicationId: string,
  userId: string
): Promise<{ success: boolean; lock?: any; conflict?: { lockedBy: string; lockedByEmail: string; expiresAt: Date } }> {
  await cleanupExpiredLocks();

  const existing = await db.select().from(recruitingApplicationLocks)
    .where(eq(recruitingApplicationLocks.applicationId, applicationId))
    .limit(1);

  if (existing.length === 0) {
    return { success: false };
  }

  const lock = existing[0];
  if (lock.lockedBy !== userId) {
    return {
      success: false,
      conflict: {
        lockedBy: lock.lockedBy,
        lockedByEmail: lock.lockedByEmail,
        expiresAt: lock.expiresAt,
      },
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  const [updated] = await db.update(recruitingApplicationLocks)
    .set({ expiresAt, lastRefreshedAt: now })
    .where(eq(recruitingApplicationLocks.id, lock.id))
    .returning();

  return { success: true, lock: updated };
}

export async function releaseApplicationLock(
  applicationId: string,
  userId: string,
  userEmail: string,
  actorRole?: string | null
): Promise<boolean> {
  const existing = await db.select().from(recruitingApplicationLocks)
    .where(and(
      eq(recruitingApplicationLocks.applicationId, applicationId),
      eq(recruitingApplicationLocks.lockedBy, userId)
    ))
    .limit(1);

  if (existing.length === 0) return false;

  await db.delete(recruitingApplicationLocks)
    .where(eq(recruitingApplicationLocks.id, existing[0].id));

  await writeAuditEvent(
    "LOCK_RELEASED",
    "application",
    applicationId,
    userId,
    userEmail,
    { lockedBy: userId, lockedByEmail: userEmail },
    null,
    ["lockedBy"],
    undefined,
    actorRole,
    "ui"
  );

  return true;
}

export async function getApplicationLockStatus(
  applicationId: string
): Promise<{ locked: boolean; lock?: { lockedBy: string; lockedByEmail: string; lockedAt: Date; expiresAt: Date } }> {
  await cleanupExpiredLocks();

  const existing = await db.select().from(recruitingApplicationLocks)
    .where(eq(recruitingApplicationLocks.applicationId, applicationId))
    .limit(1);

  if (existing.length === 0) {
    return { locked: false };
  }

  const lock = existing[0];
  return {
    locked: true,
    lock: {
      lockedBy: lock.lockedBy,
      lockedByEmail: lock.lockedByEmail,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
    },
  };
}

export async function checkConcurrencyConflict(
  applicationId: string,
  lastKnownUpdatedAt: string | null
): Promise<{ conflict: boolean; currentUpdatedAt?: Date }> {
  if (!lastKnownUpdatedAt) return { conflict: false };

  const [app] = await db.select({ updatedAt: recruitingApplications.updatedAt })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  if (!app) return { conflict: false };

  const clientDate = new Date(lastKnownUpdatedAt).getTime();
  const serverDate = app.updatedAt.getTime();

  if (Math.abs(serverDate - clientDate) > 1000) {
    return { conflict: true, currentUpdatedAt: app.updatedAt };
  }

  return { conflict: false };
}

export async function enforceApplicationLock(
  applicationId: string,
  userId: string
): Promise<{ allowed: boolean; conflict?: { lockedBy: string; lockedByEmail: string; expiresAt: Date } }> {
  await cleanupExpiredLocks();

  const existing = await db.select().from(recruitingApplicationLocks)
    .where(eq(recruitingApplicationLocks.applicationId, applicationId))
    .limit(1);

  if (existing.length === 0) {
    return { allowed: true };
  }

  const lock = existing[0];
  if (lock.lockedBy === userId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    conflict: {
      lockedBy: lock.lockedBy,
      lockedByEmail: lock.lockedByEmail,
      expiresAt: lock.expiresAt,
    },
  };
}

// ============================================================================
// FEATURE DECOMMISSIONING - Retire/Restore workflows, stages, and templates
// ============================================================================

export async function getDecommissionSummary() {
  const workflows = await db.query.recruitingWorkflows.findMany({
    orderBy: [desc(recruitingWorkflows.createdAt)],
    with: { stages: { orderBy: [recruitingWorkflowStages.sortOrder] } },
  });

  const screeningTemplates = await db.query.recruitingScreeningFormTemplates.findMany({
    orderBy: [desc(recruitingScreeningFormTemplates.createdAt)],
  });

  const docTemplatesRaw = await db.query.recruitingDocumentTemplates.findMany({
    orderBy: [desc(recruitingDocumentTemplates.createdAt)],
  });

  return { workflows, screeningTemplates, documentTemplates: docTemplatesRaw };
}

export async function checkWorkflowInUse(workflowId: string): Promise<{ inUse: boolean; reason?: string; activeRequisitionCount?: number; activeApplicationCount?: number }> {
  const requisitions = await db.query.recruitingRequisitions.findMany({
    where: and(
      sql`${recruitingRequisitions.workflowId} = ${workflowId}`,
      eq(recruitingRequisitions.isArchived, false)
    ),
  });

  if (requisitions.length === 0) {
    return { inUse: false };
  }

  const reqIds = requisitions.map(r => r.id);
  const activeApps = await db.query.recruitingApplications.findMany({
    where: and(
      inArray(recruitingApplications.requisitionId, reqIds),
      eq(recruitingApplications.isArchived, false),
      isNull(recruitingApplications.disposition)
    ),
  });

  if (activeApps.length > 0) {
    return {
      inUse: true,
      reason: `Workflow is assigned to ${requisitions.length} active requisition(s) with ${activeApps.length} active application(s)`,
      activeRequisitionCount: requisitions.length,
      activeApplicationCount: activeApps.length,
    };
  }

  return {
    inUse: true,
    reason: `Workflow is assigned to ${requisitions.length} active requisition(s) (no active applications)`,
    activeRequisitionCount: requisitions.length,
    activeApplicationCount: 0,
  };
}

export async function checkStageInUse(stageId: string): Promise<{ inUse: boolean; reason?: string; activeApplicationCount?: number }> {
  const stage = await db.query.recruitingWorkflowStages.findFirst({
    where: eq(recruitingWorkflowStages.id, stageId),
  });

  if (!stage) return { inUse: false };

  const reqsForWorkflow = await db.query.recruitingRequisitions.findMany({
    where: and(
      eq(recruitingRequisitions.workflowId, stage.workflowId),
      eq(recruitingRequisitions.isArchived, false)
    ),
  });

  if (reqsForWorkflow.length === 0) return { inUse: false };

  const reqIds = reqsForWorkflow.map(r => r.id);
  const activeApps = await db.query.recruitingApplications.findMany({
    where: and(
      eq(recruitingApplications.currentStage, stage.stageKey),
      inArray(recruitingApplications.requisitionId, reqIds),
      eq(recruitingApplications.isArchived, false),
      isNull(recruitingApplications.disposition)
    ),
  });

  if (activeApps.length > 0) {
    return {
      inUse: true,
      reason: `${activeApps.length} active application(s) are currently in stage "${stage.displayName}"`,
      activeApplicationCount: activeApps.length,
    };
  }

  return { inUse: false };
}

export async function checkDocTemplateInUse(templateId: string): Promise<{ inUse: boolean; reason?: string; activeDocCount?: number }> {
  const docs = await db.query.recruitingDocuments.findMany({
    where: and(
      eq(recruitingDocuments.templateId, templateId),
      inArray(recruitingDocuments.status, ["draft", "sent_for_signature", "viewed"])
    ),
  });

  if (docs.length > 0) {
    return {
      inUse: true,
      reason: `${docs.length} active document(s) are using this template`,
      activeDocCount: docs.length,
    };
  }

  return { inUse: false };
}

export async function checkScreeningTemplateInUse(templateId: string): Promise<{ inUse: boolean; reason?: string }> {
  const requisitions = await db.query.recruitingRequisitions.findMany({
    where: and(
      sql`${recruitingRequisitions.screeningFormTemplateId} = ${templateId}`,
      eq(recruitingRequisitions.isArchived, false)
    ),
  });

  if (requisitions.length > 0) {
    return {
      inUse: true,
      reason: `${requisitions.length} active requisition(s) use this screening form template`,
    };
  }

  return { inUse: false };
}

export async function retireWorkflow(workflowId: string, userId: string, userEmail: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const workflow = await db.query.recruitingWorkflows.findFirst({
    where: eq(recruitingWorkflows.id, workflowId),
  });
  if (!workflow) return { success: false, error: "Workflow not found" };
  if (workflow.isRetired) return { success: false, error: "Workflow is already retired" };

  const inUseCheck = await checkWorkflowInUse(workflowId);
  if (inUseCheck.inUse && (inUseCheck.activeApplicationCount || 0) > 0) {
    return { success: false, error: inUseCheck.reason };
  }

  await db.update(recruitingWorkflows)
    .set({ isRetired: true, retiredAt: new Date(), retiredBy: userId, retiredReason: reason, updatedAt: new Date() })
    .where(eq(recruitingWorkflows.id, workflowId));

  await writeAuditEvent(
    "WORKFLOW_RETIRED", "workflow", workflowId,
    userId, userEmail,
    { name: workflow.name, status: workflow.status },
    { isRetired: true, retiredReason: reason },
    ["isRetired", "retiredAt", "retiredBy", "retiredReason"],
    reason, null, "ui"
  );

  return { success: true };
}

export async function restoreWorkflow(workflowId: string, userId: string, userEmail: string): Promise<{ success: boolean; error?: string }> {
  const workflow = await db.query.recruitingWorkflows.findFirst({
    where: eq(recruitingWorkflows.id, workflowId),
  });
  if (!workflow) return { success: false, error: "Workflow not found" };
  if (!workflow.isRetired) return { success: false, error: "Workflow is not retired" };

  await db.update(recruitingWorkflows)
    .set({ isRetired: false, retiredAt: null, retiredBy: null, retiredReason: null, updatedAt: new Date() })
    .where(eq(recruitingWorkflows.id, workflowId));

  await writeAuditEvent(
    "WORKFLOW_RESTORED", "workflow", workflowId,
    userId, userEmail,
    { isRetired: true, retiredReason: workflow.retiredReason },
    { isRetired: false },
    ["isRetired", "retiredAt", "retiredBy", "retiredReason"],
    undefined, null, "ui"
  );

  return { success: true };
}

export async function retireWorkflowStage(stageId: string, userId: string, userEmail: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const stage = await db.query.recruitingWorkflowStages.findFirst({
    where: eq(recruitingWorkflowStages.id, stageId),
  });
  if (!stage) return { success: false, error: "Stage not found" };
  if (stage.isRetired) return { success: false, error: "Stage is already retired" };

  const inUseCheck = await checkStageInUse(stageId);
  if (inUseCheck.inUse) {
    return { success: false, error: inUseCheck.reason };
  }

  await db.update(recruitingWorkflowStages)
    .set({ isRetired: true, retiredAt: new Date(), retiredBy: userId, retiredReason: reason, updatedAt: new Date() })
    .where(eq(recruitingWorkflowStages.id, stageId));

  await writeAuditEvent(
    "STAGE_RETIRED", "workflow_stage", stageId,
    userId, userEmail,
    { stageKey: stage.stageKey, displayName: stage.displayName, workflowId: stage.workflowId },
    { isRetired: true, retiredReason: reason },
    ["isRetired", "retiredAt", "retiredBy", "retiredReason"],
    reason, null, "ui"
  );

  return { success: true };
}

export async function restoreWorkflowStage(stageId: string, userId: string, userEmail: string): Promise<{ success: boolean; error?: string }> {
  const stage = await db.query.recruitingWorkflowStages.findFirst({
    where: eq(recruitingWorkflowStages.id, stageId),
  });
  if (!stage) return { success: false, error: "Stage not found" };
  if (!stage.isRetired) return { success: false, error: "Stage is not retired" };

  await db.update(recruitingWorkflowStages)
    .set({ isRetired: false, retiredAt: null, retiredBy: null, retiredReason: null, updatedAt: new Date() })
    .where(eq(recruitingWorkflowStages.id, stageId));

  await writeAuditEvent(
    "STAGE_RESTORED", "workflow_stage", stageId,
    userId, userEmail,
    { isRetired: true, retiredReason: stage.retiredReason },
    { isRetired: false },
    ["isRetired", "retiredAt", "retiredBy", "retiredReason"],
    undefined, null, "ui"
  );

  return { success: true };
}

export async function retireDocTemplate(templateId: string, userId: string, userEmail: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const template = await db.query.recruitingDocumentTemplates.findFirst({
    where: eq(recruitingDocumentTemplates.id, templateId),
  });
  if (!template) return { success: false, error: "Document template not found" };
  if (!template.isActive) return { success: false, error: "Template is already inactive/retired" };

  const inUseCheck = await checkDocTemplateInUse(templateId);
  if (inUseCheck.inUse) {
    return { success: false, error: inUseCheck.reason };
  }

  await db.update(recruitingDocumentTemplates)
    .set({ isActive: false, updatedAt: new Date(), updatedBy: userId })
    .where(eq(recruitingDocumentTemplates.id, templateId));

  await writeAuditEvent(
    "DOC_TEMPLATE_RETIRED", "document_template", templateId,
    userId, userEmail,
    { name: template.name, isActive: true },
    { isActive: false },
    ["isActive"],
    reason, null, "ui"
  );

  return { success: true };
}

export async function restoreDocTemplate(templateId: string, userId: string, userEmail: string): Promise<{ success: boolean; error?: string }> {
  const template = await db.query.recruitingDocumentTemplates.findFirst({
    where: eq(recruitingDocumentTemplates.id, templateId),
  });
  if (!template) return { success: false, error: "Document template not found" };
  if (template.isActive) return { success: false, error: "Template is already active" };

  await db.update(recruitingDocumentTemplates)
    .set({ isActive: true, updatedAt: new Date(), updatedBy: userId })
    .where(eq(recruitingDocumentTemplates.id, templateId));

  await writeAuditEvent(
    "DOC_TEMPLATE_RESTORED", "document_template", templateId,
    userId, userEmail,
    { isActive: false },
    { isActive: true },
    ["isActive"],
    undefined, null, "ui"
  );

  return { success: true };
}

export async function retireScreeningTemplate(templateId: string, userId: string, userEmail: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const template = await db.query.recruitingScreeningFormTemplates.findFirst({
    where: eq(recruitingScreeningFormTemplates.id, templateId),
  });
  if (!template) return { success: false, error: "Screening form template not found" };
  if (!template.isActive) return { success: false, error: "Template is already inactive/retired" };

  const inUseCheck = await checkScreeningTemplateInUse(templateId);
  if (inUseCheck.inUse) {
    return { success: false, error: inUseCheck.reason };
  }

  await db.update(recruitingScreeningFormTemplates)
    .set({ isActive: false, updatedAt: new Date(), updatedBy: userId })
    .where(eq(recruitingScreeningFormTemplates.id, templateId));

  await writeAuditEvent(
    "SCREENING_TEMPLATE_RETIRED", "screening_template", templateId,
    userId, userEmail,
    { name: template.name, isActive: true },
    { isActive: false },
    ["isActive"],
    reason, null, "ui"
  );

  return { success: true };
}

export async function restoreScreeningTemplate(templateId: string, userId: string, userEmail: string): Promise<{ success: boolean; error?: string }> {
  const template = await db.query.recruitingScreeningFormTemplates.findFirst({
    where: eq(recruitingScreeningFormTemplates.id, templateId),
  });
  if (!template) return { success: false, error: "Screening form template not found" };
  if (template.isActive) return { success: false, error: "Template is already active" };

  await db.update(recruitingScreeningFormTemplates)
    .set({ isActive: true, updatedAt: new Date(), updatedBy: userId })
    .where(eq(recruitingScreeningFormTemplates.id, templateId));

  await writeAuditEvent(
    "SCREENING_TEMPLATE_RESTORED", "screening_template", templateId,
    userId, userEmail,
    { isActive: false },
    { isActive: true },
    ["isActive"],
    undefined, null, "ui"
  );

  return { success: true };
}

export const dnrReasonCodes = [
  { code: "safety_violation", label: "Safety Violation" },
  { code: "policy_violation", label: "Policy Violation" },
  { code: "theft_fraud", label: "Theft / Fraud" },
  { code: "no_call_no_show", label: "Repeated No-Call/No-Show" },
  { code: "failed_drug_test", label: "Failed Drug Test" },
  { code: "license_revoked", label: "License Revoked" },
  { code: "harassment", label: "Harassment / Misconduct" },
  { code: "abandonment", label: "Job Abandonment" },
  { code: "legal_issue", label: "Legal / Criminal Issue" },
  { code: "other", label: "Other" },
] as const;

export async function flagCandidateDnr(
  candidateId: string,
  reasonCode: string,
  notes: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });
  if (!candidate) return { success: false, error: "Candidate not found" };
  if (candidate.isDnr) return { success: false, error: "Candidate is already flagged as Do-Not-Rehire" };

  const now = new Date();
  await db.update(recruitingCandidates)
    .set({
      isDnr: true,
      dnrReasonCode: reasonCode,
      dnrNotes: notes,
      dnrSetAt: now,
      dnrSetBy: userId,
      dnrLiftedAt: null,
      dnrLiftedBy: null,
      dnrLiftedReason: null,
      dnrOverrideAt: null,
      dnrOverrideBy: null,
      dnrOverrideJustification: null,
      updatedAt: now,
      updatedBy: userId,
    })
    .where(eq(recruitingCandidates.id, candidateId));

  await writeAuditEvent(
    "CANDIDATE_DNR_FLAGGED", "candidate", candidateId,
    userId, userEmail,
    { isDnr: false },
    { isDnr: true, dnrReasonCode: reasonCode, dnrNotes: notes },
    ["isDnr", "dnrReasonCode", "dnrNotes", "dnrSetAt", "dnrSetBy"],
    `DNR flagged: ${reasonCode} - ${notes}`, null, "ui"
  );

  return { success: true };
}

export async function liftCandidateDnr(
  candidateId: string,
  liftReason: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });
  if (!candidate) return { success: false, error: "Candidate not found" };
  if (!candidate.isDnr) return { success: false, error: "Candidate is not flagged as Do-Not-Rehire" };

  const now = new Date();
  await db.update(recruitingCandidates)
    .set({
      isDnr: false,
      dnrLiftedAt: now,
      dnrLiftedBy: userId,
      dnrLiftedReason: liftReason,
      updatedAt: now,
      updatedBy: userId,
    })
    .where(eq(recruitingCandidates.id, candidateId));

  await writeAuditEvent(
    "CANDIDATE_DNR_LIFTED", "candidate", candidateId,
    userId, userEmail,
    { isDnr: true, dnrReasonCode: candidate.dnrReasonCode },
    { isDnr: false, dnrLiftedReason: liftReason },
    ["isDnr", "dnrLiftedAt", "dnrLiftedBy", "dnrLiftedReason"],
    `DNR lifted: ${liftReason}`, null, "ui"
  );

  return { success: true };
}

export async function overrideCandidateDnr(
  candidateId: string,
  justification: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });
  if (!candidate) return { success: false, error: "Candidate not found" };
  if (!candidate.isDnr) return { success: false, error: "Candidate is not flagged as Do-Not-Rehire" };

  const now = new Date();
  await db.update(recruitingCandidates)
    .set({
      dnrOverrideAt: now,
      dnrOverrideBy: userId,
      dnrOverrideJustification: justification,
      updatedAt: now,
      updatedBy: userId,
    })
    .where(eq(recruitingCandidates.id, candidateId));

  await writeAuditEvent(
    "CANDIDATE_DNR_OVERRIDE", "candidate", candidateId,
    userId, userEmail,
    { isDnr: true, dnrOverrideJustification: null },
    { isDnr: true, dnrOverrideJustification: justification },
    ["dnrOverrideAt", "dnrOverrideBy", "dnrOverrideJustification"],
    `DNR override: ${justification}`, null, "ui"
  );

  return { success: true };
}

export async function checkCandidateDnrStatus(candidateId: string): Promise<{
  isDnr: boolean;
  dnrReasonCode: string | null;
  dnrNotes: string | null;
  dnrSetAt: Date | null;
  dnrSetBy: string | null;
  hasOverride: boolean;
  dnrOverrideJustification: string | null;
  dnrOverrideAt: Date | null;
  dnrOverrideBy: string | null;
}> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
    columns: {
      isDnr: true,
      dnrReasonCode: true,
      dnrNotes: true,
      dnrSetAt: true,
      dnrSetBy: true,
      dnrOverrideAt: true,
      dnrOverrideBy: true,
      dnrOverrideJustification: true,
    },
  });
  if (!candidate) {
    return { isDnr: false, dnrReasonCode: null, dnrNotes: null, dnrSetAt: null, dnrSetBy: null, hasOverride: false, dnrOverrideJustification: null, dnrOverrideAt: null, dnrOverrideBy: null };
  }
  return {
    isDnr: candidate.isDnr,
    dnrReasonCode: candidate.dnrReasonCode,
    dnrNotes: candidate.dnrNotes,
    dnrSetAt: candidate.dnrSetAt,
    dnrSetBy: candidate.dnrSetBy,
    hasOverride: !!candidate.dnrOverrideAt,
    dnrOverrideJustification: candidate.dnrOverrideJustification,
    dnrOverrideAt: candidate.dnrOverrideAt,
    dnrOverrideBy: candidate.dnrOverrideBy,
  };
}

// ============================================================================
// CANDIDATE TRAINING & CERTIFICATION RECORDS
// ============================================================================

export async function getCandidateTrainings(candidateId: string) {
  return db.select().from(candidateTrainingRecords)
    .where(eq(candidateTrainingRecords.candidateId, candidateId))
    .orderBy(desc(candidateTrainingRecords.completedDate));
}

export async function createCandidateTraining(
  candidateId: string,
  data: {
    trainingType: string;
    customLabel?: string;
    completedDate: string;
    expirationDate?: string;
    provider?: string;
    certificateUrl?: string;
    notes?: string;
  },
  userId: string,
  userEmail: string | null = null
) {
  if (!TRAINING_TYPES.includes(data.trainingType as any)) {
    throw new Error(`Invalid training type: ${data.trainingType}`);
  }
  if (!data.completedDate) {
    throw new Error("Completed date is required");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [record] = await db.insert(candidateTrainingRecords).values({
    candidateId,
    trainingType: data.trainingType,
    customLabel: data.customLabel || null,
    completedDate: data.completedDate,
    expirationDate: data.expirationDate || null,
    provider: data.provider || null,
    certificateUrl: data.certificateUrl || null,
    notes: data.notes || null,
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "TRAINING_RECORD_CREATED",
    "candidate",
    candidateId,
    resolvedUserId,
    userEmail,
    null,
    { trainingId: record.id, trainingType: data.trainingType, completedDate: data.completedDate, expirationDate: data.expirationDate || null } as any,
    ["trainingType", "completedDate", "expirationDate", "provider"]
  );

  return record;
}

export async function updateCandidateTraining(
  trainingId: string,
  candidateId: string,
  data: {
    trainingType?: string;
    customLabel?: string;
    completedDate?: string;
    expirationDate?: string | null;
    provider?: string | null;
    certificateUrl?: string | null;
    notes?: string | null;
  },
  userId: string,
  userEmail: string | null = null
) {
  if (data.trainingType && !TRAINING_TYPES.includes(data.trainingType as any)) {
    throw new Error(`Invalid training type: ${data.trainingType}`);
  }

  const resolvedUserId = await resolveUserId(userId);

  const [existing] = await db.select().from(candidateTrainingRecords)
    .where(and(
      eq(candidateTrainingRecords.id, trainingId),
      eq(candidateTrainingRecords.candidateId, candidateId)
    ));

  if (!existing) {
    throw new Error("Training record not found");
  }

  const [record] = await db.update(candidateTrainingRecords)
    .set({ ...data, updatedAt: new Date(), updatedBy: resolvedUserId })
    .where(eq(candidateTrainingRecords.id, trainingId))
    .returning();

  await writeAuditEvent(
    "TRAINING_RECORD_UPDATED",
    "candidate",
    candidateId,
    resolvedUserId,
    userEmail,
    { trainingType: existing.trainingType, completedDate: existing.completedDate, expirationDate: existing.expirationDate } as any,
    { trainingId, ...data } as any,
    Object.keys(data)
  );

  return record;
}

export async function deleteCandidateTraining(
  trainingId: string,
  candidateId: string,
  userId: string,
  userEmail: string | null = null
) {
  const resolvedUserId = await resolveUserId(userId);

  const [existing] = await db.select().from(candidateTrainingRecords)
    .where(and(
      eq(candidateTrainingRecords.id, trainingId),
      eq(candidateTrainingRecords.candidateId, candidateId)
    ));

  if (!existing) {
    throw new Error("Training record not found");
  }

  await db.delete(candidateTrainingRecords)
    .where(eq(candidateTrainingRecords.id, trainingId));

  await writeAuditEvent(
    "TRAINING_RECORD_DELETED",
    "candidate",
    candidateId,
    resolvedUserId,
    userEmail,
    { trainingId, trainingType: existing.trainingType, completedDate: existing.completedDate } as any,
    null,
    ["trainingType", "completedDate"]
  );

  return { success: true };
}

export async function getCandidateTrainingStatus(candidateId: string) {
  const trainings = await getCandidateTrainings(candidateId);
  const now = new Date();

  const trainingStatus = trainings.map((t) => {
    let status: "valid" | "expiring_soon" | "expired" | "no_expiration" = "no_expiration";
    if (t.expirationDate) {
      const expDate = new Date(t.expirationDate);
      const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 0) {
        status = "expired";
      } else if (daysUntilExpiry <= 30) {
        status = "expiring_soon";
      } else {
        status = "valid";
      }
    }
    return {
      id: t.id,
      trainingType: t.trainingType,
      customLabel: t.customLabel,
      completedDate: t.completedDate,
      expirationDate: t.expirationDate,
      provider: t.provider,
      status,
    };
  });

  const hasExpired = trainingStatus.some((t) => t.status === "expired");
  const hasExpiringSoon = trainingStatus.some((t) => t.status === "expiring_soon");
  const overallStatus = hasExpired ? "attention_needed" : hasExpiringSoon ? "expiring_soon" : "current";

  return {
    candidateId,
    overallStatus,
    totalTrainings: trainings.length,
    trainings: trainingStatus,
  };
}

// ============================================================================
// DRIVER REFERRAL CODES — getOrCreate, lookup, QR
// ============================================================================

import { driverReferralCodes, driverAchievements, ACHIEVEMENT_TYPES, type AchievementType } from "@shared/schema";

async function buildReferralCode(driverId: string): Promise<string> {
  // Derive base from driver's last name via user record
  const driverRow = await db.execute(sql`
    SELECT u.last_name, u.first_name, u.email
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.id = ${driverId}
    LIMIT 1
  `);
  const row = driverRow.rows[0] as any;
  const rawName = (row?.last_name || row?.first_name || row?.email?.split('@')[0] || 'DRIVER') as string;
  const base = rawName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'DRIVER';

  for (let attempt = 0; attempt < 30; attempt++) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const code = `${base}${suffix}`;
    const existing = await db.execute(sql`SELECT 1 FROM driver_referral_codes WHERE code = ${code} LIMIT 1`);
    if (!existing.rows.length) return code;
  }
  // Fallback with timestamp suffix
  return `${base}${Date.now().toString().slice(-4)}`;
}

export async function getOrCreateReferralCode(driverId: string): Promise<{
  id: string; driverId: string; code: string; isActive: boolean; createdAt: Date;
}> {
  // Check existing active code
  const existing = await db.execute(sql`
    SELECT * FROM driver_referral_codes
    WHERE driver_id = ${driverId} AND is_active = TRUE
    LIMIT 1
  `);
  if (existing.rows.length) {
    const r = existing.rows[0] as any;
    return { id: r.id, driverId: r.driver_id, code: r.code, isActive: r.is_active, createdAt: r.created_at };
  }

  const code = await buildReferralCode(driverId);
  const inserted = await db.execute(sql`
    INSERT INTO driver_referral_codes (driver_id, code, is_active)
    VALUES (${driverId}, ${code}, TRUE)
    ON CONFLICT DO NOTHING
    RETURNING *
  `);

  if (inserted.rows.length) {
    const r = inserted.rows[0] as any;
    return { id: r.id, driverId: r.driver_id, code: r.code, isActive: r.is_active, createdAt: r.created_at };
  }

  // Race condition — fetch what was just inserted by another process
  const refetch = await db.execute(sql`
    SELECT * FROM driver_referral_codes WHERE driver_id = ${driverId} AND is_active = TRUE LIMIT 1
  `);
  const r = refetch.rows[0] as any;
  return { id: r.id, driverId: r.driver_id, code: r.code, isActive: r.is_active, createdAt: r.created_at };
}

export async function getReferralCodeInfo(code: string): Promise<{
  code: string;
  driverId: string;
  driverName: string;
  driverPhoto: string | null;
  orgName: string;
} | null> {
  const result = await db.execute(sql`
    SELECT
      rc.code,
      rc.driver_id,
      u.first_name,
      u.last_name,
      u.profile_image_url,
      d.market,
      o.name AS org_name
    FROM driver_referral_codes rc
    JOIN drivers d ON d.id = rc.driver_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN organizations o ON o.id = u.org_id
    WHERE rc.code = ${code.toUpperCase()} AND rc.is_active = TRUE
    LIMIT 1
  `);
  if (!result.rows.length) return null;
  const r = result.rows[0] as any;
  // Touch last_used_at
  await db.execute(sql`
    UPDATE driver_referral_codes SET last_used_at = NOW() WHERE code = ${code.toUpperCase()}
  `);
  return {
    code: r.code,
    driverId: r.driver_id,
    driverName: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Driver',
    driverPhoto: r.profile_image_url || null,
    orgName: r.org_name || 'Driver on Demand',
  };
}

// ============================================================================
// ACHIEVEMENTS — check and grant
// ============================================================================

export async function checkAndGrantAchievements(driverId: string): Promise<AchievementType[]> {
  const granted: AchievementType[] = [];

  // Count total referrals submitted by this driver
  const totalRefs = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM recruiting_referrals
    WHERE referrer_driver_id = ${driverId}
  `);
  const refCount = parseInt((totalRefs.rows[0] as any)?.cnt || '0');

  // Count hired referrals
  const hiredRefs = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM recruiting_referrals
    WHERE referrer_driver_id = ${driverId}
      AND status = 'hired'
  `);
  const hireCount = parseInt((hiredRefs.rows[0] as any)?.cnt || '0');

  const toGrant: Array<{ type: AchievementType; periodKey?: string }> = [];

  if (refCount >= 1) toGrant.push({ type: 'first_referral' });
  if (hireCount >= 1) toGrant.push({ type: 'first_hire' });
  if (hireCount >= 5) toGrant.push({ type: 'five_hires' });
  if (hireCount >= 10) toGrant.push({ type: 'ten_hires' });
  if (refCount >= 20) toGrant.push({ type: 'referral_champion' });

  for (const { type, periodKey } of toGrant) {
    const pk = periodKey || null;
    const existing = await db.execute(sql`
      SELECT 1 FROM driver_achievements
      WHERE driver_id = ${driverId}
        AND achievement_type = ${type}
        AND COALESCE(period_key, '') = COALESCE(${pk}, '')
      LIMIT 1
    `);
    if (!existing.rows.length) {
      await db.execute(sql`
        INSERT INTO driver_achievements (driver_id, achievement_type, period_key)
        VALUES (${driverId}, ${type}, ${pk})
        ON CONFLICT DO NOTHING
      `);
      granted.push(type);
    }
  }

  return granted;
}

export async function getDriverAchievements(driverId: string): Promise<{ type: string; periodKey: string | null; earnedAt: Date }[]> {
  const result = await db.execute(sql`
    SELECT achievement_type, period_key, earned_at
    FROM driver_achievements
    WHERE driver_id = ${driverId}
    ORDER BY earned_at DESC
  `);
  return result.rows.map((r: any) => ({
    type: r.achievement_type,
    periodKey: r.period_key,
    earnedAt: r.earned_at,
  }));
}

export async function getReferralLeaderboard(periodKey?: string): Promise<Array<{
  rank: number; driverName: string; driverId: string; referralCount: number; hireCount: number;
}>> {
  const rows = await db.execute(sql`
    SELECT
      r.referrer_driver_id AS driver_id,
      u.first_name,
      u.last_name,
      COUNT(*) AS referral_count,
      COUNT(*) FILTER (WHERE r.status = 'hired') AS hire_count
    FROM recruiting_referrals r
    LEFT JOIN drivers d ON d.id = r.referrer_driver_id
    LEFT JOIN users u ON u.id = d.user_id
    WHERE r.referrer_driver_id IS NOT NULL
      ${periodKey ? sql`AND r.referral_period_key = ${periodKey}` : sql``}
    GROUP BY r.referrer_driver_id, u.first_name, u.last_name
    ORDER BY referral_count DESC
    LIMIT 20
  `);
  return rows.rows.map((r: any, i: number) => ({
    rank: i + 1,
    driverId: r.driver_id,
    driverName: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown Driver',
    referralCount: parseInt(r.referral_count || '0'),
    hireCount: parseInt(r.hire_count || '0'),
  }));
}

export async function getDriverReferralStats(driverId: string): Promise<{
  totalReferrals: number;
  hiredCount: number;
  pendingCount: number;
  bonusEarned: number;
  bonusPaid: number;
  achievements: { type: string; periodKey: string | null; earnedAt: Date }[];
}> {
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'hired') AS hired,
      COUNT(*) FILTER (WHERE status IN ('submitted','pending_review','interviewing','offer_extended')) AS pending
    FROM recruiting_referrals
    WHERE referrer_driver_id = ${driverId}
  `);
  const bonuses = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount), 0) AS earned,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid
    FROM referral_rewards_ledger l
    JOIN recruiting_referrals r ON r.id = l.referral_id
    WHERE r.referrer_driver_id = ${driverId}
  `);
  const achievements = await getDriverAchievements(driverId);
  const c = counts.rows[0] as any;
  const b = bonuses.rows[0] as any;
  return {
    totalReferrals: parseInt(c?.total || '0'),
    hiredCount: parseInt(c?.hired || '0'),
    pendingCount: parseInt(c?.pending || '0'),
    bonusEarned: parseFloat(b?.earned || '0'),
    bonusPaid: parseFloat(b?.paid || '0'),
    achievements,
  };
}
