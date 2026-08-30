// ──────────────────────────────────────────────────────────────────────────────
// Claims Workflow State Machine
// 5 linear stages: DRAFT → IN_REVIEW → READY_FOR_SUBMISSION → SUBMITTED → CLOSED
// ──────────────────────────────────────────────────────────────────────────────

export const CLAIM_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'CLOSED',
] as const;

// Legacy statuses from the old machine — kept so existing DB rows display correctly
export const LEGACY_CLAIM_STATUSES = [
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUESTED',
  'SENT_TO_CARRIER',
  'APPROVED',
  'DENIED',
  'PAID',
] as const;

export type ClaimStatus = typeof CLAIM_STATUSES[number];
export type LegacyClaimStatus = typeof LEGACY_CLAIM_STATUSES[number];
export type AnyClaimStatus = ClaimStatus | LegacyClaimStatus;

// The ordered stage list — used for progress rendering
export const STAGE_ORDER: ClaimStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'CLOSED',
];

// ── Transition table (no skipping) ────────────────────────────────────────────
const VALID_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT:                ['IN_REVIEW'],
  IN_REVIEW:            ['READY_FOR_SUBMISSION'],
  READY_FOR_SUBMISSION: ['SUBMITTED'],
  SUBMITTED:            ['CLOSED'],
  CLOSED:               [],
};

// ── Role groups ────────────────────────────────────────────────────────────────
const ALL_STAFF_ROLES = [
  'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'FINANCE_MANAGER',
  'CLAIMS_MANAGER', 'SAFETY_MANAGER', 'DISPATCHER',
];
const CLAIMS_ADMIN_ROLES = ['ADMIN', 'OWNER', 'CLAIMS_MANAGER', 'FINANCE_MANAGER'];

// ── Readiness requirements ─────────────────────────────────────────────────────
export interface ReadinessRequirement {
  key: string;
  label: string;
  met: boolean;
  detail?: string;
}

/**
 * Returns readiness requirements that must ALL be met to move FROM `fromStatus`
 * to the next stage. If all are `met: true`, the transition is eligible.
 */
export function getReadinessRequirements(
  fromStatus: ClaimStatus,
  accident: Record<string, any>,
): ReadinessRequirement[] {
  if (fromStatus === 'DRAFT') {
    const hasDate = !!(accident.accidentDate || accident.incidentDate);
    const hasDriver = !!accident.driverId;
    const hasType = !!accident.incidentType;
    return [
      { key: 'incident_date', label: 'Incident date recorded',      met: hasDate   },
      { key: 'driver',        label: 'Driver assigned to claim',     met: hasDriver },
      { key: 'incident_type', label: 'Incident type selected',       met: hasType   },
    ];
  }

  if (fromStatus === 'IN_REVIEW') {
    throw new Error('IN_REVIEW requirements must come from computeCarrierSubmissionReadiness');
  }

  if (fromStatus === 'READY_FOR_SUBMISSION') {
    return [{ key: 'ready', label: 'Claim marked ready for submission', met: true }];
  }

  if (fromStatus === 'SUBMITTED') {
    return [{ key: 'admin_close', label: 'Authorized admin closes claim', met: true }];
  }

  return [];
}

// ── Canonical stage derivation (DH-002341) ─────────────────────────────────────
// The Claim Workflow visualization must reflect the claim's actual lifecycle —
// derived from existing authoritative data/events — instead of a status that
// only moves when someone manually clicks "Advance". These helpers compute the
// stage the SAME way every time a claim is loaded, so it never gets stuck.

/** Enough initial info exists to begin active internal Claims review. */
export function isBasicClaimInfoComplete(accident: Record<string, any>): boolean {
  const hasDate = !!(accident.accidentDate || accident.incidentDate);
  const hasDriver = !!accident.driverId;
  const hasType = !!accident.incidentType;
  return hasDate && hasDriver && hasType;
}

/**
 * The claim has actually, successfully been reported to the carrier.
 * `carrierReportedAt` is only ever set on a *successful* submission (manual
 * mark-reported or a successful "Report Now" send) — never on a failed
 * attempt — so it is the correct authoritative signal for this stage.
 */
export function isCarrierSubmissionConfirmed(accident: Record<string, any>): boolean {
  return !!accident.carrierReportedAt;
}

/**
 * Derives the canonical lifecycle stage for a claim from its existing
 * authoritative data/events, using lifecycle precedence (later events
 * supersede earlier stages): CLOSED > SUBMITTED > READY > IN_REVIEW > DRAFT.
 *
 * `requiredReady` must come from the SAME readiness computation that powers
 * the carrier-submission readiness card (see `computeCarrierSubmissionReadiness`
 * in `claimReadiness.ts`) — this function does not recreate readiness rules.
 *
 * A claim already CLOSED, or still on a legacy pre-migration status, is left
 * untouched — closing and legacy resolution remain admin/manually controlled.
 */
export function deriveCanonicalClaimStage(
  accident: Record<string, any>,
  requiredReady: boolean,
): AnyClaimStatus {
  const stored = (accident.claimStatus || 'DRAFT') as string;

  if (stored === 'CLOSED' || LEGACY_CLAIM_STATUSES.includes(stored as LegacyClaimStatus)) {
    return stored as AnyClaimStatus;
  }

  if (isCarrierSubmissionConfirmed(accident)) return 'SUBMITTED';
  if (requiredReady) return 'READY_FOR_SUBMISSION';
  if (isBasicClaimInfoComplete(accident)) return 'IN_REVIEW';
  return 'DRAFT';
}

// ── Core helpers ───────────────────────────────────────────────────────────────
export function isValidTransition(fromStatus: string, toStatus: ClaimStatus): boolean {
  if (LEGACY_CLAIM_STATUSES.includes(fromStatus as LegacyClaimStatus)) {
    // Legacy statuses can only gracefully escape to SUBMITTED or CLOSED
    return toStatus === 'CLOSED' || toStatus === 'SUBMITTED';
  }
  if (!CLAIM_STATUSES.includes(fromStatus as ClaimStatus)) return false;
  const validTargets = VALID_TRANSITIONS[fromStatus as ClaimStatus];
  return validTargets?.includes(toStatus) ?? false;
}

export function canUserTransition(
  userRole: string,
  fromStatus: string,
  toStatus: ClaimStatus,
): { allowed: boolean; reason?: string } {
  if (!isValidTransition(fromStatus, toStatus)) {
    return { allowed: false, reason: `Invalid transition from ${fromStatus} to ${toStatus}` };
  }
  if (toStatus === 'CLOSED') {
    const allowed = CLAIMS_ADMIN_ROLES.includes(userRole);
    return { allowed, reason: allowed ? undefined : 'Only Claims/Admin roles can close a claim' };
  }
  const allowed = ALL_STAFF_ROLES.includes(userRole);
  return { allowed, reason: allowed ? undefined : 'Insufficient role to transition this claim' };
}

export function getAvailableTransitions(
  currentStatus: string,
  userRole: string,
): ClaimStatus[] {
  const isLegacy = LEGACY_CLAIM_STATUSES.includes(currentStatus as LegacyClaimStatus);
  const isNew    = CLAIM_STATUSES.includes(currentStatus as ClaimStatus);

  if (!isLegacy && !isNew) return [];

  const from = isNew ? (currentStatus as ClaimStatus) : null;
  const possible: ClaimStatus[] = from
    ? (VALID_TRANSITIONS[from] || [])
    : (CLAIMS_ADMIN_ROLES.includes(userRole) ? ['CLOSED'] : []);

  return possible.filter((toStatus) => canUserTransition(userRole, currentStatus, toStatus).allowed);
}

// ── Status display info ────────────────────────────────────────────────────────
export interface StatusDisplayInfo {
  label: string;
  color: 'default' | 'secondary' | 'destructive' | 'outline';
  description: string;
}

const STATUS_INFO: Record<string, StatusDisplayInfo> = {
  DRAFT:                { label: 'Draft',                  color: 'outline',      description: 'Claim is being prepared — complete required incident information and evidence.' },
  IN_REVIEW:            { label: 'In Review',              color: 'secondary',    description: 'Claim information is under internal review.' },
  READY_FOR_SUBMISSION: { label: 'Ready for Submission',   color: 'default',      description: 'All required information is complete. Claim is ready for carrier submission.' },
  SUBMITTED:            { label: 'Submitted',              color: 'default',      description: 'Claim has been reported to the carrier and is awaiting resolution.' },
  CLOSED:               { label: 'Closed',                 color: 'outline',      description: 'Claim lifecycle is complete.' },
  // Legacy
  UNDER_REVIEW:              { label: 'Under Review',       color: 'secondary',   description: 'Claim is under review' },
  ADDITIONAL_INFO_REQUESTED: { label: 'Info Requested',     color: 'secondary',   description: 'Additional information requested' },
  SENT_TO_CARRIER:           { label: 'Sent to Carrier',    color: 'default',     description: 'Submitted to insurance carrier' },
  APPROVED:                  { label: 'Approved',           color: 'default',     description: 'Claim approved' },
  DENIED:                    { label: 'Denied',             color: 'destructive', description: 'Claim denied' },
  PAID:                      { label: 'Paid',               color: 'default',     description: 'Payment processed' },
};

export function getStatusDisplayInfo(status: string): StatusDisplayInfo {
  return STATUS_INFO[status] || { label: status, color: 'outline', description: '' };
}

// Statuses where the claim record is fully locked from edits
export const FINAL_CLAIM_STATUSES: string[] = ['CLOSED', 'DENIED', 'PAID'];

// Statuses that auto-lock evidence files
export const EVIDENCE_LOCKED_CLAIM_STATUSES: string[] = ['SUBMITTED', 'CLOSED', 'APPROVED', 'PAID', 'DENIED'];

export function isClaimEditable(status: string): boolean {
  return !FINAL_CLAIM_STATUSES.includes(status);
}

export function canAddAdditionalInfo(status: string): boolean {
  return status === 'ADDITIONAL_INFO_REQUESTED';
}

/** Returns the 0-based index in STAGE_ORDER for the progress bar (-1 for legacy statuses). */
export function getStageIndex(status: string): number {
  return STAGE_ORDER.indexOf(status as ClaimStatus);
}
