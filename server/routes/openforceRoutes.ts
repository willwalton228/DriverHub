import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { db } from "../db";
import { sql, eq, and, desc, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  openforceImportBatches, openforceImportRawRows, openforceTransactions,
  openforceMatchAuditLog, openforceReconciliationResults, drivers,
} from "../../shared/schema";
import { isAuthenticated } from "../replitAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUserId(req: any): string | null {
  return (req.session as any)?.userId || req.user?.claims?.sub || null;
}

/** Write an entry to the match audit log */
async function insertAuditEntry(opts: {
  transactionId: string;
  actionType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  previousExceptionType?: string | null;
  assignedDriverId?: string | null;
  userId?: string | null;
  notes?: string | null;
}) {
  try {
    await db.insert(openforceMatchAuditLog).values({
      transactionId: opts.transactionId,
      actionType: opts.actionType,
      previousStatus: opts.previousStatus ?? null,
      newStatus: opts.newStatus ?? null,
      previousExceptionType: opts.previousExceptionType ?? null,
      assignedDriverId: opts.assignedDriverId ?? null,
      userId: opts.userId ?? null,
      notes: opts.notes ?? null,
    });
  } catch (e) {
    console.warn("[openforce audit] failed to write audit entry:", e);
  }
}

/** Recompute and persist resolved/unresolved counts for a batch */
async function refreshBatchExceptionCounts(batchId: string) {
  const row = await db.execute(sql`
    SELECT
      SUM(CASE WHEN has_exception AND exception_resolved_at IS NOT NULL THEN 1 ELSE 0 END)::int AS resolved,
      SUM(CASE WHEN has_exception AND exception_resolved_at IS NULL THEN 1 ELSE 0 END)::int AS unresolved
    FROM openforce_transactions
    WHERE import_batch_id = ${batchId} AND is_archived = false
  `);
  const r = (row.rows[0] as any) ?? {};
  await db.update(openforceImportBatches).set({
    resolvedRows: r.resolved ?? 0,
    unresolvedRows: r.unresolved ?? 0,
    updatedAt: new Date(),
  }).where(eq(openforceImportBatches.id, batchId));
}

/** Normalise column name: lower-case, trim, collapse whitespace, strip special chars */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 _]/g, "").replace(/\s+/g, "_").trim();
}

/** Try many column aliases to read a field from a raw row */
function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k] ?? row[normKey(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function parseNumeric(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function parseInt10(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return isNaN(n) ? null : n;
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ─── Column aliases for OpenForce settlement files ────────────────────────────
// OpenForce exports vary; we try many column names
const COL = {
  openforceId:  ["openforce_id", "contractor_id", "ic_id", "provider_id", "worker_id", "id"],
  settlementId: ["settlement_id", "payroll_id", "check_number", "payment_id", "settlement_number"],
  driverName:   ["driver_name", "contractor_name", "name", "full_name", "worker_name"],
  periodStart:  ["period_start", "week_start", "pay_period_start", "start_date", "pay_date"],
  periodEnd:    ["period_end", "week_end", "pay_period_end", "end_date"],
  hours:        ["hours_worked", "total_hours", "hours", "worked_hours"],
  trips:        ["trips_completed", "total_trips", "trips", "moves", "deliveries"],
  grossPay:     ["gross_pay", "gross", "total_pay", "total_earnings", "earnings"],
  deductions:   ["deductions", "total_deductions", "deduction"],
  netPay:       ["net_pay", "net", "net_earnings", "amount_paid"],
};

/** Extract normalized fields from a raw row object */
function parseRow(raw: Record<string, string>) {
  const openforceId  = pick(raw, ...COL.openforceId);
  const settlementId = pick(raw, ...COL.settlementId);
  const driverName   = pick(raw, ...COL.driverName);
  const periodStart  = parseDate(pick(raw, ...COL.periodStart));
  const periodEnd    = parseDate(pick(raw, ...COL.periodEnd));
  const hoursWorked  = parseNumeric(pick(raw, ...COL.hours));
  const trips        = parseInt10(pick(raw, ...COL.trips));
  const grossPay     = parseNumeric(pick(raw, ...COL.grossPay));
  const deductions   = parseNumeric(pick(raw, ...COL.deductions)) ?? 0;
  const netPay       = parseNumeric(pick(raw, ...COL.netPay)) ?? (grossPay !== null ? grossPay - deductions : null);
  return { openforceId, settlementId, driverName, periodStart, periodEnd, hoursWorked, trips, grossPay, deductions, netPay };
}

/** Run the driver matching engine on a batch */
async function runMatchingEngine(batchId: string) {
  // Load all raw rows for this batch
  const rawRows = await db.select().from(openforceImportRawRows)
    .where(eq(openforceImportRawRows.importBatchId, batchId));

  // Load all drivers that have an openforceId
  const allDrivers = await db.execute(sql`
    SELECT id, openforce_id, driver_classification, first_name, last_name
    FROM drivers
    LEFT JOIN users ON drivers.user_id = users.id
    WHERE openforce_id IS NOT NULL AND openforce_id != ''
  `);

  const ofIdMap = new Map<string, typeof allDrivers.rows[0][]>();
  for (const d of allDrivers.rows as any[]) {
    const key = String(d.openforce_id || "").trim().toLowerCase();
    if (!key) continue;
    if (!ofIdMap.has(key)) ofIdMap.set(key, []);
    ofIdMap.get(key)!.push(d);
  }

  let matched = 0, exceptions = 0;

  for (const row of rawRows) {
    const parsed = parseRow(row.rawRowJson as Record<string, string>);
    const ofKey = (parsed.openforceId || "").toLowerCase();

    // Check for duplicates in this batch first
    const dupeCheck = rawRows.filter(r => {
      const p = parseRow(r.rawRowJson as Record<string, string>);
      return p.openforceId && p.openforceId.toLowerCase() === ofKey && r.id !== row.id;
    });

    let status: "matched" | "exception" = "matched";
    let exceptionType: string | null = null;
    let exceptionNote: string | null = null;
    let matchedDriverId: string | null = null;

    // ── Exception detection with standardized types ──────────────────────────
    if (!ofKey) {
      status = "exception"; exceptionType = "missing_openforce_id";
      exceptionNote = "No OpenForce ID present in source row — cannot match to driver";
    } else if (dupeCheck.length > 0) {
      status = "exception"; exceptionType = "duplicate_transaction";
      exceptionNote = `Duplicate OpenForce ID '${parsed.openforceId}' found ${dupeCheck.length + 1} times in this batch`;
    } else {
      const candidates = ofIdMap.get(ofKey) ?? [];
      if (candidates.length === 0) {
        status = "exception"; exceptionType = "openforce_id_not_found";
        exceptionNote = `No DriverHub driver found with OpenForce ID '${parsed.openforceId}'`;
      } else if (candidates.length > 1) {
        status = "exception"; exceptionType = "duplicate_openforce_id";
        exceptionNote = `Multiple DriverHub drivers share OpenForce ID '${parsed.openforceId}' — ambiguous match`;
      } else {
        const d = candidates[0] as any;
        if (d.driver_classification !== "Independent Contractor") {
          status = "exception"; exceptionType = "driver_not_marked_as_ic";
          exceptionNote = `Driver ${d.first_name} ${d.last_name} is classified as '${d.driver_classification || "unknown"}' — must be Independent Contractor`;
        } else {
          matchedDriverId = d.id;
        }
      }
    }

    // Compute rates if we have valid data
    const gp = parsed.grossPay;
    const h  = parsed.hoursWorked;
    const t  = parsed.trips;
    const effectiveHourlyRate = gp !== null && h && h > 0 ? Math.round((gp / h) * 10000) / 10000 : null;
    const effectivePerTripRate = gp !== null && t && t > 0 ? Math.round((gp / t) * 10000) / 10000 : null;
    const costPerMove = effectivePerTripRate;

    // ── Secondary validation after matching ─────────────────────────────────
    let hasException = status === "exception";
    if (!hasException) {
      // Missing required fields check (pay + at least hours OR trips)
      if (parsed.grossPay === null) {
        hasException = true; exceptionType = "missing_required_fields";
        exceptionNote = "Missing gross pay — cannot validate settlement record";
      } else if (h === null && t === null) {
        hasException = true; exceptionType = "missing_required_fields";
        exceptionNote = "Missing hours and trips — cannot compute effective rate";
      } else if (effectiveHourlyRate !== null && (effectiveHourlyRate < 5 || effectiveHourlyRate > 100)) {
        hasException = true; exceptionType = "abnormal_rate";
        exceptionNote = `Effective hourly rate $${effectiveHourlyRate.toFixed(2)}/hr is outside expected range ($5–$100)`;
      }
    }

    if (status === "matched" && !hasException) matched++;
    else { status = "exception"; exceptions++; }

    // Insert into openforce_transactions
    const [txId] = await db.insert(openforceTransactions).values({
      importBatchId: batchId,
      rawRowId: row.id,
      openforceId: parsed.openforceId ?? null,
      settlementId: parsed.settlementId ?? null,
      periodStart: parsed.periodStart ?? null,
      periodEnd: parsed.periodEnd ?? null,
      rawDriverName: parsed.driverName ?? null,
      matchedDriverId,
      matchStatus: hasException ? "exception" : "matched",
      hoursWorked: parsed.hoursWorked !== null ? String(parsed.hoursWorked) : null,
      tripsCompleted: parsed.trips ?? null,
      grossPay: parsed.grossPay !== null ? String(parsed.grossPay) : null,
      deductions: String(parsed.deductions),
      netPay: parsed.netPay !== null ? String(parsed.netPay) : null,
      effectiveHourlyRate: effectiveHourlyRate !== null ? String(effectiveHourlyRate) : null,
      effectivePerTripRate: effectivePerTripRate !== null ? String(effectivePerTripRate) : null,
      costPerMove: costPerMove !== null ? String(costPerMove) : null,
      hasException,
      exceptionType: exceptionType ?? null,
      exceptionNote: exceptionNote ?? null,
    }).returning({ id: openforceTransactions.id });

    // Update raw row
    await db.update(openforceImportRawRows)
      .set({ processingStatus: hasException ? "exception" : "matched", transactionId: txId.id, updatedAt: new Date() })
      .where(eq(openforceImportRawRows.id, row.id));

    // Write audit log entry for auto-match
    await insertAuditEntry({
      transactionId: txId.id,
      actionType: hasException ? "auto_exception" : "auto_match",
      previousStatus: null,
      newStatus: hasException ? "exception" : "matched",
      previousExceptionType: null,
      assignedDriverId: matchedDriverId,
      userId: null,
      notes: exceptionNote ?? (matchedDriverId ? `Auto-matched to driver ${matchedDriverId}` : null),
    });
  }

  // Link account via driver's primary account
  if (matched > 0) {
    const txs = await db.select().from(openforceTransactions)
      .where(and(eq(openforceTransactions.importBatchId, batchId), isNotNull(openforceTransactions.matchedDriverId)));
    for (const tx of txs) {
      if (!tx.matchedDriverId) continue;
      const acct = await db.execute(sql`
        SELECT c.id, c.name, c.account_number
        FROM customer_driver_assignments cda
        JOIN customers c ON cda.customer_id = c.id
        WHERE cda.driver_id = ${tx.matchedDriverId}
          AND cda.is_primary = true
        LIMIT 1
      `);
      if (acct.rows.length > 0) {
        const a = acct.rows[0] as any;
        await db.update(openforceTransactions)
          .set({ linkedAccountId: a.id, linkedAccountName: a.name, linkedAccountNumber: a.account_number, updatedAt: new Date() })
          .where(eq(openforceTransactions.id, tx.id));
      }
    }
  }

  // Update batch
  const totalGross = rawRows.reduce((s, r) => {
    const p = parseRow(r.rawRowJson as Record<string, string>);
    return s + (p.grossPay ?? 0);
  }, 0);
  const totalNet = rawRows.reduce((s, r) => {
    const p = parseRow(r.rawRowJson as Record<string, string>);
    return s + (p.netPay ?? 0);
  }, 0);

  await db.update(openforceImportBatches).set({
    processingStatus: "matched",
    matchedRows: matched,
    exceptionRows: exceptions,
    unresolvedRows: exceptions, // initially all exceptions are unresolved
    resolvedRows: 0,
    totalGrossPay: String(Math.round(totalGross * 100) / 100),
    totalNetPay:   String(Math.round(totalNet * 100) / 100),
    updatedAt: new Date(),
  }).where(eq(openforceImportBatches.id, batchId));

  // Run pay reconciliation engine automatically after matching
  try { await runPayReconciliationEngine(batchId); } catch(e) { console.warn("[openforce recon] engine error:", e); }
  // Run cost per move engine automatically after reconciliation
  try { await runCostPerMoveEngine(batchId); } catch(e) { console.warn("[openforce cost-engine] engine error:", e); }

  return { matched, exceptions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pay Reconciliation Engine
// Runs after matching: for every matched transaction, computes system hours/trips,
// calculates effective rates, performs variance analysis, and flags anomalies.
// ─────────────────────────────────────────────────────────────────────────────

const HOURS_TOLERANCE = 0.25;   // configurable: acceptable hour gap
const TRIP_TOLERANCE = 0;       // configurable: acceptable trip gap

const HOURLY_HIGH_THRESHOLD = 75;   // $/hr
const HOURLY_LOW_THRESHOLD = 8;     // $/hr
const TRIP_HIGH_THRESHOLD = 50;     // $/trip
const TRIP_LOW_THRESHOLD = 5;       // $/trip

async function runPayReconciliationEngine(batchId: string): Promise<{ processed: number }> {
  // Fetch all matched, non-archived transactions for this batch
  const transactions = await db.execute(sql`
    SELECT
      ot.id,
      ot.matched_driver_id AS driver_id,
      ot.openforce_id,
      ot.import_batch_id,
      ot.period_start,
      ot.period_end,
      ot.gross_pay::numeric AS gross_pay,
      ot.hours_worked::numeric AS reported_hours,
      ot.trips_completed AS reported_trips
    FROM openforce_transactions ot
    WHERE ot.import_batch_id = ${batchId}
      AND ot.match_status = 'matched'
      AND ot.is_archived = false
      AND ot.has_exception = false
  `);

  let processed = 0;
  for (const tx of transactions.rows as any[]) {
    const {
      id: transactionId, driver_id: driverId, openforce_id: openforceId,
      period_start, period_end, gross_pay, reported_hours, reported_trips,
    } = tx;

    if (!driverId || !period_start || !period_end) continue;

    // Pull system trips from DriverHub trips table for this driver + period
    const systemTripRow = await db.execute(sql`
      SELECT COUNT(*)::int AS trip_count
      FROM trips
      WHERE driver_id = ${driverId}
        AND status = 'completed'
        AND trip_date >= ${period_start}::date
        AND trip_date <= ${period_end}::date
    `);
    const systemTrips: number = (systemTripRow.rows[0] as any)?.trip_count ?? 0;

    // Pull system hours from shift_assignments for this driver + period
    // Fall back to estimating from trips if shifts are not available
    const shiftHoursRow = await db.execute(sql`
      SELECT
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (sh.end_time - sh.start_time))/3600.0),
          0
        )::numeric AS shift_hours
      FROM shift_assignments sa
      JOIN shifts sh ON sa.shift_id = sh.id
      WHERE sa.driver_id = ${driverId}
        AND sh.date >= ${period_start}::date
        AND sh.date <= ${period_end}::date
        AND sa.status NOT IN ('declined', 'no_show')
    `);
    let systemHours: number = parseFloat((shiftHoursRow.rows[0] as any)?.shift_hours ?? "0");
    // If no shift data, estimate from trips (assume avg 30 min per trip)
    if (systemHours === 0 && systemTrips > 0) {
      systemHours = 0; // keep as zero — insufficient_data
    }

    // Compute effective rates
    const gp = parseFloat(String(gross_pay ?? "0"));
    const rh = reported_hours !== null ? parseFloat(String(reported_hours)) : null;
    const rt = reported_trips !== null ? parseInt(String(reported_trips)) : null;

    const effectiveHourlyRate = rh && rh > 0 ? Math.round((gp / rh) * 10000) / 10000 : null;
    const effectiveTripRate   = rt && rt > 0 ? Math.round((gp / rt) * 10000) / 10000 : null;

    // Variance calculations
    const hoursVariance = rh !== null && systemHours > 0
      ? Math.round((rh - systemHours) * 100) / 100
      : null;
    const hoursVariancePct = rh && rh > 0 && hoursVariance !== null
      ? Math.round((Math.abs(hoursVariance) / rh) * 10000) / 100
      : null;
    const tripVariance = rt !== null && systemTrips > 0
      ? rt - systemTrips
      : null;
    const tripVariancePct = rt && rt > 0 && tripVariance !== null
      ? Math.round((Math.abs(tripVariance) / rt) * 10000) / 100
      : null;

    // Reconciliation status per dimension
    let hoursStatus = "insufficient_data";
    if (rh !== null && systemHours > 0) {
      hoursStatus = (hoursVariance !== null && Math.abs(hoursVariance) <= HOURS_TOLERANCE)
        ? "reconciled" : "variance";
    }
    let tripStatus = "insufficient_data";
    if (rt !== null && systemTrips > 0) {
      tripStatus = (tripVariance !== null && Math.abs(tripVariance) <= TRIP_TOLERANCE)
        ? "reconciled" : "variance";
    }

    // Anomaly detection
    const anomalyCodes: string[] = [];
    if (effectiveHourlyRate !== null && effectiveHourlyRate > HOURLY_HIGH_THRESHOLD)
      anomalyCodes.push("high_effective_hourly_rate");
    if (effectiveHourlyRate !== null && effectiveHourlyRate < HOURLY_LOW_THRESHOLD)
      anomalyCodes.push("low_effective_hourly_rate");
    if (effectiveTripRate !== null && effectiveTripRate > TRIP_HIGH_THRESHOLD)
      anomalyCodes.push("high_effective_trip_rate");
    if (effectiveTripRate !== null && effectiveTripRate < TRIP_LOW_THRESHOLD)
      anomalyCodes.push("low_effective_trip_rate");
    if (hoursStatus === "variance")
      anomalyCodes.push("hours_variance");
    if (tripStatus === "variance")
      anomalyCodes.push("trip_variance");
    if (gp > 0 && (rh === null || rh === 0) && systemHours === 0)
      anomalyCodes.push("pay_with_no_hours");
    if (gp > 0 && (rt === null || rt === 0) && systemTrips === 0)
      anomalyCodes.push("pay_with_no_trips");

    const hasAnomaly = anomalyCodes.length > 0;
    const anomalyCode = hasAnomaly ? anomalyCodes.join("|") : null;

    // Overall reconciliation status
    let overallStatus = "reconciled";
    if (hasAnomaly) overallStatus = "anomaly";
    else if (hoursStatus === "variance" || tripStatus === "variance") overallStatus = "variance";
    else if (hoursStatus === "insufficient_data" && tripStatus === "insufficient_data") overallStatus = "pending";

    // Upsert reconciliation result (delete old + insert new for simplicity)
    await db.execute(sql`
      INSERT INTO openforce_reconciliation_results (
        transaction_id, driver_id, openforce_id, import_batch_id,
        pay_period_start, pay_period_end, gross_pay,
        reported_hours, reported_trips, system_hours, system_trips,
        effective_hourly_rate, effective_trip_rate,
        hours_variance, hours_variance_pct,
        trip_variance, trip_variance_pct,
        hours_reconciliation_status, trip_reconciliation_status,
        reconciliation_status, anomaly_flag, anomaly_code,
        hours_tolerance, trip_tolerance,
        calculated_at, last_updated_at
      ) VALUES (
        ${transactionId}, ${driverId}, ${openforceId}, ${batchId},
        ${period_start}::date, ${period_end}::date, ${gp},
        ${rh}, ${rt}, ${systemHours}, ${systemTrips},
        ${effectiveHourlyRate}, ${effectiveTripRate},
        ${hoursVariance}, ${hoursVariancePct},
        ${tripVariance}, ${tripVariancePct},
        ${hoursStatus}, ${tripStatus},
        ${overallStatus}, ${hasAnomaly}, ${anomalyCode},
        ${HOURS_TOLERANCE}, ${TRIP_TOLERANCE},
        NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
    `);

    processed++;
  }

  return { processed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Header row detection helpers
// ─────────────────────────────────────────────────────────────────────────────
const OF_HEADER_SIGNALS = [
  "openforce", "contractor", "driver", "gross", "net pay", "hours",
  "trips", "period", "settlement", "deduction", "miles", "moves",
  "deliveries", "worker", "payroll",
];

function scoreHeaderCandidate(cells: unknown[]): number {
  return cells.reduce((score: number, cell: unknown) => {
    const normalized = String(cell ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
    return score + (OF_HEADER_SIGNALS.some(s => normalized.includes(s)) ? 1 : 0);
  }, 0);
}

function detectHeaderRowIndex(
  rawRows: unknown[][],
  manualOverride?: number,
): { index: number; detected: boolean; confidence: number } {
  if (manualOverride !== undefined && manualOverride >= 1) {
    return { index: manualOverride - 1, detected: false, confidence: 99 };
  }
  let bestIndex = 0;
  let bestScore = 0;
  const scanLimit = Math.min(15, rawRows.length);
  for (let i = 0; i < scanLimit; i++) {
    const score = scoreHeaderCandidate(rawRows[i]);
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return { index: bestIndex, detected: true, confidence: bestScore };
}

/** Parse file buffer → raw 2D array */
function parseFileTo2D(buffer: Buffer, originalname: string, mimetype: string): unknown[][] {
  const isXlsx = mimetype.includes("spreadsheet") || mimetype.includes("excel")
    || originalname.endsWith(".xlsx") || originalname.endsWith(".xls");
  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  }
  const csv = buffer.toString("utf-8");
  const result = Papa.parse<unknown[]>(csv, { header: false, skipEmptyLines: false });
  return result.data as unknown[][];
}

/** Convert 2D array → normalized row objects given header index */
function buildNormalizedRows(rawRows: unknown[][], headerIdx: number): Record<string, string>[] {
  const headerCells = (rawRows[headerIdx] ?? []).map(c => String(c ?? ""));
  return rawRows
    .slice(headerIdx + 1)
    .filter(row => (row as unknown[]).some(c => String(c ?? "").trim() !== ""))
    .map(cells => {
      const obj: Record<string, string> = {};
      headerCells.forEach((h, i) => {
        const key = normKey(h);
        if (key) obj[key] = String((cells as unknown[])[i] ?? "").trim();
      });
      return obj;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /preview — Parse file and run trial matching (no DB writes)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/preview", isAuthenticated, upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { originalname, buffer, mimetype } = req.file;

    const manualHeaderRow = req.body?.headerRow && req.body.headerRow !== "auto"
      ? parseInt(req.body.headerRow, 10) : undefined;

    const rawRows = parseFileTo2D(buffer, originalname, mimetype);
    if (!rawRows.length) return res.status(400).json({ message: "File appears to be empty" });

    const { index: headerIdx, confidence } = detectHeaderRowIndex(rawRows, manualHeaderRow);

    if (headerIdx >= rawRows.length) {
      return res.status(400).json({ message: "Could not locate header row. Please select one manually." });
    }

    const rows = buildNormalizedRows(rawRows, headerIdx);
    if (!rows.length) return res.status(400).json({ message: "No data rows found after the header row" });

    // Load IC drivers with openforce IDs for trial matching
    const allDrivers = await db.execute(sql`
      SELECT d.id, d.openforce_id, d.driver_classification, u.first_name, u.last_name
      FROM drivers d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.openforce_id IS NOT NULL AND d.openforce_id != ''
    `);

    const ofIdMap = new Map<string, any[]>();
    for (const d of allDrivers.rows as any[]) {
      const key = String(d.openforce_id ?? "").trim().toLowerCase();
      if (!key) continue;
      if (!ofIdMap.has(key)) ofIdMap.set(key, []);
      ofIdMap.get(key)!.push(d);
    }

    // Collect openforce IDs in file for duplicate detection
    const ofIdCounts = new Map<string, number>();
    for (const row of rows) {
      const parsed = parseRow(row);
      const k = (parsed.openforceId ?? "").toLowerCase().trim();
      if (k) ofIdCounts.set(k, (ofIdCounts.get(k) ?? 0) + 1);
    }

    let matchedCount = 0, exceptionCount = 0, parsedCount = 0;
    const preview = rows.slice(0, 250).map((row, i) => {
      parsedCount++;
      const parsed = parseRow(row);
      const ofKey = (parsed.openforceId ?? "").toLowerCase().trim();
      let matchStatus = "exception";
      let matchedDriverName: string | null = null;
      let exceptionReason: string | null = null;

      if (!ofKey) {
        exceptionReason = "missing_openforce_id";
      } else if ((ofIdCounts.get(ofKey) ?? 0) > 1) {
        exceptionReason = "duplicate_transaction";
      } else {
        const candidates = ofIdMap.get(ofKey) ?? [];
        if (candidates.length === 0) {
          exceptionReason = "openforce_id_not_found";
        } else if (candidates.length > 1) {
          exceptionReason = "duplicate_openforce_id";
        } else {
          const d = candidates[0] as any;
          if (d.driver_classification !== "Independent Contractor") {
            exceptionReason = "driver_not_marked_as_ic";
          } else {
            matchStatus = "matched";
            matchedDriverName = `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();
          }
        }
      }
      if (matchStatus === "matched") matchedCount++;
      else exceptionCount++;

      return {
        rowNumber: i + 1,
        openforceId: parsed.openforceId ?? null,
        driverName: parsed.driverName ?? null,
        periodStart: parsed.periodStart ?? null,
        periodEnd: parsed.periodEnd ?? null,
        grossPay: parsed.grossPay ?? null,
        hoursWorked: parsed.hoursWorked ?? null,
        trips: parsed.trips ?? null,
        matchStatus,
        matchedDriverName,
        exceptionReason,
      };
    });

    return res.json({
      detectedHeaderRow: headerIdx + 1,
      confidence,
      lowConfidence: confidence < 2 && manualHeaderRow === undefined,
      totalRows: rows.length,
      previewCount: preview.length,
      matchedCount,
      exceptionCount,
      preview,
    });
  } catch (err: any) {
    console.error("[openforceRoutes] POST /preview:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /upload — Upload & parse settlement file
// ─────────────────────────────────────────────────────────────────────────────
router.post("/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { originalname, buffer, mimetype } = req.file;
    const isXlsx = mimetype.includes("spreadsheet") || mimetype.includes("excel")
      || originalname.endsWith(".xlsx") || originalname.endsWith(".xls");

    const manualHeaderRow = req.body?.headerRow && req.body.headerRow !== "auto"
      ? parseInt(req.body.headerRow, 10) : undefined;

    const rawRows = parseFileTo2D(buffer, originalname, mimetype);
    if (!rawRows.length) return res.status(400).json({ message: "File appears to be empty" });

    const { index: headerIdx } = detectHeaderRowIndex(rawRows, manualHeaderRow);

    // Normalise using detected header
    let rows: Record<string, string>[] = buildNormalizedRows(rawRows, headerIdx);

    // Detect period from first row
    const first = parseRow(rows[0]);
    const periodStart = first.periodStart;
    const periodEnd   = first.periodEnd ?? rows.reduce((latest, r) => {
      const pd = parseDate(pick(r, ...COL.periodEnd));
      return pd && pd > (latest ?? "") ? pd : latest;
    }, null as string | null);

    const mappingTemplate = (req.body?.mappingTemplate as string) || "openforce_standard";

    // Create batch
    const [batch] = await db.insert(openforceImportBatches).values({
      sourceFileName: originalname,
      sourceFileType: isXlsx ? "xlsx" : "csv",
      uploadedByUserId: userId ?? undefined,
      processingStatus: "parsing",
      settlementPeriodStart: periodStart ?? undefined,
      settlementPeriodEnd: periodEnd ?? undefined,
      totalRows: rows.length,
      notes: `template:${mappingTemplate}`,
    }).returning();

    // Insert raw rows
    const rawRowValues = rows.map((row, i) => ({
      importBatchId: batch.id,
      rowNumber: i + 1,
      rawRowJson: row,
      processingStatus: "new" as const,
    }));
    await db.insert(openforceImportRawRows).values(rawRowValues);

    await db.update(openforceImportBatches)
      .set({ processingStatus: "parsed", parsedRows: rows.length, updatedAt: new Date() })
      .where(eq(openforceImportBatches.id, batch.id));

    // Auto-run matching engine
    const matchResult = await runMatchingEngine(batch.id);

    return res.json({
      batchId: batch.id,
      totalRows: rows.length,
      matched: matchResult.matched,
      exceptions: matchResult.exceptions,
      message: `Imported ${rows.length} rows. Matched: ${matchResult.matched}, Exceptions: ${matchResult.exceptions}`,
    });
  } catch (err: any) {
    console.error("[openforceRoutes] POST /upload:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /batches ─────────────────────────────────────────────────────────────
router.get("/batches", isAuthenticated, async (req: any, res) => {
  try {
    const batches = await db.select().from(openforceImportBatches)
      .where(eq(openforceImportBatches.isArchived, false))
      .orderBy(desc(openforceImportBatches.uploadedAt))
      .limit(100);
    return res.json({ batches });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /batches/:id ─────────────────────────────────────────────────────────
router.get("/batches/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const [batch] = await db.select().from(openforceImportBatches).where(eq(openforceImportBatches.id, id));
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    const transactions = await db.select().from(openforceTransactions)
      .where(eq(openforceTransactions.importBatchId, id))
      .orderBy(openforceTransactions.rawDriverName);
    return res.json({ batch, transactions });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /batches/:id ──────────────────────────────────────────────────────
router.delete("/batches/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    await db.update(openforceImportBatches)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(openforceImportBatches.id, id));
    await db.update(openforceTransactions)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(openforceTransactions.importBatchId, id));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /batches/:id/rematch ────────────────────────────────────────────────
router.post("/batches/:id/rematch", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    // Archive old transactions
    await db.update(openforceTransactions)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(openforceTransactions.importBatchId, id));
    // Reset raw rows
    await db.update(openforceImportRawRows)
      .set({ processingStatus: "new", transactionId: null, updatedAt: new Date() })
      .where(eq(openforceImportRawRows.importBatchId, id));
    // Re-run matching engine
    const result = await runMatchingEngine(id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /transactions ────────────────────────────────────────────────────────
router.get("/transactions", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, matchStatus, hasException, accountId, dateFrom, dateTo } = req.query as Record<string, string>;
    const conditions: any[] = [eq(openforceTransactions.isArchived, false)];
    if (batchId)     conditions.push(eq(openforceTransactions.importBatchId, batchId));
    if (matchStatus) conditions.push(eq(openforceTransactions.matchStatus, matchStatus));
    if (hasException === "true") conditions.push(eq(openforceTransactions.hasException, true));
    if (accountId)   conditions.push(eq(openforceTransactions.linkedAccountId, accountId));

    const txs = await db.select().from(openforceTransactions)
      .where(and(...conditions))
      .orderBy(desc(openforceTransactions.createdAt))
      .limit(500);
    return res.json({ transactions: txs, total: txs.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /exceptions ─────────────────────────────────────────────────────────
// Supports filtering by: resolved, exceptionType, driverId, batchId, periodFrom, periodTo
router.get("/exceptions", isAuthenticated, async (req: any, res) => {
  try {
    const { resolved, exceptionType, driverId, batchId, periodFrom, periodTo } = req.query as Record<string, string>;

    // Build dynamic WHERE clause using sql template tag for safe interpolation
    const whereParts: any[] = [sql`ot.is_archived = false`, sql`ot.has_exception = true`];
    if (resolved === "false") whereParts.push(sql`ot.exception_resolved_at IS NULL`);
    if (resolved === "true")  whereParts.push(sql`ot.exception_resolved_at IS NOT NULL`);
    if (exceptionType) whereParts.push(sql`ot.exception_type = ${exceptionType}`);
    if (driverId)      whereParts.push(sql`ot.matched_driver_id = ${driverId}`);
    if (batchId)       whereParts.push(sql`ot.import_batch_id = ${batchId}`);
    if (periodFrom)    whereParts.push(sql`ot.period_start >= ${periodFrom}::date`);
    if (periodTo)      whereParts.push(sql`ot.period_end <= ${periodTo}::date`);

    const whereExpr = sql.join(whereParts, sql` AND `);

    const rows = await db.execute(sql`
      SELECT
        ot.*,
        COALESCE(u.first_name || ' ' || u.last_name, ot.raw_driver_name) AS resolved_driver_name
      FROM openforce_transactions ot
      LEFT JOIN drivers d ON ot.matched_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE ${whereExpr}
      ORDER BY
        CASE ot.exception_type
          WHEN 'driver_not_marked_as_ic' THEN 0
          WHEN 'openforce_id_not_found'  THEN 1
          WHEN 'duplicate_openforce_id'  THEN 2
          WHEN 'duplicate_transaction'   THEN 3
          WHEN 'missing_openforce_id'    THEN 4
          WHEN 'missing_required_fields' THEN 5
          ELSE 9
        END ASC, ot.created_at DESC
      LIMIT 500
    `);
    return res.json({ exceptions: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /exceptions/:id/resolve ────────────────────────────────────────────
router.post("/exceptions/:id/resolve", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { resolution, matchedDriverId } = req.body;
    const userId = getUserId(req);

    // Read current state for audit trail
    const [current] = await db.select().from(openforceTransactions).where(eq(openforceTransactions.id, id));
    if (!current) return res.status(404).json({ message: "Transaction not found" });

    const updateData: any = {
      exceptionResolvedAt: new Date(),
      exceptionResolvedBy: userId,
      exceptionResolution: resolution,
      updatedAt: new Date(),
    };
    const isDriverAssignment = !!matchedDriverId;
    if (isDriverAssignment) {
      updateData.matchedDriverId = matchedDriverId;
      updateData.matchStatus = "matched";
      updateData.hasException = false;
    }
    await db.update(openforceTransactions).set(updateData).where(eq(openforceTransactions.id, id));

    // Write audit log
    await insertAuditEntry({
      transactionId: id,
      actionType: isDriverAssignment ? "manual_match" : "override",
      previousStatus: current.matchStatus,
      newStatus: isDriverAssignment ? "matched" : current.matchStatus,
      previousExceptionType: current.exceptionType,
      assignedDriverId: matchedDriverId ?? null,
      userId,
      notes: resolution,
    });

    // Refresh batch exception counts
    if (current.importBatchId) await refreshBatchExceptionCounts(current.importBatchId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /exceptions/:id/exclude ────────────────────────────────────────────
router.post("/exceptions/:id/exclude", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = getUserId(req);

    // Read current state for audit trail
    const [current] = await db.select().from(openforceTransactions).where(eq(openforceTransactions.id, id));
    if (!current) return res.status(404).json({ message: "Transaction not found" });

    await db.update(openforceTransactions).set({
      matchStatus: "excluded",
      billingStatus: "excluded",
      exceptionResolvedAt: new Date(),
      exceptionResolvedBy: userId,
      exceptionResolution: note || "Flagged as invalid by user",
      updatedAt: new Date(),
    }).where(eq(openforceTransactions.id, id));

    // Write audit log
    await insertAuditEntry({
      transactionId: id,
      actionType: "excluded",
      previousStatus: current.matchStatus,
      newStatus: "excluded",
      previousExceptionType: current.exceptionType,
      assignedDriverId: null,
      userId,
      notes: note || "Flagged as invalid",
    });

    // Refresh batch exception counts
    if (current.importBatchId) await refreshBatchExceptionCounts(current.importBatchId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /exceptions/:id/audit-log ───────────────────────────────────────────
router.get("/exceptions/:id/audit-log", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const entries = await db.select().from(openforceMatchAuditLog)
      .where(eq(openforceMatchAuditLog.transactionId, id))
      .orderBy(desc(openforceMatchAuditLog.createdAt));
    return res.json({ auditLog: entries });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /account-summary ─────────────────────────────────────────────────────
router.get("/account-summary", isAuthenticated, async (req: any, res) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    const days90 = new Date(); days90.setDate(days90.getDate() - 90);
    const from = dateFrom || days90.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      SELECT
        ot.linked_account_id    AS account_id,
        ot.linked_account_name  AS account_name,
        ot.linked_account_number AS account_number,
        COUNT(DISTINCT ot.matched_driver_id)::int AS driver_count,
        COUNT(*)::int                             AS record_count,
        SUM(ot.hours_worked::numeric)             AS total_hours,
        SUM(ot.trips_completed)::int              AS total_trips,
        SUM(ot.gross_pay::numeric)                AS total_gross_pay,
        SUM(ot.net_pay::numeric)                  AS total_net_pay,
        AVG(ot.effective_hourly_rate::numeric)    AS avg_hourly_rate,
        AVG(ot.effective_per_trip_rate::numeric)  AS avg_per_trip_rate
      FROM openforce_transactions ot
      WHERE ot.is_archived = false
        AND ot.match_status = 'matched'
        AND ot.linked_account_id IS NOT NULL
        AND (ot.period_start IS NULL OR ot.period_start >= ${from}::date)
        AND (ot.period_end   IS NULL OR ot.period_end   <= ${to}::date)
      GROUP BY ot.linked_account_id, ot.linked_account_name, ot.linked_account_number
      ORDER BY total_gross_pay DESC NULLS LAST
    `);

    return res.json({ accounts: rows.rows, dateFrom: from, dateTo: to });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /reconciliation ──────────────────────────────────────────────────────
router.get("/reconciliation", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, dateFrom, dateTo, matchStatus } = req.query as Record<string, string>;
    const conditions: string[] = ["ot.is_archived = false"];
    const params: any[] = [];

    if (batchId) { conditions.push(`ot.import_batch_id = $${params.length + 1}`); params.push(batchId); }
    if (matchStatus) { conditions.push(`ot.match_status = $${params.length + 1}`); params.push(matchStatus); }
    if (dateFrom) { conditions.push(`ot.period_start >= $${params.length + 1}::date`); params.push(dateFrom); }
    if (dateTo)   { conditions.push(`ot.period_end <= $${params.length + 1}::date`); params.push(dateTo); }

    const rows = await db.execute(sql`
      SELECT
        ot.id,
        ot.openforce_id,
        ot.raw_driver_name,
        ot.period_start,
        ot.period_end,
        ot.hours_worked,
        ot.trips_completed,
        ot.gross_pay,
        ot.deductions,
        ot.net_pay,
        ot.effective_hourly_rate,
        ot.effective_per_trip_rate,
        ot.cost_per_move,
        ot.match_status,
        ot.has_exception,
        ot.exception_type,
        ot.exception_note,
        ot.linked_account_name,
        ot.billing_status,
        d.driver_classification,
        u.first_name,
        u.last_name
      FROM openforce_transactions ot
      LEFT JOIN drivers d ON ot.matched_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE ot.is_archived = false
      ${batchId    ? sql`AND ot.import_batch_id = ${batchId}`    : sql``}
      ${matchStatus ? sql`AND ot.match_status = ${matchStatus}`   : sql``}
      ${dateFrom   ? sql`AND ot.period_start >= ${dateFrom}::date` : sql``}
      ${dateTo     ? sql`AND ot.period_end   <= ${dateTo}::date`   : sql``}
      ORDER BY ot.period_start DESC, ot.raw_driver_name
      LIMIT 500
    `);

    return res.json({ rows: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /cost-per-move ───────────────────────────────────────────────────────
router.get("/cost-per-move", isAuthenticated, async (req: any, res) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    const days90 = new Date(); days90.setDate(days90.getDate() - 90);
    const from = dateFrom || days90.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);

    const accountRows = await db.execute(sql`
      SELECT
        ot.linked_account_id   AS account_id,
        ot.linked_account_name AS account_name,
        SUM(ot.gross_pay::numeric)             AS total_labor_cost,
        SUM(ot.trips_completed)::int           AS total_trips,
        COUNT(DISTINCT ot.matched_driver_id)   AS driver_count,
        CASE WHEN SUM(ot.trips_completed) > 0
          THEN ROUND(SUM(ot.gross_pay::numeric) / SUM(ot.trips_completed), 4)
          ELSE NULL
        END                                    AS blended_cost_per_move
      FROM openforce_transactions ot
      WHERE ot.is_archived = false
        AND ot.match_status = 'matched'
        AND ot.linked_account_id IS NOT NULL
        AND (ot.period_start IS NULL OR ot.period_start >= ${from}::date)
        AND (ot.period_end   IS NULL OR ot.period_end   <= ${to}::date)
      GROUP BY ot.linked_account_id, ot.linked_account_name
      ORDER BY blended_cost_per_move DESC NULLS LAST
    `);

    const driverRows = await db.execute(sql`
      SELECT
        ot.openforce_id,
        ot.raw_driver_name,
        COALESCE(u.first_name || ' ' || u.last_name, ot.raw_driver_name) AS driver_name,
        SUM(ot.gross_pay::numeric)             AS total_gross_pay,
        SUM(ot.trips_completed)::int           AS total_trips,
        SUM(ot.hours_worked::numeric)          AS total_hours,
        CASE WHEN SUM(ot.trips_completed) > 0
          THEN ROUND(SUM(ot.gross_pay::numeric) / SUM(ot.trips_completed), 4)
          ELSE NULL
        END                                    AS cost_per_move,
        CASE WHEN SUM(ot.hours_worked::numeric) > 0
          THEN ROUND(SUM(ot.gross_pay::numeric) / SUM(ot.hours_worked::numeric), 4)
          ELSE NULL
        END                                    AS cost_per_hour
      FROM openforce_transactions ot
      LEFT JOIN drivers d ON ot.matched_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE ot.is_archived = false
        AND ot.match_status = 'matched'
        AND (ot.period_start IS NULL OR ot.period_start >= ${from}::date)
        AND (ot.period_end   IS NULL OR ot.period_end   <= ${to}::date)
      GROUP BY ot.openforce_id, ot.raw_driver_name, u.first_name, u.last_name
      ORDER BY total_gross_pay DESC NULLS LAST
      LIMIT 200
    `);

    return res.json({ accounts: accountRows.rows, drivers: driverRows.rows, dateFrom: from, dateTo: to });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /summary ─────────────────────────────────────────────────────────────
router.get("/summary", isAuthenticated, async (req: any, res) => {
  try {
    const kpis = await db.execute(sql`
      SELECT
        COUNT(DISTINCT ot.id)::int                           AS total_transactions,
        COUNT(DISTINCT ot.matched_driver_id)::int            AS matched_drivers,
        SUM(CASE WHEN ot.has_exception THEN 1 ELSE 0 END)::int AS total_exceptions,
        SUM(CASE WHEN ot.exception_resolved_at IS NULL AND ot.has_exception THEN 1 ELSE 0 END)::int AS open_exceptions,
        ROUND(SUM(ot.gross_pay::numeric), 2)                 AS total_gross_pay,
        ROUND(SUM(ot.net_pay::numeric), 2)                   AS total_net_pay,
        ROUND(AVG(ot.effective_hourly_rate::numeric), 4)     AS avg_hourly_rate,
        SUM(ot.trips_completed)::int                         AS total_trips
      FROM openforce_transactions ot
      WHERE ot.is_archived = false
    `);

    const recentBatches = await db.select().from(openforceImportBatches)
      .where(eq(openforceImportBatches.isArchived, false))
      .orderBy(desc(openforceImportBatches.uploadedAt))
      .limit(5);

    return res.json({ kpis: kpis.rows[0] ?? {}, recentBatches });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /batches/:id/reconcile ─────────────────────────────────────────────
// Manually re-run the pay reconciliation engine for a batch
router.post("/batches/:id/reconcile", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    // Clear existing results for this batch before re-running
    await db.execute(sql`
      DELETE FROM openforce_reconciliation_results WHERE import_batch_id = ${id}
    `);
    const result = await runPayReconciliationEngine(id);
    // Also re-run cost engine
    try { await runCostPerMoveEngine(id); } catch(e) { console.warn("[openforce cost-engine]", e); }
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /pay-reconciliation ──────────────────────────────────────────────────
// Main reconciliation grid with optional filters
router.get("/pay-reconciliation", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, driverId, anomalyCode, reconciliationStatus,
            periodFrom, periodTo, highVarianceOnly } = req.query as Record<string, string>;

    const whereParts: any[] = [sql`r.id IS NOT NULL`];
    if (batchId)              whereParts.push(sql`r.import_batch_id = ${batchId}`);
    if (driverId)             whereParts.push(sql`r.driver_id = ${driverId}`);
    if (reconciliationStatus) whereParts.push(sql`r.reconciliation_status = ${reconciliationStatus}`);
    if (anomalyCode)          whereParts.push(sql`r.anomaly_code ILIKE ${'%' + anomalyCode + '%'}`);
    if (periodFrom)           whereParts.push(sql`r.pay_period_start >= ${periodFrom}::date`);
    if (periodTo)             whereParts.push(sql`r.pay_period_end <= ${periodTo}::date`);
    if (highVarianceOnly === "true") {
      whereParts.push(sql`(ABS(r.hours_variance_pct) > 20 OR ABS(r.trip_variance_pct) > 20)`);
    }

    const whereExpr = sql.join(whereParts, sql` AND `);

    const rows = await db.execute(sql`
      SELECT
        r.*,
        COALESCE(u.first_name || ' ' || u.last_name, ot.raw_driver_name) AS driver_name,
        ot.raw_driver_name,
        ot.exception_type,
        b.source_file_name AS batch_file_name
      FROM openforce_reconciliation_results r
      JOIN openforce_transactions ot ON r.transaction_id = ot.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN openforce_import_batches b ON r.import_batch_id = b.id
      WHERE ${whereExpr}
      ORDER BY r.anomaly_flag DESC, r.reconciliation_status, r.pay_period_start DESC
      LIMIT 1000
    `);

    return res.json({ rows: rows.rows, total: rows.rows.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /pay-reconciliation/summary ─────────────────────────────────────────
router.get("/pay-reconciliation/summary", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, periodFrom, periodTo } = req.query as Record<string, string>;

    const whereParts: any[] = [sql`r.id IS NOT NULL`];
    if (batchId)    whereParts.push(sql`r.import_batch_id = ${batchId}`);
    if (periodFrom) whereParts.push(sql`r.pay_period_start >= ${periodFrom}::date`);
    if (periodTo)   whereParts.push(sql`r.pay_period_end <= ${periodTo}::date`);
    const whereExpr = sql.join(whereParts, sql` AND `);

    const kpis = await db.execute(sql`
      SELECT
        COUNT(r.id)::int                                         AS total_records,
        COUNT(DISTINCT r.driver_id)::int                        AS total_drivers,
        ROUND(SUM(r.gross_pay), 2)                              AS total_gross_pay,
        SUM(CASE WHEN r.reconciliation_status = 'reconciled' THEN 1 ELSE 0 END)::int AS reconciled_count,
        SUM(CASE WHEN r.reconciliation_status = 'variance'   THEN 1 ELSE 0 END)::int AS variance_count,
        SUM(CASE WHEN r.reconciliation_status = 'anomaly'    THEN 1 ELSE 0 END)::int AS anomaly_count,
        SUM(CASE WHEN r.reconciliation_status = 'pending'    THEN 1 ELSE 0 END)::int AS pending_count,
        ROUND(
          100.0 * SUM(CASE WHEN r.reconciliation_status = 'reconciled' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(r.id), 0), 1
        )                                                        AS reconciled_pct,
        ROUND(AVG(r.effective_hourly_rate), 4)                  AS avg_effective_hourly_rate,
        ROUND(AVG(r.effective_trip_rate), 4)                    AS avg_effective_trip_rate,
        SUM(r.reported_trips)::int                              AS total_reported_trips,
        SUM(r.system_trips)::int                                AS total_system_trips,
        ROUND(SUM(r.reported_hours::numeric), 2)                AS total_reported_hours,
        ROUND(SUM(r.system_hours::numeric), 2)                  AS total_system_hours
      FROM openforce_reconciliation_results r
      WHERE ${whereExpr}
    `);

    // Anomaly breakdown
    const anomalyBreakdown = await db.execute(sql`
      SELECT
        UNNEST(STRING_TO_ARRAY(r.anomaly_code, '|')) AS code,
        COUNT(*)::int AS count
      FROM openforce_reconciliation_results r
      WHERE ${whereExpr} AND r.anomaly_flag = true
      GROUP BY 1
      ORDER BY 2 DESC
    `);

    return res.json({
      kpis: kpis.rows[0] ?? {},
      anomalyBreakdown: anomalyBreakdown.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /pay-reconciliation/:id ─────────────────────────────────────────────
// Detail view for a single reconciliation result
router.get("/pay-reconciliation/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const rows = await db.execute(sql`
      SELECT
        r.*,
        COALESCE(u.first_name || ' ' || u.last_name, ot.raw_driver_name) AS driver_name,
        ot.raw_driver_name, ot.settlement_id,
        ot.exception_type, ot.exception_note,
        b.source_file_name, b.settlement_period_start, b.settlement_period_end
      FROM openforce_reconciliation_results r
      JOIN openforce_transactions ot ON r.transaction_id = ot.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN openforce_import_batches b ON r.import_batch_id = b.id
      WHERE r.id = ${id}
    `);
    if (!rows.rows.length) return res.status(404).json({ message: "Not found" });
    return res.json({ result: rows.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//   COST PER MOVE ENGINE
// ═════════════════════════════════════════════════════════════════════════════

// Thresholds (configurable)
const CPM_HIGH_THRESHOLD = 75;   // flag if cost per move > $75
const CPM_LOW_THRESHOLD  = 2;    // flag if cost per move < $2

// ── Engine ──────────────────────────────────────────────────────────────────
async function runCostPerMoveEngine(batchId: string): Promise<{ processed: number }> {
  // 1. Load all matched, non-archived transactions for this batch
  const txRows = await db.execute(sql`
    SELECT
      ot.id AS tx_id,
      ot.matched_driver_id AS driver_id,
      ot.openforce_id,
      ot.raw_driver_name,
      COALESCE(u.first_name || ' ' || u.last_name, ot.raw_driver_name) AS driver_name,
      d.driver_type,
      ot.gross_pay::numeric                AS gross_pay,
      ot.trips_completed                   AS reported_trips,
      ot.hours_worked::numeric             AS reported_hours,
      ot.period_start                      AS pay_period_start,
      ot.period_end                        AS pay_period_end,
      ot.linked_account_id,
      ot.linked_account_name,
      rr.id                                AS recon_id,
      rr.reconciliation_status
    FROM openforce_transactions ot
    LEFT JOIN drivers d ON ot.matched_driver_id = d.id
    LEFT JOIN users   u ON d.user_id = u.id
    LEFT JOIN openforce_reconciliation_results rr ON rr.transaction_id = ot.id
    WHERE ot.import_batch_id = ${batchId}
      AND ot.match_status = 'matched'
      AND ot.is_archived = false
      AND ot.is_excluded = false
      AND (rr.id IS NULL OR rr.reconciliation_status IN ('reconciled','variance'))
  `);

  if (!txRows.rows.length) return { processed: 0 };

  // Clear existing cost engine output for this batch
  await db.execute(sql`
    DELETE FROM driver_labor_cost_summary WHERE import_batch_id = ${batchId}
  `);
  await db.execute(sql`
    DELETE FROM move_labor_cost_allocations
    WHERE source_transaction_id IN (
      SELECT id FROM openforce_transactions WHERE import_batch_id = ${batchId}
    )
  `);

  let processed = 0;

  for (const tx of txRows.rows as any[]) {
    const grossPay       = parseFloat(tx.gross_pay) || 0;
    const payStart       = tx.pay_period_start as string | null;
    const payEnd         = tx.pay_period_end   as string | null;
    const driverId       = tx.driver_id        as string | null;
    const openforceId    = tx.openforce_id     as string | null;
    const driverName     = tx.driver_name      as string;
    const txId           = tx.tx_id            as string;
    const reconId        = tx.recon_id         as string | null;

    // Determine costing method: IC/on-demand vs shift-based
    // IC drivers in OpenForce are treated as on-demand unless they have active shift assignments
    const driverTypeLower = (tx.driver_type as string || "").toLowerCase();
    const isShiftDriver = driverTypeLower.includes("shift") || driverTypeLower === "w2";
    const costingMethod = isShiftDriver ? "shift" : "on_demand";

    // ── Completed moves during the pay period ─────────────────────────────
    let completedTrips: any[] = [];
    if (driverId && payStart && payEnd) {
      const tripsResult = await db.execute(sql`
        SELECT t.id, t.trip_date, t.customer_id, c.name AS account_name
        FROM trips t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.driver_id = ${driverId}
          AND t.status = 'completed'
          AND t.trip_date::date BETWEEN ${payStart}::date AND ${payEnd}::date
      `);
      completedTrips = tripsResult.rows;
    }

    const completedMoveCount = completedTrips.length;

    // ── On-Demand / IC model ──────────────────────────────────────────────
    if (costingMethod === "on_demand") {
      let costPerMove: number | null = null;
      let anomalyFlag  = false;
      let anomalyReason: string | null = null;

      if (completedMoveCount === 0) {
        anomalyFlag   = true;
        anomalyReason = grossPay > 0 ? "pay_with_no_completed_moves" : "missing_move_linkage";
      } else if (grossPay === 0) {
        anomalyFlag   = true;
        anomalyReason = "completed_moves_with_no_pay";
      } else {
        costPerMove = grossPay / completedMoveCount;
        if (costPerMove > CPM_HIGH_THRESHOLD) { anomalyFlag = true; anomalyReason = "high_cost_per_move"; }
        else if (costPerMove < CPM_LOW_THRESHOLD) { anomalyFlag = true; anomalyReason = "low_cost_per_move"; }
      }

      // Upsert driver-level summary
      await db.execute(sql`
        INSERT INTO driver_labor_cost_summary
          (driver_id, openforce_id, driver_name, driver_type, pay_period_start, pay_period_end,
           import_batch_id, total_gross_pay, total_completed_moves, cost_per_move,
           calculation_method, anomaly_flag, anomaly_reason, account_count, calculated_at, updated_at)
        VALUES (
          ${driverId}, ${openforceId}, ${driverName}, 'ic',
          ${payStart}::date, ${payEnd}::date, ${batchId},
          ${grossPay}, ${completedMoveCount},
          ${costPerMove !== null ? String(costPerMove) : null},
          'on_demand', ${anomalyFlag}, ${anomalyReason},
          ${new Set(completedTrips.map((t: any) => t.customer_id).filter(Boolean)).size},
          now(), now()
        )
      `);

      // Allocate to each move
      if (costPerMove !== null && completedTrips.length > 0) {
        for (const trip of completedTrips) {
          const tripAnomaly = costPerMove > CPM_HIGH_THRESHOLD || costPerMove < CPM_LOW_THRESHOLD;
          await db.execute(sql`
            INSERT INTO move_labor_cost_allocations
              (move_id, driver_id, driver_type, pay_period_start, pay_period_end,
               costing_method, gross_pay_source_id, source_transaction_id, source_reconciliation_id,
               move_labor_cost, cost_per_move_basis, completed_move_count_basis,
               account_id, account_name, trip_date, anomaly_flag, anomaly_reason, created_at, updated_at)
            VALUES (
              ${trip.id}, ${driverId}, 'ic',
              ${payStart}::date, ${payEnd}::date,
              'on_demand', ${txId}, ${txId}, ${reconId},
              ${String(costPerMove)}, ${String(costPerMove)}, ${completedMoveCount},
              ${trip.customer_id}, ${trip.account_name},
              ${trip.trip_date}, ${tripAnomaly},
              ${tripAnomaly ? "high_cost_per_move" : null},
              now(), now()
            )
          `);
        }
      } else if (anomalyFlag) {
        // Record anomaly allocation even with no linked moves
        await db.execute(sql`
          INSERT INTO move_labor_cost_allocations
            (driver_id, driver_type, pay_period_start, pay_period_end,
             costing_method, gross_pay_source_id, source_transaction_id, source_reconciliation_id,
             move_labor_cost, cost_per_move_basis, completed_move_count_basis,
             anomaly_flag, anomaly_reason, created_at, updated_at)
          VALUES (
            ${driverId}, 'ic',
            ${payStart}::date, ${payEnd}::date,
            'on_demand', ${txId}, ${txId}, ${reconId},
            ${String(grossPay)}, null, 0,
            true, ${anomalyReason},
            now(), now()
          )
        `);
      }
    }

    // ── Shift model ───────────────────────────────────────────────────────
    else {
      // Find shift assignments for this driver during the pay period
      let shiftData: any[] = [];
      if (driverId && payStart && payEnd) {
        const shiftResult = await db.execute(sql`
          SELECT
            sa.id AS assignment_id, sa.shift_id,
            sa.actual_cost::numeric AS actual_cost,
            sa.estimated_cost::numeric AS estimated_cost,
            sa.actual_hours::numeric AS actual_hours,
            sa.scheduled_hours::numeric AS scheduled_hours,
            sa.hourly_rate::numeric AS hourly_rate,
            s.start_time, s.end_time, s.date AS shift_date
          FROM shift_assignments sa
          JOIN shifts s ON sa.shift_id = s.id
          WHERE sa.driver_id = ${driverId}
            AND s.date::date BETWEEN ${payStart}::date AND ${payEnd}::date
            AND sa.status NOT IN ('declined', 'no_show')
        `);
        shiftData = shiftResult.rows;
      }

      if (shiftData.length === 0) {
        // Fallback to on-demand model if no shift data
        const costPerMove = completedMoveCount > 0 ? grossPay / completedMoveCount : null;
        const anomalyFlag = completedMoveCount === 0;
        await db.execute(sql`
          INSERT INTO driver_labor_cost_summary
            (driver_id, openforce_id, driver_name, driver_type, pay_period_start, pay_period_end,
             import_batch_id, total_gross_pay, total_completed_moves, cost_per_move,
             calculation_method, anomaly_flag, anomaly_reason, account_count, calculated_at, updated_at)
          VALUES (
            ${driverId}, ${openforceId}, ${driverName}, 'shift',
            ${payStart}::date, ${payEnd}::date, ${batchId},
            ${grossPay}, ${completedMoveCount},
            ${costPerMove !== null ? String(costPerMove) : null},
            'shift_fallback', ${anomalyFlag},
            ${anomalyFlag ? "zero_move_shift" : null},
            ${new Set(completedTrips.map((t: any) => t.customer_id).filter(Boolean)).size},
            now(), now()
          )
        `);
      } else {
        let totalShiftCost = 0;
        // Aggregate across all shifts for this pay period
        for (const sh of shiftData) {
          const hours = parseFloat(sh.actual_hours || sh.scheduled_hours || "0");
          const rate  = parseFloat(sh.hourly_rate || "0");
          const cost  = parseFloat(sh.actual_cost || sh.estimated_cost || "0") || (hours * rate);
          totalShiftCost += cost;

          // Moves that fall within this shift window
          let shiftMoves: any[] = [];
          if (sh.start_time && sh.end_time) {
            const movesResult = await db.execute(sql`
              SELECT t.id, t.trip_date, t.customer_id, c.name AS account_name
              FROM trips t
              LEFT JOIN customers c ON t.customer_id = c.id
              WHERE t.driver_id = ${driverId}
                AND t.status = 'completed'
                AND t.trip_date >= ${sh.start_time}
                AND t.trip_date <= ${sh.end_time}
            `);
            shiftMoves = movesResult.rows;
          }

          const shiftMoveCount = shiftMoves.length;
          const shiftCpm = shiftMoveCount > 0 ? cost / shiftMoveCount : null;
          const isIdle  = shiftMoveCount === 0 && cost > 0;

          for (const trip of shiftMoves) {
            await db.execute(sql`
              INSERT INTO move_labor_cost_allocations
                (move_id, driver_id, driver_type, pay_period_start, pay_period_end,
                 shift_id, costing_method, gross_pay_source_id, source_transaction_id, source_reconciliation_id,
                 move_labor_cost, cost_per_move_basis, completed_move_count_basis,
                 account_id, account_name, trip_date, anomaly_flag, anomaly_reason, created_at, updated_at)
              VALUES (
                ${trip.id}, ${driverId}, 'shift',
                ${payStart}::date, ${payEnd}::date,
                ${sh.shift_id}, 'shift', ${txId}, ${txId}, ${reconId},
                ${shiftCpm !== null ? String(shiftCpm) : "0"},
                ${shiftCpm !== null ? String(shiftCpm) : null},
                ${shiftMoveCount}, ${trip.customer_id}, ${trip.account_name},
                ${trip.trip_date}, false, null, now(), now()
              )
            `);
          }

          if (isIdle) {
            // Record unallocated idle cost
            await db.execute(sql`
              INSERT INTO move_labor_cost_allocations
                (driver_id, driver_type, pay_period_start, pay_period_end,
                 shift_id, costing_method, gross_pay_source_id, source_transaction_id, source_reconciliation_id,
                 move_labor_cost, cost_per_move_basis, completed_move_count_basis,
                 anomaly_flag, anomaly_reason, created_at, updated_at)
              VALUES (
                ${driverId}, 'shift',
                ${payStart}::date, ${payEnd}::date,
                ${sh.shift_id}, 'shift', ${txId}, ${txId}, ${reconId},
                ${String(cost)}, null, 0, true, 'zero_move_shift', now(), now()
              )
            `);
          }
        }

        // Driver summary
        const costPerMove = completedMoveCount > 0 ? totalShiftCost / completedMoveCount : null;
        const anomalyFlag = completedMoveCount === 0 || costPerMove === null;
        await db.execute(sql`
          INSERT INTO driver_labor_cost_summary
            (driver_id, openforce_id, driver_name, driver_type, pay_period_start, pay_period_end,
             import_batch_id, total_gross_pay, total_completed_moves, cost_per_move,
             calculation_method, anomaly_flag, anomaly_reason, account_count, calculated_at, updated_at)
          VALUES (
            ${driverId}, ${openforceId}, ${driverName}, 'shift',
            ${payStart}::date, ${payEnd}::date, ${batchId},
            ${totalShiftCost}, ${completedMoveCount},
            ${costPerMove !== null ? String(costPerMove) : null},
            'shift', ${anomalyFlag},
            ${anomalyFlag ? "zero_move_shift" : null},
            ${new Set(completedTrips.map((t: any) => t.customer_id).filter(Boolean)).size},
            now(), now()
          )
        `);
      }
    }

    processed++;
  }

  return { processed };
}

// ─── POST /batches/:id/run-cost-engine ───────────────────────────────────────
router.post("/batches/:id/run-cost-engine", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await runCostPerMoveEngine(id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[cost-engine]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /cost-per-move/engine-summary ───────────────────────────────────────
// KPIs for the Cost Per Move Engine tab
router.get("/cost-per-move/engine-summary", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, periodFrom, periodTo, driverType } = req.query as Record<string, string>;
    const conditions: string[] = [];
    if (batchId && batchId !== "__all__") conditions.push(`s.import_batch_id = '${batchId}'`);
    if (periodFrom) conditions.push(`s.pay_period_start >= '${periodFrom}'::date`);
    if (periodTo)   conditions.push(`s.pay_period_end   <= '${periodTo}'::date`);
    if (driverType && driverType !== "__all__") conditions.push(`s.driver_type = '${driverType}'`);
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const kpis = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int                                  AS total_records,
        COUNT(DISTINCT s.driver_id)::int               AS total_drivers,
        ROUND(SUM(s.total_gross_pay), 2)               AS total_labor_cost,
        SUM(s.total_completed_moves)::int              AS total_completed_moves,
        ROUND(AVG(s.cost_per_move), 4)                 AS avg_cost_per_move,
        ROUND(AVG(CASE WHEN s.driver_type = 'ic'    THEN s.cost_per_move END), 4) AS on_demand_avg_cpm,
        ROUND(AVG(CASE WHEN s.driver_type = 'shift' THEN s.cost_per_move END), 4) AS shift_avg_cpm,
        SUM(CASE WHEN s.anomaly_flag THEN 1 ELSE 0 END)::int AS anomaly_count
      FROM driver_labor_cost_summary s
      ${where}
    `));

    const anomalyBreakdown = await db.execute(sql.raw(`
      SELECT anomaly_reason AS reason, COUNT(*)::int AS count
      FROM driver_labor_cost_summary s
      ${where} ${conditions.length ? "AND" : "WHERE"} s.anomaly_flag = true AND s.anomaly_reason IS NOT NULL
      GROUP BY anomaly_reason
      ORDER BY count DESC
    `));

    return res.json({ kpis: kpis.rows[0] ?? {}, anomalyBreakdown: anomalyBreakdown.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /cost-per-move/driver-summary ───────────────────────────────────────
// Main grid rows from driver_labor_cost_summary
router.get("/cost-per-move/driver-summary", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, periodFrom, periodTo, driverType, accountId, anomalyOnly, highCostOnly, driverId, limit = "200", offset = "0" } = req.query as Record<string, string>;

    const conditions: string[] = [];
    if (batchId && batchId !== "__all__") conditions.push(`s.import_batch_id = '${batchId.replace(/'/g,"''")}'`);
    if (periodFrom) conditions.push(`s.pay_period_start >= '${periodFrom}'::date`);
    if (periodTo)   conditions.push(`s.pay_period_end   <= '${periodTo}'::date`);
    if (driverType && driverType !== "__all__") conditions.push(`s.driver_type = '${driverType}'`);
    if (anomalyOnly === "true") conditions.push(`s.anomaly_flag = true`);
    if (highCostOnly === "true") conditions.push(`s.cost_per_move > ${CPM_HIGH_THRESHOLD}`);
    if (driverId) conditions.push(`s.driver_id = '${driverId.replace(/'/g,"''")}'`);
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const rows = await db.execute(sql.raw(`
      SELECT s.*
      FROM driver_labor_cost_summary s
      ${where}
      ORDER BY s.total_gross_pay DESC NULLS LAST, s.pay_period_start DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `));

    const total = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM driver_labor_cost_summary s ${where}`));

    return res.json({ rows: rows.rows, total: total.rows[0]?.n ?? 0 });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /cost-per-move/account-aggregation ───────────────────────────────────
// Account-level aggregation from move_labor_cost_allocations
router.get("/cost-per-move/account-aggregation", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, periodFrom, periodTo } = req.query as Record<string, string>;

    const conds: string[] = ["m.move_id IS NOT NULL"];
    if (periodFrom) conds.push(`m.pay_period_start >= '${periodFrom}'::date`);
    if (periodTo)   conds.push(`m.pay_period_end   <= '${periodTo}'::date`);
    if (batchId && batchId !== "__all__") {
      conds.push(`m.source_transaction_id IN (SELECT id FROM openforce_transactions WHERE import_batch_id = '${batchId.replace(/'/g,"''")}' )`);
    }
    const where = "WHERE " + conds.join(" AND ");

    const rows = await db.execute(sql.raw(`
      SELECT
        m.account_id,
        COALESCE(m.account_name, 'Unlinked') AS account_name,
        COUNT(DISTINCT m.move_id)::int        AS total_moves,
        COUNT(DISTINCT m.driver_id)::int      AS driver_count,
        ROUND(SUM(m.move_labor_cost), 2)      AS total_labor_cost,
        ROUND(AVG(m.move_labor_cost), 4)      AS avg_labor_cost_per_move
      FROM move_labor_cost_allocations m
      ${where}
      GROUP BY m.account_id, m.account_name
      ORDER BY total_labor_cost DESC NULLS LAST
    `));

    return res.json({ accounts: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /cost-per-move/move-detail ──────────────────────────────────────────
// Individual move allocations for a driver detail drawer
router.get("/cost-per-move/move-detail", isAuthenticated, async (req: any, res) => {
  try {
    const { driverId, payPeriodStart, payPeriodEnd } = req.query as Record<string, string>;
    if (!driverId) return res.status(400).json({ message: "driverId required" });

    const conds = [`m.driver_id = '${driverId.replace(/'/g,"''")}'`];
    if (payPeriodStart) conds.push(`m.pay_period_start = '${payPeriodStart}'::date`);
    if (payPeriodEnd)   conds.push(`m.pay_period_end   = '${payPeriodEnd}'::date`);
    const where = "WHERE " + conds.join(" AND ");

    const rows = await db.execute(sql.raw(`
      SELECT
        m.*,
        t.move_number, t.origin, t.destination, t.move_type, t.vehicle_type
      FROM move_labor_cost_allocations m
      LEFT JOIN trips t ON m.move_id = t.id
      ${where}
      ORDER BY m.trip_date NULLS LAST
      LIMIT 500
    `));

    return res.json({ moves: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
