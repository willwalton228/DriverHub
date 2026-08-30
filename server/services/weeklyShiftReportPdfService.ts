/**
 * Weekly Shift Report PDF Service
 *
 * Client-facing report: clean table of Date | Driver | Scheduled | Worked | Status
 * Status logic:
 *   future shifts         → Scheduled
 *   today, not ended      → In Progress
 *   shift ended, no clock → Missed
 *   shift ended, ≤30m var → Completed
 *   shift ended, >30m var → Variance
 */

import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { pool } from "../db";

// ── Brand palette ─────────────────────────────────────────────────────────────
const BODY_DARK       = "#1F2937";
const BODY_MED        = "#6B7280";
const BODY_LIGHT      = "#9CA3AF";
const RULE_GRAY       = "#E5E7EB";

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_W    = 612;
const PAGE_H    = 792;
const ML        = 40;
const MR        = PAGE_W - 40;
const CONTENT_W = MR - ML;

// ── 5-column layout: Date | Driver | Scheduled | [gap] | Worked | Status ──────
// Widths are for the rect/background area; text widths are slightly narrower.
//   DATE   :  40 → 108   (68 px)
//   DRIVER : 112 → 248  (136 px)
//   SCHED  : 252 → 368  (116 px text → 108 usable)
//   [GAP]  : 368 → 384  ( 16 px whitespace between SCHED and WORKED)
//   WORKED : 384 → 492  (108 px)
//   STATUS : 496 → 572  ( 76 px)
const COL_DATE   = ML;           // x =  40
const COL_DRIVER = ML + 72;      // x = 112
const COL_SCHED  = ML + 212;     // x = 252
const COL_WORKED = ML + 344;     // x = 384  ← shifted right (+12) to widen gap
const COL_STATUS = ML + 456;     // x = 496

// Text widths (slightly narrower than slot to add inner padding)
const TW_DATE   = 64;
const TW_DRIVER = 132;
const TW_SCHED  = 106;   // sched text ends at 252+106 = 358; gap to 384 = 26 px
const TW_WORKED = 106;   // worked text ends at 384+106 = 490
const TW_STATUS = 76;

const VARIANCE_THRESHOLD_MIN = 30;

// ── Logo path resolution ───────────────────────────────────────────────────────
function resolveLogoPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "server/assets/dod-logo.jpg"),
  ];
  for (const p of candidates) {
    try { fs.accessSync(p); return p; } catch { /* try next */ }
  }
  return candidates[0];
}
const LOGO_PATH = resolveLogoPath();

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WeeklyShiftReportOptions {
  customerId:  string;
  accountName: string;
  weekStart:   string; // YYYY-MM-DD
  weekEnd:     string; // YYYY-MM-DD
  timezone?:   string; // IANA tz
}

export interface WeeklyShiftReportResult {
  buffer:         Buffer;
  fileName:       string;
  shiftCount:     number;
  driverCount:    number;
  workedCount:    number;
  exceptionCount: number;
}

type ShiftStatus = "Scheduled" | "In Progress" | "Completed" | "Missed" | "Variance";

interface ShiftRow {
  driverName:   string;
  schedStart:   Date | null;
  schedEnd:     Date | null;
  clockIn:      Date | null;
  clockOut:     Date | null;
  totalMinutes: number | null;
  timezone:     string;
  status:       ShiftStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(dt: Date | null, tz: string): string {
  if (!dt) return "—";
  return (
    dt.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz,
    }) +
    " " +
    tzAbbr(dt, tz)
  );
}

function tzAbbr(dt: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short", timeZone: tz,
    }).formatToParts(dt);
    return parts.find(p => p.type === "timeZoneName")?.value ?? "";
  } catch { return ""; }
}

function fmtMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** Short date for the Date column: "Mon 3/24" */
function fmtDateCol(dt: Date | null, tz: string): string {
  if (!dt) return "—";
  return dt.toLocaleDateString("en-US", {
    weekday: "short", month: "numeric", day: "numeric", timeZone: tz,
  });
}

function minsDiff(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/** Format minutes as "X.X hrs" */
function fmtHrs(mins: number): string {
  return (mins / 60).toFixed(1) + " hrs";
}

/** Derive status with correct temporal logic */
function deriveStatus(row: Omit<ShiftRow, "status">): ShiftStatus {
  const now        = new Date();
  const { schedStart, schedEnd, clockIn, clockOut, totalMinutes } = row;

  if (schedStart && schedStart > now) return "Scheduled";

  if (schedStart && schedStart <= now && schedEnd && schedEnd > now) {
    return "In Progress";
  }

  if (!clockIn) return "Missed";

  const schedMins  = minsDiff(schedStart, schedEnd) ?? 0;
  const workedMins = totalMinutes ?? minsDiff(clockIn, clockOut) ?? 0;
  if (Math.abs(schedMins - workedMins) > VARIANCE_THRESHOLD_MIN) return "Variance";

  return "Completed";
}

function statusColor(_s: ShiftStatus): string {
  return "#374151";   // dark gray — neutral
}

function statusBg(_s: ShiftStatus): string {
  return "#F3F4F6";   // light gray — no color coding
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchShiftRows(
  customerId: string,
  weekStart:  string,
  weekEnd:    string,
  tz:         string,
): Promise<ShiftRow[]> {
  const weExclDate = new Date(weekEnd + "T00:00:00Z");
  weExclDate.setUTCDate(weExclDate.getUTCDate() + 1);
  const weExcl = weExclDate.toISOString().split("T")[0];

  const res = await pool.query(`
    SELECT
      COALESCE(
        NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''),
        wu.name,
        'Unknown'
      )                            AS driver_name,
      s.start_time                 AS sched_start,
      s.end_time                   AS sched_end,
      t.clock_in,
      t.clock_out,
      t.total_minutes,
      COALESCE(l.timezone, $4)     AS shift_tz
    FROM wiw_shifts s
    JOIN wiw_users wu
      ON wu.id = s.wiw_user_id AND wu.wiw_status = 'active'
    LEFT JOIN drivers d ON d.id = wu.driver_id
    LEFT JOIN users   u ON u.id = d.user_id
    JOIN wiw_locations l ON l.id = s.wiw_location_id
    LEFT JOIN wiw_times t     ON t.wiw_shift_id = s.id
    WHERE l.account_id = $1
      AND s.start_time >= '2026-02-09'::date
      AND s.start_time >= $2::date
      AND s.start_time <  $3::date
      AND s.status NOT IN ('deleted', 'cancelled')
    ORDER BY s.start_time, driver_name
  `, [customerId, weekStart, weExcl, tz]);

  return res.rows.map((r: any) => {
    const partial: Omit<ShiftRow, "status"> = {
      driverName:   r.driver_name ?? "Unknown",
      schedStart:   r.sched_start   ? new Date(r.sched_start)  : null,
      schedEnd:     r.sched_end     ? new Date(r.sched_end)    : null,
      clockIn:      r.clock_in      ? new Date(r.clock_in)     : null,
      clockOut:     r.clock_out     ? new Date(r.clock_out)    : null,
      totalMinutes: r.total_minutes != null ? Number(r.total_minutes) : null,
      timezone:     r.shift_tz ?? tz,
    };
    return { ...partial, status: deriveStatus(partial) };
  });
}

// ── PDF builder ───────────────────────────────────────────────────────────────
export async function generateWeeklyShiftReport(
  opts: WeeklyShiftReportOptions,
  rowsOverride?: ShiftRow[],
): Promise<WeeklyShiftReportResult> {
  const tz   = opts.timezone ?? "America/New_York";
  const rows = rowsOverride ?? await fetchShiftRows(
    opts.customerId, opts.weekStart, opts.weekEnd, tz,
  );

  const uniqueDrivers = new Set(rows.map(r => r.driverName));
  const workedRows    = rows.filter(r => r.clockIn);

  // ── Compute totals ─────────────────────────────────────────────────────────
  const totalSchedMins = rows.reduce((sum, r) => {
    const m = minsDiff(r.schedStart, r.schedEnd);
    return sum + (m ?? 0);
  }, 0);

  // Worked total: only shifts that have clocked OUT (excludes Scheduled, In Progress, Missed)
  const totalWorkedMins = rows.reduce((sum, r) => {
    if (!r.clockOut) return sum;
    const m = r.totalMinutes ?? minsDiff(r.clockIn, r.clockOut) ?? 0;
    return sum + m;
  }, 0);

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ margin: 0, size: "LETTER", autoFirstPage: false });
  const pdfDone = collectBuffer(doc);
  let pageNum = 1;

  // ── Header ────────────────────────────────────────────────────────────────
  function drawHeader() {
    const LOGO_SIZE = 76;
    const HEADER_H  = LOGO_SIZE + 16;

    doc.rect(0, 0, PAGE_W, HEADER_H).fill("#FFFFFF");

    try {
      doc.image(LOGO_PATH, ML, 8, { width: LOGO_SIZE, height: LOGO_SIZE });
    } catch {
      doc.font("Helvetica-Bold").fontSize(13).fillColor(BODY_DARK)
        .text("DRIVER ON DEMAND", ML, 30, { width: 200 });
    }

    const rightTop = 16;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(BODY_DARK)
      .text(opts.accountName, ML, rightTop, { width: CONTENT_W, align: "right" });

    doc.font("Helvetica-Bold").fontSize(9).fillColor(BODY_MED)
      .text("WEEKLY SHIFT REPORT", ML, rightTop + 18, { width: CONTENT_W, align: "right" });

    doc.font("Helvetica").fontSize(8.5).fillColor(BODY_LIGHT)
      .text(
        `${fmtMDY(opts.weekStart)} – ${fmtMDY(opts.weekEnd)}`,
        ML, rightTop + 34, { width: CONTENT_W, align: "right" },
      );

    const genDate = new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: tz,
    });
    doc.font("Helvetica").fontSize(7.5).fillColor(BODY_LIGHT)
      .text(`Generated ${genDate}`, ML, rightTop + 52, { width: CONTENT_W, align: "right" });

    doc.rect(0, HEADER_H, PAGE_W, 1).fill(RULE_GRAY);
    doc.y = HEADER_H + 14;
  }

  // ── Table column header ───────────────────────────────────────────────────
  function drawTableHeader() {
    const y = doc.y;
    doc.rect(ML, y, CONTENT_W, 18).fill("#E5E7EB");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BODY_MED);
    doc.text("DATE",        COL_DATE,   y + 5, { width: TW_DATE });
    doc.text("DRIVER NAME", COL_DRIVER, y + 5, { width: TW_DRIVER });
    doc.text("SCHEDULED",   COL_SCHED,  y + 5, { width: TW_SCHED });
    doc.text("WORKED",      COL_WORKED, y + 5, { width: TW_WORKED });
    doc.text("STATUS",      COL_STATUS, y + 5, { width: TW_STATUS });
    doc.y = y + 18;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  function drawFooter() {
    const fy = PAGE_H - 32;
    doc.rect(0, fy, PAGE_W, 0.75).fill(RULE_GRAY);
    doc.rect(0, fy + 0.75, PAGE_W, 31.25).fill("#FFFFFF");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BODY_DARK)
      .text("Driver on Demand", ML, fy + 9, { width: 220 });
    doc.font("Helvetica").fontSize(7).fillColor(BODY_MED)
      .text("Powered by DriverHub 360", ML, fy + 19, { width: 220 });
    doc.font("Helvetica").fontSize(7.5).fillColor(BODY_MED)
      .text(`Page ${pageNum}`, ML, fy + 13, { width: CONTENT_W, align: "right" });
  }

  // ── Page overflow guard ───────────────────────────────────────────────────
  function maybeNewPage(needed: number) {
    if (doc.y + needed > PAGE_H - 42) {
      drawFooter();
      doc.addPage({ margin: 0, size: "LETTER" });
      pageNum++;
      drawHeader();
      drawTableHeader();
    }
  }

  // ── First page ─────────────────────────────────────────────────────────────
  doc.addPage({ margin: 0, size: "LETTER" });
  drawHeader();

  if (rows.length === 0) {
    doc.moveDown(3);
    doc.font("Helvetica-BoldOblique").fontSize(12).fillColor(BODY_LIGHT)
      .text("No scheduled shifts for this period.", ML, doc.y, {
        width: CONTENT_W, align: "center",
      });
  } else {
    drawTableHeader();

    // ── Data rows ────────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      maybeNewPage(22);
      const row  = rows[i];
      const rowY = doc.y;
      const ROW_H = 20;

      // Alternating row background
      if (i % 2 === 1) {
        doc.rect(ML, rowY, CONTENT_W, ROW_H).fill("#F9FAFB");
      }

      const dateStr = fmtDateCol(row.schedStart, row.timezone);

      const schedStr = row.schedStart
        ? `${fmtTime(row.schedStart, row.timezone)} – ${fmtTime(row.schedEnd, row.timezone)}`
        : "—";

      const isScheduledOrInProgress =
        row.status === "Scheduled" || row.status === "In Progress";
      const workedStr = isScheduledOrInProgress
        ? "—"
        : row.clockIn
          ? `${fmtTime(row.clockIn, row.timezone)} – ${fmtTime(row.clockOut, row.timezone)}`
          : "—";

      const textY = rowY + 5;

      doc.font("Helvetica").fontSize(8).fillColor(BODY_MED)
        .text(dateStr,        COL_DATE,   textY, { width: TW_DATE });
      doc.font("Helvetica").fontSize(8.5).fillColor(BODY_DARK)
        .text(row.driverName, COL_DRIVER, textY, { width: TW_DRIVER, ellipsis: true });
      doc.font("Helvetica").fontSize(8).fillColor(BODY_DARK)
        .text(schedStr,       COL_SCHED,  textY, { width: TW_SCHED });
      doc.font("Helvetica").fontSize(8).fillColor(BODY_MED)
        .text(workedStr,      COL_WORKED, textY, { width: TW_WORKED });

      // Status badge pill
      const sColor = statusColor(row.status);
      const sBg    = statusBg(row.status);
      const badgeW = 64;
      const badgeH = 13;
      const badgeX = COL_STATUS;
      const badgeY = rowY + 3;
      doc.rect(badgeX, badgeY, badgeW, badgeH).fill(sBg);
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(sColor)
        .text(row.status.toUpperCase(), badgeX, badgeY + 2.5, {
          width: badgeW, align: "center",
        });

      doc.y = rowY + ROW_H;
    }

    // ── Totals row ────────────────────────────────────────────────────────────
    maybeNewPage(28);

    const totY  = doc.y;
    const TOT_H = 24;

    // Thin separator above totals
    doc.rect(ML, totY, CONTENT_W, 1).fill("#D1D5DB");

    // Slightly darker background to distinguish from data rows
    doc.rect(ML, totY + 1, CONTENT_W, TOT_H - 1).fill("#ECEFF2");

    const totTextY = totY + 7;

    // "TOTALS" label — DATE column
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BODY_DARK)
      .text("TOTALS", COL_DATE, totTextY, { width: TW_DATE });

    // Driver column intentionally blank

    // Scheduled hours — under SCHEDULED column
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY_DARK)
      .text(fmtHrs(totalSchedMins), COL_SCHED, totTextY, { width: TW_SCHED });

    // Worked hours — under WORKED column
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY_DARK)
      .text(fmtHrs(totalWorkedMins), COL_WORKED, totTextY, { width: TW_WORKED });

    // Status column intentionally blank

    doc.y = totY + TOT_H;
  }

  drawFooter();
  doc.end();

  const buffer   = await pdfDone;
  const fileName = `WeeklyShiftReport_${safeName(opts.accountName)}_${opts.weekStart}.pdf`;

  return {
    buffer,
    fileName,
    shiftCount:     rows.length,
    driverCount:    uniqueDrivers.size,
    workedCount:    workedRows.length,
    exceptionCount: 0,
  };
}
