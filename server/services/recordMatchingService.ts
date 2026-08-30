/**
 * recordMatchingService.ts
 *
 * DriverHub Record Matching Standard — Tiered Matching Hierarchy
 *
 * Tier 1 — Hard Identifiers (exact, auto-match allowed):
 *   partner external ID → integration crosswalk ID → email → phone →
 *   employee ID / driver number / openforce ID / payment ID
 *
 * Tier 2 — Conditional Identifiers (require additional signal):
 *   SSN last-4 + name → license number + state → DOB + email/phone
 *
 * Tier 3 — Fallback only (manual review required):
 *   normalized full name → normalized full name + weak signal
 *
 * If no confident match: return NO_MATCH → route to exception review.
 */

import { db } from "../db";
import { drivers, users, employees, integrationCrosswalk } from "../../shared/schema";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { normalizeNameForMatching } from "./nameParsingService";

export type MatchConfidence = "auto" | "manual" | "low" | "none";
export type MatchTier = "hard" | "conditional" | "fallback" | "none";

export interface MatchResult {
  matchedId: string | null;
  confidence: MatchConfidence;
  tier: MatchTier;
  matchedOn: string | null;
  candidateIds?: string[];
  exceptionReason?: string;
}

export interface DriverMatchInput {
  partnerSystem?: string;
  partnerRecordId?: string;
  email?: string;
  phone?: string;
  driverNumber?: string;
  openforceId?: string;
  paymentId?: string;
  employeeId?: string;
  ssnLast4?: string;
  licenseNumber?: string;
  licenseState?: string;
  dob?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
}

export interface EmployeeMatchInput {
  employeeId?: string;
  workEmail?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

export interface ContactMatchInput {
  email?: string;
  phone?: string;
  company?: string;
  firstName?: string;
  lastName?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Driver Matching
// ──────────────────────────────────────────────────────────────────────────────

export async function matchDriver(input: DriverMatchInput): Promise<MatchResult> {
  // Tier 1-a: Crosswalk lookup by partner system + partner record ID
  if (input.partnerSystem && input.partnerRecordId) {
    const [cw] = await db
      .select({ internalRecordId: integrationCrosswalk.internalRecordId })
      .from(integrationCrosswalk)
      .where(
        and(
          eq(integrationCrosswalk.partnerSystem, input.partnerSystem),
          eq(integrationCrosswalk.partnerRecordId, input.partnerRecordId),
          eq(integrationCrosswalk.entityType, "driver"),
        ),
      )
      .limit(1);
    if (cw) {
      return { matchedId: cw.internalRecordId, confidence: "auto", tier: "hard", matchedOn: "crosswalk" };
    }
  }

  // Tier 1-b: Email
  if (input.email) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const [row] = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(ilike(users.email, normalizedEmail))
      .limit(2);

    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(ilike(users.email, normalizedEmail))
      .limit(2);

    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "auto", tier: "hard", matchedOn: "email" };
    }
    if (rows.length > 1) {
      return {
        matchedId: null,
        confidence: "none",
        tier: "none",
        matchedOn: null,
        candidateIds: rows.map((r) => r.driverId),
        exceptionReason: "MULTIPLE_CANDIDATES",
      };
    }
  }

  // Tier 1-c: Phone
  if (input.phone) {
    const normalized = input.phone.replace(/\D/g, "");
    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .where(
        or(
          eq(sql`regexp_replace(${drivers.phoneNumber}, '[^0-9]', '', 'g')`, normalized),
        ),
      )
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "auto", tier: "hard", matchedOn: "phone" };
    }
  }

  // Tier 1-d: Driver number
  if (input.driverNumber) {
    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .where(eq(drivers.driverNumber, input.driverNumber))
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "auto", tier: "hard", matchedOn: "driver_number" };
    }
  }

  // Tier 1-e: OpenForce ID
  if (input.openforceId) {
    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .where(eq(drivers.openforceId, input.openforceId))
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "auto", tier: "hard", matchedOn: "openforce_id" };
    }
  }

  // Tier 1-f: Payment ID
  if (input.paymentId) {
    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .where(eq(drivers.paymentId, input.paymentId))
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "auto", tier: "hard", matchedOn: "payment_id" };
    }
  }

  // Tier 2-a: License number + license state
  if (input.licenseNumber && input.licenseState) {
    const rows = await db
      .select({ driverId: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.licenseNumber, input.licenseNumber),
          ilike(drivers.licenseState, input.licenseState),
        ),
      )
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].driverId, confidence: "manual", tier: "conditional", matchedOn: "license_number+state" };
    }
  }

  // Tier 3: Normalized full name fallback
  if (input.firstName && input.lastName) {
    const normalizedFirst = normalizeNameForMatching(input.firstName);
    const normalizedLast = normalizeNameForMatching(input.lastName);
    const rows = await db
      .select({ driverId: drivers.id, firstName: users.firstName, lastName: users.lastName })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .limit(500);

    const matches = rows.filter(
      (r) =>
        normalizeNameForMatching(r.firstName || "") === normalizedFirst &&
        normalizeNameForMatching(r.lastName || "") === normalizedLast,
    );

    if (matches.length === 1) {
      return {
        matchedId: matches[0].driverId,
        confidence: "low",
        tier: "fallback",
        matchedOn: "normalized_full_name",
      };
    }
    if (matches.length > 1) {
      return {
        matchedId: null,
        confidence: "none",
        tier: "none",
        matchedOn: null,
        candidateIds: matches.map((r) => r.driverId),
        exceptionReason: "MULTIPLE_CANDIDATES",
      };
    }
  }

  return {
    matchedId: null,
    confidence: "none",
    tier: "none",
    matchedOn: null,
    exceptionReason: "NO_MATCH",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Employee Matching
// ──────────────────────────────────────────────────────────────────────────────

export async function matchEmployee(input: EmployeeMatchInput): Promise<MatchResult> {
  // Tier 1-a: Employee ID
  if (input.employeeId) {
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employeeId, input.employeeId))
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].id, confidence: "auto", tier: "hard", matchedOn: "employee_id" };
    }
  }

  // Tier 1-b: Work email
  if (input.workEmail) {
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(ilike(employees.email, input.workEmail.trim().toLowerCase()))
      .limit(2);
    if (rows.length === 1) {
      return { matchedId: rows[0].id, confidence: "auto", tier: "hard", matchedOn: "work_email" };
    }
    if (rows.length > 1) {
      return {
        matchedId: null, confidence: "none", tier: "none", matchedOn: null,
        candidateIds: rows.map((r) => r.id), exceptionReason: "MULTIPLE_CANDIDATES",
      };
    }
  }

  // Tier 3: Normalized full name fallback
  if (input.firstName && input.lastName) {
    const normFirst = normalizeNameForMatching(input.firstName);
    const normLast = normalizeNameForMatching(input.lastName);
    const rows = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .limit(500);
    const matches = rows.filter(
      (r) =>
        normalizeNameForMatching(r.firstName || "") === normFirst &&
        normalizeNameForMatching(r.lastName || "") === normLast,
    );
    if (matches.length === 1) {
      return { matchedId: matches[0].id, confidence: "low", tier: "fallback", matchedOn: "normalized_full_name" };
    }
  }

  return { matchedId: null, confidence: "none", tier: "none", matchedOn: null, exceptionReason: "NO_MATCH" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Crosswalk Upsert — record a confirmed match for future syncs
// ──────────────────────────────────────────────────────────────────────────────

export async function upsertCrosswalk(params: {
  entityType: "driver" | "employee" | "contact";
  internalRecordId: string;
  partnerSystem: string;
  partnerRecordId?: string;
  sourceFullNameRaw?: string;
  matchedOn: string;
  matchConfidence: MatchConfidence;
}): Promise<void> {
  if (!params.partnerRecordId) return;
  await db
    .insert(integrationCrosswalk)
    .values({
      entityType: params.entityType,
      internalRecordId: params.internalRecordId,
      partnerSystem: params.partnerSystem,
      partnerRecordId: params.partnerRecordId,
      sourceFullNameRaw: params.sourceFullNameRaw,
      matchedOn: params.matchedOn,
      matchConfidence: params.matchConfidence,
      lastSyncAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrationCrosswalk.partnerSystem, integrationCrosswalk.partnerRecordId, integrationCrosswalk.entityType],
      set: {
        internalRecordId: params.internalRecordId,
        matchedOn: params.matchedOn,
        matchConfidence: params.matchConfidence,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      },
    });
}
