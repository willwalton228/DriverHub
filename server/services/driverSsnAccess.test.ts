import { describe, expect, it } from "vitest";
import { decryptSsnOrEin, encryptSsnOrEin } from "../driverEncryption";
import {
  buildDriverSsnViewAuditMetadata,
  DRIVER_FULL_SSN_AUDIT_EVENT,
  hasExplicitFullDriverSsnAccess,
  redactDriverSsnFields,
  withExplicitFullDriverSsnAccess,
} from "./driverSsnAccess";

describe("Driver full SSN access", () => {
  it("does not inherit reveal access from a broad role", () => {
    const superUser = {
      role: "super_user",
      status: "ACTIVE",
      actionPermissions: {},
    };

    expect(hasExplicitFullDriverSsnAccess(superUser)).toBe(false);
  });

  it("requires the explicit grant and blocks disabled or revoked users", () => {
    const grantedUser = {
      role: "corporate",
      status: "ACTIVE",
      actionPermissions: { view_full_driver_ssn: true },
    };

    expect(hasExplicitFullDriverSsnAccess(grantedUser)).toBe(true);
    expect(hasExplicitFullDriverSsnAccess({ ...grantedUser, status: "DISABLED" })).toBe(false);
    expect(hasExplicitFullDriverSsnAccess({
      ...grantedUser,
      actionPermissions: { view_full_driver_ssn: false },
    })).toBe(false);
  });

  it("observes a grant and revocation on the next request", () => {
    const user = {
      role: "corporate",
      status: "ACTIVE",
      actionPermissions: { can_export: true },
    };

    expect(hasExplicitFullDriverSsnAccess(user)).toBe(false);

    user.actionPermissions = withExplicitFullDriverSsnAccess(user.actionPermissions, true);
    expect(hasExplicitFullDriverSsnAccess(user)).toBe(true);

    user.actionPermissions = withExplicitFullDriverSsnAccess(user.actionPermissions, false);
    expect(hasExplicitFullDriverSsnAccess(user)).toBe(false);
    expect(user.actionPermissions.can_export).toBe(true);
  });

  it("redacts full SSN/EIN fields from ordinary Driver responses", () => {
    const response = redactDriverSsnFields({
      id: "driver-1",
      ssnOrEin: "123-45-6789",
      ssnOrEinEncrypted: "ciphertext",
      ssnOrEinLast4: "6789",
    });

    expect(response).not.toHaveProperty("ssnOrEin");
    expect(response).not.toHaveProperty("ssnOrEinEncrypted");
    expect(response.ssnOrEinLast4).toBe("6789");
  });

  it("builds an audit record without the sensitive value", () => {
    const metadata = buildDriverSsnViewAuditMetadata();

    expect(DRIVER_FULL_SSN_AUDIT_EVENT).toBe("driver_full_ssn_viewed");
    expect(metadata).toEqual({
      action: "Full SSN Viewed",
      field: "ssn_or_ein",
    });
    expect(JSON.stringify(metadata)).not.toContain("123-45-6789");
    expect(JSON.stringify(metadata)).not.toContain("ciphertext");
  });

  it("decrypts an encrypted stored value instead of returning ciphertext", () => {
    const plaintext = "123456789";
    const encrypted = encryptSsnOrEin(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(decryptSsnOrEin(encrypted)).toBe(plaintext);
  });
});