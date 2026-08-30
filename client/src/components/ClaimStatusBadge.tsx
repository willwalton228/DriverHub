import { cn } from "@/lib/utils";

export const CLAIM_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'CLOSED',
] as const;

export const LEGACY_CLAIM_STATUSES = [
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUESTED',
  'SENT_TO_CARRIER',
  'APPROVED',
  'DENIED',
  'PAID',
] as const;

export const STAGE_ORDER = ['DRAFT', 'IN_REVIEW', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'CLOSED'] as const;

export type ClaimStatus = typeof CLAIM_STATUSES[number];

/**
 * Solid color classes — matches the Drivers List StatusBadge palette exactly:
 *   green-600  (#16a34a) — paid / resolved / approved
 *   red-600    (#dc2626) — denied
 *   amber-500  (#f59e0b) — pending / action needed
 *   blue-500   (#3b82f6) — in-progress / informational
 *   gray-500   (#6b7280) — neutral / closed / draft
 */
const GREEN  = 'bg-green-600 text-white dark:bg-green-700 dark:text-white';
const RED    = 'bg-red-600 text-white dark:bg-red-700 dark:text-white';
const AMBER  = 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white';
const ORANGE = 'bg-[#FF6933] text-white';
const BLUE   = 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white';
const GRAY   = 'bg-gray-500 text-white dark:bg-gray-600 dark:text-white';

interface StatusInfo {
  label: string;
  description: string;
  colorClass: string;
}

const STATUS_INFO: Record<string, StatusInfo> = {
  // ── Canonical lifecycle statuses (claimStatus field) ─────────────────────
  DRAFT:                { label: 'Draft',                description: 'Claim is being prepared',                          colorClass: GRAY  },
  IN_REVIEW:            { label: 'In Review',            description: 'Claims team is reviewing the incident',            colorClass: BLUE  },
  READY_FOR_SUBMISSION: { label: 'Ready for Submission', description: 'Investigation complete — ready to submit',         colorClass: AMBER },
  SUBMITTED:            { label: 'Submitted',            description: 'Claim submitted — awaiting close',                 colorClass: BLUE  },
  CLOSED:               { label: 'Closed',               description: 'Claim has been closed',                            colorClass: GRAY  },

  // ── Legacy lifecycle ──────────────────────────────────────────────────────
  UNDER_REVIEW:              { label: 'Under Review',    description: 'Claim is under review',                colorClass: AMBER },
  ADDITIONAL_INFO_REQUESTED: { label: 'Info Requested',  description: 'Additional information requested',     colorClass: AMBER },
  SENT_TO_CARRIER:           { label: 'Sent to Carrier', description: 'Submitted to insurance carrier',       colorClass: BLUE  },
  APPROVED:                  { label: 'Approved',        description: 'Claim approved',                       colorClass: GREEN },
  DENIED:                    { label: 'Denied',          description: 'Claim denied',                         colorClass: RED   },
  PAID:                      { label: 'Paid',            description: 'Payment processed',                    colorClass: GREEN },

  // ── Resolution statuses (accident.status field) ───────────────────────────
  pending:              { label: 'Pending',               description: 'Claim resolution is pending',         colorClass: ORANGE },
  abandoned:            { label: 'Abandoned',             description: 'Claim has been abandoned',            colorClass: GRAY  },
  denied:               { label: 'Denied',                description: 'Claim has been denied',               colorClass: RED   },
  denied_abandoned:     { label: 'Denied / Abandoned',    description: 'Claim denied and abandoned',          colorClass: RED   },
  driver_paid:          { label: 'Driver Paid',           description: 'Paid by driver',                      colorClass: GREEN },
  insurance_paid:       { label: 'Insurance Paid',        description: 'Paid by insurance',                   colorClass: GREEN },
  dod_paid:             { label: 'DoD Paid',              description: 'Paid by Driver on Demand',            colorClass: GREEN },
  paid_jri:             { label: 'Paid — JRI',            description: 'Paid via JRI',                        colorClass: GREEN },
  paid_other_insurance: { label: 'Paid — Other Insurance',description: 'Paid via other insurance',            colorClass: GREEN },

  // ── Legacy resolution values ──────────────────────────────────────────────
  open:          { label: 'Open',          description: 'Claim is open',       colorClass: BLUE  },
  investigating: { label: 'Investigating', description: 'Under investigation',  colorClass: BLUE  },
  resolved:      { label: 'Resolved',      description: 'Claim resolved',       colorClass: GREEN },
  closed:        { label: 'Closed',        description: 'Claim closed',         colorClass: GRAY  },
} as const;

const UNKNOWN_INFO: StatusInfo = {
  label: 'Unknown',
  description: 'Status unknown',
  colorClass: GRAY,
};

interface ClaimStatusBadgeProps {
  status: string | null | undefined;
  showDescription?: boolean;
  size?: 'sm' | 'default';
}

export function ClaimStatusBadge({ status, showDescription = false }: ClaimStatusBadgeProps) {
  const key = status || 'DRAFT';
  const info = (STATUS_INFO as Record<string, StatusInfo>)[key] ?? UNKNOWN_INFO;

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "whitespace-nowrap inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold capitalize",
          info.colorClass,
        )}
        data-testid={`badge-claim-status-${key.toLowerCase()}`}
      >
        {info.label}
      </span>
      {showDescription && (
        <span className="text-xs text-muted-foreground">{info.description}</span>
      )}
    </div>
  );
}

export function getClaimStatusInfo(status: string | null | undefined): StatusInfo {
  const key = status || 'DRAFT';
  return (STATUS_INFO as Record<string, StatusInfo>)[key] ?? UNKNOWN_INFO;
}
