import { Router } from "express";
import { db } from "../db";
import {
  rideshareIngestionBatches,
  rideshareRides,
  rideshareExceptions,
  rideshareTransactions,
  rideshareImportBatches,
  rideshareImportRawRows,
  rideshareBillingAudit,
  rideshareBillingAggregates,
  rideshareBillingAggregateItems,
  rideshareExportLog,
  rideshareRejectedRows,
  rideshareBatchReconciliation,
  customers,
  users,
  invoices,
  invoiceLineItems,
  systemAuditLog,
  trips,
  moves,
} from "@shared/schema";
import { eq, desc, and, or, ilike, inArray, sql, count, sum, gte, lte, ne, isNull, isNotNull } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { isAuthenticated } from "../replitAuth";
import { runRideshareImport } from "../services/rideshareParser";
import { matchRideAddresses, loadAddressRefs, normalizeAddress as normalizeAddressEngine } from "../services/rideshareMatchingEngine";
import { writeSystemAuditEvent } from "../services/systemAuditLogService";
import {
  getWidgetSummary,
  getBatchSummary,
  getEmployeeExpenses,
  buildCanonicalConditions,
  derivedLinkStatusSql,
  type CanonicalFilters,
} from "../services/rideshareCanonicalService";
import {
  computeAndStoreReconciliation,
  getStoredReconciliation,
} from "../services/rideshareReconciliationService";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function getUserId(req: any): string | null {
  return (req.session as any)?.userId || req.user?.claims?.sub || null;
}

// ---------------------------------------------------------------------------
// Column lookup helper — case-insensitive, substring-optional match
// ---------------------------------------------------------------------------
function makeKeyFn(raw: Record<string, string>) {
  const rawKeys = Object.keys(raw);
  return (variants: string[]): string | null => {
    for (const v of variants) {
      const vl = v.toLowerCase();
      // Exact match first
      const exact = rawKeys.find(k => k.toLowerCase().trim() === vl);
      if (exact !== undefined) return raw[exact]?.trim() || null;
    }
    for (const v of variants) {
      const vl = v.toLowerCase();
      // Substring match fallback
      const partial = rawKeys.find(k => k.toLowerCase().trim().includes(vl) || vl.includes(k.toLowerCase().trim()));
      if (partial !== undefined) return raw[partial]?.trim() || null;
    }
    return null;
  };
}

function safeParseDate(dateStr: string | null, timeStr?: string | null): Date | null {
  const ds = dateStr?.trim();
  if (!ds) return null;
  const combined = timeStr?.trim() ? `${ds} ${timeStr.trim()}` : ds;
  const d = new Date(combined);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(v: string | null): string | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[$,+\s]/g, ""));
  return isNaN(n) ? null : n.toFixed(2);
}

function parseNum(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Uber column normalizer
// Uber Business CSV headers (new format, exported 2023+):
//   Trip/Eats ID, Service, Transaction Type, Request Date (UTC),
//   Request Time (UTC), First Name, Last Name, Email, Pickup Address,
//   Drop-off Address, Distance (mi), Duration (min), Total Fare USD, Tip in USD,
//   Total Taxes USD, Transaction Amount (Local Currency), Local Currency Code, ...
// ---------------------------------------------------------------------------
function normalizeUberRow(raw: Record<string, string>) {
  const key = makeKeyFn(raw);

  const dateStr = key(["request date (utc)", "date"]);
  const timeStr = key(["request time (utc)", "time"]);
  const rideDatetime = safeParseDate(dateStr, timeStr);

  const firstName = key(["first name"]);
  const lastName  = key(["last name"]);
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || key(["rider name", "passenger name", "passenger"]);

  return {
    providerTripId:  key(["trip/eats id", "trip uuid", "trip id", "uuid"]),
    rideDate:        rideDatetime ? rideDatetime.toISOString().slice(0, 10) : null,
    rideDatetime:    rideDatetime?.toISOString() || null,
    pickupAddress:   key(["pickup address", "start location", "pickup location", "from"]),
    dropoffAddress:  key(["drop-off address", "dropoff address", "end location", "dropoff location", "to"]),
    passengerName:   fullName,
    driverName:      key(["driver name", "driver"]),
    fareAmount:      parseAmount(key(["trip/meal fare (local currency)", "subtotal", "fare", "base fare"])),
    tipAmount:       parseAmount(key(["tip in usd", "tip in local currency", "tip"])),
    totalAmount:     parseAmount(key(["total fare usd", "transaction amount usd", "total", "amount charged", "total charged"])),
    distanceMiles:   parseNum(key(["distance (mi)", "distance(mi)", "distance", "miles"])),
    durationMinutes: parseNum(key(["duration (min)", "duration(min)", "duration", "minutes"])),
    rideStatus:      key(["transaction type", "status", "trip status"]) || "completed",
    rideType:        key(["service", "product type", "ride type", "trip type", "business trip"]) || "Uber",
    city:            key(["city"]),
    state:           key(["state"]),
  };
}

// ---------------------------------------------------------------------------
// Lyft column normalizer
// Lyft Business CSV headers (typical):
//   Date, Time, Pickup Location, Drop-off Location, Ride Type, Distance,
//   Duration, Requested, Discount, Amount, Tip, Payment, Passenger Name,
//   Driver Name, Notes, Trip ID
// ---------------------------------------------------------------------------
function normalizeLyftRow(raw: Record<string, string>) {
  const key = makeKeyFn(raw);

  const dateStr = key(["date", "request date"]);
  const timeStr = key(["time", "request time"]);
  const rideDatetime = safeParseDate(dateStr, timeStr);

  return {
    providerTripId:  key(["trip id", "ride id", "uuid"]),
    rideDate:        rideDatetime ? rideDatetime.toISOString().slice(0, 10) : null,
    rideDatetime:    rideDatetime?.toISOString() || null,
    pickupAddress:   key(["pickup location", "pickup address", "pickup"]),
    dropoffAddress:  key(["drop-off location", "dropoff location", "dropoff address", "drop-off"]),
    passengerName:   key(["passenger name", "passenger", "rider name", "rider"]),
    driverName:      key(["driver name", "driver"]),
    fareAmount:      parseAmount(key(["requested", "base fare", "subtotal"])),
    tipAmount:       parseAmount(key(["tip"])),
    totalAmount:     parseAmount(key(["amount", "payment", "total", "amount charged"])),
    distanceMiles:   parseNum(key(["distance", "distance (mi)", "miles"])),
    durationMinutes: parseNum(key(["duration", "duration (min)", "minutes"])),
    rideStatus:      key(["status"]) || "completed",
    rideType:        key(["ride type", "product", "type"]) || "Lyft",
    city:            key(["city"]),
    state:           key(["state"]),
  };
}

// ---------------------------------------------------------------------------
// Address matching — delegates to rideshareMatchingEngine
// Engine result statuses: "auto_matched" | "exception" | "unmatched"
// Mapped to schema values:  "matched"        | "unmatched"  | "unmatched"
// (exception rides are still inserted; an exception row is created for them)
// ---------------------------------------------------------------------------
interface MatchResult {
  accountId: string | null;
  accountNumber: string | null;
  accountName: string | null;
  matchStatus: "matched" | "unmatched";
  matchConfidence: "high" | "medium" | "low" | null;
  matchMethod: string | null;
  exceptionReason: string | null;
}

function engineConfidenceLabel(score: number | null): "high" | "medium" | "low" | null {
  if (score == null) return null;
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n >= 0.85) return "high";
  if (n >= 0.65) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// POST /upload  — parse file, validate headers, normalize rows, match accounts, persist
// Row-level errors are captured and returned — the batch never fails due to a single bad row.
// ---------------------------------------------------------------------------

// Known column sets used for header validation and detection
// Full set of known columns — used only for header-presence recognition
// (recognizedCount check). Never shown verbatim to the user.
const UBER_KNOWN_COLS = [
  // Uber Business detailed export (current format)
  "trip/eats id", "network transaction id",
  "request date (utc)", "request time (utc)",
  "request date (local)", "request time (local)",
  "drop-off date (utc)", "drop-off time (utc)",
  "drop-off date (local)", "drop-off time (local)",
  "transaction timestamp (utc)",
  "first name", "last name", "email", "employee id",
  "service", "city", "country",
  "pickup address", "drop-off address", "stop details", "multiple stops",
  "distance (mi)", "duration (min)",
  "total fare usd", "tip in usd", "transaction amount usd",
  "transaction amount (local currency)", "local currency code",
  "transaction type",
  "trip/meal fare (local currency)", "booking fee/service fee (local currency)",
  "airport fee (local currency)", "city fee (local currency)",
  "toll fee (local currency)", "delivery fee (local currency)",
  "promotions/discounts (local currency)", "tip in local currency",
  "other charges(local currency)", "total fare (local currency)",
  "total taxes (local currency)", "total taxes usd",
  "payments made by employees/guests (local currency)",
  "payments made by employees/guests (usd currency)",
  "membership savings(local currency)",
  "expense code", "expense memo", "payment method",
  "invoices", "invoice number",
  "voucher program", "voucher program expense memo", "voucher link", "voucher policy", "voucher campaign id",
  "integration partner", "program", "group",
  "request timezone offset from utc",
  "guest first name", "guest last name",
  "isgrouporder", "fulfilment type", "cancellation type",
  "estimated service and technology fee (incl. taxes, if any) in usd",
  "estimated integration fee (incl. taxes, if any) in usd",
  "store name", "order items",
  // Legacy Uber format (backward-compat detection only)
  "trip uuid", "trip id", "start location", "end location", "subtotal", "driver name",
];

// 16 core Uber Business fields shown in UI guidance and mismatch warnings.
// Must match what the Uber parser actually reads (UBER_FIELD_MAP in rideshareParser.ts).
const UBER_CORE_COLS = [
  "trip/eats id", "network transaction id",
  "request date (utc)", "request time (utc)",
  "first name", "last name", "email", "employee id",
  "service", "city",
  "pickup address", "drop-off address",
  "transaction type",
  "distance (mi)", "duration (min)",
  "total fare usd",
];

// Minimum required Uber fields — used to name exactly what is missing in warnings.
const UBER_REQUIRED_COLS = [
  "trip/eats id", "pickup address", "drop-off address", "total fare usd",
];

const LYFT_KNOWN_COLS = [
  "trip id", "date", "time", "pickup location", "drop-off location", "ride type",
  "distance", "duration", "requested", "tip", "amount", "passenger name", "driver name",
];

const LYFT_REQUIRED_COLS = [
  "trip id", "pickup location", "drop-off location",
];

// Keywords used to fingerprint a header row (provider-agnostic core + provider-specific)
const HEADER_DETECTION_KEYWORDS: Record<"uber" | "lyft", string[]> = {
  // Prioritise new Uber Business detailed-export column signatures
  uber: ["trip", "request", "date", "time", "total", "fare", "pickup", "drop", "distance", "employee", "eats"],
  lyft: ["trip", "date", "time", "amount", "pickup", "drop", "driver", "distance", "duration"],
};

/**
 * Scan up to the first `scanLimit` rows of raw array data to find the row whose
 * cells best match expected header keywords. Returns the 0-based index of the
 * best candidate row, or 0 if nothing is confidently detected.
 */
function detectHeaderRow(
  rawRows: string[][],
  provider: "uber" | "lyft",
  scanLimit = 10
): { index: number; confidence: "high" | "low"; detectedRow: number } {
  const keywords = HEADER_DETECTION_KEYWORDS[provider];
  let bestIndex = 0;
  let bestScore = 0;

  const limit = Math.min(scanLimit, rawRows.length);
  for (let i = 0; i < limit; i++) {
    const rowText = rawRows[i]
      .map(c => String(c ?? "").toLowerCase().trim())
      .join(" ");
    const score = keywords.filter(kw => rowText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return {
    index: bestIndex,
    confidence: bestScore >= 2 ? "high" : "low",
    detectedRow: bestIndex + 1, // 1-based for display
  };
}

/**
 * Convert raw string[][] (with a known header row index) into the keyed-object
 * format the rest of the pipeline expects, trimming headers and skipping empty rows.
 */
function buildKeyedRows(rawRows: string[][], headerIndex: number): Record<string, string>[] {
  const headers = rawRows[headerIndex].map(h => String(h ?? "").trim());
  const result: Record<string, string>[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    // Skip completely empty rows
    if (row.every(c => !String(c ?? "").trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(row[idx] ?? "").trim();
    });
    result.push(obj);
  }
  return result;
}

interface RowError {
  rowNumber: number;
  field: string;
  errorCode: "missing_required_field" | "invalid_date_format" | "invalid_numeric_value" | "column_mismatch" | "processing_error";
  errorReason: string;
  originalData: Record<string, string>;
}

router.post("/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const provider = (req.body.provider || "").toLowerCase() as "uber" | "lyft";
    if (provider !== "uber" && provider !== "lyft") {
      return res.status(400).json({ message: "provider must be 'uber' or 'lyft'" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { originalname, size, buffer, mimetype } = req.file;

    // Optional user-specified header row (1-based). "auto" or absent = auto-detect.
    const headerRowParam = req.body.headerRow;
    const userHeaderRow = headerRowParam && headerRowParam !== "auto"
      ? parseInt(headerRowParam, 10)
      : null; // null = auto-detect

    // Create batch record
    let batch: { id: string };
    try {
      const [inserted] = await db.insert(rideshareIngestionBatches).values({
        provider,
        fileName: originalname,
        fileSizeBytes: size,
        status: "processing",
        uploadedByUserId: userId || undefined,
      }).returning();
      batch = inserted;
    } catch (dbErr: any) {
      console.error("[RideshareUpload] Failed to create batch record:", dbErr.stack || dbErr.message);
      return res.status(500).json({ message: "Database error creating upload batch. Please try again.", error: dbErr.message, errorCode: "db_error" });
    }

    // ── Parse file into raw array-of-arrays first ───────────────────────────
    let rawRows: string[][] = [];
    try {
      const isXlsx = mimetype.includes("spreadsheet") || mimetype.includes("excel") || originalname.endsWith(".xlsx") || originalname.endsWith(".xls");
      if (isXlsx) {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
      } else {
        const csvText = buffer.toString("utf-8");
        const parsed = Papa.parse<string[]>(csvText, {
          header: false,
          skipEmptyLines: false, // keep all rows so index alignment is correct
        });
        rawRows = parsed.data;
      }
    } catch (parseErr: any) {
      await db.update(rideshareIngestionBatches)
        .set({ status: "failed", errorMessage: `Parse error: ${parseErr.message}`, updatedAt: new Date() })
        .where(eq(rideshareIngestionBatches.id, batch.id));
      return res.status(422).json({ message: `Could not parse file: ${parseErr.message}`, errorCode: "parse_error" });
    }

    if (rawRows.length === 0) {
      await db.update(rideshareIngestionBatches)
        .set({ status: "failed", errorMessage: "File contained no data rows", updatedAt: new Date() })
        .where(eq(rideshareIngestionBatches.id, batch.id));
      return res.status(422).json({ message: "File contained no data rows", errorCode: "empty_file" });
    }

    // ── Header row detection ────────────────────────────────────────────────
    let headerDetection: { index: number; confidence: "high" | "low"; detectedRow: number };

    if (userHeaderRow !== null && !isNaN(userHeaderRow) && userHeaderRow >= 1) {
      // User explicitly chose a row (1-based → 0-based index)
      const idx = Math.min(userHeaderRow - 1, rawRows.length - 1);
      headerDetection = { index: idx, confidence: "high", detectedRow: userHeaderRow };
    } else {
      headerDetection = detectHeaderRow(rawRows, provider, 15);
      if (headerDetection.confidence === "low" && rawRows.length > 0) {
        // Could not confidently detect — still proceed from row 0, but warn
        console.warn(`[RideshareUpload] Low-confidence header detection for ${provider} file "${originalname}". Defaulting to row 1.`);
      }
    }

    // ── Build keyed rows from detected header position ──────────────────────
    let rows: Record<string, string>[] = [];
    try {
      rows = buildKeyedRows(rawRows, headerDetection.index);
    } catch (buildErr: any) {
      await db.update(rideshareIngestionBatches)
        .set({ status: "failed", errorMessage: `Header build error: ${buildErr.message}`, updatedAt: new Date() })
        .where(eq(rideshareIngestionBatches.id, batch.id));
      return res.status(422).json({ message: `Could not build rows from detected header: ${buildErr.message}`, errorCode: "header_build_error" });
    }

    if (rows.length === 0) {
      await db.update(rideshareIngestionBatches)
        .set({ status: "failed", errorMessage: "No data rows found after header row", updatedAt: new Date() })
        .where(eq(rideshareIngestionBatches.id, batch.id));
      return res.status(422).json({
        message: headerDetection.confidence === "low"
          ? `Unable to detect header row. No data found after row ${headerDetection.detectedRow}. Please select the header row manually and try again.`
          : "No data rows found after the header row.",
        errorCode: "empty_file",
        detectedHeaderRow: headerDetection.detectedRow,
        headerConfidence: headerDetection.confidence,
      });
    }

    // ── Column validation ───────────────────────────────────────────────────
    const detectedHeaders = Object.keys(rows[0] || {}).map(h => h.toLowerCase().trim());

    // Use the full known-col set for recognition (broad match so real exports aren't flagged)
    const knownCols   = provider === "uber" ? UBER_KNOWN_COLS   : LYFT_KNOWN_COLS;
    // Core cols (16 fields) sent to the UI as the human-readable reference list
    const coreCols    = provider === "uber" ? UBER_CORE_COLS    : LYFT_KNOWN_COLS;
    // Minimum required cols — used to name exactly which fields are absent
    const requiredCols = provider === "uber" ? UBER_REQUIRED_COLS : LYFT_REQUIRED_COLS;

    const colMatch = (h: string, e: string) => h === e || h.includes(e) || e.includes(h);
    const recognizedCount = detectedHeaders.filter(h => knownCols.some(e => colMatch(h, e))).length;

    // Identify which required fields are completely absent from the file headers
    const missingRequiredFields = requiredCols
      .filter(req => !detectedHeaders.some(h => colMatch(h, req)))
      .map(f => f.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")); // Title-case for display

    const headerWarning = recognizedCount === 0 && detectedHeaders.length > 0
      ? {
          errorCode: "column_mismatch",
          detectedHeaders,
          expectedHeaders: coreCols,   // only the 16 core fields — never the 60+ full list
          missingRequiredFields,
        }
      : null;

    // ── Load address refs once for matching (engine handles DB query) ───────
    let addressRefs: Awaited<ReturnType<typeof loadAddressRefs>> = [];
    // Build a name lookup from customers for populating accountName on rides
    const customerNameMap = new Map<string, { accountNumber: string | null; companyName: string | null }>();
    try {
      addressRefs = await loadAddressRefs();
      const custRows = await db.select({
        id: customers.id,
        customerNumber: customers.customerNumber,
        companyName: customers.companyName,
      }).from(customers);
      for (const c of custRows) customerNameMap.set(c.id, { accountNumber: c.customerNumber, companyName: c.companyName });
      console.log(`[RideshareUpload] Loaded ${addressRefs.length} account address refs for matching`);
    } catch (custErr: any) {
      console.warn("[RideshareUpload] Could not load address refs for matching (matching disabled):", custErr.message);
      // Non-fatal: proceed without matching
    }

    // ── Pre-normalize rows & batch dedup check ───────────────────────────────
    // Normalize all rows upfront so we can batch-query existing trip IDs.
    const normalizedRows = rows.map((rawRow, i) => ({
      rawRow,
      rowNumber: headerDetection.index + i + 2,
      norm: provider === "uber" ? normalizeUberRow(rawRow) : normalizeLyftRow(rawRow),
    }));

    // Collect non-null trip IDs from file for a single DB existence check
    const tripIdsInFile = normalizedRows
      .map(r => r.norm.providerTripId)
      .filter(Boolean) as string[];

    let existingTripIds = new Set<string>();
    if (tripIdsInFile.length > 0) {
      try {
        const existing = await db
          .select({ providerTripId: rideshareRides.providerTripId })
          .from(rideshareRides)
          .where(and(
            eq(rideshareRides.provider, provider),
            eq(rideshareRides.isDeleted, false),
            inArray(rideshareRides.providerTripId, tripIdsInFile),
          ));
        existingTripIds = new Set(existing.map(r => r.providerTripId!).filter(Boolean));
      } catch (dedupErr: any) {
        console.warn("[RideshareUpload] Dedup pre-check failed (non-fatal, will attempt inserts):", dedupErr.message);
      }
    }

    // Track within-file duplicates (same trip ID appearing twice in one file)
    const seenTripIdsInFile = new Set<string>();

    // ── Process rows — never fail the batch due to a single bad row ─────────
    let matchedCount = 0;
    let unmatchedCount = 0;
    let successfulRows = 0;
    let failedRowCount = 0;
    let skippedCount = 0;
    let totalInsertedAmount = 0;
    const rowErrors: RowError[] = [];
    type NormRow = { providerTripId?: string | null; rideDate?: string | null; pickupAddress?: string | null; dropoffAddress?: string | null; passengerName?: string | null; totalAmount?: string | null; fareAmount?: string | null; [k: string]: any };
    const skippedRows: Array<{ rowNumber: number; providerTripId: string; reason: "duplicate_db" | "duplicate_file"; rawRow: Record<string, string>; norm: NormRow }> = [];
    const hardFailedRows: Array<{ rowNumber: number; rawRow: Record<string, string>; norm: NormRow; errorMessage: string }> = [];

    for (const { rawRow, rowNumber, norm } of normalizedRows) {

      try {
        // ── Duplicate detection ──────────────────────────────────────────────
        if (norm.providerTripId) {
          if (existingTripIds.has(norm.providerTripId)) {
            skippedCount++;
            skippedRows.push({ rowNumber, providerTripId: norm.providerTripId, reason: "duplicate_db", rawRow, norm: norm as any });
            continue;
          }
          if (seenTripIdsInFile.has(norm.providerTripId)) {
            skippedCount++;
            skippedRows.push({ rowNumber, providerTripId: norm.providerTripId, reason: "duplicate_file", rawRow, norm: norm as any });
            continue;
          }
          seenTripIdsInFile.add(norm.providerTripId);
        }

        // ── Required-field validation (flag, never skip the row) ──────────────
        if (provider === "uber") {
          const missingFields: string[] = [];
          if (!norm.providerTripId) missingFields.push("Trip/Eats ID");
          if (!norm.pickupAddress)  missingFields.push("Pickup Address");
          if (!norm.dropoffAddress) missingFields.push("Drop-off Address");
          if (!norm.totalAmount)    missingFields.push("Total Fare USD");
          if (missingFields.length > 0) {
            rowErrors.push({
              rowNumber,
              field: missingFields.join(", "),
              errorCode: "missing_required_field",
              errorReason: `Missing required fields: ${missingFields.join(", ")}. Row saved; verify source file columns.`,
              originalData: rawRow,
            });
            // Note: we still process — don't failedRowCount++ or continue
          }
        } else {
          // Lyft: warn if no date (original behaviour, but as warning not hard fail)
          if (!norm.rideDate && !norm.rideDatetime) {
            rowErrors.push({
              rowNumber,
              field: "date",
              errorCode: "invalid_date_format",
              errorReason: "Could not parse a valid date from the Date/Time columns. Row saved with no date.",
              originalData: rawRow,
            });
          }
          // Warn if no fare
          if (!norm.totalAmount && !norm.fareAmount) {
            rowErrors.push({
              rowNumber,
              field: "total/subtotal",
              errorCode: "invalid_numeric_value",
              errorReason: "No valid fare or total amount found. Row saved but may be missing cost data.",
              originalData: rawRow,
            });
          }
        }

        // ── Column AB — trip/move reference classification ───────────────────
        const rawRef = (norm as any).tripMoveRef as string | null | undefined;
        const externalTripMoveRefRaw   = rawRef ?? null;
        const externalTripMoveRefNormalized = externalTripMoveRefRaw?.trim() || null;

        let tripMoveRefType: string = "unknown";
        let linkStatus: string      = "unlinked";
        let linkExceptionReason: string | null = null;
        let linkedMoveId: string | null = null;
        let linkedTripId: string | null = null;
        let isEmployeeExpense = false;

        if (externalTripMoveRefNormalized) {
          if (externalTripMoveRefNormalized.toLowerCase() === "employee") {
            // Special case: Employee Expense — do not attempt move/trip matching
            tripMoveRefType = "employee";
            linkStatus = "employee_expense";
            isEmployeeExpense = true;
          } else if (externalTripMoveRefNormalized.length !== 8) {
            // Invalid length — flag as exception
            tripMoveRefType = "invalid";
            linkStatus = "exception";
            linkExceptionReason = "invalid_trip_move_reference_length";
          } else {
            // Valid 8-char reference — attempt match against trips.moveNumber and moves.id prefix
            try {
              const [tripMatch] = await db
                .select({ id: trips.id, moveNumber: trips.moveNumber })
                .from(trips)
                .where(eq(trips.moveNumber, externalTripMoveRefNormalized))
                .limit(1);
              if (tripMatch) {
                tripMoveRefType = "trip_id";
                linkStatus = "linked";
                linkedTripId = tripMatch.id;
              } else {
                // Try move prefix match (first 8 chars of UUID)
                const [moveMatch] = await db
                  .select({ id: moves.id })
                  .from(moves)
                  .where(sql`LEFT(${moves.id}::text, 8) = ${externalTripMoveRefNormalized}`)
                  .limit(1);
                if (moveMatch) {
                  tripMoveRefType = "move_id";
                  linkStatus = "linked";
                  linkedMoveId = moveMatch.id;
                } else {
                  tripMoveRefType = "move_id"; // best guess until data is loaded
                  linkStatus = "exception";
                  linkExceptionReason = "trip_move_reference_not_found";
                }
              }
            } catch (linkErr: any) {
              console.warn(`[RideshareUpload] Link lookup failed row ${rowNumber} (non-fatal):`, linkErr.message);
              tripMoveRefType = "unknown";
              linkStatus = "exception";
              linkExceptionReason = "trip_move_reference_not_found";
            }
          }
        }

        // ── Address matching via engine ──────────────────────────────────────
        // Skip address matching for employee expense records
        let matchResult: MatchResult = {
          accountId: null, accountNumber: null, accountName: null,
          matchStatus: "unmatched", matchConfidence: null, matchMethod: null,
          exceptionReason: isEmployeeExpense ? "Employee expense — no account match required" : "No address data in source file",
        };
        let exceptionReason: string | null = null;

        if (!isEmployeeExpense && (norm.pickupAddress || norm.dropoffAddress)) {
          try {
            const engineResult = await matchRideAddresses(
              { pickupAddressRaw: norm.pickupAddress, dropoffAddressRaw: norm.dropoffAddress },
              addressRefs,
            );
            const custInfo = engineResult.matchedAccountId
              ? customerNameMap.get(engineResult.matchedAccountId)
              : null;
            const confScore = engineResult.matchConfidence != null ? parseFloat(engineResult.matchConfidence) : null;

            matchResult = {
              accountId:      engineResult.matchedAccountId,
              accountNumber:  custInfo?.accountNumber ?? engineResult.matchedAccountNumber ?? null,
              accountName:    custInfo?.companyName ?? null,
              matchStatus:    engineResult.matchStatus === "auto_matched" ? "matched" : "unmatched",
              matchConfidence: engineConfidenceLabel(confScore),
              matchMethod:    engineResult.matchMethod,
              exceptionReason: engineResult.exceptionReason,
            };
            exceptionReason = engineResult.exceptionReason;
          } catch (matchErr: any) {
            console.warn(`[RideshareUpload] Match error row ${rowNumber} (non-fatal):`, matchErr.message);
            matchResult.exceptionReason = "Match engine error — manual review required";
            exceptionReason = matchResult.exceptionReason;
          }
        }

        if (matchResult.matchStatus === "matched") matchedCount++;
        else unmatchedCount++;

        // Normalize pickup/dropoff for storage
        const pickupNorm  = normalizeAddressEngine(norm.pickupAddress);
        const dropoffNorm = normalizeAddressEngine(norm.dropoffAddress);

        const [ride] = await db.insert(rideshareRides).values({
          batchId: batch.id,
          provider,
          accountId: matchResult.accountId || undefined,
          accountNumber: matchResult.accountNumber || undefined,
          accountName: matchResult.accountName || undefined,
          matchStatus: matchResult.matchStatus,
          matchConfidence: matchResult.matchConfidence || undefined,
          matchMethod: matchResult.matchMethod || undefined,
          providerTripId: norm.providerTripId || undefined,
          rideDate: norm.rideDate || undefined,
          rideDatetime: norm.rideDatetime ? new Date(norm.rideDatetime) : undefined,
          pickupAddress: norm.pickupAddress || undefined,
          dropoffAddress: norm.dropoffAddress || undefined,
          pickupAddressNormalized: pickupNorm || undefined,
          dropoffAddressNormalized: dropoffNorm || undefined,
          passengerName: norm.passengerName || undefined,
          driverName: norm.driverName || undefined,
          fareAmount: norm.fareAmount || undefined,
          tipAmount: norm.tipAmount || undefined,
          totalAmount: norm.totalAmount || undefined,
          distanceMiles: norm.distanceMiles != null ? String(norm.distanceMiles) : undefined,
          durationMinutes: norm.durationMinutes != null ? Math.round(norm.durationMinutes) : undefined,
          rideStatus: norm.rideStatus || undefined,
          rideType: norm.rideType || undefined,
          city: norm.city || undefined,
          state: norm.state || undefined,
          externalTripMoveRefRaw:        externalTripMoveRefRaw || undefined,
          externalTripMoveRefNormalized: externalTripMoveRefNormalized || undefined,
          tripMoveRefType:               tripMoveRefType,
          linkedMoveId:                  linkedMoveId || undefined,
          linkedTripId:                  linkedTripId || undefined,
          linkStatus:                    linkStatus,
          linkExceptionReason:           linkExceptionReason || undefined,
          rawData: rawRow as any,
        }).returning();

        // Create exception for unmatched rides or link exceptions
        const needsAddressException = !isEmployeeExpense && matchResult.matchStatus === "unmatched";
        const needsLinkException    = linkStatus === "exception";

        if (needsAddressException || needsLinkException) {
          let exceptionReasonText: string;
          if (needsLinkException && needsAddressException) {
            exceptionReasonText = `Link exception: ${linkExceptionReason ?? "unknown"}; Address: ${exceptionReason ?? "unmatched"}`;
          } else if (needsLinkException) {
            exceptionReasonText = linkExceptionReason === "invalid_trip_move_reference_length"
              ? `Invalid trip/move reference length (got ${externalTripMoveRefNormalized?.length ?? 0} chars, expected 8)`
              : `Trip/move reference "${externalTripMoveRefNormalized}" not found in system`;
          } else {
            exceptionReasonText = exceptionReason
              ?? (!norm.pickupAddress && !norm.dropoffAddress
                ? "No address data in source file"
                : "Could not match pickup or dropoff address to any account");
          }
          await db.insert(rideshareExceptions).values({
            rideId: ride.id,
            batchId: batch.id,
            reason: exceptionReasonText,
            resolution: "pending",
          });
        }

        const insertedAmt = parseFloat(norm.totalAmount || norm.fareAmount || "0") || 0;
        totalInsertedAmount += insertedAmt;
        successfulRows++;
      } catch (rowErr: any) {
        console.error(`[RideshareUpload] Row ${rowNumber} failed:`, rowErr.message);
        rowErrors.push({
          rowNumber,
          field: "unknown",
          errorCode: "processing_error",
          errorReason: rowErr.message || "Unexpected error processing this row",
          originalData: rawRow,
        });
        hardFailedRows.push({ rowNumber, rawRow, norm: norm as any, errorMessage: rowErr.message || "Unexpected error processing this row" });
        failedRowCount++;
      }
    }

    // ── Finalize batch ──────────────────────────────────────────────────────
    const batchStatus = successfulRows === 0 && skippedCount === 0 ? "failed" : "complete";
    const errorSummary = failedRowCount > 0
      ? `${failedRowCount} row(s) failed to process. ${rowErrors.map(e => `Row ${e.rowNumber}: ${e.errorReason}`).slice(0, 3).join("; ")}${rowErrors.length > 3 ? " …" : ""}`
      : undefined;

    try {
      await db.update(rideshareIngestionBatches).set({
        status: batchStatus,
        totalRecords: rows.length,
        matchedRecords: matchedCount,
        unmatchedRecords: unmatchedCount,
        skippedRecords: skippedCount,
        errorMessage: errorSummary || undefined,
        updatedAt: new Date(),
      }).where(eq(rideshareIngestionBatches.id, batch.id));
    } catch (finalErr: any) {
      console.error("[RideshareUpload] Failed to finalize batch record:", finalErr.message);
    }

    // ── Run the canonical parser pipeline FIRST (non-fatal) ─────────────────
    // Must run before rejected-row insertion so we can stamp importBatchId on
    // every rejected row — enabling the reconciliation engine to join them.
    let parserResult: Awaited<ReturnType<typeof runRideshareImport>> | null = null;
    try {
      parserResult = await runRideshareImport({
        provider,
        buffer,
        originalName: originalname,
        mimeType: mimetype,
        uploadedByUserId: userId,
      });
    } catch (parserErr: any) {
      console.error("[RideshareUpload] Parser pipeline error (non-fatal):", parserErr.message);
    }

    // ── Persist rejected rows so nothing is silently dropped ────────────────
    // importBatchId (new canonical batch) is set on every row so the
    // reconciliation engine can count rejected/duplicate rows per import batch.
    const canonicalImportBatchId = parserResult?.batchId ?? null;

    let totalRejectedAmount = 0;
    const rejectedRowsToInsert: Array<{
      batchId: string; importBatchId: string | null; provider: string; rowNumber: number | undefined; providerTripId: string | undefined;
      rideDate: string | undefined; pickupAddress: string | undefined; dropoffAddress: string | undefined;
      passengerName: string | undefined; totalAmount: string | undefined;
      rejectionCode: string; rejectionDetail: string | undefined; rejectionReason: string; rawData: any;
    }> = [];

    for (const s of skippedRows) {
      const amt = parseFloat(s.norm.totalAmount || s.norm.fareAmount || "0") || 0;
      totalRejectedAmount += amt;
      const isDupDb = s.reason === "duplicate_db";
      rejectedRowsToInsert.push({
        batchId: batch.id, importBatchId: canonicalImportBatchId, provider,
        rowNumber: s.rowNumber, providerTripId: s.providerTripId || undefined,
        rideDate: s.norm.rideDate || undefined,
        pickupAddress: s.norm.pickupAddress || undefined,
        dropoffAddress: s.norm.dropoffAddress || undefined,
        passengerName: s.norm.passengerName || undefined,
        totalAmount: amt > 0 ? String(amt) : undefined,
        rejectionCode: "duplicate_trip_id",
        rejectionDetail: isDupDb ? "Already imported in a previous batch" : "Duplicate Trip ID within this file",
        rejectionReason: isDupDb
          ? `Trip ID ${s.providerTripId} already exists in the database (imported in a prior batch).`
          : `Trip ID ${s.providerTripId} appears more than once in this file — only the first occurrence is imported.`,
        rawData: s.rawRow,
      });
    }

    for (const f of hardFailedRows) {
      const amt = parseFloat(f.norm.totalAmount || f.norm.fareAmount || "0") || 0;
      totalRejectedAmount += amt;
      rejectedRowsToInsert.push({
        batchId: batch.id, importBatchId: canonicalImportBatchId, provider,
        rowNumber: f.rowNumber, providerTripId: f.norm.providerTripId || undefined,
        rideDate: f.norm.rideDate || undefined,
        pickupAddress: f.norm.pickupAddress || undefined,
        dropoffAddress: f.norm.dropoffAddress || undefined,
        passengerName: f.norm.passengerName || undefined,
        totalAmount: amt > 0 ? String(amt) : undefined,
        rejectionCode: "failed_parsing",
        rejectionDetail: undefined,
        rejectionReason: f.errorMessage,
        rawData: f.rawRow,
      });
    }

    if (rejectedRowsToInsert.length > 0) {
      try {
        await db.insert(rideshareRejectedRows).values(rejectedRowsToInsert as any);
      } catch (rjErr: any) {
        console.error("[RideshareUpload] Failed to persist rejected rows (non-fatal):", rjErr.message);
      }
    }

    // ── Compute and store reconciliation summary (non-fatal) ─────────────────
    // After all inserts complete, compute the tie-out so it is available
    // immediately when the UI refreshes after upload.
    if (canonicalImportBatchId) {
      computeAndStoreReconciliation(canonicalImportBatchId).catch((rErr: any) =>
        console.warn("[RideshareUpload] Reconciliation compute error (non-fatal):", rErr?.message ?? rErr)
      );
    }

    const hasErrors = failedRowCount > 0 || !!headerWarning;
    const insertedCount = successfulRows;
    const messageParts = [`${insertedCount} new record${insertedCount !== 1 ? "s" : ""} inserted`];
    if (skippedCount > 0) messageParts.push(`${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""} skipped`);
    if (failedRowCount > 0) messageParts.push(`${failedRowCount} failed`);
    const message = hasErrors
      ? `Upload completed — ${messageParts.join(", ")}.`
      : `Upload complete — ${messageParts.join(", ")}. ${matchedCount} matched, ${unmatchedCount} sent to exceptions.`;

    return res.json({
      batchId: batch.id,
      totalRecords: rows.length,
      insertedCount,
      skippedCount,
      rejectedCount: rejectedRowsToInsert.length,
      successfulRows,
      failedRows: failedRowCount,
      matchedRecords: matchedCount,
      unmatchedRecords: unmatchedCount,
      totalImportedAmount: totalInsertedAmount,
      totalRejectedAmount,
      hasErrors,
      headerWarning,
      rowErrors,
      message,
      detectedHeaderRow: headerDetection.detectedRow,
      headerConfidence: headerDetection.confidence,
      rawLayer: parserResult ? {
        importBatchId: parserResult.batchId,
        parsedRows: parserResult.parsedRows,
        matchedRows: parserResult.matchedRows,
        exceptionRows: parserResult.exceptionRows,
        failedRows: parserResult.failedRows,
        rowErrors: parserResult.rowErrors,
      } : null,
    });
  } catch (err: any) {
    console.error("[RideshareUpload] Fatal error:", err.stack || err.message, err);
    return res.status(500).json({
      message: "Upload processing failed due to an unexpected server error. Please check the file format and try again.",
      error: err.message,
      errorCode: "server_error",
    });
  }
});

// Multer error handler — must come directly after the route it covers
router.use("/upload", (err: any, _req: any, res: any, next: any) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "File is too large. Maximum allowed size is 50MB.", errorCode: "file_too_large" });
  }
  if (err && err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ message: "Unexpected file field. Use field name 'file'.", errorCode: "unexpected_field" });
  }
  if (err) {
    console.error("[RideshareUpload] Multer error:", err.message);
    return res.status(400).json({ message: `File upload error: ${err.message}`, errorCode: "upload_error" });
  }
  return next(err);
});

// ---------------------------------------------------------------------------
// GET /batches — list all ingestion batches
// ---------------------------------------------------------------------------
router.get("/batches", isAuthenticated, async (req: any, res) => {
  try {
    const batches = await db.select().from(rideshareIngestionBatches)
      .where(eq(rideshareIngestionBatches.isDeleted, false))
      .orderBy(desc(rideshareIngestionBatches.createdAt));
    return res.json(batches);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /batches/:id/impact — pre-delete impact summary (ride count + revenue)
// ---------------------------------------------------------------------------
router.get("/batches/:id/impact", isAuthenticated, async (req: any, res) => {
  const { id } = req.params;
  try {
    const [batch] = await db
      .select()
      .from(rideshareIngestionBatches)
      .where(and(eq(rideshareIngestionBatches.id, id), eq(rideshareIngestionBatches.isDeleted, false)));
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const [stats] = await db.select({
      rideCount:     count(rideshareRides.id),
      totalRevenue:  sum(rideshareRides.totalAmount),
      matchedCount:  sql<number>`COUNT(*) FILTER (WHERE ${rideshareRides.matchStatus} = 'matched')`,
      unmatchedCount: sql<number>`COUNT(*) FILTER (WHERE ${rideshareRides.matchStatus} != 'matched')`,
    })
      .from(rideshareRides)
      .where(and(
        eq(rideshareRides.batchId, id),
        eq(rideshareRides.isDeleted, false),
      ));

    return res.json({
      batchId: id,
      fileName: batch.fileName,
      provider: batch.provider,
      rideCount:    Number(stats?.rideCount)   || 0,
      totalRevenue: parseFloat(stats?.totalRevenue ?? "0") || 0,
      matchedCount: Number(stats?.matchedCount) || 0,
      unmatchedCount: Number(stats?.unmatchedCount) || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /batches/:id — soft-delete a batch and all its rides (audited)
//
// Behavior: Option A — soft delete
//   • rideshare_rides.is_deleted = true (excluded from all reporting immediately)
//   • rideshare_ingestion_batches.is_deleted = true (hidden from batch list)
//   • rideshare_exceptions are NOT deleted — they remain but their ride FK will
//     naturally return null/empty joins. Resolution-only queries still work.
//   • Full audit event written with actual ride count + revenue at time of deletion.
// ---------------------------------------------------------------------------
router.delete("/batches/:id", isAuthenticated, async (req: any, res) => {
  const { id } = req.params;
  const userId: string | null = (req.session as any)?.userId || req.user?.claims?.sub || null;
  const userEmail: string | null = req.user?.claims?.email || null;
  const now = new Date();
  try {
    // Fetch batch (must be active / not already deleted)
    const [batch] = await db
      .select()
      .from(rideshareIngestionBatches)
      .where(and(
        eq(rideshareIngestionBatches.id, id),
        eq(rideshareIngestionBatches.isDeleted, false),
      ));
    if (!batch) return res.status(404).json({ message: "Batch not found or already deleted" });

    // Snapshot actual ride counts / revenue before soft delete
    const [snapshot] = await db
      .select({
        rideCount: count(rideshareRides.id),
        totalRevenue: sum(rideshareRides.totalAmount),
        matchedCount:   sql<number>`COUNT(*) FILTER (WHERE ${rideshareRides.matchStatus} = 'matched')`,
        unmatchedCount: sql<number>`COUNT(*) FILTER (WHERE ${rideshareRides.matchStatus} != 'matched')`,
      })
      .from(rideshareRides)
      .where(and(
        eq(rideshareRides.batchId, id),
        eq(rideshareRides.isDeleted, false),
      ));

    const affectedRideCount = Number(snapshot?.rideCount)   || 0;
    const affectedRevenue   = parseFloat(snapshot?.totalRevenue ?? "0") || 0;

    // Soft-delete rides first
    await db.update(rideshareRides).set({
      isDeleted: true,
      deletedAt: now,
    }).where(and(
      eq(rideshareRides.batchId, id),
      eq(rideshareRides.isDeleted, false),
    ));

    // Soft-delete batch
    await db.update(rideshareIngestionBatches).set({
      isDeleted: true,
      deletedAt: now,
    }).where(eq(rideshareIngestionBatches.id, id));

    // Audit log — non-fatal
    try {
      await writeSystemAuditEvent({
        eventType: "rideshare_batch_deleted",
        actorUserId: userId,
        actorUserEmail: userEmail,
        targetEntityType: "rideshare_ingestion_batch",
        targetEntityId: id,
        targetEntityLabel: batch.fileName,
        reason: "Manual batch deletion via Rideshare Reconciliation UI (soft delete)",
        previousValue: {
          fileName: batch.fileName,
          provider: batch.provider,
          status: batch.status,
          storedTotalRecords: batch.totalRecords,
          storedMatchedRecords: batch.matchedRecords,
          storedUnmatchedRecords: batch.unmatchedRecords,
          storedSkippedRecords: batch.skippedRecords,
          actualRideCount: affectedRideCount,
          actualRevenue: affectedRevenue,
          actualMatchedCount: snapshot?.matchedCount ?? 0,
          actualUnmatchedCount: snapshot?.unmatchedCount ?? 0,
          createdAt: batch.createdAt,
        },
        newValue: { isDeleted: true, deletedAt: now.toISOString() },
        metadata: {
          deleteType: "soft",
          deletedRideCount: affectedRideCount,
          deletedRevenue: affectedRevenue,
        },
      });
    } catch (auditErr: any) {
      console.error("[DeleteBatch] Audit write failed (non-fatal):", auditErr.message);
    }

    return res.json({
      message: `Batch soft-deleted: ${affectedRideCount} ride${affectedRideCount !== 1 ? "s" : ""} totaling $${affectedRevenue.toFixed(2)} removed from reporting.`,
      deletedRides: affectedRideCount,
      deletedRevenue: affectedRevenue,
      auditLogged: true,
      deleteType: "soft",
    });
  } catch (err: any) {
    console.error("[DeleteBatch] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /batches/bulk-cleanup — delete all failed/processing batches with 0 rides
// ---------------------------------------------------------------------------
router.post("/batches/bulk-cleanup", isAuthenticated, async (req: any, res) => {
  const userId: string | null = (req.session as any)?.userId || req.user?.claims?.sub || null;
  const userEmail: string | null = req.user?.claims?.email || null;
  try {
    // Find active batches that have no actual ride records
    const emptyBatches = await db.execute(sql`
      SELECT b.id, b.file_name, b.provider, b.status, b.total_records, b.created_at
      FROM rideshare_ingestion_batches b
      WHERE b.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM rideshare_rides r WHERE r.batch_id = b.id AND r.is_deleted = false
        )
      ORDER BY b.created_at ASC
    `);

    const toDelete = (emptyBatches as any).rows as Array<{
      id: string; file_name: string; provider: string; status: string; total_records: number; created_at: string;
    }>;

    if (toDelete.length === 0) {
      return res.json({ message: "No empty batches found to clean up.", deletedCount: 0 });
    }

    const deletedIds: string[] = [];
    for (const b of toDelete) {
      await db.delete(rideshareIngestionBatches).where(eq(rideshareIngestionBatches.id, b.id));
      deletedIds.push(b.id);
    }

    // One audit event covering the whole cleanup
    await writeSystemAuditEvent({
      eventType: "rideshare_batch_bulk_cleanup",
      actorUserId: userId,
      actorUserEmail: userEmail,
      targetEntityType: "rideshare_ingestion_batch",
      targetEntityId: "bulk",
      targetEntityLabel: `${deletedIds.length} empty batches removed`,
      reason: "Bulk cleanup of empty/failed import batches via Rideshare Reconciliation UI",
      previousValue: { removedBatches: toDelete.map(b => ({ id: b.id, fileName: b.file_name, status: b.status })) },
      newValue: null,
      metadata: { deletedCount: deletedIds.length },
    });

    return res.json({
      message: `Cleaned up ${deletedIds.length} empty batch${deletedIds.length !== 1 ? "es" : ""}.`,
      deletedCount: deletedIds.length,
      deletedBatches: toDelete.map(b => ({ id: b.id, fileName: b.file_name, status: b.status })),
      auditLogged: true,
    });
  } catch (err: any) {
    console.error("[BulkCleanup] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /batches/:id/rematch — re-run address matching on all rides in a batch
// ---------------------------------------------------------------------------
router.post("/batches/:id/rematch", isAuthenticated, async (req: any, res) => {
  const { id } = req.params;
  const userId: string | null = (req.session as any)?.userId || req.user?.claims?.sub || null;
  const userEmail: string | null = req.user?.claims?.email || null;

  try {
    const [batch] = await db
      .select()
      .from(rideshareIngestionBatches)
      .where(eq(rideshareIngestionBatches.id, id));
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    // Load all active rides in this batch
    const rides = await db
      .select()
      .from(rideshareRides)
      .where(and(eq(rideshareRides.batchId, id), eq(rideshareRides.isDeleted, false)));

    if (rides.length === 0) {
      return res.json({ message: "No rides found in this batch to rematch.", rematched: 0 });
    }

    // Snapshot before-state for audit
    const beforeMatchedCount  = rides.filter(r => r.matchStatus === "matched").length;
    const beforeUnmatchedCount = rides.filter(r => r.matchStatus === "unmatched").length;

    // Pre-load address refs and customer name map once
    const addressRefs = await loadAddressRefs();
    const custRows = await db.select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      companyName: customers.companyName,
    }).from(customers);
    const customerNameMap = new Map(custRows.map(c => [c.id, { accountNumber: c.customerNumber, companyName: c.companyName }]));

    // Load existing exceptions for this batch (to avoid creating duplicates)
    const existingExceptions = await db
      .select({ rideId: rideshareExceptions.rideId, id: rideshareExceptions.id })
      .from(rideshareExceptions)
      .where(eq(rideshareExceptions.batchId, id));
    const exceptionByRide = new Map(existingExceptions.map(e => [e.rideId, e.id]));

    let nowMatched = 0;
    let nowUnmatched = 0;
    let updated = 0;

    function engineConfLabelRematch(score: number | null): "high" | "medium" | "low" | null {
      if (score == null) return null;
      if (score >= 0.85) return "high";
      if (score >= 0.65) return "medium";
      return "low";
    }

    for (const ride of rides) {
      try {
        let newMatchStatus: "matched" | "unmatched" = "unmatched";
        let newAccountId: string | null = null;
        let newAccountNumber: string | null = null;
        let newAccountName: string | null = null;
        let newConfidence: "high" | "medium" | "low" | null = null;
        let newMethod: string | null = null;
        let exceptionReason: string | null = null;

        if (ride.pickupAddress || ride.dropoffAddress) {
          const engineResult = await matchRideAddresses(
            { pickupAddressRaw: ride.pickupAddress, dropoffAddressRaw: ride.dropoffAddress },
            addressRefs,
          );
          const custInfo = engineResult.matchedAccountId ? customerNameMap.get(engineResult.matchedAccountId) : null;
          const confScore = engineResult.matchConfidence != null ? parseFloat(engineResult.matchConfidence) : null;
          newMatchStatus    = engineResult.matchStatus === "auto_matched" ? "matched" : "unmatched";
          newAccountId      = engineResult.matchedAccountId;
          newAccountNumber  = custInfo?.accountNumber ?? engineResult.matchedAccountNumber ?? null;
          newAccountName    = custInfo?.companyName ?? null;
          newConfidence     = engineConfLabelRematch(confScore);
          newMethod         = engineResult.matchMethod;
          exceptionReason   = engineResult.exceptionReason;
        }

        // Update the ride
        await db.update(rideshareRides).set({
          matchStatus:     newMatchStatus,
          accountId:       newAccountId ?? undefined,
          accountNumber:   newAccountNumber ?? undefined,
          accountName:     newAccountName ?? undefined,
          matchConfidence: newConfidence ?? undefined,
          matchMethod:     newMethod ?? undefined,
        }).where(eq(rideshareRides.id, ride.id));

        if (newMatchStatus === "matched") {
          nowMatched++;
          // Delete any existing exception for this ride (it's now matched)
          if (exceptionByRide.has(ride.id)) {
            await db.delete(rideshareExceptions).where(eq(rideshareExceptions.rideId, ride.id));
            exceptionByRide.delete(ride.id);
          }
        } else {
          nowUnmatched++;
          // Create exception if one doesn't exist
          if (!exceptionByRide.has(ride.id)) {
            const reason = exceptionReason
              ?? (!ride.pickupAddress && !ride.dropoffAddress
                ? "No address data in source file"
                : "Could not match pickup or dropoff address to any account");
            await db.insert(rideshareExceptions).values({
              rideId: ride.id,
              batchId: id,
              reason,
              resolution: "pending",
            });
          }
        }
        updated++;
      } catch (rowErr: any) {
        console.warn(`[Rematch] Error on ride ${ride.id}:`, rowErr.message);
      }
    }

    // Update batch summary counts
    await db.update(rideshareIngestionBatches).set({
      matchedRecords:   nowMatched,
      unmatchedRecords: nowUnmatched,
      updatedAt:        new Date(),
    }).where(eq(rideshareIngestionBatches.id, id));

    // Audit log
    await writeSystemAuditEvent({
      eventType: "rideshare_batch_rematch",
      actorUserId: userId,
      actorUserEmail: userEmail,
      targetEntityType: "rideshare_ingestion_batch",
      targetEntityId: id,
      targetEntityLabel: batch.fileName,
      reason: "Manual rematch triggered via Rideshare Reconciliation UI",
      previousValue: { matchedCount: beforeMatchedCount, unmatchedCount: beforeUnmatchedCount },
      newValue:      { matchedCount: nowMatched,          unmatchedCount: nowUnmatched, updatedRides: updated },
      metadata:      { provider: batch.provider, totalRides: rides.length },
    });

    return res.json({
      message: `Rematch complete — ${nowMatched} matched, ${nowUnmatched} in exceptions.`,
      totalRides:    rides.length,
      updatedRides:  updated,
      nowMatched,
      nowUnmatched,
      previouslyMatched:   beforeMatchedCount,
      previouslyUnmatched: beforeUnmatchedCount,
      auditLogged: true,
    });
  } catch (err: any) {
    console.error("[Rematch] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /batches/audit-log — recent audit events for rideshare batches
// ---------------------------------------------------------------------------
router.get("/batches/audit-log", isAuthenticated, async (req: any, res) => {
  try {
    const events = await db
      .select()
      .from(systemAuditLog)
      .where(eq(systemAuditLog.targetEntityType, "rideshare_ingestion_batch"))
      .orderBy(desc(systemAuditLog.createdAt))
      .limit(50);
    return res.json(events);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /rejected — list rejected rows, optionally filtered by batchId
// ---------------------------------------------------------------------------
router.get("/rejected", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId, provider: providerFilter, limit = "500", offset = "0" } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (batchId) conditions.push(eq(rideshareRejectedRows.batchId, batchId));
    if (providerFilter) conditions.push(eq(rideshareRejectedRows.provider, providerFilter));
    const rows = await db
      .select()
      .from(rideshareRejectedRows)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(rideshareRejectedRows.createdAt))
      .limit(parseInt(limit, 10))
      .offset(parseInt(offset, 10));
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /rejected/export — CSV export of rejected rows for a batch
// ---------------------------------------------------------------------------
router.get("/rejected/export", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (batchId) conditions.push(eq(rideshareRejectedRows.batchId, batchId));
    const rows = await db
      .select()
      .from(rideshareRejectedRows)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(rideshareRejectedRows.rowNumber);

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Row #", "Trip/Eats ID", "Date", "Pickup Address", "Dropoff Address", "Passenger", "Total Amount", "Rejection Code", "Rejection Reason", "Reprocess Status"];
    const csvRows = rows.map(r => [
      r.rowNumber, r.providerTripId, r.rideDate, r.pickupAddress, r.dropoffAddress,
      r.passengerName, r.totalAmount, r.rejectionCode, r.rejectionReason, r.reprocessStatus,
    ].map(v => escape(v as any)));
    const csv = [headers.map(h => `"${h}"`).join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const filename = batchId ? `rejected-rows-${batchId.slice(0, 8)}.csv` : "rejected-rows.csv";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /rejected/reprocess — retry selected rejected rows
// ---------------------------------------------------------------------------
router.post("/rejected/reprocess", isAuthenticated, async (req: any, res) => {
  try {
    const { rejectedIds, batchId } = req.body as { rejectedIds?: string[]; batchId?: string };
    const conditions: any[] = [eq(rideshareRejectedRows.reprocessStatus, "pending")];
    if (rejectedIds?.length) conditions.push(inArray(rideshareRejectedRows.id, rejectedIds));
    else if (batchId) conditions.push(eq(rideshareRejectedRows.batchId, batchId));
    else return res.status(400).json({ message: "Provide rejectedIds or batchId" });

    const toReprocess = await db
      .select()
      .from(rideshareRejectedRows)
      .where(and(...conditions));

    if (toReprocess.length === 0) return res.json({ reprocessed: 0, inserted: 0, stillRejected: 0, message: "No pending rows found to reprocess." });

    // Only retry rows that aren't duplicate_trip_id (those will fail again)
    const retryable = toReprocess.filter(r => r.rejectionCode !== "duplicate_trip_id");
    const notRetryable = toReprocess.filter(r => r.rejectionCode === "duplicate_trip_id");

    // Mark duplicate-trip-id rows as dismissed
    if (notRetryable.length > 0) {
      await db.update(rideshareRejectedRows)
        .set({ reprocessStatus: "dismissed" })
        .where(inArray(rideshareRejectedRows.id, notRetryable.map(r => r.id)));
    }

    let insertedCount = 0;
    const stillRejectedIds: string[] = [];

    // Build address refs for matching
    let addressRefs: any[] = [];
    const customerNameMap = new Map<string, { accountNumber: string | null; companyName: string | null }>();
    try {
      addressRefs = await loadAddressRefs();
      const custRows = await db.select({ id: customers.id, customerNumber: customers.customerNumber, companyName: customers.companyName }).from(customers);
      for (const c of custRows) customerNameMap.set(c.id, { accountNumber: c.customerNumber, companyName: c.companyName });
    } catch (_) { /* non-fatal */ }

    // Check which trip IDs still exist in DB (re-dedup)
    const tripIds = retryable.map(r => r.providerTripId).filter(Boolean) as string[];
    const existingSet = new Set<string>();
    if (tripIds.length > 0) {
      const existing = await db.select({ providerTripId: rideshareRides.providerTripId }).from(rideshareRides)
        .where(and(
          eq(rideshareRides.provider, retryable[0]?.provider ?? "uber"),
          eq(rideshareRides.isDeleted, false),
          inArray(rideshareRides.providerTripId, tripIds),
        ));
      for (const e of existing) if (e.providerTripId) existingSet.add(e.providerTripId);
    }

    for (const rejected of retryable) {
      // Still a duplicate — dismiss it
      if (rejected.providerTripId && existingSet.has(rejected.providerTripId)) {
        await db.update(rideshareRejectedRows).set({ reprocessStatus: "dismissed" }).where(eq(rideshareRejectedRows.id, rejected.id));
        stillRejectedIds.push(rejected.id);
        continue;
      }
      try {
        const rawData = (rejected.rawData ?? {}) as Record<string, string>;
        const norm = rejected.provider === "uber" ? normalizeUberRow(rawData) : normalizeLyftRow(rawData);
        let matchResult: any = { accountId: null, accountNumber: null, accountName: null, matchStatus: "unmatched", matchConfidence: null, matchMethod: null };
        if (norm.pickupAddress || norm.dropoffAddress) {
          try {
            const eng = await matchRideAddresses({ pickupAddressRaw: norm.pickupAddress, dropoffAddressRaw: norm.dropoffAddress }, addressRefs);
            const custInfo = eng.matchedAccountId ? customerNameMap.get(eng.matchedAccountId) : null;
            const confScore = eng.matchConfidence != null ? parseFloat(eng.matchConfidence) : null;
            matchResult = {
              accountId: eng.matchedAccountId, accountNumber: custInfo?.accountNumber ?? eng.matchedAccountNumber ?? null,
              accountName: custInfo?.companyName ?? null,
              matchStatus: eng.matchStatus === "auto_matched" ? "matched" : "unmatched",
              matchConfidence: engineConfidenceLabel(confScore), matchMethod: eng.matchMethod,
            };
          } catch (_) { /* non-fatal */ }
        }
        const pickupNorm = normalizeAddressEngine(norm.pickupAddress);
        const dropoffNorm = normalizeAddressEngine(norm.dropoffAddress);
        const [ride] = await db.insert(rideshareRides).values({
          batchId: rejected.batchId, provider: rejected.provider,
          accountId: matchResult.accountId || undefined, accountNumber: matchResult.accountNumber || undefined,
          accountName: matchResult.accountName || undefined, matchStatus: matchResult.matchStatus,
          matchConfidence: matchResult.matchConfidence || undefined, matchMethod: matchResult.matchMethod || undefined,
          providerTripId: norm.providerTripId || undefined, rideDate: norm.rideDate || undefined,
          rideDatetime: norm.rideDatetime ? new Date(norm.rideDatetime) : undefined,
          pickupAddress: norm.pickupAddress || undefined, dropoffAddress: norm.dropoffAddress || undefined,
          pickupAddressNormalized: pickupNorm || undefined, dropoffAddressNormalized: dropoffNorm || undefined,
          passengerName: norm.passengerName || undefined, driverName: norm.driverName || undefined,
          fareAmount: norm.fareAmount || undefined, tipAmount: norm.tipAmount || undefined,
          totalAmount: norm.totalAmount || undefined, distanceMiles: norm.distanceMiles != null ? String(norm.distanceMiles) : undefined,
          durationMinutes: norm.durationMinutes != null ? Math.round(norm.durationMinutes) : undefined,
          rideStatus: norm.rideStatus || undefined, rideType: norm.rideType || undefined,
          city: norm.city || undefined, state: norm.state || undefined, rawData: rawData as any,
        }).returning();

        if (matchResult.matchStatus === "unmatched") {
          await db.insert(rideshareExceptions).values({ rideId: ride.id, batchId: rejected.batchId, reason: "Reprocessed from rejected row", resolution: "pending" });
        }

        await db.update(rideshareRejectedRows).set({ reprocessStatus: "reprocessed", reprocessedRideId: ride.id }).where(eq(rideshareRejectedRows.id, rejected.id));
        insertedCount++;
      } catch (rowErr: any) {
        console.error("[Reprocess] Failed on rejected row:", rejected.id, rowErr.message);
        stillRejectedIds.push(rejected.id);
      }
    }

    const totalReprocessed = insertedCount + notRetryable.length;
    return res.json({
      reprocessed: totalReprocessed,
      inserted: insertedCount,
      dismissed: notRetryable.length,
      stillRejected: stillRejectedIds.length,
      message: `${insertedCount} row${insertedCount !== 1 ? "s" : ""} successfully imported. ${notRetryable.length} duplicate(s) dismissed. ${stillRejectedIds.length} still failed.`,
    });
  } catch (err: any) {
    console.error("[Reprocess] Fatal error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /rides — paginated ride list with filters
// ---------------------------------------------------------------------------
router.get("/rides", isAuthenticated, async (req: any, res) => {
  try {
    const {
      batchId,
      provider,
      matchStatus,
      accountId,
      search,
      limit = "100",
      offset = "0",
    } = req.query as Record<string, string>;

    const conditions: any[] = [eq(rideshareRides.isDeleted, false)];
    if (batchId) conditions.push(eq(rideshareRides.batchId, batchId));
    if (provider) conditions.push(eq(rideshareRides.provider, provider));
    if (matchStatus) conditions.push(eq(rideshareRides.matchStatus, matchStatus));
    if (accountId) conditions.push(eq(rideshareRides.accountId, accountId));
    if (search) {
      conditions.push(or(
        ilike(rideshareRides.pickupAddress, `%${search}%`),
        ilike(rideshareRides.dropoffAddress, `%${search}%`),
        ilike(rideshareRides.passengerName, `%${search}%`),
        ilike(rideshareRides.accountName, `%${search}%`),
        ilike(rideshareRides.providerTripId, `%${search}%`),
      ));
    }

    const whereClause = and(...conditions);

    const [rides, totalRow] = await Promise.all([
      db.select().from(rideshareRides)
        .where(whereClause)
        .orderBy(desc(rideshareRides.rideDate), desc(rideshareRides.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db.select({ total: count() }).from(rideshareRides).where(whereClause),
    ]);

    return res.json({ rides, total: totalRow[0]?.total || 0 });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /exceptions — list pending/all exceptions
// ---------------------------------------------------------------------------
router.get("/exceptions", isAuthenticated, async (req: any, res) => {
  try {
    const { resolution = "pending", batchId, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (resolution && resolution !== "all") conditions.push(eq(rideshareExceptions.resolution, resolution));
    if (batchId) conditions.push(eq(rideshareExceptions.batchId, batchId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const exceptions = await db.select({
      exc: rideshareExceptions,
      ride: rideshareRides,
    })
      .from(rideshareExceptions)
      .innerJoin(rideshareRides, eq(rideshareExceptions.rideId, rideshareRides.id))
      .where(whereClause)
      .orderBy(desc(rideshareExceptions.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const totalRow = await db.select({ total: count() })
      .from(rideshareExceptions)
      .where(whereClause);

    return res.json({
      exceptions: exceptions.map(r => ({ ...r.exc, ride: r.ride })),
      total: totalRow[0]?.total || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /exceptions/:id/match — manually match an exception to an account
// ---------------------------------------------------------------------------
router.post("/exceptions/:id/match", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { accountId, notes } = req.body;
    if (!accountId) return res.status(400).json({ message: "accountId is required" });

    // Lookup customer
    const [cust] = await db.select().from(customers).where(eq(customers.id, accountId)).limit(1);
    if (!cust) return res.status(404).json({ message: "Account not found" });

    // Lookup exception
    const [exc] = await db.select().from(rideshareExceptions).where(eq(rideshareExceptions.id, id)).limit(1);
    if (!exc) return res.status(404).json({ message: "Exception not found" });

    // Update the ride
    await db.update(rideshareRides).set({
      accountId: cust.id,
      accountNumber: cust.customerNumber,
      accountName: cust.companyName,
      matchStatus: "matched",
      matchConfidence: "high",
      matchMethod: "manual",
    }).where(eq(rideshareRides.id, exc.rideId));

    // Resolve the exception
    await db.update(rideshareExceptions).set({
      resolution: "matched",
      resolvedByUserId: userId || undefined,
      resolvedAt: new Date(),
      notes: notes || undefined,
    }).where(eq(rideshareExceptions.id, id));

    // Update batch counters
    const [batch] = await db.select().from(rideshareIngestionBatches)
      .where(eq(rideshareIngestionBatches.id, exc.batchId)).limit(1);
    if (batch) {
      await db.update(rideshareIngestionBatches).set({
        matchedRecords: (batch.matchedRecords || 0) + 1,
        unmatchedRecords: Math.max(0, (batch.unmatchedRecords || 0) - 1),
        updatedAt: new Date(),
      }).where(eq(rideshareIngestionBatches.id, exc.batchId));
    }

    return res.json({ message: "Exception resolved — ride matched to account" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /exceptions/:id/dismiss — dismiss an exception
// ---------------------------------------------------------------------------
router.post("/exceptions/:id/dismiss", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { notes } = req.body;

    const [exc] = await db.select().from(rideshareExceptions).where(eq(rideshareExceptions.id, id)).limit(1);
    if (!exc) return res.status(404).json({ message: "Exception not found" });

    await db.update(rideshareRides).set({
      matchStatus: "dismissed",
    }).where(eq(rideshareRides.id, exc.rideId));

    await db.update(rideshareExceptions).set({
      resolution: "dismissed",
      resolvedByUserId: userId || undefined,
      resolvedAt: new Date(),
      notes: notes || undefined,
    }).where(eq(rideshareExceptions.id, id));

    return res.json({ message: "Exception dismissed" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /relink — re-attempt trip/move linkage for rides where ref was not found
// Runs against rides with link_status = 'exception' and reason = 'trip_move_reference_not_found'
// ---------------------------------------------------------------------------
router.post("/relink", isAuthenticated, async (req: any, res) => {
  const userId = getUserId(req);
  try {
    // Find all rides that need relinking
    const candidates = await db
      .select({
        id: rideshareRides.id,
        externalTripMoveRefNormalized: rideshareRides.externalTripMoveRefNormalized,
        batchId: rideshareRides.batchId,
      })
      .from(rideshareRides)
      .where(
        and(
          eq(rideshareRides.linkStatus, "exception"),
          eq(rideshareRides.linkExceptionReason, "trip_move_reference_not_found"),
          eq(rideshareRides.isDeleted, false),
        ),
      );

    if (candidates.length === 0) {
      return res.json({ message: "No rides require relinking", relinkedCount: 0, stillExceptionCount: 0 });
    }

    let relinkedCount = 0;
    let stillExceptionCount = 0;

    for (const candidate of candidates) {
      const ref = candidate.externalTripMoveRefNormalized;
      if (!ref || ref.length !== 8) { stillExceptionCount++; continue; }

      let newLinkStatus: string = "exception";
      let newTripMoveRefType: string = "move_id";
      let newLinkedMoveId: string | null = null;
      let newLinkedTripId: string | null = null;
      let newLinkExceptionReason: string | null = "trip_move_reference_not_found";

      try {
        const [tripMatch] = await db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.moveNumber, ref))
          .limit(1);
        if (tripMatch) {
          newTripMoveRefType = "trip_id";
          newLinkStatus = "linked";
          newLinkedTripId = tripMatch.id;
          newLinkExceptionReason = null;
        } else {
          const [moveMatch] = await db
            .select({ id: moves.id })
            .from(moves)
            .where(sql`LEFT(${moves.id}::text, 8) = ${ref}`)
            .limit(1);
          if (moveMatch) {
            newTripMoveRefType = "move_id";
            newLinkStatus = "linked";
            newLinkedMoveId = moveMatch.id;
            newLinkExceptionReason = null;
          }
        }
      } catch { /* non-fatal */ }

      await db.update(rideshareRides).set({
        tripMoveRefType: newTripMoveRefType,
        linkStatus: newLinkStatus,
        linkedMoveId: newLinkedMoveId || undefined,
        linkedTripId: newLinkedTripId || undefined,
        linkExceptionReason: newLinkExceptionReason || undefined,
      }).where(eq(rideshareRides.id, candidate.id));

      if (newLinkStatus === "linked") {
        relinkedCount++;
        // Resolve any exception entries for this ride (link-related ones)
        await db.update(rideshareExceptions).set({
          resolution: "matched",
          resolvedByUserId: userId || undefined,
          resolvedAt: new Date(),
          notes: `Auto-relinked to ${newLinkedTripId ? "trip" : "move"} via rematch process`,
        }).where(
          and(
            eq(rideshareExceptions.rideId, candidate.id),
            eq(rideshareExceptions.resolution, "pending"),
          ),
        );
      } else {
        stillExceptionCount++;
      }
    }

    await writeSystemAuditEvent({
      eventType: "rideshare_relink_run",
      actorUserId: userId,
      actorUserEmail: null,
      targetEntityType: "rideshare_rides",
      targetEntityId: "bulk",
      targetEntityLabel: `Relink run: ${relinkedCount} linked, ${stillExceptionCount} still unresolved`,
      reason: "Manual relink triggered via Rideshare Reconciliation UI",
      previousValue: { candidateCount: candidates.length },
      newValue: { relinkedCount, stillExceptionCount },
      metadata: {},
    });

    return res.json({
      message: `Relink complete: ${relinkedCount} ride${relinkedCount !== 1 ? "s" : ""} linked, ${stillExceptionCount} still unresolved`,
      relinkedCount,
      stillExceptionCount,
      totalProcessed: candidates.length,
    });
  } catch (err: any) {
    console.error("[Relink] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /employee-expenses — canonical employee expense aggregates
// CANONICAL: reads from rideshare_transactions (is_archived = false)
// Employee expenses are rows where exception_reason ILIKE '%employee%expense%'
// ---------------------------------------------------------------------------
router.get("/employee-expenses", isAuthenticated, async (req: any, res) => {
  try {
    const { dateFrom, dateTo, batchId, importBatchId } = req.query as Record<string, string>;
    const filters: Pick<CanonicalFilters, "dateFrom" | "dateTo" | "importBatchId"> = {};
    if (dateFrom)    filters.dateFrom    = dateFrom;
    if (dateTo)      filters.dateTo      = dateTo;
    // Accept both 'batchId' (legacy) and 'importBatchId' (new) param names
    if (importBatchId) filters.importBatchId = importBatchId;
    else if (batchId)  filters.importBatchId = batchId;

    const result = await getEmployeeExpenses(filters);
    return res.json(result);
  } catch (err: any) {
    console.error("[EmployeeExpenses] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /canonical/widget-summary — authoritative KPI aggregates
// Source of truth: rideshare_transactions WHERE is_archived = false
// All KPI widgets MUST use this endpoint — never aggregate from paginated rows.
//
// Query params (all optional):
//   provider       uber | lyft
//   dateFrom       YYYY-MM-DD
//   dateTo         YYYY-MM-DD
//   accountId      customers.id
//   billingStatus  unreviewed | ready_for_billing | billed | excluded
//   linkStatus     linked | exception | employee_expense | unmatched
//   importBatchId  rideshare_import_batches.id
// ---------------------------------------------------------------------------
router.get("/canonical/widget-summary", isAuthenticated, async (req: any, res) => {
  try {
    const {
      provider, dateFrom, dateTo, accountId,
      billingStatus, linkStatus, importBatchId,
    } = req.query as Record<string, string>;

    const filters: CanonicalFilters = {};
    if (provider)       filters.provider       = provider;
    if (dateFrom)       filters.dateFrom       = dateFrom;
    if (dateTo)         filters.dateTo         = dateTo;
    if (accountId)      filters.accountId      = accountId;
    if (billingStatus)  filters.billingStatus  = billingStatus;
    if (linkStatus)     filters.linkStatus     = linkStatus;
    if (importBatchId)  filters.importBatchId  = importBatchId;

    const summary = await getWidgetSummary(filters);
    return res.json(summary);
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /canonical/widget-summary:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /canonical/batch-summary/:batchId — per-batch canonical stats
// Returns source row count, active rows, rejected rows, duplicate skipped,
// total active fare, and batch deletion state.
// ---------------------------------------------------------------------------
router.get("/canonical/batch-summary/:batchId", isAuthenticated, async (req: any, res) => {
  try {
    const { batchId } = req.params;
    const summary = await getBatchSummary(batchId);
    if (!summary) return res.status(404).json({ message: "Batch not found" });
    return res.json(summary);
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /canonical/batch-summary:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /canonical/reconciliation/:importBatchId
// Returns the stored reconciliation summary for an import batch.
// If not yet computed, computes it on-demand and returns it.
// ---------------------------------------------------------------------------
router.get("/canonical/reconciliation/:importBatchId", isAuthenticated, async (req: any, res) => {
  try {
    const { importBatchId } = req.params;
    // Return stored result if available; otherwise compute on-demand
    let result = await getStoredReconciliation(importBatchId);
    if (!result) {
      result = await computeAndStoreReconciliation(importBatchId);
    }
    return res.json(result);
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /canonical/reconciliation:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /canonical/reconciliation/:importBatchId/recompute
// Forces a fresh reconciliation computation regardless of stored state.
// Use when data has been manually adjusted or reprocessed.
// ---------------------------------------------------------------------------
router.post("/canonical/reconciliation/:importBatchId/recompute", isAuthenticated, async (req: any, res) => {
  try {
    const { importBatchId } = req.params;
    const result = await computeAndStoreReconciliation(importBatchId);
    return res.json(result);
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /canonical/reconciliation/recompute:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /canonical/reconciliation-list — reconciliation status for all batches
// Returns an array of reconciliation records keyed by importBatchId.
// ---------------------------------------------------------------------------
router.get("/canonical/reconciliation-list", isAuthenticated, async (_req: any, res) => {
  try {
    const rows = await db
      .select({
        importBatchId:        rideshareBatchReconciliation.importBatchId,
        reconciliationStatus: rideshareBatchReconciliation.reconciliationStatus,
        rowBalanced:          rideshareBatchReconciliation.rowBalanced,
        amountBalanced:       rideshareBatchReconciliation.amountBalanced,
        totalRowsInFile:      rideshareBatchReconciliation.totalRowsInFile,
        importedRows:         rideshareBatchReconciliation.importedRows,
        rejectedRows:         rideshareBatchReconciliation.rejectedRows,
        duplicateRows:        rideshareBatchReconciliation.duplicateRows,
        fileTotalAmount:      rideshareBatchReconciliation.fileTotalAmount,
        importedTotalAmount:  rideshareBatchReconciliation.importedTotalAmount,
        computedAt:           rideshareBatchReconciliation.computedAt,
      })
      .from(rideshareBatchReconciliation)
      .orderBy(rideshareBatchReconciliation.computedAt);
    return res.json(rows);
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /canonical/reconciliation-list:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /summary — aggregate stats (CANONICAL: now reads from rideshare_transactions)
// ---------------------------------------------------------------------------
router.get("/summary", isAuthenticated, async (_req, res) => {
  try {
    // Canonical source: rideshare_transactions (is_archived = false)
    const widget = await getWidgetSummary();

    // Batch count still from rideshare_import_batches (the new import system)
    const [batchStats] = await db.select({
      totalBatches: count(),
    }).from(rideshareImportBatches);

    return res.json({
      batches: { totalBatches: batchStats?.totalBatches ?? 0 },
      rides: {
        totalRides:    widget.totalRides,
        totalRevenue:  widget.totalSpend,
        matchedRides:  widget.totalLinked,
        unmatchedRides: widget.totalUnmatched,
        uberRides:     widget.uberRides,
        lyftRides:     widget.lyftRides,
      },
      exceptions: {
        pendingExceptions:  widget.totalExceptions,
        resolvedExceptions: widget.totalLinked,
      },
      // Full canonical widget summary also included for new consumers
      canonical: widget,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /transactions/exceptions — list exception/unmatched transactions
// ---------------------------------------------------------------------------
// Query params:
//   provider    uber | lyft
//   dateFrom    YYYY-MM-DD
//   dateTo      YYYY-MM-DD
//   status      open (default) | needs_followup | excluded | resolved | all
//   limit       default 50
//   offset      default 0
router.get("/transactions/exceptions", isAuthenticated, async (req: any, res) => {
  try {
    const {
      provider,
      dateFrom,
      dateTo,
      status = "open",
      limit: rawLimit = "50",
      offset: rawOffset = "0",
    } = req.query as Record<string, string>;

    const limitN  = Math.min(parseInt(rawLimit)  || 50,  200);
    const offsetN = Math.max(parseInt(rawOffset) || 0,   0);

    const conditions: any[] = [];

    // Status filter
    if (status === "open") {
      conditions.push(
        and(
          inArray(rideshareTransactions.matchStatus, ["exception", "unmatched"]),
          sql`${rideshareTransactions.billingStatus} NOT IN ('excluded', 'needs_followup')`
        )
      );
    } else if (status === "needs_followup") {
      conditions.push(eq(rideshareTransactions.billingStatus, "needs_followup"));
    } else if (status === "excluded") {
      conditions.push(eq(rideshareTransactions.billingStatus, "excluded"));
    } else if (status === "resolved") {
      conditions.push(eq(rideshareTransactions.matchStatus, "manual_matched"));
    }
    // 'all' — no match_status filter; still excludes auto_matched to keep this list actionable
    if (status === "all") {
      conditions.push(
        inArray(rideshareTransactions.matchStatus, ["exception", "unmatched", "manual_matched"])
      );
    }

    if (provider) conditions.push(eq(rideshareTransactions.provider, provider));
    if (dateFrom) conditions.push(gte(rideshareTransactions.rideDate, dateFrom));
    if (dateTo)   conditions.push(lte(rideshareTransactions.rideDate, dateTo));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: rideshareTransactions.id,
          importBatchId: rideshareTransactions.importBatchId,
          batchFileName: rideshareImportBatches.sourceFileName,
          provider: rideshareTransactions.provider,
          rideDate: rideshareTransactions.rideDate,
          rideDatetime: rideshareTransactions.rideDatetime,
          riderName: rideshareTransactions.riderName,
          pickupAddressRaw: rideshareTransactions.pickupAddressRaw,
          dropoffAddressRaw: rideshareTransactions.dropoffAddressRaw,
          totalFare: rideshareTransactions.totalFare,
          pickupAccountId: rideshareTransactions.pickupAccountId,
          pickupAccountNumber: rideshareTransactions.pickupAccountNumber,
          dropoffAccountId: rideshareTransactions.dropoffAccountId,
          dropoffAccountNumber: rideshareTransactions.dropoffAccountNumber,
          matchedAccountId: rideshareTransactions.matchedAccountId,
          matchedAccountNumber: rideshareTransactions.matchedAccountNumber,
          matchStatus: rideshareTransactions.matchStatus,
          matchMethod: rideshareTransactions.matchMethod,
          matchConfidence: rideshareTransactions.matchConfidence,
          exceptionReason: rideshareTransactions.exceptionReason,
          billingStatus: rideshareTransactions.billingStatus,
          reviewedByUserId: rideshareTransactions.reviewedByUserId,
          reviewedAt: rideshareTransactions.reviewedAt,
          createdAt: rideshareTransactions.createdAt,
        })
        .from(rideshareTransactions)
        .leftJoin(rideshareImportBatches, eq(rideshareTransactions.importBatchId, rideshareImportBatches.id))
        .where(whereClause)
        .orderBy(desc(rideshareTransactions.rideDate), desc(rideshareTransactions.createdAt))
        .limit(limitN)
        .offset(offsetN),
      db
        .select({ total: count() })
        .from(rideshareTransactions)
        .where(whereClause),
    ]);

    // Enrich with matched account company names
    const acctIds = [
      ...rows.map(r => r.matchedAccountId),
      ...rows.map(r => r.pickupAccountId),
      ...rows.map(r => r.dropoffAccountId),
    ].filter(Boolean) as string[];

    let accountNames: Record<string, string> = {};
    if (acctIds.length > 0) {
      const uniqueIds = [...new Set(acctIds)];
      const accts = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(inArray(customers.id, uniqueIds));
      accts.forEach(a => { if (a.companyName) accountNames[a.id] = a.companyName; });
    }

    const enriched = rows.map(r => ({
      ...r,
      matchedAccountName:  r.matchedAccountId  ? accountNames[r.matchedAccountId]  || null : null,
      pickupAccountName:   r.pickupAccountId   ? accountNames[r.pickupAccountId]   || null : null,
      dropoffAccountName:  r.dropoffAccountId  ? accountNames[r.dropoffAccountId]  || null : null,
    }));

    return res.json({ exceptions: enriched, total: countRows[0]?.total || 0 });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /transactions/exceptions:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /transactions/:id/assign-account — manually match to an account
// ---------------------------------------------------------------------------
router.post("/transactions/:id/assign-account", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { accountId, notes } = req.body as { accountId?: string; notes?: string };

    if (!accountId) return res.status(400).json({ message: "accountId is required" });

    const [cust] = await db
      .select({ id: customers.id, customerNumber: customers.customerNumber, companyName: customers.companyName })
      .from(customers)
      .where(eq(customers.id, accountId))
      .limit(1);
    if (!cust) return res.status(404).json({ message: "Account not found" });

    const [tx] = await db
      .select({ id: rideshareTransactions.id })
      .from(rideshareTransactions)
      .where(eq(rideshareTransactions.id, id))
      .limit(1);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    await db.update(rideshareTransactions).set({
      matchedAccountId:     cust.id,
      matchedAccountNumber: cust.customerNumber,
      matchStatus:          "manual_matched",
      matchMethod:          "manual",
      reviewedByUserId:     userId,
      reviewedAt:           new Date(),
      exceptionReason:      null,                  // cleared on resolution
      billingStatus:        "ready_for_billing",
      updatedAt:            new Date(),
    }).where(eq(rideshareTransactions.id, id));

    return res.json({
      message: `Account assigned: ${cust.companyName || cust.customerNumber}`,
      accountId: cust.id,
      accountNumber: cust.customerNumber,
      companyName: cust.companyName,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /transactions/:id/assign-account:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /transactions/:id/exclude — exclude from billing
// ---------------------------------------------------------------------------
router.post("/transactions/:id/exclude", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { notes } = req.body as { notes?: string };

    const [tx] = await db
      .select({ id: rideshareTransactions.id })
      .from(rideshareTransactions)
      .where(eq(rideshareTransactions.id, id))
      .limit(1);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    await db.update(rideshareTransactions).set({
      billingStatus:    "excluded",
      reviewedByUserId: userId,
      reviewedAt:       new Date(),
      exceptionReason:  notes ? `Excluded: ${notes}` : "Excluded from billing by reviewer",
      updatedAt:        new Date(),
    }).where(eq(rideshareTransactions.id, id));

    return res.json({ message: "Transaction excluded from billing" });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /transactions/:id/exclude:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /transactions/:id/flag-followup — mark needs follow-up
// ---------------------------------------------------------------------------
router.post("/transactions/:id/flag-followup", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { notes } = req.body as { notes?: string };

    const [tx] = await db
      .select({ id: rideshareTransactions.id })
      .from(rideshareTransactions)
      .where(eq(rideshareTransactions.id, id))
      .limit(1);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    await db.update(rideshareTransactions).set({
      billingStatus:    "needs_followup",
      reviewedByUserId: userId,
      reviewedAt:       new Date(),
      exceptionReason:  notes ? `Needs follow-up: ${notes}` : "Flagged for follow-up by reviewer",
      updatedAt:        new Date(),
    }).where(eq(rideshareTransactions.id, id));

    return res.json({ message: "Transaction flagged for follow-up" });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /transactions/:id/flag-followup:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /transactions/report — full report query with summary metrics
// CANONICAL: always filters is_archived = false
// ---------------------------------------------------------------------------
// Query params: dateFrom, dateTo, provider, matchStatus, billingStatus,
//   accountNumber, importBatchId, limit (max 500), offset
router.get("/transactions/report", isAuthenticated, async (req: any, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      provider,
      matchStatus,
      billingStatus,
      accountNumber,
      importBatchId,
      limit: rawLimit = "100",
      offset: rawOffset = "0",
    } = req.query as Record<string, string>;

    const limitN  = Math.min(parseInt(rawLimit)  || 100, 500);
    const offsetN = Math.max(parseInt(rawOffset) || 0,   0);

    // Canonical baseline: is_archived = false (MUST always be present)
    const conditions: any[] = [eq(rideshareTransactions.isArchived, false)];
    if (dateFrom)      conditions.push(gte(rideshareTransactions.rideDate, dateFrom));
    if (dateTo)        conditions.push(lte(rideshareTransactions.rideDate, dateTo));
    if (provider)      conditions.push(eq(rideshareTransactions.provider, provider));
    if (matchStatus)   conditions.push(eq(rideshareTransactions.matchStatus, matchStatus));
    if (billingStatus) conditions.push(eq(rideshareTransactions.billingStatus, billingStatus));
    if (accountNumber) conditions.push(eq(rideshareTransactions.matchedAccountNumber, accountNumber));
    if (importBatchId) conditions.push(eq(rideshareTransactions.importBatchId, importBatchId));

    const where = and(...conditions);

    const [rows, countRow, summaryRow] = await Promise.all([
      db.select({
        id:                   rideshareTransactions.id,
        provider:             rideshareTransactions.provider,
        rideDate:             rideshareTransactions.rideDate,
        rideDatetime:         rideshareTransactions.rideDatetime,
        riderName:            rideshareTransactions.riderName,
        pickupAddressRaw:     rideshareTransactions.pickupAddressRaw,
        dropoffAddressRaw:    rideshareTransactions.dropoffAddressRaw,
        matchedAccountId:     rideshareTransactions.matchedAccountId,
        matchedAccountNumber: rideshareTransactions.matchedAccountNumber,
        totalFare:            rideshareTransactions.totalFare,
        matchStatus:          rideshareTransactions.matchStatus,
        matchMethod:          rideshareTransactions.matchMethod,
        matchConfidence:      rideshareTransactions.matchConfidence,
        billingStatus:        rideshareTransactions.billingStatus,
        exceptionReason:      rideshareTransactions.exceptionReason,
        importBatchId:        rideshareTransactions.importBatchId,
        batchFileName:        rideshareImportBatches.sourceFileName,
      })
        .from(rideshareTransactions)
        .leftJoin(rideshareImportBatches, eq(rideshareTransactions.importBatchId, rideshareImportBatches.id))
        .where(where)
        .orderBy(desc(rideshareTransactions.rideDate), desc(rideshareTransactions.rideDatetime))
        .limit(limitN)
        .offset(offsetN),

      db.select({ total: count() }).from(rideshareTransactions).where(where),

      db.select({
        totalRides:    count(),
        totalSpend:    sum(rideshareTransactions.totalFare),
        matchedRides:  sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.matchStatus} IN ('auto_matched','manual_matched'))`,
        exceptionRides: sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.matchStatus} IN ('exception','unmatched'))`,
        billedRides:   sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.billingStatus} IN ('ready_for_billing','billed'))`,
        avgFare:       sql<string>`AVG(${rideshareTransactions.totalFare})::text`,
        uberSpend:     sql<string>`COALESCE(SUM(${rideshareTransactions.totalFare}) FILTER (WHERE ${rideshareTransactions.provider}='uber'),0)::text`,
        lyftSpend:     sql<string>`COALESCE(SUM(${rideshareTransactions.totalFare}) FILTER (WHERE ${rideshareTransactions.provider}='lyft'),0)::text`,
        uberRides:     sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.provider}='uber')`,
        lyftRides:     sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.provider}='lyft')`,
      }).from(rideshareTransactions).where(where),
    ]);

    // Enrich with account names
    const acctIds = rows.map(r => r.matchedAccountId).filter(Boolean) as string[];
    let acctNames: Record<string, string> = {};
    if (acctIds.length > 0) {
      const unique = [...new Set(acctIds)];
      const accts = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(inArray(customers.id, unique));
      accts.forEach(a => { if (a.companyName) acctNames[a.id] = a.companyName; });
    }

    const s = summaryRow[0];
    const totalRides    = Number(s?.totalRides    || 0);
    const matchedRides  = Number(s?.matchedRides  || 0);
    const exceptionRides = Number(s?.exceptionRides || 0);
    const billedRides   = Number(s?.billedRides   || 0);
    const totalSpendNum = parseFloat(s?.totalSpend || "0");
    const uberSpendNum  = parseFloat(s?.uberSpend  || "0");
    const lyftSpendNum  = parseFloat(s?.lyftSpend  || "0");

    return res.json({
      summary: {
        totalRides,
        totalSpend:    totalSpendNum.toFixed(2),
        matchedRides,
        exceptionRides,
        matchPct:      totalRides > 0 ? +(matchedRides  / totalRides * 100).toFixed(1) : 0,
        exceptionPct:  totalRides > 0 ? +(exceptionRides / totalRides * 100).toFixed(1) : 0,
        billedPct:     totalRides > 0 ? +(billedRides    / totalRides * 100).toFixed(1) : 0,
        avgFare:       s?.avgFare ? parseFloat(s.avgFare).toFixed(2) : null,
        uberSpend:     uberSpendNum.toFixed(2),
        lyftSpend:     lyftSpendNum.toFixed(2),
        uberRides:     Number(s?.uberRides || 0),
        lyftRides:     Number(s?.lyftRides || 0),
      },
      transactions: rows.map(r => ({
        ...r,
        matchedAccountName: r.matchedAccountId ? acctNames[r.matchedAccountId] || null : null,
      })),
      total: Number(countRow[0]?.total || 0),
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /transactions/report:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /transactions/import-batches-list — list import batches for filter UI
// ---------------------------------------------------------------------------
router.get("/transactions/import-batches-list", isAuthenticated, async (_req, res) => {
  try {
    const batches = await db.select({
      id:           rideshareImportBatches.id,
      provider:     rideshareImportBatches.provider,
      sourceFileName: rideshareImportBatches.sourceFileName,
      uploadedAt:   rideshareImportBatches.uploadedAt,
      totalRows:    rideshareImportBatches.totalRows,
      matchedRows:  rideshareImportBatches.matchedRows,
      exceptionRows: rideshareImportBatches.exceptionRows,
    })
      .from(rideshareImportBatches)
      .orderBy(desc(rideshareImportBatches.uploadedAt))
      .limit(100);
    return res.json(batches);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /transactions/:id/detail — full drilldown: tx + raw JSON + batch meta
// ---------------------------------------------------------------------------
router.get("/transactions/:id/detail", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;

    const [tx] = await db.select().from(rideshareTransactions)
      .where(eq(rideshareTransactions.id, id)).limit(1);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    const [rawRow, batch, matchedAccount] = await Promise.all([
      tx.rawRowId
        ? db.select().from(rideshareImportRawRows)
            .where(eq(rideshareImportRawRows.id, tx.rawRowId)).limit(1)
            .then(r => r[0] || null)
        : Promise.resolve(null),
      tx.importBatchId
        ? db.select().from(rideshareImportBatches)
            .where(eq(rideshareImportBatches.id, tx.importBatchId)).limit(1)
            .then(r => r[0] || null)
        : Promise.resolve(null),
      tx.matchedAccountId
        ? db.select({
            id: customers.id,
            customerNumber: customers.customerNumber,
            companyName: customers.companyName,
            customerAddress: customers.customerAddress,
            customerCity: customers.customerCity,
          }).from(customers)
            .where(eq(customers.id, tx.matchedAccountId)).limit(1)
            .then(r => r[0] || null)
        : Promise.resolve(null),
    ]);

    return res.json({ transaction: tx, rawRow, batch, matchedAccount });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /transactions/:id/detail:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /accounts-search — search accounts for manual matching UI
// ---------------------------------------------------------------------------
router.get("/accounts-search", isAuthenticated, async (req: any, res) => {
  try {
    const { q = "" } = req.query as { q: string };
    const results = await db.select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      companyName: customers.companyName,
      customerAddress: customers.customerAddress,
      customerCity: customers.customerCity,
    }).from(customers)
      .where(or(
        ilike(customers.companyName, `%${q}%`),
        ilike(customers.customerNumber, `%${q}%`),
        ilike(customers.customerAddress, `%${q}%`),
      ))
      .limit(20);
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Billing helper: log an audit entry
// ---------------------------------------------------------------------------
async function logBillingAudit(opts: {
  rideshareTransactionId: string;
  actionType: string;
  priorBillingStatus: string | null;
  newBillingStatus: string;
  actedByUserId: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  invoiceNumberSnapshot?: string | null;
  batchRef?: string | null;
  billableAmount?: string | null;
  billToAccountId?: string | null;
  billToAccountNumber?: string | null;
}) {
  await db.insert(rideshareBillingAudit).values({
    rideshareTransactionId:  opts.rideshareTransactionId,
    actionType:              opts.actionType,
    priorBillingStatus:      opts.priorBillingStatus,
    newBillingStatus:        opts.newBillingStatus,
    actedByUserId:           opts.actedByUserId,
    notes:                   opts.notes ?? null,
    invoiceId:               opts.invoiceId ?? null,
    invoiceNumberSnapshot:   opts.invoiceNumberSnapshot ?? null,
    batchRef:                opts.batchRef ?? null,
    billableAmount:          opts.billableAmount ?? null,
    billToAccountId:         opts.billToAccountId ?? null,
    billToAccountNumber:     opts.billToAccountNumber ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST /transactions/:id/mark-ready — mark single transaction ready for billing
// ---------------------------------------------------------------------------
router.post("/transactions/:id/mark-ready", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { notes } = req.body as { notes?: string };

    const [tx] = await db.select().from(rideshareTransactions).where(eq(rideshareTransactions.id, id)).limit(1);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    // Eligibility check
    const eligible = ["auto_matched", "manual_matched", "matched"].includes(tx.matchStatus)
      && tx.matchedAccountId
      && tx.billingStatus !== "billed"
      && tx.billingStatus !== "excluded";
    if (!eligible) {
      return res.status(422).json({ message: "Transaction is not eligible for billing (must be matched, not billed or excluded)" });
    }

    const now = new Date();
    const priorStatus = tx.billingStatus;
    await db.update(rideshareTransactions).set({
      billingStatus:         "ready_for_billing",
      billingReadyAt:        now,
      billingReadyByUserId:  userId,
      billToAccountId:       tx.matchedAccountId,
      billToAccountNumber:   tx.matchedAccountNumber,
      billableAmount:        tx.totalFare ?? tx.billableAmount,
      billingNotes:          notes ?? tx.billingNotes,
      updatedAt:             now,
    }).where(eq(rideshareTransactions.id, id));

    await logBillingAudit({
      rideshareTransactionId: id,
      actionType: "marked_ready",
      priorBillingStatus: priorStatus,
      newBillingStatus: "ready_for_billing",
      actedByUserId: userId,
      notes: notes ?? null,
      billableAmount: tx.totalFare ?? null,
      billToAccountId: tx.matchedAccountId,
      billToAccountNumber: tx.matchedAccountNumber,
    });

    return res.json({ success: true, billingStatus: "ready_for_billing" });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /transactions/:id/mark-ready:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /billing/check-eligibility — pre-flight eligibility check
// Accepts { ids: string[] }, returns eligible / ineligible breakdown with reasons
// ---------------------------------------------------------------------------
router.post("/billing/check-eligibility", isAuthenticated, async (req: any, res) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) return res.status(400).json({ message: "ids required" });

    const txns = await db.select().from(rideshareTransactions)
      .where(inArray(rideshareTransactions.id, ids));

    const eligible: { id: string; matchedAccountNumber: string | null; totalFare: string | null; rideDate: string | null }[] = [];
    const ineligible: { id: string; rideDate: string | null; reason: string; matchedAccountNumber: string | null }[] = [];

    for (const tx of txns) {
      const reasons: string[] = [];
      if (!["auto_matched", "manual_matched", "matched"].includes(tx.matchStatus)) {
        reasons.push("Not matched to an account");
      }
      if (!tx.matchedAccountId) {
        reasons.push("No account assigned");
      }
      if (tx.billingStatus === "billed") {
        reasons.push("Already billed");
      }
      if (tx.billingStatus === "excluded") {
        reasons.push("Currently excluded (reopen first)");
      }
      if (tx.isArchived) {
        reasons.push("Record is archived");
      }

      if (reasons.length > 0) {
        ineligible.push({ id: tx.id, rideDate: tx.rideDate, reason: reasons.join("; "), matchedAccountNumber: tx.matchedAccountNumber });
      } else {
        eligible.push({ id: tx.id, matchedAccountNumber: tx.matchedAccountNumber, totalFare: tx.totalFare, rideDate: tx.rideDate });
      }
    }

    return res.json({ eligible, ineligible, eligibleCount: eligible.length, ineligibleCount: ineligible.length });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /billing/check-eligibility:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /billing/bulk-mark-ready — mark multiple transactions ready for billing
// ---------------------------------------------------------------------------
router.post("/billing/bulk-mark-ready", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { ids, notes } = req.body as { ids: string[]; notes?: string };
    if (!ids?.length) return res.status(400).json({ message: "ids required" });

    const txns = await db.select().from(rideshareTransactions)
      .where(inArray(rideshareTransactions.id, ids));

    const eligible = txns.filter(tx =>
      ["auto_matched", "manual_matched", "matched"].includes(tx.matchStatus)
      && tx.matchedAccountId
      && tx.billingStatus !== "billed"
      && tx.billingStatus !== "excluded"
    );

    if (!eligible.length) {
      return res.status(422).json({ message: "No eligible transactions found. Matched records that are not billed or excluded can be marked ready." });
    }

    const now = new Date();
    await db.update(rideshareTransactions).set({
      billingStatus:         "ready_for_billing",
      billingReadyAt:        now,
      billingReadyByUserId:  userId,
      updatedAt:             now,
    }).where(inArray(rideshareTransactions.id, eligible.map(t => t.id)));

    // Set bill_to and billable_amount individually (respects per-tx account)
    for (const tx of eligible) {
      await db.update(rideshareTransactions).set({
        billToAccountId:    tx.matchedAccountId,
        billToAccountNumber: tx.matchedAccountNumber,
        billableAmount:     tx.totalFare ?? tx.billableAmount,
        billingNotes:       notes ?? null,
      }).where(eq(rideshareTransactions.id, tx.id));

      await logBillingAudit({
        rideshareTransactionId: tx.id,
        actionType: "marked_ready",
        priorBillingStatus: tx.billingStatus,
        newBillingStatus: "ready_for_billing",
        actedByUserId: userId,
        notes: notes ?? null,
        billableAmount: tx.totalFare ?? null,
        billToAccountId: tx.matchedAccountId,
        billToAccountNumber: tx.matchedAccountNumber,
      });
    }

    return res.json({
      success: true,
      markedCount: eligible.length,
      skippedCount: ids.length - eligible.length,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /billing/bulk-mark-ready:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /billing/bulk-exclude — exclude multiple transactions from billing
// ---------------------------------------------------------------------------
router.post("/billing/bulk-exclude", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { ids, notes } = req.body as { ids: string[]; notes?: string };
    if (!ids?.length) return res.status(400).json({ message: "ids required" });

    const txns = await db.select().from(rideshareTransactions)
      .where(inArray(rideshareTransactions.id, ids));

    // Cannot exclude already-billed records without special permission; skip them
    const eligible = txns.filter(tx => tx.billingStatus !== "billed");
    if (!eligible.length) {
      return res.status(422).json({ message: "All selected records are already billed and cannot be excluded." });
    }

    const now = new Date();
    await db.update(rideshareTransactions).set({
      billingStatus: "excluded",
      billingNotes:  notes ?? null,
      updatedAt:     now,
    }).where(inArray(rideshareTransactions.id, eligible.map(t => t.id)));

    for (const tx of eligible) {
      await logBillingAudit({
        rideshareTransactionId: tx.id,
        actionType: "marked_excluded",
        priorBillingStatus: tx.billingStatus,
        newBillingStatus: "excluded",
        actedByUserId: userId,
        notes: notes ?? null,
      });
    }

    return res.json({ success: true, excludedCount: eligible.length, skippedCount: ids.length - eligible.length });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /billing/bulk-exclude:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /billing/mark-all-filtered-ready — mark ALL records matching filters
// Only marks unreviewed + matched records; skips already-billed/excluded
// ---------------------------------------------------------------------------
router.post("/billing/mark-all-filtered-ready", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { dateFrom, dateTo, provider, importBatchId, accountNumber, notes } = req.body as {
      dateFrom?: string;
      dateTo?: string;
      provider?: string;
      importBatchId?: string;
      accountNumber?: string;
      notes?: string;
    };

    const conditions: any[] = [
      eq(rideshareTransactions.isArchived, false),
      inArray(rideshareTransactions.matchStatus, ["auto_matched", "manual_matched", "matched"]),
      isNotNull(rideshareTransactions.matchedAccountId),
      eq(rideshareTransactions.billingStatus, "unreviewed"),
    ];

    if (dateFrom)      conditions.push(gte(rideshareTransactions.rideDate, dateFrom));
    if (dateTo)        conditions.push(lte(rideshareTransactions.rideDate, dateTo));
    if (provider && provider !== "__all__")         conditions.push(eq(rideshareTransactions.provider, provider));
    if (importBatchId && importBatchId !== "__all__") conditions.push(eq(rideshareTransactions.importBatchId, importBatchId));
    if (accountNumber) conditions.push(eq(rideshareTransactions.matchedAccountNumber, accountNumber));

    const where = and(...conditions);
    const eligible = await db.select().from(rideshareTransactions).where(where);

    if (!eligible.length) {
      return res.json({ success: true, markedCount: 0, message: "No eligible unreviewed matched records found for the current filters." });
    }

    const now = new Date();
    await db.update(rideshareTransactions).set({
      billingStatus:        "ready_for_billing",
      billingReadyAt:       now,
      billingReadyByUserId: userId,
      updatedAt:            now,
    }).where(where);

    for (const tx of eligible) {
      await db.update(rideshareTransactions).set({
        billToAccountId:     tx.matchedAccountId,
        billToAccountNumber: tx.matchedAccountNumber,
        billableAmount:      tx.totalFare ?? tx.billableAmount,
        billingNotes:        notes ?? null,
      }).where(eq(rideshareTransactions.id, tx.id));

      await logBillingAudit({
        rideshareTransactionId: tx.id,
        actionType:             "marked_ready",
        priorBillingStatus:     tx.billingStatus,
        newBillingStatus:       "ready_for_billing",
        actedByUserId:          userId,
        notes:                  notes ?? null,
        billableAmount:         tx.totalFare ?? null,
        billToAccountId:        tx.matchedAccountId,
        billToAccountNumber:    tx.matchedAccountNumber,
      });
    }

    return res.json({ success: true, markedCount: eligible.length });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /billing/mark-all-filtered-ready:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Billing aggregation helpers
// ---------------------------------------------------------------------------

// ── Billing period helpers ────────────────────────────────────────────────────
// All billing periods are Monday 00:00:00 → Sunday 23:59:59 **local time**.
// We never use UTC dates for billing period grouping.

/**
 * Return YYYY-MM-DD for Monday of the week containing `localDateStr` (YYYY-MM-DD, local).
 * Input must already be a local date string — no UTC conversion applied.
 */
function getWeekStart(localDateStr: string): string {
  // Parse as UTC-midnight to avoid any system-local-offset shift during Date arithmetic.
  const d = new Date(localDateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;  // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Return YYYY-MM-DD for Sunday of the week containing `localDateStr`. */
function getWeekEnd(localDateStr: string): string {
  const start = getWeekStart(localDateStr);
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Format YYYY-MM-DD as MM/DD/YYYY for invoice descriptions and labels. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/**
 * Build the canonical billing week label: "MM/DD/YYYY – MM/DD/YYYY".
 * This is the exact format stored in billing_week_label and used in invoice descriptions.
 */
function makeBillingWeekLabel(weekStart: string, weekEnd: string): string {
  return `${fmtDate(weekStart)} \u2013 ${fmtDate(weekEnd)}`;
}

/**
 * Apply a UTC offset string (e.g. "-06:00" or "+05:30") to a UTC Date
 * and return the resulting local YYYY-MM-DD date string.
 */
function applyTimezoneOffset(utcDate: Date, offsetStr: string): string {
  const sign = offsetStr.trimStart().startsWith("-") ? -1 : 1;
  const clean = offsetStr.replace(/^[+-]/, "").replace(":", "");
  const hours = parseInt(clean.slice(0, 2), 10);
  const mins  = parseInt(clean.slice(2, 4) || "0", 10);
  const offsetMs = sign * (hours * 60 + mins) * 60_000;
  const local = new Date(utcDate.getTime() + offsetMs);
  const y  = local.getUTCFullYear();
  const mo = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d  = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Extract YYYY-MM-DD from a `timestamp without time zone` value as returned by pg.
 * These fields store local wall-clock times — pg driver returns them as Date objects
 * with the time components intact.  We read UTC parts because the stored value
 * is passed through as-is (server is UTC so UTC parts = original local digits).
 */
function localTsToDate(ts: Date | string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return null;
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Get the best local date string for billing period calculation.
 *
 * Priority (per spec):
 *   1. dropoff_datetime_local  (stored in local tz, no tz suffix)
 *   2. request_datetime_local  (stored in local tz, no tz suffix)
 *   3. ride_datetime (UTC) + timezone_offset → converted to local date
 *   4. ride_date               (already a local date)
 *   5. Today (ultimate fallback — should not occur on clean data)
 */
function getLocalDateStr(tx: {
  dropoffDatetimeLocal?: Date | string | null;
  requestDatetimeLocal?: Date | string | null;
  rideDatetime?:         Date | string | null;
  timezoneOffset?:       string | null;
  rideDate?:             string | null;
}): string {
  // 1. dropoff local timestamp
  const d1 = localTsToDate(tx.dropoffDatetimeLocal as Date | null);
  if (d1) return d1;

  // 2. request local timestamp
  const d2 = localTsToDate(tx.requestDatetimeLocal as Date | null);
  if (d2) return d2;

  // 3. UTC ride_datetime + timezone offset
  if (tx.rideDatetime && tx.timezoneOffset) {
    const utcDate = new Date(tx.rideDatetime as string);
    if (!isNaN(utcDate.getTime())) {
      return applyTimezoneOffset(utcDate, tx.timezoneOffset);
    }
  }

  // 4. ride_date (already local, stored as YYYY-MM-DD)
  if (tx.rideDate) return tx.rideDate;

  // 5. Today as fallback
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute and return billing period info for a transaction using local time.
 */
function getBillingPeriod(tx: Parameters<typeof getLocalDateStr>[0]): {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
} {
  const localDate = getLocalDateStr(tx);
  const weekStart = getWeekStart(localDate);
  const weekEnd   = getWeekEnd(localDate);
  return { weekStart, weekEnd, weekLabel: makeBillingWeekLabel(weekStart, weekEnd) };
}

/**
 * Return YYYY-MM-DD for Monday of the current week (server-local date used
 * only for UI defaults — the server is UTC so we use UTC.getDay()).
 * This is only used for the UI "current week" default; billing itself always
 * derives from the ride's local datetime via getLocalDateStr().
 */
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function currentWeekEnd(): string {
  const start = currentWeekStart();
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// POST /billing/push-to-invoice — aggregate rides into weekly invoice line items
// ---------------------------------------------------------------------------
router.post("/billing/push-to-invoice", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const {
      ids,
      accountIds,      // optional: restrict to specific bill-to account IDs (for account-level deselection in modal)
      billingPeriodStart,
      billingPeriodEnd,
      notes,
    } = req.body as {
      ids?: string[];
      accountIds?: string[];
      billingPeriodStart?: string;
      billingPeriodEnd?: string;
      notes?: string;
    };

    // Build base conditions: ready_for_billing + matched account + not archived
    const baseConds: any[] = [
      eq(rideshareTransactions.billingStatus, "ready_for_billing"),
      isNotNull(rideshareTransactions.billToAccountId),
      eq(rideshareTransactions.isArchived, false),
    ];

    if (ids?.length) {
      baseConds.push(inArray(rideshareTransactions.id, ids));
    }
    // Account-level filter (user deselected some accounts in the preview modal)
    if (accountIds?.length) {
      baseConds.push(inArray(rideshareTransactions.billToAccountId, accountIds));
    }
    // Filter by billing period if specified.
    // We prefer filtering on the stored billing_period_start (populated by prior mark-ready logic)
    // but fall back to ride_date for backwards compatibility with older records.
    if (billingPeriodStart) {
      baseConds.push(
        sql`(COALESCE(${rideshareTransactions.billingPeriodStart}, ${rideshareTransactions.rideDate}) >= ${billingPeriodStart})`
      );
    }
    if (billingPeriodEnd) {
      baseConds.push(
        sql`(COALESCE(${rideshareTransactions.billingPeriodStart}, ${rideshareTransactions.rideDate}) <= ${billingPeriodEnd})`
      );
    }

    const eligible = await db.select().from(rideshareTransactions)
      .where(and(...baseConds));

    if (!eligible.length) {
      return res.status(422).json({ message: "No ready-for-billing transactions found in the selected period. Mark records ready before pushing." });
    }

    // Group by (billToAccountId, weekStart, weekEnd) using LOCAL ride datetime.
    // getBillingPeriod uses the best available local datetime field (see helper above).
    const groups: Record<string, { accountId: string; weekStart: string; weekEnd: string; weekLabel: string; txns: typeof eligible }> = {};
    for (const tx of eligible) {
      const { weekStart: ws, weekEnd: we, weekLabel } = getBillingPeriod(tx);
      const key = `${tx.billToAccountId!}::${ws}::${we}`;
      if (!groups[key]) groups[key] = { accountId: tx.billToAccountId!, weekStart: ws, weekEnd: we, weekLabel, txns: [] };
      groups[key].txns.push(tx);
    }

    // Group further by account (one invoice per account, multiple line items for multiple weeks)
    const byAccount: Record<string, { accountId: string; groups: (typeof groups)[string][] }> = {};
    for (const g of Object.values(groups)) {
      if (!byAccount[g.accountId]) byAccount[g.accountId] = { accountId: g.accountId, groups: [] };
      byAccount[g.accountId].groups.push(g);
    }

    const batchRef = `RS-AGG-${Date.now()}`;
    const results: {
      accountId: string; accountNumber: string | null; accountName: string;
      invoiceId: string; invoiceNumber: string; totalRides: number; totalAmount: string;
      periods: { weekStart: string; weekEnd: string; weekLabel: string; rides: number; amount: string }[];
    }[] = [];
    const failures: { accountId: string; error: string }[] = [];
    // Track groups skipped due to duplicate-billing prevention
    const skipped: { accountId: string; weekStart: string; weekEnd: string; reason: string; existingInvoiceId?: string | null }[] = [];

    const now = new Date();
    const invoiceDate = now.toISOString().split("T")[0];
    const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    for (const { accountId, groups: acctGroups } of Object.values(byAccount)) {
      try {
        // Look up customer
        const [customer] = await db.select({
          id: customers.id,
          customerNumber: customers.customerNumber,
          companyName: customers.companyName,
        }).from(customers).where(eq(customers.id, accountId)).limit(1);

        const customerName = customer?.companyName ?? acctGroups[0].txns[0].billToAccountNumber ?? accountId;
        const accountNumber = customer?.customerNumber ?? acctGroups[0].txns[0].billToAccountNumber ?? null;

        // ── DUPLICATE BILLING PREVENTION ─────────────────────────────────────
        // Filter out any (account, period) groups that are already billed.
        // We check rideshare_billing_aggregates for an existing record with an
        // invoice linkage — if found, this group was already pushed and must
        // not be billed again.
        const sortedGroups: typeof acctGroups = [];
        for (const g of acctGroups) {
          const [existingAgg] = await db.select({
            id: rideshareBillingAggregates.id,
            invoiceId: rideshareBillingAggregates.invoiceId,
            invoiceNumberSnapshot: rideshareBillingAggregates.invoiceNumberSnapshot,
          }).from(rideshareBillingAggregates)
            .where(and(
              eq(rideshareBillingAggregates.accountId, accountId),
              eq(rideshareBillingAggregates.billingPeriodStart, g.weekStart),
              eq(rideshareBillingAggregates.billingPeriodEnd, g.weekEnd),
              isNotNull(rideshareBillingAggregates.invoiceId),
            ))
            .limit(1);

          if (existingAgg) {
            skipped.push({
              accountId,
              weekStart: g.weekStart,
              weekEnd: g.weekEnd,
              reason: `Already invoiced (${existingAgg.invoiceNumberSnapshot ?? existingAgg.invoiceId})`,
              existingInvoiceId: existingAgg.invoiceId,
            });
            console.warn(`[rideshareRoutes] Duplicate-billing blocked: account=${accountId} period=${g.weekStart}→${g.weekEnd} (invoice=${existingAgg.invoiceNumberSnapshot})`);
          } else {
            sortedGroups.push(g);
          }
        }

        // If all groups for this account were already billed, skip invoice creation
        if (sortedGroups.length === 0) continue;

        // Sort by week start for deterministic line item order
        sortedGroups.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

        // Compute invoice totals across unbilled groups only
        const accountTotalAmount = sortedGroups
          .flatMap(g => g.txns)
          .reduce((s, t) => s + parseFloat(t.billableAmount ?? t.totalFare ?? "0"), 0)
          .toFixed(2);

        // Generate invoice number
        const invoiceNumber = `RS-${Date.now().toString().slice(-8)}-${(accountNumber ?? accountId.slice(0, 6)).toUpperCase()}`;

        // ── INTERNAL NOTES ─────────────────────────────────────────────────
        // Metadata stored internally (NOT shown on customer-facing invoice face)
        const periodLabels = sortedGroups.map(g => `Week of ${g.weekLabel}`).join("; ");
        const totalRidesAcrossGroups = sortedGroups.flatMap(g => g.txns).length;
        const internalMeta = [
          `Source: Rideshare Reconciliation`,
          `Service code: DRIVERRETURN_RIDESHARE`,
          `Periods: ${periodLabels}`,
          `Total rides: ${totalRidesAcrossGroups}`,
          `Batch: ${batchRef}`,
          ...(notes ? [`Notes: ${notes}`] : []),
        ].join(" | ");

        // Create one draft invoice per account (aggregate billing for all weeks in scope)
        const [inv] = await db.insert(invoices).values({
          invoiceNumber,
          customerId:     accountId,
          customerName,
          invoiceDate,
          dueDate,
          paymentTerms:   "net_30",
          subtotalAmount: accountTotalAmount,
          totalAmount:    accountTotalAmount,
          status:         "draft",
          internalNotes:  internalMeta,
        }).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

        const periodSummaries: { weekStart: string; weekEnd: string; weekLabel: string; rides: number; amount: string }[] = [];

        for (let gIdx = 0; gIdx < sortedGroups.length; gIdx++) {
          const g = sortedGroups[gIdx];
          const groupTotal = g.txns.reduce((s, t) => s + parseFloat(t.billableAmount ?? t.totalFare ?? "0"), 0).toFixed(2);

          // ── EXACT DESCRIPTION FORMAT per spec ─────────────────────────
          // "DriverReturn (Rideshare) – Week of MM/DD/YYYY – MM/DD/YYYY"
          const lineDesc = `DriverReturn (Rideshare) \u2013 Week of ${g.weekLabel}`;

          // ── INVOICE LINE ITEM ─────────────────────────────────────────
          // ONE aggregate line per (account, week).
          //   quantity   = 1        (one summary line, not per-ride)
          //   unitPrice  = total    (full weekly amount)
          //   totalPrice = total
          //   serviceCode = DRIVERRETURN_RIDESHARE (internal service code)
          //   sourceRecordType = rideshare_billing_aggregate (for traceability)
          //   sourceId will be backfilled after aggregate is created (circular ref)
          const [lineItem] = await db.insert(invoiceLineItems).values({
            invoiceId:        inv.id,
            lineNumber:       gIdx + 1,
            lineItemType:     "service",
            serviceType:      "other",
            category:         "service",
            description:      lineDesc,
            quantity:         "1",         // ONE aggregate line, not per-ride
            unitPrice:        groupTotal,  // Full weekly amount
            totalPrice:       groupTotal,
            dateOfService:    g.weekStart,
            sourceType:       "rideshare_aggregate",
            sourceId:         null,        // backfilled below after aggregate created
            sourceRecordType: "rideshare_billing_aggregate",
            serviceCode:      "DRIVERRETURN_RIDESHARE",
            billingPeriodStart: g.weekStart,
            billingPeriodEnd:   g.weekEnd,
            // Internal notes (not customer-facing): ride count, aggregate metadata
            notes: `Rideshare aggregate | ${g.txns.length} ride(s) | ${g.weekLabel} | DRIVERRETURN_RIDESHARE`,
          }).returning({ id: invoiceLineItems.id });

          // ── BILLING AGGREGATE RECORD ──────────────────────────────────
          // One record per (account, period) push — canonical source of truth
          // for invoice ↔ ride-level traceability.
          const [agg] = await db.insert(rideshareBillingAggregates).values({
            accountId,
            accountNumber,
            accountName:           customerName,
            billingPeriodStart:    g.weekStart,
            billingPeriodEnd:      g.weekEnd,
            totalRides:            g.txns.length,
            totalAmount:           groupTotal,
            invoiceId:             inv.id,
            invoiceLineItemId:     lineItem.id,
            invoiceNumberSnapshot: inv.invoiceNumber,
            batchRef,
            createdByUserId:       userId,
          }).returning({ id: rideshareBillingAggregates.id });

          // ── BACKFILL: set sourceId on line item → aggregate.id ────────
          // Provides direct linkage from invoice line → aggregate record.
          await db.update(invoiceLineItems).set({ sourceId: agg.id })
            .where(eq(invoiceLineItems.id, lineItem.id));

          // ── AGGREGATE ITEMS (ride-level linkage) ──────────────────────
          // Maps each individual rideshare_transaction to this aggregate.
          // Enables full drillback: invoice → aggregate → individual rides → source import.
          if (g.txns.length > 0) {
            await db.insert(rideshareBillingAggregateItems).values(
              g.txns.map(tx => ({ aggregateId: agg.id, rideshareTransactionId: tx.id }))
            );
          }

          // ── UPDATE TRANSACTIONS ────────────────────────────────────────
          // Mark each ride as billed and link to invoice + aggregate.
          const txIds = g.txns.map(t => t.id);
          await db.update(rideshareTransactions).set({
            billingStatus:         "billed",
            billedAt:              now,
            billedByUserId:        userId,
            invoiceId:             inv.id,
            invoiceNumberSnapshot: inv.invoiceNumber,
            invoiceLineItemId:     lineItem.id,
            aggregationGroupId:    agg.id,
            billingPeriodStart:    g.weekStart,
            billingPeriodEnd:      g.weekEnd,
            billingWeekLabel:      g.weekLabel,
            updatedAt:             now,
          }).where(inArray(rideshareTransactions.id, txIds));

          // ── AUDIT LOG ─────────────────────────────────────────────────
          for (const tx of g.txns) {
            await logBillingAudit({
              rideshareTransactionId: tx.id,
              actionType:             "pushed_to_invoice",
              priorBillingStatus:     "ready_for_billing",
              newBillingStatus:       "billed",
              actedByUserId:          userId,
              notes:                  `${lineDesc} | agg=${agg.id} | service_code=DRIVERRETURN_RIDESHARE | source_type=rideshare_aggregate${notes ? ` | ${notes}` : ""}`,
              invoiceId:              inv.id,
              invoiceNumberSnapshot:  inv.invoiceNumber,
              batchRef,
              billableAmount:         tx.billableAmount ?? tx.totalFare,
              billToAccountId:        tx.billToAccountId,
              billToAccountNumber:    tx.billToAccountNumber,
            });
          }

          periodSummaries.push({ weekStart: g.weekStart, weekEnd: g.weekEnd, weekLabel: g.weekLabel, rides: g.txns.length, amount: groupTotal });
        }

        results.push({
          accountId,
          accountNumber,
          accountName:   customerName,
          invoiceId:     inv.id,
          invoiceNumber: inv.invoiceNumber,
          totalRides:    sortedGroups.flatMap(g => g.txns).length,
          totalAmount:   accountTotalAmount,
          periods:       periodSummaries,
        });
      } catch (err: any) {
        console.error(`[rideshareRoutes] push-to-invoice error for account ${accountId}:`, err);
        failures.push({ accountId, error: err.message });
      }
    }

    return res.json({
      success:         failures.length === 0 && skipped.length === 0,
      batchRef,
      invoicesCreated: results.length,
      totalBilled:     results.reduce((s, r) => s + r.totalRides, 0),
      failureCount:    failures.length,
      skippedCount:    skipped.length,
      results,
      failures,
      skipped,          // Groups blocked by duplicate-billing prevention
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] POST /billing/push-to-invoice:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/summary — billing summary metrics
// ---------------------------------------------------------------------------
router.get("/billing/summary", isAuthenticated, async (req: any, res) => {
  try {
    const { dateFrom, dateTo, provider } = req.query as Record<string, string>;

    const conditions: any[] = [eq(rideshareTransactions.isArchived, false)];
    if (dateFrom) conditions.push(gte(rideshareTransactions.rideDate, dateFrom));
    if (dateTo)   conditions.push(lte(rideshareTransactions.rideDate, dateTo));
    if (provider) conditions.push(eq(rideshareTransactions.provider, provider));

    const [totals] = await db.select({
      readyCount:    sql<number>`COUNT(*) FILTER (WHERE billing_status = 'ready_for_billing')`,
      readyAmount:   sql<string>`COALESCE(SUM(CASE WHEN billing_status = 'ready_for_billing' THEN CAST(COALESCE(billable_amount, total_fare) AS NUMERIC) ELSE 0 END), 0)::text`,
      billedCount:   sql<number>`COUNT(*) FILTER (WHERE billing_status = 'billed')`,
      billedAmount:  sql<string>`COALESCE(SUM(CASE WHEN billing_status = 'billed' THEN CAST(COALESCE(billable_amount, total_fare) AS NUMERIC) ELSE 0 END), 0)::text`,
      excludedCount: sql<number>`COUNT(*) FILTER (WHERE billing_status = 'excluded')`,
      excludedAmount:sql<string>`COALESCE(SUM(CASE WHEN billing_status = 'excluded' THEN CAST(COALESCE(billable_amount, total_fare) AS NUMERIC) ELSE 0 END), 0)::text`,
      unreviewedCount: sql<number>`COUNT(*) FILTER (WHERE billing_status = 'unreviewed')`,
    }).from(rideshareTransactions)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    return res.json(totals ?? {
      readyCount: 0, readyAmount: "0", billedCount: 0, billedAmount: "0",
      excludedCount: 0, excludedAmount: "0", unreviewedCount: 0,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/summary:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/aggregates — list all billing aggregates for reporting
// Supports filtering by accountId, billingPeriodStart, batchRef, serviceCode.
// Enables: all DRIVERRETURN_RIDESHARE lines, total rideshare billed by account,
//          by period, across all customers.
// ---------------------------------------------------------------------------
router.get("/billing/aggregates", isAuthenticated, async (req: any, res) => {
  try {
    const { accountId, periodStart, periodEnd, batchRef: batchRefFilter, limit: lim } = req.query as Record<string, string>;
    const conds: any[] = [];
    if (accountId)        conds.push(eq(rideshareBillingAggregates.accountId, accountId));
    if (periodStart)      conds.push(gte(rideshareBillingAggregates.billingPeriodStart, periodStart));
    if (periodEnd)        conds.push(lte(rideshareBillingAggregates.billingPeriodEnd, periodEnd));
    if (batchRefFilter)   conds.push(eq(rideshareBillingAggregates.batchRef, batchRefFilter));

    const rows = await db.select().from(rideshareBillingAggregates)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(rideshareBillingAggregates.createdAt))
      .limit(parseInt(lim ?? "200", 10));

    // Totals for reporting
    const totalRides  = rows.reduce((s, r) => s + (r.totalRides ?? 0), 0);
    const totalAmount = rows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0).toFixed(2);

    return res.json({ aggregates: rows, totalRides, totalAmount, serviceCode: "DRIVERRETURN_RIDESHARE" });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/aggregates:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/aggregate/:id — single aggregate drilldown
// Returns the aggregate record + all linked rideshare_transactions.
// Enables: invoice → aggregate → individual rides → source import row
// ---------------------------------------------------------------------------
router.get("/billing/aggregate/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;

    const [agg] = await db.select().from(rideshareBillingAggregates)
      .where(eq(rideshareBillingAggregates.id, id))
      .limit(1);

    if (!agg) return res.status(404).json({ message: "Aggregate not found" });

    // Fetch all linked transaction IDs from aggregate_items
    const items = await db.select({ txId: rideshareBillingAggregateItems.rideshareTransactionId })
      .from(rideshareBillingAggregateItems)
      .where(eq(rideshareBillingAggregateItems.aggregateId, id));

    const txIds = items.map(i => i.txId);

    // Fetch the actual transactions for ride-level drilldown
    const rides = txIds.length > 0
      ? await db.select({
          id:                   rideshareTransactions.id,
          rideDate:             rideshareTransactions.rideDate,
          provider:             rideshareTransactions.provider,
          riderName:            rideshareTransactions.riderName,
          pickupAddressRaw:     rideshareTransactions.pickupAddressRaw,
          dropoffAddressRaw:    rideshareTransactions.dropoffAddressRaw,
          totalFare:            rideshareTransactions.totalFare,
          billableAmount:       rideshareTransactions.billableAmount,
          billingStatus:        rideshareTransactions.billingStatus,
          billingWeekLabel:     rideshareTransactions.billingWeekLabel,
          importBatchId:        rideshareTransactions.importBatchId,
          rawRowId:             rideshareTransactions.rawRowId,
        }).from(rideshareTransactions)
          .where(inArray(rideshareTransactions.id, txIds))
      : [];

    return res.json({
      aggregate: {
        ...agg,
        serviceCode: "DRIVERRETURN_RIDESHARE",
        sourceType:  "rideshare_aggregate",
        sourceRecordType: "rideshare_billing_aggregate",
      },
      rides,
      totalRides: rides.length,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/aggregate/:id:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/ready — billing-ready records (filterable grid)
// ---------------------------------------------------------------------------
router.get("/billing/ready", isAuthenticated, async (req: any, res) => {
  try {
    const {
      billingStatus = "ready_for_billing",
      dateFrom, dateTo, provider,
      accountId, importBatchId,
      weekStart: weekStartFilter,  // prefer this over dateFrom/dateTo for billing period filtering
      limit: limitStr = "100",
      offset: offsetStr = "0",
    } = req.query as Record<string, string>;

    const LIMIT = Math.min(parseInt(limitStr) || 100, 500);
    const OFFSET = parseInt(offsetStr) || 0;

    const conditions: any[] = [eq(rideshareTransactions.isArchived, false)];
    if (billingStatus && billingStatus !== "__all__") conditions.push(eq(rideshareTransactions.billingStatus, billingStatus));
    if (provider && provider !== "__all__") conditions.push(eq(rideshareTransactions.provider, provider));
    if (accountId)     conditions.push(eq(rideshareTransactions.billToAccountId, accountId));
    if (importBatchId && importBatchId !== "__all__") conditions.push(eq(rideshareTransactions.importBatchId, importBatchId));

    // Period filter: if weekStart is provided, filter on billing_period_start (for billed)
    // or ride_date (for ready/other statuses).
    // For "billed" records, billing_period_start is always set. For "ready" records, fall back to ride_date.
    if (weekStartFilter) {
      const weekEndFilter = getWeekEnd(weekStartFilter);
      conditions.push(
        sql`(COALESCE(${rideshareTransactions.billingPeriodStart}, ${rideshareTransactions.rideDate}) >= ${weekStartFilter}
          AND COALESCE(${rideshareTransactions.billingPeriodStart}, ${rideshareTransactions.rideDate}) <= ${weekEndFilter})`
      );
    } else {
      // Fall back to explicit date range
      if (dateFrom) conditions.push(gte(rideshareTransactions.rideDate, dateFrom));
      if (dateTo)   conditions.push(lte(rideshareTransactions.rideDate, dateTo));
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [records, [{ total }]] = await Promise.all([
      db.select({
        id:                    rideshareTransactions.id,
        provider:              rideshareTransactions.provider,
        rideDate:              rideshareTransactions.rideDate,
        rideDatetime:          rideshareTransactions.rideDatetime,
        riderName:             rideshareTransactions.riderName,
        pickupAddressRaw:      rideshareTransactions.pickupAddressRaw,
        dropoffAddressRaw:     rideshareTransactions.dropoffAddressRaw,
        matchedAccountId:      rideshareTransactions.matchedAccountId,
        matchedAccountNumber:  rideshareTransactions.matchedAccountNumber,
        matchedAccountName:    rideshareTransactions.matchedAccountName,
        totalFare:             rideshareTransactions.totalFare,
        billableAmount:        rideshareTransactions.billableAmount,
        matchStatus:           rideshareTransactions.matchStatus,
        billingStatus:         rideshareTransactions.billingStatus,
        billingReadyAt:        rideshareTransactions.billingReadyAt,
        billingReadyByUserId:  rideshareTransactions.billingReadyByUserId,
        billedAt:              rideshareTransactions.billedAt,
        billedByUserId:        rideshareTransactions.billedByUserId,
        invoiceId:             rideshareTransactions.invoiceId,
        invoiceNumberSnapshot: rideshareTransactions.invoiceNumberSnapshot,
        billToAccountId:       rideshareTransactions.billToAccountId,
        billToAccountNumber:   rideshareTransactions.billToAccountNumber,
        importBatchId:         rideshareTransactions.importBatchId,
        batchFileName:         rideshareImportBatches.sourceFileName,
        billingWeekLabel:      rideshareTransactions.billingWeekLabel,
        billingPeriodStart:    rideshareTransactions.billingPeriodStart,
        billingPeriodEnd:      rideshareTransactions.billingPeriodEnd,
      })
      .from(rideshareTransactions)
      .leftJoin(rideshareImportBatches, eq(rideshareTransactions.importBatchId, rideshareImportBatches.id))
      .where(where)
      .orderBy(desc(rideshareTransactions.billingReadyAt), desc(rideshareTransactions.rideDate))
      .limit(LIMIT)
      .offset(OFFSET),
      db.select({ total: count() }).from(rideshareTransactions).where(where),
    ]);

    return res.json({ records, total });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/ready:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/audit/:txId — audit history for a transaction
// ---------------------------------------------------------------------------
router.get("/billing/audit/:txId", isAuthenticated, async (req: any, res) => {
  try {
    const { txId } = req.params;
    const history = await db.select().from(rideshareBillingAudit)
      .where(eq(rideshareBillingAudit.rideshareTransactionId, txId))
      .orderBy(desc(rideshareBillingAudit.actedAt))
      .limit(50);
    return res.json(history);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/periods — available billing weeks with ready transaction counts
// Uses LOCAL ride time (not UTC) to compute Mon–Sun billing week boundaries.
// Also returns current week so the UI can default to it even if no transactions.
// ---------------------------------------------------------------------------
router.get("/billing/periods", isAuthenticated, async (req: any, res) => {
  try {
    // Select all local datetime fields needed for accurate period calculation
    const rows = await db.select({
      rideDate:              rideshareTransactions.rideDate,
      rideDatetime:          rideshareTransactions.rideDatetime,
      dropoffDatetimeLocal:  rideshareTransactions.dropoffDatetimeLocal,
      requestDatetimeLocal:  rideshareTransactions.requestDatetimeLocal,
      timezoneOffset:        rideshareTransactions.timezoneOffset,
      billableAmount:        rideshareTransactions.billableAmount,
      totalFare:             rideshareTransactions.totalFare,
      billToAccountId:       rideshareTransactions.billToAccountId,
    }).from(rideshareTransactions)
      .where(and(
        eq(rideshareTransactions.billingStatus, "ready_for_billing"),
        isNotNull(rideshareTransactions.billToAccountId),
        eq(rideshareTransactions.isArchived, false),
      ));

    // Compute billing week from LOCAL ride datetime
    const weekMap: Record<string, { weekStart: string; weekEnd: string; weekLabel: string; rides: number; amount: number; accounts: Set<string> }> = {};
    for (const row of rows) {
      const { weekStart: ws, weekEnd: we, weekLabel } = getBillingPeriod(row);
      if (!weekMap[ws]) weekMap[ws] = { weekStart: ws, weekEnd: we, weekLabel, rides: 0, amount: 0, accounts: new Set() };
      weekMap[ws].rides += 1;
      weekMap[ws].amount += parseFloat(row.billableAmount ?? row.totalFare ?? "0");
      if (row.billToAccountId) weekMap[ws].accounts.add(row.billToAccountId);
    }

    const periods = Object.values(weekMap)
      .map(w => ({
        weekStart:    w.weekStart,
        weekEnd:      w.weekEnd,
        weekLabel:    w.weekLabel,
        label:        `Week of ${w.weekLabel}`,
        totalRides:   w.rides,
        totalAmount:  w.amount.toFixed(2),
        accountCount: w.accounts.size,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    // Always include current week metadata so the UI can default to it
    const cwStart = currentWeekStart();
    const cwEnd   = currentWeekEnd();
    const cwLabel = makeBillingWeekLabel(cwStart, cwEnd);

    return res.json({
      periods,
      currentWeek: { weekStart: cwStart, weekEnd: cwEnd, weekLabel: cwLabel, label: `Week of ${cwLabel}` },
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/periods:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/periods/preview — preview aggregation for a given billing period
// Returns per-account breakdown for Push to Invoice confirmation modal.
// ---------------------------------------------------------------------------
router.get("/billing/periods/preview", isAuthenticated, async (req: any, res) => {
  try {
    const { weekStart, weekEnd } = req.query as Record<string, string>;
    if (!weekStart || !weekEnd) {
      return res.status(400).json({ message: "weekStart and weekEnd are required" });
    }

    // Fetch all ready transactions with full local datetime fields for accurate period filtering
    const rows = await db.select({
      id:                    rideshareTransactions.id,
      billToAccountId:       rideshareTransactions.billToAccountId,
      billToAccountNumber:   rideshareTransactions.billToAccountNumber,
      rideDate:              rideshareTransactions.rideDate,
      rideDatetime:          rideshareTransactions.rideDatetime,
      dropoffDatetimeLocal:  rideshareTransactions.dropoffDatetimeLocal,
      requestDatetimeLocal:  rideshareTransactions.requestDatetimeLocal,
      timezoneOffset:        rideshareTransactions.timezoneOffset,
      billableAmount:        rideshareTransactions.billableAmount,
      totalFare:             rideshareTransactions.totalFare,
      provider:              rideshareTransactions.provider,
    }).from(rideshareTransactions)
      .where(and(
        eq(rideshareTransactions.billingStatus, "ready_for_billing"),
        isNotNull(rideshareTransactions.billToAccountId),
        eq(rideshareTransactions.isArchived, false),
      ));

    // Filter server-side using LOCAL ride datetime so billing period matches push-to-invoice logic exactly
    const filtered = rows.filter(row => {
      const { weekStart: ws } = getBillingPeriod(row);
      return ws === weekStart; // week uniquely identified by its Monday date
    });

    // Group by account
    const byAccount: Record<string, { accountId: string; accountNumber: string | null; accountName: string | null; rides: number; amount: number }> = {};
    for (const row of filtered) {
      const aid = row.billToAccountId!;
      if (!byAccount[aid]) byAccount[aid] = { accountId: aid, accountNumber: row.billToAccountNumber, accountName: null, rides: 0, amount: 0 };
      byAccount[aid].rides += 1;
      byAccount[aid].amount += parseFloat(row.billableAmount ?? row.totalFare ?? "0");
    }

    // Enrich with customer names
    const accountIds = Object.keys(byAccount);
    if (accountIds.length > 0) {
      const custRows = await db.select({ id: customers.id, companyName: customers.companyName, customerNumber: customers.customerNumber })
        .from(customers).where(inArray(customers.id, accountIds));
      for (const c of custRows) {
        if (byAccount[c.id]) {
          byAccount[c.id].accountName = c.companyName;
          byAccount[c.id].accountNumber = c.customerNumber ?? byAccount[c.id].accountNumber;
        }
      }
    }

    const accounts = Object.values(byAccount).map(a => ({ ...a, amount: a.amount.toFixed(2) }))
      .sort((a, b) => (a.accountName ?? "").localeCompare(b.accountName ?? ""));

    const weekLabel = makeBillingWeekLabel(weekStart, weekEnd);

    return res.json({
      weekStart,
      weekEnd,
      weekLabel,
      label:        `Week of ${weekLabel}`,
      totalRides:   filtered.length,
      totalAmount:  Object.values(byAccount).reduce((s, a) => s + a.amount, 0).toFixed(2),
      accountCount: accounts.length,
      accounts,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/periods/preview:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/periods/preview/rides — per-account ride detail for push modal
// Returns ready_for_billing rides for a specific account in a given billing week.
// Used for the expandable row in the Push to Invoice preview modal.
// ---------------------------------------------------------------------------
router.get("/billing/periods/preview/rides", isAuthenticated, async (req: any, res) => {
  try {
    const { weekStart, accountId } = req.query as Record<string, string>;
    if (!weekStart || !accountId) {
      return res.status(400).json({ message: "weekStart and accountId are required" });
    }

    // Fetch all ready rides for this account with local datetime fields
    const allRows = await db.select({
      id:                    rideshareTransactions.id,
      rideDate:              rideshareTransactions.rideDate,
      rideDatetime:          rideshareTransactions.rideDatetime,
      dropoffDatetimeLocal:  rideshareTransactions.dropoffDatetimeLocal,
      requestDatetimeLocal:  rideshareTransactions.requestDatetimeLocal,
      timezoneOffset:        rideshareTransactions.timezoneOffset,
      provider:              rideshareTransactions.provider,
      riderName:             rideshareTransactions.riderName,
      pickupAddressRaw:      rideshareTransactions.pickupAddressRaw,
      dropoffAddressRaw:     rideshareTransactions.dropoffAddressRaw,
      totalFare:             rideshareTransactions.totalFare,
      billableAmount:        rideshareTransactions.billableAmount,
      billingStatus:         rideshareTransactions.billingStatus,
    }).from(rideshareTransactions)
      .where(and(
        eq(rideshareTransactions.billingStatus, "ready_for_billing"),
        eq(rideshareTransactions.billToAccountId, accountId),
        eq(rideshareTransactions.isArchived, false),
      ));

    // Filter to the requested billing week using local ride datetime
    const rides = allRows.filter(row => {
      const { weekStart: ws } = getBillingPeriod(row);
      return ws === weekStart;
    });

    return res.json({ rides, total: rides.length });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/periods/preview/rides:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/aggregates — list all billing aggregates (with drilldown support)
// ---------------------------------------------------------------------------
router.get("/billing/aggregates", isAuthenticated, async (req: any, res) => {
  try {
    const {
      accountId, invoiceId, batchRef,
      dateFrom, dateTo,
      limit: limitStr = "100",
      offset: offsetStr = "0",
    } = req.query as Record<string, string>;

    const LIMIT  = Math.min(parseInt(limitStr) || 100, 500);
    const OFFSET = parseInt(offsetStr) || 0;

    const conds: any[] = [];
    if (accountId) conds.push(eq(rideshareBillingAggregates.accountId, accountId));
    if (invoiceId) conds.push(eq(rideshareBillingAggregates.invoiceId, invoiceId));
    if (batchRef)  conds.push(eq(rideshareBillingAggregates.batchRef, batchRef));
    if (dateFrom)  conds.push(gte(rideshareBillingAggregates.billingPeriodStart, dateFrom));
    if (dateTo)    conds.push(lte(rideshareBillingAggregates.billingPeriodEnd, dateTo));

    const where = conds.length > 1 ? and(...conds) : conds.length === 1 ? conds[0] : undefined;

    const [records, [{ total }]] = await Promise.all([
      db.select().from(rideshareBillingAggregates)
        .where(where)
        .orderBy(desc(rideshareBillingAggregates.createdAt))
        .limit(LIMIT)
        .offset(OFFSET),
      db.select({ total: count() }).from(rideshareBillingAggregates).where(where),
    ]);

    return res.json({ records, total });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/aggregates:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/aggregates/:id/rides — ride-level drilldown for a billing aggregate
// ---------------------------------------------------------------------------
router.get("/billing/aggregates/:id/rides", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;

    const [agg] = await db.select().from(rideshareBillingAggregates)
      .where(eq(rideshareBillingAggregates.id, id)).limit(1);
    if (!agg) return res.status(404).json({ message: "Aggregate not found" });

    // Get linked transaction IDs
    const links = await db.select({ txId: rideshareBillingAggregateItems.rideshareTransactionId })
      .from(rideshareBillingAggregateItems)
      .where(eq(rideshareBillingAggregateItems.aggregateId, id));

    const txIds = links.map(l => l.txId);
    if (!txIds.length) return res.json({ aggregate: agg, rides: [] });

    const rides = await db.select({
      id:                  rideshareTransactions.id,
      provider:            rideshareTransactions.provider,
      rideDate:            rideshareTransactions.rideDate,
      rideDatetime:        rideshareTransactions.rideDatetime,
      riderName:           rideshareTransactions.riderName,
      pickupAddressRaw:    rideshareTransactions.pickupAddressRaw,
      dropoffAddressRaw:   rideshareTransactions.dropoffAddressRaw,
      totalFare:           rideshareTransactions.totalFare,
      billableAmount:      rideshareTransactions.billableAmount,
      matchedAccountId:    rideshareTransactions.matchedAccountId,
      matchedAccountNumber: rideshareTransactions.matchedAccountNumber,
      matchedAccountName:  rideshareTransactions.matchedAccountName,
      billingStatus:       rideshareTransactions.billingStatus,
      invoiceNumberSnapshot: rideshareTransactions.invoiceNumberSnapshot,
    }).from(rideshareTransactions)
      .where(inArray(rideshareTransactions.id, txIds))
      .orderBy(rideshareTransactions.rideDate);

    return res.json({ aggregate: agg, rides });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/aggregates/:id/rides:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /billing/export/preview — returns count + total for export confirmation modal
// ---------------------------------------------------------------------------
router.get("/billing/export/preview", isAuthenticated, async (req: any, res) => {
  try {
    const {
      aggregateId, invoiceId, invoiceNumber,
      accountId, billingPeriodStart, billingPeriodEnd,
      provider, billingStatus,
      dateFrom, dateTo,
    } = req.query as Record<string, string>;

    const conds: any[] = [eq(rideshareTransactions.isArchived, false)];

    if (aggregateId) {
      const links = await db.select({ txId: rideshareBillingAggregateItems.rideshareTransactionId })
        .from(rideshareBillingAggregateItems)
        .where(eq(rideshareBillingAggregateItems.aggregateId, aggregateId));
      conds.push(links.length ? inArray(rideshareTransactions.id, links.map(l => l.txId)) : sql`1=0`);
    } else {
      // Resolve invoiceId from invoiceNumber if needed
      let resolvedInvoiceId = invoiceId;
      if (!resolvedInvoiceId && invoiceNumber) {
        const inv = await db.select({ id: invoices.id }).from(invoices)
          .where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
        resolvedInvoiceId = inv[0]?.id;
      }
      if (resolvedInvoiceId) conds.push(eq(rideshareTransactions.invoiceId, resolvedInvoiceId));
      if (accountId)         conds.push(or(eq(rideshareTransactions.matchedAccountId, accountId), eq(rideshareTransactions.billToAccountId, accountId)));
      if (billingPeriodStart) conds.push(gte(rideshareTransactions.billingPeriodStart, billingPeriodStart));
      if (billingPeriodEnd)   conds.push(lte(rideshareTransactions.billingPeriodEnd,   billingPeriodEnd));
      if (provider)          conds.push(eq(rideshareTransactions.provider, provider));
      if (dateFrom)          conds.push(gte(rideshareTransactions.rideDate, dateFrom));
      if (dateTo)            conds.push(lte(rideshareTransactions.rideDate, dateTo));
      // default to billed unless overridden
      const bs = billingStatus ?? "billed";
      conds.push(eq(rideshareTransactions.billingStatus, bs));
    }

    const [result] = await db.select({
      totalRides: count(),
      totalAmount: sum(rideshareTransactions.billableAmount),
      uberTotal: sum(sql`case when ${rideshareTransactions.provider} = 'uber' then ${rideshareTransactions.billableAmount}::numeric else 0 end`),
      lyftTotal: sum(sql`case when ${rideshareTransactions.provider} = 'lyft' then ${rideshareTransactions.billableAmount}::numeric else 0 end`),
    }).from(rideshareTransactions).where(conds.length > 1 ? and(...conds) : conds[0]);

    return res.json({
      totalRides:  Number(result?.totalRides ?? 0),
      totalAmount: result?.totalAmount ?? "0",
      uberTotal:   result?.uberTotal   ?? "0",
      lyftTotal:   result?.lyftTotal   ?? "0",
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/export/preview:", err);
    return res.status(500).json({ message: err.message });
  }
});

// GET /billing/export — full customer detail report (CSV or XLSX)
// ---------------------------------------------------------------------------
router.get("/billing/export", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const {
      aggregateId, invoiceId, invoiceNumber,
      accountId, billingPeriodStart, billingPeriodEnd,
      provider, billingStatus,
      dateFrom, dateTo,
      format: fmt = "csv",
    } = req.query as Record<string, string>;

    const conds: any[] = [eq(rideshareTransactions.isArchived, false)];

    let resolvedInvoiceId = invoiceId;
    if (!resolvedInvoiceId && invoiceNumber) {
      const inv = await db.select({ id: invoices.id, number: invoices.invoiceNumber })
        .from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
      resolvedInvoiceId = inv[0]?.id;
    }

    if (aggregateId) {
      const links = await db.select({ txId: rideshareBillingAggregateItems.rideshareTransactionId })
        .from(rideshareBillingAggregateItems)
        .where(eq(rideshareBillingAggregateItems.aggregateId, aggregateId));
      conds.push(links.length ? inArray(rideshareTransactions.id, links.map(l => l.txId)) : sql`1=0`);
    } else {
      if (resolvedInvoiceId) conds.push(eq(rideshareTransactions.invoiceId, resolvedInvoiceId));
      if (accountId)         conds.push(or(eq(rideshareTransactions.matchedAccountId, accountId), eq(rideshareTransactions.billToAccountId, accountId)));
      if (billingPeriodStart) conds.push(gte(rideshareTransactions.billingPeriodStart, billingPeriodStart));
      if (billingPeriodEnd)   conds.push(lte(rideshareTransactions.billingPeriodEnd,   billingPeriodEnd));
      if (provider)          conds.push(eq(rideshareTransactions.provider, provider));
      if (dateFrom)          conds.push(gte(rideshareTransactions.rideDate, dateFrom));
      if (dateTo)            conds.push(lte(rideshareTransactions.rideDate, dateTo));
      const bs = billingStatus ?? "billed";
      conds.push(eq(rideshareTransactions.billingStatus, bs));
    }

    const rides = await db.select({
      id:                    rideshareTransactions.id,
      provider:              rideshareTransactions.provider,
      rideDate:              rideshareTransactions.rideDate,
      dropoffDatetimeLocal:  rideshareTransactions.dropoffDatetimeLocal,
      requestDatetimeLocal:  rideshareTransactions.requestDatetimeLocal,
      rideDatetime:          rideshareTransactions.rideDatetime,
      riderName:             rideshareTransactions.riderName,
      riderFirstName:        rideshareTransactions.riderFirstName,
      riderLastName:         rideshareTransactions.riderLastName,
      riderEmail:            rideshareTransactions.riderEmail,
      serviceType:           rideshareTransactions.serviceType,
      pickupAddress:         rideshareTransactions.pickupAddress,
      dropoffAddress:        rideshareTransactions.dropoffAddress,
      pickupAddressRaw:      rideshareTransactions.pickupAddressRaw,
      dropoffAddressRaw:     rideshareTransactions.dropoffAddressRaw,
      city:                  rideshareTransactions.city,
      totalFare:             rideshareTransactions.totalFare,
      billableAmount:        rideshareTransactions.billableAmount,
      baseFare:              rideshareTransactions.baseFare,
      tolls:                 rideshareTransactions.tolls,
      fees:                  rideshareTransactions.fees,
      taxes:                 rideshareTransactions.taxes,
      tips:                  rideshareTransactions.tips,
      distanceMiles:         rideshareTransactions.distanceMiles,
      durationMinutes:       rideshareTransactions.durationMinutes,
      matchedAccountId:      rideshareTransactions.matchedAccountId,
      matchedAccountNumber:  rideshareTransactions.matchedAccountNumber,
      matchedAccountName:    rideshareTransactions.matchedAccountName,
      billToAccountId:       rideshareTransactions.billToAccountId,
      billToAccountNumber:   rideshareTransactions.billToAccountNumber,
      billingStatus:         rideshareTransactions.billingStatus,
      matchStatus:           rideshareTransactions.matchStatus,
      invoiceNumberSnapshot: rideshareTransactions.invoiceNumberSnapshot,
      invoiceId:             rideshareTransactions.invoiceId,
      billingPeriodStart:    rideshareTransactions.billingPeriodStart,
      billingPeriodEnd:      rideshareTransactions.billingPeriodEnd,
      billingWeekLabel:      rideshareTransactions.billingWeekLabel,
      importBatchId:         rideshareTransactions.importBatchId,
      providerTripId:        rideshareTransactions.providerTripId,
    }).from(rideshareTransactions)
      .where(conds.length > 1 ? and(...conds) : conds[0])
      .orderBy(rideshareTransactions.rideDate, rideshareTransactions.rideDatetime);

    // ── Helpers ────────────────────────────────────────────────────────────
    const fmtDate = (d: any): string => {
      if (!d) return "";
      try {
        const dt = d instanceof Date ? d : new Date(String(d));
        const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(dt.getUTCDate()).padStart(2, "0");
        const yyyy = dt.getUTCFullYear();
        return `${mm}/${dd}/${yyyy}`;
      } catch { return String(d); }
    };
    const fmtTime = (d: any): string => {
      if (!d) return "";
      try {
        const dt = d instanceof Date ? d : new Date(String(d));
        const h = String(dt.getUTCHours()).padStart(2, "0");
        const m = String(dt.getUTCMinutes()).padStart(2, "0");
        return `${h}:${m}`;
      } catch { return ""; }
    };
    const fmtCurrency = (v: any): string => {
      if (v == null || v === "") return "";
      const n = parseFloat(String(v));
      return isNaN(n) ? "" : n.toFixed(2);
    };
    const csvCell = (v: any): string => {
      if (v == null || v === "") return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };

    // ── Derive canonical account fields ────────────────────────────────────
    const rows = rides.map(r => ({
      acctNumber: r.matchedAccountNumber ?? r.billToAccountNumber ?? "",
      acctName:   r.matchedAccountName ?? "",
      rideDate:   fmtDate(r.rideDate),
      rideTime:   fmtTime(r.dropoffDatetimeLocal ?? r.requestDatetimeLocal ?? r.rideDatetime),
      provider:   (r.provider ?? "").charAt(0).toUpperCase() + (r.provider ?? "").slice(1),
      riderName:  r.riderName ?? (r.riderFirstName || r.riderLastName ? `${r.riderFirstName ?? ""} ${r.riderLastName ?? ""}`.trim() : ""),
      riderEmail: r.riderEmail ?? "",
      serviceType: r.serviceType ?? "",
      pickup:     r.pickupAddress ?? r.pickupAddressRaw ?? "",
      dropoff:    r.dropoffAddress ?? r.dropoffAddressRaw ?? "",
      city:       r.city ?? "",
      fare:       fmtCurrency(r.billableAmount ?? r.totalFare),
      baseFare:   fmtCurrency(r.baseFare),
      tolls:      fmtCurrency(r.tolls),
      fees:       fmtCurrency(r.fees),
      taxes:      fmtCurrency(r.taxes),
      tips:       fmtCurrency(r.tips),
      distance:   r.distanceMiles ?? "",
      duration:   r.durationMinutes ?? "",
      matchStatus:   r.matchStatus ?? "",
      billingStatus: r.billingStatus ?? "",
      importBatchId: r.importBatchId ?? "",
      providerTripId: r.providerTripId ?? "",
      invoiceNumber: r.invoiceNumberSnapshot ?? "",
      billingPeriodStart: fmtDate(r.billingPeriodStart),
      billingPeriodEnd:   fmtDate(r.billingPeriodEnd),
    }));

    // ── Summary totals ────────────────────────────────────────────────────
    const totalRides = rows.length;
    const totalAmount = rides.reduce((s, r) => s + parseFloat(String(r.billableAmount ?? r.totalFare ?? "0")), 0);
    const uberTotal  = rides.filter(r => r.provider === "uber").reduce((s, r) => s + parseFloat(String(r.billableAmount ?? r.totalFare ?? "0")), 0);
    const lyftTotal  = rides.filter(r => r.provider === "lyft").reduce((s, r) => s + parseFloat(String(r.billableAmount ?? r.totalFare ?? "0")), 0);

    // ── Derive filename ───────────────────────────────────────────────────
    const firstAcct  = rows[0]?.acctNumber ?? "ALL";
    const periodFrom = rows[0]?.billingPeriodStart.replace(/\//g, "") ?? "";
    const periodTo   = rows[rows.length - 1]?.billingPeriodEnd.replace(/\//g, "") ?? "";
    const fileName   = `Rideshare_Detail_${firstAcct}_${periodFrom}${periodTo ? `-${periodTo}` : ""}`;

    // ── Audit log ─────────────────────────────────────────────────────────
    try {
      const firstRide = rides[0];
      const canonAcctId = accountId ?? firstRide?.matchedAccountId ?? firstRide?.billToAccountId ?? null;
      const canonAcctNum = rows[0]?.acctNumber || null;
      const canonAcctName = rows[0]?.acctName || null;
      const canonInvNum = rows[0]?.invoiceNumber || null;
      await db.insert(rideshareExportLog).values({
        userId:             userId ?? undefined,
        exportType:         "billing_detail",
        accountId:          canonAcctId ?? undefined,
        accountNumber:      canonAcctNum ?? undefined,
        accountName:        canonAcctName ?? undefined,
        billingPeriodStart: billingPeriodStart ?? undefined,
        billingPeriodEnd:   billingPeriodEnd ?? undefined,
        invoiceId:          resolvedInvoiceId ?? undefined,
        invoiceNumber:      canonInvNum ?? undefined,
        provider:           provider ?? undefined,
        rowCount:           totalRides,
        totalAmount:        String(totalAmount.toFixed(2)),
        format:             fmt,
      });
    } catch (logErr) {
      console.warn("[rideshareRoutes] Export audit log failed (non-fatal):", logErr);
    }

    // ── Build output ──────────────────────────────────────────────────────
    const headers = [
      "Account #", "Account Name", "Billing Period Start", "Billing Period End", "Invoice #",
      "Ride Date (Local)", "Ride Time (Local)", "Provider", "Rider Name", "Rider Email", "Service Type",
      "Pickup Address", "Dropoff Address", "City",
      "Fare (USD)", "Base Fare", "Tolls", "Fees", "Taxes", "Tips",
      "Distance (mi)", "Duration (min)",
      "Match Status", "Billing Status", "Import Batch ID", "Provider Trip ID",
    ];

    if (fmt === "xlsx") {
      // ── XLSX ─────────────────────────────────────────────────────────────
      const summaryData = [
        ["Rideshare Detail Report"],
        ["Total Rides", totalRides],
        ["Total Amount", `$${totalAmount.toFixed(2)}`],
        ["Uber Total", `$${uberTotal.toFixed(2)}`],
        ["Lyft Total", `$${lyftTotal.toFixed(2)}`],
        [],
      ];
      const dataRows = rows.map(r => [
        r.acctNumber, r.acctName, r.billingPeriodStart, r.billingPeriodEnd, r.invoiceNumber,
        r.rideDate, r.rideTime, r.provider, r.riderName, r.riderEmail, r.serviceType,
        r.pickup, r.dropoff, r.city,
        r.fare ? Number(r.fare) : "", r.baseFare ? Number(r.baseFare) : "",
        r.tolls ? Number(r.tolls) : "", r.fees ? Number(r.fees) : "",
        r.taxes ? Number(r.taxes) : "", r.tips ? Number(r.tips) : "",
        r.distance ? Number(r.distance) : "", r.duration ? Number(r.duration) : "",
        r.matchStatus, r.billingStatus, r.importBatchId, r.providerTripId,
      ]);
      const sheetData = [...summaryData, headers, ...dataRows];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, "Rideshare Detail");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}.xlsx`);
      return res.send(buf);
    } else {
      // ── CSV ───────────────────────────────────────────────────────────────
      const lines: string[] = [
        "Rideshare Detail Report",
        `Total Rides,${totalRides}`,
        `Total Amount,${totalAmount.toFixed(2)}`,
        `Uber Total,${uberTotal.toFixed(2)}`,
        `Lyft Total,${lyftTotal.toFixed(2)}`,
        "",
        headers.map(csvCell).join(","),
      ];
      for (const r of rows) {
        lines.push([
          csvCell(r.acctNumber), csvCell(r.acctName),
          csvCell(r.billingPeriodStart), csvCell(r.billingPeriodEnd), csvCell(r.invoiceNumber),
          csvCell(r.rideDate), csvCell(r.rideTime), csvCell(r.provider),
          csvCell(r.riderName), csvCell(r.riderEmail), csvCell(r.serviceType),
          csvCell(r.pickup), csvCell(r.dropoff), csvCell(r.city),
          csvCell(r.fare), csvCell(r.baseFare), csvCell(r.tolls),
          csvCell(r.fees), csvCell(r.taxes), csvCell(r.tips),
          csvCell(r.distance), csvCell(r.duration),
          csvCell(r.matchStatus), csvCell(r.billingStatus),
          csvCell(r.importBatchId), csvCell(r.providerTripId),
        ].join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}.csv`);
      return res.send(lines.join("\n"));
    }
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /billing/export:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Chase Driver Opportunity Analysis
// GET /chase-opportunity  — top-level opportunity list
// GET /chase-opportunity/:accountId  — per-account daily breakdown
// ---------------------------------------------------------------------------

/** Convert a Date (or null-ish) to minutes since midnight (using UTC fields because
 *  the "local" timestamps are stored as UTC-naked). */
function toMinsSinceMidnight(d: Date | null | undefined): number | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getUTCHours() * 60 + dt.getUTCMinutes();
}

interface SimRide { startMin: number; endMin: number; fare: number; id: string }

/** Greedy window-scan: find the optimal [shiftHours]-hour window and count/value rides. */
function simulateShift(rides: SimRide[], shiftHours: number, driverRate: number): {
  ridesHandled: number; rideshareTotal: number; driverCost: number; savings: number; windowStartMin: number;
} {
  const shiftMins = shiftHours * 60;
  const driverCost = driverRate * shiftHours;
  if (!rides.length) return { ridesHandled: 0, rideshareTotal: 0, driverCost, savings: -driverCost, windowStartMin: 480 };

  let best = { ridesHandled: 0, rideshareTotal: 0, windowStartMin: rides[0].startMin };

  const candidates = Array.from({ length: Math.ceil(1440 / 15) }, (_, i) => i * 15)
    .filter(s => s <= rides[rides.length - 1].startMin + 30);

  for (const shiftStart of candidates) {
    const shiftEnd = shiftStart + shiftMins;
    let cur = shiftStart;
    let handled = 0;
    let total = 0;
    for (const r of rides) {
      if (r.startMin >= cur && r.endMin + 5 <= shiftEnd) {
        handled++;
        total += r.fare;
        cur = r.endMin + 5;
      }
    }
    if (handled > best.ridesHandled || (handled === best.ridesHandled && total > best.rideshareTotal)) {
      best = { ridesHandled: handled, rideshareTotal: total, windowStartMin: shiftStart };
    }
  }

  return { ...best, driverCost, savings: best.rideshareTotal - driverCost };
}

function minsToTimeLabel(m: number): string {
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const suffix = hh < 12 ? "AM" : "PM";
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

router.get("/chase-opportunity", isAuthenticated, async (req: any, res) => {
  try {
    const {
      dateFrom, dateTo,
      market, accountId,
      minSavings = "0",
      driverRate = "25",
    } = req.query as Record<string, string>;

    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const rate = parseFloat(driverRate) || 25;
    const minSav = parseFloat(minSavings) || 0;

    // Pull all matched, non-excluded rides in range, grouped by (account, date)
    const rawRows = await db.execute(sql`
      SELECT
        rt.matched_account_id     AS account_id,
        rt.matched_account_number AS account_number,
        rt.matched_account_name   AS account_name,
        rt.city                   AS market,
        rt.ride_date,
        rt.id,
        COALESCE(rt.request_datetime_local, rt.ride_datetime) AS start_dt,
        rt.duration_minutes,
        COALESCE(rt.billable_amount, rt.total_fare, 0)::numeric AS fare
      FROM rideshare_transactions rt
      WHERE rt.is_archived = false
        AND rt.match_status = 'matched'
        AND rt.billing_status != 'excluded'
        AND rt.ride_date BETWEEN ${from} AND ${to}
        ${accountId ? sql`AND rt.matched_account_id = ${accountId}` : sql``}
        ${market    ? sql`AND LOWER(rt.city) = LOWER(${market})` : sql``}
        AND rt.matched_account_id IS NOT NULL
      ORDER BY rt.matched_account_id, rt.ride_date,
               COALESCE(rt.request_datetime_local, rt.ride_datetime)
    `);

    // Group by account → day → rides
    type DayBucket = { rides: SimRide[]; totalFare: number };
    type AcctData = {
      accountId: string; accountNumber: string; accountName: string; market: string;
      days: Map<string, DayBucket>;
    };
    const accts = new Map<string, AcctData>();

    for (const row of rawRows.rows as any[]) {
      const aid = row.account_id as string;
      if (!aid) continue;
      if (!accts.has(aid)) {
        accts.set(aid, {
          accountId: aid,
          accountNumber: row.account_number ?? "",
          accountName: row.account_name ?? "",
          market: row.market ?? "",
          days: new Map(),
        });
      }
      const acct = accts.get(aid)!;
      const dateKey = String(row.ride_date).slice(0, 10);
      if (!acct.days.has(dateKey)) acct.days.set(dateKey, { rides: [], totalFare: 0 });
      const day = acct.days.get(dateKey)!;
      const startMin = toMinsSinceMidnight(row.start_dt);
      const dur = parseInt(String(row.duration_minutes || 30));
      const fare = parseFloat(String(row.fare ?? 0));
      if (startMin !== null) {
        day.rides.push({ id: row.id, startMin, endMin: startMin + dur, fare });
        day.totalFare += fare;
      }
    }

    // Simulate for each account across all days
    const results: any[] = [];

    for (const acct of accts.values()) {
      const dayCount = acct.days.size;
      if (dayCount < 1) continue;

      // For each shift length, accumulate daily stats
      const shiftStats: Record<number, { totalSavings: number; totalRideshare: number; totalHandled: number; windows: number[] }> = {
        4: { totalSavings: 0, totalRideshare: 0, totalHandled: 0, windows: [] },
        6: { totalSavings: 0, totalRideshare: 0, totalHandled: 0, windows: [] },
        8: { totalSavings: 0, totalRideshare: 0, totalHandled: 0, windows: [] },
      };

      for (const day of acct.days.values()) {
        if (day.rides.length < 2) continue; // skip days with < 2 rides
        for (const sh of [4, 6, 8] as const) {
          const sim = simulateShift(day.rides, sh, rate);
          shiftStats[sh].totalSavings   += sim.savings;
          shiftStats[sh].totalRideshare += sim.rideshareTotal;
          shiftStats[sh].totalHandled   += sim.ridesHandled;
          shiftStats[sh].windows.push(sim.windowStartMin);
        }
      }

      // Pick best shift (max avg daily savings)
      let bestShift = 4;
      let bestAvgSav = -Infinity;
      for (const sh of [4, 6, 8] as const) {
        const daysWithData = shiftStats[sh].windows.length || 1;
        const avg = shiftStats[sh].totalSavings / daysWithData;
        if (avg > bestAvgSav) { bestAvgSav = avg; bestShift = sh; }
      }

      if (bestAvgSav < minSav) continue;

      const daysWithData = shiftStats[bestShift].windows.length || 1;
      const avgDailyRideshare = shiftStats[bestShift].totalRideshare / daysWithData;
      const avgDailyDriverCost = rate * bestShift;
      const avgDailySavings = bestAvgSav;

      // Mode of window starts → recommended time window
      const windowMode = shiftStats[bestShift].windows.length > 0
        ? shiftStats[bestShift].windows.reduce((a, b, _, arr) => {
            const ca = arr.filter(x => x === a).length;
            const cb = arr.filter(x => x === b).length;
            return cb > ca ? b : a;
          }, shiftStats[bestShift].windows[0])
        : 480;
      const windowEnd = windowMode + bestShift * 60;

      // Confidence score
      const ridesPerDay = shiftStats[bestShift].totalHandled / daysWithData;
      const dayScore = Math.min(30, (dayCount / 30) * 30);
      const rideScore = Math.min(30, (ridesPerDay / 4) * 30);
      // Savings variance penalty
      const savingsArr = [];
      for (const day of acct.days.values()) {
        if (day.rides.length < 2) continue;
        const sim = simulateShift(day.rides, bestShift, rate);
        savingsArr.push(sim.savings);
      }
      const meanSav = savingsArr.reduce((a, b) => a + b, 0) / (savingsArr.length || 1);
      const variance = savingsArr.reduce((a, b) => a + (b - meanSav) ** 2, 0) / (savingsArr.length || 1);
      const stdDev = Math.sqrt(variance);
      const variancePenalty = meanSav > 0 ? Math.min(40, (1 - Math.min(1, stdDev / Math.max(1, meanSav))) * 40) : 0;
      const confidence = Math.round(dayScore + rideScore + variancePenalty);

      results.push({
        accountId: acct.accountId,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
        market: acct.market,
        dayCount,
        avgDailyRideshareCost: avgDailyRideshare,
        estimatedDriverCost: avgDailyDriverCost,
        estimatedSavings: avgDailySavings,
        recommendedShift: bestShift,
        recommendedWindowStart: minsToTimeLabel(windowMode),
        recommendedWindowEnd:   minsToTimeLabel(windowEnd),
        recommendedWindow: `${minsToTimeLabel(windowMode)} – ${minsToTimeLabel(windowEnd)}`,
        confidenceScore: confidence,
        driverRate: rate,
      });
    }

    results.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

    return res.json({ results, dateFrom: from, dateTo: to, driverRate: rate });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /chase-opportunity:", err);
    return res.status(500).json({ message: err.message });
  }
});

// GET /chase-opportunity/:accountId — daily breakdown for one account
router.get("/chase-opportunity/:accountId", isAuthenticated, async (req: any, res) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const {
      dateFrom, dateTo,
      driverRate = "25",
    } = req.query as Record<string, string>;

    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const rate = parseFloat(driverRate) || 25;

    const rawRows = await db.execute(sql`
      SELECT
        rt.ride_date,
        rt.id,
        COALESCE(rt.request_datetime_local, rt.ride_datetime) AS start_dt,
        rt.duration_minutes,
        COALESCE(rt.billable_amount, rt.total_fare, 0)::numeric AS fare,
        rt.provider,
        rt.rider_name,
        rt.pickup_address,
        rt.dropoff_address,
        rt.matched_account_name AS account_name,
        rt.matched_account_number AS account_number,
        rt.city AS market
      FROM rideshare_transactions rt
      WHERE rt.is_archived = false
        AND rt.match_status = 'matched'
        AND rt.billing_status != 'excluded'
        AND rt.matched_account_id = ${accountId}
        AND rt.ride_date BETWEEN ${from} AND ${to}
      ORDER BY rt.ride_date, COALESCE(rt.request_datetime_local, rt.ride_datetime)
    `);

    type DayDetail = {
      date: string;
      rides: Array<{ id: string; startMin: number; endMin: number; fare: number; provider: string; riderName: string; startLabel: string; endLabel: string; pickup: string; dropoff: string }>;
      totalFare: number;
    };
    const days = new Map<string, DayDetail>();

    let accountName = "";
    let accountNumber = "";
    let market = "";

    for (const row of rawRows.rows as any[]) {
      accountName = row.account_name ?? accountName;
      accountNumber = row.account_number ?? accountNumber;
      market = row.market ?? market;

      const dateKey = String(row.ride_date).slice(0, 10);
      if (!days.has(dateKey)) days.set(dateKey, { date: dateKey, rides: [], totalFare: 0 });
      const day = days.get(dateKey)!;
      const startMin = toMinsSinceMidnight(row.start_dt);
      const dur = parseInt(String(row.duration_minutes || 30));
      const fare = parseFloat(String(row.fare ?? 0));
      if (startMin !== null) {
        day.rides.push({
          id: row.id,
          startMin,
          endMin: startMin + dur,
          fare,
          provider: row.provider ?? "",
          riderName: row.rider_name ?? "",
          startLabel: minsToTimeLabel(startMin),
          endLabel:   minsToTimeLabel(startMin + dur),
          pickup:  row.pickup_address ?? "",
          dropoff: row.dropoff_address ?? "",
        });
        day.totalFare += fare;
      }
    }

    const dailyBreakdown: any[] = [];
    for (const day of Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date))) {
      if (day.rides.length < 1) continue;
      const best = [4, 6, 8].map(sh => {
        const sim = simulateShift(day.rides, sh, rate);
        return { shiftHours: sh, ...sim };
      }).sort((a, b) => b.savings - a.savings)[0];

      dailyBreakdown.push({
        date: day.date,
        totalRides: day.rides.length,
        totalFare: day.totalFare,
        bestShift: best.shiftHours,
        ridesHandled: best.ridesHandled,
        rideshareTotal: best.rideshareTotal,
        driverCost: best.driverCost,
        savings: best.savings,
        windowStart: minsToTimeLabel(best.windowStartMin),
        windowEnd:   minsToTimeLabel(best.windowStartMin + best.shiftHours * 60),
        rides: day.rides.map(r => ({
          id: r.id,
          startLabel: r.startLabel,
          endLabel:   r.endLabel,
          provider: r.provider,
          riderName: r.riderName,
          fare: r.fare,
          pickup: r.pickup,
          dropoff: r.dropoff,
        })),
      });
    }

    return res.json({ accountId, accountName, accountNumber, market, dailyBreakdown, dateFrom: from, dateTo: to, driverRate: rate });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /chase-opportunity/:accountId:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Driver Utilization & Rideshare Optimization Engine
// GET /utilization        — per-account summary
// GET /utilization/:accountId — per-driver daily breakdown
// ---------------------------------------------------------------------------

/** Interval overlap check (half-open intervals) */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Subtract busy intervals from a window, returning idle sub-intervals (in ms epoch numbers). */
function subtractIntervals(
  windowStart: number,
  windowEnd: number,
  busyIntervals: Array<{ start: number; end: number }>,
  bufferMs: number
): Array<{ start: number; end: number }> {
  const sorted = [...busyIntervals]
    .filter(b => b.start < windowEnd && b.end > windowStart)
    .sort((a, b) => a.start - b.start);

  const idle: Array<{ start: number; end: number }> = [];
  let cursor = windowStart;

  for (const busy of sorted) {
    if (busy.start > cursor) {
      idle.push({ start: cursor, end: busy.start });
    }
    cursor = Math.max(cursor, busy.end + bufferMs);
  }
  if (cursor < windowEnd) {
    idle.push({ start: cursor, end: windowEnd });
  }
  return idle;
}

/** Total ms in a list of intervals */
function sumIntervals(intervals: Array<{ start: number; end: number }>): number {
  return intervals.reduce((s, iv) => s + Math.max(0, iv.end - iv.start), 0);
}

/** Rideshare spend that overlaps any idle window */
function recoverableInIdle(
  rideStart: number,
  rideEnd: number,
  idleWindows: Array<{ start: number; end: number }>,
  fare: number
): number {
  for (const w of idleWindows) {
    if (intervalsOverlap(rideStart, rideEnd, w.start, w.end)) return fare;
  }
  return 0;
}

router.get("/utilization", isAuthenticated, async (req: any, res) => {
  try {
    const {
      dateFrom, dateTo,
      market, accountId,
      bufferMinutes = "10",
    } = req.query as Record<string, string>;

    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const bufferMs = (parseInt(bufferMinutes) || 10) * 60_000;

    // ── 1. Driver busy windows from trips ───────────────────────────────────
    const tripsRows = await db.execute(sql`
      SELECT
        t.driver_id,
        t.customer_id   AS account_id,
        c.customer_name AS account_name,
        c.customer_number AS account_number,
        t.trip_date     AS move_start,
        COALESCE(t.estimated_minutes, 60) AS est_minutes
      FROM trips t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.trip_date >= ${from}::date
        AND t.trip_date <  (${to}::date + interval '1 day')
        AND t.driver_id IS NOT NULL
        AND t.customer_id IS NOT NULL
        AND t.status != 'cancelled'
      ORDER BY t.driver_id, t.trip_date
    `);

    // ── 2. Driver shift (availability) windows ──────────────────────────────
    const shiftsRows = await db.execute(sql`
      SELECT
        sa.driver_id,
        s.start_time AS shift_start,
        s.end_time   AS shift_end
      FROM shift_assignments sa
      JOIN shifts s ON sa.shift_id = s.id
      WHERE s.start_time >= ${from}::date
        AND s.start_time <  (${to}::date + interval '1 day')
        AND s.status != 'cancelled'
        AND sa.driver_id IS NOT NULL
    `);

    // ── 3. Rideshare rides per account ──────────────────────────────────────
    const rideshareRows = await db.execute(sql`
      SELECT
        rt.matched_account_id     AS account_id,
        rt.matched_account_name   AS account_name,
        rt.matched_account_number AS account_number,
        rt.city                   AS market,
        COALESCE(rt.request_datetime_local, rt.ride_datetime) AS ride_start,
        COALESCE(
          rt.dropoff_datetime_local,
          COALESCE(rt.request_datetime_local, rt.ride_datetime)
            + (COALESCE(rt.duration_minutes, 30) || ' minutes')::interval
        ) AS ride_end,
        COALESCE(rt.billable_amount, rt.total_fare, 0)::numeric AS fare
      FROM rideshare_transactions rt
      WHERE rt.is_archived = false
        AND rt.match_status = 'matched'
        AND rt.billing_status != 'excluded'
        AND rt.ride_date BETWEEN ${from} AND ${to}
        AND rt.matched_account_id IS NOT NULL
        ${accountId ? sql`AND rt.matched_account_id = ${accountId}` : sql``}
        ${market    ? sql`AND LOWER(rt.city) = LOWER(${market})` : sql``}
      ORDER BY rt.matched_account_id, COALESCE(rt.request_datetime_local, rt.ride_datetime)
    `);

    // ── Build data structures ────────────────────────────────────────────────

    // driver → list of busy windows per account
    type BusyWindow = { accountId: string; start: number; end: number };
    const driverBusy = new Map<string, BusyWindow[]>();
    // account → set of driver ids
    const accountDrivers = new Map<string, Set<string>>();
    // account metadata
    const accountMeta = new Map<string, { name: string; number: string }>();

    for (const row of tripsRows.rows as any[]) {
      const did = row.driver_id as string;
      const aid = row.account_id as string;
      if (!did || !aid) continue;

      const moveStart = new Date(row.move_start).getTime();
      const moveEnd   = moveStart + parseInt(String(row.est_minutes)) * 60_000;

      if (!driverBusy.has(did)) driverBusy.set(did, []);
      driverBusy.get(did)!.push({ accountId: aid, start: moveStart, end: moveEnd });

      if (!accountDrivers.has(aid)) accountDrivers.set(aid, new Set());
      accountDrivers.get(aid)!.add(did);

      if (!accountMeta.has(aid)) {
        accountMeta.set(aid, {
          name:   String(row.account_name ?? ""),
          number: String(row.account_number ?? ""),
        });
      }
    }

    // driver → list of shift windows
    const driverShifts = new Map<string, Array<{ start: number; end: number }>>();
    for (const row of shiftsRows.rows as any[]) {
      const did  = row.driver_id as string;
      if (!did) continue;
      const s = new Date(row.shift_start).getTime();
      const e = new Date(row.shift_end).getTime();
      if (isNaN(s) || isNaN(e)) continue;
      if (!driverShifts.has(did)) driverShifts.set(did, []);
      driverShifts.get(did)!.push({ start: s, end: e });
    }

    // account → list of rideshare rides
    type RideEvent = { start: number; end: number; fare: number };
    const accountRides = new Map<string, { meta: { name: string; number: string; market: string }; rides: RideEvent[] }>();
    for (const row of rideshareRows.rows as any[]) {
      const aid = row.account_id as string;
      if (!aid) continue;
      const s = new Date(row.ride_start).getTime();
      const e = new Date(row.ride_end).getTime();
      const fare = parseFloat(String(row.fare ?? 0));
      if (isNaN(s)) continue;
      if (!accountRides.has(aid)) {
        accountRides.set(aid, {
          meta: {
            name:   String(row.account_name ?? ""),
            number: String(row.account_number ?? ""),
            market: String(row.market ?? ""),
          },
          rides: [],
        });
        if (!accountMeta.has(aid)) accountMeta.set(aid, { name: String(row.account_name ?? ""), number: String(row.account_number ?? "") });
      }
      accountRides.get(aid)!.rides.push({ start: s, end: isNaN(e) ? s + 30*60_000 : e, fare });
    }

    // ── Per-account analysis ──────────────────────────────────────────────────
    const results: any[] = [];

    // Union all accounts that have either rideshare or driver data
    const allAccountIds = new Set([...accountRides.keys(), ...accountDrivers.keys()]);
    if (accountId) {
      // Filter to just the requested account if specified
      for (const k of allAccountIds) { if (k !== accountId) allAccountIds.delete(k); }
    }

    for (const aid of allAccountIds) {
      const rideData = accountRides.get(aid);
      const driverIds = accountDrivers.get(aid) ?? new Set<string>();
      const meta = rideData?.meta ?? { name: accountMeta.get(aid)?.name ?? "", number: accountMeta.get(aid)?.number ?? "", market: "" };

      // Skip if neither rideshare nor driver data
      if (!rideData && driverIds.size === 0) continue;

      // Build combined idle windows across all drivers serving this account
      let totalShiftMs = 0;
      let totalBusyMs  = 0;
      // All idle windows across all drivers (for overlap check with rideshare)
      const allIdleWindows: Array<{ start: number; end: number }> = [];
      const hasShiftData = [...driverIds].some(d => (driverShifts.get(d)?.length ?? 0) > 0);

      for (const did of driverIds) {
        const busyAll   = (driverBusy.get(did) ?? []);
        const busyMs    = sumIntervals(busyAll.map(b => ({ start: b.start, end: b.end })));
        totalBusyMs    += busyMs;

        const shifts = driverShifts.get(did) ?? [];
        if (shifts.length > 0) {
          for (const shift of shifts) {
            totalShiftMs += Math.max(0, shift.end - shift.start);
            const idleInShift = subtractIntervals(shift.start, shift.end, busyAll, bufferMs);
            allIdleWindows.push(...idleInShift);
          }
        } else if (busyAll.length > 0) {
          // Estimate shift from trip data: first start - 30min to last end + 30min (per day)
          // Group busy by calendar day
          const dayGroups = new Map<string, Array<{ start: number; end: number }>>();
          for (const b of busyAll) {
            const dayKey = new Date(b.start).toISOString().slice(0, 10);
            if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
            dayGroups.get(dayKey)!.push(b);
          }
          for (const dayBusy of dayGroups.values()) {
            const firstStart = Math.min(...dayBusy.map(b => b.start));
            const lastEnd    = Math.max(...dayBusy.map(b => b.end));
            const estimatedShiftStart = firstStart - 30 * 60_000;
            const estimatedShiftEnd   = lastEnd    + 30 * 60_000;
            totalShiftMs += estimatedShiftEnd - estimatedShiftStart;
            const idleInShift = subtractIntervals(estimatedShiftStart, estimatedShiftEnd, dayBusy, bufferMs);
            allIdleWindows.push(...idleInShift);
          }
        }
      }

      const totalShiftHrs = totalShiftMs / 3_600_000;
      const totalIdleMs   = sumIntervals(allIdleWindows);
      const totalIdleHrs  = totalIdleMs / 3_600_000;
      const idlePercent   = totalShiftMs > 0 ? (totalIdleMs / totalShiftMs) * 100 : 0;

      // Rideshare metrics
      const rides = rideData?.rides ?? [];
      const rideshareSpend = rides.reduce((s, r) => s + r.fare, 0);
      let recoverableSpend = 0;
      for (const ride of rides) {
        recoverableSpend += recoverableInIdle(ride.start, ride.end, allIdleWindows, ride.fare);
      }

      // Recommendation
      let recommendation: "use_existing_drivers" | "add_chase_driver" | "rideshare_appropriate";
      if (totalIdleHrs > 0.5 && recoverableSpend > 0) {
        recommendation = "use_existing_drivers";
      } else if (totalIdleHrs < 0.25 && rideshareSpend > 200) {
        recommendation = "add_chase_driver";
      } else {
        recommendation = "rideshare_appropriate";
      }

      results.push({
        accountId:       aid,
        accountNumber:   meta.number,
        accountName:     meta.name,
        market:          meta.market,
        driverCount:     driverIds.size,
        hasShiftData,
        totalDriverHours: Math.round(totalShiftHrs * 10) / 10,
        idleHours:        Math.round(totalIdleHrs * 10) / 10,
        idlePercent:      Math.round(idlePercent * 10) / 10,
        rideshareSpend:   Math.round(rideshareSpend * 100) / 100,
        recoverableSpend: Math.round(recoverableSpend * 100) / 100,
        recommendation,
      });
    }

    // Sort: recoverable spend desc, then rideshare spend desc
    results.sort((a, b) =>
      b.recoverableSpend - a.recoverableSpend ||
      b.rideshareSpend   - a.rideshareSpend
    );

    return res.json({ results, dateFrom: from, dateTo: to, bufferMinutes: parseInt(bufferMinutes) || 10 });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /utilization:", err);
    return res.status(500).json({ message: err.message });
  }
});

// GET /utilization/:accountId — per-driver daily breakdown
router.get("/utilization/:accountId", isAuthenticated, async (req: any, res) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const {
      dateFrom, dateTo,
      bufferMinutes = "10",
    } = req.query as Record<string, string>;

    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const bufferMs = (parseInt(bufferMinutes) || 10) * 60_000;

    // Driver trips for this account
    const tripsRows = await db.execute(sql`
      SELECT
        t.driver_id,
        COALESCE(u.first_name, '') AS first_name,
        COALESCE(u.last_name,  '') AS last_name,
        t.trip_date          AS move_start,
        COALESCE(t.estimated_minutes, 60) AS est_minutes,
        t.origin, t.destination, t.move_number
      FROM trips t
      JOIN drivers d ON t.driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE t.customer_id = ${accountId}
        AND t.trip_date >= ${from}::date
        AND t.trip_date <  (${to}::date + interval '1 day')
        AND t.driver_id IS NOT NULL
        AND t.status != 'cancelled'
      ORDER BY t.driver_id, t.trip_date
    `);

    // Shifts for those drivers
    const driverIdsArr = [...new Set((tripsRows.rows as any[]).map((r: any) => r.driver_id).filter(Boolean))];
    let shiftsRows: any = { rows: [] };
    if (driverIdsArr.length > 0) {
      shiftsRows = await db.execute(sql`
        SELECT sa.driver_id, s.start_time AS shift_start, s.end_time AS shift_end
        FROM shift_assignments sa
        JOIN shifts s ON sa.shift_id = s.id
        WHERE sa.driver_id = ANY(${driverIdsArr})
          AND s.start_time >= ${from}::date
          AND s.start_time <  (${to}::date + interval '1 day')
          AND s.status != 'cancelled'
      `);
    }

    // Rideshare for this account
    const rideshareRows = await db.execute(sql`
      SELECT
        COALESCE(rt.request_datetime_local, rt.ride_datetime) AS ride_start,
        COALESCE(
          rt.dropoff_datetime_local,
          COALESCE(rt.request_datetime_local, rt.ride_datetime)
            + (COALESCE(rt.duration_minutes, 30) || ' minutes')::interval
        ) AS ride_end,
        COALESCE(rt.billable_amount, rt.total_fare, 0)::numeric AS fare,
        rt.provider, rt.rider_name,
        rt.matched_account_name  AS account_name,
        rt.matched_account_number AS account_number,
        rt.city AS market, rt.ride_date
      FROM rideshare_transactions rt
      WHERE rt.matched_account_id = ${accountId}
        AND rt.is_archived = false
        AND rt.match_status = 'matched'
        AND rt.billing_status != 'excluded'
        AND rt.ride_date BETWEEN ${from} AND ${to}
      ORDER BY COALESCE(rt.request_datetime_local, rt.ride_datetime)
    `);

    // Build per-driver per-day analysis
    type DriverDay = {
      driverId: string; driverName: string; date: string;
      shiftStart: number | null; shiftEnd: number | null;
      moves: Array<{ start: number; end: number; from: string; to: string; moveNumber: string }>;
      idleWindows: Array<{ start: number; end: number }>;
      shiftHrs: number; idleHrs: number;
    };

    const driverMoves = new Map<string, Array<{ start: number; end: number; from: string; to: string; moveNumber: string }>>();
    const driverNames = new Map<string, string>();
    for (const row of tripsRows.rows as any[]) {
      const did = row.driver_id as string;
      const s = new Date(row.move_start).getTime();
      const e = s + parseInt(String(row.est_minutes)) * 60_000;
      if (!driverMoves.has(did)) driverMoves.set(did, []);
      driverMoves.get(did)!.push({ start: s, end: e, from: row.origin ?? "", to: row.destination ?? "", moveNumber: row.move_number ?? "" });
      driverNames.set(did, `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim());
    }

    const driverShiftsMap = new Map<string, Array<{ start: number; end: number }>>();
    for (const row of shiftsRows.rows as any[]) {
      const did = row.driver_id as string;
      const s = new Date(row.shift_start).getTime();
      const e = new Date(row.shift_end).getTime();
      if (isNaN(s) || isNaN(e)) continue;
      if (!driverShiftsMap.has(did)) driverShiftsMap.set(did, []);
      driverShiftsMap.get(did)!.push({ start: s, end: e });
    }

    const driverDays: DriverDay[] = [];
    for (const [did, moves] of driverMoves) {
      const shifts = driverShiftsMap.get(did) ?? [];
      const name = driverNames.get(did) ?? did;

      // Group moves by day
      const dayGroups = new Map<string, typeof moves>();
      for (const m of moves) {
        const dayKey = new Date(m.start).toISOString().slice(0, 10);
        if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
        dayGroups.get(dayKey)!.push(m);
      }

      for (const [dateKey, dayMoves] of dayGroups) {
        // Find shift covering this day
        const dayShifts = shifts.filter(s => new Date(s.start).toISOString().slice(0, 10) === dateKey);
        let shiftStart: number | null = null;
        let shiftEnd: number | null   = null;
        let shiftHrs = 0;
        const idleWindows: Array<{ start: number; end: number }> = [];

        if (dayShifts.length > 0) {
          shiftStart = Math.min(...dayShifts.map(s => s.start));
          shiftEnd   = Math.max(...dayShifts.map(s => s.end));
          shiftHrs   = (shiftEnd - shiftStart) / 3_600_000;
          for (const s of dayShifts) {
            idleWindows.push(...subtractIntervals(s.start, s.end, dayMoves, bufferMs));
          }
        } else {
          // Estimate from moves
          shiftStart = Math.min(...dayMoves.map(m => m.start)) - 30 * 60_000;
          shiftEnd   = Math.max(...dayMoves.map(m => m.end))   + 30 * 60_000;
          shiftHrs   = (shiftEnd - shiftStart) / 3_600_000;
          idleWindows.push(...subtractIntervals(shiftStart, shiftEnd, dayMoves, bufferMs));
        }

        const idleHrs = sumIntervals(idleWindows) / 3_600_000;
        driverDays.push({ driverId: did, driverName: name, date: dateKey, shiftStart, shiftEnd, moves: dayMoves, idleWindows, shiftHrs, idleHrs });
      }
    }

    // Tag rideshare rides with recoverable flag
    const ridesWithRecoverable = (rideshareRows.rows as any[]).map((r: any) => {
      const rideStart = new Date(r.ride_start).getTime();
      const rideEnd   = new Date(r.ride_end).getTime();
      const fare = parseFloat(String(r.fare ?? 0));
      const isRecoverable = driverDays.some(dd =>
        dd.idleWindows.some(w => intervalsOverlap(rideStart, isNaN(rideEnd) ? rideStart + 30*60_000 : rideEnd, w.start, w.end))
      );
      return {
        date: String(r.ride_date).slice(0, 10),
        provider: r.provider ?? "",
        riderName: r.rider_name ?? "",
        fare,
        isRecoverable,
        rideStartLabel: new Date(r.ride_start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
        rideEndLabel: isNaN(new Date(r.ride_end).getTime()) ? "" : new Date(r.ride_end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
      };
    });

    // Aggregate
    const totalDriverHrs = driverDays.reduce((s, d) => s + d.shiftHrs, 0);
    const totalIdleHrs   = driverDays.reduce((s, d) => s + d.idleHrs, 0);
    const totalRideSpend = ridesWithRecoverable.reduce((s, r) => s + r.fare, 0);
    const recoverableSpend = ridesWithRecoverable.filter(r => r.isRecoverable).reduce((s, r) => s + r.fare, 0);

    // Per-driver summary
    const byDriver: any[] = [];
    for (const did of driverMoves.keys()) {
      const days = driverDays.filter(d => d.driverId === did);
      byDriver.push({
        driverId:   did,
        driverName: driverNames.get(did) ?? did,
        days: days.map(d => ({
          date: d.date,
          shiftHrs:    Math.round(d.shiftHrs * 10) / 10,
          idleHrs:     Math.round(d.idleHrs  * 10) / 10,
          moveCount:   d.moves.length,
          moves: d.moves.map(m => ({
            from: m.from, to: m.to, moveNumber: m.moveNumber,
            startLabel: new Date(m.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
            endLabel:   new Date(m.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
          })),
          idleWindows: d.idleWindows.map(w => ({
            startLabel: new Date(w.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
            endLabel:   new Date(w.end).toLocaleTimeString("en-US",   { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
            durationMins: Math.round((w.end - w.start) / 60_000),
          })),
        })),
      });
    }

    const accountName  = (rideshareRows.rows[0] as any)?.account_name  ?? accountMeta?.get?.(accountId)?.name  ?? "";
    const accountNumber = (rideshareRows.rows[0] as any)?.account_number ?? accountMeta?.get?.(accountId)?.number ?? "";
    const mkt = (rideshareRows.rows[0] as any)?.market ?? "";

    return res.json({
      accountId, accountName, accountNumber, market: mkt,
      dateFrom: from, dateTo: to, bufferMinutes: parseInt(bufferMinutes) || 10,
      summary: {
        totalDriverHours:  Math.round(totalDriverHrs * 10) / 10,
        totalIdleHours:    Math.round(totalIdleHrs * 10) / 10,
        idlePercent:       totalDriverHrs > 0 ? Math.round((totalIdleHrs / totalDriverHrs) * 1000) / 10 : 0,
        rideshareSpend:    Math.round(totalRideSpend * 100) / 100,
        recoverableSpend:  Math.round(recoverableSpend * 100) / 100,
      },
      byDriver,
      rides: ridesWithRecoverable,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /utilization/:accountId:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Time-of-Day Analysis
// GET /time-of-day  — rideshare spend + driver activity by hour (0-23)
// ---------------------------------------------------------------------------
router.get("/time-of-day", isAuthenticated, async (req: any, res) => {
  try {
    const { dateFrom, dateTo, market, accountId } = req.query as Record<string, string>;
    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);

    // Rideshare by hour
    const rideHours = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM COALESCE(request_datetime_local, ride_datetime, dropoff_datetime_local)) AS hour_of_day,
        COUNT(*)::int                                           AS ride_count,
        SUM(COALESCE(billable_amount, total_fare, 0))::numeric AS spend
      FROM rideshare_transactions
      WHERE is_archived = false
        AND match_status = 'matched'
        AND billing_status != 'excluded'
        AND ride_date BETWEEN ${from} AND ${to}
        ${accountId ? sql`AND matched_account_id = ${accountId}` : sql``}
        ${market    ? sql`AND LOWER(city) = LOWER(${market})`   : sql``}
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `);

    // Driver busy windows by hour (from trips)
    const tripHours = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM trip_date) AS hour_of_day,
        COUNT(*)::int                AS move_count,
        SUM(COALESCE(estimated_minutes, 60))::int AS busy_minutes
      FROM trips
      WHERE status != 'cancelled'
        AND driver_id IS NOT NULL
        AND trip_date >= ${from}::date
        AND trip_date <  (${to}::date + interval '1 day')
        ${accountId ? sql`AND customer_id = ${accountId}` : sql``}
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `);

    // Shift coverage by hour (from shifts + assignments)
    const shiftHours = await db.execute(sql`
      WITH shift_hours AS (
        SELECT generate_series(
          date_trunc('hour', s.start_time),
          date_trunc('hour', s.end_time),
          '1 hour'::interval
        ) AS hour_ts,
        EXTRACT(HOUR FROM s.start_time) AS start_h,
        EXTRACT(HOUR FROM s.end_time)   AS end_h
        FROM shift_assignments sa
        JOIN shifts s ON sa.shift_id = s.id
        WHERE s.start_time >= ${from}::date
          AND s.start_time <  (${to}::date + interval '1 day')
          AND s.status != 'cancelled'
      )
      SELECT
        EXTRACT(HOUR FROM hour_ts)::int AS hour_of_day,
        COUNT(*)::int                   AS coverage_count
      FROM shift_hours
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `);

    // Build 24-hour array
    const rideMap   = new Map<number, { count: number; spend: number }>();
    const tripMap   = new Map<number, { count: number; busyMins: number }>();
    const shiftMap  = new Map<number, number>();

    for (const r of rideHours.rows  as any[]) rideMap.set(Number(r.hour_of_day), { count: Number(r.ride_count), spend: Number(r.spend) });
    for (const r of tripHours.rows  as any[]) tripMap.set(Number(r.hour_of_day), { count: Number(r.move_count), busyMins: Number(r.busy_minutes) });
    for (const r of shiftHours.rows as any[]) shiftMap.set(Number(r.hour_of_day), Number(r.coverage_count));

    const hourly = Array.from({ length: 24 }, (_, h) => {
      const rs   = rideMap.get(h)  ?? { count: 0, spend: 0 };
      const tr   = tripMap.get(h)  ?? { count: 0, busyMins: 0 };
      const shCov = shiftMap.get(h) ?? 0;
      // Estimated idle minutes = shift coverage hours - busy minutes (rough)
      const estimatedIdleMins = Math.max(0, shCov * 60 - tr.busyMins);
      return {
        hour: h,
        label: h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`,
        rideshareCount:      rs.count,
        rideshareSpend:      Math.round(rs.spend * 100) / 100,
        driverMoveCount:     tr.count,
        driverBusyMinutes:   tr.busyMins,
        shiftCoverageCount:  shCov,
        estimatedIdleMinutes: estimatedIdleMins,
        hasOverlap: rs.count > 0 && estimatedIdleMins > 0,
      };
    });

    return res.json({ hourly, dateFrom: from, dateTo: to });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /time-of-day:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Shift Simulation — per-account detailed shift comparison
// GET /shift-simulation/:accountId
// ---------------------------------------------------------------------------
router.get("/shift-simulation/:accountId", isAuthenticated, async (req: any, res) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { dateFrom, dateTo, driverRate = "25" } = req.query as Record<string, string>;
    const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
    const from = dateFrom || days90ago.toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const rate = parseFloat(driverRate) || 25;

    const rideshareRows = await db.execute(sql`
      SELECT
        rt.ride_date,
        COALESCE(rt.request_datetime_local, rt.ride_datetime) AS ride_start,
        COALESCE(rt.duration_minutes, 30) AS duration_minutes,
        COALESCE(rt.billable_amount, rt.total_fare, 0)::numeric AS fare,
        rt.matched_account_name AS account_name,
        rt.matched_account_number AS account_number,
        rt.city AS market
      FROM rideshare_transactions rt
      WHERE rt.matched_account_id = ${accountId}
        AND rt.is_archived = false
        AND rt.match_status = 'matched'
        AND rt.billing_status != 'excluded'
        AND rt.ride_date BETWEEN ${from} AND ${to}
      ORDER BY rt.ride_date, COALESCE(rt.request_datetime_local, rt.ride_datetime)
    `);

    if (rideshareRows.rows.length === 0) {
      return res.json({ accountId, simulations: [], totalRideshareSpend: 0, dateFrom: from, dateTo: to });
    }

    // Group by day
    type DayRides = SimRide[];
    const dayMap = new Map<string, DayRides>();
    let accountName = ""; let accountNumber = ""; let mkt = "";

    for (const row of rideshareRows.rows as any[]) {
      const dateKey = String(row.ride_date).slice(0, 10);
      const s = new Date(row.ride_start).getTime();
      const dur = parseInt(String(row.duration_minutes));
      const fare = parseFloat(String(row.fare ?? 0));
      if (isNaN(s)) continue;
      accountName = row.account_name ?? accountName;
      accountNumber = row.account_number ?? accountNumber;
      mkt = row.market ?? mkt;
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
      const startMin = new Date(s).getUTCHours() * 60 + new Date(s).getUTCMinutes();
      dayMap.get(dateKey)!.push({ id: dateKey, startMin, endMin: startMin + dur, fare });
    }

    const totalRideshareSpend = rideshareRows.rows.reduce((s, r: any) => s + parseFloat(String(r.fare ?? 0)), 0);
    const dayCount = dayMap.size;

    // Simulate all 3 shift lengths
    const simulations = [4, 6, 8].map(shiftHours => {
      let totalReplaceableRides = 0;
      let totalRideshareReplaced = 0;
      const windowStarts: number[] = [];

      // Time-of-day buckets for best window
      const periodLabels: Record<string, { start: number; end: number }> = {
        "Morning (6 AM – 12 PM)": { start: 6 * 60, end: 12 * 60 },
        "Midday (10 AM – 4 PM)":  { start: 10 * 60, end: 16 * 60 },
        "Afternoon (12 PM – 6 PM)":{ start: 12 * 60, end: 18 * 60 },
        "Evening (4 PM – 10 PM)": { start: 16 * 60, end: 22 * 60 },
        "Full Day (8 AM – 5 PM)": { start: 8 * 60, end: 17 * 60 },
      };

      for (const rides of dayMap.values()) {
        if (!rides.length) continue;
        const sim = simulateShift(rides, shiftHours, rate);
        totalReplaceableRides  += sim.ridesHandled;
        totalRideshareReplaced += sim.rideshareTotal;
        windowStarts.push(sim.windowStartMin);
      }

      const avgReplaceableRides  = dayCount > 0 ? totalReplaceableRides / dayCount  : 0;
      const avgRideshareReplaced = dayCount > 0 ? totalRideshareReplaced / dayCount : 0;
      const driverCostPerDay     = rate * shiftHours;
      const avgSavingsPerDay     = avgRideshareReplaced - driverCostPerDay;

      // Mode window start
      const modeStart = windowStarts.length > 0
        ? windowStarts.reduce((a, b, _, arr) => arr.filter(x => x === a).length >= arr.filter(x => x === b).length ? a : b, windowStarts[0])
        : 8 * 60;

      // Label the window with nearest named period
      let bestPeriodLabel = `${minsToTimeLabel(modeStart)} – ${minsToTimeLabel(modeStart + shiftHours * 60)}`;
      for (const [label, { start, end }] of Object.entries(periodLabels)) {
        if (Math.abs(start - modeStart) < 90 && (end - start) >= shiftHours * 60) {
          bestPeriodLabel = label; break;
        }
      }

      return {
        shiftHours,
        windowStart:          minsToTimeLabel(modeStart),
        windowEnd:            minsToTimeLabel(modeStart + shiftHours * 60),
        timeWindowLabel:      bestPeriodLabel,
        driverCostPerDay:     Math.round(driverCostPerDay * 100) / 100,
        avgReplaceableRides:  Math.round(avgReplaceableRides * 10) / 10,
        avgRideshareReplaced: Math.round(avgRideshareReplaced * 100) / 100,
        avgSavingsPerDay:     Math.round(avgSavingsPerDay * 100) / 100,
        weeklyProjection:     Math.round(avgSavingsPerDay * 5 * 100) / 100,
        totalReplaceableRides,
        totalRideshareReplaced: Math.round(totalRideshareReplaced * 100) / 100,
        isPositive:           avgSavingsPerDay > 0,
      };
    });

    return res.json({
      accountId, accountName, accountNumber, market: mkt,
      simulations,
      totalRideshareSpend: Math.round(totalRideshareSpend * 100) / 100,
      dayCount, driverRate: rate,
      dateFrom: from, dateTo: to,
    });
  } catch (err: any) {
    console.error("[rideshareRoutes] GET /shift-simulation/:accountId:", err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
