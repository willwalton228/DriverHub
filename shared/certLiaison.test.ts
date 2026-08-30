import { describe, expect, it } from "vitest";
import {
  CERTIFIED_BY_VALUES,
  CERT_LIAISON_VALUES,
  DIRECT_MANAGER_VALUES,
} from "./peopleOptions";

describe("Lisa Parkhurst operational identity", () => {
  it("uses Lisa Parkhurst in every current controlled people list", () => {
    expect(CERT_LIAISON_VALUES).toContain("Lisa Parkhurst");
    expect(CERTIFIED_BY_VALUES).toContain("Lisa Parkhurst");
    expect(DIRECT_MANAGER_VALUES).toContain("Lisa Parkhurst");
  });

  it("does not offer the former name as a current selectable value", () => {
    expect(CERT_LIAISON_VALUES).not.toContain("Lisa Wickers");
    expect(CERTIFIED_BY_VALUES).not.toContain("Lisa Wickers");
    expect(DIRECT_MANAGER_VALUES).not.toContain("Lisa Wickers");
  });
});