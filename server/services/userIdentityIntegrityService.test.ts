import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: { insert: vi.fn() },
  pool: { query: vi.fn() },
}));

import {
  findBlankIdentityUsers,
  isActiveHumanUser,
  prepareIdentityUpdate,
} from "./userIdentityIntegrityService";

const activeHuman = {
  id: "human-1",
  email: "human@example.com",
  firstName: "JoAnna",
  lastName: "Holmes",
  role: "corporate_admin",
  status: "ACTIVE",
} as const;

describe("user identity integrity", () => {
  it("preserves existing names when OIDC claims are sparse or blank", () => {
    const decision = prepareIdentityUpdate(activeHuman, {
      firstName: undefined,
      lastName: " ",
    }, { source: "replit_oidc_login" });

    expect(decision.patch).toEqual({});
    expect(decision.audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "firstName", action: "clear_blocked", oldValue: "JoAnna" }),
      expect.objectContaining({ field: "lastName", action: "clear_blocked", oldValue: "Holmes" }),
    ]));
  });

  it("allows valid partial human identity updates without touching the other name", () => {
    const decision = prepareIdentityUpdate(activeHuman, {
      firstName: " Joanna ",
    }, { source: "admin_profile_update" });

    expect(decision.patch).toEqual({ firstName: "Joanna" });
    expect(decision.audits).toEqual([
      expect.objectContaining({
        field: "firstName",
        action: "changed",
        oldValue: "JoAnna",
        newValue: "Joanna",
      }),
    ]);
  });

  it("does not apply active-human protections to integration accounts", () => {
    expect(isActiveHumanUser({ role: "integration_user", status: "ACTIVE" })).toBe(false);
    const decision = prepareIdentityUpdate({
      ...activeHuman,
      role: "integration_user",
    }, {
      firstName: null,
      lastName: null,
    }, { source: "integration_sync" });

    expect(decision.patch).toEqual({ firstName: null, lastName: null });
  });

  it("identifies active corporate users with incomplete identity", () => {
    const findings = findBlankIdentityUsers([
      { id: "ok", email: "ok@example.com", role: "corporate_admin", first_name: "A", last_name: "User" },
      { id: "missing-last", email: "missing@example.com", role: "corporate_admin", first_name: "A", last_name: " " },
      { id: "missing-both", email: "both@example.com", role: "admin", first_name: null, last_name: null },
    ]);

    expect(findings).toEqual([
      { id: "missing-last", email: "missing@example.com", role: "corporate_admin", missingFields: ["lastName"] },
      { id: "missing-both", email: "both@example.com", role: "admin", missingFields: ["firstName", "lastName"] },
    ]);
  });
});