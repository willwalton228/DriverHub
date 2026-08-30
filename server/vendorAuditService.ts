import { db } from "./db";
import { vendorAuditLog } from "@shared/schema";
import { desc, eq, and, or, sql } from "drizzle-orm";

interface AuditContext {
  userId: string;
  userName?: string;
  userRole?: string;
}

export async function logVendorAudit(
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete",
  context: AuditContext,
  changesJson?: Record<string, any> | null,
): Promise<void> {
  try {
    await db.insert(vendorAuditLog).values({
      entityType,
      entityId,
      action,
      userId: context.userId,
      userName: context.userName || null,
      userRole: context.userRole || null,
      changesJson: changesJson || null,
    });
  } catch (error: any) {
    console.error("[VendorAudit] Failed to write audit log:", error?.message);
  }
}

export function computeChanges(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[]
): Record<string, { from: any; to: any }> | null {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const field of fields) {
    const oldVal = before[field];
    const newVal = after[field];
    if (oldVal !== newVal && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function getVendorAuditLogs(vendorId: string, limit = 50, offset = 0) {
  return db.select().from(vendorAuditLog)
    .where(
      or(
        and(eq(vendorAuditLog.entityType, "vendor"), eq(vendorAuditLog.entityId, vendorId)),
        sql`${vendorAuditLog.changesJson}->>'vendorId' = ${vendorId}`,
        sql`${vendorAuditLog.entityType} IN ('vendor_contract', 'vendor_pricing', 'vendor_contact', 'vendor_document', 'vendor_note') AND ${vendorAuditLog.entityId} IN (
          SELECT id FROM vendor_contracts WHERE vendor_id = ${vendorId}
          UNION SELECT id FROM vendor_pricing WHERE vendor_id = ${vendorId}
          UNION SELECT id FROM vendor_contacts WHERE vendor_id = ${vendorId}
          UNION SELECT id FROM vendor_documents WHERE vendor_id = ${vendorId}
          UNION SELECT id FROM vendor_notes WHERE vendor_id = ${vendorId}
        )`
      )
    )
    .orderBy(desc(vendorAuditLog.timestamp))
    .limit(limit)
    .offset(offset);
}
