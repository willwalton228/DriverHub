/**
 * Employee Backfill Routes
 *
 * One-time backfill + ongoing status for creating linked Employee records
 * for all Drivers classified as 'Employee'. Built on top of the existing
 * syncEmployeeFromDriver() service which is idempotent and handles all
 * field mapping, audit logging, and onboarding checklist seeding.
 *
 * Endpoints:
 *   GET  /api/corporate/employees/backfill/status  - current readiness state
 *   POST /api/corporate/employees/backfill/run     - execute backfill (dry-run supported)
 *   GET  /api/corporate/employees/backfill/log     - last N sync log entries from backfill
 */

import { type Express, type Response } from "express";
import { db } from "../db";
import { drivers, employees, users, driverEmployeeSyncLog } from "@shared/schema";
import { eq, and, isNull, or, sql, desc } from "drizzle-orm";
import { syncEmployeeFromDriver } from "../services/driverEmployeeSyncService";
import { isAuthenticated } from "../replitAuth";

function isSuperAdminOrAdmin(role: string | undefined | null): boolean {
  return role === "super_admin" || role === "admin";
}

export function registerEmployeeBackfillRoutes(app: Express): void {

  // ── GET /api/corporate/employees/backfill/status ─────────────────────────
  // Returns current counts: how many employee-classified drivers exist,
  // how many already have a linked Employee record, and how many are missing one.
  app.get(
    "/api/corporate/employees/backfill/status",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const user = req.user?.claims;
        if (!user?.sub) return res.status(401).json({ message: "Unauthenticated" });

        // Fetch all non-deleted Employee-classified drivers with their linked employee lookup
        const rows = await db.execute(sql.raw(`
          SELECT
            d.id            AS driver_id,
            d.driver_number,
            d.driver_classification,
            d.employee_id   AS driver_employee_id_col,
            d.status        AS driver_status,
            d.hire_date,
            d.termination_date,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email,
            e.id            AS linked_employee_id,
            e.onboarding_status,
            e.source_of_truth
          FROM drivers d
          LEFT JOIN users u ON u.id = d.user_id
          LEFT JOIN employees e ON e.driver_id = d.id OR e.id = d.employee_id
          WHERE d.driver_classification = 'Employee'
            AND d.is_deleted = false
          ORDER BY full_name ASC
        `));

        const allDrivers: any[] = ((rows as any).rows ?? rows) as any[];

        const total      = allDrivers.length;
        const linked     = allDrivers.filter(r => r.linked_employee_id).length;
        const unlinked   = total - linked;
        const terminated = allDrivers.filter(r => r.driver_status === "terminated").length;

        const unlinkedList = allDrivers
          .filter(r => !r.linked_employee_id)
          .map(r => ({
            driverId:     r.driver_id,
            driverNumber: r.driver_number,
            fullName:     r.full_name?.trim() || "(No Name)",
            email:        r.email,
            status:       r.driver_status,
            hireDate:     r.hire_date,
          }));

        return res.json({
          total,
          linked,
          unlinked,
          terminated,
          readyToDeploy: unlinked === 0,
          unlinkedDrivers: unlinkedList,
        });
      } catch (err: any) {
        console.error("[BackfillStatus]", err);
        return res.status(500).json({ message: "Failed to fetch backfill status", error: err.message });
      }
    }
  );

  // ── POST /api/corporate/employees/backfill/run ────────────────────────────
  // Runs the backfill. Requires super_admin or admin role.
  // Body: { dryRun?: boolean }
  //   dryRun=true  → report what WOULD happen, no writes
  //   dryRun=false → actually create/update Employee records
  app.post(
    "/api/corporate/employees/backfill/run",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthenticated" });

        const { db: dbModule } = await import("../db");
        const { storage } = await import("../storage");
        const userRecord = await storage.getUser(userId);

        if (!isSuperAdminOrAdmin(userRecord?.role)) {
          return res.status(403).json({ message: "Super Admin or Admin access required" });
        }

        const dryRun: boolean = req.body?.dryRun === true;
        const startedAt = new Date();

        console.log(`[EmployeeBackfill] Run started — dryRun=${dryRun}, triggeredBy=${userId}`);

        // Pull all Employee-classified, non-deleted drivers
        const driverRows = await db.execute(sql.raw(`
          SELECT
            d.id            AS driver_id,
            d.employee_id   AS driver_employee_id_col,
            d.driver_classification,
            d.status        AS driver_status,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email,
            e.id            AS linked_employee_id
          FROM drivers d
          LEFT JOIN users u ON u.id = d.user_id
          LEFT JOIN employees e ON e.driver_id = d.id OR e.id = d.employee_id
          WHERE d.driver_classification = 'Employee'
            AND d.is_deleted = false
          ORDER BY full_name ASC
        `));

        const allDrivers: any[] = ((driverRows as any).rows ?? driverRows) as any[];

        const results = {
          total:        allDrivers.length,
          created:      0,
          skipped:      0,
          updated:      0,
          exceptions:   [] as Array<{ driverId: string; fullName: string; email?: string; reason: string }>,
          dryRun,
          startedAt: startedAt.toISOString(),
          completedAt: null as string | null,
          triggeredBy: userId,
          createdList:  [] as Array<{ driverId: string; employeeId: string; fullName: string }>,
          skippedList:  [] as Array<{ driverId: string; employeeId: string; fullName: string }>,
          updatedList:  [] as Array<{ driverId: string; employeeId: string; fullName: string; fields: string[] }>,
        };

        for (const row of allDrivers) {
          const driverId = row.driver_id;
          const fullName = row.full_name?.trim() || "(No Name)";
          const email    = row.email || undefined;

          // If already linked, check if it was a pre-existing link or needs sync
          if (row.linked_employee_id) {
            if (dryRun) {
              results.skipped++;
              results.skippedList.push({
                driverId,
                employeeId: row.linked_employee_id,
                fullName,
              });
              continue;
            }

            // Still run a sync pass to ensure all fields are current
            try {
              const syncResult = await syncEmployeeFromDriver(driverId, {
                triggeredBy: "manual",
                triggeredByUserId: userId,
              });

              if (syncResult.updatedFields.length > 0) {
                results.updated++;
                results.updatedList.push({
                  driverId,
                  employeeId: syncResult.employeeId,
                  fullName,
                  fields: syncResult.updatedFields,
                });
              } else {
                results.skipped++;
                results.skippedList.push({
                  driverId,
                  employeeId: syncResult.employeeId,
                  fullName,
                });
              }
            } catch (syncErr: any) {
              results.exceptions.push({
                driverId,
                fullName,
                email,
                reason: syncErr.message || "Sync error",
              });
            }
            continue;
          }

          // Not yet linked — need to create
          if (dryRun) {
            results.created++;
            results.createdList.push({ driverId, employeeId: "(dry-run)", fullName });
            continue;
          }

          try {
            if (!email) {
              // Log exception but don't hard fail — email is required for employee record
              results.exceptions.push({
                driverId,
                fullName,
                email,
                reason: "Driver has no email address — Employee record cannot be created",
              });
              continue;
            }

            const syncResult = await syncEmployeeFromDriver(driverId, {
              triggeredBy: "manual",
              triggeredByUserId: userId,
            });

            // Set onboarding_status to 'ready_for_review' for backfilled records
            await db.execute(sql.raw(`
              UPDATE employees
              SET onboarding_status = 'ready_for_review', updated_at = NOW()
              WHERE id = '${syncResult.employeeId}'
                AND onboarding_status = 'not_started'
            `));

            results.created++;
            results.createdList.push({
              driverId,
              employeeId: syncResult.employeeId,
              fullName,
            });

            console.log(`[EmployeeBackfill] Created employee ${syncResult.employeeId} for driver ${driverId} (${fullName})`);
          } catch (createErr: any) {
            console.error(`[EmployeeBackfill] Failed for driver ${driverId}:`, createErr);
            results.exceptions.push({
              driverId,
              fullName,
              email,
              reason: createErr.message || "Unknown error",
            });
          }
        }

        results.completedAt = new Date().toISOString();

        const durationMs = new Date().getTime() - startedAt.getTime();
        console.log(
          `[EmployeeBackfill] Complete — total=${results.total}, created=${results.created}, ` +
          `skipped=${results.skipped}, updated=${results.updated}, exceptions=${results.exceptions.length}, ` +
          `dryRun=${dryRun}, duration=${durationMs}ms`
        );

        return res.json(results);
      } catch (err: any) {
        console.error("[EmployeeBackfill] Fatal error:", err);
        return res.status(500).json({ message: "Backfill failed", error: err.message });
      }
    }
  );

  // ── GET /api/corporate/employees/backfill/log ─────────────────────────────
  // Returns the most recent sync log entries that were triggered by manual runs
  // (i.e., came from the backfill or admin manual syncs).
  app.get(
    "/api/corporate/employees/backfill/log",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthenticated" });

        const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);

        const rows = await db
          .select({
            id:                 driverEmployeeSyncLog.id,
            driverId:           driverEmployeeSyncLog.driverId,
            employeeId:         driverEmployeeSyncLog.employeeId,
            operation:          driverEmployeeSyncLog.operation,
            triggeredBy:        driverEmployeeSyncLog.triggeredBy,
            triggeredByUserId:  driverEmployeeSyncLog.triggeredByUserId,
            changedFields:      driverEmployeeSyncLog.changedFields,
            syncedAt:           driverEmployeeSyncLog.syncedAt,
            driverName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          })
          .from(driverEmployeeSyncLog)
          .leftJoin(drivers, eq(driverEmployeeSyncLog.driverId, drivers.id))
          .leftJoin(users, eq(drivers.userId, users.id))
          .where(eq(driverEmployeeSyncLog.triggeredBy, "manual"))
          .orderBy(desc(driverEmployeeSyncLog.syncedAt))
          .limit(limit);

        return res.json({ logs: rows, total: rows.length });
      } catch (err: any) {
        console.error("[BackfillLog]", err);
        return res.status(500).json({ message: "Failed to fetch backfill log", error: err.message });
      }
    }
  );
}
