/**
 * SSN/EIN Missing — DWP Item Sync Service
 *
 * Business Rule:
 *   For every Active driver whose SSN/EIN field is blank/null, create one open
 *   Daily Work Plan item per target user (deduped per driver+user).
 *   When SSN/EIN is filled in OR the driver is no longer Active, auto-complete
 *   all open items for that driver.
 *
 * Target Users:
 *   Susanne Beebe   — primary action owner (actionable)
 *   Will Walton     — visibility
 *   Luis Valdez     — visibility
 *   Rene Mendoza    — visibility
 */

import { db } from "../db";
import { workPlanItems, users } from "@shared/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { sql as rawSql } from "drizzle-orm";

// ── Config ──────────────────────────────────────────────────────────────────

export const SSN_EIN_DWP_TARGET_EMAILS: string[] = [
  "susanne.beebe@driverhub360.com",
  "will.walton@driverhub360.com",
  "luis.valdez@driverhub360.com",
  "rene.mendoza@driverhub360.com",
];

const EVENT_TYPE = "driver_ssn_ein_missing";
const RECORD_TYPE = "driver";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call this after any driver create/update to keep DWP items in sync.
 *
 * @param driverId             The driver's UUID
 * @param driverName           Full name for the task title
 * @param driverStatus         Current driver status string
 * @param ssnOrEinEncrypted    The raw SSN/EIN value (encrypted or plaintext) — used only for null/blank check
 * @param orgId                Org to stamp on created items
 */
export async function syncSsnEinDwpItems(
  driverId: string,
  driverName: string,
  driverStatus: string | null | undefined,
  ssnOrEinEncrypted: string | null | undefined,
  orgId: string | null | undefined,
): Promise<void> {
  const hasSsn = !!(ssnOrEinEncrypted && String(ssnOrEinEncrypted).trim() !== "");
  const isActive = driverStatus === "active";

  if (isActive && !hasSsn) {
    await ensureSsnEinDwpItems(driverId, driverName, orgId);
  } else {
    await completeSsnEinDwpItems(driverId);
  }
}

/**
 * Retroactive scan — call this to bring all active drivers into sync.
 * Returns { created, completed } counts for observability.
 */
export async function retroactiveSsnEinDwpScan(orgId?: string): Promise<{ created: number; completed: number }> {
  let created = 0;
  let completed = 0;

  const rawResult = await db.execute(
    rawSql`SELECT d.id, d.status, d.ssn_or_ein AS "ssnOrEinEncrypted",
                  u.first_name AS "firstName", u.last_name AS "lastName"
           FROM drivers d LEFT JOIN users u ON u.id = d.user_id`
  );
  const allDrivers = ((rawResult as any).rows || rawResult) as { id: string; status: string; ssnOrEinEncrypted: string | null; firstName: string | null; lastName: string | null }[];

  for (const d of allDrivers) {
    const hasSsn = !!(d.ssnOrEinEncrypted && String(d.ssnOrEinEncrypted).trim() !== "");
    const isActive = d.status === "active";
    const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || "Unknown Driver";

    if (isActive && !hasSsn) {
      const beforeCount = await countOpenItems(d.id);
      await ensureSsnEinDwpItems(d.id, name, orgId ?? null);
      const afterCount = await countOpenItems(d.id);
      created += Math.max(0, afterCount - beforeCount);
    } else {
      const result = await completeSsnEinDwpItems(d.id);
      completed += result;
    }
  }

  return { created, completed };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function ensureSsnEinDwpItems(
  driverId: string,
  driverName: string,
  orgId: string | null | undefined,
): Promise<void> {
  const targetUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, SSN_EIN_DWP_TARGET_EMAILS));

  for (const targetUser of targetUsers) {
    const existing = await db
      .select({ id: workPlanItems.id })
      .from(workPlanItems)
      .where(
        and(
          eq(workPlanItems.eventType, EVENT_TYPE),
          eq(workPlanItems.recordId, driverId),
          eq(workPlanItems.assignedUserId, targetUser.id),
          ne(workPlanItems.status, "completed"),
          ne(workPlanItems.status, "canceled"),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(workPlanItems).values({
        eventType: EVENT_TYPE,
        category: "staffing",
        recordType: RECORD_TYPE,
        recordId: driverId,
        recordName: `Missing SSN/EIN — ${driverName}`,
        reason: `Active driver ${driverName} is missing an SSN/EIN. Navigate to the driver record and complete the Payment Information section.`,
        assignedUserId: targetUser.id,
        priority: "high",
        status: "open",
        taskType: "Compliance",
        sourceModule: "staffing",
        recordUrl: `/drivers/${driverId}`,
        orgId: orgId ?? null,
      });
    }
  }
}

async function completeSsnEinDwpItems(driverId: string): Promise<number> {
  const result = await db
    .update(workPlanItems)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      resolutionNote: "SSN/EIN has been recorded or driver is no longer active.",
    })
    .where(
      and(
        eq(workPlanItems.eventType, EVENT_TYPE),
        eq(workPlanItems.recordId, driverId),
        ne(workPlanItems.status, "completed"),
        ne(workPlanItems.status, "canceled"),
      ),
    )
    .returning({ id: workPlanItems.id });

  return result.length;
}

async function countOpenItems(driverId: string): Promise<number> {
  const rows = await db
    .select({ id: workPlanItems.id })
    .from(workPlanItems)
    .where(
      and(
        eq(workPlanItems.eventType, EVENT_TYPE),
        eq(workPlanItems.recordId, driverId),
        ne(workPlanItems.status, "completed"),
        ne(workPlanItems.status, "canceled"),
      ),
    );
  return rows.length;
}
