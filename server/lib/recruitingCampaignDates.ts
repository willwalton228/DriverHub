export const RECRUITING_BUSINESS_TIME_ZONE = "America/Chicago";

/**
 * Convert an approval instant into the immutable business calendar date used by
 * Recruiting Campaigns. Never derive this with UTC date slicing.
 */
export function approvalTimestampToCampaignDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid Recruiting approval timestamp");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RECRUITING_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");

  if (!year || !month || !day) {
    throw new Error("Unable to derive Recruiting approval business date");
  }
  return `${year}-${month}-${day}`;
}