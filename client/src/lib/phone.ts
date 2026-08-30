/**
 * DriverHub 360 — Canonical Phone Utilities
 *
 * Single source of truth for all phone number logic across the platform.
 *
 * Storage convention:  raw 10 digits  (e.g. "3336442398")
 * Display convention:  (XXX) XXX-XXXX
 *
 * Named exports follow the shared-UI spec:
 *   cleanPhone    — strip to digits, truncate to 10 (use before any DB write)
 *   formatPhone   — render (XXX) XXX-XXXX from any input, null-safe
 *   validatePhone — return an error string or null
 *
 * Additional helpers:
 *   formatPhoneInput — progressive formatter for live <input> onChange handlers
 *
 * Backward-compat aliases (existing callers continue to work unchanged):
 *   sanitizePhone   → cleanPhone
 *   formatPhoneNumber → formatPhone
 */

/**
 * Strips all non-numeric characters and truncates to 10 digits.
 * Use this before saving to the database.
 *
 * @example cleanPhone("(333) 644-2398") → "3336442398"
 * @example cleanPhone("") → ""
 */
export function cleanPhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "").slice(0, 10);
}

/**
 * Formats any phone value as (XXX) XXX-XXXX.
 * Accepts stored 10-digit strings, already-formatted strings, or nullish values.
 * Handles legacy 11-digit strings with a leading "1".
 * Falls back to the raw value for partial/legacy data to avoid breaking UI.
 *
 * @example formatPhone("3336442398") → "(333) 644-2398"
 * @example formatPhone("(333) 644-2398") → "(333) 644-2398"
 * @example formatPhone(null) → ""
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/**
 * Live input formatter — progressively applies (XXX) XXX-XXXX formatting
 * as the user types. Accepts any raw or already-formatted string.
 *
 * Use this in onChange handlers: field.onChange(formatPhoneInput(e.target.value))
 *
 * @example formatPhoneInput("333") → "333"
 * @example formatPhoneInput("333644") → "(333) 644"
 * @example formatPhoneInput("3336442398") → "(333) 644-2398"
 */
export function formatPhoneInput(value: string): string {
  const digits = cleanPhone(value);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Validates a phone number (after sanitization).
 * Returns an error message string if invalid, or null if valid.
 * An empty/null value is considered valid — use a separate required-field check.
 *
 * @example validatePhone("3336442398") → null
 * @example validatePhone("123") → "Phone number must be 10 digits"
 * @example validatePhone("") → null
 */
export function validatePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = cleanPhone(value);
  if (digits.length !== 10) return "Phone number must be 10 digits";
  return null;
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases
// All existing imports from @/lib/utils continue to work without any changes.
// ---------------------------------------------------------------------------

/** @alias cleanPhone */
export const sanitizePhone = cleanPhone;

/** @alias formatPhone */
export const formatPhoneNumber = formatPhone;
