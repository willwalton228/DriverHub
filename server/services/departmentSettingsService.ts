// Department Business Configuration — resolves the "effective" operational
// settings for a department by merging its own overrides with the parent
// Account's defaults. Exposed for reuse by any platform module (scheduling,
// billing, spend controls, etc.) that needs a department's resolved settings.

export interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
}

export type BusinessHours = Record<string, DayHours>;

export interface HolidayEntry {
  name: string;
  date: string; // ISO date (YYYY-MM-DD)
  isPaid?: boolean;
}

export interface DepartmentSettingsSource {
  timezone: string | null;
  businessHours: string | null; // raw JSON text
  useAccountHolidayCalendar: boolean;
  customHolidays: HolidayEntry[] | null;
  costCenter: string | null;
  glCode: string | null;
  defaultPromiseModel: string | null;
  spendApprovalThreshold: string | number | null;
}

export interface AccountSettingsSource {
  timezone: string | null;
  operatingHours: string | null; // raw JSON text
}

export interface EffectiveDepartmentSettings {
  departmentId: string;
  accountId: string;
  timezone: { value: string; inherited: boolean };
  businessHours: { value: BusinessHours; inherited: boolean };
  holidayCalendar: {
    source: "account" | "custom";
    holidays: HolidayEntry[];
  };
  costCenter: string | null;
  glCode: string | null;
  defaultPromiseModel: string | null; // Future
  spendApprovalThreshold: number | null; // Future
}

const DEFAULT_TIMEZONE = "America/Chicago";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function defaultBusinessHours(): BusinessHours {
  const hours: BusinessHours = {};
  DAYS_OF_WEEK.forEach((day) => {
    hours[day] = { enabled: day !== "saturday" && day !== "sunday", start: "08:00", end: "17:00" };
  });
  return hours;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Merge a department's business-configuration overrides with its parent
 * Account's defaults, per the "inherit unless overridden" rule:
 * - timezone / businessHours: department value wins when set, else falls back to the account.
 * - holidayCalendar: uses the department's custom list only when useAccountHolidayCalendar = false;
 *   otherwise the caller is expected to combine the returned "account" source with the global
 *   company holiday calendar (company_holidays table).
 */
export function resolveDepartmentSettings(
  departmentId: string,
  accountId: string,
  department: DepartmentSettingsSource,
  account: AccountSettingsSource,
): EffectiveDepartmentSettings {
  const accountTimezone = account.timezone || DEFAULT_TIMEZONE;
  const timezoneInherited = !department.timezone;
  const timezone = department.timezone || accountTimezone;

  const accountHours = parseJson<BusinessHours>(account.operatingHours, defaultBusinessHours());
  const businessHoursInherited = !department.businessHours;
  const businessHours = businessHoursInherited
    ? accountHours
    : parseJson<BusinessHours>(department.businessHours, accountHours);

  const holidayCalendar: EffectiveDepartmentSettings["holidayCalendar"] = department.useAccountHolidayCalendar
    ? { source: "account", holidays: [] }
    : { source: "custom", holidays: department.customHolidays ?? [] };

  const spendApprovalThreshold =
    department.spendApprovalThreshold === null || department.spendApprovalThreshold === undefined
      ? null
      : Number(department.spendApprovalThreshold);

  return {
    departmentId,
    accountId,
    timezone: { value: timezone, inherited: timezoneInherited },
    businessHours: { value: businessHours, inherited: businessHoursInherited },
    holidayCalendar,
    costCenter: department.costCenter ?? null,
    glCode: department.glCode ?? null,
    defaultPromiseModel: department.defaultPromiseModel ?? null,
    spendApprovalThreshold,
  };
}
