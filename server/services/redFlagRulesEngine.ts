/**
 * AI Red-Flag Rules Engine
 *
 * Deterministic, rule-based detection of candidate red flags.
 * Results are advisory only — recruiters retain full override authority.
 * No protected characteristics are evaluated.
 */

export type RedFlagType =
  | "no_valid_license"
  | "unwilling_required_hours"
  | "recent_major_accident"
  | "dui_dwi_history"
  | "not_available_in_market"
  | "missing_core_info"
  | "no_work_authorization";

export type RedFlagSeverity = "high" | "medium" | "low";

export interface RedFlag {
  type: RedFlagType;
  label: string;
  severity: RedFlagSeverity;
  detail: string;
  field?: string;
  detectedAt: string; // ISO timestamp
}

export interface RedFlagOverride {
  flagType: RedFlagType;
  overriddenBy: string; // user ID
  overrideNote: string;
  overriddenAt: string; // ISO timestamp
}

export interface RedFlagInputs {
  application: {
    geoEligible?: boolean | null;
    distanceMiles?: string | number | null;
    licenseEligible?: boolean | null;
    licenseMismatchReason?: string | null;
    internalNotes?: string | null;
    readinessScore?: number | null;
  };
  candidate: {
    licenseClass?: string | null;
    hasCommercialLicense?: boolean | null;
    licenseExpiration?: string | Date | null;
    mvrViolations3yr?: number | null;
    mvrAtFaultAccidents?: number | null;
    mvrDuiDwi?: boolean | null;
    yearsExperience?: number | null;
    authorizedToWork?: boolean | null;
    preferredWorkType?: string | null;
    zipCode?: string | null;
    email?: string | null;
    phone?: string | null;
    accommodationsRequired?: string | null;
  } | null;
  requisition: {
    requiredLicenseClass?: string | null;
    requiresCdl?: boolean | null;
    workerType?: string | null;
    workType?: string | null;
    market?: string | null;
    minYearsExperience?: number | null;
    maxGeoRadius?: number | null;
  } | null;
}

const FLAG_LABELS: Record<RedFlagType, string> = {
  no_valid_license: "No Valid License",
  unwilling_required_hours: "Availability Concern",
  recent_major_accident: "Recent Major Accident",
  dui_dwi_history: "DUI/DWI History",
  not_available_in_market: "Out of Market Range",
  missing_core_info: "Missing Core Information",
  no_work_authorization: "Work Authorization Issue",
};

function now(): string {
  return new Date().toISOString();
}

/**
 * Evaluate all rules against the provided inputs and return detected red flags.
 * Rules are independent — all are always evaluated.
 */
export function detectRedFlags(inputs: RedFlagInputs): RedFlag[] {
  const flags: RedFlag[] = [];
  const { application, candidate, requisition } = inputs;

  // ─── Rule 1: No Valid License ────────────────────────────────────────────────
  if (application.licenseEligible === false) {
    flags.push({
      type: "no_valid_license",
      label: FLAG_LABELS.no_valid_license,
      severity: "high",
      detail: application.licenseMismatchReason
        ? `License requirement not met: ${application.licenseMismatchReason}`
        : "Candidate does not meet the license requirements for this position.",
      field: "licenseEligible",
      detectedAt: now(),
    });
  } else if (
    candidate &&
    requisition?.requiresCdl === true &&
    candidate.hasCommercialLicense === false
  ) {
    flags.push({
      type: "no_valid_license",
      label: FLAG_LABELS.no_valid_license,
      severity: "high",
      detail: "Position requires a CDL but candidate does not hold a commercial driver's license.",
      field: "hasCommercialLicense",
      detectedAt: now(),
    });
  } else if (candidate?.licenseExpiration) {
    const exp = new Date(candidate.licenseExpiration);
    const today = new Date();
    const daysUntilExpiry = Math.floor((exp.getTime() - today.getTime()) / 86400000);
    if (daysUntilExpiry < 0) {
      flags.push({
        type: "no_valid_license",
        label: FLAG_LABELS.no_valid_license,
        severity: "high",
        detail: `License expired ${Math.abs(daysUntilExpiry)} day(s) ago on ${exp.toLocaleDateString()}.`,
        field: "licenseExpiration",
        detectedAt: now(),
      });
    } else if (daysUntilExpiry <= 30) {
      flags.push({
        type: "no_valid_license",
        label: FLAG_LABELS.no_valid_license,
        severity: "medium",
        detail: `License expires in ${daysUntilExpiry} day(s) on ${exp.toLocaleDateString()}. Renewal needed before deployment.`,
        field: "licenseExpiration",
        detectedAt: now(),
      });
    }
  }

  // ─── Rule 2: Not Available in Market ─────────────────────────────────────────
  if (application.geoEligible === false) {
    const miles = application.distanceMiles ? Number(application.distanceMiles).toFixed(0) : "Unknown";
    const radius = requisition?.maxGeoRadius ?? 75;
    flags.push({
      type: "not_available_in_market",
      label: FLAG_LABELS.not_available_in_market,
      severity: "medium",
      detail: `Candidate is ${miles} miles from the ${requisition?.market ?? "target"} market, exceeding the ${radius}-mile radius requirement.`,
      field: "geoEligible",
      detectedAt: now(),
    });
  }

  // ─── Rule 3: DUI/DWI History ──────────────────────────────────────────────────
  if (candidate?.mvrDuiDwi === true) {
    flags.push({
      type: "dui_dwi_history",
      label: FLAG_LABELS.dui_dwi_history,
      severity: "high",
      detail: "MVR record indicates a DUI or DWI conviction. Recruiter must verify details and consult compliance before advancing.",
      field: "mvrDuiDwi",
      detectedAt: now(),
    });
  }

  // ─── Rule 4: Recent Major Accident ────────────────────────────────────────────
  if (candidate?.mvrAtFaultAccidents != null && candidate.mvrAtFaultAccidents >= 2) {
    flags.push({
      type: "recent_major_accident",
      label: FLAG_LABELS.recent_major_accident,
      severity: "high",
      detail: `MVR shows ${candidate.mvrAtFaultAccidents} at-fault accident(s). Recruiter review required.`,
      field: "mvrAtFaultAccidents",
      detectedAt: now(),
    });
  } else if (candidate?.mvrViolations3yr != null && candidate.mvrViolations3yr >= 3) {
    flags.push({
      type: "recent_major_accident",
      label: FLAG_LABELS.recent_major_accident,
      severity: "medium",
      detail: `Candidate has ${candidate.mvrViolations3yr} MVR violations in the past 3 years. Recruiter review recommended.`,
      field: "mvrViolations3yr",
      detectedAt: now(),
    });
  }

  // ─── Rule 5: Work Authorization Issue ────────────────────────────────────────
  if (candidate?.authorizedToWork === false) {
    flags.push({
      type: "no_work_authorization",
      label: FLAG_LABELS.no_work_authorization,
      severity: "high",
      detail: "Candidate has indicated they are not authorized to work in the required jurisdiction. Recruiter must verify.",
      field: "authorizedToWork",
      detectedAt: now(),
    });
  }

  // ─── Rule 6: Missing Core Information ─────────────────────────────────────────
  const missingFields: string[] = [];
  if (!candidate?.licenseClass) missingFields.push("license class");
  if (candidate?.yearsExperience == null) missingFields.push("years of experience");
  if (!candidate?.phone && !candidate?.email) missingFields.push("contact info");

  if (missingFields.length >= 2) {
    flags.push({
      type: "missing_core_info",
      label: FLAG_LABELS.missing_core_info,
      severity: "low",
      detail: `Profile is missing: ${missingFields.join(", ")}. Application may be incomplete.`,
      field: "candidateProfile",
      detectedAt: now(),
    });
  }

  // ─── Rule 7: Availability / Hours Concern ─────────────────────────────────────
  // Check internal notes for keywords suggesting availability issues
  if (application.internalNotes) {
    const notes = application.internalNotes.toLowerCase();
    const availabilityKeywords = [
      "not available",
      "won't work weekends",
      "no nights",
      "no early mornings",
      "can't work",
      "cannot work",
      "refuses",
      "unwilling",
      "limited hours",
    ];
    const matched = availabilityKeywords.find((kw) => notes.includes(kw));
    if (matched) {
      flags.push({
        type: "unwilling_required_hours",
        label: FLAG_LABELS.unwilling_required_hours,
        severity: "medium",
        detail: `Internal notes indicate a potential availability conflict: "${matched}" detected. Recruiter should clarify expected schedule.`,
        field: "internalNotes",
        detectedAt: now(),
      });
    }
  }

  return flags;
}

/**
 * Returns flags that have not been overridden by a recruiter.
 */
export function getActiveRedFlags(
  flags: RedFlag[],
  overrides: RedFlagOverride[]
): RedFlag[] {
  const overriddenTypes = new Set(overrides.map((o) => o.flagType));
  return flags.filter((f) => !overriddenTypes.has(f.type));
}

/**
 * Formats detected flags as a plain-text block for AI prompt injection.
 */
export function formatFlagsForPrompt(flags: RedFlag[]): string {
  if (flags.length === 0) return "No red flags detected.";
  return flags
    .map((f) => `• [${f.severity.toUpperCase()}] ${f.label}: ${f.detail}`)
    .join("\n");
}
