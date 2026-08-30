import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { encryptSsnOrEin } from "../driverEncryption";
import {
  DRIVER_FULL_SSN_AUDIT_EVENT,
  withExplicitFullDriverSsnAccess,
} from "./driverSsnAccess";
import {
  createDriverSsnRevealHandler,
  type DriverSsnRevealDependencies,
} from "./driverSsnReveal";

const USER_ID = "user-1";
const DRIVER_ID = "driver-1";
const PLAINTEXT_SSN = "123-45-6789";

type TestState = {
  actionPermissions: Record<string, boolean>;
  userStatus?: string;
  driverScope?: {
    driverOrgId: string | null;
    hasAuthorizedAccountAssociation: boolean;
  };
  failAudit: boolean;
  audits: Array<Record<string, unknown>>;
};

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

function buildDependencies(state: TestState): DriverSsnRevealDependencies {
  return {
    getUser: async () => ({
      id: USER_ID,
      email: "security@example.com",
      role: "corporate",
      status: state.userStatus ?? "ACTIVE",
      orgId: "org-1",
      actionPermissions: state.actionPermissions,
    }),
    getDriverScope: async () => ({
      id: DRIVER_ID,
      ...state.driverScope,
    }),
    getEncryptedDriver: async () => ({
      id: DRIVER_ID,
      ssnOrEinEncrypted: encryptSsnOrEin(PLAINTEXT_SSN),
    }),
    recordAudit: async (entry) => {
      if (state.failAudit) {
        throw new Error("audit unavailable");
      }
      state.audits.push(entry);
    },
  };
}

async function openRevealEndpoint(state: TestState): Promise<string> {
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { claims: { sub: USER_ID } };
    next();
  });
  app.post(
    "/api/corporate/drivers/:id/ssn/reveal",
    createDriverSsnRevealHandler(buildDependencies(state)),
  );

  const server = app.listen(0);
  openServers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not open a TCP address");
  }
  return `http://127.0.0.1:${address.port}/api/corporate/drivers/${DRIVER_ID}/ssn/reveal`;
}

describe("Driver SSN reveal HTTP boundary", () => {
  it("denies a user without the explicit grant", async () => {
    const state: TestState = {
      actionPermissions: {},
      failAudit: false,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    const response = await fetch(endpoint, { method: "POST" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("View Full SSN"),
    });
    expect(state.audits).toHaveLength(0);
  });

  it("reveals after granting, then denies on the next request after revocation", async () => {
    const state: TestState = {
      actionPermissions: withExplicitFullDriverSsnAccess({}, true),
      failAudit: false,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    const grantedResponse = await fetch(endpoint, { method: "POST" });
    expect(grantedResponse.status).toBe(200);
    expect(await grantedResponse.json()).toEqual({ value: PLAINTEXT_SSN });
    expect(state.audits).toHaveLength(1);

    state.actionPermissions = withExplicitFullDriverSsnAccess(
      state.actionPermissions,
      false,
    );
    const revokedResponse = await fetch(endpoint, { method: "POST" });

    expect(revokedResponse.status).toBe(403);
    expect(state.audits).toHaveLength(1);
  });

  it("reveals for an explicitly authorized corporate user regardless of driver account or organization assignment", async () => {
    const state: TestState = {
      actionPermissions: withExplicitFullDriverSsnAccess({}, true),
      driverScope: {
        driverOrgId: "another-org",
        hasAuthorizedAccountAssociation: false,
      },
      failAudit: false,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    const response = await fetch(endpoint, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ value: PLAINTEXT_SSN });
    expect(state.audits).toHaveLength(1);
  });

  it("denies a suspended account even when its explicit grant remains set", async () => {
    const state: TestState = {
      actionPermissions: withExplicitFullDriverSsnAccess({}, true),
      userStatus: "SUSPENDED",
      failAudit: false,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    const response = await fetch(endpoint, { method: "POST" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("View Full SSN"),
    });
    expect(state.audits).toHaveLength(0);
  });

  it("refuses to reveal when the audit write fails", async () => {
    const state: TestState = {
      actionPermissions: withExplicitFullDriverSsnAccess({}, true),
      failAudit: true,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    const response = await fetch(endpoint, { method: "POST" });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(PLAINTEXT_SSN);
    expect(state.audits).toHaveLength(0);
  });

  it("records the event type and metadata without the sensitive value", async () => {
    const state: TestState = {
      actionPermissions: withExplicitFullDriverSsnAccess({}, true),
      failAudit: false,
      audits: [],
    };
    const endpoint = await openRevealEndpoint(state);

    await fetch(endpoint, { method: "POST" });

    expect(state.audits[0]).toMatchObject({
      eventType: DRIVER_FULL_SSN_AUDIT_EVENT,
      metadata: {
        action: "Full SSN Viewed",
        field: "ssn_or_ein",
      },
    });
    expect(JSON.stringify(state.audits[0])).not.toContain(PLAINTEXT_SSN);
  });
});