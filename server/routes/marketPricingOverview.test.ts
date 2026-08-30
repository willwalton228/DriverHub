import { describe, expect, it } from "vitest";
import {
  calculateConfiguredMargin,
  canViewMarketPricingOverview,
} from "./marketPricingOverview";

describe("Market Pricing Overview access", () => {
  it.each(["corporate_admin", "super_admin", "root_super_admin", "super_user"])(
    "allows supported corporate pricing viewer role %s",
    (role) => expect(canViewMarketPricingOverview({ role })).toBe(true),
  );

  it.each(["finance", "admin", "dispatcher", "driver", "customer", ""])(
    "does not expand overview access to %s",
    (role) => expect(canViewMarketPricingOverview({ role })).toBe(false),
  );

  it("allows an explicit corporate-access administrator", () => {
    expect(canViewMarketPricingOverview({ role: "admin", corporateAccessAdmin: true })).toBe(true);
  });
});

describe("Market Pricing Overview configured margin", () => {
  it("uses the established revenue-minus-cost margin calculation", () => {
    expect(calculateConfiguredMargin("125.00", "80.00")).toEqual({
      dollars: "45.00",
      percentage: "0.3600",
    });
  });

  it("does not invent a margin when a required source is unavailable", () => {
    expect(calculateConfiguredMargin(null, "80.00")).toBeNull();
    expect(calculateConfiguredMargin("125.00", undefined)).toBeNull();
  });

  it("represents a valid zero customer price without dividing by zero", () => {
    expect(calculateConfiguredMargin("0", "0")).toEqual({
      dollars: "0.00",
      percentage: null,
    });
  });
});