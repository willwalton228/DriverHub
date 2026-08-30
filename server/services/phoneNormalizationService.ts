/**
 * Phone Normalization Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Ticket 2: Driver Phone Normalization and SMS Validation Readiness
 *
 * Converts raw US phone numbers to E.164 format and determines SMS eligibility.
 * This service is intentionally pure (no DB calls) so it can be called
 * from anywhere: on save, in batch, or from an API endpoint.
 *
 * E.164 format: +1XXXXXXXXXX  (US 10-digit numbers only in this version)
 *
 * Invalid reason codes (exact values stored in sms_invalid_reason column):
 *   missing_phone       — phone field is null / empty
 *   too_short           — fewer than 10 digits after stripping non-numeric chars
 *   too_long            — more than 11 digits
 *   invalid_format      — 10/11 digits but fails NANP NXX structural rules
 *   unrecognized_format — 11 digits not starting with 1 (non-US)
 */

export type SmsInvalidReason =
  | "missing_phone"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "unrecognized_format";

export interface PhoneNormalizationResult {
  /** E.164 representation if valid, null otherwise */
  normalized:    string | null;
  /** Whether the number is structurally valid */
  isValid:       boolean;
  /** Whether the driver can be texted right now */
  smsEligible:   boolean;
  /** Specific reason when ineligible — never a generic value */
  invalidReason: SmsInvalidReason | null;
}

/**
 * Normalise a raw phone string to E.164.
 * Returns null when the number cannot be normalised.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return null; // not a valid US number
}

/**
 * Full validation + normalization pipeline for a single phone string.
 * Returns a structured result suitable for storing on a driver record.
 */
export function validatePhone(raw: string | null | undefined): PhoneNormalizationResult {
  // ── Missing ──────────────────────────────────────────────────────────────
  if (!raw || raw.trim() === "") {
    return { normalized: null, isValid: false, smsEligible: false, invalidReason: "missing_phone" };
  }

  const digits = raw.replace(/\D/g, "");

  // ── Length checks ────────────────────────────────────────────────────────
  if (digits.length < 10) {
    return { normalized: null, isValid: false, smsEligible: false, invalidReason: "too_short" };
  }
  if (digits.length > 11) {
    return { normalized: null, isValid: false, smsEligible: false, invalidReason: "too_long" };
  }

  // ── 11-digit non-US international ────────────────────────────────────────
  if (digits.length === 11 && digits[0] !== "1") {
    return { normalized: null, isValid: false, smsEligible: false, invalidReason: "unrecognized_format" };
  }

  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // ── NANP NXX-NXX-XXXX structural validation ──────────────────────────────
  // Area code and exchange must not start with 0 or 1
  const bare = normalized.slice(2); // strip "+1" → 10 digits
  if (bare[0] === "0" || bare[0] === "1") {
    return { normalized, isValid: false, smsEligible: false, invalidReason: "invalid_format" };
  }
  if (bare[3] === "0" || bare[3] === "1") {
    return { normalized, isValid: false, smsEligible: false, invalidReason: "invalid_format" };
  }

  // ── Valid ────────────────────────────────────────────────────────────────
  return { normalized, isValid: true, smsEligible: true, invalidReason: null };
}

/**
 * Batch-validate a list of drivers and return update patches.
 * Caller is responsible for persisting the results.
 */
export function batchValidatePhones(
  drivers: Array<{ id: string; phoneNumber: string | null | undefined }>,
): Array<{
  id:                    string;
  mobilePhoneNormalized: string | null;
  mobilePhoneIsValid:    boolean;
  smsEligible:           boolean;
  smsInvalidReason:      string | null;
  lastPhoneValidationAt: Date;
}> {
  const now = new Date();
  return drivers.map(d => {
    const result = validatePhone(d.phoneNumber);
    return {
      id:                    d.id,
      mobilePhoneNormalized: result.normalized,
      mobilePhoneIsValid:    result.isValid,
      smsEligible:           result.smsEligible,
      smsInvalidReason:      result.invalidReason,
      lastPhoneValidationAt: now,
    };
  });
}
