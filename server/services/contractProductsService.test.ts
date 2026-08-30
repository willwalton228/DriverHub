import { describe, expect, it } from "vitest";
import { toContractProduct } from "./contractProductsService";

const row = {
  assignmentId: "assignment-1",
  assignmentUpdatedAt: "2026-08-22T12:00:00.000Z",
  priceOverride: "125.00",
  billingRuleOverride: "per_job",
  assignmentStartDate: "2026-01-01",
  assignmentEndDate: null,
  billingMethod: "per_move",
  billingFrequencyOverride: null,
  program: "Driver on Demand",
  productId: "product-1",
  productName: "DriverDash Move",
  productDescription: "On-demand vehicle movement",
  productSku: "DD-MOVE",
  productCategory: "Services",
  serviceCategory: "driverdash",
  operationalDivision: "On-Demand",
  productType: "usage",
  pricingModel: "per_move",
  billingFrequency: "weekly",
  billingTrigger: "next_invoice_cycle",
  unitPrice: "100.00",
  unit: "move",
  currency: "USD",
  productEligibleForDriverDash: true,
  productIsActive: true,
  productMinPrice: "75.00",
  productMaxPrice: "250.00",
  productSuggestedPrice: "125.00",
  productEffectiveDate: "2026-01-01",
  priceBook: "DriverDash 2026",
  productUpdatedAt: "2026-08-22T12:00:00.000Z",
  positionId: "position-1",
  positionName: "Move",
  positionActive: true,
  rateId: "rate-1",
  billRate: "125.00",
  rateType: "regular",
  effectiveDate: "2026-01-01",
  endDate: null,
  billingUnit: "per_move",
  overtimeEligible: false,
};

describe("contract product DTO", () => {
  it("returns account-specific pricing and DriverDash applicability", () => {
    const product = toContractProduct([row], "driverdash");

    expect(product.productId).toBe("product-1");
    expect(product.driverModelApplicability.driverDash).toBe(true);
    expect(product.pricing.accountPriceOverride).toBe(125);
    expect(product.pricing.minimumCharge).toBe(75);
    expect(product.pricing.rates[0]).toMatchObject({
      billRate: 125,
      billingUnit: "per_move",
    });
    expect(product.pricingConfigurationId).toBe("assignment-1");
  });

  it("does not apply a DriverDash product to DriverShift activity", () => {
    const product = toContractProduct([row], "drivershift");

    expect(product.driverModelApplicability.driverDash).toBe(false);
    expect(product.driverModelApplicability.driverShift).toBe(true);
    expect(product.applicableForAccount).toBe(true);
  });
});