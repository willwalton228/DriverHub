/**
 * Weekly Shift Excel Report — rebuilt per ticket spec.
 *
 * Sheet 1: "Summary"   — account/week header + five metrics
 * Sheet 2: "Shift Detail" — one row per WIW shift, frozen header
 *
 * Data source: wiw_shifts (base) LEFT JOIN wiw_times (worked)
 * Status: Scheduled | Completed | Missed  (future never flagged Missed)
 */

import ExcelJS from "exceljs";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Palette — neutral grayscale only ─────────────────────────────────────────
const HEADER_BG   = "FF374151";   // dark gray header bg
const HEADER_FG   = "FFFFFFFF";   // white header text
const LABEL_BG    = "FFF3F4F6";   // very light gray label cells
const ALT_ROW_BG  = "FFF9FAFB";   // alternating row tint
const DARK_TEXT   = "FF1F2937";   // near-black body text
const MED_TEXT    = "FF6B7280";   // medium gray secondary text

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface HoursReportOptions {
  customerId:  string;
  accountName: string;
  weekStart:   string;   // YYYY-MM-DD (Monday)
  weekEnd:     string;   // YYYY-MM-DD (Sunday)
  timezone?:   string;   // IANA — falls back to customers.timezone
}

export interface HoursReportResult {
  buffer:      Buffer;
  fileName:    string;
  shiftCount:  number;
  driverCount: number;
}

// ── Data fetch — shifts are the base row; worked time is optional ─────────────
async function fetchShifts(customerId: string, weekStart: string, weekEndInclusive: string) {
  const raw = await db.execute(sql`
    SELECT
      s.id                AS shift_id,
      s.start_time        AS sched_start,
      s.end_time          AS sched_end,
      s.scheduled_minutes,
      wu.name             AS driver_name,
      COALESCE(wl.name, 'Unknown Location')               AS location_name,
      COALESCE(wl.timezone, c.timezone, 'America/New_York') AS shift_tz,
      t.clock_in          AS worked_start,
      t.clock_out         AS worked_end,
      t.total_minutes     AS worked_minutes
    FROM wiw_shifts s
    JOIN wiw_users wu
      ON wu.id = s.wiw_user_id
    LEFT JOIN wiw_locations wl
      ON wl.id = s.wiw_location_id
    LEFT JOIN customers c
      ON c.id = s.driverhub_account_id
    LEFT JOIN wiw_times t
      ON t.wiw_shift_id = s.id
    WHERE s.driverhub_account_id = ${customerId}
      AND s.wiw_user_id IS NOT NULL
      AND s.start_time >= ${weekStart}::date
      AND s.start_time <  (${weekEndInclusive}::date + INTERVAL '1 day')
      AND s.status NOT IN ('deleted', 'cancelled')
    ORDER BY s.start_time, wu.name
  `);
  return (raw as any).rows ?? (raw as any[]) ?? [];
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** "04/02/2026" */
function fmtDate(ts: Date | string | null, tz: string): string {
  if (!ts) return "";
  const d = new Date(ts as any);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: tz,
  });
}

/** "Thu" */
function fmtDay(ts: Date | string | null, tz: string): string {
  if (!ts) return "";
  const d = new Date(ts as any);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
}

/** "11:00 AM CDT" */
function fmtTime(ts: Date | string | null, tz: string): string {
  if (!ts) return "";
  const d = new Date(ts as any);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  });
  const abbr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, timeZoneName: "short",
  }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "";
  return `${time} ${abbr}`.trim();
}

/** Scheduled hours — always show when scheduled_minutes is set */
function schedHours(minutes: number | null | undefined): number | string {
  if (minutes == null) return "";
  const m = Number(minutes);
  if (isNaN(m)) return "";
  return Math.round((m / 60) * 100) / 100;
}

/**
 * Worked hours — only meaningful when clock_out exists.
 * If clock_in exists but clock_out does not, the shift is still in progress:
 * return blank rather than 0, which would imply 0 hours worked.
 */
function workedHours(minutes: number | null | undefined, clockOut: any): number | string {
  if (!clockOut || minutes == null) return "";
  const m = Number(minutes);
  if (isNaN(m)) return "";
  return Math.round((m / 60) * 100) / 100;
}

/**
 * Variance (worked − scheduled) — only meaningful when clock_out exists.
 * Returns blank for future/in-progress shifts.
 */
function shiftVariance(
  workedMin: number | null,
  schedMin:  number | null,
  clockOut:  any,
): number | string {
  if (!clockOut || workedMin == null) return "";
  const w = Number(workedMin);
  const s = Number(schedMin ?? 0);
  if (isNaN(w)) return "";
  return Math.round(((w - s) / 60) * 100) / 100;
}

// ── Status logic ──────────────────────────────────────────────────────────────
type ShiftStatus = "Scheduled" | "Completed" | "Missed";

function computeStatus(schedEnd: Date | string | null, workedStart: Date | string | null): ShiftStatus {
  const now = new Date();
  const end = schedEnd ? new Date(schedEnd as any) : null;

  // Future shift — never Missed or Completed
  if (end && end > now) return "Scheduled";

  // Past shift
  if (workedStart) return "Completed";
  return "Missed";
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function styleHeader(cell: ExcelJS.Cell) {
  cell.font      = { bold: true, size: 10, color: { argb: HEADER_FG } };
  cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
}

function styleLabel(cell: ExcelJS.Cell) {
  cell.font      = { bold: true, size: 10, color: { argb: DARK_TEXT } };
  cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_BG } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

function styleValue(cell: ExcelJS.Cell) {
  cell.font      = { size: 10, color: { argb: DARK_TEXT } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateHoursExcel(opts: HoursReportOptions): Promise<HoursReportResult> {
  const { customerId, accountName, weekStart, weekEnd } = opts;

  const rows = await fetchShifts(customerId, weekStart, weekEnd);

  // Derive account-level timezone from first row (all rows share one account)
  const accountTz: string = opts.timezone ?? rows[0]?.shift_tz ?? "America/New_York";

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const driverSet = new Set<string>();
  let totalSchedMin = 0;
  let totalWorkedMin = 0;

  for (const r of rows) {
    if (r.driver_name) driverSet.add(r.driver_name);
    totalSchedMin  += Number(r.scheduled_minutes) || 0;
    // Only count worked hours when clock_out exists (not in-progress shifts)
    if (r.worked_end) {
      totalWorkedMin += Number(r.worked_minutes) || 0;
    }
  }

  const totalSchedHrs  = Math.round((totalSchedMin  / 60) * 100) / 100;
  const totalWorkedHrs = Math.round((totalWorkedMin / 60) * 100) / 100;
  const totalVariance  = Math.round(((totalWorkedMin - totalSchedMin) / 60) * 100) / 100;
  const driverCount    = driverSet.size;
  const shiftCount     = rows.length;

  // ── MM/DD/YYYY week range for display ───────────────────────────────────────
  function isoToMDY(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  }
  const weekRange = `${isoToMDY(weekStart)} – ${isoToMDY(weekEnd)}`;

  const safeName = accountName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
  const fileName = `WeeklyShiftReport_${safeName}_${weekStart}.xlsx`;

  // ── Build workbook ──────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator  = "DriverHub 360";
  wb.created  = new Date();
  wb.modified = new Date();

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const sumSheet = wb.addWorksheet("Summary");

  sumSheet.columns = [
    { key: "label", width: 28 },
    { key: "value", width: 30 },
  ];

  // Account name header row
  const acctRow = sumSheet.addRow(["Account Name", accountName]);
  styleLabel(acctRow.getCell(1));
  styleValue(acctRow.getCell(2));
  acctRow.height = 20;

  // Week range row
  const weekRow = sumSheet.addRow(["Week Range", weekRange]);
  styleLabel(weekRow.getCell(1));
  styleValue(weekRow.getCell(2));
  weekRow.height = 20;

  // Blank spacer
  sumSheet.addRow([]).height = 8;

  // Metrics
  const metrics: [string, number | string][] = [
    ["Total Drivers",           driverCount],
    ["Total Shifts",            shiftCount],
    ["Total Scheduled Hours",   totalSchedHrs],
    ["Total Worked Hours",      totalWorkedHrs],
    ["Variance (Worked – Scheduled)", totalVariance],
  ];

  for (const [label, value] of metrics) {
    const row = sumSheet.addRow([label, value]);
    styleLabel(row.getCell(1));
    styleValue(row.getCell(2));
    row.getCell(2).alignment = { horizontal: "right" };
    row.height = 19;
  }

  // Generated line
  sumSheet.addRow([]).height = 8;
  const genRow = sumSheet.addRow([
    `Generated ${new Date().toLocaleString("en-US", { timeZone: accountTz })} ${
      new Intl.DateTimeFormat("en-US", { timeZone: accountTz, timeZoneName: "short" })
        .formatToParts(new Date())
        .find(p => p.type === "timeZoneName")?.value ?? ""
    }`,
  ]);
  genRow.getCell(1).font      = { italic: true, size: 8, color: { argb: MED_TEXT } };
  genRow.getCell(1).alignment = { horizontal: "left" };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Shift Detail
  // ═══════════════════════════════════════════════════════════════════════════
  const detSheet = wb.addWorksheet("Shift Detail");

  detSheet.columns = [
    { key: "date",       width: 13 },
    { key: "day",        width: 7  },
    { key: "driver",     width: 26 },
    { key: "location",   width: 30 },
    { key: "schedStart", width: 18 },
    { key: "schedEnd",   width: 18 },
    { key: "workStart",  width: 18 },
    { key: "workEnd",    width: 18 },
    { key: "schedHrs",   width: 13 },
    { key: "workedHrs",  width: 13 },
    { key: "variance",   width: 13 },
    { key: "status",     width: 13 },
  ];

  // Column header row (row 1 — frozen)
  const hdrRow = detSheet.addRow([
    "Date", "Day", "Driver Name", "Location",
    "Scheduled Start", "Scheduled End",
    "Worked Start", "Worked End",
    "Scheduled Hours", "Worked Hours", "Variance", "Status",
  ]);
  hdrRow.height = 22;
  hdrRow.eachCell(styleHeader);

  // Freeze header
  detSheet.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  let rowIdx = 0;
  for (const r of rows) {
    const tz     = r.shift_tz ?? accountTz;
    const status = computeStatus(r.sched_end, r.worked_start);

    const dataRow = detSheet.addRow([
      fmtDate(r.sched_start, tz),
      fmtDay(r.sched_start, tz),
      r.driver_name   ?? "",
      r.location_name ?? "",
      fmtTime(r.sched_start,   tz),
      fmtTime(r.sched_end,     tz),
      fmtTime(r.worked_start,  tz),
      fmtTime(r.worked_end,    tz),
      schedHours(r.scheduled_minutes),
      workedHours(r.worked_minutes, r.worked_end),
      shiftVariance(r.worked_minutes, r.scheduled_minutes, r.worked_end),
      status,
    ]);

    dataRow.height = 16;
    dataRow.eachCell((cell, col) => {
      cell.font      = { size: 9, color: { argb: DARK_TEXT } };
      cell.alignment = { horizontal: col >= 9 ? "right" : "left", vertical: "middle" };
      if (rowIdx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_BG } };
      }
    });

    rowIdx++;
  }

  // Empty data message
  if (rows.length === 0) {
    const emptyRow = detSheet.addRow(["No shifts found for this account and week range."]);
    emptyRow.getCell(1).font = { italic: true, size: 9, color: { argb: MED_TEXT } };
    detSheet.mergeCells(`A2:L2`);
  }

  // ── Write buffer ────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();

  return {
    buffer:      Buffer.from(buf),
    fileName,
    shiftCount,
    driverCount,
  };
}
