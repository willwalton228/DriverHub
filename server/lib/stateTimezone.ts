/**
 * Maps US state abbreviations to their primary IANA timezone.
 * Used as a last-resort fallback when an account has no timezone explicitly set.
 */
const STATE_TZ: Record<string, string> = {
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
  // Pacific
  CA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  // Mountain
  MT: "America/Denver",
  ID: "America/Denver",
  WY: "America/Denver",
  CO: "America/Denver",
  UT: "America/Denver",
  NM: "America/Denver",
  // Mountain (no DST)
  AZ: "America/Phoenix",
  // Central
  ND: "America/Chicago",
  SD: "America/Chicago",
  NE: "America/Chicago",
  KS: "America/Chicago",
  OK: "America/Chicago",
  TX: "America/Chicago",
  MN: "America/Chicago",
  IA: "America/Chicago",
  MO: "America/Chicago",
  AR: "America/Chicago",
  LA: "America/Chicago",
  WI: "America/Chicago",
  IL: "America/Chicago",
  MS: "America/Chicago",
  AL: "America/Chicago",
  TN: "America/Chicago",
  // Indiana (mostly Eastern)
  IN: "America/Indiana/Indianapolis",
  // Eastern (default for everything else)
  MI: "America/New_York",
  OH: "America/New_York",
  KY: "America/New_York",
  GA: "America/New_York",
  FL: "America/New_York",
  SC: "America/New_York",
  NC: "America/New_York",
  VA: "America/New_York",
  WV: "America/New_York",
  MD: "America/New_York",
  DE: "America/New_York",
  NJ: "America/New_York",
  PA: "America/New_York",
  NY: "America/New_York",
  CT: "America/New_York",
  RI: "America/New_York",
  MA: "America/New_York",
  VT: "America/New_York",
  NH: "America/New_York",
  ME: "America/New_York",
  DC: "America/New_York",
};

/**
 * Returns the IANA timezone for a US state abbreviation.
 * Falls back to America/New_York if the state is unknown.
 */
export function tzForState(state: string | null | undefined): string {
  if (!state) return "America/New_York";
  return STATE_TZ[state.trim().toUpperCase()] ?? "America/New_York";
}

/**
 * Resolves the best available timezone for an account record.
 * Priority: explicit timezone field → state-derived → Eastern fallback.
 */
export function resolveAccountTimezone(account: {
  timezone?: string | null;
  customer_state?: string | null;
  state?: string | null;
}): string {
  if (account.timezone && account.timezone.trim() !== "") {
    return account.timezone;
  }
  const state = account.customer_state ?? account.state ?? null;
  return tzForState(state);
}

/**
 * SQL CASE expression that maps customer_state → IANA timezone.
 * Drop this into a COALESCE as the last resort before a hardcoded value.
 * The column reference `state_col` must be the qualified state column name.
 */
export const STATE_TZ_SQL_CASE = `
  CASE UPPER(COALESCE({state_col}, ''))
    WHEN 'AK' THEN 'America/Anchorage'
    WHEN 'HI' THEN 'Pacific/Honolulu'
    WHEN 'CA' THEN 'America/Los_Angeles'
    WHEN 'OR' THEN 'America/Los_Angeles'
    WHEN 'WA' THEN 'America/Los_Angeles'
    WHEN 'NV' THEN 'America/Los_Angeles'
    WHEN 'MT' THEN 'America/Denver'
    WHEN 'ID' THEN 'America/Denver'
    WHEN 'WY' THEN 'America/Denver'
    WHEN 'CO' THEN 'America/Denver'
    WHEN 'UT' THEN 'America/Denver'
    WHEN 'NM' THEN 'America/Denver'
    WHEN 'AZ' THEN 'America/Phoenix'
    WHEN 'ND' THEN 'America/Chicago'
    WHEN 'SD' THEN 'America/Chicago'
    WHEN 'NE' THEN 'America/Chicago'
    WHEN 'KS' THEN 'America/Chicago'
    WHEN 'OK' THEN 'America/Chicago'
    WHEN 'TX' THEN 'America/Chicago'
    WHEN 'MN' THEN 'America/Chicago'
    WHEN 'IA' THEN 'America/Chicago'
    WHEN 'MO' THEN 'America/Chicago'
    WHEN 'AR' THEN 'America/Chicago'
    WHEN 'LA' THEN 'America/Chicago'
    WHEN 'WI' THEN 'America/Chicago'
    WHEN 'IL' THEN 'America/Chicago'
    WHEN 'MS' THEN 'America/Chicago'
    WHEN 'AL' THEN 'America/Chicago'
    WHEN 'TN' THEN 'America/Chicago'
    WHEN 'IN' THEN 'America/Indiana/Indianapolis'
    ELSE 'America/New_York'
  END
`.trim();
