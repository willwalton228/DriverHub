import { describe, expect, it } from "vitest";
import { normalizeMoveType } from "./moveType";

describe("normalizeMoveType", () => {
  it.each(["DriverShift", "DriverDash"])("accepts the canonical %s Move Type", (value) => {
    expect(normalizeMoveType(value)).toBe(value);
  });

  it("allows an omitted or blank Move Type", () => {
    expect(normalizeMoveType(undefined)).toBeNull();
    expect(normalizeMoveType(null)).toBeNull();
    expect(normalizeMoveType("   ")).toBeNull();
  });

  it.each(["Delivery", "PICKUP", "driver_shift", "Driver Dash"])(
    "rejects the non-canonical %s value",
    (value) => {
      expect(() => normalizeMoveType(value)).toThrow("Move Type must be DriverShift or DriverDash.");
    },
  );
});