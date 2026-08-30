import { db } from "../db";
import { 
  recruitingCandidates, 
  recruitingApplications, 
  recruitingRequisitions,
  recruitingDocuments,
  recruitingAvailability 
} from "@shared/schema";
import { eq, and, sql, gte, or, isNull } from "drizzle-orm";

export interface ShiftPreferences {
  daysOfWeek: string[];
  timeWindows: { start: string; end: string }[];
  preferredShiftType: "on_demand" | "shift" | "both" | null;
  minHoursPerWeek: number | null;
  maxHoursPerWeek: number | null;
  preferredStartTime: string | null;
  notes: string | null;
}

export interface DeployableCandidate {
  candidateId: string;
  applicationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  market: string;
  roleType: string;
  workerType: string;
  workType: string;
  readinessStatus: string;
  readinessScore: number;
  backgroundCheckStatus: string;
  docsComplete: boolean;
  licenseClass: string | null;
  licenseState: string | null;
  licenseExpiration: string | null;
  hasCommercialLicense: boolean;
  availabilityFlags: {
    consentCaptured: boolean;
    docsComplete: boolean;
    backgroundCheckPassed: boolean;
    licenseValid: boolean;
  };
  complianceStatus: {
    allRequiredDocsValid: boolean;
    backgroundCheckStatus: string;
    licenseExpired: boolean;
  };
  experience: {
    oemsWorkedWith: string[];
    clientTypesExperience: string[];
    yearsExperienceByCategory: Record<string, number>;
  } | null;
  shiftPreferences: ShiftPreferences | null;
  readyAt: Date | null;
}

export interface CandidateSummary {
  candidateId: string;
  applicationId: string;
  identity: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  market: string;
  roleEligibility: {
    title: string;
    workerType: string;
    workType: string;
    licenseClass: string | null;
    hasCommercialLicense: boolean;
  };
  availability: {
    readinessStatus: string;
    readinessScore: number;
    consentCaptured: boolean;
    docsComplete: boolean;
    backgroundCheckPassed: boolean;
  };
  compliance: {
    licenseValid: boolean;
    licenseExpiration: string | null;
    allDocsValid: boolean;
    backgroundCheckStatus: string;
    requiredDocsExpired: string[];
  };
  experience: {
    oemsWorkedWith: string[];
    clientTypesExperience: string[];
    yearsExperienceByCategory: Record<string, number>;
  } | null;
  metadata: {
    appliedAt: Date;
    readyAt: Date | null;
    lastUpdated: Date;
  };
}

export async function getDeployableCandidates(filters: {
  market?: string;
  role?: string;
  workerType?: string;
  workType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ candidates: DeployableCandidate[]; total: number }> {
  const today = new Date().toISOString().split('T')[0];
  
  const conditions = [
    eq(recruitingApplications.readinessStatus, "ready"),
    eq(recruitingApplications.backgroundCheckStatus, "passed"),
    eq(recruitingApplications.docsComplete, true),
    or(
      isNull(recruitingCandidates.licenseExpiration),
      gte(recruitingCandidates.licenseExpiration, today)
    ),
  ];
  
  if (filters.market) {
    conditions.push(eq(recruitingRequisitions.market, filters.market));
  }
  
  if (filters.role) {
    conditions.push(sql`${recruitingRequisitions.title} ILIKE ${`%${filters.role}%`}`);
  }
  
  if (filters.workerType) {
    conditions.push(eq(recruitingRequisitions.workerType, filters.workerType as any));
  }
  
  if (filters.workType) {
    conditions.push(eq(recruitingRequisitions.workType, filters.workType as any));
  }
  
  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recruitingApplications)
    .innerJoin(recruitingCandidates, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(and(...conditions));
  
  const total = totalResult[0]?.count || 0;
  
  const results = await db
    .select({
      candidateId: recruitingCandidates.id,
      applicationId: recruitingApplications.id,
      firstName: recruitingCandidates.firstName,
      lastName: recruitingCandidates.lastName,
      email: recruitingCandidates.email,
      phone: recruitingCandidates.phone,
      market: recruitingRequisitions.market,
      roleType: recruitingRequisitions.title,
      workerType: recruitingRequisitions.workerType,
      workType: recruitingRequisitions.workType,
      readinessStatus: recruitingApplications.readinessStatus,
      readinessScore: recruitingApplications.readinessScore,
      backgroundCheckStatus: recruitingApplications.backgroundCheckStatus,
      docsComplete: recruitingApplications.docsComplete,
      consentCaptured: recruitingApplications.consentCaptured,
      licenseClass: recruitingCandidates.licenseClass,
      licenseState: recruitingCandidates.licenseState,
      licenseExpiration: recruitingCandidates.licenseExpiration,
      hasCommercialLicense: recruitingCandidates.hasCommercialLicense,
      oemsWorkedWith: recruitingCandidates.oemsWorkedWith,
      clientTypesExperience: recruitingCandidates.clientTypesExperience,
      yearsExperienceByCategory: recruitingCandidates.yearsExperienceByCategory,
      readinessLastCalculatedAt: recruitingApplications.readinessLastCalculatedAt,
      updatedAt: recruitingApplications.updatedAt,
      availabilityId: recruitingAvailability.id,
      availabilityDaysOfWeek: recruitingAvailability.daysOfWeek,
      availabilityTimeWindows: recruitingAvailability.timeWindows,
      availabilityShiftType: recruitingAvailability.preferredShiftType,
      availabilityMinHours: recruitingAvailability.minHoursPerWeek,
      availabilityMaxHours: recruitingAvailability.maxHoursPerWeek,
      availabilityStartTime: recruitingAvailability.preferredStartTime,
      availabilityNotes: recruitingAvailability.notes,
    })
    .from(recruitingApplications)
    .innerJoin(recruitingCandidates, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .leftJoin(recruitingAvailability, eq(recruitingCandidates.id, recruitingAvailability.candidateId))
    .where(and(...conditions))
    .orderBy(recruitingApplications.readinessLastCalculatedAt)
    .limit(filters.limit || 100)
    .offset(filters.offset || 0);
  
  const candidates: DeployableCandidate[] = results.map((r) => ({
    candidateId: r.candidateId,
    applicationId: r.applicationId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    market: r.market,
    roleType: r.roleType,
    workerType: r.workerType,
    workType: r.workType || "SHIFT",
    readinessStatus: r.readinessStatus,
    readinessScore: r.readinessScore,
    backgroundCheckStatus: r.backgroundCheckStatus || "pending",
    docsComplete: r.docsComplete || false,
    licenseClass: r.licenseClass,
    licenseState: r.licenseState,
    licenseExpiration: r.licenseExpiration,
    hasCommercialLicense: r.hasCommercialLicense || false,
    availabilityFlags: {
      consentCaptured: r.consentCaptured || false,
      docsComplete: r.docsComplete || false,
      backgroundCheckPassed: r.backgroundCheckStatus === "passed",
      licenseValid: !r.licenseExpiration || r.licenseExpiration >= today,
    },
    complianceStatus: {
      allRequiredDocsValid: r.docsComplete || false,
      backgroundCheckStatus: r.backgroundCheckStatus || "pending",
      licenseExpired: r.licenseExpiration ? r.licenseExpiration < today : false,
    },
    experience: (r.oemsWorkedWith || r.clientTypesExperience || r.yearsExperienceByCategory) ? {
      oemsWorkedWith: (r.oemsWorkedWith as string[]) || [],
      clientTypesExperience: (r.clientTypesExperience as string[]) || [],
      yearsExperienceByCategory: (r.yearsExperienceByCategory as Record<string, number>) || {},
    } : null,
    shiftPreferences: r.availabilityId ? {
      daysOfWeek: r.availabilityDaysOfWeek || [],
      timeWindows: (r.availabilityTimeWindows as { start: string; end: string }[]) || [],
      preferredShiftType: r.availabilityShiftType || null,
      minHoursPerWeek: r.availabilityMinHours || null,
      maxHoursPerWeek: r.availabilityMaxHours || null,
      preferredStartTime: r.availabilityStartTime || null,
      notes: r.availabilityNotes || null,
    } : null,
    readyAt: r.readinessLastCalculatedAt,
  }));
  
  return { candidates, total };
}

export async function getCandidateSummary(candidateId: string): Promise<CandidateSummary | null> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db
    .select({
      candidateId: recruitingCandidates.id,
      applicationId: recruitingApplications.id,
      firstName: recruitingCandidates.firstName,
      lastName: recruitingCandidates.lastName,
      email: recruitingCandidates.email,
      phone: recruitingCandidates.phone,
      market: recruitingRequisitions.market,
      title: recruitingRequisitions.title,
      workerType: recruitingRequisitions.workerType,
      workType: recruitingRequisitions.workType,
      readinessStatus: recruitingApplications.readinessStatus,
      readinessScore: recruitingApplications.readinessScore,
      backgroundCheckStatus: recruitingApplications.backgroundCheckStatus,
      docsComplete: recruitingApplications.docsComplete,
      consentCaptured: recruitingApplications.consentCaptured,
      licenseClass: recruitingCandidates.licenseClass,
      licenseExpiration: recruitingCandidates.licenseExpiration,
      hasCommercialLicense: recruitingCandidates.hasCommercialLicense,
      oemsWorkedWith: recruitingCandidates.oemsWorkedWith,
      clientTypesExperience: recruitingCandidates.clientTypesExperience,
      yearsExperienceByCategory: recruitingCandidates.yearsExperienceByCategory,
      appliedAt: recruitingApplications.appliedAt,
      readinessLastCalculatedAt: recruitingApplications.readinessLastCalculatedAt,
      updatedAt: recruitingApplications.updatedAt,
    })
    .from(recruitingCandidates)
    .innerJoin(recruitingApplications, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(
      and(
        eq(recruitingCandidates.id, candidateId),
        eq(recruitingApplications.readinessStatus, "ready"),
        eq(recruitingApplications.backgroundCheckStatus, "passed"),
        eq(recruitingApplications.docsComplete, true),
        or(
          isNull(recruitingCandidates.licenseExpiration),
          gte(recruitingCandidates.licenseExpiration, today)
        )
      )
    )
    .limit(1);
  
  if (result.length === 0) {
    return null;
  }
  
  const r = result[0];
  const licenseExpired = r.licenseExpiration ? r.licenseExpiration < today : false;
  
  const expiredDocs = await getExpiredRequiredDocs(r.applicationId);
  
  return {
    candidateId: r.candidateId,
    applicationId: r.applicationId,
    identity: {
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
    },
    market: r.market,
    roleEligibility: {
      title: r.title,
      workerType: r.workerType,
      workType: r.workType || "SHIFT",
      licenseClass: r.licenseClass,
      hasCommercialLicense: r.hasCommercialLicense || false,
    },
    availability: {
      readinessStatus: r.readinessStatus,
      readinessScore: r.readinessScore,
      consentCaptured: r.consentCaptured || false,
      docsComplete: r.docsComplete || false,
      backgroundCheckPassed: r.backgroundCheckStatus === "passed",
    },
    compliance: {
      licenseValid: !licenseExpired,
      licenseExpiration: r.licenseExpiration,
      allDocsValid: expiredDocs.length === 0 && (r.docsComplete || false),
      backgroundCheckStatus: r.backgroundCheckStatus || "pending",
      requiredDocsExpired: expiredDocs,
    },
    experience: (r.oemsWorkedWith || r.clientTypesExperience || r.yearsExperienceByCategory) ? {
      oemsWorkedWith: (r.oemsWorkedWith as string[]) || [],
      clientTypesExperience: (r.clientTypesExperience as string[]) || [],
      yearsExperienceByCategory: (r.yearsExperienceByCategory as Record<string, number>) || {},
    } : null,
    metadata: {
      appliedAt: r.appliedAt,
      readyAt: r.readinessLastCalculatedAt,
      lastUpdated: r.updatedAt,
    },
  };
}

async function getExpiredRequiredDocs(applicationId: string): Promise<string[]> {
  const docs = await db
    .select({
      name: recruitingDocuments.name,
      type: recruitingDocuments.type,
      status: recruitingDocuments.status,
    })
    .from(recruitingDocuments)
    .where(eq(recruitingDocuments.applicationId, applicationId));
  
  const expiredDocs: string[] = [];
  for (const doc of docs) {
    if (doc.type === "offer_letter" && doc.status !== "finalized") {
      expiredDocs.push(doc.name);
    }
  }
  
  return expiredDocs;
}

export interface ReadinessChangeEvent {
  eventType: "readiness_changed";
  timestamp: Date;
  candidateId: string;
  applicationId: string;
  previousStatus: string;
  newStatus: string;
  readinessScore: number;
  market: string;
  isDeployable: boolean;
}

export async function emitReadinessChangeEvent(
  candidateId: string,
  applicationId: string,
  previousStatus: string,
  newStatus: string,
  readinessScore: number,
  market: string
): Promise<ReadinessChangeEvent> {
  const isDeployable = newStatus === "ready" && readinessScore >= 100;
  
  const event: ReadinessChangeEvent = {
    eventType: "readiness_changed",
    timestamp: new Date(),
    candidateId,
    applicationId,
    previousStatus,
    newStatus,
    readinessScore,
    market,
    isDeployable,
  };
  
  console.log("[Scheduling] Readiness change event:", JSON.stringify(event));
  
  return event;
}

export async function getReadinessChangesAfter(
  sinceTimestamp: Date,
  limit: number = 100
): Promise<ReadinessChangeEvent[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const results = await db
    .select({
      candidateId: recruitingCandidates.id,
      applicationId: recruitingApplications.id,
      readinessStatus: recruitingApplications.readinessStatus,
      readinessScore: recruitingApplications.readinessScore,
      market: recruitingRequisitions.market,
      readinessLastCalculatedAt: recruitingApplications.readinessLastCalculatedAt,
      backgroundCheckStatus: recruitingApplications.backgroundCheckStatus,
      docsComplete: recruitingApplications.docsComplete,
      licenseExpiration: recruitingCandidates.licenseExpiration,
    })
    .from(recruitingApplications)
    .innerJoin(recruitingCandidates, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(
      and(
        sql`${recruitingApplications.readinessLastCalculatedAt} > ${sinceTimestamp}`,
        sql`${recruitingApplications.readinessLastCalculatedAt} IS NOT NULL`,
        eq(recruitingApplications.readinessStatus, "ready"),
        eq(recruitingApplications.backgroundCheckStatus, "passed"),
        eq(recruitingApplications.docsComplete, true),
        or(
          isNull(recruitingCandidates.licenseExpiration),
          gte(recruitingCandidates.licenseExpiration, today)
        )
      )
    )
    .orderBy(recruitingApplications.readinessLastCalculatedAt)
    .limit(limit);
  
  return results.map((r) => ({
    eventType: "readiness_changed" as const,
    timestamp: r.readinessLastCalculatedAt!,
    candidateId: r.candidateId,
    applicationId: r.applicationId,
    previousStatus: "not_ready",
    newStatus: r.readinessStatus,
    readinessScore: r.readinessScore,
    market: r.market,
    isDeployable: true,
  }));
}
