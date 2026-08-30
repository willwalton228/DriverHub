import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import {
  calculatePricing,
  canEditSalesPricing,
  canViewSalesPricing,
  multiplyMoney,
  rateApplicationPublishSchema,
  type PricingRules,
} from "./salesPricing";

const rules: PricingRules = {
  shift_multiplier: "1.0000",
  dd_standard_multiplier: "1.2500",
  dd_preferred_multiplier: "1.2000",
  dd_preferred_plus_multiplier: "1.1500",
  preferred_threshold: 50,
  preferred_plus_threshold: 100,
  shift_opportunity_threshold: 125,
  new_account_days: 90,
};

describe("sales pricing authorization", () => {
  it("allows only Will's normalized email to edit, even when another user is super admin", () => {
    expect(canEditSalesPricing({ email: " WILL@DRIVERONDEMAND.CO ", role: "admin" })).toBe(true);
    expect(canEditSalesPricing({ email: "other@driverondemand.co", role: "super_user" })).toBe(false);
  });

  it("allows corporate and super admins to read without granting edit access", () => {
    expect(canViewSalesPricing({ email: "admin@example.com", role: "corporate_admin" })).toBe(true);
    expect(canViewSalesPricing({ email: "super@example.com", role: "super_admin" })).toBe(true);
    expect(canEditSalesPricing({ email: "super@example.com", role: "super_admin" })).toBe(false);
  });
});

describe("sales pricing publication safety", () => {
  it("requires literal explicit confirmation", () => {
    const base = {
      marketRateVersionId: "62a345c9-1305-47eb-bded-dbd2535a5940",
      applicationMode: "new_only",
      selectedAccountIds: [],
    };
    expect(rateApplicationPublishSchema.safeParse(base).success).toBe(false);
    expect(rateApplicationPublishSchema.safeParse({ ...base, explicitlyConfirmed: false }).success).toBe(false);
    expect(rateApplicationPublishSchema.safeParse({ ...base, explicitlyConfirmed: true }).success).toBe(true);
  });

  it("keeps version history effective-dated and excludes production pricing mutations", () => {
    const routeSource = readFileSync(new URL("./salesPricing.ts", import.meta.url), "utf8");
    expect(routeSource).toContain("effective_date <= CURRENT_DATE");
    expect(routeSource).toContain("ORDER BY effective_date DESC, version DESC");
    for (const forbidden of [
      "UPDATE customers",
      "UPDATE account_products",
      "UPDATE account_service_rates",
      "UPDATE products",
      "UPDATE trips",
    ]) {
      expect(routeSource).not.toContain(forbidden);
    }
  });
});

describe("sales pricing calculator", () => {
  it("rounds decimal multiplication half-up to customer cents", () => {
    expect(multiplyMoney("23.7000", "1.2500")).toBe("29.63");
    expect(multiplyMoney("0.0100", "1.5000")).toBe("0.02");
  });

  it("keeps a new DriverDash account Standard through day 89", () => {
    expect(calculatePricing("23.7000", "driverdash", 89, 1000, rules).tier).toBe("Standard");
  });

  it("applies boundaries at 90 days and 50, 100, and 125 moves", () => {
    expect(calculatePricing("23.7000", "driverdash", 90, 49, rules).tier).toBe("Standard");
    expect(calculatePricing("23.7000", "driverdash", 90, 50, rules).tier).toBe("Preferred");
    expect(calculatePricing("23.7000", "driverdash", 90, 100, rules).tier).toBe("Preferred Plus");
    expect(calculatePricing("23.7000", "driverdash", 90, 124, rules).shiftOpportunity).toBe(false);
    expect(calculatePricing("23.7000", "driverdash", 90, 125, rules).shiftOpportunity).toBe(true);
  });

  it("uses the configured 1.00 DriverShift multiplier", () => {
    const result = calculatePricing("23.7000", "drivershift", 0, 0, rules);
    expect(result.hourlyRate).toBe("23.70");
    expect(result.multiplier).toBe("1.0000");
  });
});