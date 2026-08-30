const SCHEDULING_FALLBACK_TZ = "America/New_York";

/**
 * All US IANA timezones grouped by region, with labels and DST notes.
 * Used in timezone select dropdowns throughout the scheduling module.
 */
export const US_TIMEZONES: { iana: string; label: string; note?: string }[] = [
  // Eastern
  { iana: "America/New_York",                 label: "Eastern Time (ET/EDT)"        },
  { iana: "America/Detroit",                  label: "Eastern — Michigan"            },
  { iana: "America/Kentucky/Louisville",      label: "Eastern — Kentucky"            },
  // Central
  { iana: "America/Chicago",                  label: "Central Time (CT/CDT)"         },
  // Mountain
  { iana: "America/Denver",                   label: "Mountain Time (MT/MDT)"        },
  { iana: "America/Phoenix",                  label: "Mountain — Arizona (No DST)",  note: "MST year-round" },
  { iana: "America/Boise",                    label: "Mountain — Idaho"              },
  // Pacific
  { iana: "America/Los_Angeles",              label: "Pacific Time (PT/PDT)"         },
  // Non-contiguous
  { iana: "America/Anchorage",                label: "Alaska Time (AKT/AKDT)"       },
  { iana: "America/Adak",                     label: "Hawaii-Aleutian — Aleutians"   },
  { iana: "Pacific/Honolulu",                 label: "Hawaii Time (HST, No DST)"    },
  // Special
  { iana: "America/Indiana/Indianapolis",     label: "Indiana (Eastern, No DST)"    },
  { iana: "America/Indiana/Knox",             label: "Indiana — Knox (Central)"      },
  { iana: "America/Indiana/Winamac",          label: "Indiana — Winamac (Eastern)"   },
];

/**
 * Format an ISO timestamp string as a time string (e.g. "08:30 AM EDT")
 * using the provided IANA timezone. Falls back to Eastern if no timezone given.
 */
export function fmtTimeInTz(
  isoString: string | null | undefined,
  tz?: string | null,
): string {
  if (!isoString) return "—";
  try {
    const dt = new Date(isoString);
    const zone = tz ?? SCHEDULING_FALLBACK_TZ;
    const abbr = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    })
      .formatToParts(dt)
      .find((p) => p.type === "timeZoneName")?.value ?? "";

    const time = dt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: zone,
    });
    return abbr ? `${time} ${abbr}` : time;
  } catch {
    return "—";
  }
}

/**
 * Format an ISO timestamp string as a date + time string.
 * Uses the provided IANA timezone, falls back to Eastern.
 */
export function fmtDateTimeInTz(
  isoString: string | null | undefined,
  tz?: string | null,
): string {
  if (!isoString) return "—";
  try {
    const dt = new Date(isoString);
    const zone = tz ?? SCHEDULING_FALLBACK_TZ;
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: zone,
    });
  } catch {
    return "—";
  }
}

/**
 * Returns a human-readable label for an IANA timezone string,
 * sourced from the US_TIMEZONES list. Falls back to the raw IANA string.
 */
export function tzLabel(iana: string | null | undefined): string {
  if (!iana) return "Not Set";
  return US_TIMEZONES.find((t) => t.iana === iana)?.label ?? iana;
}
