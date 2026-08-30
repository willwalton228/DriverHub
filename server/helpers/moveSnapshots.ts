import { storage } from '../storage';
import type { InsertMoveSnapshot, MoveSnapshot } from '@shared/schema';

export async function buildMoveSnapshotData(
  moveId: string,
  snapshotType: 'CLAIM' | 'AUDIT' | 'DISPUTE',
  snapshotedByUserId: string | null,
  snapshotedByName: string | null
): Promise<InsertMoveSnapshot | null> {
  const move = await storage.getTrip(moveId);
  if (!move) return null;

  let driverName: string | null = null;
  let driverId: string | null = move.driverId || null;
  if (move.driverId) {
    const driver = await storage.getDriver(move.driverId);
    if (driver) {
      const driverUser = driver.userId ? await storage.getUser(driver.userId) : null;
      driverName = driverUser 
        ? `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim() || driverUser.email
        : null;
    }
  }

  let customerName: string | null = null;
  let customerId: string | null = move.customerId || null;
  if (move.customerId) {
    const customer = await storage.getCustomer(move.customerId);
    customerName = customer?.customerName || null;
  }

  let marketCode: string | null = null;
  let marketId: string | null = move.marketId || null;
  if (move.marketId) {
    const market = await storage.getMarket(move.marketId);
    marketCode = market?.code || null;
  }

  let zoneCode: string | null = null;
  let zoneId: string | null = move.zoneId || null;
  if (move.zoneId) {
    const zone = await storage.getZone(move.zoneId);
    zoneCode = zone?.zoneCode || null;
  }

  const snapshotData: InsertMoveSnapshot = {
    moveId,
    snapshotType,
    driverId,
    driverName,
    customerId,
    customerName,
    marketId,
    marketCode,
    zoneId,
    zoneCode,
    executionMode: move.executionMode || null,
    workType: move.workType || null,
    originAddress: move.origin || null,
    destinationAddress: move.destination || null,
    originLat: move.originLat || null,
    originLng: move.originLng || null,
    destinationLat: move.destinationLat || null,
    destinationLng: move.destinationLng || null,
    serviceDatetime: move.tripDate || null,
    estimatedMinutesSnapshot: move.estimatedMinutes || null,
    billRate: move.billRate || null,
    payRate: move.payRate || null,
    eligibilityStatus: move.eligibilityStatus || null,
    eligibilityReasons: move.eligibilityReasons || null,
    moveStatus: move.status || null,
    assignmentState: move.assignmentState || null,
    executionState: move.executionState || null,
    moveNumber: move.moveNumber || null,
    vehicleType: move.vehicleType || null,
    moveType: move.moveType || null,
    notes: move.notes || null,
    rawMoveDataJson: move,
    snapshotedByUserId,
    snapshotedByName,
  };

  return snapshotData;
}

export async function createClaimMoveSnapshot(
  moveId: string,
  userId: string | null,
  userName: string | null
): Promise<MoveSnapshot | null> {
  const snapshotData = await buildMoveSnapshotData(moveId, 'CLAIM', userId, userName);
  if (!snapshotData) return null;

  const snapshot = await storage.createMoveSnapshot(snapshotData);
  return snapshot;
}
