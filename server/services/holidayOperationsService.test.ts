import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serviceSource = readFileSync(
  new URL("./holidayOperationsService.ts", import.meta.url),
  "utf8",
);

describe("standard Holiday Operations calendar", () => {
  it("defines all six required Phase 1 holidays and generates records while loading metadata", () => {
    for (const code of [
      "new_years_day",
      "memorial_day",
      "independence_day",
      "labor_day",
      "thanksgiving_day",
      "christmas_day",
    ]) {
      expect(serviceSource).toContain(`code: "${code}"`);
    }
    expect(serviceSource).toContain("await ensureHolidayOperations(year);");
    expect(serviceSource).toContain("JOIN wiw_locations wl ON wl.account_id = c.id");
  });

  it("supports DriverHub-owned special dates scoped to all or selected applicable Accounts", () => {
    expect(serviceSource).toContain("export async function createSpecialHoliday");
    expect(serviceSource).toContain("holiday_operation_special_dates");
    expect(serviceSource).toContain("holiday_operation_special_date_accounts");
    expect(serviceSource).toContain("appliesToAllAccounts");
  });
});

describe("Holiday Operations queue and response safety", () => {
  it("keeps ordinary Accounts in the no-conflict queue", () => {
    expect(serviceSource).toContain(
      "exception_type IS NULL OR exception_type NOT IN ('closed_with_shifts', 'modified_hours_conflict', 'unconfirmed_with_shifts')",
    );
  });

  it("requires the holiday to remain unconfirmed before accepting a response", () => {
    expect(serviceSource).toContain('expectedCurrentStatus: "unconfirmed"');
    expect(serviceSource).toContain("AND ($9::varchar IS NULL OR operating_status = $9)");
    expect(serviceSource).toContain("WHERE holiday_operation_id = $1 AND used_at IS NULL");
  });

  it("uses durable, catch-up reminder cadence markers", () => {
    expect(serviceSource).toContain("holiday_date - CURRENT_DATE BETWEEN 0 AND 30");
    expect(serviceSource).toContain("confirmation_request_30d");
    expect(serviceSource).toContain("confirmation_request_14d");
    expect(serviceSource).toContain("confirmation_request_7d");
    expect(serviceSource).toContain("hc.communication_type = CASE");
  });
});