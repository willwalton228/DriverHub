import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reminderSource = readFileSync(
  new URL("./services/weekendMondayReminderService.ts", import.meta.url),
  "utf8",
);
const communicationsSource = readFileSync(
  new URL("./services/communicationsService.ts", import.meta.url),
  "utf8",
);

describe("Weekend Monday reminder privacy contract", () => {
  it("uses the reports mailbox and one private recipient per driver cycle", () => {
    expect(reminderSource).toContain(
      'const REPORTS_EMAIL = "reports@driverondemand.co";',
    );
    expect(reminderSource).toContain("to: [firstShift.driver_email]");
    expect(reminderSource).toContain("driverIds: [firstShift.driver_id]");
    expect(reminderSource).not.toContain("groupSignature: \"dispatch\"");
  });

  it("consolidates each driver's shifts with persistent driver-cycle idempotency", () => {
    expect(reminderSource).toContain("SELECT DISTINCT ON (s.id)");
    expect(reminderSource).toContain("d.driver_type      = 'DriverShift'");
    expect(reminderSource).toContain("d.status = 'active'");
    expect(reminderSource).toContain("async function claimReminderDelivery");
    expect(reminderSource).toContain("weekend_monday_driver_deliveries");
    expect(reminderSource).toContain("monday_date");
    expect(reminderSource).toContain("async function sendReminderForDriver");
    expect(reminderSource).toContain("shiftsByDriver");
    expect(reminderSource).toContain("weekend_monday_reminder_attempts");
  });

  it("uses the canonical WIW schedule source", () => {
    expect(reminderSource).toContain("FROM wiw_shifts s");
    expect(reminderSource).toContain("JOIN wiw_users  wu ON wu.id = s.wiw_user_id");
    expect(reminderSource).toContain("LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id");
    expect(reminderSource).toContain("AS source_start_time");
    expect(reminderSource).toContain("fmtTime(s.start_time, s.source_start_time, s.scheduling_timezone)");
  });

  it("uses validated WIW/account scheduling timezones instead of a global Central run", () => {
    expect(reminderSource).toContain("async function getSchedulingTimezones");
    expect(reminderSource).toContain("COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, ''))");
    expect(reminderSource).toContain("zonesReadyForSaturdayTwoPm");
    expect(reminderSource).not.toContain("AT TIME ZONE 'America/Chicago'");
  });

  it("records automated SMS sends without a fake system user ID", () => {
    expect(reminderSource).toContain("sentByUserId: null");
    expect(communicationsSource).toContain("sentByUserId:   string | null");
  });

  it("keeps each authorized UAT send in its own audit record", () => {
    expect(reminderSource).toContain("WHERE id = (");
    expect(reminderSource).toContain("ORDER BY created_at DESC");
    expect(reminderSource).toContain("allowResend");
  });

  it("uses only the approved Dispatch signature in SMS text", () => {
    const smsBuilder = reminderSource.slice(
      reminderSource.indexOf("function buildSmsBody"),
      reminderSource.indexOf("function buildEmailHtml"),
    );
    expect(smsBuilder).not.toContain("Driver on Demand Dispatch");
    expect(smsBuilder).not.toContain("Luis Valdez");
    expect(smsBuilder).not.toContain("COO");
    expect(smsBuilder).toContain('lines.push(`Thank you,`)');
    expect(smsBuilder).toContain('lines.push("");');
  });
});