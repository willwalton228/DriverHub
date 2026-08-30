/**
 * Schedule Report PDF Service — Tickets 2.1 + 5.1
 *
 * Page 1: Customer-facing "Driver on Demand Shift Schedule"
 * Page 2: Weekly Performance Summary (prior week data only)
 *
 * Only includes data after ACQUISITION_CUTOFF (2026-02-09).
 * Only includes shifts with status not in ('deleted', 'cancelled').
 */

import PDFDocument from "pdfkit";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Constants ─────────────────────────────────────────────────────────────────
export const ACQUISITION_CUTOFF = "2026-02-09";

const BRAND_NAVY   = "#1F1F68";
const BRAND_DARK   = "#1A2332";
const BODY_DARK    = "#1F2937";
const BODY_MED     = "#6B7280";
const RULE_GRAY    = "#E5E7EB";
const DAY_BG       = "#F9FAFB";

// Page constants (LETTER = 612 × 792 pt)
const ML  = 50;   // left margin
const MR  = 562;  // right edge
const PW  = 512;  // printable width (MR - ML)

// Column X for page 1
const COL_DRIVER = ML;
const COL_TIME   = 370;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SchedulePdfOptions {
  customerId:  string;
  accountName: string;
  weekStart:   string; // YYYY-MM-DD  (Monday)
  weekEnd:     string; // YYYY-MM-DD  (Sunday)
}

export interface SchedulePdfResult {
  buffer:     Buffer;
  fileName:   string;
  shiftCount: number;
  driverCount: number;
}

export interface PerformanceSummary {
  priorWeekStart:  string;
  priorWeekEnd:    string;
  driversUsed:     number;
  totalShifts:     number;
  scheduledHours:  number;
  workedHours:     number;
  employeeOtHours: number;
  driversInOt:     number;
  totalEmployees:  number;
  pctDriversInOt:  number;
  peakDay:         string | null;
}

// ── Helpers (shared) ──────────────────────────────────────────────────────────
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
}

function formatTime(dt: Date, tz = "America/New_York"): string {
  return dt.toLocaleTimeString("en-US", {
    hour:     "2-digit",
    minute:   "2-digit",
    timeZone: tz,
    hour12:   true,
  });
}

function tzAbbr(tz: string, dt: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:     tz,
    timeZoneName: "short",
  }).formatToParts(dt);
  return parts.find(p => p.type === "timeZoneName")?.value ?? "";
}

function formatDayHeader(dt: Date, tz = "America/New_York"): string {
  return dt.toLocaleDateString("en-US", {
    weekday:  "long",
    month:    "long",
    day:      "numeric",
    year:     "numeric",
    timeZone: tz,
  }).toUpperCase();
}

function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const fmtDay = (s: string) => {
    const d = new Date(s + "T12:00:00Z");
    const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd   = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dayName} ${mm}/${dd}/${yyyy}`;
  };
  return `Schedule Week: ${fmtDay(weekStart)} \u2013 ${fmtDay(weekEnd)}`;
}

function dateKey(dt: Date, tz = "America/New_York"): string {
  return dt.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: tz,
  });
}

/** Round to 1 decimal, return as formatted string like "38.5h" */
function fmtHours(h: number): string {
  return h === 0 ? "0h" : `${Math.round(h * 10) / 10}h`;
}

function priorWeekDates(weekStart: string, weekEnd: string): { priorStart: string; priorEnd: string } {
  const s = new Date(weekStart + "T12:00:00Z");
  const e = new Date(weekEnd   + "T12:00:00Z");
  s.setUTCDate(s.getUTCDate() - 7);
  e.setUTCDate(e.getUTCDate() - 7);
  return {
    priorStart: s.toISOString().split("T")[0],
    priorEnd:   e.toISOString().split("T")[0],
  };
}

function exclusiveEnd(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Data: Page 1 shifts ───────────────────────────────────────────────────────
export async function fetchAccountShifts(
  customerId: string,
  weekStart:  string,
  weekEnd:    string,
): Promise<any[]> {
  const weExclusive = exclusiveEnd(weekEnd);
  const raw = await db.execute(sql`
    SELECT
      s.id,
      s.start_time,
      s.end_time,
      s.status,
      s.wiw_location_id,
      COALESCE(wl.timezone, c.timezone, 'America/New_York') AS shift_tz,
      COALESCE(
        NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''),
        wu.name
      ) AS driver_name
    FROM wiw_shifts s
    JOIN wiw_users wu ON wu.id = s.wiw_user_id
    LEFT JOIN drivers    d   ON d.id  = wu.driver_id
    LEFT JOIN users      u   ON u.id  = d.user_id
    JOIN wiw_locations wl ON wl.id = s.wiw_location_id
    LEFT JOIN customers     c  ON c.id::text = ${customerId}
    WHERE wl.account_id::text = ${customerId}
      AND s.start_time >= ${ACQUISITION_CUTOFF}::date
      AND s.start_time >= ${weekStart}::date
      AND s.start_time <  ${weExclusive}::date
      AND s.status NOT IN ('deleted', 'cancelled')
    ORDER BY s.start_time, driver_name
  `);
  return (raw as any).rows ?? (raw as any);
}

// ── Data: Page 2 performance summary ─────────────────────────────────────────
export async function fetchPerformanceSummary(
  customerId:     string,
  priorWeekStart: string,
  priorWeekEnd:   string,
  acctTz         = "America/New_York",
): Promise<PerformanceSummary> {
  const { pool } = await import("../db");
  const weExcl = exclusiveEnd(priorWeekEnd);

  // ── Core metrics: shifts ──────────────────────────────────────────────────
  const shiftQ = await pool.query(`
    SELECT
      COUNT(DISTINCT s.wiw_user_id)::int                      AS drivers_used,
      COUNT(s.id)::int                                         AS total_shifts,
      COALESCE(SUM(s.scheduled_minutes), 0)::numeric / 60.0   AS scheduled_hours
    FROM wiw_shifts s
    JOIN wiw_locations wl ON wl.id = s.wiw_location_id
    WHERE wl.account_id = $1
      AND s.start_time >= $2::date
      AND s.start_time <  $3::date
      AND s.start_time >= $4::date
      AND s.status NOT IN ('deleted', 'cancelled')
  `, [customerId, priorWeekStart, weExcl, ACQUISITION_CUTOFF]);

  const sm = shiftQ.rows[0] ?? {};

  // ── Core metrics: worked hours from time entries ──────────────────────────
  const timeQ = await pool.query(`
    SELECT COALESCE(SUM(t.total_minutes), 0)::numeric / 60.0 AS worked_hours
    FROM wiw_times t
    JOIN wiw_locations wl ON wl.id = t.wiw_location_id
    WHERE wl.account_id = $1
      AND t.clock_in >= $2::date
      AND t.clock_in <  $3::date
  `, [customerId, priorWeekStart, weExcl]);

  const tm = timeQ.rows[0] ?? {};

  // ── Labor health: per-driver hours (employee OT) ──────────────────────────
  const driverHoursQ = await pool.query(`
    SELECT
      wu.id                                                        AS wiw_user_id,
      COALESCE(d.driver_type, 'unknown')                           AS driver_type,
      COALESCE(SUM(t.total_minutes), 0)::numeric / 60.0           AS worked_hours
    FROM wiw_times t
    JOIN wiw_users wu ON wu.id = t.wiw_user_id
    LEFT JOIN drivers d ON d.id = wu.driver_id
    JOIN wiw_locations wl ON wl.id = t.wiw_location_id
    WHERE wl.account_id = $1
      AND t.clock_in >= $2::date
      AND t.clock_in <  $3::date
    GROUP BY wu.id, d.driver_type
  `, [customerId, priorWeekStart, weExcl]);

  const allDrivers    = driverHoursQ.rows;
  const empDrivers    = allDrivers.filter((r: any) => r.driver_type === "employee");
  const employeeOtHrs = empDrivers.reduce((sum: number, r: any) =>
    sum + Math.max(0, parseFloat(r.worked_hours ?? "0") - 40), 0);
  const driversInOt   = empDrivers.filter((r: any) => parseFloat(r.worked_hours ?? "0") > 40).length;
  const totalEmp      = empDrivers.length;
  const pctOt         = totalEmp > 0 ? (driversInOt / totalEmp) * 100 : 0;

  // ── Peak day ──────────────────────────────────────────────────────────────
  const peakDayQ = await pool.query(`
    SELECT
      DATE_TRUNC('day', s.start_time AT TIME ZONE $5)::date AS day,
      COUNT(*)::int AS shift_count
    FROM wiw_shifts s
    JOIN wiw_locations wl ON wl.id = s.wiw_location_id
    WHERE wl.account_id = $1
      AND s.start_time >= $2::date
      AND s.start_time <  $3::date
      AND s.start_time >= $4::date
      AND s.status NOT IN ('deleted', 'cancelled')
    GROUP BY 1
    ORDER BY shift_count DESC
    LIMIT 1
  `, [customerId, priorWeekStart, weExcl, ACQUISITION_CUTOFF, acctTz]);

  let peakDay: string | null = null;
  if (peakDayQ.rows.length > 0) {
    const d = new Date(peakDayQ.rows[0].day + "T12:00:00Z");
    peakDay = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  }

  return {
    priorWeekStart,
    priorWeekEnd,
    driversUsed:     sm.drivers_used     ?? 0,
    totalShifts:     sm.total_shifts     ?? 0,
    scheduledHours:  parseFloat(sm.scheduled_hours ?? "0"),
    workedHours:     parseFloat(tm.worked_hours     ?? "0"),
    employeeOtHours: employeeOtHrs,
    driversInOt,
    totalEmployees:  totalEmp,
    pctDriversInOt:  pctOt,
    peakDay,
  };
}

// ── PDF: Page 2 renderer ──────────────────────────────────────────────────────

function drawPerformancePage(
  doc:         PDFKit.PDFDocument,
  perf:        PerformanceSummary,
  opts:        SchedulePdfOptions,
  pageNumRef:  { n: number },
) {
  doc.addPage({ margin: 0, size: "LETTER" });
  pageNumRef.n++;

  // ── Banner ─────────────────────────────────────────────────────────────────
  doc.rect(0, 0, 612, 90).fill(BRAND_NAVY);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#FFFFFF")
    .text("DRIVER ON DEMAND", ML, 18, { width: 350 });
  doc.font("Helvetica").fontSize(11).fillColor("rgba(255,255,255,0.88)")
    .text("PERFORMANCE SUMMARY", ML, 43, { width: 350, characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF")
    .text(opts.accountName, 340, 22, { width: 222, align: "right" });

  // Week range bar (prior week)
  doc.rect(0, 90, 612, 28).fill(BRAND_DARK);
  const priorLabel = weekRangeLabel(perf.priorWeekStart, perf.priorWeekEnd) + "  ·  Prior Week";
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF")
    .text(priorLabel, ML, 99, { width: PW, align: "center" });

  let y = 136;

  // ── Helper: section label ─────────────────────────────────────────────────
  function sectionLabel(title: string, subtitle?: string) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY_MED)
      .text(title.toUpperCase(), ML, y, { characterSpacing: 1.2 });
    if (subtitle) {
      doc.font("Helvetica").fontSize(7.5).fillColor("#9CA3AF")
        .text(subtitle, ML + doc.widthOfString(title.toUpperCase()) + 8, y);
    }
    y += 14;
    doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).stroke(RULE_GRAY);
    y += 8;
  }

  // ── Helper: KPI card ──────────────────────────────────────────────────────
  function kpiCard(
    x: number, cardY: number, w: number, h: number,
    label: string, value: string,
    sub?: string, dimmed = false,
  ) {
    // Card background + border
    doc.roundedRect(x, cardY, w, h, 4)
      .fillAndStroke(dimmed ? "#F9FAFB" : "#FFFFFF", "#E5E7EB");

    // Label
    doc.font("Helvetica").fontSize(7).fillColor(BODY_MED)
      .text(label.toUpperCase(), x + 10, cardY + 10, { width: w - 20, align: "center", characterSpacing: 0.6 });

    // Value
    const valY = cardY + 26;
    doc.font("Helvetica-Bold").fontSize(dimmed ? 14 : 22).fillColor(dimmed ? "#9CA3AF" : BODY_DARK)
      .text(value, x + 4, valY, { width: w - 8, align: "center" });

    // Sub-label
    if (sub) {
      doc.font("Helvetica").fontSize(7).fillColor("#9CA3AF")
        .text(sub, x + 4, cardY + h - 14, { width: w - 8, align: "center" });
    }
  }

  // ── Helper: placeholder row ───────────────────────────────────────────────
  function placeholderRow(label: string, x: number, rowY: number, w: number) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#D1D5DB")
      .text(label, x + 10, rowY + 6, { width: w * 0.6 - 10 });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#D1D5DB")
      .text("—", x + w * 0.6, rowY + 6, { width: w * 0.4 - 10, align: "right" });
  }

  // ── Section 2: Core Metrics ───────────────────────────────────────────────
  sectionLabel("Core Metrics");

  const N4   = 4;
  const GAP4 = 8;
  const CW4  = Math.floor((PW - GAP4 * (N4 - 1)) / N4); // ~124
  const CH   = 72;

  const coreCards = [
    { label: "Total Drivers Used", value: String(perf.driversUsed),          sub: "unique drivers"     },
    { label: "Total Shifts",        value: String(perf.totalShifts),          sub: "shift records"      },
    { label: "Scheduled Hours",     value: fmtHours(perf.scheduledHours),     sub: "from shift records" },
    { label: "Worked Hours",        value: fmtHours(perf.workedHours),        sub: "from time entries"  },
  ];

  coreCards.forEach((c, i) => {
    kpiCard(ML + i * (CW4 + GAP4), y, CW4, CH, c.label, c.value, c.sub);
  });
  y += CH + 18;

  // ── Section 3: Labor Health ───────────────────────────────────────────────
  sectionLabel("Labor Health", "(Employee drivers only · OT threshold: 40 hrs/week)");

  const N3   = 3;
  const GAP3 = 10;
  const CW3  = Math.floor((PW - GAP3 * (N3 - 1)) / N3); // ~164

  const laborCards = [
    { label: "Employee OT Hours",  value: fmtHours(perf.employeeOtHours), sub: "total OT this week" },
    { label: "Drivers in OT",      value: String(perf.driversInOt),        sub: `of ${perf.totalEmployees} employee${perf.totalEmployees !== 1 ? "s" : ""}` },
    { label: "% Drivers in OT",    value: perf.totalEmployees > 0 ? `${Math.round(perf.pctDriversInOt)}%` : "—", sub: "employees over 40h" },
  ];

  laborCards.forEach((c, i) => {
    const accented = i === 0 && perf.employeeOtHours > 0;
    kpiCard(ML + i * (CW3 + GAP3), y, CW3, CH, c.label, c.value, c.sub);
    // OT warning accent
    if (accented) {
      doc.roundedRect(ML, y, 3, CH, 1.5).fill("#F59E0B");
    }
  });
  y += CH + 18;

  // ── Section 4: Operations (Placeholder) ──────────────────────────────────
  sectionLabel("Operations", "— Phase 2 · Data Not Yet Available");

  const phW    = Math.floor((PW - 10) / 2);
  const phH    = 22;
  const opRows = [
    ["Total Moves", "Moves per Driver"],
    ["Cost per Move", "On-Time %"],
    ["Avg Time per Move", ""],
  ];

  for (const [left, right] of opRows) {
    doc.rect(ML, y, PW, phH).fillAndStroke("#F9FAFB", RULE_GRAY);
    placeholderRow(left,  ML,          y, phW);
    if (right) {
      doc.moveTo(ML + phW + 5, y + 4).lineTo(ML + phW + 5, y + phH - 4).lineWidth(0.5).stroke(RULE_GRAY);
      placeholderRow(right, ML + phW + 10, y, phW);
    }
    y += phH + 2;
  }
  y += 10;

  // ── Section 5: Financials (Placeholder) ──────────────────────────────────
  sectionLabel("Financials", "— Phase 2 · Data Not Yet Available");

  const finRows = [
    ["Labor Cost", "Revenue"],
    ["Margin", "Margin %"],
  ];

  for (const [left, right] of finRows) {
    doc.rect(ML, y, PW, phH).fillAndStroke("#F9FAFB", RULE_GRAY);
    placeholderRow(left,  ML,          y, phW);
    doc.moveTo(ML + phW + 5, y + 4).lineTo(ML + phW + 5, y + phH - 4).lineWidth(0.5).stroke(RULE_GRAY);
    placeholderRow(right, ML + phW + 10, y, phW);
    y += phH + 2;
  }
  y += 10;

  // ── Section 6: Insight Callout ────────────────────────────────────────────
  sectionLabel("Insights");

  const insights: string[] = [];
  if (perf.driversInOt > 0) {
    insights.push(
      `${perf.driversInOt} driver${perf.driversInOt !== 1 ? "s" : ""} exceeded the overtime threshold ` +
      `(40 hrs) — ${fmtHours(perf.employeeOtHours)} total OT recorded.`
    );
  } else if (perf.totalEmployees > 0) {
    insights.push("No employee drivers exceeded overtime thresholds this week.");
  }
  if (perf.peakDay) {
    insights.push(`Peak scheduling occurred on ${perf.peakDay} with the highest shift volume.`);
  }
  if (insights.length === 0) {
    insights.push("Insufficient shift data available for the prior week.");
  }

  for (const insight of insights) {
    doc.roundedRect(ML, y, PW, 28, 3).fillAndStroke("#EEF2FF", "#C7D2FE");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BRAND_NAVY)
      .text("›", ML + 10, y + 9);
    doc.font("Helvetica").fontSize(8.5).fillColor(BRAND_DARK)
      .text(insight, ML + 22, y + 9, { width: PW - 32 });
    y += 34;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footY = 742;
  doc.moveTo(ML, footY).lineTo(MR, footY).lineWidth(0.5).stroke(RULE_GRAY);
  doc.font("Helvetica").fontSize(7.5).fillColor(BODY_MED)
    .text(
      `Generated by DriverHub 360 · ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`,
      ML, footY + 6, { width: 350 },
    );
  doc.font("Helvetica").fontSize(7.5).fillColor(BODY_MED)
    .text(`Page ${pageNumRef.n}`, ML, footY + 6, { width: PW, align: "right" });
}

// ── PDF Generation ────────────────────────────────────────────────────────────
export async function generateSchedulePdf(
  opts:           SchedulePdfOptions,
  shiftsOverride?: any[],
): Promise<SchedulePdfResult> {
  const shifts = shiftsOverride ?? await fetchAccountShifts(opts.customerId, opts.weekStart, opts.weekEnd);

  // Resolve account timezone from the first shift that has one; fall back to Eastern
  const acctTz: string = shifts.find((s: any) => s.shift_tz)?.shift_tz ?? "America/New_York";

  // Fetch prior-week performance summary in parallel with shift processing
  const { priorStart, priorEnd } = priorWeekDates(opts.weekStart, opts.weekEnd);
  const perfPromise = fetchPerformanceSummary(opts.customerId, priorStart, priorEnd, acctTz);

  // Group shifts by day using the account's resolved timezone
  const byDay    = new Map<string, any[]>();
  const dayOrder: string[] = [];
  const dayDates = new Map<string, Date>();
  for (const s of shifts) {
    const dt  = new Date(s.start_time);
    const key = dateKey(dt, acctTz);
    if (!byDay.has(key)) {
      byDay.set(key, []);
      dayOrder.push(key);
      dayDates.set(key, dt);
    }
    byDay.get(key)!.push(s);
  }

  const uniqueDrivers = new Set(shifts.map((s: any) => s.driver_name ?? "Unknown"));
  const fileName      = `Schedule_${safeName(opts.accountName)}_${opts.weekStart}.pdf`;

  // Await performance data (will be ready by now)
  const perf = await perfPromise;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 0, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageNumRef = { n: 1 };

    // ── Shared page 1 header ────────────────────────────────────────────────
    function drawHeader() {
      doc.rect(0, 0, 612, 90).fill(BRAND_NAVY);
      doc.font("Helvetica-Bold").fontSize(20).fillColor("#FFFFFF")
        .text("DRIVER ON DEMAND", ML, 18, { width: 350 });
      doc.font("Helvetica").fontSize(11).fillColor("rgba(255,255,255,0.88)")
        .text("SHIFT SCHEDULE", ML, 43, { width: 350, characterSpacing: 1.5 });
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF")
        .text(opts.accountName, 340, 22, { width: 222, align: "right" });
      doc.rect(0, 90, 612, 28).fill(BRAND_DARK);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF")
        .text(weekRangeLabel(opts.weekStart, opts.weekEnd), ML, 99, { width: PW, align: "center" });
      doc.y = 118 + 12;
    }

    function drawColumnHeaders() {
      const y = doc.y;
      doc.rect(ML, y, MR - ML, 18).fill("#F3F4F6");
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY_MED)
        .text("DRIVER NAME", COL_DRIVER, y + 5, { width: 300 });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY_MED)
        .text("SHIFT TIME", COL_TIME, y + 5, { width: 140, align: "right" });
      doc.y = y + 18;
    }

    function drawFooter() {
      const y = 742;
      doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).stroke(RULE_GRAY);
      doc.font("Helvetica").fontSize(7.5).fillColor(BODY_MED)
        .text(
          `Generated by DriverHub 360 · ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`,
          ML, y + 6, { width: 350 },
        );
      doc.font("Helvetica").fontSize(7.5).fillColor(BODY_MED)
        .text(`Page ${pageNumRef.n}`, ML, y + 6, { width: PW, align: "right" });
    }

    function maybeNewPage(neededHeight: number) {
      if (doc.y + neededHeight > 730) {
        drawFooter();
        doc.addPage({ margin: 0, size: "LETTER" });
        pageNumRef.n++;
        drawHeader();
        drawColumnHeaders();
      }
    }

    // ── Page 1 ─────────────────────────────────────────────────────────────
    drawHeader();
    drawColumnHeaders();

    if (dayOrder.length === 0) {
      doc.moveDown(3);
      doc.font("Helvetica-BoldOblique").fontSize(12).fillColor(BODY_MED)
        .text("No scheduled shifts for this week.", { align: "center" });
    } else {
      for (const dayKey of dayOrder) {
        const dayShifts = byDay.get(dayKey)!;
        const dt        = dayDates.get(dayKey)!;

        maybeNewPage(30 + dayShifts.length * 22);
        const dHdrY = doc.y + 6;
        doc.rect(ML, dHdrY, MR - ML, 22).fill(DAY_BG);
        doc.moveTo(ML, dHdrY).lineTo(ML + 3, dHdrY).lineWidth(3).stroke(BRAND_NAVY);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND_DARK)
          .text(formatDayHeader(dt, acctTz), ML + 8, dHdrY + 6, { width: MR - ML - 16 });
        doc.y = dHdrY + 22;

        for (let i = 0; i < dayShifts.length; i++) {
          const shift = dayShifts[i];
          maybeNewPage(22);

          const rowY   = doc.y;
          const isEven = i % 2 === 1;
          if (isEven) doc.rect(ML, rowY, MR - ML, 20).fill("#FAFAFA");

          const startDt = new Date(shift.start_time);
          const endDt   = shift.end_time ? new Date(shift.end_time) : null;
          const tz      = shift.shift_tz ?? acctTz;
          const abbr    = tzAbbr(tz, startDt);
          const timeStr = endDt
            ? `${formatTime(startDt, tz)} – ${formatTime(endDt, tz)} ${abbr}`
            : `${formatTime(startDt, tz)} ${abbr}`;

          doc.font("Helvetica").fontSize(9.5).fillColor(BODY_DARK)
            .text(shift.driver_name ?? "Unknown", COL_DRIVER, rowY + 5, { width: 310 });
          doc.font("Helvetica").fontSize(9.5).fillColor(BODY_DARK)
            .text(timeStr, COL_TIME, rowY + 5, { width: 140, align: "right" });
          doc.y = rowY + 20;
        }

        doc.moveDown(0.4);
      }
    }

    // Summary line
    doc.moveDown(1.2);
    doc.moveTo(ML, doc.y).lineTo(MR, doc.y).lineWidth(0.5).stroke(RULE_GRAY);
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(8).fillColor(BODY_MED)
      .text(
        `Total: ${shifts.length} shift${shifts.length !== 1 ? "s" : ""} · ` +
        `${uniqueDrivers.size} driver${uniqueDrivers.size !== 1 ? "s" : ""}`,
        { align: "right" },
      );

    drawFooter();

    // ── Page 2: Performance Summary ─────────────────────────────────────────
    drawPerformancePage(doc, perf, opts, pageNumRef);

    doc.end();
  });

  return {
    buffer,
    fileName,
    shiftCount:  shifts.length,
    driverCount: uniqueDrivers.size,
  };
}
