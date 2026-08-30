import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../db", () => ({
  pool: { query },
}));

import { RECRUITING_APPROVAL_REQUIRED, RECRUITING_REQUEST_SUBMITTED } from "./notificationEngine/events/recruitingEvents";
import { queryRecruitingApproverIds } from "./notificationEngine/resolvers";

const orgId = "org-recruiting-test";
const context = { orgId, payload: {} };

describe("Recruiting approval settings recipient resolution", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("does not query or select an arbitrary approver without an organization", async () => {
    await expect(queryRecruitingApproverIds(null)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns no recipient when the organization has no saved settings", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(queryRecruitingApproverIds(orgId)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE org_id = $1"),
      [orgId],
    );
  });

  it("uses the configured primary approver outside an active delegation window", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        primary_approver_user_id: "primary-user",
        backup_approver_user_id: "backup-user",
        delegation_enabled: true,
        delegation_start_date: "2999-01-01",
        delegation_end_date: "2999-12-31",
      }],
    });

    await expect(queryRecruitingApproverIds(orgId)).resolves.toEqual(["primary-user"]);
  });

  it("uses the configured backup approver during active delegation", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        primary_approver_user_id: "primary-user",
        backup_approver_user_id: "backup-user",
        delegation_enabled: true,
        delegation_start_date: "2000-01-01",
        delegation_end_date: "2999-12-31",
      }],
    });

    await expect(queryRecruitingApproverIds(orgId)).resolves.toEqual(["backup-user"]);
  });

  it("resolves both Recruiting submission and approval-required events against the organization settings", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          primary_approver_user_id: "primary-user",
          backup_approver_user_id: null,
          delegation_enabled: false,
          delegation_start_date: null,
          delegation_end_date: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          primary_approver_user_id: "primary-user",
          backup_approver_user_id: null,
          delegation_enabled: false,
          delegation_start_date: null,
          delegation_end_date: null,
        }],
      });

    await expect(RECRUITING_REQUEST_SUBMITTED.recipients[2].resolve(context)).resolves.toEqual(["primary-user"]);
    await expect(RECRUITING_APPROVAL_REQUIRED.recipients[0].resolve(context)).resolves.toEqual(["primary-user"]);
  });
});