import { db } from "../db";
import { systemAuditLog, type InsertSystemAuditLog } from "../../shared/schema";

export interface AuditEventInput {
  eventType: string;
  actorUserId?: string | null;
  actorUserEmail?: string | null;
  targetEntityType: string;
  targetEntityId: string;
  targetEntityLabel?: string | null;
  reason?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export async function writeSystemAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await db.insert(systemAuditLog).values({
      eventType: event.eventType,
      actorUserId: event.actorUserId ?? null,
      actorUserEmail: event.actorUserEmail ?? null,
      targetEntityType: event.targetEntityType,
      targetEntityId: event.targetEntityId,
      targetEntityLabel: event.targetEntityLabel ?? null,
      reason: event.reason ?? null,
      previousValue: event.previousValue ?? null,
      newValue: event.newValue ?? null,
      metadata: event.metadata ?? null,
      ipAddress: event.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[SystemAuditLog] Failed to write audit event:", err, "Event:", event);
  }
}

export interface AuditLogFilters {
  eventType?: string;      // Exact match, OR prefix match if value ends with "."
  actorUserId?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export async function getSystemAuditLog(
  filters: AuditLogFilters = {}
): Promise<{ entries: typeof systemAuditLog.$inferSelect[]; total: number }> {
  const { sql, and, gte, lte, eq, ilike } = await import("drizzle-orm");

  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.eventType) {
    if (filters.eventType.endsWith(".")) {
      // Prefix match: e.g. "financial." → ILIKE 'financial.%'
      conditions.push(ilike(systemAuditLog.eventType, `${filters.eventType}%`) as any);
    } else {
      conditions.push(eq(systemAuditLog.eventType, filters.eventType));
    }
  }
  if (filters.actorUserId) {
    conditions.push(eq(systemAuditLog.actorUserId, filters.actorUserId));
  }
  if (filters.targetEntityType) {
    conditions.push(eq(systemAuditLog.targetEntityType, filters.targetEntityType));
  }
  if (filters.targetEntityId) {
    conditions.push(eq(systemAuditLog.targetEntityId, filters.targetEntityId));
  }
  if (filters.fromDate) {
    conditions.push(gte(systemAuditLog.createdAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lte(systemAuditLog.createdAt, filters.toDate));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(systemAuditLog)
      .where(where)
      .orderBy(sql`${systemAuditLog.createdAt} DESC`)
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(systemAuditLog)
      .where(where),
  ]);

  return {
    entries,
    total: countResult[0]?.count ?? 0,
  };
}
