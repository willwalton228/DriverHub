import { db } from "./db";
import { 
  legalHolds, 
  legalHoldLogs, 
  users,
  LegalHold,
  LegalHoldScopeType,
  legalHoldScopeTypes
} from "@shared/schema";
import { eq, and, desc, or, inArray, sql } from "drizzle-orm";

interface ApplyHoldParams {
  scopeType: LegalHoldScopeType;
  scopeId: string;
  reason: string;
  matterReference?: string;
  notes?: string;
  appliedBy: string;
  ipAddress?: string;
  userAgent?: string;
}

interface ReleaseHoldParams {
  holdId: string;
  releaseReason: string;
  releasedBy: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function applyLegalHold(params: ApplyHoldParams): Promise<LegalHold> {
  const { scopeType, scopeId, reason, matterReference, notes, appliedBy, ipAddress, userAgent } = params;

  // Validate scope type
  if (!legalHoldScopeTypes.includes(scopeType)) {
    throw new Error(`Invalid scope type: ${scopeType}. Must be one of: ${legalHoldScopeTypes.join(", ")}`);
  }

  // Check if there's already an active hold on this entity
  const [existingHold] = await db.select()
    .from(legalHolds)
    .where(and(
      eq(legalHolds.scopeType, scopeType),
      eq(legalHolds.scopeId, scopeId),
      eq(legalHolds.isActive, true)
    ))
    .limit(1);

  if (existingHold) {
    throw new Error(`An active legal hold already exists for ${scopeType}:${scopeId}`);
  }

  // Get actor email for audit log
  const [actor] = await db.select({ email: users.email })
    .from(users)
    .where(eq(users.id, appliedBy))
    .limit(1);

  // Create the legal hold
  const [hold] = await db.insert(legalHolds)
    .values({
      scopeType,
      scopeId,
      reason,
      matterReference,
      notes,
      appliedBy,
      isActive: true,
    })
    .returning();

  // Log the action
  await db.insert(legalHoldLogs).values({
    holdId: hold.id,
    action: "applied",
    actorId: appliedBy,
    actorEmail: actor?.email,
    newState: JSON.stringify({
      scopeType,
      scopeId,
      reason,
      matterReference,
      isActive: true,
    }),
    changeReason: reason,
    ipAddress,
    userAgent,
  });

  console.log(`[LegalHold] Applied hold to ${scopeType}:${scopeId} by ${actor?.email || appliedBy}`);
  return hold;
}

export async function releaseLegalHold(params: ReleaseHoldParams): Promise<LegalHold> {
  const { holdId, releaseReason, releasedBy, ipAddress, userAgent } = params;

  // Get existing hold
  const [existingHold] = await db.select()
    .from(legalHolds)
    .where(eq(legalHolds.id, holdId))
    .limit(1);

  if (!existingHold) {
    throw new Error("Legal hold not found");
  }

  if (!existingHold.isActive) {
    throw new Error("Legal hold is already released");
  }

  // Get actor email for audit log
  const [actor] = await db.select({ email: users.email })
    .from(users)
    .where(eq(users.id, releasedBy))
    .limit(1);

  // Release the hold
  const [hold] = await db.update(legalHolds)
    .set({
      isActive: false,
      releasedBy,
      releasedAt: new Date(),
      releaseReason,
    })
    .where(eq(legalHolds.id, holdId))
    .returning();

  // Log the action
  await db.insert(legalHoldLogs).values({
    holdId: hold.id,
    action: "released",
    actorId: releasedBy,
    actorEmail: actor?.email,
    previousState: JSON.stringify({
      scopeType: existingHold.scopeType,
      scopeId: existingHold.scopeId,
      isActive: true,
    }),
    newState: JSON.stringify({
      scopeType: hold.scopeType,
      scopeId: hold.scopeId,
      isActive: false,
      releasedAt: hold.releasedAt,
    }),
    changeReason: releaseReason,
    ipAddress,
    userAgent,
  });

  console.log(`[LegalHold] Released hold on ${hold.scopeType}:${hold.scopeId} by ${actor?.email || releasedBy}`);
  return hold;
}

export async function getActiveLegalHold(
  scopeType: LegalHoldScopeType, 
  scopeId: string
): Promise<LegalHold | null> {
  const [hold] = await db.select()
    .from(legalHolds)
    .where(and(
      eq(legalHolds.scopeType, scopeType),
      eq(legalHolds.scopeId, scopeId),
      eq(legalHolds.isActive, true)
    ))
    .limit(1);
  return hold || null;
}

export async function isUnderLegalHold(
  scopeType: LegalHoldScopeType, 
  scopeId: string
): Promise<boolean> {
  const hold = await getActiveLegalHold(scopeType, scopeId);
  return hold !== null;
}

export async function checkMultipleLegalHolds(
  items: Array<{ scopeType: LegalHoldScopeType; scopeId: string }>
): Promise<Map<string, LegalHold>> {
  if (items.length === 0) return new Map();

  // Build query conditions
  const conditions = items.map(item => 
    and(
      eq(legalHolds.scopeType, item.scopeType),
      eq(legalHolds.scopeId, item.scopeId),
      eq(legalHolds.isActive, true)
    )
  );

  const holds = await db.select()
    .from(legalHolds)
    .where(or(...conditions));

  // Build result map
  const result = new Map<string, LegalHold>();
  for (const hold of holds) {
    result.set(`${hold.scopeType}:${hold.scopeId}`, hold);
  }
  return result;
}

export async function getAllActiveHolds(
  scopeType?: LegalHoldScopeType
): Promise<LegalHold[]> {
  let query = db.select()
    .from(legalHolds)
    .where(eq(legalHolds.isActive, true))
    .orderBy(desc(legalHolds.appliedAt));

  if (scopeType) {
    query = db.select()
      .from(legalHolds)
      .where(and(
        eq(legalHolds.isActive, true),
        eq(legalHolds.scopeType, scopeType)
      ))
      .orderBy(desc(legalHolds.appliedAt));
  }

  return query;
}

export async function getAllHolds(
  includeReleased: boolean = false,
  scopeType?: LegalHoldScopeType,
  limit: number = 100
): Promise<LegalHold[]> {
  const conditions = [];
  
  if (!includeReleased) {
    conditions.push(eq(legalHolds.isActive, true));
  }
  
  if (scopeType) {
    conditions.push(eq(legalHolds.scopeType, scopeType));
  }

  const query = conditions.length > 0
    ? db.select().from(legalHolds).where(and(...conditions)).orderBy(desc(legalHolds.appliedAt)).limit(limit)
    : db.select().from(legalHolds).orderBy(desc(legalHolds.appliedAt)).limit(limit);

  return query;
}

export async function getHoldWithDetails(holdId: string): Promise<{
  hold: LegalHold;
  appliedByUser: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  releasedByUser: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
} | null> {
  const [hold] = await db.select()
    .from(legalHolds)
    .where(eq(legalHolds.id, holdId))
    .limit(1);

  if (!hold) return null;

  // Get applied by user
  const [appliedByUser] = await db.select({
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(users)
    .where(eq(users.id, hold.appliedBy))
    .limit(1);

  // Get released by user (if applicable)
  let releasedByUser = null;
  if (hold.releasedBy) {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(users)
      .where(eq(users.id, hold.releasedBy))
      .limit(1);
    releasedByUser = user || null;
  }

  return {
    hold,
    appliedByUser: appliedByUser || null,
    releasedByUser,
  };
}

export async function getHoldLogs(holdId: string): Promise<Array<{
  id: string;
  action: string;
  actorEmail: string | null;
  occurredAt: Date;
  changeReason: string | null;
}>> {
  const logs = await db.select({
    id: legalHoldLogs.id,
    action: legalHoldLogs.action,
    actorEmail: legalHoldLogs.actorEmail,
    occurredAt: legalHoldLogs.occurredAt,
    changeReason: legalHoldLogs.changeReason,
  })
    .from(legalHoldLogs)
    .where(eq(legalHoldLogs.holdId, holdId))
    .orderBy(desc(legalHoldLogs.occurredAt));

  return logs;
}

export async function getHoldsForEntity(
  scopeType: LegalHoldScopeType,
  scopeId: string
): Promise<LegalHold[]> {
  return db.select()
    .from(legalHolds)
    .where(and(
      eq(legalHolds.scopeType, scopeType),
      eq(legalHolds.scopeId, scopeId)
    ))
    .orderBy(desc(legalHolds.appliedAt));
}

// Get IDs of all items under legal hold for a specific scope type
export async function getHeldItemIds(scopeType: LegalHoldScopeType): Promise<string[]> {
  const holds = await db.select({ scopeId: legalHolds.scopeId })
    .from(legalHolds)
    .where(and(
      eq(legalHolds.scopeType, scopeType),
      eq(legalHolds.isActive, true)
    ));
  return holds.map(h => h.scopeId);
}

// Get summary statistics for legal holds
export async function getLegalHoldStats(): Promise<{
  totalActive: number;
  byType: { scopeType: string; count: number }[];
  recentlyApplied: number;
  recentlyReleased: number;
}> {
  // Total active holds
  const [{ count: totalActive }] = await db.select({ 
    count: sql<number>`count(*)::int` 
  })
    .from(legalHolds)
    .where(eq(legalHolds.isActive, true));

  // By type
  const byType = await db.select({
    scopeType: legalHolds.scopeType,
    count: sql<number>`count(*)::int`,
  })
    .from(legalHolds)
    .where(eq(legalHolds.isActive, true))
    .groupBy(legalHolds.scopeType);

  // Recently applied (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const [{ count: recentlyApplied }] = await db.select({ 
    count: sql<number>`count(*)::int` 
  })
    .from(legalHolds)
    .where(sql`${legalHolds.appliedAt} >= ${sevenDaysAgo}`);

  // Recently released (last 7 days)
  const [{ count: recentlyReleased }] = await db.select({ 
    count: sql<number>`count(*)::int` 
  })
    .from(legalHolds)
    .where(and(
      eq(legalHolds.isActive, false),
      sql`${legalHolds.releasedAt} >= ${sevenDaysAgo}`
    ));

  return {
    totalActive,
    byType,
    recentlyApplied,
    recentlyReleased,
  };
}
