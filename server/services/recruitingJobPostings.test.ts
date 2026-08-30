import { describe, expect, it } from "vitest";
import { normalizeJobPostingUpdate, normalizeNewJobPosting } from "./recruitingJobPostings";
import { hasRecruitingDiscoveryAccess, hasRecruitingJobPostingWriteAccess, hasRecruitingModuleReadAccess, hasRecruitingRecordAccess, type UserRecruitingContext } from "../recruitingPermissions";
import { toAccountDiscoveryResult, toDriverDiscoveryResult } from "./recruitingDiscovery";

const validPosting = {
  source: "Craigslist",
  postingUrl: "https://post.craigslist.org/manage/example",
  postingStatus: "active",
  postedAt: "2026-08-14",
  expiresAt: "2026-09-14",
  notes: "Renew every 30 days",
};

describe("recruiting job posting payloads", () => {
  it.each(["Craigslist", "Indeed", "Facebook", "LinkedIn", "ZipRecruiter", "Other"])("accepts %s postings", (source) => {
    const sourceName = source === "Other" ? "Local Jobs Board" : undefined;
    expect(normalizeNewJobPosting({ ...validPosting, source, sourceName })).toMatchObject({
      ok: true,
      data: { source, ...(sourceName ? { sourceName } : {}) },
    });
  });

  it("normalizes a blank expiration date to null", () => {
    expect(normalizeNewJobPosting({ ...validPosting, expiresAt: "" })).toEqual({
      ok: true,
      data: { ...validPosting, sourceName: null, expiresAt: null },
    });
  });

  it("requires a source name for Other", () => {
    expect(normalizeNewJobPosting({ ...validPosting, source: "Other" })).toMatchObject({
      ok: false,
      fieldErrors: { sourceName: expect.any(String) },
    });
  });

  it("normalizes an edit that changes URL, expiration, status, and notes", () => {
    expect(normalizeJobPostingUpdate({
      postingUrl: "https://example.com/updated",
      expiresAt: "",
      postingStatus: "paused",
      notes: "Updated notes",
    })).toEqual({
      ok: true,
      data: {
        postingUrl: "https://example.com/updated",
        expiresAt: null,
        postingStatus: "paused",
        notes: "Updated notes",
      },
    });
  });

  it("rejects malformed URLs, dates, and statuses before a database write", () => {
    expect(normalizeNewJobPosting({
      ...validPosting,
      postingUrl: "not a url",
      postedAt: "08/14/2026",
      postingStatus: "Active",
    })).toMatchObject({
      ok: false,
      fieldErrors: {
        postingUrl: expect.any(String),
        postedAt: expect.any(String),
        postingStatus: expect.any(String),
      },
    });
  });

  it("rejects an expiration date before the posting date", () => {
    expect(normalizeNewJobPosting({
      ...validPosting,
      expiresAt: "2026-08-13",
    })).toMatchObject({
      ok: false,
      fieldErrors: { expiresAt: expect.any(String) },
    });
  });

  it("validates date order against unchanged values during an edit", () => {
    expect(normalizeJobPostingUpdate(
      { expiresAt: "2026-08-13" },
      { postedAt: "2026-08-14", expiresAt: "2026-09-14" },
    )).toMatchObject({
      ok: false,
      fieldErrors: { expiresAt: expect.any(String) },
    });
  });
});

describe("recruiting job posting authorization", () => {
  const standardRecruiter: UserRecruitingContext = {
    userId: "recruiter",
    userRole: "recruiter",
    isAdmin: false,
    isSystemUser: false,
    authorizedMarkets: ["Staging Central"],
    permissions: ["read", "write"],
    canExport: false,
    canBulkAction: false,
  };
  const recruitingAdmin: UserRecruitingContext = {
    ...standardRecruiter,
    userId: "recruiting-admin",
    userRole: "recruiting_admin",
    isAdmin: true,
    permissions: ["read", "write", "approve", "export", "admin"],
  };
  const driver: UserRecruitingContext = {
    ...standardRecruiter,
    userId: "driver",
    userRole: "driver",
    authorizedMarkets: [],
    permissions: [],
  };

  it("permits authorized Recruiters and Recruiting Admins to manage postings in scope", () => {
    expect(hasRecruitingRecordAccess(standardRecruiter, "read", "Staging Central")).toBe(true);
    expect(hasRecruitingRecordAccess(standardRecruiter, "write", "Staging Central")).toBe(true);
    expect(hasRecruitingRecordAccess(recruitingAdmin, "read", null)).toBe(true);
    expect(hasRecruitingRecordAccess(recruitingAdmin, "write", "Any Market")).toBe(true);
  });

  it("blocks a driver and prevents cross-market or unscoped posting mutations", () => {
    expect(hasRecruitingRecordAccess(driver, "read", "Staging Central")).toBe(false);
    expect(hasRecruitingRecordAccess(driver, "write", "Staging Central")).toBe(false);
    expect(hasRecruitingRecordAccess(standardRecruiter, "write", "Other Market")).toBe(false);
    expect(hasRecruitingRecordAccess(standardRecruiter, "write", null)).toBe(false);
  });

  it("permits only authorized Recruiters and Recruiting Admins to use read-only discovery", () => {
    expect(hasRecruitingDiscoveryAccess(standardRecruiter)).toBe(true);
    expect(hasRecruitingDiscoveryAccess(recruitingAdmin)).toBe(true);
    expect(hasRecruitingDiscoveryAccess(driver)).toBe(false);
  });

  it("keeps Recruiting module read access with Recruiting users and out of Driver roles", () => {
    expect(hasRecruitingModuleReadAccess(standardRecruiter)).toBe(true);
    expect(hasRecruitingModuleReadAccess(recruitingAdmin)).toBe(true);
    expect(hasRecruitingModuleReadAccess(driver)).toBe(false);
  });

  it("restores Job Posting management for Recruiting roles without weakening unrelated-role access", () => {
    const recruiterWithoutMarketGrant: UserRecruitingContext = {
      ...standardRecruiter,
      authorizedMarkets: [],
      permissions: [],
    };
    expect(hasRecruitingJobPostingWriteAccess(recruiterWithoutMarketGrant)).toBe(true);
    expect(hasRecruitingJobPostingWriteAccess(recruitingAdmin)).toBe(true);
    expect(hasRecruitingJobPostingWriteAccess(driver)).toBe(false);
  });
});

describe("recruiting discovery DTOs", () => {
  it("returns only account selector fields", () => {
    const result = toAccountDiscoveryResult({
      id: "account-1",
      name: "Approved Account",
      status: "active",
      number: "C-100",
      address: "123 Main St",
      city: "Jackson",
      state: "MS",
      zip: "39201",
      dealerId: "D-100",
      network: "DriverDash",
    });

    expect(result).toEqual({
      id: "account-1",
      name: "Approved Account",
      status: "active",
      address: "123 Main St",
      city: "Jackson",
      state: "MS",
      zip: "39201",
      dealerId: "D-100",
      network: "DriverDash",
      hasAddress: true,
    });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("phone");
  });

  it("does not expose driver email, phone, or government identifiers in discovery", () => {
    const result = toDriverDiscoveryResult({
      id: "driver-1",
      status: "active",
      employeeId: "E-100",
      driverClassification: "Employee",
      driverType: "DriverDash",
      employmentType: "Full-Time",
      hireDate: "2026-01-01",
      market: "Staging Central",
      firstName: "Alex",
      lastName: "Driver",
    });

    expect(result).toMatchObject({ id: "driver-1", displayName: "Alex Driver", market: "Staging Central" });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("ssn");
  });
});