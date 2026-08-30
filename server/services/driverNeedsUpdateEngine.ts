import { db } from "../db";
import { drivers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface EvaluationRule {
  field: string;
  label: string;
  source: "driver" | "user";
  check: (value: any) => boolean;
}

const REQUIRED_FIELD_RULES: EvaluationRule[] = [
  { field: "firstName", label: "First Name", source: "user", check: (v) => !v || !v.trim() },
  { field: "lastName", label: "Last Name", source: "user", check: (v) => !v || !v.trim() },
  { field: "phoneNumber", label: "Phone Number", source: "driver", check: (v) => !v || !v.trim() },
  { field: "market", label: "Market", source: "driver", check: (v) => !v || !v.trim() },
  { field: "driverType", label: "Driver Type", source: "driver", check: (v) => !v || !v.trim() },
  { field: "driverClassification", label: "Classification", source: "driver", check: (v) => !v || !v.trim() },
  { field: "hireDate", label: "Hire Date", source: "driver", check: (v) => !v },
  { field: "licenseNumber", label: "License Number", source: "driver", check: (v) => !v || !v.trim() },
  { field: "licenseState", label: "License State", source: "driver", check: (v) => !v || !v.trim() },
  { field: "licenseExpiration", label: "License Expiration", source: "driver", check: (v) => !v },
];

interface ValidationIssue {
  field: string;
  label: string;
  type: "missing" | "invalid";
}

const VALIDITY_RULES: Array<{
  field: string;
  label: string;
  source: "driver";
  validate: (value: any) => string | null;
}> = [
  {
    field: "licenseExpiration",
    label: "License Expiration",
    source: "driver",
    validate: (v) => {
      if (!v) return null;
      const expDate = new Date(v);
      if (isNaN(expDate.getTime())) return "Invalid license expiration date";
      if (expDate < new Date()) return "License is expired";
      return null;
    },
  },
];

export interface EvaluationResult {
  needsUpdate: boolean;
  fields: string[];
  reasons: string[];
}

export function evaluateDriver(
  driverRecord: any,
  userRecord: any
): EvaluationResult {
  const fields: string[] = [];
  const reasons: string[] = [];

  for (const rule of REQUIRED_FIELD_RULES) {
    const source = rule.source === "user" ? userRecord : driverRecord;
    if (rule.check(source?.[rule.field])) {
      fields.push(rule.field);
      reasons.push(`Missing ${rule.label}`);
    }
  }

  for (const rule of VALIDITY_RULES) {
    const value = driverRecord?.[rule.field];
    const issue = rule.validate(value);
    if (issue) {
      if (!fields.includes(rule.field)) fields.push(rule.field);
      reasons.push(issue);
    }
  }

  return {
    needsUpdate: fields.length > 0,
    fields,
    reasons,
  };
}

export async function evaluateSingleDriver(driverId: string): Promise<EvaluationResult> {
  const [row] = await db
    .select({
      driver: drivers,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(eq(drivers.id, driverId));

  if (!row) {
    return { needsUpdate: false, fields: [], reasons: [] };
  }

  if (row.driver.status !== "active") {
    return { needsUpdate: false, fields: [], reasons: [] };
  }

  return evaluateDriver(row.driver, row.user);
}

export async function applyEvaluation(
  driverId: string,
  result: EvaluationResult,
  setBy: string = "system"
): Promise<void> {
  if (result.needsUpdate) {
    await db.update(drivers).set({
      needsUpdate: true,
      needsUpdateReasons: result.reasons,
      needsUpdateFields: result.fields,
      needsUpdateSetAt: new Date(),
      needsUpdateSetBy: setBy,
      updatedAt: new Date(),
    }).where(eq(drivers.id, driverId));
  } else {
    await db.update(drivers).set({
      needsUpdate: false,
      needsUpdateReasons: null,
      needsUpdateFields: null,
      needsUpdateSetAt: null,
      needsUpdateSetBy: null,
      needsUpdateImportBatchId: null,
      updatedAt: new Date(),
    }).where(eq(drivers.id, driverId));
  }
}

export async function evaluateAndApplySingleDriver(
  driverId: string,
  setBy: string = "system"
): Promise<EvaluationResult> {
  const result = await evaluateSingleDriver(driverId);
  await applyEvaluation(driverId, result, setBy);
  return result;
}

export async function evaluateAllActiveDrivers(): Promise<{
  total: number;
  flagged: number;
  cleared: number;
}> {
  const allDrivers = await db
    .select({
      driverId: drivers.id,
      driverStatus: drivers.status,
      phoneNumber: drivers.phoneNumber,
      market: drivers.market,
      driverType: drivers.driverType,
      driverClassification: drivers.driverClassification,
      hireDate: drivers.hireDate,
      licenseNumber: drivers.licenseNumber,
      licenseState: drivers.licenseState,
      licenseExpiration: drivers.licenseExpiration,
      needsUpdate: drivers.needsUpdate,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(eq(drivers.status, "active"));

  let flagged = 0;
  let cleared = 0;

  for (const row of allDrivers) {
    const driverRecord = {
      phoneNumber: row.phoneNumber,
      market: row.market,
      driverType: row.driverType,
      driverClassification: row.driverClassification,
      hireDate: row.hireDate,
      licenseNumber: row.licenseNumber,
      licenseState: row.licenseState,
      licenseExpiration: row.licenseExpiration,
    };
    const userRecord = {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
    };

    const result = evaluateDriver(driverRecord, userRecord);

    if (result.needsUpdate && !row.needsUpdate) {
      await applyEvaluation(row.driverId, result, "system");
      flagged++;
    } else if (result.needsUpdate && row.needsUpdate) {
      await applyEvaluation(row.driverId, result, "system");
    } else if (!result.needsUpdate && row.needsUpdate) {
      await applyEvaluation(row.driverId, result, "system");
      cleared++;
    }
  }

  return { total: allDrivers.length, flagged, cleared };
}
