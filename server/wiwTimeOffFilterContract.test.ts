import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serviceSource = readFileSync(
  new URL("./services/wiwTimeOffService.ts", import.meta.url),
  "utf8",
);
const reportSource = readFileSync(
  new URL("../client/src/pages/corporate/WiwTimeOffReport.tsx", import.meta.url),
  "utf8",
);
const widgetSource = readFileSync(
  new URL("../client/src/components/scheduling/WiwTimeOffWidget.tsx", import.meta.url),
  "utf8",
);

describe("WIW time-off account and classification filters", () => {
  it("uses the canonical scheduled account relationship rather than the legacy mapping", () => {
    expect(serviceSource).toContain("FROM wiw_shifts ws");
    expect(serviceSource).toContain("JOIN wiw_locations wl ON wl.id = ws.wiw_location_id");
    expect(serviceSource).toContain("JOIN customers c ON c.id = wl.account_id");
    expect(serviceSource).not.toContain("wiw_location_account_map");
  });

  it("sources network and active account choices from DriverHub accounts", () => {
    expect(serviceSource).toContain("SELECT id, customer_name, network");
    expect(serviceSource).toContain("LOWER(COALESCE(status, 'active')) = 'active'");
    expect(serviceSource).toContain("ARRAY_AGG(DISTINCT c.network");
  });

  it("uses one ranked report calculation for the dashboard and full report", () => {
    expect(serviceSource).toContain("const report = await getTimeOffReport");
    expect(serviceSource).toContain('sortBy: "total_approved_days"');
    expect(serviceSource).toContain("COALESCE(dac.networks");
    expect(serviceSource).toContain("COALESCE(dac.account_ids");
  });

  it("provides the required relational controls on both user surfaces", () => {
    for (const source of [reportSource, widgetSource]) {
      expect(source).toContain("MultiSelectFilter");
      expect(source).toContain("All Networks");
      expect(source).toContain("All Accounts");
      expect(source).toContain("Independent Contractor");
    }
    expect(reportSource).toContain("filter-time-off-accounts");
    expect(reportSource).toContain("btn-time-off-clear-filters");
    expect(widgetSource).toContain("reportHref");
    expect(widgetSource).toContain('setPeriod("60d")');
  });
});