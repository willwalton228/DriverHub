/**
 * Driver → Employee Sync Service
 *
 * Business Rule:
 *   - Drivers with driverClassification = 'Employee' are the source of truth for their linked Employee record.
 *   - When a driver-employee is saved, shared fields are pushed from Driver → Employee.
 *   - Synced fields on the Employee record are read-only (enforced in the PATCH guard).
 *   - Non-driver employees remain their own source of truth.
 *
 * Spec compliance:
 *   - One-way sync only: Driver → Employee
 *   - Duplicate prevention: search by drivers.employeeId, then by employees.driverId before creating
 *   - Audit: every sync operation writes an entry to driver_employee_sync_log
 *   - Diff: only changed fields are recorded in the audit log
 */

import { db } from "../db";
import { drivers, employees, users, driverEmployeeSyncLog } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { seedOnboardingChecklist } from "./employeeOnboardingService";

/** Fields on the Employee record that are owned by the Driver when linked. */
export const DRIVER_SYNCED_EMPLOYEE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "address",
  "city",
  "state",
  "zipCode",
  "hireDate",
  "reactivationDate",
  "termDate",
  "termReason",
  "eligibleForRehire",
  "employmentType",
  "status",
  "department",
  "directManagerId",
] as const;

export type DriverSyncedField = (typeof DRIVER_SYNCED_EMPLOYEE_FIELDS)[number];

export interface SyncResult {
  created: boolean;
  employeeId: string;
  updatedFields: string[];
  syncLogId: string;
}

/** Derive Employee status from Driver status. */
function mapDriverStatusToEmployee(driverStatus: string | null | undefined): string {
  const s = (driverStatus || "active").toLowerCase();
  if (s === "terminated") return "terminated";
  if (s === "inactive" || s === "suspended") return "inactive";
  return "active";
}

/** Build the Employee field payload from a driver + its user record. */
function buildEmployeePayload(
  driver: Record<string, any>,
  driverUser: Record<string, any>
): Record<string, any> {
  return {
    firstName: driverUser.firstName || "",
    lastName: driverUser.lastName || "",
    email: driverUser.email || "",
    phoneNumber: driver.phoneNumber || null,
    address: driver.address || null,
    city: driver.city || null,
    state: driver.state || null,
    zipCode: driver.zipCode || null,
    hireDate: driver.hireDate || null,
    reactivationDate: driver.reactivationDate || null,
    termDate: driver.terminationDate || null,
    termReason: driver.terminationReason || null,
    eligibleForRehire: driver.terminationEligibleForRehire || null,
    employmentType: driver.employmentType || null,
    status: mapDriverStatusToEmployee(driver.status),
    department: driver.market || null,
    directManagerId: driver.directManagerId || null,
    driverId: driver.id,
    sourceOfTruth: "driver",
    driverSyncedAt: new Date(),
  };
}

/**
 * Compare new payload against existing employee record.
 * Returns { changedFields, fieldDiff } for audit logging.
 * Meta fields (driverId, sourceOfTruth, driverSyncedAt) are excluded from diff.
 */
function computeDiff(
  existing: Record<string, any>,
  payload: Record<string, any>
): { changedFields: string[]; fieldDiff: Record<string, { from: any; to: any }> } {
  const META_FIELDS = new Set(["driverId", "sourceOfTruth", "driverSyncedAt"]);
  const changedFields: string[] = [];
  const fieldDiff: Record<string, { from: any; to: any }> = {};

  for (const key of Object.keys(payload)) {
    if (META_FIELDS.has(key)) continue;

    const oldVal = existing[key] ?? null;
    const newVal = payload[key] ?? null;

    const normalise = (v: any): string =>
      v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

    if (normalise(oldVal) !== normalise(newVal)) {
      changedFields.push(key);
      fieldDiff[key] = { from: oldVal, to: newVal };
    }
  }

  return { changedFields, fieldDiff };
}

/** Write one entry to driver_employee_sync_log. */
async function writeSyncLog(entry: {
  driverId: string;
  employeeId: string;
  operation: "created" | "updated";
  triggeredBy: "auto" | "manual";
  triggeredByUserId?: string | null;
  changedFields: string[];
  fieldDiff: Record<string, { from: any; to: any }>;
}): Promise<string> {
  const [row] = await db
    .insert(driverEmployeeSyncLog)
    .values({
      driverId: entry.driverId,
      employeeId: entry.employeeId,
      source: "driver",
      operation: entry.operation,
      triggeredBy: entry.triggeredBy,
      triggeredByUserId: entry.triggeredByUserId ?? null,
      changedFields: entry.changedFields as any,
      fieldDiff: entry.fieldDiff as any,
      syncedAt: new Date(),
    })
    .returning({ id: driverEmployeeSyncLog.id });

  return (row as any).id;
}

/**
 * Create or update the linked Employee record for a driver-employee.
 *
 * Resolution order:
 *   1. drivers.employeeId → look up employee by that ID
 *   2. employees.driverId → find any employee linked to this driver
 *   3. Create a new employee record
 *
 * Always writes drivers.employeeId back when a new record is created.
 * Always writes an audit entry to driver_employee_sync_log.
 */
export async function syncEmployeeFromDriver(
  driverId: string,
  options: { triggeredBy?: "auto" | "manual"; triggeredByUserId?: string } = {}
): Promise<SyncResult> {
  const { triggeredBy = "auto", triggeredByUserId } = options;

  const driverRows = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, driverId), eq(drivers.isDeleted, false)))
    .limit(1);

  if (!driverRows.length) {
    throw new Error(`Driver ${driverId} not found`);
  }

  const driver = driverRows[0] as Record<string, any>;

  if (driver.driverClassification !== "Employee") {
    throw new Error(`Driver ${driverId} is not classified as Employee — sync not applicable`);
  }

  // Load the driver's user record for name + email
  const userRows = driver.userId
    ? await db.select().from(users).where(eq(users.id, driver.userId)).limit(1)
    : [];
  const driverUser = (userRows[0] as Record<string, any>) || {};

  const payload = buildEmployeePayload(driver, driverUser);

  // ── 1. Try to find by drivers.employeeId (existing direct link) ──────────
  let existingEmployee: Record<string, any> | undefined;

  if (driver.employeeId) {
    const rows = await db
      .select()
      .from(employees)
      .where(eq(employees.id, driver.employeeId))
      .limit(1);
    if (rows.length) existingEmployee = rows[0] as Record<string, any>;
  }

  // ── 2. Fall back: search by employees.driverId ───────────────────────────
  if (!existingEmployee) {
    const rows = await db
      .select()
      .from(employees)
      .where(eq(employees.driverId as any, driverId))
      .limit(1);
    if (rows.length) existingEmployee = rows[0] as Record<string, any>;
  }

  // ── 3a. UPDATE existing employee ─────────────────────────────────────────
  if (existingEmployee) {
    const { changedFields, fieldDiff } = computeDiff(existingEmployee, payload);

    await db
      .update(employees)
      .set({ ...payload, updatedAt: new Date() } as any)
      .where(eq(employees.id, existingEmployee.id));

    // Ensure drivers.employeeId is set
    if (driver.employeeId !== existingEmployee.id) {
      await db
        .update(drivers)
        .set({ employeeId: existingEmployee.id } as any)
        .where(eq(drivers.id, driverId));
    }

    const syncLogId = await writeSyncLog({
      driverId,
      employeeId: existingEmployee.id,
      operation: "updated",
      triggeredBy,
      triggeredByUserId,
      changedFields,
      fieldDiff,
    });

    return { created: false, employeeId: existingEmployee.id, updatedFields: changedFields, syncLogId };
  }

  // ── 3b. CREATE new employee record ───────────────────────────────────────
  const nextId = await storage.getNextEmployeeId();
  const [newEmployee] = await db
    .insert(employees)
    .values({
      ...payload,
      employeeId: nextId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    } as any)
    .returning();

  // Write back link on Driver
  await db
    .update(drivers)
    .set({ employeeId: (newEmployee as any).id } as any)
    .where(eq(drivers.id, driverId));

  // On creation, all payload fields are "new"
  const META_FIELDS = new Set(["driverId", "sourceOfTruth", "driverSyncedAt"]);
  const allFields = Object.keys(payload).filter((k) => !META_FIELDS.has(k));
  const fieldDiff: Record<string, { from: any; to: any }> = {};
  for (const f of allFields) {
    fieldDiff[f] = { from: null, to: payload[f] };
  }

  const syncLogId = await writeSyncLog({
    driverId,
    employeeId: (newEmployee as any).id,
    operation: "created",
    triggeredBy,
    triggeredByUserId,
    changedFields: allFields,
    fieldDiff,
  });

  // Seed the onboarding checklist for new driver-employees (non-blocking)
  seedOnboardingChecklist((newEmployee as any).id, {
    isDriverEmployee: true,
    triggeredByUserId,
  }).catch((err) => {
    console.error("[DriverEmployeeSync] Failed to seed onboarding checklist:", err);
  });

  return { created: true, employeeId: (newEmployee as any).id, updatedFields: allFields, syncLogId };
}

/**
 * Check whether a given set of fields includes any Driver-owned synced fields.
 * Used by the Employee PATCH guard.
 */
export function hasSyncedFields(fieldNames: string[]): boolean {
  return fieldNames.some((f) =>
    (DRIVER_SYNCED_EMPLOYEE_FIELDS as readonly string[]).includes(f)
  );
}
