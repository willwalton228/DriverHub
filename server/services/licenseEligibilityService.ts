import { db } from "../db";
import { recruitingApplications, recruitingCandidates, recruitingRequisitions } from "@shared/schema";
import { eq, and, inArray, ne } from "drizzle-orm";

const LICENSE_CLASS_HIERARCHY: Record<string, number> = {
  'A': 3,
  'B': 2,
  'C': 1,
  'Non-CDL': 0,
};

const VALID_ENDORSEMENTS = ['H', 'N', 'P', 'T', 'X', 'S'] as const;

function normalizeLicenseClass(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'A' || upper === 'CDL-A' || upper === 'CLASS A') return 'A';
  if (upper === 'B' || upper === 'CDL-B' || upper === 'CLASS B') return 'B';
  if (upper === 'C' || upper === 'CDL-C' || upper === 'CLASS C') return 'C';
  if (upper === 'NON-CDL' || upper === 'NON CDL' || upper === 'NONCDL' || upper === 'NONE') return 'Non-CDL';
  return raw.trim();
}

function normalizeEndorsement(raw: string): string {
  return raw.trim().toUpperCase();
}

export interface LicenseCheckResult {
  eligible: boolean;
  mismatchReason: string | null;
}

export function checkLicenseEligibility(
  candidateLicenseClass: string | null | undefined,
  candidateEndorsements: string[] | null | undefined,
  requiredLicenseClass: string | null | undefined,
  requiredEndorsements: string[] | null | undefined,
): LicenseCheckResult {
  const reasons: string[] = [];

  const normalizedCandidateClass = normalizeLicenseClass(candidateLicenseClass);
  const normalizedRequiredClass = normalizeLicenseClass(requiredLicenseClass);

  if (normalizedRequiredClass) {
    if (!normalizedCandidateClass) {
      reasons.push(`License class ${normalizedRequiredClass} required but candidate has no license class on file`);
    } else {
      const candidateLevel = LICENSE_CLASS_HIERARCHY[normalizedCandidateClass];
      const requiredLevel = LICENSE_CLASS_HIERARCHY[normalizedRequiredClass];
      if (candidateLevel !== undefined && requiredLevel !== undefined) {
        if (candidateLevel < requiredLevel) {
          reasons.push(`Requires Class ${normalizedRequiredClass} but candidate has Class ${normalizedCandidateClass}`);
        }
      } else if (normalizedCandidateClass !== normalizedRequiredClass) {
        reasons.push(`Requires Class ${normalizedRequiredClass} but candidate has Class ${normalizedCandidateClass}`);
      }
    }
  }

  const normalizedRequired = (requiredEndorsements || []).map(normalizeEndorsement).filter(e => e.length > 0);
  const normalizedCandidate = (candidateEndorsements || []).map(normalizeEndorsement).filter(e => e.length > 0);

  if (normalizedRequired.length > 0) {
    const missing = normalizedRequired.filter(e => !normalizedCandidate.includes(e));
    if (missing.length > 0) {
      reasons.push(`Missing endorsement(s): ${missing.join(', ')}`);
    }
  }

  return {
    eligible: reasons.length === 0,
    mismatchReason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

export async function computeAndUpdateLicenseEligibility(applicationId: string): Promise<void> {
  try {
    const application = await db.query.recruitingApplications.findFirst({
      where: eq(recruitingApplications.id, applicationId),
    });
    if (!application) return;

    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, application.candidateId),
    });
    if (!candidate) return;

    const requisition = await db.query.recruitingRequisitions.findFirst({
      where: eq(recruitingRequisitions.id, application.requisitionId),
    });
    if (!requisition) return;

    if (!requisition.requiredLicenseClass && (!requisition.requiredEndorsements || requisition.requiredEndorsements.length === 0)) {
      await db.update(recruitingApplications)
        .set({
          licenseEligible: null,
          licenseMismatchReason: null,
          licenseCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recruitingApplications.id, applicationId));
      return;
    }

    const result = checkLicenseEligibility(
      candidate.licenseClass,
      candidate.endorsements,
      requisition.requiredLicenseClass,
      requisition.requiredEndorsements,
    );

    await db.update(recruitingApplications)
      .set({
        licenseEligible: result.eligible,
        licenseMismatchReason: result.mismatchReason,
        licenseCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recruitingApplications.id, applicationId));

    console.log(`[LicenseEligibility] Application ${applicationId}: eligible=${result.eligible}${result.mismatchReason ? `, reason=${result.mismatchReason}` : ''}`);
  } catch (error) {
    console.error(`[LicenseEligibility] Error computing for application ${applicationId}:`, error);
  }
}

export async function refreshLicenseForCandidate(candidateId: string): Promise<void> {
  try {
    const activeApps = await db.query.recruitingApplications.findMany({
      where: and(
        eq(recruitingApplications.candidateId, candidateId),
        eq(recruitingApplications.isArchived, false),
        ne(recruitingApplications.disposition, 'rejected'),
      ),
    });

    for (const app of activeApps) {
      await computeAndUpdateLicenseEligibility(app.id);
    }

    if (activeApps.length > 0) {
      console.log(`[LicenseEligibility] Refreshed ${activeApps.length} applications for candidate ${candidateId}`);
    }
  } catch (error) {
    console.error(`[LicenseEligibility] Error refreshing for candidate ${candidateId}:`, error);
  }
}

export async function refreshLicenseForRequisition(requisitionId: string): Promise<void> {
  try {
    const activeApps = await db.query.recruitingApplications.findMany({
      where: and(
        eq(recruitingApplications.requisitionId, requisitionId),
        eq(recruitingApplications.isArchived, false),
      ),
    });

    for (const app of activeApps) {
      await computeAndUpdateLicenseEligibility(app.id);
    }

    if (activeApps.length > 0) {
      console.log(`[LicenseEligibility] Refreshed ${activeApps.length} applications for requisition ${requisitionId}`);
    }
  } catch (error) {
    console.error(`[LicenseEligibility] Error refreshing for requisition ${requisitionId}:`, error);
  }
}

export async function checkLicenseGate(applicationId: string): Promise<{ canProceed: boolean; reason?: string }> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });
  if (!application) return { canProceed: true };

  const requisition = await db.query.recruitingRequisitions.findFirst({
    where: eq(recruitingRequisitions.id, application.requisitionId),
  });
  if (!requisition) return { canProceed: true };

  if (!requisition.licenseGateEnabled) return { canProceed: true };

  if (!requisition.requiredLicenseClass && (!requisition.requiredEndorsements || requisition.requiredEndorsements.length === 0)) {
    return { canProceed: true };
  }

  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, application.candidateId),
  });
  if (!candidate) return { canProceed: true };

  const result = checkLicenseEligibility(
    candidate.licenseClass,
    candidate.endorsements,
    requisition.requiredLicenseClass,
    requisition.requiredEndorsements,
  );

  if (!result.eligible) {
    return {
      canProceed: false,
      reason: `License requirements not met: ${result.mismatchReason}`,
    };
  }

  return { canProceed: true };
}
