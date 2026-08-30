import { db } from "./db";
import {
  drivers,
  users,
  driverLifecycleEvents,
  Driver,
} from "@shared/schema";
import { eq, and, or, desc, gte, sql, inArray } from "drizzle-orm";
import crypto from "crypto";

const EVENT_VERSION = "1.0";

export interface DriverMasterData {
  driverId: string;
  driverNumber: string | null;
  status: 'active' | 'inactive' | 'suspended';
  safetyState: string | null;
  
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  
  market: string | null;
  driverType: string | null;
  driverClassification: string | null;
  
  eligibility: {
    isEligibleForAssignment: boolean;
    flags: string[];
    licenseValid: boolean;
    backgroundCheckCurrent: boolean;
    drugTestCurrent: boolean;
    mvrCurrent: boolean;
  };
  
  hireDate: string | null;
  lastMoveDate: string | null;
  updatedAt: string | null;
}

export interface DriverMasterDataQuery {
  driverIds?: string[];
  status?: string;
  market?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
  updatedSince?: Date;
}

function isLicenseValid(driver: Driver): boolean {
  if (!driver.licenseExpiration) return false;
  const expDate = new Date(driver.licenseExpiration);
  return expDate > new Date();
}

function isCheckCurrent(checkDate: string | Date | null, daysValid: number = 365): boolean {
  if (!checkDate) return false;
  const date = new Date(checkDate);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysValid);
  return date >= cutoff;
}

function computeEligibilityFlags(driver: Driver, user: any): string[] {
  const flags: string[] = [];
  
  if (driver.status !== 'active') {
    flags.push('STATUS_NOT_ACTIVE');
  }
  
  if (driver.safetyState && driver.safetyState !== 'ACTIVE') {
    flags.push(`SAFETY_${driver.safetyState}`);
  }
  
  if (!isLicenseValid(driver)) {
    flags.push('LICENSE_EXPIRED_OR_MISSING');
  }
  
  if (!isCheckCurrent(driver.backgroundCheckDate)) {
    flags.push('BACKGROUND_CHECK_EXPIRED');
  }
  
  if (!isCheckCurrent(driver.drugTestDate)) {
    flags.push('DRUG_TEST_EXPIRED');
  }
  
  if (!isCheckCurrent(driver.mvrDate)) {
    flags.push('MVR_EXPIRED');
  }
  
  if (driver.terminationDate || driver.contractCancelledDate) {
    flags.push('TERMINATED_OR_CANCELLED');
  }
  
  if (driver.inactiveDate) {
    flags.push('INACTIVE_DATE_SET');
  }
  
  return flags;
}

function isEligibleForAssignment(driver: Driver, user: any): boolean {
  if (driver.status !== 'active') return false;
  if (driver.safetyState && driver.safetyState !== 'ACTIVE') return false;
  if (!isLicenseValid(driver)) return false;
  if (!isCheckCurrent(driver.backgroundCheckDate)) return false;
  if (!isCheckCurrent(driver.drugTestDate)) return false;
  if (!isCheckCurrent(driver.mvrDate)) return false;
  if (driver.terminationDate || driver.contractCancelledDate) return false;
  if (driver.inactiveDate) return false;
  return true;
}

export async function getDriverMasterData(driverId: string): Promise<DriverMasterData | null> {
  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driver) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, driver.userId),
  });

  if (!user) return null;

  return mapDriverToMasterData(driver, user);
}

export async function queryDriverMasterData(
  query: DriverMasterDataQuery
): Promise<{ drivers: DriverMasterData[]; total: number }> {
  const conditions = [];

  if (query.driverIds && query.driverIds.length > 0) {
    conditions.push(inArray(drivers.id, query.driverIds));
  }

  if (query.status) {
    conditions.push(eq(drivers.status, query.status));
  } else if (!query.includeInactive) {
    conditions.push(eq(drivers.status, 'active'));
  }

  if (query.market) {
    conditions.push(eq(drivers.market, query.market));
  }

  if (query.updatedSince) {
    conditions.push(gte(drivers.updatedAt, query.updatedSince));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const driverResults = await db.select()
    .from(drivers)
    .where(whereClause)
    .orderBy(desc(drivers.updatedAt))
    .limit(query.limit || 100)
    .offset(query.offset || 0);

  const userIds = driverResults.map(d => d.userId);
  const userResults = userIds.length > 0 
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  
  const userMap = new Map(userResults.map(u => [u.id, u]));

  const mappedDrivers = driverResults
    .map(driver => {
      const user = userMap.get(driver.userId);
      if (!user) return null;
      return mapDriverToMasterData(driver, user);
    })
    .filter((d): d is DriverMasterData => d !== null);

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(drivers)
    .where(whereClause);

  return {
    drivers: mappedDrivers,
    total: Number(countResult[0]?.count || 0),
  };
}

function mapDriverToMasterData(driver: Driver, user: any): DriverMasterData {
  const eligibilityFlags = computeEligibilityFlags(driver, user);
  
  return {
    driverId: driver.id,
    driverNumber: driver.driverNumber,
    status: (driver.status as 'active' | 'inactive' | 'suspended') || 'active',
    safetyState: driver.safetyState,
    
    displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    
    market: driver.market,
    driverType: driver.driverType,
    driverClassification: driver.driverClassification,
    
    eligibility: {
      isEligibleForAssignment: isEligibleForAssignment(driver, user),
      flags: eligibilityFlags,
      licenseValid: isLicenseValid(driver),
      backgroundCheckCurrent: isCheckCurrent(driver.backgroundCheckDate),
      drugTestCurrent: isCheckCurrent(driver.drugTestDate),
      mvrCurrent: isCheckCurrent(driver.mvrDate),
    },
    
    hireDate: driver.hireDate ? driver.hireDate.toString() : null,
    lastMoveDate: driver.lastMoveDate ? driver.lastMoveDate.toString() : null,
    updatedAt: driver.updatedAt?.toISOString() || null,
  };
}

function generateDriverEventId(driverId: string, eventType: string): string {
  const data = `${eventType}-${driverId}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

function generateDriverUpdateEventId(driverId: string, driver: Driver): string {
  const stateHash = JSON.stringify({
    status: driver.status,
    safetyState: driver.safetyState,
    market: driver.market,
    driverType: driver.driverType,
    licenseExpiration: driver.licenseExpiration,
  });
  const data = `DRIVER_UPDATED-${driverId}-${stateHash}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

export async function emitDriverCreatedEvent(
  driverId: string,
  emittedBy?: string
): Promise<any> {
  const masterData = await getDriverMasterData(driverId);
  if (!masterData) {
    console.error(`[DriverMasterData] Driver not found: ${driverId}`);
    return null;
  }

  const eventId = generateDriverEventId(driverId, 'DRIVER_CREATED');

  const existing = await db.query.driverLifecycleEvents.findFirst({
    where: eq(driverLifecycleEvents.eventId, eventId)
  });

  if (existing) {
    console.log(`[DriverMasterData] Duplicate DRIVER_CREATED event for ${driverId}`);
    return existing;
  }

  const [event] = await db.insert(driverLifecycleEvents).values({
    eventId,
    eventType: 'DRIVER_CREATED',
    eventVersion: EVENT_VERSION,
    driverId,
    payload: JSON.stringify(masterData),
    emittedBy,
    status: 'pending',
  }).returning();

  console.log(`[DriverMasterData] Emitted DRIVER_CREATED event for ${driverId}`);
  return event;
}

export async function emitDriverUpdatedEvent(
  driverId: string,
  changedFields: string[],
  emittedBy?: string
): Promise<any> {
  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId)
  });

  if (!driver) {
    console.error(`[DriverMasterData] Driver not found: ${driverId}`);
    return null;
  }

  if (changedFields.length === 0) {
    return null;
  }

  const eventId = generateDriverUpdateEventId(driverId, driver);

  const existing = await db.query.driverLifecycleEvents.findFirst({
    where: eq(driverLifecycleEvents.eventId, eventId)
  });

  if (existing) {
    console.log(`[DriverMasterData] Duplicate DRIVER_UPDATED event for ${driverId}`);
    return existing;
  }

  const masterData = await getDriverMasterData(driverId);

  const [event] = await db.insert(driverLifecycleEvents).values({
    eventId,
    eventType: 'DRIVER_UPDATED',
    eventVersion: EVENT_VERSION,
    driverId,
    payload: JSON.stringify(masterData),
    emittedBy,
    status: 'pending',
    changedFields,
  }).returning();

  console.log(`[DriverMasterData] Emitted DRIVER_UPDATED event for ${driverId}, changed: ${changedFields.join(', ')}`);
  return event;
}

export const RELEVANT_DRIVER_FIELDS = [
  'status',
  'safetyState',
  'market',
  'driverType',
  'driverClassification',
  'licenseExpiration',
  'backgroundCheckDate',
  'drugTestDate',
  'mvrDate',
  'terminationDate',
  'contractCancelledDate',
  'inactiveDate',
] as const;

export function detectDriverChangedFields(
  original: Record<string, unknown>,
  updated: Record<string, unknown>
): string[] {
  const changedFields: string[] = [];
  
  for (const field of RELEVANT_DRIVER_FIELDS) {
    if (original[field] !== updated[field]) {
      changedFields.push(field);
    }
  }
  
  return changedFields;
}
