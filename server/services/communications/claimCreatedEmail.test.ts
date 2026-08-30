import { describe, expect, it } from "vitest";
import { buildClaimCreatedEmailContext } from "./claimCreatedEmail";

describe("buildClaimCreatedEmailContext", () => {
  it("formats available Claim values for the approved email template", () => {
    const context = buildClaimCreatedEmailContext({
      claimNumber: "22830574",
      driverName: "Taylor Driver",
      incidentDate: "2026-08-21T00:00:00.000Z",
      customerName: "Example Customer",
      location: "Dallas",
      market: "Dallas-Fort Worth",
      claimType: "PROPERTY",
      incidentType: "vehicle_damage",
      resolutionStatus: "under_review",
      severity: "HIGH",
      executionSystem: "move_now_driver_connect",
      estimatedDamageOrProbableCost: "15500",
      actualCost: "0",
      photoCount: 1_267,
      documentCount: 2,
      openItemCount: 3,
      claimUrl: "https://driverhub.example/claims/claim-1",
    });

    expect(context).toMatchObject({
      claimNumber: "22830574",
      incidentDate: "Aug 21, 2026",
      claimType: "Property",
      incidentType: "Vehicle Damage",
      resolutionStatus: "Under Review",
      severity: "High",
      executionSystem: "Move Now Driver Connect",
      estimatedDamageOrProbableCost: "$15,500.00",
      actualCost: "$0.00",
      photoCount: "1,267",
      documentCount: "2",
      openItemCount: "3",
    });
  });

  it("uses an em dash for missing optional values and escapes HTML", () => {
    const context = buildClaimCreatedEmailContext({
      claimNumber: "123",
      driverName: "Ava <Driver>",
      incidentDate: null,
      customerName: null,
      location: null,
      market: null,
      claimType: null,
      incidentType: null,
      resolutionStatus: null,
      severity: null,
      executionSystem: null,
      estimatedDamageOrProbableCost: null,
      actualCost: null,
      photoCount: null,
      documentCount: null,
      openItemCount: null,
      claimUrl: "https://driverhub.example/claims/claim-1?from=email&view=summary",
    });

    expect(context.driverName).toBe("Ava &lt;Driver&gt;");
    expect(context.claimUrl).toContain("&amp;");
    expect(context.incidentDate).toBe("—");
    expect(context.actualCost).toBe("—");
    expect(context.documentCount).toBe("—");
  });
});