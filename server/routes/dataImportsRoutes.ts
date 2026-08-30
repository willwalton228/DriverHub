/**
 * Data Imports Module — server/routes/dataImportsRoutes.ts
 *
 * Source-agnostic import pipeline supporting:
 *   • Multiple source systems (redcap, uber, …) via import_source_systems registry
 *   • Period tracking — all batches for the same (period, type, source) share a period record
 *   • Three batch modes:
 *       supplement  – upsert by record key; safe for daily runs & late-arriving records (default)
 *       correction  – supersede old records, insert new; for revised / corrected files
 *       reprocess   – retry only failed/skipped rows from a prior batch; never touches successes
 *   • Record-level dedup keyed by (redcap_trip_id | redcap_id, source_system_key)
 *   • Cross-source reconciliation for a reporting period
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { db } from "../db";
import {
  dataImportBatches,
  dataImportStagedRows,
  importPeriods,
  importReconciliationRuns,
  moveReportEntries,
  driverReturnEntries,
  uberTrips,
  uberTransactions,
  importEntityMappings,
  users,
  drivers,
  customers,
  trips,
} from "../../shared/schema";
import multer from "multer";
import * as XLSX from "xlsx";
import { isAuthenticated } from "../replitAuth";
import { eq, desc, and, ilike, sql, count, inArray, isNull, isNotNull } from "drizzle-orm";
import { createHash } from "crypto";
import { Client as ReplitStorageClient } from "@replit/object-storage";
import { computeNameConfidence, tierFromScore } from "../imports/pipeline";

const router = Router();
router.use(isAuthenticated);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Utilities ──────────────────────────────────────────────────────────────────

function getUserId(req: any): string {
  return req.user?.claims?.sub ?? req.user?.id ?? "system";
}

function computeHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Convert Excel serial date number → JS Date */
function excelSerialToDate(serial: unknown): Date | null {
  if (serial instanceof Date) return serial;
  const n = typeof serial === "number" ? serial : parseFloat(String(serial));
  if (isNaN(n) || n < 1) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function parseBuffer(buf: Buffer, name: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "csv") {
    const r = Papa.parse(buf.toString("utf-8"), { header: true, skipEmptyLines: true });
    return { headers: r.meta.fields ?? [], rows: r.data };
  }
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return { headers: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
}

function toDecimal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n.toFixed(2);
}

function toInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return isNaN(n) ? null : n;
}

// ── Period Management ──────────────────────────────────────────────────────────

async function upsertPeriod(
  periodStart: string,
  periodEnd: string,
  importType: string,
  sourceSystemKey: string,
  batchId: string
): Promise<string> {
  const existing = await db
    .select({ id: importPeriods.id, count: importPeriods.receivedBatchCount })
    .from(importPeriods)
    .where(
      and(
        eq(importPeriods.periodStart, periodStart),
        eq(importPeriods.periodEnd, periodEnd),
        eq(importPeriods.importType, importType),
        eq(importPeriods.sourceSystemKey, sourceSystemKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(importPeriods)
      .set({
        receivedBatchCount: (existing[0].count ?? 0) + 1,
        latestBatchId: batchId,
        updatedAt: new Date(),
      })
      .where(eq(importPeriods.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(importPeriods)
    .values({
      periodStart,
      periodEnd,
      importType,
      sourceSystemKey,
      receivedBatchCount: 1,
      latestBatchId: batchId,
    } as any)
    .returning({ id: importPeriods.id });
  return created.id;
}

// ── Entity Resolution ──────────────────────────────────────────────────────────

async function resolveAccount(name: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const [mapping] = await db
    .select({ mappedEntityId: importEntityMappings.mappedEntityId })
    .from(importEntityMappings)
    .where(and(
      eq(importEntityMappings.entityType, "account"),
      eq(importEntityMappings.sourceName, name.trim()),
      eq(importEntityMappings.isActive, true)
    ))
    .limit(1);

  if (mapping) { cache.set(key, mapping.mappedEntityId); return mapping.mappedEntityId; }

  const [found] = await db
    .select({ id: customers.id, customerName: customers.customerName })
    .from(customers)
    .where(ilike(customers.customerName, `%${name.trim()}%`))
    .limit(1);

  const resolved = found?.id ?? null;
  if (resolved) {
    await db.insert(importEntityMappings).values({
      entityType: "account", sourceName: name.trim(),
      mappedEntityId: resolved, mappedEntityName: found!.customerName ?? null, confidence: "fuzzy",
    } as any).onConflictDoNothing();
  }
  cache.set(key, resolved);
  return resolved;
}

async function resolveDriver(name: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const [mapping] = await db
    .select({ mappedEntityId: importEntityMappings.mappedEntityId })
    .from(importEntityMappings)
    .where(and(
      eq(importEntityMappings.entityType, "driver"),
      eq(importEntityMappings.sourceName, name.trim()),
      eq(importEntityMappings.isActive, true)
    ))
    .limit(1);

  if (mapping) { cache.set(key, mapping.mappedEntityId); return mapping.mappedEntityId; }

  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";

  const [found] = await db
    .select({ id: drivers.id, firstName: users.firstName, lastName: users.lastName })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(and(
      ilike(users.firstName, `%${first}%`),
      parts.length > 1 ? ilike(users.lastName, `%${last}%`) : sql`true`
    ))
    .limit(1);

  const resolved = found?.id ?? null;
  if (resolved) {
    await db.insert(importEntityMappings).values({
      entityType: "driver", sourceName: name.trim(),
      mappedEntityId: resolved,
      mappedEntityName: `${found!.firstName ?? ""} ${found!.lastName ?? ""}`.trim(),
      confidence: "fuzzy",
    } as any).onConflictDoNothing();
  }
  cache.set(key, resolved);
  return resolved;
}

// ── Validation Engine ─────────────────────────────────────────────────────────

interface RowError {
  field: string;
  message: string;
  severity: "error" | "warning";
  category: "duplicate" | "account" | "driver" | "date" | "financial" | "general";
}

interface EntityMatch {
  status: "auto_match" | "needs_review" | "unknown";
  resolvedId: string | null;
  resolvedName: string | null;
  confidence: "exact" | "fuzzy" | null;
  confidenceScore?: number | null;
  confidenceTier?: string | null;
  sourceName?: string;
}

interface MappedData {
  accountMatch?: EntityMatch;
  driverMatch?: EntityMatch;
  duplicateInFile?: boolean;
  duplicateInDb?: boolean;
}

interface ValidationCategories {
  duplicates: { withinFile: number; crossBatch: number; periodAlreadyImported: boolean; conflictBatchId?: string };
  account:    { exact: number; high: number; medium: number; low: number; unknown: number; autoMatch: number; needsReview: number };
  driver:     { exact: number; high: number; medium: number; low: number; unknown: number; autoMatch: number; needsReview: number };
  dates:      { missing: number; invalid: number; future: number };
  financial:  { negativeValues: number; missingTotals: number; discrepancies: number };
}

interface FullValidationResult {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  categories: ValidationCategories;
  errors: Array<{ row: number; errors: RowError[] }>;
}

// ── Per-row field checks (synchronous, no DB) ──────────────────────────────

function validateRequiredFields(raw: Record<string, unknown>, importType: string): RowError[] {
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

function validateDates(raw: Record<string, unknown>, importType: string, today: Date): RowError[] {
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

function validateFinancials(raw: Record<string, unknown>, importType: string): RowError[] {
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

// ── Bulk Entity Resolution ─────────────────────────────────────────────────────

async function resolveAccountsBulk(uniqueNames: string[]): Promise<Map<string, EntityMatch>> {
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
    const tier = isExact ? "exact" : tierFromScore(score);
    result.set(key, {
      status: isExact ? "auto_match" : "needs_review",
      resolvedId: m.mappedEntityId,
      resolvedName: m.mappedEntityName,
      confidence: isExact ? "exact" : "fuzzy",
      confidenceScore: score,
      confidenceTier: tier,
      sourceName: m.sourceName.trim(),
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
          db.insert(importEntityMappings).values({ entityType: "account", sourceName: orig, mappedEntityId: fuzzy.id, mappedEntityName: fuzzy.customerName ?? null, confidence: "fuzzy" } as any).onConflictDoNothing().catch(() => {});
        }
      }
      result.set(lowerName, match);
    }
  }
  return result;
}

async function resolveDriversBulk(uniqueNames: string[]): Promise<Map<string, EntityMatch>> {
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
    const isExact = m.confidence === "exact";
    const score = isExact ? 100 : computeNameConfidence(m.sourceName, m.mappedEntityName ?? "");
    const tier = isExact ? "exact" as const : tierFromScore(score);
    result.set(key, {
      status: isExact ? "auto_match" : "needs_review",
      resolvedId: m.mappedEntityId,
      resolvedName: m.mappedEntityName,
      confidence: isExact ? "exact" : "fuzzy",
      confidenceScore: score,
      confidenceTier: tier,
      sourceName: m.sourceName.trim(),
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
      const exact = relevantDrivers.find(d => (d.firstName ?? "").toLowerCase() === first && (d.lastName ?? "").toLowerCase() === last);
      if (exact) {
        const fullName = `${exact.firstName ?? ""} ${exact.lastName ?? ""}`.trim();
        match = { status: "auto_match", resolvedId: exact.id, resolvedName: fullName, confidence: "exact", confidenceScore: 100, confidenceTier: "exact", sourceName: orig };
      } else {
        const fuzzy = relevantDrivers.find(d => (d.lastName ?? "").toLowerCase() === last && first.length > 0 && (d.firstName ?? "").toLowerCase().startsWith(first[0]));
        if (fuzzy) {
          const fullName = `${fuzzy.firstName ?? ""} ${fuzzy.lastName ?? ""}`.trim();
          const score = computeNameConfidence(orig, fullName);
          const tier = tierFromScore(score);
          match = { status: "needs_review", resolvedId: fuzzy.id, resolvedName: fullName, confidence: "fuzzy", confidenceScore: score, confidenceTier: tier, sourceName: orig };
          db.insert(importEntityMappings).values({ entityType: "driver", sourceName: orig, mappedEntityId: fuzzy.id, mappedEntityName: fullName, confidence: "fuzzy" } as any).onConflictDoNothing().catch(() => {});
        }
      }
      result.set(lowerName, match);
    }
  }
  return result;
}

// ── Full Validation Pipeline ───────────────────────────────────────────────────

async function runValidation(
  batchId: string,
  rows: Record<string, unknown>[],
  importType: string,
  sourceSystemKey: string = "redcap",
  periodId: string | null = null,
  batchMode: string = "supplement",
  skipExisting = false
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
      categories.duplicates.conflictBatchId = conflict.id;
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

    // Dates
    for (const e of validateDates(raw, importType, today)) {
      if (e.message.includes("missing")) categories.dates.missing++;
      else if (e.message.includes("Invalid") || e.message.includes("invalid")) categories.dates.invalid++;
      else if (e.message.includes("Future") || e.message.includes("future")) categories.dates.future++;
      rowErrors.push(e);
    }

    // Financials
    for (const e of validateFinancials(raw, importType)) {
      if (e.message.includes("missing")) categories.financial.missingTotals++;
      else if (e.message.toLowerCase().includes("negative")) categories.financial.negativeValues++;
      else if (e.message.includes("discrepancy")) categories.financial.discrepancies++;
      rowErrors.push(e);
    }

    // Within-file duplicate
    const isDupeInFile = withinFileDupeRows.has(i);
    if (isDupeInFile)
      rowErrors.push({ field: "ID", message: "Duplicate within this file (record already seen at an earlier row)", severity: "error", category: "duplicate" });

    // Cross-batch duplicate
    const rowKey = getRowKey(raw);
    const isDupeInDb = !!(rowKey && crossBatchDupeSet.has(rowKey));
    if (isDupeInDb)
      rowErrors.push({ field: "ID", message: "Record already exists in a previous import (will be updated in supplement mode)", severity: "warning", category: "duplicate" });

    // Entity resolution
    const mappedData: MappedData = { duplicateInFile: isDupeInFile, duplicateInDb: isDupeInDb };
    const dealerField = importType === "move_report" ? "Dealer" : "DealerName";
    const driverField = importType === "driver_return" ? "DriverName" : importType === "move_report" ? "Driver" : null;

    if (importType === "move_report" || importType === "driver_return") {
      const dealerName = String(raw[dealerField] ?? "").trim();
      const accountMatch = dealerName ? (accountMap.get(dealerName.toLowerCase()) ?? { status: "unknown" as const, resolvedId: null, resolvedName: null, confidence: null }) : undefined;
      mappedData.accountMatch = accountMatch;
      if (accountMatch) {
        const acctTier = accountMatch.confidenceTier ?? (accountMatch.status === "auto_match" ? "exact" : accountMatch.status === "needs_review" ? "medium" : "unknown");
        if (acctTier === "exact")  { categories.account.exact++;  categories.account.autoMatch++; }
        else if (acctTier === "high")   { categories.account.high++;   categories.account.autoMatch++; }
        else if (acctTier === "medium") { categories.account.medium++;  categories.account.needsReview++; }
        else if (acctTier === "low")    { categories.account.low++;     categories.account.needsReview++; }
        else                            { categories.account.unknown++; }
        if (accountMatch.status === "needs_review")
          rowErrors.push({ field: dealerField, message: `Account '${dealerName}' fuzzy-matched to '${accountMatch.resolvedName}' (${accountMatch.confidenceScore ?? "?"}% — ${acctTier}) — confirm before import`, severity: acctTier === "low" ? "error" : "warning", category: "account" });
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
      const driverMatch = driverName ? (driverMap.get(driverName.toLowerCase()) ?? { status: "unknown" as const, resolvedId: null, resolvedName: null, confidence: null, confidenceScore: 0, confidenceTier: "unknown", sourceName: driverName }) : undefined;
      mappedData.driverMatch = driverMatch;
      if (driverMatch) {
        const drvTier = driverMatch.confidenceTier ?? (driverMatch.status === "auto_match" ? "exact" : driverMatch.status === "needs_review" ? "medium" : "unknown");
        if (drvTier === "exact")        { categories.driver.exact++;  categories.driver.autoMatch++; }
        else if (drvTier === "high")    { categories.driver.high++;   categories.driver.autoMatch++; }
        else if (drvTier === "medium")  { categories.driver.medium++; categories.driver.needsReview++; }
        else if (drvTier === "low")     { categories.driver.low++;    categories.driver.needsReview++; }
        else                            { categories.driver.unknown++; }
        const label = driverField ?? "First Name/Last Name";
        if (driverMatch.status === "needs_review")
          rowErrors.push({ field: label, message: `Driver '${driverName}' fuzzy-matched to '${driverMatch.resolvedName}' (${driverMatch.confidenceScore ?? "?"}% — ${drvTier}) — confirm before import`, severity: (drvTier === "low" || drvTier === "unknown") ? "error" : "warning", category: "driver" });
        else if (driverMatch.status === "unknown" && driverName)
          rowErrors.push({ field: label, message: `No driver match found for '${driverName}'`, severity: "warning", category: "driver" });
      }
    }

    const hasErr = rowErrors.some(e => e.severity === "error");
    const hasWarn = rowErrors.some(e => e.severity === "warning");
    const status = hasErr ? "error" : hasWarn ? "warning" : "valid";
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

// ── Move Report Import ─────────────────────────────────────────────────────────

/** Map a RedCap rcStatus string to a trips.status value */
function mapRcStatusToTripStatus(rcStatus: string | null): string {
  if (!rcStatus) return "completed";
  const s = rcStatus.toLowerCase();
  if (s.includes("cxl") || s.includes("cancel")) return "cancelled";
  return "completed";
}

async function importMoveReport(
  batchId: string,
  sourceSystemKey: string,
  batchMode: "supplement" | "correction" | "reprocess"
): Promise<{ recordsImported: number; recordsUpdated: number; recordsSkipped: number; recordsHeld: number; errors: any[] }> {
  // Normal: all valid/warning rows that are still pending
  // Reprocess: only rows that were pending, failed, skipped, or held (but now re-evaluated)
  const importStatusFilter = batchMode === "reprocess"
    ? sql`validation_status IN ('valid','warning') AND import_status IN ('pending','failed','skipped','held')`
    : sql`validation_status IN ('valid','warning') AND import_status = 'pending'`;

  const stagedRows = await db
    .select()
    .from(dataImportStagedRows)
    .where(and(eq(dataImportStagedRows.batchId, batchId), importStatusFilter))
    .orderBy(dataImportStagedRows.rowIndex);

  let recordsImported = 0, recordsUpdated = 0, recordsSkipped = 0, recordsHeld = 0;
  const errors: any[] = [];
  const accountCache = new Map<string, string | null>();
  const driverCache = new Map<string, string | null>();

  for (const row of stagedRows) {
    const raw = row.rawData as Record<string, unknown>;
    try {
      // ── Confidence-tier hold check ─────────────────────────────────────────
      const md = row.mappedData as any;
      const driverTier: string | null = md?.driverMatch?.confidenceTier ?? null;
      const hasBlockingErrors = ((row.validationErrors ?? []) as any[]).some((e: any) => e.severity === "error");
      if (hasBlockingErrors || driverTier === "low" || driverTier === "unknown") {
        recordsHeld++;
        await db.update(dataImportStagedRows)
          .set({ importStatus: "held", importError: hasBlockingErrors ? "Blocking validation error" : `Driver confidence too low (${driverTier})` })
          .where(eq(dataImportStagedRows.id, row.id));
        continue;
      }

      const tripId = String(raw["TripId"] ?? "").trim();
      const tripDate = excelSerialToDate(raw["Date"]);
      if (!tripId || !tripDate) {
        recordsSkipped++;
        await db.update(dataImportStagedRows)
          .set({ importStatus: "skipped", importError: "Missing TripId or Date" })
          .where(eq(dataImportStagedRows.id, row.id));
        continue;
      }

      const dealerName = String(raw["Dealer"] ?? "").trim();
      const driverName = String(raw["Driver"] ?? "").trim();
      const rcStatus   = String(raw["RCStatus"] ?? "").trim() || null;
      const minutes    = toInt(raw["Minutes"]);
      const chgTotal   = toDecimal(raw["Chg_Total"]);
      const payTotal   = toDecimal(raw["Pay_Total"]);
      const chgTotalRt = toDecimal(raw["RT_Chg_Total"]);

      const [linkedDealerId, linkedDriverId] = await Promise.all([
        dealerName ? resolveAccount(dealerName, accountCache) : Promise.resolve(null),
        driverName ? resolveDriver(driverName, driverCache) : Promise.resolve(null),
      ]);

      // ── 1. Upsert into trips (primary domain record) ──────────────────────────
      // Compute derived financial values
      const revenue       = chgTotal;
      const driverCost    = (parseFloat(payTotal ?? "0") + parseFloat(chgTotalRt ?? "0")).toFixed(2);
      const grossProfitV  = (parseFloat(revenue ?? "0") - parseFloat(driverCost)).toFixed(2);
      const revenueNum    = parseFloat(revenue ?? "0");
      const grossMarginV  = revenueNum !== 0
        ? ((parseFloat(grossProfitV) / revenueNum) * 100).toFixed(4)
        : "0";
      const moveHoursV    = minutes != null ? (minutes / 60).toFixed(4) : null;
      const tripStatus    = mapRcStatusToTripStatus(rcStatus);

      const tripUpsertData = {
        externalMoveId:      tripId,
        sourceSystem:        sourceSystemKey,
        importBatchId:       batchId,
        tripDate:            tripDate,
        status:              tripStatus,
        customerId:          linkedDealerId ?? null,
        driverId:            linkedDriverId ?? null,
        moveMinutes:         minutes ?? null,
        moveHours:           moveHoursV,
        customerCharges:     chgTotal,
        driverPay:           payTotal,
        driverReturnCharges: chgTotalRt,
        revenue:             revenue,
        driverCost:          driverCost,
        grossProfit:         grossProfitV,
        grossMargin:         grossMarginV,
        ingestSource:        "move_import",
        ingestedAt:          new Date(),
        updatedAt:           new Date(),
      };

      let linkedTripId: string | null = null;

      // Check for a prior import-created trip for this external ID
      const [existingImportTrip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(
          eq(trips.externalMoveId, tripId),
          eq(trips.sourceSystem as any, sourceSystemKey)
        ))
        .limit(1);

      if (existingImportTrip) {
        // Update the existing import-created trip
        await db.update(trips).set(tripUpsertData as any).where(eq(trips.id, existingImportTrip.id));
        linkedTripId = existingImportTrip.id;
      } else {
        // Check for a manually-created trip with the same moveNumber
        const [manualTrip] = await db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.moveNumber, tripId))
          .limit(1);

        if (manualTrip) {
          // Annotate the existing trip with import financial data
          await db.update(trips).set(tripUpsertData as any).where(eq(trips.id, manualTrip.id));
          linkedTripId = manualTrip.id;
        } else {
          // Insert new trip — moveNumber = externalMoveId for import-sourced trips
          const [inserted] = await db.insert(trips).values({
            moveNumber: tripId,
            ...tripUpsertData,
          } as any).returning({ id: trips.id });
          linkedTripId = inserted.id;
        }
      }

      // ── Retroactive DR linking ────────────────────────────────────────────────
      // If any DriverReturn records arrived before this Move (their RedCapId matches
      // this TripId but linked_trip_id is still NULL), link them now.
      // Deterministic and idempotent: only touches unmatched, non-superseded records.
      if (linkedTripId && tripId && /^\d+$/.test(tripId)) {
        await db.update(driverReturnEntries)
          .set({ linkedTripId, parentMatchStatus: "matched" })
          .where(and(
            eq(driverReturnEntries.redcapId, parseInt(tripId, 10)),
            isNull(driverReturnEntries.linkedTripId),
            eq(driverReturnEntries.isSuperseded, false)
          ));
      }

      // ── 2. Write move_report_entries (detailed ledger record) ─────────────────
      const entryData: Record<string, any> = {
        batchId, sourceSystemKey,
        redcapTripId: tripId,
        linkedTripId,
        tripDate: tripDate.toISOString().split("T")[0],
        rcStatus,
        owrt: String(raw["OWRT"] ?? "").trim() || null,
        minutes,
        dealerName: dealerName || null,
        driverName: driverName || null,
        linkedDealerId,
        linkedDriverId,
        payTotal,
        chgTotal,
        netTotal: toDecimal(raw["NetTotal"]),
        payMin: toDecimal(raw["Pay_Min"]),
        payOvg: toDecimal(raw["Pay_Ovg"]),
        pay1099r: toDecimal(raw["1099R"]),
        payBonus: toDecimal(raw["Pay_Bonus"]),
        payOther: toDecimal(raw["Pay_Other"]),
        payGas: toDecimal(raw["Pay_Gas"]),
        payTolls: toDecimal(raw["Pay_Tolls"]),
        payRs: toDecimal(raw["Pay_RS"]),
        lmcw: toDecimal(raw["LMCW"]),
        lmcw2023: toDecimal(raw["LMCW_2023"]),
        pay1099m: toDecimal(raw["1099M"]),
        chgBonus: toDecimal(raw["RT_Chg_Bonus"]),
        chgCxl: toDecimal(raw["RT_Chg_Cxl"]),
        chgGas: toDecimal(raw["RT_Chg_Gas"]),
        chgMinimum: toDecimal(raw["RT_Chg_Minimum"]),
        chgIncentive: toDecimal(raw["RT_Chg_Incentive"]),
        chgOther: toDecimal(raw["RT_Chg_Other"]),
        chgOverage: toDecimal(raw["RT_Chg_Overage"]),
        chgRideshare: toDecimal(raw["RT_Chg_RideShare"]),
        chgRideshareSql: toDecimal(raw["RT_Chg_RideShare_SQL"]),
        chgServiceFee: toDecimal(raw["RT_Chg_ServiceFee"]),
        chgTolls: toDecimal(raw["RT_Chg_Tolls"]),
        chgTotalRt,
        rtPayIncentive: toDecimal(raw["RT_Pay_Incentive"]),
        rtPayIncentiveTotal: toDecimal(raw["RT_Pay_IncentiveTotal"]),
        rtPayServiceFee: toDecimal(raw["RT_Pay_ServiceFee"]),
        rawData: raw,
      };

      // Find existing active move_report_entries record
      const [existing] = await db
        .select({ id: moveReportEntries.id })
        .from(moveReportEntries)
        .where(and(
          eq(moveReportEntries.redcapTripId, tripId),
          eq(moveReportEntries.sourceSystemKey, sourceSystemKey),
          eq(moveReportEntries.isSuperseded, false)
        ))
        .limit(1);

      if (batchMode === "correction" && existing) {
        // Supersede old record, insert new
        const [inserted] = await db.insert(moveReportEntries).values(entryData as any).returning({ id: moveReportEntries.id });
        await db.update(moveReportEntries)
          .set({ isSuperseded: true, supersededByEntryId: inserted.id })
          .where(eq(moveReportEntries.id, existing.id));
        await db.update(dataImportStagedRows)
          .set({ importStatus: "imported", linkedRecordId: inserted.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      } else if (existing) {
        // supplement / reprocess — update in place
        await db.update(moveReportEntries).set(entryData).where(eq(moveReportEntries.id, existing.id));
        await db.update(dataImportStagedRows)
          .set({ importStatus: "updated", linkedRecordId: existing.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsUpdated++;
      } else {
        const [inserted] = await db.insert(moveReportEntries).values(entryData as any).returning({ id: moveReportEntries.id });
        await db.update(dataImportStagedRows)
          .set({ importStatus: "imported", linkedRecordId: inserted.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      }
    } catch (err: any) {
      errors.push({ row: row.rowIndex + 1, error: err.message });
      await db.update(dataImportStagedRows)
        .set({ importStatus: "failed", importError: err.message })
        .where(eq(dataImportStagedRows.id, row.id));
      recordsSkipped++;
    }
  }

  return { recordsImported, recordsUpdated, recordsSkipped, recordsHeld, errors };
}

// ── DriverReturn Import ────────────────────────────────────────────────────────

async function importDriverReturn(
  batchId: string,
  sourceSystemKey: string,
  batchMode: "supplement" | "correction" | "reprocess"
): Promise<{ recordsImported: number; recordsUpdated: number; recordsSkipped: number; recordsHeld: number; errors: any[] }> {
  const importStatusFilter = batchMode === "reprocess"
    ? sql`validation_status IN ('valid','warning') AND import_status IN ('pending','failed','skipped','held')`
    : sql`validation_status IN ('valid','warning')`;

  const stagedRows = await db
    .select()
    .from(dataImportStagedRows)
    .where(and(eq(dataImportStagedRows.batchId, batchId), importStatusFilter))
    .orderBy(dataImportStagedRows.rowIndex);

  let recordsImported = 0, recordsUpdated = 0, recordsSkipped = 0, recordsHeld = 0;
  const errors: any[] = [];
  const accountCache = new Map<string, string | null>();
  const driverCache = new Map<string, string | null>();

  for (const row of stagedRows) {
    const raw = row.rawData as Record<string, unknown>;
    try {
      // Hold check — low/unknown confidence relationships must not be auto-imported
      const md = row.mappedData as any;
      const hasBlockingErrors = (row.validationErrors as any[])?.some((e: any) => e.severity === "error");
      const driverTier: string | null = md?.driverMatch?.confidenceTier ?? null;
      const acctTier:  string | null = md?.accountMatch?.confidenceTier ?? null;
      if (hasBlockingErrors || driverTier === "low" || driverTier === "unknown" || acctTier === "low" || acctTier === "unknown") {
        recordsHeld++;
        await db.update(dataImportStagedRows)
          .set({ importStatus: "held", importError: hasBlockingErrors ? "Blocking validation error" : driverTier === "low" || driverTier === "unknown" ? `Driver confidence too low (${driverTier})` : `Account confidence too low (${acctTier})` })
          .where(eq(dataImportStagedRows.id, row.id));
        continue;
      }
      const redcapId = raw["RedCapId"] ? parseInt(String(raw["RedCapId"]), 10) : null;
      const sourceTripId = String(raw["TripId"] ?? "").trim();

      // AUTHORITATIVE MATCH: DriverReturn.RedCapId = TripDataBI.TripId
      // The Move Report stores its source TripId verbatim in trips.external_move_id and
      // trips.move_number.  The UUID-style DR TripId column is NOT an authoritative key
      // and must not be used for matching.  No fuzzy matching (driver/account/date/amount).
      let linkedTripId: string | null = null;
      if (redcapId) {
        const redcapIdStr = String(redcapId);
        const [found] = await db.select({ id: trips.id }).from(trips)
          .where(sql`(${trips.externalMoveId} = ${redcapIdStr} OR ${trips.moveNumber} = ${redcapIdStr})`)
          .limit(1);
        linkedTripId = found?.id ?? null;
      }

      const tripDate = excelSerialToDate(raw["TripDate"]);
      const tripTime = excelSerialToDate(raw["TripTime"]);
      const dealerName = String(raw["DealerName"] ?? "").trim();
      const driverName = String(raw["DriverName"] ?? "").trim();

      const [linkedDealerId, linkedDriverId] = await Promise.all([
        dealerName ? resolveAccount(dealerName, accountCache) : Promise.resolve(null),
        driverName ? resolveDriver(driverName, driverCache) : Promise.resolve(null),
      ]);

      const entryData: Record<string, any> = {
        batchId, sourceSystemKey,
        redcapId: redcapId ?? null,
        sourceTripId: sourceTripId || null,
        linkedTripId,
        dealerName: dealerName || null,
        dealerId: toInt(raw["DealerId"]),
        tripDate: tripDate ? tripDate.toISOString().split("T")[0] : null,
        tripTime: tripTime ?? null,
        tripTypeGroup: String(raw["TripTypeGroup"] ?? "").trim() || null,
        status: String(raw["Status"] ?? "").trim() || null,
        cancellationReason: String(raw["CancellationReason"] ?? "").trim() || null,
        minutes: raw["Minutes"] !== "" ? parseFloat(String(raw["Minutes"])) || null : null,
        milesEstimate: raw["Miles Estimate"] !== "" ? parseFloat(String(raw["Miles Estimate"])) || null : null,
        driverName: driverName || null,
        driverCell: String(raw["DriverCell"] ?? "").trim() || null,
        linkedDriverId,
        linkedDealerId,
        baseEstimate: toDecimal(raw["BaseEstimate"]),
        baseCost: toDecimal(raw["BaseCost"]),
        customerEstimate: toDecimal(raw["CustomerEstimate"]),
        customerBilled: toDecimal(raw["CustomerBilled"]),
        customerRefund: toDecimal(raw["CustomerRefund"]),
        customerTotal: toDecimal(raw["CustomerTotal"]),
        customerTotalWithFee: toDecimal(raw["CustomerTotalw/Fee"]),
        costOverEstimate: raw["CostOverEstimate"] !== "" ? parseFloat(String(raw["CostOverEstimate"])) || null : null,
        roNumber: String(raw["RONumber"] ?? "").trim() || null,
        customerVin: String(raw["CustomerVIN"] ?? "").trim() || null,
        customerName: String(raw["CustomerName"] ?? "").trim() || null,
        customerTripAddress: String(raw["CustomerTripAddress"] ?? "").trim() || null,
        customerTripCity: String(raw["CustomerTripCity"] ?? "").trim() || null,
        customerPhone: String(raw["CustomerPhone"] ?? "").trim() || null,
        customerEmail: String(raw["CustomerEmail"] ?? "").trim() || null,
        vehicleYear: String(raw["CustomerYear"] ?? "").trim() || null,
        vehicleMake: String(raw["CustomerMake"] ?? "").trim() || null,
        vehicleModel: String(raw["CustomerModel"] ?? "").trim() || null,
        roCustomerPay: toDecimal(raw["ROCustomerPay"]),
        roInternalPay: toDecimal(raw["ROInternalPay"]),
        roWarrantyPay: toDecimal(raw["ROWarrantyPay"]),
        roTotalPay: toDecimal(raw["ROTotalPay"]),
        booked: raw["Booked"] === 1 || raw["Booked"] === "1" ? 1 : 0,
        completed: raw["Completed"] === 1 || raw["Completed"] === "1" ? 1 : 0,
        parentMatchStatus: linkedTripId ? "matched" : "unmatched",
        rawData: raw,
      };

      // Find existing active record for this (redcapId, source) — or (sourceTripId, source) as fallback
      let existing: { id: string } | undefined;
      if (redcapId) {
        const [e] = await db
          .select({ id: driverReturnEntries.id })
          .from(driverReturnEntries)
          .where(and(
            eq(driverReturnEntries.redcapId, redcapId),
            eq(driverReturnEntries.sourceSystemKey, sourceSystemKey),
            eq(driverReturnEntries.isSuperseded, false)
          ))
          .limit(1);
        existing = e;
      }

      if (batchMode === "correction" && existing) {
        const [inserted] = await db.insert(driverReturnEntries).values(entryData as any).returning({ id: driverReturnEntries.id });
        await db.update(driverReturnEntries)
          .set({ isSuperseded: true, supersededByEntryId: inserted.id })
          .where(eq(driverReturnEntries.id, existing.id));
        await db.update(dataImportStagedRows)
          .set({ importStatus: "imported", linkedRecordId: inserted.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      } else if (existing) {
        await db.update(driverReturnEntries).set(entryData).where(eq(driverReturnEntries.id, existing.id));
        await db.update(dataImportStagedRows)
          .set({ importStatus: "updated", linkedRecordId: existing.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsUpdated++;
      } else {
        const [inserted] = await db.insert(driverReturnEntries).values(entryData as any).returning({ id: driverReturnEntries.id });
        await db.update(dataImportStagedRows)
          .set({ importStatus: "imported", linkedRecordId: inserted.id })
          .where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      }
    } catch (err: any) {
      errors.push({ row: row.rowIndex + 1, error: err.message });
      await db.update(dataImportStagedRows)
        .set({ importStatus: "failed", importError: err.message })
        .where(eq(dataImportStagedRows.id, row.id));
      recordsSkipped++;
    }
  }

  return { recordsImported, recordsUpdated, recordsSkipped, recordsHeld, errors };
}

// ── Uber: CSV Parser ───────────────────────────────────────────────────────────
// The Uber report has a 5-line preamble before the real header row.
// Header is detected by the first field "Request Date (UTC)".

function parseUberTransactionCsv(buf: Buffer): { headers: string[]; rows: Record<string, unknown>[] } {
  const raw = buf.toString("utf-8");
  const lines = raw.split("\n");

  // Find the header line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Request Date (UTC)") || lines[i].startsWith('"Request Date (UTC)"')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("Could not locate header row in Uber report. Expected first column 'Request Date (UTC)'.");

  const dataSection = lines.slice(headerIdx).join("\n");
  const result = Papa.parse(dataSection, { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields ?? [], rows: result.data as Record<string, unknown>[] };
}

// ── Uber: Row Validation ───────────────────────────────────────────────────────

function validateUberRow(raw: Record<string, unknown>): { errors: RowError[]; status: "valid" | "warning" | "error" } {
  const errors: RowError[] = [];

  const tripId = String(raw["Trip/Eats ID"] ?? "").trim();
  const txType = String(raw["Transaction Type"] ?? "").trim();
  const txTimestamp = String(raw["Transaction Timestamp (UTC)"] ?? "").trim();
  const txAmount = raw["Transaction Amount USD"];

  if (!tripId || tripId === "--")
    errors.push({ field: "Trip/Eats ID", message: "Trip/Eats ID is required", severity: "error" });
  if (!txType)
    errors.push({ field: "Transaction Type", message: "Transaction Type is required", severity: "error" });
  if (!txTimestamp || txTimestamp === "--")
    errors.push({ field: "Transaction Timestamp (UTC)", message: "Transaction Timestamp is required", severity: "error" });
  if (txAmount === "" || txAmount === undefined)
    errors.push({ field: "Transaction Amount USD", message: "Transaction Amount USD is required", severity: "error" });

  if (!raw["First Name"] || String(raw["First Name"]).trim() === "" || String(raw["First Name"]).trim() === "--")
    errors.push({ field: "First Name", message: "Driver first name is missing", severity: "warning" });
  if (!raw["Request Date (UTC)"] || String(raw["Request Date (UTC)"]).trim() === "")
    errors.push({ field: "Request Date (UTC)", message: "Request Date is missing", severity: "warning" });

  const errs = errors.filter(e => e.severity === "error").length;
  const warns = errors.filter(e => e.severity === "warning").length;
  return { errors, status: errs > 0 ? "error" : warns > 0 ? "warning" : "valid" };
}

// ── Uber: Transaction Category ─────────────────────────────────────────────────

function classifyUberTransaction(txType: string): "expense" | "fee" | "reconciliation" | "adjustment" {
  switch (txType) {
    case "Fare":  return "expense";
    case "Tip":   return "expense";
    case "Adjustment": return "adjustment";
    case "Service & Technology Fee": return "fee";
    case "Payment": return "reconciliation";
    default: return "expense";
  }
}

// ── Uber: Move Matching ────────────────────────────────────────────────────────
// 1. Primary: Expense Code → move_report_entries.redcap_trip_id (confidence 1.0)
// 2. Secondary: driver name + request date + city (confidence 0.70–0.85)

async function matchUberTripToMove(
  expenseCode: string,
  driverFirstName: string,
  driverLastName: string,
  requestDate: string | null,   // YYYY-MM-DD
  city: string,
  matchCache: Map<string, { tripId: string | null; entryId: string | null; confidence: number; method: string }>
): Promise<{ linkedTripId: string | null; linkedMoveEntryId: string | null; matchStatus: string; matchConfidence: number; matchMethod: string }> {
  const cacheKey = `${expenseCode}::${driverFirstName}::${driverLastName}::${requestDate}`;
  if (matchCache.has(cacheKey)) {
    const c = matchCache.get(cacheKey)!;
    return {
      linkedTripId: c.tripId,
      linkedMoveEntryId: c.entryId,
      matchStatus: c.confidence >= 0.7 ? "matched" : c.confidence > 0 ? "low_confidence" : "unmatched",
      matchConfidence: c.confidence,
      matchMethod: c.method,
    };
  }

  // 1. Expense Code → move_report_entries
  if (expenseCode && expenseCode !== "--") {
    const [entry] = await db
      .select({ id: moveReportEntries.id, linkedTripId: moveReportEntries.linkedTripId })
      .from(moveReportEntries)
      .where(and(
        eq(moveReportEntries.redcapTripId, expenseCode),
        eq(moveReportEntries.isSuperseded, false)
      ))
      .limit(1);

    if (entry) {
      matchCache.set(cacheKey, { tripId: entry.linkedTripId, entryId: entry.id, confidence: 1.0, method: "expense_code" });
      return { linkedTripId: entry.linkedTripId, linkedMoveEntryId: entry.id, matchStatus: "matched", matchConfidence: 1.0, matchMethod: "expense_code" };
    }

    // Try trips.moveNumber directly
    const [trip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.moveNumber, expenseCode))
      .limit(1);

    if (trip) {
      matchCache.set(cacheKey, { tripId: trip.id, entryId: null, confidence: 1.0, method: "expense_code" });
      return { linkedTripId: trip.id, linkedMoveEntryId: null, matchStatus: "matched", matchConfidence: 1.0, matchMethod: "expense_code" };
    }
  }

  // 2. Driver name + date + city against move_report_entries
  if (requestDate && (driverFirstName || driverLastName)) {
    const fullName = `${driverFirstName} ${driverLastName}`.trim();
    const [entry] = await db
      .select({ id: moveReportEntries.id, linkedTripId: moveReportEntries.linkedTripId, dealerName: moveReportEntries.dealerName })
      .from(moveReportEntries)
      .where(and(
        eq(moveReportEntries.tripDate, requestDate),
        eq(moveReportEntries.isSuperseded, false),
        ilike(moveReportEntries.driverName, `%${driverLastName}%`)
      ))
      .limit(1);

    if (entry) {
      // Boost confidence if city matches dealer name
      const cityMatch = city && entry.dealerName
        ? entry.dealerName.toLowerCase().includes(city.toLowerCase()) ||
          city.toLowerCase().includes(entry.dealerName.toLowerCase().split(" ")[0])
        : false;
      const confidence = cityMatch ? 0.85 : 0.70;
      matchCache.set(cacheKey, { tripId: entry.linkedTripId, entryId: entry.id, confidence, method: "driver_date_city" });
      return {
        linkedTripId: entry.linkedTripId,
        linkedMoveEntryId: entry.id,
        matchStatus: confidence >= 0.7 ? "matched" : "low_confidence",
        matchConfidence: confidence,
        matchMethod: "driver_date_city",
      };
    }
  }

  matchCache.set(cacheKey, { tripId: null, entryId: null, confidence: 0, method: "none" });
  return { linkedTripId: null, linkedMoveEntryId: null, matchStatus: "unmatched", matchConfidence: 0, matchMethod: "none" };
}

// ── Uber Transaction Import ────────────────────────────────────────────────────

async function importUberTransaction(
  batchId: string,
  sourceSystemKey: string,
  batchMode: "supplement" | "correction" | "reprocess"
): Promise<{ recordsImported: number; recordsUpdated: number; recordsSkipped: number; recordsHeld: number; errors: any[] }> {
  const importStatusFilter = batchMode === "reprocess"
    ? sql`validation_status IN ('valid','warning') AND import_status IN ('pending','failed','skipped','held')`
    : sql`validation_status IN ('valid','warning')`;

  const stagedRows = await db
    .select()
    .from(dataImportStagedRows)
    .where(and(eq(dataImportStagedRows.batchId, batchId), importStatusFilter))
    .orderBy(dataImportStagedRows.rowIndex);

  let recordsImported = 0, recordsUpdated = 0, recordsSkipped = 0, recordsHeld = 0;
  const errors: any[] = [];
  const driverCache = new Map<string, string | null>();
  const matchCache = new Map<string, any>();

  // In-memory trip record cache for this batch: tripEatsId → uber_trips.id
  const tripIdMap = new Map<string, string>();

  // Load existing trips for this batch (supplement/reprocess idempotency)
  if (batchMode !== "correction") {
    const existingTrips = await db
      .select({ tripEatsId: uberTrips.tripEatsId, id: uberTrips.id })
      .from(uberTrips)
      .where(and(eq(uberTrips.batchId, batchId), eq(uberTrips.isSuperseded, false)));
    for (const t of existingTrips) tripIdMap.set(t.tripEatsId, t.id);
  }

  for (const row of stagedRows) {
    const raw = row.rawData as Record<string, unknown>;
    try {
      // Hold check — low/unknown confidence driver must not be auto-imported
      const uberMd = row.mappedData as any;
      const uberHasBlockingErrors = (row.validationErrors as any[])?.some((e: any) => e.severity === "error");
      const uberDriverTier: string | null = uberMd?.driverMatch?.confidenceTier ?? null;
      if (uberHasBlockingErrors || uberDriverTier === "low" || uberDriverTier === "unknown") {
        recordsHeld++;
        await db.update(dataImportStagedRows)
          .set({ importStatus: "held", importError: uberHasBlockingErrors ? "Blocking validation error" : `Driver confidence too low (${uberDriverTier})` })
          .where(eq(dataImportStagedRows.id, row.id));
        continue;
      }

      const tripEatsId = String(raw["Trip/Eats ID"] ?? "").trim();
      const txType = String(raw["Transaction Type"] ?? "").trim();
      const txTimestampStr = String(raw["Transaction Timestamp (UTC)"] ?? "").trim();
      const txAmountUsd = toDecimal(raw["Transaction Amount USD"]);
      const txAmountLocal = toDecimal(raw["Transaction Amount (Local Currency)"]);
      const txCategory = classifyUberTransaction(txType);

      // Parse request datetime
      const requestDateStr = String(raw["Request Date (UTC)"] ?? "").trim();
      const requestTimeStr = String(raw["Request Time (UTC)"] ?? "").trim();
      let requestDateIso: string | null = null;
      let requestDatetimeUtc: Date | null = null;
      if (requestDateStr && requestDateStr !== "--") {
        // Format: "07/01/2026"
        const [m, d, y] = requestDateStr.split("/");
        if (m && d && y) {
          requestDateIso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          if (requestTimeStr && requestTimeStr !== "--") {
            requestDatetimeUtc = new Date(`${requestDateIso}T${
              requestTimeStr.replace(/(\d+):(\d+)(AM|PM)/, (_, h, min, ampm) => {
                let hour = parseInt(h);
                if (ampm === "PM" && hour !== 12) hour += 12;
                if (ampm === "AM" && hour === 12) hour = 0;
                return `${hour.toString().padStart(2, "0")}:${min}:00Z`;
              })
            }`);
          }
        }
      }

      // Parse dropoff datetime
      const dropoffDateStr = String(raw["Drop-off Date (UTC)"] ?? "").trim();
      const dropoffTimeStr = String(raw["Drop-off Time (UTC)"] ?? "").trim();
      let dropoffDatetimeUtc: Date | null = null;
      if (dropoffDateStr && dropoffDateStr !== "--") {
        const [m, d, y] = dropoffDateStr.split("/");
        if (m && d && y) {
          const dropoffIso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          if (dropoffTimeStr && dropoffTimeStr !== "--") {
            dropoffDatetimeUtc = new Date(`${dropoffIso}T${
              dropoffTimeStr.replace(/(\d+):(\d+)(AM|PM)/, (_, h, min, ampm) => {
                let hour = parseInt(h);
                if (ampm === "PM" && hour !== 12) hour += 12;
                if (ampm === "AM" && hour === 12) hour = 0;
                return `${hour.toString().padStart(2, "0")}:${min}:00Z`;
              })
            }`);
          }
        }
      }

      // Parse transaction timestamp: "2026-07-01 12:29:48" (UTC)
      let txTimestamp: Date | null = null;
      if (txTimestampStr && txTimestampStr !== "--") {
        txTimestamp = new Date(txTimestampStr.replace(" ", "T") + "Z");
      }

      const driverFirstName = String(raw["First Name"] ?? "").trim().replace(/^--$/, "");
      const driverLastName  = String(raw["Last Name"] ?? "").trim().replace(/^--$/, "");
      const expenseCode     = String(raw["Expense Code"] ?? "").trim().replace(/^--$/, "");
      const city            = String(raw["City"] ?? "").trim().replace(/^--$/, "");

      // Resolve driver
      const fullDriverName = `${driverFirstName} ${driverLastName}`.trim();
      const linkedDriverId = fullDriverName
        ? await resolveDriver(fullDriverName, driverCache)
        : null;

      // Move matching (skip for fee/reconciliation categories)
      let matchResult = { linkedTripId: null as string | null, linkedMoveEntryId: null as string | null, matchStatus: "unmatched", matchConfidence: 0, matchMethod: "none" };
      if (txCategory === "expense" || txCategory === "adjustment") {
        matchResult = await matchUberTripToMove(expenseCode, driverFirstName, driverLastName, requestDateIso, city, matchCache);
      }

      // ── Upsert Uber Trip record ──────────────────────────────────────────────
      let uberTripId: string;
      const existingTripId = tripIdMap.get(tripEatsId);

      const tripData: Record<string, any> = {
        batchId,
        tripEatsId,
        service: String(raw["Service"] ?? "").trim().replace(/^--$/, "") || null,
        city: city || null,
        country: String(raw["Country"] ?? "").trim().replace(/^--$/, "") || null,
        pickupAddress: String(raw["Pickup Address"] ?? "").trim().replace(/^--$/, "") || null,
        dropoffAddress: String(raw["Drop-off Address"] ?? "").trim().replace(/^--$/, "") || null,
        requestDate: requestDateIso,
        requestDatetimeUtc: requestDatetimeUtc && !isNaN(requestDatetimeUtc.getTime()) ? requestDatetimeUtc : null,
        dropoffDatetimeUtc: dropoffDatetimeUtc && !isNaN(dropoffDatetimeUtc.getTime()) ? dropoffDatetimeUtc : null,
        timezoneOffset: String(raw["Request Timezone Offset from UTC"] ?? "").trim().replace(/^--$/, "") || null,
        distanceMiles: raw["Distance (mi)"] !== "" && raw["Distance (mi)"] !== "--" ? parseFloat(String(raw["Distance (mi)"])) || null : null,
        durationMinutes: raw["Duration (min)"] !== "" && raw["Duration (min)"] !== "--" ? parseFloat(String(raw["Duration (min)"])) || null : null,
        driverFirstName: driverFirstName || null,
        driverLastName: driverLastName || null,
        driverEmail: String(raw["Email"] ?? "").trim().replace(/^--$/, "") || null,
        employeeId: String(raw["Employee ID"] ?? "").trim().replace(/^--$/, "") || null,
        linkedDriverId,
        uberGroup: String(raw["Group"] ?? "").trim().replace(/^--$/, "") || null,
        uberProgram: String(raw["Program"] ?? "").trim().replace(/^--$/, "") || null,
        expenseCode: expenseCode || null,
        expenseMemo: String(raw["Expense Memo"] ?? "").trim().replace(/^--$/, "") || null,
        paymentMethod: String(raw["Payment Method"] ?? "").trim().replace(/^--$/, "") || null,
        guestFirstName: String(raw["Guest first name"] ?? "").trim().replace(/^--$/, "") || null,
        guestLastName: String(raw["Guest last name"] ?? "").trim().replace(/^--$/, "") || null,
        linkedTripId: matchResult.linkedTripId,
        linkedMoveEntryId: matchResult.linkedMoveEntryId,
        matchStatus: matchResult.matchStatus,
        matchConfidence: matchResult.matchConfidence > 0 ? matchResult.matchConfidence.toFixed(4) : null,
        matchMethod: matchResult.matchMethod !== "none" ? matchResult.matchMethod : null,
        sourceSystemKey,
      };

      if (existingTripId) {
        // Update existing trip (latest transaction data wins for trip-level fields)
        await db.update(uberTrips).set({ ...tripData, updatedAt: new Date() }).where(eq(uberTrips.id, existingTripId));
        uberTripId = existingTripId;
      } else {
        if (batchMode === "correction") {
          // Mark any old active trip for this trip_eats_id as superseded
          const [oldTrip] = await db
            .select({ id: uberTrips.id })
            .from(uberTrips)
            .where(and(eq(uberTrips.tripEatsId, tripEatsId), eq(uberTrips.isSuperseded, false)))
            .limit(1);
          if (oldTrip) {
            await db.update(uberTrips).set({ isSuperseded: true }).where(eq(uberTrips.id, oldTrip.id));
          }
        }
        const [newTrip] = await db.insert(uberTrips).values(tripData as any).returning({ id: uberTrips.id });
        uberTripId = newTrip.id;
        tripIdMap.set(tripEatsId, uberTripId);
      }

      // ── Upsert Uber Transaction record ───────────────────────────────────────
      // Dedup: (trip_eats_id, transaction_type, transaction_timestamp_utc, transaction_amount_usd)
      const txData: Record<string, any> = {
        batchId,
        uberTripId,
        tripEatsId: tripEatsId !== "--" ? tripEatsId : null,
        networkTransactionId: String(raw["Network Transaction Id"] ?? "").trim().replace(/^--$/, "") || null,
        transactionType: txType,
        transactionCategory: txCategory,
        transactionTimestampUtc: txTimestamp && !isNaN(txTimestamp.getTime()) ? txTimestamp : null,
        transactionAmountUsd: txAmountUsd,
        transactionAmountLocal: txAmountLocal,
        localCurrencyCode: String(raw["Local Currency Code"] ?? "").trim().replace(/^--$/, "") || null,
        tripMealFareLocal:         toDecimal(raw["Trip/Meal Fare (Local Currency)"]),
        bookingServiceFeeLocal:    toDecimal(raw["Booking Fee/Service Fee (Local Currency)"]),
        airportFeeLocal:           toDecimal(raw["Airport Fee (Local Currency)"]),
        cityFeeLocal:              toDecimal(raw["City Fee (Local Currency)"]),
        tollFeeLocal:              toDecimal(raw["Toll Fee (Local Currency)"]),
        deliveryFeeLocal:          toDecimal(raw["Delivery Fee (Local Currency)"]),
        promotionsDiscountsLocal:  toDecimal(raw["Promotions/Discounts (Local Currency)"]),
        tipLocal:                  toDecimal(raw["Tip in Local Currency"]),
        otherChargesLocal:         toDecimal(raw["Other Charges(Local Currency)"]),
        totalFareLocal:            toDecimal(raw["Total Fare (local currency)"]),
        totalTaxesLocal:           toDecimal(raw["Total Taxes (local currency)"]),
        employeePaymentsLocal:     toDecimal(raw["Payments made by employees/guests (local currency)"]),
        membershipSavingsLocal:    toDecimal(raw["Membership Savings(Local Currency)"]),
        tipUsd:                    toDecimal(raw["Tip in USD"]),
        totalFareUsd:              toDecimal(raw["Total Fare USD"]),
        totalTaxesUsd:             toDecimal(raw["Total Taxes USD"]),
        employeePaymentsUsd:       toDecimal(raw["Payments made by employees/guests (USD currency)"]),
        serviceTechFeeUsd:         toDecimal(raw["Estimated Service and Technology Fee (incl. Taxes, if any) in USD"]),
        integrationFeeUsd:         toDecimal(raw["Estimated Integration Fee (incl. Taxes, if any) in USD"]),
        invoiceNumber:             String(raw["Invoice Number"] ?? "").trim().replace(/^--$/, "") || null,
        paymentMethod:             String(raw["Payment Method"] ?? "").trim().replace(/^--$/, "") || null,
        cancellationType:          String(raw["Cancellation type"] ?? "").trim().replace(/^--$/, "") || null,
        fulfilmentType:            String(raw["Fulfilment Type"] ?? "").trim().replace(/^--$/, "") || null,
        voucherProgram:            String(raw["Voucher Program"] ?? "").trim().replace(/^--$/, "") || null,
        voucherProgramExpenseMemo: String(raw["Voucher Program Expense Memo"] ?? "").trim().replace(/^--$/, "") || null,
        sourceSystemKey,
        rawData: raw,
      };

      // Check for existing active transaction (dedup)
      let existingTx: { id: string } | undefined;
      if (txTimestamp && !isNaN(txTimestamp.getTime()) && txAmountUsd !== null && tripEatsId !== "--") {
        const [ex] = await db
          .select({ id: uberTransactions.id })
          .from(uberTransactions)
          .where(and(
            eq(uberTransactions.tripEatsId, tripEatsId),
            eq(uberTransactions.transactionType, txType),
            eq(uberTransactions.transactionAmountUsd, txAmountUsd),
            eq(uberTransactions.isSuperseded, false)
          ))
          .limit(1);
        existingTx = ex;
      }

      if (batchMode === "correction" && existingTx) {
        const [inserted] = await db.insert(uberTransactions).values(txData as any).returning({ id: uberTransactions.id });
        await db.update(uberTransactions).set({ isSuperseded: true, supersededByTransactionId: inserted.id }).where(eq(uberTransactions.id, existingTx.id));
        await db.update(dataImportStagedRows).set({ importStatus: "imported", linkedRecordId: inserted.id }).where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      } else if (existingTx) {
        await db.update(uberTransactions).set(txData).where(eq(uberTransactions.id, existingTx.id));
        await db.update(dataImportStagedRows).set({ importStatus: "updated", linkedRecordId: existingTx.id }).where(eq(dataImportStagedRows.id, row.id));
        recordsUpdated++;
      } else {
        const [inserted] = await db.insert(uberTransactions).values(txData as any).returning({ id: uberTransactions.id });
        await db.update(dataImportStagedRows).set({ importStatus: "imported", linkedRecordId: inserted.id }).where(eq(dataImportStagedRows.id, row.id));
        recordsImported++;
      }
    } catch (err: any) {
      errors.push({ row: row.rowIndex + 1, error: err.message });
      await db.update(dataImportStagedRows).set({ importStatus: "failed", importError: err.message }).where(eq(dataImportStagedRows.id, row.id));
      recordsSkipped++;
    }
  }

  return { recordsImported, recordsUpdated, recordsSkipped, recordsHeld, errors };
}

// ── Reconciliation ─────────────────────────────────────────────────────────────

async function runReconciliation(
  periodStart: string,
  periodEnd: string,
  importType: string,
  sources: string[],
  runByUserId: string
): Promise<{ id: string }> {
  const [run] = await db
    .insert(importReconciliationRuns)
    .values({ periodStart, periodEnd, importType, sources, status: "running", runBy: runByUserId } as any)
    .returning({ id: importReconciliationRuns.id });

  try {
    let summary: any = {};
    let detail: any = {};

    if (importType === "move_report") {
      // Gather all active records per source for this period
      const bySource: Record<string, Set<string>> = {};
      const financials: Record<string, Record<string, any>> = {};
      for (const src of sources) {
        const rows = await db
          .select({ redcapTripId: moveReportEntries.redcapTripId, payTotal: moveReportEntries.payTotal, chgTotal: moveReportEntries.chgTotal })
          .from(moveReportEntries)
          .where(and(
            eq(moveReportEntries.sourceSystemKey, src),
            eq(moveReportEntries.isSuperseded, false),
            sql`trip_date BETWEEN ${periodStart}::date AND ${periodEnd}::date`
          ));
        bySource[src] = new Set(rows.map(r => r.redcapTripId!).filter(Boolean));
        financials[src] = Object.fromEntries(rows.map(r => [r.redcapTripId, { payTotal: r.payTotal, chgTotal: r.chgTotal }]));
      }

      const allIds = new Set([...Object.values(bySource)].flatMap(s => [...s]));
      const onlyIn: Record<string, string[]> = {};
      const inAll: string[] = [];
      const conflicts: any[] = [];

      for (const id of allIds) {
        const presentIn = sources.filter(s => bySource[s]?.has(id));
        if (presentIn.length === sources.length) {
          inAll.push(id);
          // Check for financial discrepancies
          const pays = sources.map(s => parseFloat(financials[s][id]?.payTotal ?? "0"));
          const chgs = sources.map(s => parseFloat(financials[s][id]?.chgTotal ?? "0"));
          const payMismatch = Math.max(...pays) - Math.min(...pays) > 0.01;
          const chgMismatch = Math.max(...chgs) - Math.min(...chgs) > 0.01;
          if (payMismatch || chgMismatch) {
            conflicts.push({ tripId: id, payMismatch, chgMismatch, values: Object.fromEntries(sources.map(s => [s, financials[s][id]])) });
          }
        } else {
          for (const s of presentIn) {
            onlyIn[s] = onlyIn[s] ?? [];
            onlyIn[s].push(id);
          }
        }
      }

      summary = {
        totalUniqueTrips: allIds.size,
        inAllSources: inAll.length,
        financialConflicts: conflicts.length,
        onlyInCounts: Object.fromEntries(sources.map(s => [s, onlyIn[s]?.length ?? 0])),
      };
      detail = { onlyIn, conflicts: conflicts.slice(0, 200) };

    } else if (importType === "driver_return") {
      const bySource: Record<string, Set<number>> = {};
      for (const src of sources) {
        const rows = await db
          .select({ redcapId: driverReturnEntries.redcapId })
          .from(driverReturnEntries)
          .where(and(
            eq(driverReturnEntries.sourceSystemKey, src),
            eq(driverReturnEntries.isSuperseded, false),
            sql`trip_date BETWEEN ${periodStart}::date AND ${periodEnd}::date`
          ));
        bySource[src] = new Set(rows.map(r => r.redcapId!).filter(Boolean));
      }

      const allIds = new Set([...Object.values(bySource)].flatMap(s => [...s]));
      const onlyIn: Record<string, number[]> = {};
      let inAll = 0;

      for (const id of allIds) {
        const presentIn = sources.filter(s => bySource[s]?.has(id));
        if (presentIn.length === sources.length) inAll++;
        else for (const s of presentIn) { onlyIn[s] = onlyIn[s] ?? []; onlyIn[s].push(id); }
      }

      summary = { totalUniqueReturns: allIds.size, inAllSources: inAll, onlyInCounts: Object.fromEntries(sources.map(s => [s, onlyIn[s]?.length ?? 0])) };
      detail = { onlyIn };
    }

    await db.update(importReconciliationRuns)
      .set({ status: "complete", resultSummary: summary, resultDetail: detail, completedAt: new Date() })
      .where(eq(importReconciliationRuns.id, run.id));

  } catch (err: any) {
    await db.update(importReconciliationRuns)
      .set({ status: "failed", resultSummary: { error: err.message }, completedAt: new Date() })
      .where(eq(importReconciliationRuns.id, run.id));
  }

  return { id: run.id };
}

// ── REST Endpoints ─────────────────────────────────────────────────────────────

// GET /api/data-imports/source-systems
router.get("/source-systems", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(sql`import_source_systems` as any)
      .orderBy(sql`display_name`);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list source systems" });
  }
});

// GET /api/data-imports/periods
router.get("/periods", async (req: any, res) => {
  try {
    const { importType = "", sourceSystemKey = "" } = req.query as Record<string, string>;
    const rows = await db
      .select()
      .from(importPeriods)
      .where(and(
        importType ? eq(importPeriods.importType, importType) : sql`true`,
        sourceSystemKey ? eq(importPeriods.sourceSystemKey, sourceSystemKey) : sql`true`
      ))
      .orderBy(desc(importPeriods.periodStart));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list periods" });
  }
});

// GET /api/data-imports — list batches
router.get("/", async (req: any, res) => {
  try {
    const { search = "", status = "", importType = "", sourceSystemKey = "", limit = "50", offset = "0" } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(dataImportBatches.fileName, `%${search}%`));
    if (status) conditions.push(eq(dataImportBatches.status, status));
    if (importType) conditions.push(eq(dataImportBatches.importType, importType));
    if (sourceSystemKey) conditions.push(eq(dataImportBatches.sourceSystemKey, sourceSystemKey));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [batches, [{ total }], [globalCounts]] = await Promise.all([
      db.select({
        id: dataImportBatches.id,
        importType: dataImportBatches.importType,
        sourceSystemKey: dataImportBatches.sourceSystemKey,
        batchMode: dataImportBatches.batchMode,
        periodId: dataImportBatches.periodId,
        fileName: dataImportBatches.fileName,
        fileSizeBytes: dataImportBatches.fileSizeBytes,
        reportingPeriodStart: dataImportBatches.reportingPeriodStart,
        reportingPeriodEnd: dataImportBatches.reportingPeriodEnd,
        importedByUserId: dataImportBatches.importedByUserId,
        recordsRead: dataImportBatches.recordsRead,
        recordsImported: dataImportBatches.recordsImported,
        recordsUpdated: dataImportBatches.recordsUpdated,
        recordsSkipped: dataImportBatches.recordsSkipped,
        validationErrorCount: dataImportBatches.validationErrorCount,
        status: dataImportBatches.status,
        validationStatus: dataImportBatches.validationStatus,
        errorMessage: dataImportBatches.errorMessage,
        notes: dataImportBatches.notes,
        validatedAt: dataImportBatches.validatedAt,
        importedAt: dataImportBatches.importedAt,
        createdAt: dataImportBatches.createdAt,
        importedByName: sql<string | null>`NULLIF(TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, ''))), '')`,
      })
        .from(dataImportBatches)
        .leftJoin(users, eq(dataImportBatches.importedByUserId, users.id))
        .where(where)
        .orderBy(desc(dataImportBatches.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db.select({ total: count() }).from(dataImportBatches).where(where),
      // Global counts ignore all filters — used for summary tiles so they always reflect full state
      db.select({
        total:     count(),
        validated: sql<number>`count(*) filter (where validation_status in ('valid', 'valid_with_warnings'))::int`,
        ready:     sql<number>`count(*) filter (where status = 'ready_for_import')::int`,
        failed:    sql<number>`count(*) filter (where status in ('failed', 'validation_failed', 'processing_error'))::int`,
        completed: sql<number>`count(*) filter (where status in ('imported', 'completed_with_warnings'))::int`,
      }).from(dataImportBatches),
    ]);

    res.json({ batches, total, limit: parseInt(limit), offset: parseInt(offset), globalCounts });
  } catch (err: any) {
    console.error("[DataImports] GET /:", err);
    res.status(500).json({ error: "Failed to list imports" });
  }
});

// GET /api/data-imports/:id
router.get("/:id", async (req: any, res) => {
  try {
    const [batch] = await db
      .select({
        id: dataImportBatches.id,
        importType: dataImportBatches.importType,
        sourceSystemKey: dataImportBatches.sourceSystemKey,
        batchMode: dataImportBatches.batchMode,
        periodId: dataImportBatches.periodId,
        supersedesBatchId: dataImportBatches.supersedesBatchId,
        parentBatchId: dataImportBatches.parentBatchId,
        fileName: dataImportBatches.fileName,
        fileSizeBytes: dataImportBatches.fileSizeBytes,
        reportingPeriodStart: dataImportBatches.reportingPeriodStart,
        reportingPeriodEnd: dataImportBatches.reportingPeriodEnd,
        importedByUserId: dataImportBatches.importedByUserId,
        recordsRead: dataImportBatches.recordsRead,
        recordsImported: dataImportBatches.recordsImported,
        recordsUpdated: dataImportBatches.recordsUpdated,
        recordsSkipped: dataImportBatches.recordsSkipped,
        validationErrorCount: dataImportBatches.validationErrorCount,
        status: dataImportBatches.status,
        validationStatus: dataImportBatches.validationStatus,
        columnHeaders: dataImportBatches.columnHeaders,
        fieldMapping: dataImportBatches.fieldMapping,
        validationResult: dataImportBatches.validationResult,
        importResult: dataImportBatches.importResult,
        errorMessage: dataImportBatches.errorMessage,
        notes: dataImportBatches.notes,
        validatedAt: dataImportBatches.validatedAt,
        importedAt: dataImportBatches.importedAt,
        createdAt: dataImportBatches.createdAt,
        updatedAt: dataImportBatches.updatedAt,
        importedByName: sql<string | null>`NULLIF(TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, ''))), '')`,
      })
      .from(dataImportBatches)
      .leftJoin(users, eq(dataImportBatches.importedByUserId, users.id))
      .where(eq(dataImportBatches.id, req.params.id));

    if (!batch) return res.status(404).json({ error: "Batch not found" });
    res.json(batch);
  } catch (err: any) {
    console.error("[DataImports] GET /:id:", err);
    res.status(500).json({ error: "Failed to get batch" });
  }
});

// GET /api/data-imports/:id/rows
router.get("/:id/rows", async (req: any, res) => {
  try {
    const {
      limit = "50",
      offset = "0",
      status: filterStatus = "",
      tier: filterTier = "",
    } = req.query as Record<string, string>;

    const conditions: any[] = [eq(dataImportStagedRows.batchId, req.params.id)];
    if (filterStatus) conditions.push(eq(dataImportStagedRows.validationStatus, filterStatus));

    // Confidence-tier filter (reads from JSONB mappedData)
    if (filterTier === "held") {
      conditions.push(eq(dataImportStagedRows.importStatus, "held"));
    } else if (filterTier === "auto_accepted") {
      conditions.push(sql`${dataImportStagedRows.mappedData}->'driverMatch'->>'confidenceTier' IN ('exact','high') OR ${dataImportStagedRows.mappedData}->'driverMatch' IS NULL`);
    } else if (filterTier === "manual_required") {
      conditions.push(sql`${dataImportStagedRows.mappedData}->'driverMatch'->>'confidenceTier' IN ('low','unknown')`);
    } else if (filterTier && filterTier !== "all") {
      conditions.push(sql`${dataImportStagedRows.mappedData}->'driverMatch'->>'confidenceTier' = ${filterTier}`);
    }

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(dataImportStagedRows)
        .where(and(...conditions))
        .orderBy(dataImportStagedRows.rowIndex)
        .limit(parseInt(limit)).offset(parseInt(offset)),
      db.select({ total: count() }).from(dataImportStagedRows).where(and(...conditions)),
    ]);
    res.json({ rows, total });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get rows" });
  }
});

// GET /api/data-imports/:id/summary
router.get("/:id/summary", async (req: any, res) => {
  try {
    const [batch] = await db
      .select({ importType: dataImportBatches.importType, status: dataImportBatches.status })
      .from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    if (batch.importType === "move_report") {
      // Entry-level stats from the move_report_entries ledger
      const [entryStats] = await db.select({
        total:      count(),
        linked:     sql<number>`count(*) filter (where linked_trip_id is not null and is_superseded = false)`,
        unlinked:   sql<number>`count(*) filter (where linked_trip_id is null and is_superseded = false)`,
        superseded: sql<number>`count(*) filter (where is_superseded = true)`,
        completed:  sql<number>`count(*) filter (where lower(rc_status) not like '%cxl%' and lower(rc_status) not like '%cancel%' and is_superseded = false)`,
        cancelled:  sql<number>`count(*) filter (where (lower(rc_status) like '%cxl%' or lower(rc_status) like '%cancel%') and is_superseded = false)`,
        totalPay:   sql<string>`sum(pay_total)    filter (where is_superseded = false)`,
        totalChg:   sql<string>`sum(chg_total)    filter (where is_superseded = false)`,
        totalChgRt: sql<string>`sum(chg_total_rt) filter (where is_superseded = false)`,
        totalNet:   sql<string>`sum(net_total)    filter (where is_superseded = false)`,
        totalMinutes: sql<number>`sum(minutes)    filter (where is_superseded = false)`,
      }).from(moveReportEntries).where(eq(moveReportEntries.batchId, req.params.id));

      // Trip-level financial rollup from the canonical trips table
      const [tripStats] = await db.select({
        tripCount:      count(),
        totalRevenue:   sql<string>`sum(revenue)      filter (where revenue   is not null)`,
        totalDriverCost:sql<string>`sum(driver_cost)  filter (where driver_cost is not null)`,
        totalGrossProfit:sql<string>`sum(gross_profit) filter (where gross_profit is not null)`,
        avgRevenue:     sql<string>`avg(revenue)      filter (where revenue   is not null)`,
        totalCustomerCharges:    sql<string>`sum(customer_charges)     filter (where customer_charges    is not null)`,
        totalDriverPay:          sql<string>`sum(driver_pay)           filter (where driver_pay          is not null)`,
        totalDriverReturnCharges:sql<string>`sum(driver_return_charges) filter (where driver_return_charges is not null)`,
      }).from(trips).where(eq(trips.importBatchId as any, req.params.id));

      // Gross margin = totalGrossProfit / totalRevenue * 100
      const rev  = parseFloat(tripStats?.totalRevenue ?? "0");
      const gp   = parseFloat(tripStats?.totalGrossProfit ?? "0");
      const grossMarginPct = rev !== 0 ? ((gp / rev) * 100).toFixed(2) : null;

      return res.json({
        importType: "move_report",
        stats: entryStats,
        trips: { ...tripStats, grossMarginPct },
      });
    }

    if (batch.importType === "driver_return") {
      const [stats] = await db.select({
        total: count(),
        matched: sql<number>`count(*) filter (where parent_match_status = 'matched' and is_superseded = false)`,
        unmatched: sql<number>`count(*) filter (where parent_match_status = 'unmatched' and is_superseded = false)`,
        superseded: sql<number>`count(*) filter (where is_superseded = true)`,
        totalBilled: sql<string>`sum(customer_billed) filter (where is_superseded = false)`,
        totalBaseCost: sql<string>`sum(base_cost) filter (where is_superseded = false)`,
        completed: sql<number>`count(*) filter (where status = 'COMPLETED' and is_superseded = false)`,
        cancelled: sql<number>`count(*) filter (where status = 'CANCELLED' and is_superseded = false)`,
      }).from(driverReturnEntries).where(eq(driverReturnEntries.batchId, req.params.id));
      return res.json({ importType: "driver_return", stats });
    }

    if (batch.importType === "uber_transaction") {
      const [tripStats] = await db.select({
        totalTrips:    sql<number>`count(distinct trip_eats_id) filter (where is_superseded = false)`,
        matched:       sql<number>`count(*) filter (where match_status = 'matched' and is_superseded = false)`,
        lowConfidence: sql<number>`count(*) filter (where match_status = 'low_confidence' and is_superseded = false)`,
        unmatched:     sql<number>`count(*) filter (where match_status = 'unmatched' and is_superseded = false)`,
      }).from(uberTrips).where(eq(uberTrips.batchId, req.params.id));
      const [txStats] = await db.select({
        total:          count(),
        fares:          sql<number>`count(*) filter (where transaction_type = 'Fare' and is_superseded = false)`,
        tips:           sql<number>`count(*) filter (where transaction_type = 'Tip' and is_superseded = false)`,
        adjustments:    sql<number>`count(*) filter (where transaction_type = 'Adjustment' and is_superseded = false)`,
        fees:           sql<number>`count(*) filter (where transaction_type = 'Service & Technology Fee' and is_superseded = false)`,
        payments:       sql<number>`count(*) filter (where transaction_type = 'Payment' and is_superseded = false)`,
        totalAmountUsd: sql<string>`sum(transaction_amount_usd) filter (where is_superseded = false)`,
        totalFareUsd:   sql<string>`sum(total_fare_usd) filter (where transaction_type = 'Fare' and is_superseded = false)`,
        totalTipsUsd:   sql<string>`sum(tip_usd) filter (where transaction_type = 'Fare' and is_superseded = false)`,
      }).from(uberTransactions).where(eq(uberTransactions.batchId, req.params.id));
      return res.json({ importType: "uber_transaction", stats: { trips: tripStats, transactions: txStats } });
    }

    res.json({ importType: batch.importType, stats: null });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get summary" });
  }
});

// POST /api/data-imports/upload
router.post("/upload", upload.single("file"), async (req: any, res) => {
  try {
    const {
      importType,
      sourceSystemKey = "redcap",
      batchMode = "supplement",
      reportingPeriodStart,
      reportingPeriodEnd,
      supersedesBatchId,
      notes,
    } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!importType) return res.status(400).json({ error: "importType is required" });
    if (!["supplement", "correction", "reprocess"].includes(batchMode))
      return res.status(400).json({ error: "batchMode must be supplement | correction | reprocess" });

    const userId = getUserId(req);
    const fileBuffer = file.buffer as Buffer;
    const fileHash = computeHash(fileBuffer);

    // ── Exact-file duplicate check ─────────────────────────────────────────────
    //
    // Three scenarios govern whether the same file hash is blocked:
    //
    // SCENARIO A — System/infrastructure failure → allow retry, no friction.
    //   The prior batch never finished cleanly due to DriverHub or infrastructure:
    //   server restart, deployment, crash, timeout, network interruption, etc.
    //   The file hash must NOT be permanently reserved; the user must be able to
    //   re-upload the exact same source file and start fresh.
    //   Statuses in this group:
    //     • processing_error  — system threw during validation or import
    //     • failed            — import engine marked the batch failed
    //     • validation_failed — all rows rejected; nothing was committed
    //     • validating        — stuck mid-validation (server restart); zero rows committed
    //     • ready_for_import  — validated but never triggered; zero rows committed
    //     • importing         — crashed mid-stream; supplement mode handles idempotency
    //
    // SCENARIO B — Intentional admin action → bypass via explicit flag.
    //   batchMode === "reprocess"  — admin explicitly retrying the same file
    //   batchMode === "correction" AND supersedesBatchId set — admin replacing a prior batch
    //
    // SCENARIO C — Prior batch completed successfully → block accidental re-upload.
    //   The conflict is surfaced to the frontend (409) so the UI can offer admin actions
    //   (View, Reprocess, Replace) instead of silently blocking.
    //   Statuses in this group:
    //     • imported
    //     • completed_with_warnings
    //     • completed_with_exceptions
    //
    const RECOVERABLE_STATUSES = [
      "processing_error", "failed", "validation_failed", // explicit failure
      "validating", "ready_for_import", "importing",      // interrupted mid-flight
    ];
    const isIntentionalReuse =
      batchMode === "reprocess" ||
      (batchMode === "correction" && Boolean(supersedesBatchId));

    if (!isIntentionalReuse) {
      const [duplicate] = await db
        .select({ id: dataImportBatches.id, status: dataImportBatches.status })
        .from(dataImportBatches)
        .where(eq(dataImportBatches.fileHash, fileHash));

      if (duplicate && !RECOVERABLE_STATUSES.includes(duplicate.status)) {
        // Build a context-sensitive message so the UI can display the right copy.
        const statusLabel: Record<string, string> = {
          imported:                   "successfully imported",
          completed_with_warnings:    "imported with warnings",
          completed_with_exceptions:  "imported with held rows",
        };
        const label = statusLabel[duplicate.status] ?? duplicate.status;
        return res.status(409).json({
          error: "Duplicate upload",
          message: `This file was already ${label} (Batch ${duplicate.id.slice(0, 8)}…). Use the options below to view, reprocess, or replace it.`,
          existingBatchId: duplicate.id,
          existingStatus: duplicate.status,
        });
      }
    }

    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];
    try {
      // Uber reports have a 5-line preamble — use the dedicated parser
      const parsed = importType === "uber_transaction"
        ? parseUberTransactionCsv(fileBuffer)
        : parseBuffer(fileBuffer, file.originalname);
      headers = parsed.headers; rows = parsed.rows;
    } catch (e: any) {
      return res.status(400).json({ error: "Failed to parse file", message: e.message });
    }
    if (rows.length === 0) return res.status(400).json({ error: "File contains no data rows" });

    const batchId = randomUUID();

    // Object storage (non-fatal)
    let fileStorageKey: string | null = null;
    try {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (bucketId) {
        const client = new ReplitStorageClient({ bucketId });
        fileStorageKey = `.private/data-imports/${batchId}/${file.originalname}`;
        const result = await client.uploadFromBytes(fileStorageKey, fileBuffer);
        if (!result.ok) fileStorageKey = null;
      }
    } catch (e: any) {
      console.warn("[DataImports] Storage upload skipped:", e.message);
    }

    // Create batch record
    await db.insert(dataImportBatches).values({
      id: batchId,
      importType,
      sourceSystemKey,
      batchMode,
      supersedesBatchId: supersedesBatchId || null,
      fileName: file.originalname,
      fileSizeBytes: file.size,
      fileStorageKey,
      fileHash,
      reportingPeriodStart: reportingPeriodStart || null,
      reportingPeriodEnd: reportingPeriodEnd || null,
      importedByUserId: userId,
      recordsRead: rows.length,
      status: "validating",
      columnHeaders: headers,
      fieldMapping: {},
      notes: notes || null,
    } as any);

    // Auto-create / update period (do once, reuse for validation)
    let resolvedPeriodId: string | null = null;
    if (reportingPeriodStart && reportingPeriodEnd) {
      resolvedPeriodId = await upsertPeriod(reportingPeriodStart, reportingPeriodEnd, importType, sourceSystemKey, batchId).catch(() => null);
      if (resolvedPeriodId) await db.update(dataImportBatches).set({ periodId: resolvedPeriodId }).where(eq(dataImportBatches.id, batchId));
    }

    // Validate synchronously (full engine: duplicates, dates, financials, entity resolution)
    // Batch status distinctions:
    //   ready_for_import  — validation ran (all valid, or some warnings but not all errored)
    //   validation_failed — all rows rejected by the validation engine
    //   processing_error  — unexpected system exception during upload/validation
    // Validation status is stored separately in validation_status so it remains accurate
    // even if a later step (e.g. period upsert, import execution) changes batch status.
    let newStatus = "ready_for_import";
    let newValidationStatus = "not_validated";
    let validationResult: any = null;
    let validationErrorCount = 0;
    try {
      const v = await runValidation(batchId, rows, importType, sourceSystemKey, resolvedPeriodId, batchMode);
      validationErrorCount = v.errorRows;
      validationResult = {
        totalRows: v.totalRows, validRows: v.validRows, warningRows: v.warningRows, errorRows: v.errorRows,
        categories: v.categories,
        errors: v.errors.slice(0, 100),
      };
      if (v.errorRows > 0 && v.errorRows === v.totalRows) {
        newStatus = "validation_failed";
        newValidationStatus = "validation_failed";
      } else if (v.errorRows === 0 && v.warningRows === 0) {
        newValidationStatus = "valid";
      } else {
        newValidationStatus = "valid_with_warnings";
      }
    } catch (e: any) {
      newStatus = "processing_error";
      validationResult = { error: e instanceof Error ? e.message : String(e) };
      // newValidationStatus stays "not_validated" — validation never completed
    }

    await db.update(dataImportBatches)
      .set({ status: newStatus, validationStatus: newValidationStatus, validationResult, validationErrorCount, validatedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataImportBatches.id, batchId));

    const [created] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, batchId));
    res.status(201).json(created);
  } catch (err: any) {
    console.error("[DataImports] POST /upload:", err);
    // If the batch record was already created, mark it as processing_error so it stays visible
    // in the history and the user can find it. batchId is always set at this point because
    // parse errors return early (status 400) before we reach here.
    try {
      await db.update(dataImportBatches)
        .set({ status: "processing_error", errorMessage: err.message, updatedAt: new Date() })
        .where(eq(dataImportBatches.id, batchId));
    } catch (_) { /* best-effort — batch may not have been inserted yet */ }
    res.status(500).json({ error: "Upload failed", message: err.message, batchId });
  }
});

// POST /api/data-imports/:id/import
router.post("/:id/import", async (req: any, res) => {
  try {
    const [batch] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "importing")
      return res.status(400).json({ error: "Batch is already importing" });

    await db.update(dataImportBatches)
      .set({ status: "importing", updatedAt: new Date() })
      .where(eq(dataImportBatches.id, req.params.id));

    const mode = (batch.batchMode ?? "supplement") as "supplement" | "correction" | "reprocess";
    let result: Awaited<ReturnType<typeof importMoveReport>>;

    if (batch.importType === "move_report") {
      result = await importMoveReport(req.params.id, batch.sourceSystemKey ?? "redcap", mode);
    } else if (batch.importType === "driver_return") {
      result = await importDriverReturn(req.params.id, batch.sourceSystemKey ?? "redcap", mode);
    } else if (batch.importType === "uber_transaction") {
      result = await importUberTransaction(req.params.id, batch.sourceSystemKey ?? "uber", mode);
    } else {
      await db.update(dataImportBatches)
        .set({ status: "failed", errorMessage: `Import for '${batch.importType}' not yet implemented`, updatedAt: new Date() })
        .where(eq(dataImportBatches.id, req.params.id));
      return res.status(400).json({ error: `Import type '${batch.importType}' not yet supported` });
    }

    const recordsHeld = (result as any).recordsHeld ?? 0;
    const finalStatus = recordsHeld > 0
      ? "completed_with_exceptions"
      : result.errors.length > 0 || result.recordsSkipped > 0
      ? "completed_with_warnings"
      : "imported";

    await db.update(dataImportBatches)
      .set({
        status: finalStatus,
        recordsImported: result.recordsImported,
        recordsUpdated: result.recordsUpdated,
        recordsSkipped: result.recordsSkipped,
        importResult: { ...result, recordsHeld, errors: result.errors.slice(0, 50) },
        importedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataImportBatches.id, req.params.id));

    const [updated] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    res.json(updated);
  } catch (err: any) {
    console.error("[DataImports] POST /:id/import:", err);
    await db.update(dataImportBatches)
      .set({ status: "processing_error", errorMessage: err.message, updatedAt: new Date() })
      .where(eq(dataImportBatches.id, req.params.id));
    res.status(500).json({ error: "Import failed", message: err.message });
  }
});

// POST /api/data-imports/:id/reprocess
// Retries only the failed/skipped staged rows from this batch — never duplicates successes.
router.post("/:id/reprocess", async (req: any, res) => {
  try {
    const [batch] = await db
      .select({ importType: dataImportBatches.importType, sourceSystemKey: dataImportBatches.sourceSystemKey, status: dataImportBatches.status })
      .from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "importing")
      return res.status(400).json({ error: "Batch is already importing" });

    // Count rows eligible for reprocessing
    const [{ pending }] = await db
      .select({ pending: count() })
      .from(dataImportStagedRows)
      .where(and(
        eq(dataImportStagedRows.batchId, req.params.id),
        sql`import_status IN ('pending','failed','skipped')`
      ));
    if (pending === 0)
      return res.status(400).json({ error: "No failed or skipped rows to reprocess" });

    await db.update(dataImportBatches)
      .set({ status: "importing", updatedAt: new Date() })
      .where(eq(dataImportBatches.id, req.params.id));

    let result: Awaited<ReturnType<typeof importMoveReport>>;
    if (batch.importType === "move_report") {
      result = await importMoveReport(req.params.id, batch.sourceSystemKey ?? "redcap", "reprocess");
    } else if (batch.importType === "driver_return") {
      result = await importDriverReturn(req.params.id, batch.sourceSystemKey ?? "redcap", "reprocess");
    } else if (batch.importType === "uber_transaction") {
      result = await importUberTransaction(req.params.id, batch.sourceSystemKey ?? "uber", "reprocess");
    } else {
      await db.update(dataImportBatches)
        .set({ status: "failed", errorMessage: "Reprocess not supported for this import type", updatedAt: new Date() })
        .where(eq(dataImportBatches.id, req.params.id));
      return res.status(400).json({ error: "Reprocess not supported for this import type" });
    }

    // Accumulate totals (add to existing counts)
    const [current] = await db
      .select({ recordsImported: dataImportBatches.recordsImported, recordsUpdated: dataImportBatches.recordsUpdated, recordsSkipped: dataImportBatches.recordsSkipped })
      .from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));

    const finalStatus = result.errors.length > 0 || result.recordsSkipped > 0 ? "completed_with_warnings" : "imported";
    await db.update(dataImportBatches)
      .set({
        status: finalStatus,
        recordsImported: (current?.recordsImported ?? 0) + result.recordsImported,
        recordsUpdated: (current?.recordsUpdated ?? 0) + result.recordsUpdated,
        recordsSkipped: (current?.recordsSkipped ?? 0) + result.recordsSkipped,
        importResult: { reprocess: true, ...result, errors: result.errors.slice(0, 50) },
        importedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataImportBatches.id, req.params.id));

    const [updated] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    res.json(updated);
  } catch (err: any) {
    console.error("[DataImports] POST /:id/reprocess:", err);
    res.status(500).json({ error: "Reprocess failed", message: err.message });
  }
});

// POST /api/data-imports/:id/resolve-held
// Re-evaluates held rows using the current entity mapping state.
// Rows whose driver AND account both resolve to eligible confidence are set to pending
// and then imported via the normal reprocess path.
router.post("/:id/resolve-held", async (req: any, res) => {
  try {
    const [batch] = await db
      .select({
        id: dataImportBatches.id,
        importType: dataImportBatches.importType,
        sourceSystemKey: dataImportBatches.sourceSystemKey,
        status: dataImportBatches.status,
        recordsImported: dataImportBatches.recordsImported,
        recordsUpdated: dataImportBatches.recordsUpdated,
        recordsSkipped: dataImportBatches.recordsSkipped,
      })
      .from(dataImportBatches)
      .where(eq(dataImportBatches.id, req.params.id));

    if (!batch) return res.status(404).json({ error: "Batch not found" });

    // Load held rows
    const heldRows = await db
      .select()
      .from(dataImportStagedRows)
      .where(and(
        eq(dataImportStagedRows.batchId, req.params.id),
        eq(dataImportStagedRows.importStatus, "held")
      ));

    if (heldRows.length === 0)
      return res.json({ message: "No held rows to re-evaluate", rowsReEvaluated: 0, rowsMadeEligible: 0 });

    // Extract unique driver + account source names from held rows
    const driverSourceNames = [...new Set(
      heldRows
        .map(row => (row.mappedData as any)?.driverMatch?.sourceName as string | undefined)
        .filter(Boolean) as string[]
    )];
    const accountSourceNames = [...new Set(
      heldRows
        .map(row => (row.mappedData as any)?.accountMatch?.sourceName as string | undefined)
        .filter(Boolean) as string[]
    )];

    // Re-resolve drivers and accounts in parallel with current entity mappings
    const [driverMap, accountMap] = await Promise.all([
      resolveDriversBulk(driverSourceNames),
      resolveAccountsBulk(accountSourceNames),
    ]);

    // Update each held row's mappedData; mark newly-eligible rows as pending
    let madeEligible = 0;
    for (const row of heldRows) {
      const md = (row.mappedData ?? {}) as any;
      const driverSourceName  = md?.driverMatch?.sourceName  as string | null;
      const accountSourceName = md?.accountMatch?.sourceName as string | null;

      const newDriverMatch  = driverSourceName  ? driverMap.get(driverSourceName.toLowerCase())   : undefined;
      const newAccountMatch = accountSourceName ? accountMap.get(accountSourceName.toLowerCase())  : undefined;

      const driverTier  = newDriverMatch?.confidenceTier  ?? md?.driverMatch?.confidenceTier;
      const acctTier    = newAccountMatch?.confidenceTier ?? md?.accountMatch?.confidenceTier;

      const ELIGIBLE = ["exact", "high", "medium"];
      const driverOk  = !driverSourceName  || ELIGIBLE.includes(driverTier  ?? "");
      const acctOk    = !accountSourceName || ELIGIBLE.includes(acctTier    ?? "");
      const isNowEligible = driverOk && acctOk;

      const newMd = {
        ...md,
        ...(newDriverMatch  ? { driverMatch:  { ...md.driverMatch,  ...newDriverMatch  } } : {}),
        ...(newAccountMatch ? { accountMatch: { ...md.accountMatch, ...newAccountMatch } } : {}),
      };

      await db.update(dataImportStagedRows)
        .set({
          mappedData: newMd,
          importStatus: isNowEligible ? "pending" : "held",
          importError: isNowEligible ? null : row.importError,
        })
        .where(eq(dataImportStagedRows.id, row.id));

      if (isNowEligible) madeEligible++;
    }

    // If rows became eligible, re-import in reprocess mode
    let importResult: any = null;
    if (madeEligible > 0) {
      await db.update(dataImportBatches)
        .set({ status: "importing", updatedAt: new Date() })
        .where(eq(dataImportBatches.id, req.params.id));

      if (batch.importType === "move_report") {
        importResult = await importMoveReport(req.params.id, batch.sourceSystemKey ?? "redcap", "reprocess");
      } else if (batch.importType === "driver_return") {
        importResult = await importDriverReturn(req.params.id, batch.sourceSystemKey ?? "redcap", "reprocess");
      } else if (batch.importType === "uber_transaction") {
        importResult = await importUberTransaction(req.params.id, batch.sourceSystemKey ?? "uber", "reprocess");
      }

      const addedImported  = importResult?.recordsImported  ?? 0;
      const addedUpdated   = importResult?.recordsUpdated   ?? 0;
      const addedSkipped   = importResult?.recordsSkipped   ?? 0;
      const remainingHeld  = importResult?.recordsHeld ?? (heldRows.length - madeEligible);
      const newStatus = remainingHeld > 0 ? "completed_with_exceptions" : "imported";

      await db.update(dataImportBatches)
        .set({
          status: newStatus,
          recordsImported: (batch.recordsImported ?? 0) + addedImported,
          recordsUpdated:  (batch.recordsUpdated  ?? 0) + addedUpdated,
          recordsSkipped:  (batch.recordsSkipped  ?? 0) + addedSkipped,
          importResult:    { resolveHeld: true, ...importResult, remainingHeld, errors: (importResult?.errors ?? []).slice(0, 50) },
          importedAt:      new Date(),
          updatedAt:       new Date(),
        })
        .where(eq(dataImportBatches.id, req.params.id));
    }

    const [updated] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    res.json({ rowsReEvaluated: heldRows.length, rowsMadeEligible: madeEligible, importResult, batch: updated });
  } catch (err: any) {
    console.error("[DataImports] POST /:id/resolve-held:", err);
    res.status(500).json({ error: "Resolve held failed", message: err.message });
  }
});

// POST /api/data-imports/reconcile
router.post("/reconcile", async (req: any, res) => {
  try {
    const { periodStart, periodEnd, importType, sources } = req.body;
    if (!periodStart || !periodEnd || !importType || !Array.isArray(sources) || sources.length < 2)
      return res.status(400).json({ error: "periodStart, periodEnd, importType, and sources[] (≥2) are required" });

    const { id } = await runReconciliation(periodStart, periodEnd, importType, sources, getUserId(req));
    const [run] = await db.select().from(importReconciliationRuns).where(eq(importReconciliationRuns.id, id));
    res.status(201).json(run);
  } catch (err: any) {
    console.error("[DataImports] POST /reconcile:", err);
    res.status(500).json({ error: "Reconciliation failed", message: err.message });
  }
});

// GET /api/data-imports/reconcile/history
router.get("/reconcile/history", async (req: any, res) => {
  try {
    const runs = await db
      .select()
      .from(importReconciliationRuns)
      .orderBy(desc(importReconciliationRuns.createdAt))
      .limit(50);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list reconciliation runs" });
  }
});

// POST /api/data-imports/:id/validate  — re-run full validation from existing staged rows
router.post("/:id/validate", async (req: any, res) => {
  try {
    const [batch] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (["imported", "completed_with_warnings", "importing"].includes(batch.status))
      return res.status(400).json({ error: "Cannot re-validate a batch that has already been imported or is currently importing" });

    // Load raw rows from staging
    const stagedRows = await db.select({ rawData: dataImportStagedRows.rawData })
      .from(dataImportStagedRows)
      .where(eq(dataImportStagedRows.batchId, req.params.id))
      .orderBy(dataImportStagedRows.rowIndex);

    if (stagedRows.length === 0)
      return res.status(400).json({ error: "No staged rows found for this batch" });

    const rows = stagedRows.map(r => r.rawData as Record<string, unknown>);

    await db.update(dataImportBatches)
      .set({ status: "validating", updatedAt: new Date() })
      .where(eq(dataImportBatches.id, req.params.id));

    let newStatus = "ready_for_import";
    let newValidationStatus = "not_validated";
    let validationResult: any = null;
    let validationErrorCount = 0;
    try {
      const v = await runValidation(
        req.params.id, rows,
        batch.importType ?? "",
        batch.sourceSystemKey ?? "redcap",
        batch.periodId ?? null,
        batch.batchMode ?? "supplement",
        false
      );
      validationErrorCount = v.errorRows;
      validationResult = { totalRows: v.totalRows, validRows: v.validRows, warningRows: v.warningRows, errorRows: v.errorRows, categories: v.categories, errors: v.errors.slice(0, 100) };
      if (v.errorRows > 0 && v.errorRows === v.totalRows) {
        newStatus = "validation_failed";
        newValidationStatus = "validation_failed";
      } else if (v.errorRows === 0 && v.warningRows === 0) {
        newValidationStatus = "valid";
      } else {
        newValidationStatus = "valid_with_warnings";
      }
    } catch (e: any) {
      newStatus = "processing_error";
      validationResult = { error: e instanceof Error ? e.message : String(e) };
      console.error("[DataImports] /:id/validate runValidation error:", e instanceof Error ? e.stack : String(e));
      // newValidationStatus stays "not_validated" — validation never completed
    }

    await db.update(dataImportBatches)
      .set({ status: newStatus, validationStatus: newValidationStatus, validationResult, validationErrorCount, validatedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataImportBatches.id, req.params.id));

    const [updated] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    res.json(updated);
  } catch (err: any) {
    console.error("[DataImports] POST /:id/validate:", err);
    res.status(500).json({ error: "Re-validation failed", message: err.message });
  }
});

// GET /api/data-imports/:id/exceptions  — paginated categorized validation exceptions
router.get("/:id/exceptions", async (req: any, res) => {
  try {
    const { category = "", severity = "", limit = "100", offset = "0" } = req.query as Record<string, string>;
    const [batch] = await db.select({ importType: dataImportBatches.importType }).from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    // Load rows that have validation errors matching filters
    const conditions: any[] = [
      eq(dataImportStagedRows.batchId, req.params.id),
      isNotNull(dataImportStagedRows.validationErrors),
    ];

    const allRows = await db.select({
      id: dataImportStagedRows.id,
      rowIndex: dataImportStagedRows.rowIndex,
      validationStatus: dataImportStagedRows.validationStatus,
      validationErrors: dataImportStagedRows.validationErrors,
      importStatus: dataImportStagedRows.importStatus,
      mappedData: dataImportStagedRows.mappedData,
      rawData: dataImportStagedRows.rawData,
    }).from(dataImportStagedRows)
      .where(and(...conditions))
      .orderBy(dataImportStagedRows.rowIndex)
      .limit(5000); // cap for performance

    // Filter by category / severity in application layer
    const exceptions: any[] = [];
    for (const row of allRows) {
      const errs = (row.validationErrors as any[] | null) ?? [];
      const filtered = errs.filter(e =>
        (!category || e.category === category) &&
        (!severity || e.severity === severity)
      );
      if (filtered.length > 0) {
        exceptions.push({
          rowIndex: row.rowIndex,
          rowNumber: row.rowIndex + 1,
          validationStatus: row.validationStatus,
          importStatus: row.importStatus,
          mappedData: row.mappedData,
          errors: filtered,
        });
      }
    }

    const total = exceptions.length;
    const paged = exceptions.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    res.json({ exceptions: paged, total, categories: ["duplicate", "account", "driver", "date", "financial", "general"] });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load exceptions" });
  }
});

// GET /api/data-imports/:id/audit  — structured audit trail
router.get("/:id/audit", async (req: any, res) => {
  try {
    const [batch] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const [rowStats] = await db.select({
      total:        count(),
      valid:        sql<number>`count(*) filter (where validation_status = 'valid')`,
      warning:      sql<number>`count(*) filter (where validation_status = 'warning')`,
      error:        sql<number>`count(*) filter (where validation_status = 'error')`,
      imported:     sql<number>`count(*) filter (where import_status = 'imported')`,
      updated:      sql<number>`count(*) filter (where import_status = 'updated')`,
      failed:       sql<number>`count(*) filter (where import_status = 'failed')`,
      pending:      sql<number>`count(*) filter (where import_status = 'pending')`,
    }).from(dataImportStagedRows).where(eq(dataImportStagedRows.batchId, req.params.id));

    const importResult = batch.importResult as any;
    const resolutionEvents: any[] = importResult?.resolutionEvents ?? [];

    const timeline = [
      { event: "upload", timestamp: batch.createdAt, description: `File '${batch.fileName}' uploaded (${batch.recordsRead ?? 0} rows, ${((batch.fileSizeBytes ?? 0) / 1024).toFixed(1)} KB)` },
      batch.validatedAt ? { event: "validated", timestamp: batch.validatedAt, description: `Validation complete — ${rowStats.valid} valid, ${rowStats.warning} warnings, ${rowStats.error} errors` } : null,
      batch.importedAt ? { event: "imported", timestamp: batch.importedAt, description: `Import complete — ${batch.recordsImported ?? 0} inserted, ${batch.recordsUpdated ?? 0} updated, ${batch.recordsSkipped ?? 0} skipped` } : null,
      ...resolutionEvents.map((e: any) => ({ event: "mapping_resolved", timestamp: e.timestamp, description: e.description })),
    ].filter(Boolean).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      batch: {
        id: batch.id,
        importType: batch.importType,
        sourceSystemKey: batch.sourceSystemKey,
        batchMode: batch.batchMode,
        fileName: batch.fileName,
        fileHash: batch.fileHash,
        status: batch.status,
        notes: batch.notes,
        reportingPeriodStart: batch.reportingPeriodStart,
        reportingPeriodEnd: batch.reportingPeriodEnd,
      },
      rowStats,
      validationResult: batch.validationResult,
      importResult: batch.importResult,
      timeline,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load audit trail" });
  }
});

// DELETE /api/data-imports/:id
router.delete("/:id", async (req: any, res) => {
  try {
    const [batch] = await db
      .select({ status: dataImportBatches.status })
      .from(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (["imported", "completed_with_warnings"].includes(batch.status))
      return res.status(400).json({ error: "Cannot delete a completed import" });
    await db.delete(dataImportBatches).where(eq(dataImportBatches.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// GET /api/data-imports/entity-mappings/list
router.get("/entity-mappings/list", async (req: any, res) => {
  try {
    const { entityType = "", confidence = "", search = "", includeInactive = "", limit = "200", offset = "0" } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (includeInactive !== "1") conditions.push(eq(importEntityMappings.isActive, true));
    if (entityType) conditions.push(eq(importEntityMappings.entityType, entityType));
    if (confidence) conditions.push(eq(importEntityMappings.confidence, confidence));
    if (search) conditions.push(ilike(importEntityMappings.sourceName, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [mappings, [{ total }]] = await Promise.all([
      db.select({
        id: importEntityMappings.id,
        entityType: importEntityMappings.entityType,
        sourceName: importEntityMappings.sourceName,
        sourceSystem: importEntityMappings.sourceSystem,
        mappedEntityId: importEntityMappings.mappedEntityId,
        mappedEntityName: importEntityMappings.mappedEntityName,
        confidence: importEntityMappings.confidence,
        isActive: importEntityMappings.isActive,
        createdBy: importEntityMappings.createdBy,
        createdAt: importEntityMappings.createdAt,
        updatedAt: importEntityMappings.updatedAt,
        createdByName: sql<string | null>`NULLIF(TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, ''))), '')`,
      })
        .from(importEntityMappings)
        .leftJoin(users, eq(importEntityMappings.createdBy, users.id))
        .where(where)
        .orderBy(importEntityMappings.entityType, importEntityMappings.sourceName)
        .limit(parseInt(limit)).offset(parseInt(offset)),
      db.select({ total: count() }).from(importEntityMappings).where(where),
    ]);
    res.json({ mappings, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list mappings" });
  }
});

// GET /api/data-imports/entity-mappings/unresolved
// Returns distinct source names (account + driver) from staged rows that have no active mapping
router.get("/entity-mappings/unresolved", async (req: any, res) => {
  try {
    const { entityType = "", limit = "500" } = req.query as Record<string, string>;

    // Pull distinct (entityType, sourceName) pairs from staged rows where entity resolution
    // was not a confirmed auto-match (unknown = no match found, needs_review = fuzzy match).
    // sourceName is read from mappedData first (populated after pipeline fix), then falls back
    // to rawData field names for older batches that predate the fix.
    const accountRows = entityType === "driver" ? [] : await db.execute(sql`
      SELECT
        'account' AS entity_type,
        COALESCE(
          NULLIF(r.mapped_data -> 'accountMatch' ->> 'sourceName', ''),
          NULLIF(r.raw_data ->> 'Dealer', ''),
          NULLIF(r.raw_data ->> 'DealerName', '')
        ) AS source_name,
        (r.mapped_data -> 'accountMatch' ->> 'status') AS match_status,
        b.import_type,
        b.source_system_key,
        MAX(b.created_at) AS last_seen_at,
        COUNT(*)::int AS occurrence_count
      FROM data_import_staged_rows r
      JOIN data_import_batches b ON b.id = r.batch_id
      WHERE
        r.mapped_data IS NOT NULL
        AND (r.mapped_data -> 'accountMatch' ->> 'status') IN ('unknown', 'needs_review')
        AND COALESCE(
          NULLIF(r.mapped_data -> 'accountMatch' ->> 'sourceName', ''),
          NULLIF(r.raw_data ->> 'Dealer', ''),
          NULLIF(r.raw_data ->> 'DealerName', '')
        ) IS NOT NULL
      GROUP BY source_name, match_status, b.import_type, b.source_system_key
      ORDER BY occurrence_count DESC
      LIMIT ${parseInt(limit)}
    `);

    const driverRows = entityType === "account" ? [] : await db.execute(sql`
      SELECT
        'driver' AS entity_type,
        COALESCE(
          NULLIF(r.mapped_data -> 'driverMatch' ->> 'sourceName', ''),
          NULLIF(r.raw_data ->> 'Driver', ''),
          NULLIF(r.raw_data ->> 'DriverName', ''),
          NULLIF(r.raw_data ->> 'First Name', '') || ' ' || NULLIF(r.raw_data ->> 'Last Name', '')
        ) AS source_name,
        (r.mapped_data -> 'driverMatch' ->> 'status') AS match_status,
        b.import_type,
        b.source_system_key,
        MAX(b.created_at) AS last_seen_at,
        COUNT(*)::int AS occurrence_count
      FROM data_import_staged_rows r
      JOIN data_import_batches b ON b.id = r.batch_id
      WHERE
        r.mapped_data IS NOT NULL
        AND (r.mapped_data -> 'driverMatch' ->> 'status') IN ('unknown', 'needs_review')
        AND COALESCE(
          NULLIF(r.mapped_data -> 'driverMatch' ->> 'sourceName', ''),
          NULLIF(r.raw_data ->> 'Driver', ''),
          NULLIF(r.raw_data ->> 'DriverName', '')
        ) IS NOT NULL
      GROUP BY source_name, match_status, b.import_type, b.source_system_key
      ORDER BY occurrence_count DESC
      LIMIT ${parseInt(limit)}
    `);

    // Deduplicate by (entityType, sourceName) and cross-reference with existing active mappings
    const allSourceNames = [
      ...((accountRows as any).rows ?? []).map((r: any) => ({ entityType: r.entity_type, sourceName: r.source_name, importType: r.import_type, sourceSystem: r.source_system_key, occurrenceCount: parseInt(r.occurrence_count), lastSeenAt: r.last_seen_at })),
      ...((driverRows as any).rows ?? []).map((r: any) => ({ entityType: r.entity_type, sourceName: r.source_name, importType: r.import_type, sourceSystem: r.source_system_key, occurrenceCount: parseInt(r.occurrence_count), lastSeenAt: r.last_seen_at })),
    ];

    // Filter out any that already have an active mapping
    const hasMappings = allSourceNames.length > 0
      ? await db.select({ sourceName: importEntityMappings.sourceName, entityType: importEntityMappings.entityType })
          .from(importEntityMappings)
          .where(and(
            eq(importEntityMappings.isActive, true),
            inArray(sql`lower(${importEntityMappings.sourceName})`, allSourceNames.map(r => r.sourceName?.toLowerCase()).filter(Boolean))
          ))
      : [];
    const resolvedKeys = new Set(hasMappings.map(m => `${m.entityType}::${m.sourceName?.toLowerCase()}`));
    const unresolved = allSourceNames.filter(r => !resolvedKeys.has(`${r.entityType}::${r.sourceName?.toLowerCase()}`));

    res.json({ unresolved, total: unresolved.length });
  } catch (err: any) {
    console.error("[EntityMappings] GET /unresolved:", err);
    res.status(500).json({ error: "Failed to load unresolved mappings", message: err.message });
  }
});

// GET /api/data-imports/entity-mappings/search-targets
// Autocomplete search for accounts or drivers to use when resolving an unknown source name
router.get("/entity-mappings/search-targets", async (req: any, res) => {
  try {
    const { entityType = "account", q = "", limit = "20" } = req.query as Record<string, string>;
    if (!q || q.length < 2) return res.json({ results: [] });

    if (entityType === "account") {
      const results = await db
        .select({ id: customers.id, name: customers.customerName, number: customers.customerNumber, city: customers.city })
        .from(customers)
        .where(ilike(customers.customerName, `%${q}%`))
        .orderBy(customers.customerName)
        .limit(parseInt(limit));
      return res.json({ results: results.map(r => ({ id: r.id, name: r.name, subtitle: [r.number, r.city].filter(Boolean).join(" · ") })) });
    }

    if (entityType === "driver") {
      const results = await db
        .select({ id: drivers.id, firstName: drivers.firstName, lastName: drivers.lastName })
        .from(drivers)
        .where(
          sql`lower(concat(${drivers.firstName}, ' ', ${drivers.lastName})) like lower(${'%' + q + '%'})`
        )
        .orderBy(drivers.lastName, drivers.firstName)
        .limit(parseInt(limit));
      return res.json({ results: results.map(r => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim() })) });
    }

    res.json({ results: [] });
  } catch (err: any) {
    res.status(500).json({ error: "Search failed" });
  }
});

// ── Auto re-evaluation of held rows when a mapping is saved ───────────────────
// After a driver or account mapping is created/updated, find all batches with
// held rows that reference that source name and re-import the newly-eligible ones.
// Runs fire-and-forget after the HTTP response is sent.
async function reEvaluateHeldRowsForMapping(
  entityType: "driver" | "account",
  sourceName: string,
  mappedEntityName: string | null
): Promise<void> {
  try {
    const jsonPath = entityType === "driver" ? `mapped_data->'driverMatch'->>'sourceName'` : `mapped_data->'accountMatch'->>'sourceName'`;
    // Find held rows across all batches with this source name
    const matchingRows = await db.execute(sql`
      SELECT r.id, r.batch_id, r.mapped_data, r.validation_errors,
             b.import_type, b.source_system_key,
             b.records_imported, b.records_updated, b.records_skipped, b.import_result
      FROM data_import_staged_rows r
      JOIN data_import_batches b ON b.id = r.batch_id
      WHERE r.import_status = 'held'
        AND lower(${sql.raw(jsonPath)}) = lower(${sourceName})
        AND b.status = 'completed_with_exceptions'
    `);

    if (!matchingRows.rows.length) return;

    // Group by batch
    const byBatch = new Map<string, any[]>();
    for (const row of matchingRows.rows as any[]) {
      if (!byBatch.has(row.batch_id)) byBatch.set(row.batch_id, []);
      byBatch.get(row.batch_id)!.push(row);
    }

    // For each affected batch, re-resolve and re-import
    for (const [batchId, rows] of byBatch) {
      const firstRow = rows[0];

      // Re-resolve all held rows in this batch (not just those matching this name —
      // some other entity on the row may also have been blocking it)
      const allHeldRows = await db
        .select()
        .from(dataImportStagedRows)
        .where(and(
          eq(dataImportStagedRows.batchId, batchId),
          eq(dataImportStagedRows.importStatus, "held")
        ));

      const driverSourceNames = [...new Set(
        allHeldRows.map(r => (r.mappedData as any)?.driverMatch?.sourceName as string | undefined).filter(Boolean) as string[]
      )];
      const accountSourceNames = [...new Set(
        allHeldRows.map(r => (r.mappedData as any)?.accountMatch?.sourceName as string | undefined).filter(Boolean) as string[]
      )];

      const [driverMap, accountMap] = await Promise.all([
        resolveDriversBulk(driverSourceNames),
        resolveAccountsBulk(accountSourceNames),
      ]);

      const ELIGIBLE = ["exact", "high", "medium"];
      let madeEligible = 0;

      for (const row of allHeldRows) {
        const md = (row.mappedData ?? {}) as any;
        const driverSN  = md?.driverMatch?.sourceName  as string | null;
        const accountSN = md?.accountMatch?.sourceName as string | null;
        const newDriverMatch  = driverSN  ? driverMap.get(driverSN.toLowerCase())   : undefined;
        const newAccountMatch = accountSN ? accountMap.get(accountSN.toLowerCase()) : undefined;
        const driverTier  = newDriverMatch?.confidenceTier  ?? md?.driverMatch?.confidenceTier;
        const acctTier    = newAccountMatch?.confidenceTier ?? md?.accountMatch?.confidenceTier;
        const driverOk  = !driverSN  || ELIGIBLE.includes(driverTier  ?? "");
        const acctOk    = !accountSN || ELIGIBLE.includes(acctTier    ?? "");
        const isNowEligible = driverOk && acctOk;

        const newMd = {
          ...md,
          ...(newDriverMatch  ? { driverMatch:  { ...md.driverMatch,  ...newDriverMatch  } } : {}),
          ...(newAccountMatch ? { accountMatch: { ...md.accountMatch, ...newAccountMatch } } : {}),
        };

        await db.update(dataImportStagedRows)
          .set({ mappedData: newMd, importStatus: isNowEligible ? "pending" : "held", importError: isNowEligible ? null : row.importError })
          .where(eq(dataImportStagedRows.id, row.id));

        if (isNowEligible) madeEligible++;
      }

      if (madeEligible === 0) continue;

      await db.update(dataImportBatches).set({ status: "importing", updatedAt: new Date() }).where(eq(dataImportBatches.id, batchId));

      let importResult: any = null;
      if (firstRow.import_type === "move_report") {
        importResult = await importMoveReport(batchId, firstRow.source_system_key ?? "redcap", "reprocess");
      } else if (firstRow.import_type === "driver_return") {
        importResult = await importDriverReturn(batchId, firstRow.source_system_key ?? "redcap", "reprocess");
      } else if (firstRow.import_type === "uber_transaction") {
        importResult = await importUberTransaction(batchId, firstRow.source_system_key ?? "uber", "reprocess");
      }

      const remainingHeld = importResult?.recordsHeld ?? (allHeldRows.length - madeEligible);
      const newStatus     = remainingHeld > 0 ? "completed_with_exceptions" : "imported";

      // Append audit event to importResult
      const prevImportResult = firstRow.import_result ?? {};
      const prevEvents: any[] = prevImportResult.resolutionEvents ?? [];
      const auditEvent = {
        timestamp: new Date().toISOString(),
        entityType,
        sourceName,
        mappedEntityName,
        rowsMadeEligible: madeEligible,
        remainingHeld,
        description: `${madeEligible} held row(s) resolved automatically — ${entityType} mapping saved for '${sourceName}' → '${mappedEntityName ?? "?"}'`,
      };

      await db.update(dataImportBatches)
        .set({
          status: newStatus,
          recordsImported: (firstRow.records_imported ?? 0) + (importResult?.recordsImported ?? 0),
          recordsUpdated:  (firstRow.records_updated  ?? 0) + (importResult?.recordsUpdated  ?? 0),
          recordsSkipped:  (firstRow.records_skipped  ?? 0) + (importResult?.recordsSkipped  ?? 0),
          importResult:    { ...prevImportResult, ...importResult, remainingHeld, resolutionEvents: [...prevEvents, auditEvent], errors: (importResult?.errors ?? []).slice(0, 50) },
          importedAt:      new Date(),
          updatedAt:       new Date(),
        })
        .where(eq(dataImportBatches.id, batchId));

      console.log(`[EntityMapping] Auto-resolved ${madeEligible} held rows in batch ${batchId} after ${entityType} mapping saved for '${sourceName}'`);
    }
  } catch (err: any) {
    console.error("[EntityMapping] reEvaluateHeldRowsForMapping error:", err?.message ?? err);
  }
}

// POST /api/data-imports/entity-mappings — create manual mapping
router.post("/entity-mappings", async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const { entityType, sourceName, sourceSystem = "redcap", mappedEntityId, mappedEntityName, confidence = "manual" } = req.body;
    if (!entityType || !sourceName || !mappedEntityId)
      return res.status(400).json({ error: "entityType, sourceName, and mappedEntityId are required" });
    if (!["account", "driver"].includes(entityType))
      return res.status(400).json({ error: "entityType must be 'account' or 'driver'" });

    // Deactivate any existing mapping for the same (entityType, sourceName)
    await db.update(importEntityMappings)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(importEntityMappings.entityType, entityType),
        sql`lower(${importEntityMappings.sourceName}) = lower(${sourceName})`,
        eq(importEntityMappings.isActive, true),
      ));

    const [mapping] = await db.insert(importEntityMappings).values({
      entityType,
      sourceName: sourceName.trim(),
      sourceSystem,
      mappedEntityId,
      mappedEntityName: mappedEntityName ?? null,
      confidence,
      isActive: true,
      createdBy: userId ?? null,
    } as any).returning();

    // Respond immediately, then resolve held rows in the background
    res.status(201).json(mapping);
    reEvaluateHeldRowsForMapping(entityType as "driver" | "account", sourceName.trim(), mappedEntityName ?? null)
      .catch(e => console.error("[EntityMapping] Background re-eval error:", e?.message));
  } catch (err: any) {
    console.error("[EntityMappings] POST /:", err);
    res.status(500).json({ error: "Failed to create mapping" });
  }
});

// PATCH /api/data-imports/entity-mappings/:id — update mapping
router.patch("/entity-mappings/:id", async (req: any, res) => {
  try {
    const { mappedEntityId, mappedEntityName, confidence, isActive } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (mappedEntityId !== undefined) updates.mappedEntityId = mappedEntityId;
    if (mappedEntityName !== undefined) updates.mappedEntityName = mappedEntityName;
    if (confidence !== undefined) updates.confidence = confidence;
    if (isActive !== undefined) updates.isActive = isActive;

    // Fetch current mapping before update to get entityType + sourceName for re-evaluation
    const [existing] = await db.select({
      entityType: importEntityMappings.entityType,
      sourceName: importEntityMappings.sourceName,
    }).from(importEntityMappings).where(eq(importEntityMappings.id, req.params.id));

    const [updated] = await db.update(importEntityMappings)
      .set(updates)
      .where(eq(importEntityMappings.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Mapping not found" });

    // Respond immediately, then resolve held rows in the background
    res.json(updated);
    if (existing && (mappedEntityId !== undefined || mappedEntityName !== undefined)) {
      reEvaluateHeldRowsForMapping(
        existing.entityType as "driver" | "account",
        existing.sourceName,
        mappedEntityName ?? updated.mappedEntityName ?? null
      ).catch(e => console.error("[EntityMapping] Background re-eval error:", e?.message));
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update mapping" });
  }
});

// DELETE /api/data-imports/entity-mappings/:id — deactivate mapping
router.delete("/entity-mappings/:id", async (req: any, res) => {
  try {
    const [updated] = await db.update(importEntityMappings)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(importEntityMappings.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Mapping not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to deactivate mapping" });
  }
});

export default router;
