/**
 * Leave Alert Service
 *
 * Scans active leave cases and creates persistent, deduplicated notifications
 * in `leave_notifications` for 6 alert types:
 *
 *   cert_overdue             — certification past due date, not yet received
 *   cert_due_soon            — certification due within 5 days
 *   release_in_7_days        — estimated release date is 6–7 days out
 *   release_in_3_days        — estimated release date is 2–3 days out
 *   leave_exhaustion_approaching — CFRA/FMLA 12-week max ≤ 14 days away
 *   return_to_work_recorded  — case status just changed to "returned" (event-driven)
 *
 * Deduplication: the DB has a partial unique index on (leave_case_id, alert_type, alert_date).
 * Inserts that violate the index are silently skipped with ON CONFLICT DO NOTHING.
 */

import { db } from "../db";
import { leaveCases, leaveNotifications, employees } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";

// CFRA / FMLA maximum leave duration: 12 weeks = 84 days
const CFRA_FMLA_MAX_DAYS = 84;

// Alert triggers within N days
const CERT_DUE_SOON_DAYS   = 5;
const RELEASE_7_DAYS       = 7;
const RELEASE_3_DAYS       = 3;
const EXHAUSTION_WARN_DAYS = 14;

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

interface AlertRow {
  orgId: string;
  leaveCaseId: string;
  employeeId: string;
  alertType: string;
  alertDate: string | null;
  caseNumber: string;
  employeeName: string;
  message: string;
  severity: string;
}

/**
 * Build alert rows for a single leave case (no DB writes here).
 */
function buildAlertsForCase(
  c: {
    id: string;
    orgId: string;
    caseNumber: string;
    employeeId: string;
    leaveType: string;
    status: string;
    triggerDate: string | null | undefined;
    certificationDueDate: string | null | undefined;
    certificationReceivedDate: string | null | undefined;
    expectedReturnDate: string | null | undefined;
  },
  employeeName: string,
  today: string
): AlertRow[] {
  const rows: AlertRow[] = [];

  // 1. cert_overdue — due date is in the past, not received
  if (c.certificationDueDate && !c.certificationReceivedDate) {
    const due = c.certificationDueDate as string;
    if (due < today) {
      rows.push({
        orgId: c.orgId, leaveCaseId: c.id, employeeId: c.employeeId,
        alertType: "cert_overdue", alertDate: due,
        caseNumber: c.caseNumber, employeeName,
        message: `Medical certification overdue for ${employeeName} (was due ${due})`,
        severity: "critical",
      });
    }
  }

  // 2. cert_due_soon — due date within 5 days, not received
  if (c.certificationDueDate && !c.certificationReceivedDate) {
    const due = c.certificationDueDate as string;
    const soonDate = toISO(addDays(new Date(today), CERT_DUE_SOON_DAYS));
    if (due >= today && due <= soonDate) {
      rows.push({
        orgId: c.orgId, leaveCaseId: c.id, employeeId: c.employeeId,
        alertType: "cert_due_soon", alertDate: due,
        caseNumber: c.caseNumber, employeeName,
        message: `Medical certification due in ${diffDays(due, today)} day(s) for ${employeeName}`,
        severity: "warning",
      });
    }
  }

  // 3. release_in_7_days — estimated release date 6–7 days out
  if (c.expectedReturnDate) {
    const ret = c.expectedReturnDate as string;
    const in6 = toISO(addDays(new Date(today), 6));
    const in7 = toISO(addDays(new Date(today), 7));
    if (ret >= in6 && ret <= in7) {
      rows.push({
        orgId: c.orgId, leaveCaseId: c.id, employeeId: c.employeeId,
        alertType: "release_in_7_days", alertDate: ret,
        caseNumber: c.caseNumber, employeeName,
        message: `${employeeName} is expected to return in 7 days (${ret})`,
        severity: "info",
      });
    }
  }

  // 4. release_in_3_days — estimated release date 2–3 days out
  if (c.expectedReturnDate) {
    const ret = c.expectedReturnDate as string;
    const in2 = toISO(addDays(new Date(today), 2));
    const in3 = toISO(addDays(new Date(today), 3));
    if (ret >= in2 && ret <= in3) {
      rows.push({
        orgId: c.orgId, leaveCaseId: c.id, employeeId: c.employeeId,
        alertType: "release_in_3_days", alertDate: ret,
        caseNumber: c.caseNumber, employeeName,
        message: `${employeeName} is expected to return in 3 days (${ret}) — confirm RTW plan`,
        severity: "warning",
      });
    }
  }

  // 5. leave_exhaustion_approaching — CFRA/FMLA 12-week max approaching
  const exhaustionTypes = ["cfra", "fmla", "cfra_pregnancy"];
  if (exhaustionTypes.includes(c.leaveType.toLowerCase()) && c.triggerDate) {
    const trigger = c.triggerDate as string;
    const exhaustionDate = toISO(addDays(new Date(trigger), CFRA_FMLA_MAX_DAYS));
    const warnStart = toISO(addDays(new Date(today), -1));
    const warnEnd   = toISO(addDays(new Date(today), EXHAUSTION_WARN_DAYS));
    if (exhaustionDate >= warnStart && exhaustionDate <= warnEnd) {
      const daysLeft = diffDays(exhaustionDate, today);
      rows.push({
        orgId: c.orgId, leaveCaseId: c.id, employeeId: c.employeeId,
        alertType: "leave_exhaustion_approaching", alertDate: exhaustionDate,
        caseNumber: c.caseNumber, employeeName,
        message: `${employeeName}'s ${c.leaveType.toUpperCase()} entitlement exhausted in ${Math.max(0, daysLeft)} day(s) (${exhaustionDate})`,
        severity: daysLeft <= 3 ? "critical" : "warning",
      });
    }
  }

  return rows;
}

/**
 * Insert a single alert row, silently ignoring duplicates.
 */
async function insertAlert(row: AlertRow): Promise<boolean> {
  try {
    await db.execute(sql`
      INSERT INTO leave_notifications
        (org_id, leave_case_id, employee_id, alert_type, alert_date, case_number, employee_name, message, severity)
      VALUES
        (${row.orgId}, ${row.leaveCaseId}, ${row.employeeId}, ${row.alertType},
         ${row.alertDate ?? null}::date, ${row.caseNumber}, ${row.employeeName}, ${row.message}, ${row.severity})
      ON CONFLICT DO NOTHING
    `);
    return true;
  } catch (err) {
    console.error("[LeaveAlerts] insert error:", err);
    return false;
  }
}

/**
 * Scan all active leave cases in an org and create notifications.
 * Returns a summary of how many were created vs. skipped.
 */
export async function scanAndCreateLeaveAlerts(orgId: string): Promise<{
  scanned: number;
  created: number;
  errors: number;
}> {
  const today = toISO(new Date());
  const summary = { scanned: 0, created: 0, errors: 0 };

  try {
    const activeCases = await db
      .select({
        id:                       leaveCases.id,
        orgId:                    leaveCases.orgId,
        caseNumber:               leaveCases.caseNumber,
        employeeId:               leaveCases.employeeId,
        leaveType:                leaveCases.leaveType,
        status:                   leaveCases.status,
        triggerDate:              leaveCases.triggerDate,
        certificationDueDate:     leaveCases.certificationDueDate,
        certificationReceivedDate:leaveCases.certificationReceivedDate,
        expectedReturnDate:       leaveCases.expectedReturnDate,
        firstName:                employees.firstName,
        lastName:                 employees.lastName,
      })
      .from(leaveCases)
      .innerJoin(employees, eq(leaveCases.employeeId, employees.id))
      .where(
        and(
          eq(leaveCases.orgId, orgId),
          or(eq(leaveCases.status, "open"), eq(leaveCases.status, "extended"))
        )
      );

    for (const c of activeCases) {
      summary.scanned++;
      const employeeName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const alertRows = buildAlertsForCase(c, employeeName, today);

      for (const row of alertRows) {
        const ok = await insertAlert(row);
        if (ok) summary.created++;
        else summary.errors++;
      }
    }
  } catch (err) {
    console.error("[LeaveAlerts] scan error:", err);
    summary.errors++;
  }

  return summary;
}

/**
 * Create a one-off "return to work recorded" notification immediately.
 * Called from the PATCH handler when status transitions to "returned".
 */
export async function createReturnToWorkNotification(
  orgId: string,
  leaveCaseId: string,
  employeeId: string,
  caseNumber: string,
  employeeName: string,
  returnDate: string
): Promise<void> {
  await insertAlert({
    orgId, leaveCaseId, employeeId,
    alertType: "return_to_work_recorded",
    alertDate: returnDate,
    caseNumber, employeeName,
    message: `${employeeName} has been marked as returned to work on ${returnDate} (Case ${caseNumber})`,
    severity: "info",
  });
}
