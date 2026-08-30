/**
 * Import Pipeline — validation engine and entity resolution.
 *
 * Extracted so this layer can be consumed by:
 *   • server/routes/dataImportsRoutes.ts  (file-upload path — unchanged)
 *   • server/imports/orchestrator.ts      (SQL / HTTP / future sync paths)
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  No adapter-specific code lives here.                            │
 * │  All functions operate on Record<string, unknown>[] rows         │
 * │  regardless of whether they came from a spreadsheet, SQL Server, │
 * │  an HTTP endpoint, or any future source.                         │
 * └──────────────────────────────────────────────────────────────────┘
 */
import { db } from "../db";
import {
  dataImportBatches,
  dataImportStagedRows,
  moveReportEntries,
  driverReturnEntries,
  importEntityMappings,
  drivers,
  users,
  customers,
} from "../../shared/schema";
import { eq, and, ilike, sql, inArray } from "drizzle-orm";

// ── Shared type utilities ─────────────────────────────────────────────────────

/** Convert Excel serial date number → JS Date */
export function excelSerialToDate(serial: unknown): Date | null {
  if (serial instanceof Date) return serial;
  const n = typeof serial === "number" ? serial : parseFloat(String(serial));
  if (isNaN(n) || n < 1) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

export function toDecimal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n.toFixed(2);
}

export function toInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return isNaN(n) ? null : n;
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (!l1 || !l2) return 0;
  const d = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const s1m = new Array(l1).fill(false);
  const s2m = new Array(l2).fill(false);
  let m = 0;
  for (let i = 0; i < l1; i++) {
    for (let j = Math.max(0, i - d); j <= Math.min(l2 - 1, i + d); j++) {
      if (!s2m[j] && s1[i] === s2[j]) { s1m[i] = s2m[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  return (m / l1 + m / l2 + (m - t / 2) / m) / 3;
}

export function computeNameConfidence(source: string, target: string): number {
  const s = source.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const t = target.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (!s || !t) return 0;
  return Math.round(jaro(s, t) * 100);
}

export type ConfidenceTier = "exact" | "high" | "medium" | "low" | "unknown";

export function tierFromScore(score: number): ConfidenceTier {
  if (score >= 99) return "exact";
  if (score >= 90) return "high";
  if (score >= 75) return "medium";
  if (score >  0)  return "low";
  return "unknown";
}

// ── Validation interfaces ─────────────────────────────────────────────────────

export interface RowError {
  field: string;
  message: string;
  severity: "error" | "warning";
  category: "duplicate" | "account" | "driver" | "date" | "financial" | "general";
}

export interface EntityMatch {
  status: "auto_match" | "needs_review" | "unknown";
  resolvedId: string | null;
  resolvedName: string | null;
  confidence: "exact" | "fuzzy" | null;
  confidenceScore: number | null;   // 0–100 numeric score
  confidenceTier: ConfidenceTier | null;
  sourceName?: string;  // Original name from the import file
}

export interface MappedData {
  accountMatch?: EntityMatch;
  driverMatch?: EntityMatch;
  duplicateInFile?: boolean;
  duplicateInDb?: boolean;
}

export interface ValidationCategories {
  duplicates: { withinFile: number; crossBatch: number; periodAlreadyImported: boolean; conflictBatchId?: string };
  account:    {
    exact: number; high: number; medium: number; low: number; unknown: number;
    // Backward-compat aliases
    autoMatch: number;   // = exact + high
    needsReview: number; // = medium + low
  };
  driver:     {
    exact: number; high: number; medium: number; low: number; unknown: number;
    // Backward-compat aliases
    autoMatch: number;   // = exact + high
    needsReview: number; // = medium + low
  };
  dates:      { missing: number; invalid: number; future: number };
  financial:  { negativeValues: number; missingTotals: number; discrepancies: number };
}

export interface FullValidationResult {
  totalRows:   number;
  validRows:   number;
  warningRows: number;
  errorRows:   number;
  categories:  ValidationCategories;
  errors:      Array<{ row: number; errors: RowError[] }>;
}

// ── Per-row field checks (synchronous, no DB) ─────────────────────────────────

export function validateRequiredFields(raw: Record<string, unknown>, importType: string): RowError[] {
  const errors: RowError[] = [];
  if (importType === "move_report") {
    if (!String(raw["TripId"] ?? "").trim())
      errors.push({ field: "TripId", message: "TripId is required", severity: "error", category: "general" });
    if (!raw["Dealer"] || String(raw["Dealer"]).trim() === "")
      errors.push({ field: "Dealer", message: "Dealer name is missing", severity: "warning", category: "account" });
    if (!raw["Driver"] || String(raw["Driver"]).trim() === "")
      errors.push({ field: "Driver", message: "Driver name is missing", severity: "warning", category: "driver" });
  } else if (importType === "driver_return") {
    if (!raw["RedCapId"] && !String(raw["TripId"] ?? "").trim())
      errors.push({ field: "RedCapId/TripId", message: "RedCapId or TripId is required", severity: "error", category: "general" });
    if (!raw["DriverName"] || String(raw["DriverName"]).trim() === "")
      errors.push({ field: "DriverName", message: "Driver name is missing", severity: "warning", category: "driver" });
    if (!raw["DealerName"] || String(raw["DealerName"]).trim() === "")
      errors.push({ field: "DealerName", message: "Dealer name is missing", severity: "warning", category: "account" });
  } else if (importType === "uber_transaction") {
    const tripId = String(raw["Trip/Eats ID"] ?? "").trim();
    if (!tripId || tripId === "--")
      errors.push({ field: "Trip/Eats ID", message: "Trip/Eats ID is required", severity: "error", category: "general" });
    if (!String(raw["Transaction Type"] ?? "").trim())
      errors.push({ field: "Transaction Type", message: "Transaction Type is required", severity: "error", category: "general" });
    if (!String(raw["Transaction Timestamp (UTC)"] ?? "").trim() || String(raw["Transaction Timestamp (UTC)"]) === "--")
      errors.push({ field: "Transaction Timestamp (UTC)", message: "Transaction Timestamp is required", severity: "error", category: "date" });
    if (raw["Transaction Amount USD"] === "" || raw["Transaction Amount USD"] === undefined)
      errors.push({ field: "Transaction Amount USD", message: "Transaction Amount is required", severity: "error", category: "financial" });
  }
  return errors;
}

export function validateDates(raw: Record<string, unknown>, importType: string, today: Date): RowError[] {
  const errors: RowError[] = [];

  if (importType === "move_report") {
    const dateVal = raw["Date"];
    if (dateVal === undefined || dateVal === null || dateVal === "") {
      errors.push({ field: "Date", message: "Date is missing", severity: "error", category: "date" });
    } else {
      const parsed = excelSerialToDate(dateVal);
      if (!parsed) errors.push({ field: "Date", message: `Invalid date format: ${dateVal}`, severity: "error", category: "date" });
      else if (parsed > today) errors.push({ field: "Date", message: `Future date: ${parsed.toISOString().slice(0, 10)}`, severity: "warning", category: "date" });
    }
  } else if (importType === "driver_return") {
    const dateVal = raw["TripDate"];
    if (dateVal === undefined || dateVal === null || dateVal === "") {
      errors.push({ field: "TripDate", message: "TripDate is missing", severity: "error", category: "date" });
    } else {
      const parsed = excelSerialToDate(dateVal);
      if (!parsed) errors.push({ field: "TripDate", message: `Invalid date format: ${dateVal}`, severity: "error", category: "date" });
      else if (parsed > today) errors.push({ field: "TripDate", message: `Future date: ${parsed.toISOString().slice(0, 10)}`, severity: "warning", category: "date" });
    }
  } else if (importType === "uber_transaction") {
    const rd = String(raw["Request Date (UTC)"] ?? "").trim();
    if (!rd || rd === "--") {
      errors.push({ field: "Request Date (UTC)", message: "Request Date is missing", severity: "error", category: "date" });
    } else {
      const [m, d, y] = rd.split("/");
      if (!m || !d || !y || isNaN(Date.parse(`${y}-${m}-${d}`))) {
        errors.push({ field: "Request Date (UTC)", message: `Invalid date format: ${rd}`, severity: "error", category: "date" });
      } else {
        const parsed = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
        if (parsed > today) errors.push({ field: "Request Date (UTC)", message: `Future date: ${rd}`, severity: "warning", category: "date" });
      }
    }
  }
  return errors;
}

export function validateFinancials(raw: Record<string, unknown>, importType: string): RowError[] {
  const errors: RowError[] = [];

  if (importType === "move_report") {
    const payTotal = parseFloat(String(raw["Pay_Total"] ?? ""));
    const chgTotal = parseFloat(String(raw["Chg_Total"] ?? ""));
    const netTotal = parseFloat(String(raw["NetTotal"] ?? ""));

    if (raw["Pay_Total"] === "" || raw["Pay_Total"] === undefined || raw["Pay_Total"] === null)
      errors.push({ field: "Pay_Total", message: "Pay_Total is missing", severity: "warning", category: "financial" });
    else if (!isNaN(payTotal) && payTotal < 0)
      errors.push({ field: "Pay_Total", message: `Negative pay total: $${payTotal.toFixed(2)}`, severity: "warning", category: "financial" });

    if (raw["Chg_Total"] === "" || raw["Chg_Total"] === undefined || raw["Chg_Total"] === null)
      errors.push({ field: "Chg_Total", message: "Chg_Total is missing", severity: "warning", category: "financial" });
    else if (!isNaN(chgTotal) && chgTotal < 0)
      errors.push({ field: "Chg_Total", message: `Negative charge total: $${chgTotal.toFixed(2)}`, severity: "warning", category: "financial" });

    if (!isNaN(payTotal) && !isNaN(chgTotal) && !isNaN(netTotal)) {
      const expected = payTotal - chgTotal;
      if (Math.abs(netTotal - expected) > 0.02)
        errors.push({ field: "NetTotal", message: `Pay/charge discrepancy: Pay=${payTotal.toFixed(2)} Chg=${chgTotal.toFixed(2)} Net=${netTotal.toFixed(2)} (expected ${expected.toFixed(2)})`, severity: "warning", category: "financial" });
    }
  } else if (importType === "driver_return") {
    const baseCost = parseFloat(String(raw["BaseCost"] ?? ""));
    const customerBilled = parseFloat(String(raw["CustomerBilled"] ?? ""));
    if (raw["BaseCost"] === "" || raw["BaseCost"] === undefined)
      errors.push({ field: "BaseCost", message: "BaseCost is missing", severity: "warning", category: "financial" });
    else if (!isNaN(baseCost) && baseCost < 0)
      errors.push({ field: "BaseCost", message: `Negative base cost: $${baseCost.toFixed(2)}`, severity: "warning", category: "financial" });
    if (!isNaN(customerBilled) && customerBilled < 0)
      errors.push({ field: "CustomerBilled", message: `Negative customer billed: $${customerBilled.toFixed(2)}`, severity: "warning", category: "financial" });
  } else if (importType === "uber_transaction") {
    const amount = parseFloat(String(raw["Transaction Amount USD"] ?? ""));
    const txType = String(raw["Transaction Type"] ?? "");
    if (!isNaN(amount) && amount < 0 && txType !== "Payment" && txType !== "Adjustment")
      errors.push({ field: "Transaction Amount USD", message: `Unexpected negative amount: $${amount.toFixed(2)}`, severity: "warning", category: "financial" });
  }
  return errors;
}

// ── Bulk Entity Resolution ────────────────────────────────────────────────────

export async function resolveAccountsBulk(uniqueNames: string[]): Promise<Map<string, EntityMatch>> {
  const result = new Map<string, EntityMatch>();
  if (uniqueNames.length === 0) return result;
  const lowerNames = uniqueNames.map(n => n.trim().toLowerCase());

  // 1. Entity mappings cache
  const cached = await db.select({
    sourceName: importEntityMappings.sourceName,
    mappedEntityId: importEntityMappings.mappedEntityId,
    mappedEntityName: importEntityMappings.mappedEntityName,
    confidence: importEntityMappings.confidence,
  }).from(importEntityMappings).where(and(
    eq(importEntityMappings.entityType, "account"),
    eq(importEntityMappings.isActive, true),
    inArray(sql`lower(${importEntityMappings.sourceName})`, lowerNames)
  ));

  const cachedSet = new Set<string>();
  for (const m of cached) {
    const key = m.sourceName.trim().toLowerCase();
    const isExact = m.confidence === "exact";
    const score = isExact ? 100 : computeNameConfidence(m.sourceName, m.mappedEntityName ?? "");
    const tier: ConfidenceTier = isExact ? "exact" : tierFromScore(score);
    result.set(key, {
      status: isExact ? "auto_match" : "needs_review",
      resolvedId: m.mappedEntityId,
      resolvedName: m.mappedEntityName,
      confidence: isExact ? "exact" : "fuzzy",
      confidenceScore: score,
      confidenceTier: tier,
    });
    cachedSet.add(key);
  }

  // 2. For misses: load all customers, in-memory match
  const missed = lowerNames.filter(n => !cachedSet.has(n));
  if (missed.length > 0) {
    const allCustomers = await db.select({ id: customers.id, customerName: customers.customerName }).from(customers).limit(10000);
    for (const lowerName of missed) {
      const orig = uniqueNames.find(n => n.trim().toLowerCase() === lowerName) ?? lowerName;
      let match: EntityMatch = { status: "unknown", resolvedId: null, resolvedName: null, confidence: null, confidenceScore: 0, confidenceTier: "unknown", sourceName: orig };
      const exact = allCustomers.find(c => (c.customerName ?? "").toLowerCase() === lowerName);
      if (exact) {
        match = { status: "auto_match", resolvedId: exact.id, resolvedName: exact.customerName, confidence: "exact", confidenceScore: 100, confidenceTier: "exact", sourceName: orig };
      } else {
        const fuzzy = allCustomers.find(c => { const cn = (c.customerName ?? "").toLowerCase(); return cn.length > 3 && (cn.includes(lowerName) || lowerName.includes(cn)); });
        if (fuzzy) {
          const score = computeNameConfidence(orig, fuzzy.customerName ?? "");
          const tier = tierFromScore(score);
          match = { status: "needs_review", resolvedId: fuzzy.id, resolvedName: fuzzy.customerName, confidence: "fuzzy", confidenceScore: score, confidenceTier: tier, sourceName: orig };
          db.insert(importEntityMappings).values({ entityType: "account", sourceName: orig, mappedEntityId: fuzzy.id, mappedEntityName: fuzzy.customerName ?? null, confidence: "fuzzy" } as any)
            .onConflictDoNothing()
            .catch((e: any) => console.warn("[EntityMapping] account insert failed:", e?.message ?? e));
        }
      }
      result.set(lowerName, match);
    }
  }
  return result;
}

export async function resolveDriversBulk(uniqueNames: string[]): Promise<Map<string, EntityMatch>> {
  const result = new Map<string, EntityMatch>();
  if (uniqueNames.length === 0) return result;
  const lowerNames = uniqueNames.map(n => n.trim().toLowerCase());

  // 1. Entity mappings cache
  const cached = await db.select({
    sourceName: importEntityMappings.sourceName,
    mappedEntityId: importEntityMappings.mappedEntityId,
    mappedEntityName: importEntityMappings.mappedEntityName,
    confidence: importEntityMappings.confidence,
  }).from(importEntityMappings).where(and(
    eq(importEntityMappings.entityType, "driver"),
    eq(importEntityMappings.isActive, true),
    inArray(sql`lower(${importEntityMappings.sourceName})`, lowerNames)
  ));

  const cachedSet = new Set<string>();
  for (const m of cached) {
    const key = m.sourceName.trim().toLowerCase();
    const isExact = m.confidence === "exact" || m.confidence === "manual";
    const score = isExact ? 100 : computeNameConfidence(m.sourceName, m.mappedEntityName ?? "");
    const tier: ConfidenceTier = isExact ? "exact" : tierFromScore(score);
    result.set(key, {
      status: isExact ? "auto_match" : "needs_review",
      resolvedId: m.mappedEntityId,
      resolvedName: m.mappedEntityName,
      confidence: isExact ? "exact" : "fuzzy",
      confidenceScore: score,
      confidenceTier: tier,
    });
    cachedSet.add(key);
  }

  // 2. For misses: batch query by last name, then JS-side full match
  const missed = lowerNames.filter(n => !cachedSet.has(n));
  if (missed.length > 0) {
    const lastNames = [...new Set(missed.map(n => { const p = n.split(/\s+/); return p[p.length - 1]; }).filter(Boolean))];
    const relevantDrivers = lastNames.length > 0
      ? await db.select({ id: drivers.id, firstName: users.firstName, lastName: users.lastName })
          .from(drivers)
          .leftJoin(users, eq(drivers.userId, users.id))
          .where(inArray(sql`lower(${users.lastName})`, lastNames))
          .limit(5000)
      : [];

    for (const lowerName of missed) {
      const orig = uniqueNames.find(n => n.trim().toLowerCase() === lowerName) ?? lowerName;
      const parts = lowerName.split(/\s+/);
      const first = parts[0] ?? "";
      const last = parts[parts.length - 1] ?? "";
      let match: EntityMatch = { status: "unknown", resolvedId: null, resolvedName: null, confidence: null, confidenceScore: 0, confidenceTier: "unknown", sourceName: orig };

      // Exact: first AND last match exactly
      const exact = relevantDrivers.find(d =>
        (d.firstName ?? "").toLowerCase() === first && (d.lastName ?? "").toLowerCase() === last
      );
      if (exact) {
        const fullName = `${exact.firstName ?? ""} ${exact.lastName ?? ""}`.trim();
        match = { status: "auto_match", resolvedId: exact.id, resolvedName: fullName, confidence: "exact", confidenceScore: 100, confidenceTier: "exact", sourceName: orig };
      } else {
        // Find the best-scoring candidate among same-last-name drivers
        const candidates = relevantDrivers.filter(d => (d.lastName ?? "").toLowerCase() === last);
        let bestScore = 0;
        let bestDriver: typeof relevantDrivers[0] | null = null;
        for (const d of candidates) {
          const fullName = `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim();
          const s = computeNameConfidence(orig, fullName);
          if (s > bestScore) { bestScore = s; bestDriver = d; }
        }

        // Only accept fuzzy matches where first initial also aligns (avoids false positives)
        if (bestDriver && bestScore >= 60 && first.length > 0 &&
            (bestDriver.firstName ?? "").toLowerCase().startsWith(first[0])) {
          const fullName = `${bestDriver.firstName ?? ""} ${bestDriver.lastName ?? ""}`.trim();
          const tier = tierFromScore(bestScore);
          match = { status: "needs_review", resolvedId: bestDriver.id, resolvedName: fullName, confidence: "fuzzy", confidenceScore: bestScore, confidenceTier: tier, sourceName: orig };
          db.insert(importEntityMappings).values({ entityType: "driver", sourceName: orig, mappedEntityId: bestDriver.id, mappedEntityName: fullName, confidence: "fuzzy" } as any)
            .onConflictDoNothing()
            .catch((e: any) => console.warn("[EntityMapping] driver insert failed:", e?.message ?? e));
        }
      }
      result.set(lowerName, match);
    }
  }
  return result;
}

// ── Full Validation Pipeline ──────────────────────────────────────────────────

export async function runValidation(
  batchId: string,
  rows: Record<string, unknown>[],
  importType: string,
  sourceSystemKey: string = "redcap",
  periodId: string | null = null,
  batchMode: string = "supplement",
  skipExisting = false,
): Promise<FullValidationResult> {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const categories: ValidationCategories = {
    duplicates: { withinFile: 0, crossBatch: 0, periodAlreadyImported: false },
    account:    { exact: 0, high: 0, medium: 0, low: 0, unknown: 0, autoMatch: 0, needsReview: 0 },
    driver:     { exact: 0, high: 0, medium: 0, low: 0, unknown: 0, autoMatch: 0, needsReview: 0 },
    dates:      { missing: 0, invalid: 0, future: 0 },
    financial:  { negativeValues: 0, missingTotals: 0, discrepancies: 0 },
  };

  // ── 1. Period conflict check ───────────────────────────────────────────────
  if (periodId && batchMode === "supplement") {
    const [conflict] = await db.select({ id: dataImportBatches.id })
      .from(dataImportBatches)
      .where(and(
        eq(dataImportBatches.periodId, periodId),
        inArray(dataImportBatches.status, ["imported", "completed_with_warnings"]),
        sql`id != ${batchId}`
      )).limit(1);
    if (conflict) {
      categories.duplicates.periodAlreadyImported = true;
      (categories.duplicates as any).conflictBatchId = conflict.id;
    }
  }

  // ── 2. Within-file duplicate detection ────────────────────────────────────
  function getRowKey(raw: Record<string, unknown>): string | null {
    if (importType === "move_report") return String(raw["TripId"] ?? "").trim() || null;
    if (importType === "driver_return") { const rc = String(raw["RedCapId"] ?? "").trim(); const t = String(raw["TripId"] ?? "").trim(); return rc || t || null; }
    if (importType === "uber_transaction") { const id = String(raw["Trip/Eats ID"] ?? "").trim(); const tt = String(raw["Transaction Type"] ?? "").trim(); const ts = String(raw["Transaction Timestamp (UTC)"] ?? "").trim(); const amt = String(raw["Transaction Amount USD"] ?? "").trim(); return (id && tt) ? `${id}::${tt}::${ts}::${amt}` : null; }
    return null;
  }

  const withinFileKeyMap = new Map<string, number>();
  const withinFileDupeRows = new Set<number>();
  rows.forEach((raw, i) => {
    const key = getRowKey(raw);
    if (!key) return;
    if (withinFileKeyMap.has(key)) { withinFileDupeRows.add(i); categories.duplicates.withinFile++; }
    else withinFileKeyMap.set(key, i);
  });

  // ── 3. Cross-batch duplicate detection (supplement mode only) ─────────────
  const crossBatchDupeSet = new Set<string>();
  if (batchMode === "supplement") {
    if (importType === "move_report") {
      const ids = rows.map(r => String(r["TripId"] ?? "").trim()).filter(Boolean);
      if (ids.length > 0) {
        const existing = await db.select({ id: moveReportEntries.redcapTripId })
          .from(moveReportEntries)
          .where(and(inArray(moveReportEntries.redcapTripId, ids), eq(moveReportEntries.isSuperseded, false), sql`batch_id != ${batchId}`));
        existing.forEach(e => { if (e.id) { crossBatchDupeSet.add(e.id); categories.duplicates.crossBatch++; } });
      }
    } else if (importType === "driver_return") {
      const ids = rows.map(r => String(r["RedCapId"] ?? "").trim()).filter(Boolean);
      if (ids.length > 0) {
        const existing = await db.select({ id: driverReturnEntries.redcapId })
          .from(driverReturnEntries)
          .where(and(sql`redcap_id::text = ANY(ARRAY[${sql.raw(ids.map(id => `'${id.replace(/'/g, "''")}'`).join(","))}]::text[])`, eq(driverReturnEntries.isSuperseded, false), sql`batch_id != ${batchId}`));
        existing.forEach(e => { if (e.id) { crossBatchDupeSet.add(String(e.id)); categories.duplicates.crossBatch++; } });
      }
    }
  }

  // ── 4. Bulk entity resolution ──────────────────────────────────────────────
  let accountMap = new Map<string, EntityMatch>();
  let driverMap  = new Map<string, EntityMatch>();

  if (importType === "move_report" || importType === "driver_return") {
    const dealerField = importType === "move_report" ? "Dealer" : "DealerName";
    const driverField = importType === "move_report" ? "Driver" : "DriverName";
    const dealerNames = [...new Set(rows.map(r => String(r[dealerField] ?? "").trim()).filter(Boolean))];
    const driverNames = [...new Set(rows.map(r => String(r[driverField] ?? "").trim()).filter(Boolean))];
    [accountMap, driverMap] = await Promise.all([resolveAccountsBulk(dealerNames), resolveDriversBulk(driverNames)]);
  } else if (importType === "uber_transaction") {
    const driverNames = [...new Set(rows.map(r => `${String(r["First Name"] ?? "").trim()} ${String(r["Last Name"] ?? "").trim()}`.trim()).filter(n => n && n !== "--"))];
    driverMap = await resolveDriversBulk(driverNames);
  }

  // ── 5. Per-row validation ──────────────────────────────────────────────────
  let valid = 0, warn = 0, err = 0;
  const errorSummary: Array<{ row: number; errors: RowError[] }> = [];

  const staged = rows.map((raw, i) => {
    const rowErrors: RowError[] = [...validateRequiredFields(raw, importType)];

    for (const e of validateDates(raw, importType, today)) {
      if (e.message.includes("missing")) categories.dates.missing++;
      else if (e.message.includes("Invalid") || e.message.includes("invalid")) categories.dates.invalid++;
      else if (e.message.includes("Future") || e.message.includes("future")) categories.dates.future++;
      rowErrors.push(e);
    }

    for (const e of validateFinancials(raw, importType)) {
      if (e.message.includes("missing")) categories.financial.missingTotals++;
      else if (e.message.toLowerCase().includes("negative")) categories.financial.negativeValues++;
      else if (e.message.includes("discrepancy")) categories.financial.discrepancies++;
      rowErrors.push(e);
    }

    const isDupeInFile = withinFileDupeRows.has(i);
    if (isDupeInFile)
      rowErrors.push({ field: "ID", message: "Duplicate within this file (record already seen at an earlier row)", severity: "error", category: "duplicate" });

    const rowKey = getRowKey(raw);
    const isDupeInDb = !!(rowKey && crossBatchDupeSet.has(rowKey));
    if (isDupeInDb)
      rowErrors.push({ field: "ID", message: "Record already exists in a previous import (will be updated in supplement mode)", severity: "warning", category: "duplicate" });

    const mappedData: MappedData = { duplicateInFile: isDupeInFile, duplicateInDb: isDupeInDb };
    const dealerField = importType === "move_report" ? "Dealer" : "DealerName";
    const driverField = importType === "driver_return" ? "DriverName" : importType === "move_report" ? "Driver" : null;

    if (importType === "move_report" || importType === "driver_return") {
      const dealerName = String(raw[dealerField] ?? "").trim();
      const _acctBase = dealerName ? (accountMap.get(dealerName.toLowerCase()) ?? { status: "unknown" as const, resolvedId: null, resolvedName: null, confidence: null }) : undefined;
      const accountMatch = _acctBase ? { ..._acctBase, sourceName: dealerName } : undefined;
      mappedData.accountMatch = accountMatch;
      if (accountMatch) {
        categories.account[accountMatch.status === "auto_match" ? "autoMatch" : accountMatch.status === "needs_review" ? "needsReview" : "unknown"]++;
        if (accountMatch.status === "needs_review")
          rowErrors.push({ field: dealerField, message: `Account '${dealerName}' fuzzy-matched to '${accountMatch.resolvedName}' — confirm before import`, severity: "warning", category: "account" });
        else if (accountMatch.status === "unknown" && dealerName)
          rowErrors.push({ field: dealerField, message: `No account match found for '${dealerName}'`, severity: "warning", category: "account" });
      }
    }

    if (driverField || importType === "uber_transaction") {
      let driverName = "";
      if (importType === "uber_transaction") {
        driverName = `${String(raw["First Name"] ?? "").trim()} ${String(raw["Last Name"] ?? "").trim()}`.trim().replace(/^--$/, "");
      } else if (driverField) {
        driverName = String(raw[driverField] ?? "").trim();
      }
      const _drvBase = driverName ? (driverMap.get(driverName.toLowerCase()) ?? { status: "unknown" as const, resolvedId: null, resolvedName: null, confidence: null }) : undefined;
      const driverMatch = _drvBase ? { ..._drvBase, sourceName: driverName } : undefined;
      mappedData.driverMatch = driverMatch;
      if (driverMatch) {
        const tier = driverMatch.confidenceTier ?? (driverMatch.status === "auto_match" ? "exact" : driverMatch.status === "needs_review" ? "medium" : "unknown");
        if (tier === "exact" || tier === "high") { categories.driver.exact += tier === "exact" ? 1 : 0; categories.driver.high += tier === "high" ? 1 : 0; categories.driver.autoMatch++; }
        else if (tier === "medium") { categories.driver.medium++; categories.driver.needsReview++; }
        else if (tier === "low")    { categories.driver.low++; categories.driver.needsReview++; }
        else                        { categories.driver.unknown++; }
        const label = driverField ?? "First Name/Last Name";
        if (driverMatch.status === "needs_review") {
          const tierLabel = tier === "medium" ? "review recommended" : "manual review required";
          rowErrors.push({ field: label, message: `Driver '${driverName}' fuzzy-matched to '${driverMatch.resolvedName}' (${driverMatch.confidenceScore ?? "?"}% confidence — ${tierLabel})`, severity: "warning", category: "driver" });
        } else if (driverMatch.status === "unknown" && driverName)
          rowErrors.push({ field: label, message: `No driver match found for '${driverName}'`, severity: "warning", category: "driver" });
      }
    }

    const hasErr  = rowErrors.some(e => e.severity === "error");
    const hasWarn = rowErrors.some(e => e.severity === "warning");
    const status  = hasErr ? "error" : hasWarn ? "warning" : "valid";
    if (status === "valid") valid++;
    else if (status === "warning") warn++;
    else err++;
    if (rowErrors.length > 0) errorSummary.push({ row: i + 1, errors: rowErrors });

    return { batchId, rowIndex: i, rawData: raw, mappedData, validationStatus: status, validationErrors: rowErrors.length > 0 ? rowErrors : null, importStatus: "pending" };
  });

  // ── 6. Persist staged rows ────────────────────────────────────────────────
  if (!skipExisting) await db.delete(dataImportStagedRows).where(eq(dataImportStagedRows.batchId, batchId));
  const CHUNK = 500;
  for (let i = 0; i < staged.length; i += CHUNK)
    await db.insert(dataImportStagedRows).values(staged.slice(i, i + CHUNK) as any[]);

  return { totalRows: rows.length, validRows: valid, warningRows: warn, errorRows: err, categories, errors: errorSummary };
}
