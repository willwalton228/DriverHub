/**
 * Access Eligibility Module
 *
 * Enforces the rule: a standard human user may only have active DriverHub access
 * when they have at least one qualifying Driver record (status = 'active') OR at
 * least one Employee record that has not been terminated (termDate IS NULL or in
 * the future).
 *
 * Integration users (role = 'integration_user') are permanently exempt.
 */

import { db } from "./db";
import { drivers, employees, users } from "../shared/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { storage } from "./storage";

/** Roles permanently exempt from the Driver/Employee eligibility requirement */
const EXEMPT_ROLES = new Set(["integration_user"]);

export interface EligibilityResult {
  eligible: boolean;
  /** Why the decision was made */
  reason: "active_driver" | "active_employee" | "all_records_terminated" | "no_records" | "exempt";
  /** Whether any Driver or Employee record exists (active or not) */
  hasAnyRecord: boolean;
  activeDriverCount: number;
  activeEmployeeCount: number;
}

/**
 * Check whether a user has at least one qualifying active Driver or Employee record.
 */
export async function checkUserEligibility(userId: string): Promise<EligibilityResult> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { eligible: false, reason: "no_records", hasAnyRecord: false, activeDriverCount: 0, activeEmployeeCount: 0 };
  }

  // Integration users are permanently exempt
  if (user.role && EXEMPT_ROLES.has(user.role)) {
    return { eligible: true, reason: "exempt", hasAnyRecord: true, activeDriverCount: 0, activeEmployeeCount: 0 };
  }

  // Active driver: status = 'active'
  const activeDrivers = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(and(eq(drivers.userId, userId), eq(drivers.status, "active")));

  if (activeDrivers.length > 0) {
    return { eligible: true, reason: "active_driver", hasAnyRecord: true, activeDriverCount: activeDrivers.length, activeEmployeeCount: 0 };
  }

  // Active employee: termDate IS NULL or termDate > today
  const today = new Date().toISOString().split("T")[0];
  const activeEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.userId, userId),
        eq(employees.isDeleted, false),
        or(isNull(employees.termDate), gt(employees.termDate, today))
      )
    );

  if (activeEmployees.length > 0) {
    return { eligible: true, reason: "active_employee", hasAnyRecord: true, activeDriverCount: 0, activeEmployeeCount: activeEmployees.length };
  }

  // No active record — check if any record exists at all (for better error messaging)
  const [anyDriver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  const [anyEmployee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.isDeleted, false)))
    .limit(1);

  const hasAnyRecord = !!(anyDriver || anyEmployee);
  return {
    eligible: false,
    reason: hasAnyRecord ? "all_records_terminated" : "no_records",
    hasAnyRecord,
    activeDriverCount: 0,
    activeEmployeeCount: 0,
  };
}

/**
 * After a driver or employee termination event, evaluate the linked user's eligibility.
 * If no active records remain, disable the user account and write an audit entry.
 */
export async function enforceEligibilityOrDisable(
  linkedUserId: string,
  triggeredByUserId: string,
  triggerSource: string
): Promise<{ disabled: boolean; userName?: string }> {
  try {
    const user = await storage.getUser(linkedUserId);
    if (!user) return { disabled: false };

    // Never touch integration users or already-disabled accounts
    if (user.role && EXEMPT_ROLES.has(user.role)) return { disabled: false };
    if ((user as any).status === "DISABLED") return { disabled: false };

    const eligibility = await checkUserEligibility(linkedUserId);
    if (eligibility.eligible) return { disabled: false };

    // Disable the account
    await db.update(users).set({ status: "DISABLED" } as any).where(eq(users.id, linkedUserId));

    const userName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || linkedUserId;

    try {
      const { writeSystemAuditEvent } = await import("./services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "USER_ACCESS_DISABLED_ELIGIBILITY",
        actorUserId: triggeredByUserId,
        targetEntityType: "user",
        targetEntityId: linkedUserId,
        targetEntityLabel: userName,
        reason: eligibility.reason,
        previousValue: { status: (user as any).status },
        newValue: { status: "DISABLED" },
        metadata: { triggerSource, timestamp: new Date().toISOString() },
      });
    } catch (auditErr) {
      console.error("[AccessEligibility] Audit log failed:", auditErr);
    }

    console.log(
      `[AccessEligibility] Disabled user ${linkedUserId} (${userName}) — no active Driver or Employee record. Trigger: ${triggerSource}`
    );
    return { disabled: true, userName };
  } catch (err) {
    console.error("[AccessEligibility] enforceEligibilityOrDisable error:", err);
    return { disabled: false };
  }
}

/**
 * After a driver or employee reactivation, check whether a previously-disabled
 * linked user should have their access restored.
 * Only re-enables users whose status is currently DISABLED (conservative — avoids
 * accidentally re-enabling users an admin manually disabled for unrelated reasons,
 * though in practice those cases will be rare and reversible).
 */
export async function reevaluateAfterReactivation(
  linkedUserId: string,
  triggeredByUserId: string,
  triggerSource: string
): Promise<{ enabled: boolean; userName?: string }> {
  try {
    const user = await storage.getUser(linkedUserId);
    if (!user) return { enabled: false };
    if (user.role && EXEMPT_ROLES.has(user.role)) return { enabled: false };
    if ((user as any).status !== "DISABLED") return { enabled: false }; // Nothing to restore

    const eligibility = await checkUserEligibility(linkedUserId);
    if (!eligibility.eligible) return { enabled: false };

    // Restore access
    await db.update(users).set({ status: "ACTIVE" } as any).where(eq(users.id, linkedUserId));

    const userName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || linkedUserId;

    try {
      const { writeSystemAuditEvent } = await import("./services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "USER_ACCESS_REENABLED_ELIGIBILITY",
        actorUserId: triggeredByUserId,
        targetEntityType: "user",
        targetEntityId: linkedUserId,
        targetEntityLabel: userName,
        reason: eligibility.reason,
        previousValue: { status: "DISABLED" },
        newValue: { status: "ACTIVE" },
        metadata: { triggerSource, timestamp: new Date().toISOString() },
      });
    } catch (auditErr) {
      console.error("[AccessEligibility] Re-enable audit log failed:", auditErr);
    }

    console.log(
      `[AccessEligibility] Re-enabled user ${linkedUserId} (${userName}) — now has active record. Trigger: ${triggerSource}`
    );
    return { enabled: true, userName };
  } catch (err) {
    console.error("[AccessEligibility] reevaluateAfterReactivation error:", err);
    return { enabled: false };
  }
}

/**
 * Pre-flight check: would terminating this user's linked record disable their access?
 * Call this before showing the admin a termination form so a warning can be surfaced.
 */
export async function getTerminationImpactForUser(linkedUserId: string | null): Promise<{
  wouldDisableAccess: boolean;
  message: string | null;
  userName?: string;
}> {
  if (!linkedUserId) return { wouldDisableAccess: false, message: null };
  try {
    const user = await storage.getUser(linkedUserId);
    if (!user) return { wouldDisableAccess: false, message: null };
    if (user.role && EXEMPT_ROLES.has(user.role)) return { wouldDisableAccess: false, message: null };
    if ((user as any).status === "DISABLED") return { wouldDisableAccess: false, message: null };

    const today = new Date().toISOString().split("T")[0];
    const activeDrivers = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.userId, linkedUserId), eq(drivers.status, "active")));
    const activeEmployees = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.userId, linkedUserId),
          eq(employees.isDeleted, false),
          or(isNull(employees.termDate), gt(employees.termDate, today))
        )
      );

    const totalActive = activeDrivers.length + activeEmployees.length;
    const userName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "this user";

    if (totalActive <= 1) {
      return {
        wouldDisableAccess: true,
        message: `This is the person's last active Driver or Employee record. Terminating it will immediately disable DriverHub access for ${userName}.`,
        userName,
      };
    }

    return { wouldDisableAccess: false, message: null };
  } catch (err) {
    console.error("[AccessEligibility] getTerminationImpactForUser error:", err);
    return { wouldDisableAccess: false, message: null };
  }
}
