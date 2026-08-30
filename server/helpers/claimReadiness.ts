// ──────────────────────────────────────────────────────────────────────────────
// Carrier Submission Readiness — single source of truth
//
// This is the SAME readiness computation that powers the "carrier submission
// readiness" card/endpoint (whether a claim has everything needed to report to
// the insurance carrier). The Claim Workflow component (DH-002341) reuses this
// exact function to decide the READY stage instead of recreating its own rules.
// ──────────────────────────────────────────────────────────────────────────────

import { storage } from '../storage';
import { isQualifyingPhotoVideoAttachment } from '../../shared/claimReadiness';

export interface ReadinessItem {
  field: string;
  label: string;
  ready: boolean;
  required: boolean;
  reason?: string;
  waivable?: boolean;
  waived?: boolean;
  notApplicable?: boolean;
  count?: number;
  requiredCount?: number;
}

export interface CarrierReadinessResult {
  items: ReadinessItem[];
  requiredReady: boolean;
  totalReady: number;
  totalItems: number;
  missingRequired: ReadinessItem[];
  openItems: number;
  readinessPercent: number;
}

/**
 * Computes carrier-submission readiness for a claim from its existing
 * authoritative fields, attachments, and driver remediation record.
 *
 * `claimTypeOverride` exists only so the UI's "what-if" claim-type selector on
 * the readiness card can preview requirements before the claim is saved — it
 * must NOT be used when deriving the actual Claim Workflow stage.
 */
export async function computeCarrierSubmissionReadiness(
  claim: Record<string, any>,
  opts: { claimTypeOverride?: string } = {},
): Promise<CarrierReadinessResult> {
  const claimType = opts.claimTypeOverride || claim.claimType || 'auto';
  const isGL = claimType === 'general_liability' || claimType === 'INJURY' || claimType === 'PROPERTY';

  const isInsuranceClaim = claim.claimCategory === 'insurance_claim';
  const liabilityFault = claim.liabilityFault as string | null;
  const isAtFault = liabilityFault === 'at_fault' || liabilityFault === 'shared_fault';
  const isNotAtFault = liabilityFault === 'not_at_fault';
  const severity = claim.claimSeverity as string | null; // LOW | MEDIUM | HIGH | CRITICAL
  const severityEstimate = claim.severityEstimate as string | null; // minor | moderate | major | catastrophic
  const isMajorSeverity = severity === 'HIGH' || severity === 'CRITICAL' ||
                           severityEstimate === 'major' || severityEstimate === 'catastrophic';

  const items: ReadinessItem[] = [];

  // ── Core fields (always required) ───────────────────────────
  items.push({ field: 'lossDate', label: 'Date of Loss', ready: !!(claim.lossDate || claim.incidentDate), required: true });
  items.push({ field: 'lossLocation', label: 'Loss Location', ready: !!(claim.lossLocation || claim.location || claim.lossLocationAddress), required: true });
  items.push({ field: 'description', label: 'Description of Loss', ready: !!(claim.descriptionOfLoss || claim.allegedIncidentDescription || claim.description), required: true });

  // ── GL vs Auto supplemental fields ──────────────────────────
  if (isGL) {
    items.push({ field: 'insuredName', label: 'Insured Name', ready: !!claim.insuredName, required: true });
    items.push({ field: 'lossLocationAddress', label: 'GL Location Address', ready: !!claim.lossLocationAddress, required: false });
    items.push({ field: 'reportFiledByName', label: 'Reporter Name', ready: !!claim.reportFiledByName, required: false });
    items.push({ field: 'injuredParties', label: 'Injured Parties', ready: Array.isArray(claim.injuredParties) && claim.injuredParties.length > 0, required: false });
  } else {
    items.push({ field: 'vehicleVin', label: 'Vehicle VIN', ready: !!claim.vehicleVin, required: false });
    items.push({ field: 'vehicleMake', label: 'Vehicle Make/Model', ready: !!(claim.vehicleMake || claim.vehicleModel), required: false });
  }

  items.push({ field: 'driverId', label: 'Driver Linked', ready: !!claim.driverId, required: true });

  // ── Attachment checks ────────────────────────────────────────
  const attachments = await storage.getAttachmentsByAccidentId(claim.id);
  const activeAttachments = attachments.filter((a: any) => !a.isDeleted);

  const photoAttachments = activeAttachments.filter(isQualifyingPhotoVideoAttachment);
  const photoCount = photoAttachments.length;
  const requiredPhotoCount = isMajorSeverity ? 3 : 1;
  const hasEnoughPhotos = photoCount >= requiredPhotoCount;
  items.push({
    field: 'photos',
    label: isMajorSeverity ? `Photos / Video (${photoCount}/${requiredPhotoCount} required)` : 'Photos / Video',
    ready: hasEnoughPhotos,
    required: true,
    count: photoCount,
    requiredCount: requiredPhotoCount,
    reason: isMajorSeverity ? `High/Critical severity requires at least ${requiredPhotoCount} photos` : undefined,
  });

  const noPoliceInvolvement = !!claim.policeReportWaived;
  const hasAccidentReport = activeAttachments.some((a: any) => a.category === 'accident_report');
  items.push({
    field: 'accidentReport',
    label: 'Accident Report / Exchange of Driver Info',
    ready: hasAccidentReport || noPoliceInvolvement,
    required: true,
    reason: noPoliceInvolvement ? 'Not Required — No Police Involvement' : undefined,
    notApplicable: noPoliceInvolvement,
  });

  const hasDriverStatement = activeAttachments.some((a: any) =>
    a.category === 'driver_statement' || (a.notes && /driver.?statement/i.test(a.notes))
  );
  items.push({
    field: 'driverStatement',
    label: 'Driver Statement',
    ready: hasDriverStatement,
    required: isMajorSeverity,
    reason: isMajorSeverity ? 'High/Critical severity requires a driver statement' : undefined,
  });

  // ── Police Report (dynamic: required for insurance claims) ───
  const policeReportReady = activeAttachments.some((a: any) => a.category === 'police_report') ||
    !!(claim.policeReportObtained || claim.policeReportCaseNumber || claim.policeReportFiled) ||
    noPoliceInvolvement;
  items.push({
    field: 'policeReport',
    label: 'Police Report',
    ready: policeReportReady,
    required: isInsuranceClaim,
    reason: noPoliceInvolvement
      ? 'Not Required — No Police Involvement'
      : isInsuranceClaim
        ? 'Required for insurance carrier submissions'
        : undefined,
    notApplicable: noPoliceInvolvement,
  });

  // ── Third Party Info (dynamic: required when not at fault) ───
  const thirdPartyReady = !!(claim.claimantName && claim.claimantInsurance);
  if (isNotAtFault) {
    items.push({
      field: 'thirdPartyInfo',
      label: 'Third Party Information',
      ready: thirdPartyReady,
      required: true,
      reason: 'Third party details are required for not-at-fault claims',
    });
  } else {
    const hasAnyThirdParty = !!(claim.claimantName || claim.claimantPhone);
    items.push({
      field: 'thirdPartyInfo',
      label: 'Other Party Information',
      ready: hasAnyThirdParty,
      required: false,
    });
  }

  // ── Driver Remediation (dynamic: required when at fault) ─────
  let remediationReady = false;
  try {
    const { getIncidentForClaim } = await import('../remediationService');
    const incident = await getIncidentForClaim(claim.id);
    remediationReady = !!incident;
  } catch (_) { /* no-op if service unavailable */ }
  if (isAtFault) {
    items.push({
      field: 'driverRemediation',
      label: 'Driver Incident & Remediation',
      ready: remediationReady,
      required: true,
      reason: `At-fault/shared-fault claims require a driver incident review and corrective action`,
    });
  }

  // ── Drug test check ──────────────────────────────────────────
  const drugTestApplicable = !!claim.drugTestRequired;
  if (drugTestApplicable) {
    const dtStatus = claim.drugTestStatus || '';
    const drugTestDone = ['completed', 'waived'].includes(dtStatus);
    items.push({ field: 'drugTest', label: 'Drug Test Result', ready: drugTestDone, required: true });
  }

  // ── Catastrophic acknowledgment ──────────────────────────────
  const catastrophicCheck = claim.catastrophicLoss ? claim.catastrophicAcknowledged : true;
  items.push({ field: 'catastrophicAcknowledged', label: 'Catastrophic Acknowledged (if applicable)', ready: !!catastrophicCheck, required: claim.catastrophicLoss === true });

  const applicableItems = items.filter(i => !i.notApplicable);
  const requiredReady = items.filter(i => i.required && !i.notApplicable).every(i => i.ready);
  const totalReady = applicableItems.filter(i => i.ready).length;
  const missingRequired = items.filter(i => i.required && !i.notApplicable && !i.ready);
  const openItems = applicableItems.length - totalReady;
  const readinessPercent = applicableItems.length > 0
    ? Math.round((totalReady / applicableItems.length) * 100)
    : 0;

  return {
    items,
    requiredReady,
    totalReady,
    totalItems: applicableItems.length,
    missingRequired,
    openItems,
    readinessPercent,
  };
}

/**
 * Recomputes a claim's canonical Workflow stage from its existing authoritative
 * data (readiness, carrier submission event, resolution status) and persists
 * the correction when it differs from the stored value — so the Claim Workflow
 * always reflects reality without requiring a manual "Advance" click, and works
 * for existing claims the moment they're loaded (no resave required).
 *
 * Never overrides a CLOSED or legacy-status claim; those remain admin/manually
 * controlled per the existing state machine rules.
 */
export async function syncClaimWorkflowStage(
  claim: Record<string, any>,
): Promise<{ claim: Record<string, any>; readiness: CarrierReadinessResult }> {
  const { deriveCanonicalClaimStage } = await import('./claimStateMachine');
  const readiness = await computeCarrierSubmissionReadiness(claim);
  const derivedStage = deriveCanonicalClaimStage(claim, readiness.requiredReady);
  const storedStage = claim.claimStatus || 'DRAFT';

  if (derivedStage !== storedStage) {
    try {
      await storage.updateAccident(claim.id, { claimStatus: derivedStage } as any);
    } catch (err) {
      console.error('[ClaimWorkflow] Failed to persist derived workflow stage:', err);
    }
    claim = { ...claim, claimStatus: derivedStage };
  }

  return { claim, readiness };
}
