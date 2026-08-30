/**
 * Driver Weekly Hours Service
 *
 * Runs hourly via cron. For every active driver (employee + IC):
 *   1. Sums WIW time entries for the current week (wiw_times via wiw_users FK)
 *   2. Sums remaining scheduled shifts from wiw_shifts (start_time > NOW, within week)
 *   3. Computes projected hours, projected OT (employees only), remaining-to-OT
 *   4. Upserts into driver_weekly_hours table
 *   5. Triggers in-app notifications for employees crossing 32 / 36 / 40 threshold
 *
 * IC drivers: included in hours data, excluded from OT alerts and OT KPIs.
 * Dedupe: max 1 alert per driver per threshold band per 6 hours.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────
const OT_THRESHOLD        = 40.0;
const DEDUPE_HOURS        = 6;
const ACQUISITION_CUTOFF  = "2026-02-09"; // post-acquisition data only

// Alert thresholds
const DISPATCH_THRESHOLDS:   readonly number[] = [32, 36, 40];
const MANAGEMENT_THRESHOLDS: readonly number[] = [36, 40];

// ─── Week bounds helper (Monday 12am → Sunday 11:59pm, America/Chicago) ────────
function getWeekBounds(): { weekStartIso: string; weekStart: Date; weekEnd: Date } {
  const now  = new Date();
  const chi  = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow  = chi.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(chi);
  weekStart.setDate(chi.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStartIso = weekStart.toISOString().split("T")[0];
  return { weekStartIso, weekStart, weekEnd };
}

// ─── OT status tier ──────────────────────────────────────────────────────────
function computeStatus(projected: number, isEmployee: boolean): string {
  if (!isEmployee) return "normal"; // ICs always "normal" — excluded from OT logic
  if (projected >= OT_THRESHOLD) return "overtime";
  if (projected >= 36)           return "warning";
  if (projected >= 32)           return "watch";
  return "normal";
}

// ─── Alert dedupe check ───────────────────────────────────────────────────────
// Returns true if we should send an alert (not deduped)
const _lastAlertSent: Map<string, Map<number, Date>> = new Map();

function shouldSendAlert(driverId: string, threshold: number): boolean {
  const now = new Date();
  if (!_lastAlertSent.has(driverId)) _lastAlertSent.set(driverId, new Map());
  const driverMap = _lastAlertSent.get(driverId)!;
  const last = driverMap.get(threshold);
  if (!last) {
    driverMap.set(threshold, now);
    return true;
  }
  const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  if (diffHours >= DEDUPE_HOURS) {
    driverMap.set(threshold, now);
    return true;
  }
  return false;
}

// ─── Main sync function ────────────────────────────────────────────────────────
export interface DriverWeeklyHoursSyncResult {
  driversScanned:  number;
  driversUpserted: number;
  alertsSent:      number;
  errors:          string[];
}

export async function syncDriverWeeklyHours(): Promise<DriverWeeklyHoursSyncResult> {
  const result: DriverWeeklyHoursSyncResult = { driversScanned: 0, driversUpserted: 0, alertsSent: 0, errors: [] };
  const { weekStartIso } = getWeekBounds();

  // Compute week-end ISO string in JS (avoids INTERVAL arithmetic in parameterized sql)
  const weekEndDate = new Date(weekStartIso + "T00:00:00Z");
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const weekEndIso = weekEndDate.toISOString().split("T")[0]; // exclusive upper bound

  try {
    // ── Pull all active drivers with their WIW link and computed hours ─────────
    // Uses subqueries for worked_hours and remaining_sched_hours to avoid the
    // fan-out problem that occurs when LEFT JOINing two 1-to-many tables directly
    // (wiw_times × wiw_shifts cross-product inflates both sums).
    //
    //   • direct_manager_id → employees.id → employees.user_id for notifications
    //   • Worked hours: current week AND post-acquisition (>= 2026-02-09)
    //   • Remaining shifts: start_time > NOW() through end-of-week
    const rawRows = await db.execute(sql`
      WITH
      worked AS (
        SELECT
          wu.driver_id,
          ROUND(
            COALESCE(SUM(t.total_minutes), 0) / 60.0, 2
          ) AS worked_hours
        FROM wiw_users  wu
        JOIN wiw_times  t  ON t.wiw_user_id = wu.id
        WHERE wu.wiw_status = 'active'
          AND t.clock_in >= ${weekStartIso}::date
          AND t.clock_in <  ${weekEndIso}::date
          AND t.clock_in >= ${ACQUISITION_CUTOFF}::date
        GROUP BY wu.driver_id
      ),
      remaining AS (
        SELECT
          wu.driver_id,
          ROUND(
            COALESCE(SUM(s.scheduled_minutes), 0) / 60.0, 2
          ) AS remaining_sched_hours
        FROM wiw_users  wu
        JOIN wiw_shifts s  ON s.wiw_user_id = wu.id
        WHERE wu.wiw_status = 'active'
          AND s.start_time >  NOW()
          AND s.start_time <  ${weekEndIso}::date + INTERVAL '1 day'
          AND s.status NOT IN ('absent', 'cancelled', 'deleted')
        GROUP BY wu.driver_id
      )
      SELECT
        d.id                      AS driver_id,
        u.first_name,
        u.last_name,
        d.driver_classification,
        emp.user_id               AS manager_user_id,
        wu.id                     AS wiw_user_id,
        COALESCE(w.worked_hours,  0) AS worked_hours,
        COALESCE(r.remaining_sched_hours, 0) AS remaining_sched_hours
      FROM  drivers    d
      JOIN  users      u   ON u.id   = d.user_id
      LEFT  JOIN employees emp ON emp.id  = d.direct_manager_id
      LEFT  JOIN wiw_users wu  ON wu.driver_id = d.id AND wu.wiw_status = 'active'
      LEFT  JOIN worked    w   ON w.driver_id  = d.id
      LEFT  JOIN remaining r   ON r.driver_id  = d.id
      WHERE d.status = 'active'
      ORDER BY d.id
    `);

    const rows: any[] = (rawRows as any).rows ?? rawRows ?? [];
    result.driversScanned = rows.length;

    for (const row of rows) {
      try {
        const isEmployee   = (row.driver_classification ?? "").toLowerCase() === "employee";
        const worked       = parseFloat(row.worked_hours   ?? "0");
        const remaining    = parseFloat(row.remaining_sched_hours ?? "0");
        const projected    = Math.round((worked + remaining) * 100) / 100;
        const projectedOt  = isEmployee ? Math.max(0, Math.round((projected - OT_THRESHOLD) * 100) / 100) : 0;
        const remainToOt   = isEmployee ? Math.max(0, Math.round((OT_THRESHOLD - worked) * 100) / 100) : 0;
        const status       = computeStatus(projected, isEmployee);

        // ── Upsert into driver_weekly_hours ───────────────────────────────
        await db.execute(sql`
          INSERT INTO driver_weekly_hours (
            driver_id, wiw_user_id, week_start_date,
            worked_hours, scheduled_remaining_hours, projected_hours,
            projected_ot_hours, remaining_to_ot, status, is_employee,
            last_calculated_at, created_at, updated_at
          ) VALUES (
            ${row.driver_id}, ${row.wiw_user_id ?? null}, ${weekStartIso},
            ${worked}, ${remaining}, ${projected},
            ${projectedOt}, ${remainToOt}, ${status}, ${isEmployee},
            NOW(), NOW(), NOW()
          )
          ON CONFLICT (driver_id, week_start_date) DO UPDATE SET
            wiw_user_id              = EXCLUDED.wiw_user_id,
            worked_hours             = EXCLUDED.worked_hours,
            scheduled_remaining_hours = EXCLUDED.scheduled_remaining_hours,
            projected_hours          = EXCLUDED.projected_hours,
            projected_ot_hours       = EXCLUDED.projected_ot_hours,
            remaining_to_ot          = EXCLUDED.remaining_to_ot,
            status                   = EXCLUDED.status,
            is_employee              = EXCLUDED.is_employee,
            last_calculated_at       = NOW(),
            updated_at               = NOW()
        `);
        result.driversUpserted++;

        // ── Dispatch alerts (employee-only) ───────────────────────────────
        if (isEmployee) {
          const driverName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();

          const deepLink = `/scheduling?tab=ot-watch`;

          for (const threshold of DISPATCH_THRESHOLDS) {
            if (projected >= threshold && shouldSendAlert(row.driver_id, threshold)) {
              await db.execute(sql`
                INSERT INTO notifications (
                  user_id, type, title, message,
                  related_entity_type, related_entity_id,
                  action_url, is_read, created_at
                )
                SELECT
                  id,
                  'ot_alert',
                  ${`OT Alert — ${driverName}`},
                  ${`Driver ${driverName} is projected at ${projected.toFixed(1)}h (threshold: ${threshold}h) this week.`},
                  'driver',
                  ${row.driver_id},
                  ${deepLink},
                  false,
                  NOW()
                FROM users
                WHERE role IN ('admin','manager','dispatch')
                LIMIT 20
              `);
              result.alertsSent++;
            }
          }

          // Management alerts (36 and 40 only) — also notify the driver's manager if set
          if (row.manager_user_id) {
            for (const threshold of MANAGEMENT_THRESHOLDS) {
              if (projected >= threshold && shouldSendAlert(`${row.driver_id}:mgr`, threshold)) {
                await db.execute(sql`
                  INSERT INTO notifications (
                    user_id, type, title, message,
                    related_entity_type, related_entity_id,
                    action_url, is_read, created_at
                  )
                  VALUES (
                    ${row.manager_user_id},
                    'ot_alert',
                    ${`Manager Alert — ${driverName}`},
                    ${`Driver ${driverName} is projected at ${projected.toFixed(1)}h (management threshold: ${threshold}h).`},
                    'driver',
                    ${row.driver_id},
                    ${deepLink},
                    false,
                    NOW()
                  )
                  ON CONFLICT DO NOTHING
                `);
              }
            }
          }
        }
      } catch (rowErr: any) {
        result.errors.push(`Driver ${row.driver_id}: ${rowErr?.message ?? rowErr}`);
      }
    }
  } catch (outerErr: any) {
    result.errors.push(`Sync failed: ${outerErr?.message ?? outerErr}`);
  }

  console.log(
    `[DriverWeeklyHours] sync complete: scanned=${result.driversScanned}, upserted=${result.driversUpserted}, alerts=${result.alertsSent}, errors=${result.errors.length}`
  );
  return result;
}
