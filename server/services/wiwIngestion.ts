import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { db } from "../db";
import { ENV_LOG_PREFIX } from "../config/environment";
import {
  wiwImportRuns, wiwScheduleRows, wiwAttendanceRows, wiwEmployeeMap,
  wiwScheduleRowsRaw, wiwAttendanceRowsRaw,
  wiwLocationMap, wiwRoleMap,
  shifts, shiftAssignments, timePunches, shiftActuals,
  employees, users,
} from "@shared/schema";
import { eq, sql, and, ilike, or, desc, asc, count, sum, avg } from "drizzle-orm";

function hashRow(data: Record<string, any>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

interface RowValidationError {
  rowNumber: number;
  field: string;
  reason: string;
}

interface ParsedScheduleRow {
  rowNumber: number;
  employeeName: string | null;
  employeeEmail: string | null;
  wiwUserId: string | null;
  shiftDate: string | null;
  startTime: Date | null;
  endTime: Date | null;
  scheduledHours: string | null;
  position: string | null;
  locationName: string | null;
  notes: string | null;
  isPublished: boolean;
  rawData: Record<string, any>;
  validationErrors: RowValidationError[];
}

interface ParsedAttendanceRow {
  rowNumber: number;
  employeeName: string | null;
  employeeEmail: string | null;
  wiwUserId: string | null;
  noticeType: string | null;
  noticeDate: string | null;
  noticeTime: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  actualHours: string | null;
  varianceMinutes: number | null;
  locationName: string | null;
  position: string | null;
  details: string | null;
  rawData: Record<string, any>;
  validationErrors: RowValidationError[];
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function findColumn(headers: Record<string, string>, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const norm = normalizeHeader(c);
    if (headers[norm]) return headers[norm];
  }
  return null;
}

function excelSerialToDate(serial: number): Date | null {
  try {
    if (serial < 1 || serial > 2958465) return null;
    const epoch = new Date(Date.UTC(1899, 11, 31)); // Dec 31, 1899 — serial 1 = Jan 1, 1900
    const adjusted = serial > 60 ? serial - 1 : serial;
    const ms = epoch.getTime() + adjusted * 86400000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    return excelSerialToDate(val);
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOnly(val: any): string | null {
  const d = parseExcelDate(val);
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function parseHours(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(n) ? null : n.toFixed(2);
}

function classifyNoticeType(raw: string | null | undefined): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase();
  if (lower.includes("late")) return "late";
  if (lower.includes("miss") || lower.includes("no show") || lower.includes("no-show") || lower.includes("noshow")) return lower.includes("punch") ? "missed_punch" : "no_show";
  if (lower.includes("early") && lower.includes("out")) return "early_out";
  if (lower.includes("unscheduled")) return "unscheduled";
  if (lower.includes("absent")) return "no_show";
  return "other";
}

export function parseScheduleXLSX(buffer: Buffer): ParsedScheduleRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("No sheet found in workbook");

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rawRows.length === 0) throw new Error("No data rows found in schedule file");

  const sampleHeaders = Object.keys(rawRows[0]);
  const headerMap: Record<string, string> = {};
  for (const h of sampleHeaders) {
    headerMap[normalizeHeader(h)] = h;
  }

  const employeeCol = findColumn(headerMap, "employee", "employee_name", "name", "worker", "staff", "team_member", "first_last");
  const emailCol = findColumn(headerMap, "email", "employee_email", "e_mail");
  const userIdCol = findColumn(headerMap, "user_id", "wiw_id", "employee_id", "id");
  const dateCol = findColumn(headerMap, "date", "shift_date", "scheduled_date", "day");
  const startCol = findColumn(headerMap, "start", "start_time", "shift_start", "scheduled_start", "start_date_time");
  const endCol = findColumn(headerMap, "end", "end_time", "shift_end", "scheduled_end", "end_date_time");
  const hoursCol = findColumn(headerMap, "hours", "scheduled_hours", "total_hours", "duration");
  const positionCol = findColumn(headerMap, "position", "role", "job", "job_title", "title");
  const locationCol = findColumn(headerMap, "location", "location_name", "schedule", "site", "workplace");
  const notesCol = findColumn(headerMap, "notes", "note", "comments", "comment");
  const publishedCol = findColumn(headerMap, "published", "is_published", "status");

  const results: ParsedScheduleRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const startTime = startCol ? parseExcelDate(row[startCol]) : null;
    const endTime = endCol ? parseExcelDate(row[endCol]) : null;

    let hours = hoursCol ? parseHours(row[hoursCol]) : null;
    if (!hours && startTime && endTime) {
      const diff = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      if (diff > 0) hours = diff.toFixed(2);
    }

    const employeeName = employeeCol ? String(row[employeeCol] || "").trim() || null : null;
    const shiftDate = dateCol ? parseDateOnly(row[dateCol]) : (startTime ? startTime.toISOString().split("T")[0] : null);
    const position = positionCol ? String(row[positionCol] || "").trim() || null : null;
    const locationName = locationCol ? String(row[locationCol] || "").trim() || null : null;

    const validationErrors: RowValidationError[] = [];
    if (!employeeName) {
      validationErrors.push({ rowNumber: i + 1, field: "employee", reason: "Missing employee name" });
    }
    if (!shiftDate) {
      validationErrors.push({ rowNumber: i + 1, field: "date", reason: "Missing or unparseable shift date" });
    }
    if (!startTime) {
      validationErrors.push({ rowNumber: i + 1, field: "start", reason: "Missing or unparseable start time" });
    }
    if (!endTime) {
      validationErrors.push({ rowNumber: i + 1, field: "end", reason: "Missing or unparseable end time" });
    }
    if (!locationName && !position) {
      validationErrors.push({ rowNumber: i + 1, field: "location/position", reason: "Neither location nor position present" });
    }

    results.push({
      rowNumber: i + 1,
      employeeName,
      employeeEmail: emailCol ? String(row[emailCol] || "").trim().toLowerCase() || null : null,
      wiwUserId: userIdCol ? String(row[userIdCol] || "").trim() || null : null,
      shiftDate,
      startTime,
      endTime,
      scheduledHours: hours,
      position,
      locationName,
      notes: notesCol ? String(row[notesCol] || "").trim() || null : null,
      isPublished: publishedCol ? String(row[publishedCol]).toLowerCase() !== "false" && String(row[publishedCol]).toLowerCase() !== "unpublished" : true,
      rawData: row,
      validationErrors,
    });
  }
  return results;
}

export function parseAttendanceCSV(buffer: Buffer): ParsedAttendanceRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("No sheet found in file");

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rawRows.length === 0) throw new Error("No data rows found in attendance file");

  const sampleHeaders = Object.keys(rawRows[0]);
  const headerMap: Record<string, string> = {};
  for (const h of sampleHeaders) {
    headerMap[normalizeHeader(h)] = h;
  }

  const employeeCol = findColumn(headerMap, "employee", "employee_name", "name", "worker", "staff");
  const emailCol = findColumn(headerMap, "email", "employee_email");
  const userIdCol = findColumn(headerMap, "user_id", "wiw_id", "employee_id");
  const typeCol = findColumn(headerMap, "type", "notice_type", "attendance_type", "exception_type", "reason", "category");
  const dateCol = findColumn(headerMap, "date", "notice_date", "shift_date", "day");
  const timeCol = findColumn(headerMap, "time", "notice_time", "event_time");
  const schedStartCol = findColumn(headerMap, "scheduled_start", "shift_start", "start_time");
  const schedEndCol = findColumn(headerMap, "scheduled_end", "shift_end", "end_time");
  const actualStartCol = findColumn(headerMap, "actual_start", "clock_in", "punch_in", "actual_clock_in");
  const actualEndCol = findColumn(headerMap, "actual_end", "clock_out", "punch_out", "actual_clock_out");
  const actualHoursCol = findColumn(headerMap, "actual_hours", "hours_worked", "total_hours");
  const varianceCol = findColumn(headerMap, "variance", "variance_minutes", "difference", "diff_minutes");
  const locationCol = findColumn(headerMap, "location", "location_name", "schedule", "site");
  const positionCol = findColumn(headerMap, "position", "role", "job");
  const detailsCol = findColumn(headerMap, "details", "description", "notes", "comment", "message");

  const results: ParsedAttendanceRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rawType = typeCol ? String(row[typeCol] || "") : null;

    const employeeName = employeeCol ? String(row[employeeCol] || "").trim() || null : null;
    const noticeDate = dateCol ? parseDateOnly(row[dateCol]) : null;
    const noticeType = classifyNoticeType(rawType);
    const actualStart = actualStartCol ? parseExcelDate(row[actualStartCol]) : null;
    const actualEnd = actualEndCol ? parseExcelDate(row[actualEndCol]) : null;

    const validationErrors: RowValidationError[] = [];
    if (!employeeName) {
      validationErrors.push({ rowNumber: i + 1, field: "employee", reason: "Missing employee name" });
    }
    if (!noticeDate) {
      validationErrors.push({ rowNumber: i + 1, field: "date", reason: "Missing or unparseable notice date" });
    }
    if (!actualStart && !actualEnd && noticeType === "other" && !rawType) {
      validationErrors.push({ rowNumber: i + 1, field: "clock_in_out/exception", reason: "No clock-in/out times and no exception code present" });
    }

    results.push({
      rowNumber: i + 1,
      employeeName,
      employeeEmail: emailCol ? String(row[emailCol] || "").trim().toLowerCase() || null : null,
      wiwUserId: userIdCol ? String(row[userIdCol] || "").trim() || null : null,
      noticeType,
      noticeDate,
      noticeTime: timeCol ? parseExcelDate(row[timeCol]) : null,
      scheduledStart: schedStartCol ? parseExcelDate(row[schedStartCol]) : null,
      scheduledEnd: schedEndCol ? parseExcelDate(row[schedEndCol]) : null,
      actualStart,
      actualEnd,
      actualHours: actualHoursCol ? parseHours(row[actualHoursCol]) : null,
      varianceMinutes: varianceCol ? (typeof row[varianceCol] === "number" ? Math.round(row[varianceCol]) : parseInt(String(row[varianceCol])) || null) : null,
      locationName: locationCol ? String(row[locationCol] || "").trim() || null : null,
      position: positionCol ? String(row[positionCol] || "").trim() || null : null,
      details: detailsCol ? String(row[detailsCol] || "").trim() || null : null,
      rawData: row,
      validationErrors,
    });
  }
  return results;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

async function matchEmployees(rows: { employeeName: string | null; employeeEmail: string | null }[]): Promise<Map<string, { employeeId: string | null; userId: string | null; confidence: string; method: string }>> {
  const results = new Map<string, { employeeId: string | null; userId: string | null; confidence: string; method: string }>();

  const existingMaps = await db.select().from(wiwEmployeeMap);
  const mapByName = new Map<string, typeof existingMaps[0]>();
  for (const m of existingMaps) {
    mapByName.set(normalizeName(m.wiwEmployeeName), m);
  }

  const allEmployees = await db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    email: employees.email,
  }).from(employees);

  const allUsers = await db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
  }).from(users);

  const uniqueNames = new Set<string>();
  for (const row of rows) {
    if (row.employeeName) uniqueNames.add(normalizeName(row.employeeName));
  }

  for (const rawName of Array.from(uniqueNames)) {
    const existing = mapByName.get(rawName);
    if (existing) {
      results.set(rawName, {
        employeeId: existing.driverhubEmployeeId,
        userId: existing.driverhubUserId,
        confidence: existing.confidence || "1.00",
        method: existing.matchMethod || "cached",
      });
      continue;
    }

    const originalRow = rows.find(r => r.employeeName && normalizeName(r.employeeName) === rawName);
    const email = originalRow?.employeeEmail;

    if (email) {
      const empByEmail = allEmployees.find(e => e.email?.toLowerCase() === email);
      if (empByEmail) {
        results.set(rawName, { employeeId: empByEmail.id, userId: null, confidence: "0.95", method: "auto" });
        continue;
      }
      const userByEmail = allUsers.find(u => u.email?.toLowerCase() === email);
      if (userByEmail) {
        results.set(rawName, { employeeId: null, userId: userByEmail.id, confidence: "0.90", method: "auto" });
        continue;
      }
    }

    const parts = rawName.split(" ");
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const empByName = allEmployees.find(e =>
        normalizeName(e.firstName || "").startsWith(firstName) &&
        normalizeName(e.lastName || "").startsWith(lastName)
      );
      if (empByName) {
        results.set(rawName, { employeeId: empByName.id, userId: null, confidence: "0.75", method: "auto" });
        continue;
      }
    }

    results.set(rawName, { employeeId: null, userId: null, confidence: "0.00", method: "unmatched" });
  }

  return results;
}

function normalizeLocationName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeRoleName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function upsertLocationsAndRoles(rows: { locationName: string | null; position: string | null }[]): Promise<void> {
  const uniqueLocations = new Set<string>();
  const uniqueRoles = new Set<string>();

  for (const row of rows) {
    if (row.locationName) uniqueLocations.add(row.locationName);
    if (row.position) uniqueRoles.add(row.position);
  }

  for (const loc of uniqueLocations) {
    try {
      await db.insert(wiwLocationMap).values({
        wiwLocationName: loc,
        normalizedName: normalizeLocationName(loc),
      }).onConflictDoNothing();
    } catch (err) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to upsert location "${loc}":`, err);
    }
  }

  for (const role of uniqueRoles) {
    try {
      await db.insert(wiwRoleMap).values({
        wiwRoleName: role,
        normalizedName: normalizeRoleName(role),
      }).onConflictDoNothing();
    } catch (err) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to upsert role "${role}":`, err);
    }
  }
}

function computeShiftRowHash(row: ParsedScheduleRow): string {
  const key = [
    row.employeeName || "",
    row.shiftDate || "",
    row.startTime?.toISOString() || "",
    row.endTime?.toISOString() || "",
    row.locationName || "",
    row.position || "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

function calculateScheduledHours(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return null;
  const hours = diffMs / (1000 * 60 * 60);
  return hours.toFixed(2);
}

async function transformScheduleRowsToShifts(
  importRunId: string,
  validRows: ParsedScheduleRow[],
  matches: Map<string, { employeeId: string | null; userId: string | null; confidence: string; method: string }>
): Promise<{ created: number; skippedDuplicates: number; assignments: number }> {
  let created = 0;
  let skippedDuplicates = 0;
  let assignmentsCreated = 0;

  const locationMapEntries = await db.select().from(wiwLocationMap);
  const locationLookup = new Map<string, string | null>();
  for (const entry of locationMapEntries) {
    locationLookup.set(entry.wiwLocationName, entry.workLocationId);
  }

  const batchSize = 50;
  for (let i = 0; i < validRows.length; i += batchSize) {
    const batch = validRows.slice(i, i + batchSize);

    for (const row of batch) {
      const rowHash = computeShiftRowHash(row);
      const scheduledHours = row.scheduledHours || calculateScheduledHours(row.startTime, row.endTime);
      const locationId = row.locationName ? (locationLookup.get(row.locationName) || null) : null;

      try {
        const [inserted] = await db.insert(shifts).values({
          date: row.shiftDate!,
          startTime: row.startTime!,
          endTime: row.endTime!,
          scheduledHours: scheduledHours,
          locationId: locationId,
          roleName: row.position || null,
          status: row.isPublished ? "published" : "draft",
          notes: row.notes || null,
          sourceSystem: "WhenIWork",
          sourceImportRunId: importRunId,
          sourceRowHash: rowHash,
        }).onConflictDoNothing({ target: shifts.sourceRowHash }).returning({ id: shifts.id });

        let shiftId: string;

        if (inserted) {
          created++;
          shiftId = inserted.id;

          const normalizedName = row.employeeName ? normalizeName(row.employeeName) : "";
          const match = normalizedName ? matches.get(normalizedName) : undefined;

          if (match && match.userId) {
            try {
              await db.insert(shiftAssignments).values({
                shiftId: shiftId,
                userId: match.userId,
                employeeId: match.employeeId || null,
                status: "assigned",
                scheduledHours: scheduledHours,
              });
              assignmentsCreated++;
            } catch (assignErr) {
              console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to create shift assignment for shift ${shiftId}:`, assignErr);
            }
          }
        } else {
          skippedDuplicates++;
          const [existing] = await db.select({ id: shifts.id }).from(shifts)
            .where(eq(shifts.sourceRowHash, rowHash));
          shiftId = existing?.id || "";
        }

        if (shiftId && row.rowNumber) {
          await db.update(wiwScheduleRows).set({
            matchedShiftId: shiftId,
          }).where(
            and(
              eq(wiwScheduleRows.importRunId, importRunId),
              eq(wiwScheduleRows.rowNumber, row.rowNumber)
            )
          );
        }
      } catch (err) {
        console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to create shift for row ${row.rowNumber}:`, err);
      }
    }
  }

  console.log(`${ENV_LOG_PREFIX}[WIW] Shift transform complete: ${created} created, ${skippedDuplicates} duplicates skipped, ${assignmentsCreated} assignments`);
  return { created, skippedDuplicates, assignments: assignmentsCreated };
}

export async function processScheduleImport(
  buffer: Buffer,
  fileName: string,
  userId: string
): Promise<{ importRunId: string; totalRows: number; matched: number; unmatched: number }> {
  const rows = parseScheduleXLSX(buffer);

  const dates = rows.map(r => r.shiftDate).filter(Boolean) as string[];
  const dateRangeStart = dates.length > 0 ? dates.sort()[0] : null;
  const dateRangeEnd = dates.length > 0 ? dates.sort()[dates.length - 1] : null;

  const [importRun] = await db.insert(wiwImportRuns).values({
    importType: "schedule",
    fileName,
    status: "processing",
    totalRows: rows.length,
    dateRangeStart,
    dateRangeEnd,
    importedBy: userId,
  }).returning();

  try {
    const rawBatchSize = 100;
    for (let i = 0; i < rows.length; i += rawBatchSize) {
      const rawBatch = rows.slice(i, i + rawBatchSize).map((row, idx) => ({
        importRunId: importRun.id,
        rowIndex: i + idx,
        rowJson: row.rawData,
        rowHash: hashRow(row.rawData),
      }));
      await db.insert(wiwScheduleRowsRaw).values(rawBatch);
    }

    const validRows = rows.filter(r => r.validationErrors.length === 0);
    const failedRows = rows.filter(r => r.validationErrors.length > 0);
    const validationErrors = failedRows.flatMap(r => r.validationErrors);

    if (failedRows.length > 0) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Schedule import ${importRun.id}: ${failedRows.length} rows failed validation`);
      for (const err of validationErrors) {
        console.warn(`${ENV_LOG_PREFIX}[WIW]   Row ${err.rowNumber}: ${err.field} - ${err.reason}`);
      }
    }

    const matches = await matchEmployees(validRows);

    let matched = 0;
    let unmatched = 0;

    const batchSize = 50;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      const insertValues = batch.map(row => {
        const normalizedName = row.employeeName ? normalizeName(row.employeeName) : "";
        const match = matches.get(normalizedName);
        const isMatched = match && (match.employeeId || match.userId);
        if (isMatched) matched++; else unmatched++;

        if (match && match.method !== "cached" && match.employeeId) {
          db.insert(wiwEmployeeMap).values({
            wiwEmployeeName: row.employeeName || "Unknown",
            wiwEmployeeEmail: row.employeeEmail,
            wiwUserId: row.wiwUserId,
            driverhubEmployeeId: match.employeeId,
            driverhubUserId: match.userId,
            matchMethod: match.method,
            confidence: match.confidence,
          }).onConflictDoNothing().catch(() => {});
        }

        return {
          importRunId: importRun.id,
          rowNumber: row.rowNumber,
          employeeName: row.employeeName,
          employeeEmail: row.employeeEmail,
          wiwUserId: row.wiwUserId,
          shiftDate: row.shiftDate,
          startTime: row.startTime,
          endTime: row.endTime,
          scheduledHours: row.scheduledHours,
          position: row.position,
          locationName: row.locationName,
          notes: row.notes,
          isPublished: row.isPublished,
          matchedEmployeeId: match?.employeeId || null,
          matchStatus: isMatched ? "matched" : "unmatched",
          rawData: row.rawData,
        };
      });

      await db.insert(wiwScheduleRows).values(insertValues);
    }

    await upsertLocationsAndRoles(validRows);

    const shiftResult = await transformScheduleRowsToShifts(importRun.id, validRows, matches);

    const dedupMatched = new Set(validRows.filter(r => r.employeeName && matches.get(normalizeName(r.employeeName))?.employeeId).map(r => normalizeName(r.employeeName!))).size;
    const dedupUnmatched = new Set(validRows.filter(r => r.employeeName && !matches.get(normalizeName(r.employeeName))?.employeeId).map(r => normalizeName(r.employeeName!))).size;

    await db.update(wiwImportRuns).set({
      status: failedRows.length > 0 ? "partial" : "completed",
      processedRows: validRows.length,
      errorRows: failedRows.length,
      matchedEmployees: dedupMatched,
      unmatchedEmployees: dedupUnmatched,
      errorLog: validationErrors.length > 0 ? validationErrors : null,
      completedAt: new Date(),
    }).where(eq(wiwImportRuns.id, importRun.id));

    return {
      importRunId: importRun.id,
      totalRows: rows.length,
      rawRowsStored: rows.length,
      validRows: validRows.length,
      failedRows: failedRows.length,
      matched: dedupMatched,
      unmatched: dedupUnmatched,
      shiftsCreated: shiftResult.created,
      shiftsDeduplicated: shiftResult.skippedDuplicates,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  } catch (error: any) {
    await db.update(wiwImportRuns).set({
      status: "failed",
      errorLog: [{ error: error.message }],
    }).where(eq(wiwImportRuns.id, importRun.id));
    throw error;
  }
}

function computeAttendanceRowHash(row: ParsedAttendanceRow): string {
  const key = [
    row.employeeName || "",
    row.noticeDate || "",
    row.noticeType || "",
    row.actualStart?.toISOString() || "",
    row.actualEnd?.toISOString() || "",
    row.locationName || "",
    row.position || "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

function calculateWorkedHours(clockIn: Date | null, clockOut: Date | null): string | null {
  if (!clockIn || !clockOut) return null;
  const diffMs = clockOut.getTime() - clockIn.getTime();
  if (diffMs <= 0) return null;
  const hours = diffMs / (1000 * 60 * 60);
  return hours.toFixed(2);
}

async function transformAttendanceRowsToTimePunches(
  importRunId: string,
  validRows: ParsedAttendanceRow[],
  matches: Map<string, { employeeId: string | null; userId: string | null; confidence: string; method: string }>
): Promise<{ created: number; skippedDuplicates: number; skippedNoPunchData: number }> {
  let created = 0;
  let skippedDuplicates = 0;
  let skippedNoPunchData = 0;

  for (const row of validRows) {
    const hasPunchData = row.actualStart || row.actualEnd || row.noticeType;
    if (!hasPunchData) {
      skippedNoPunchData++;
      continue;
    }

    const rowHash = computeAttendanceRowHash(row);
    const workedHours = row.actualHours || calculateWorkedHours(row.actualStart, row.actualEnd);
    const normalizedName = row.employeeName ? normalizeName(row.employeeName) : "";
    const match = normalizedName ? matches.get(normalizedName) : undefined;

    try {
      const [inserted] = await db.insert(timePunches).values({
        employeeId: match?.employeeId || null,
        userId: match?.userId || null,
        employeeName: row.employeeName || null,
        clockIn: row.actualStart || null,
        clockOut: row.actualEnd || null,
        workedHours: workedHours,
        punchDate: row.noticeDate!,
        exceptionType: row.noticeType || null,
        exceptionDetails: row.details || null,
        locationName: row.locationName || null,
        position: row.position || null,
        sourceSystem: "WhenIWork",
        sourceImportRunId: importRunId,
        sourceRowHash: rowHash,
      }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning({ id: timePunches.id });

      if (inserted) {
        created++;

        if (row.rowNumber) {
          await db.update(wiwAttendanceRows).set({
            matchedShiftId: inserted.id,
          }).where(
            and(
              eq(wiwAttendanceRows.importRunId, importRunId),
              eq(wiwAttendanceRows.rowNumber, row.rowNumber)
            )
          );
        }
      } else {
        skippedDuplicates++;

        if (row.rowNumber) {
          const [existing] = await db.select({ id: timePunches.id }).from(timePunches)
            .where(eq(timePunches.sourceRowHash, rowHash));
          if (existing) {
            await db.update(wiwAttendanceRows).set({
              matchedShiftId: existing.id,
            }).where(
              and(
                eq(wiwAttendanceRows.importRunId, importRunId),
                eq(wiwAttendanceRows.rowNumber, row.rowNumber)
              )
            );
          }
        }
      }
    } catch (err) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to create time punch for row ${row.rowNumber}:`, err);
    }
  }

  console.log(`${ENV_LOG_PREFIX}[WIW] Time punch transform complete: ${created} created, ${skippedDuplicates} duplicates skipped, ${skippedNoPunchData} skipped (no punch data)`);
  return { created, skippedDuplicates, skippedNoPunchData };
}

export async function processAttendanceImport(
  buffer: Buffer,
  fileName: string,
  userId: string
): Promise<{ importRunId: string; totalRows: number; matched: number; unmatched: number }> {
  const rows = parseAttendanceCSV(buffer);

  const dates = rows.map(r => r.noticeDate).filter(Boolean) as string[];
  const dateRangeStart = dates.length > 0 ? dates.sort()[0] : null;
  const dateRangeEnd = dates.length > 0 ? dates.sort()[dates.length - 1] : null;

  const [importRun] = await db.insert(wiwImportRuns).values({
    importType: "attendance",
    fileName,
    status: "processing",
    totalRows: rows.length,
    dateRangeStart,
    dateRangeEnd,
    importedBy: userId,
  }).returning();

  try {
    const rawBatchSize = 100;
    for (let i = 0; i < rows.length; i += rawBatchSize) {
      const rawBatch = rows.slice(i, i + rawBatchSize).map((row, idx) => ({
        importRunId: importRun.id,
        rowIndex: i + idx,
        rowJson: row.rawData,
        rowHash: hashRow(row.rawData),
      }));
      await db.insert(wiwAttendanceRowsRaw).values(rawBatch);
    }

    const validRows = rows.filter(r => r.validationErrors.length === 0);
    const failedRows = rows.filter(r => r.validationErrors.length > 0);
    const validationErrors = failedRows.flatMap(r => r.validationErrors);

    if (failedRows.length > 0) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Attendance import ${importRun.id}: ${failedRows.length} rows failed validation`);
      for (const err of validationErrors) {
        console.warn(`${ENV_LOG_PREFIX}[WIW]   Row ${err.rowNumber}: ${err.field} - ${err.reason}`);
      }
    }

    const matches = await matchEmployees(validRows);

    let matched = 0;
    let unmatched = 0;

    const batchSize = 50;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      const insertValues = batch.map(row => {
        const normalizedName = row.employeeName ? normalizeName(row.employeeName) : "";
        const match = matches.get(normalizedName);
        const isMatched = match && (match.employeeId || match.userId);
        if (isMatched) matched++; else unmatched++;

        return {
          importRunId: importRun.id,
          rowNumber: row.rowNumber,
          employeeName: row.employeeName,
          employeeEmail: row.employeeEmail,
          wiwUserId: row.wiwUserId,
          noticeType: row.noticeType,
          noticeDate: row.noticeDate,
          noticeTime: row.noticeTime,
          scheduledStart: row.scheduledStart,
          scheduledEnd: row.scheduledEnd,
          actualStart: row.actualStart,
          actualEnd: row.actualEnd,
          actualHours: row.actualHours,
          varianceMinutes: row.varianceMinutes,
          locationName: row.locationName,
          position: row.position,
          details: row.details,
          matchedEmployeeId: match?.employeeId || null,
          matchStatus: isMatched ? "matched" : "unmatched",
          rawData: row.rawData,
        };
      });

      await db.insert(wiwAttendanceRows).values(insertValues);
    }

    await upsertLocationsAndRoles(validRows);

    const punchResult = await transformAttendanceRowsToTimePunches(importRun.id, validRows, matches);

    const dedupMatched = new Set(validRows.filter(r => r.employeeName && matches.get(normalizeName(r.employeeName))?.employeeId).map(r => normalizeName(r.employeeName!))).size;
    const dedupUnmatched = new Set(validRows.filter(r => r.employeeName && !matches.get(normalizeName(r.employeeName))?.employeeId).map(r => normalizeName(r.employeeName!))).size;

    await db.update(wiwImportRuns).set({
      status: failedRows.length > 0 ? "partial" : "completed",
      processedRows: validRows.length,
      errorRows: failedRows.length,
      matchedEmployees: dedupMatched,
      unmatchedEmployees: dedupUnmatched,
      errorLog: validationErrors.length > 0 ? validationErrors : null,
      completedAt: new Date(),
    }).where(eq(wiwImportRuns.id, importRun.id));

    return {
      importRunId: importRun.id,
      totalRows: rows.length,
      rawRowsStored: rows.length,
      validRows: validRows.length,
      failedRows: failedRows.length,
      matched: dedupMatched,
      unmatched: dedupUnmatched,
      punchesCreated: punchResult.created,
      punchesDeduplicated: punchResult.skippedDuplicates,
      punchesSkippedNoPunchData: punchResult.skippedNoPunchData,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  } catch (error: any) {
    await db.update(wiwImportRuns).set({
      status: "failed",
      errorLog: [{ error: error.message }],
    }).where(eq(wiwImportRuns.id, importRun.id));
    throw error;
  }
}

export async function getWiwDashboardData(filters?: { dateFrom?: string; dateTo?: string; locationName?: string }) {
  const scheduleConditions: any[] = [];
  const attendanceConditions: any[] = [];

  if (filters?.dateFrom) {
    scheduleConditions.push(sql`${wiwScheduleRows.shiftDate} >= ${filters.dateFrom}`);
    attendanceConditions.push(sql`${wiwAttendanceRows.noticeDate} >= ${filters.dateFrom}`);
  }
  if (filters?.dateTo) {
    scheduleConditions.push(sql`${wiwScheduleRows.shiftDate} <= ${filters.dateTo}`);
    attendanceConditions.push(sql`${wiwAttendanceRows.noticeDate} <= ${filters.dateTo}`);
  }
  if (filters?.locationName) {
    scheduleConditions.push(ilike(wiwScheduleRows.locationName, `%${filters.locationName}%`));
    attendanceConditions.push(ilike(wiwAttendanceRows.locationName, `%${filters.locationName}%`));
  }

  const scheduleWhere = scheduleConditions.length > 0 ? and(...scheduleConditions) : undefined;
  const attendanceWhere = attendanceConditions.length > 0 ? and(...attendanceConditions) : undefined;

  const [scheduleSummary] = await db.select({
    totalShifts: count(),
    totalScheduledHours: sql<string>`COALESCE(SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)), 0)`,
    uniqueEmployees: sql<number>`COUNT(DISTINCT ${wiwScheduleRows.employeeName})`,
    uniqueLocations: sql<number>`COUNT(DISTINCT ${wiwScheduleRows.locationName})`,
  }).from(wiwScheduleRows).where(scheduleWhere);

  const [attendanceSummary] = await db.select({
    totalNotices: count(),
    lateCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'late')`,
    missedPunchCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'missed_punch')`,
    noShowCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'no_show')`,
    earlyOutCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'early_out')`,
    totalActualHours: sql<string>`COALESCE(SUM(CAST(${wiwAttendanceRows.actualHours} AS numeric)), 0)`,
    avgVarianceMinutes: sql<string>`COALESCE(AVG(${wiwAttendanceRows.varianceMinutes}), 0)`,
  }).from(wiwAttendanceRows).where(attendanceWhere);

  const locationRollup = await db.select({
    locationName: wiwScheduleRows.locationName,
    shiftCount: count(),
    totalHours: sql<string>`COALESCE(SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)), 0)`,
    uniqueEmployees: sql<number>`COUNT(DISTINCT ${wiwScheduleRows.employeeName})`,
  }).from(wiwScheduleRows)
    .where(scheduleWhere)
    .groupBy(wiwScheduleRows.locationName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20);

  const roleRollup = await db.select({
    position: wiwScheduleRows.position,
    shiftCount: count(),
    totalHours: sql<string>`COALESCE(SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)), 0)`,
    uniqueEmployees: sql<number>`COUNT(DISTINCT ${wiwScheduleRows.employeeName})`,
  }).from(wiwScheduleRows)
    .where(scheduleWhere)
    .groupBy(wiwScheduleRows.position)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20);

  const overtimeEmployees = await db.select({
    employeeName: wiwScheduleRows.employeeName,
    totalHours: sql<string>`COALESCE(SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)), 0)`,
    shiftCount: count(),
    locationName: sql<string>`MODE() WITHIN GROUP (ORDER BY ${wiwScheduleRows.locationName})`,
  }).from(wiwScheduleRows)
    .where(scheduleWhere)
    .groupBy(wiwScheduleRows.employeeName)
    .having(sql`SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)) > 40`)
    .orderBy(desc(sql`SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric))`))
    .limit(50);

  const attendanceByEmployee = await db.select({
    employeeName: wiwAttendanceRows.employeeName,
    totalNotices: count(),
    lateCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'late')`,
    missedPunchCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'missed_punch')`,
    noShowCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'no_show')`,
    avgVarianceMinutes: sql<string>`COALESCE(AVG(${wiwAttendanceRows.varianceMinutes}), 0)`,
  }).from(wiwAttendanceRows)
    .where(attendanceWhere)
    .groupBy(wiwAttendanceRows.employeeName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(50);

  const attendanceByLocation = await db.select({
    locationName: wiwAttendanceRows.locationName,
    totalNotices: count(),
    lateCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'late')`,
    noShowCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'no_show')`,
    missedPunchCount: sql<number>`COUNT(*) FILTER (WHERE ${wiwAttendanceRows.noticeType} = 'missed_punch')`,
  }).from(wiwAttendanceRows)
    .where(attendanceWhere)
    .groupBy(wiwAttendanceRows.locationName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20);

  const dailySchedule = await db.select({
    date: wiwScheduleRows.shiftDate,
    shiftCount: count(),
    totalHours: sql<string>`COALESCE(SUM(CAST(${wiwScheduleRows.scheduledHours} AS numeric)), 0)`,
    uniqueEmployees: sql<number>`COUNT(DISTINCT ${wiwScheduleRows.employeeName})`,
  }).from(wiwScheduleRows)
    .where(scheduleWhere)
    .groupBy(wiwScheduleRows.shiftDate)
    .orderBy(asc(wiwScheduleRows.shiftDate))
    .limit(60);

  return {
    schedule: scheduleSummary,
    attendance: attendanceSummary,
    locationRollup,
    roleRollup,
    overtimeEmployees,
    attendanceByEmployee,
    attendanceByLocation,
    dailySchedule,
  };
}

export async function getImportRuns() {
  return db.select().from(wiwImportRuns).orderBy(desc(wiwImportRuns.createdAt)).limit(50);
}

export async function getImportRunDetail(id: string) {
  const [run] = await db.select().from(wiwImportRuns).where(eq(wiwImportRuns.id, id));
  if (!run) return null;

  const scheduleRows = run.importType === "schedule"
    ? await db.select().from(wiwScheduleRows).where(eq(wiwScheduleRows.importRunId, id)).orderBy(asc(wiwScheduleRows.rowNumber)).limit(500)
    : [];
  const attendanceRows = run.importType === "attendance"
    ? await db.select().from(wiwAttendanceRows).where(eq(wiwAttendanceRows.importRunId, id)).orderBy(asc(wiwAttendanceRows.rowNumber)).limit(500)
    : [];

  return { ...run, scheduleRows, attendanceRows };
}

export async function getEmployeeMappings() {
  return db.select().from(wiwEmployeeMap).orderBy(asc(wiwEmployeeMap.wiwEmployeeName));
}

export async function updateEmployeeMapping(id: string, driverhubEmployeeId: string) {
  const [result] = await db.update(wiwEmployeeMap).set({
    driverhubEmployeeId,
    matchMethod: "manual",
    confidence: "1.00",
    updatedAt: new Date(),
  }).where(eq(wiwEmployeeMap.id, id)).returning();
  return result;
}

export async function getUnmatchedEmployees() {
  const scheduleUnmatched = await db.selectDistinct({
    employeeName: wiwScheduleRows.employeeName,
    employeeEmail: wiwScheduleRows.employeeEmail,
  }).from(wiwScheduleRows).where(eq(wiwScheduleRows.matchStatus, "unmatched"));

  const attendanceUnmatched = await db.selectDistinct({
    employeeName: wiwAttendanceRows.employeeName,
    employeeEmail: wiwAttendanceRows.employeeEmail,
  }).from(wiwAttendanceRows).where(eq(wiwAttendanceRows.matchStatus, "unmatched"));

  const allUnmatched = new Map<string, { name: string; email: string | null }>();
  for (const r of [...scheduleUnmatched, ...attendanceUnmatched]) {
    if (r.employeeName) {
      allUnmatched.set(normalizeName(r.employeeName), { name: r.employeeName, email: r.employeeEmail });
    }
  }
  return Array.from(allUnmatched.values());
}

export async function getScheduleVsActual(filters?: { dateFrom?: string; dateTo?: string }) {
  const conditions: any[] = [];
  if (filters?.dateFrom) conditions.push(sql`s.shift_date >= ${filters.dateFrom}`);
  if (filters?.dateTo) conditions.push(sql`s.shift_date <= ${filters.dateTo}`);
  const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const result = await db.execute(sql`
    SELECT 
      s.employee_name,
      SUM(CAST(s.scheduled_hours AS numeric)) as total_scheduled_hours,
      COALESCE(a.total_actual_hours, 0) as total_actual_hours,
      SUM(CAST(s.scheduled_hours AS numeric)) - COALESCE(a.total_actual_hours, 0) as variance_hours
    FROM wiw_schedule_rows s
    LEFT JOIN (
      SELECT employee_name, SUM(CAST(actual_hours AS numeric)) as total_actual_hours
      FROM wiw_attendance_rows 
      WHERE actual_hours IS NOT NULL
      GROUP BY employee_name
    ) a ON s.employee_name = a.employee_name
    ${whereClause}
    GROUP BY s.employee_name, a.total_actual_hours
    ORDER BY SUM(CAST(s.scheduled_hours AS numeric)) DESC
    LIMIT 100
  `);

  return result.rows;
}

const MATCH_WINDOW_HOURS = 4;

export async function reconcileTimePunchesToShifts(options?: {
  dateFrom?: string;
  dateTo?: string;
  matchWindowHours?: number;
}): Promise<{
  totalPunches: number;
  matched: number;
  unmatched: number;
  alreadyReconciled: number;
}> {
  const windowHours = options?.matchWindowHours || MATCH_WINDOW_HOURS;
  const windowMs = windowHours * 60 * 60 * 1000;

  const punchConditions: any[] = [];
  if (options?.dateFrom) {
    punchConditions.push(sql`${timePunches.punchDate} >= ${options.dateFrom}`);
  }
  if (options?.dateTo) {
    punchConditions.push(sql`${timePunches.punchDate} <= ${options.dateTo}`);
  }

  const allPunches = punchConditions.length > 0
    ? await db.select().from(timePunches).where(and(...punchConditions))
    : await db.select().from(timePunches);

  let matchedCount = 0;
  let unmatchedCount = 0;
  let alreadyReconciled = 0;

  for (const punch of allPunches) {
    const [existingActual] = await db.select({ id: shiftActuals.id }).from(shiftActuals)
      .where(eq(shiftActuals.timePunchId, punch.id));
    if (existingActual) {
      alreadyReconciled++;
      continue;
    }

    if (!punch.employeeId && !punch.userId && !punch.employeeName) {
      unmatchedCount++;
      continue;
    }

    const shiftConditions: any[] = [
      eq(shifts.date, punch.punchDate),
    ];

    if (punch.employeeName) {
      shiftConditions.push(sql`EXISTS (
        SELECT 1 FROM wiw_schedule_rows wsr
        WHERE wsr.matched_shift_id = ${shifts.id}
        AND LOWER(wsr.employee_name) = LOWER(${punch.employeeName})
      )`);
    }

    const candidateShifts = await db.select().from(shifts)
      .where(and(...shiftConditions));

    if (candidateShifts.length === 0) {
      unmatchedCount++;
      continue;
    }

    let bestShift = candidateShifts[0];
    let bestDiff = Infinity;

    for (const s of candidateShifts) {
      if (punch.clockIn && s.startTime) {
        const diff = Math.abs(punch.clockIn.getTime() - s.startTime.getTime());
        if (diff <= windowMs && diff < bestDiff) {
          bestDiff = diff;
          bestShift = s;
        }
      } else if (s.startTime) {
        const shiftDate = new Date(punch.punchDate + "T00:00:00Z");
        const diff = Math.abs(shiftDate.getTime() - s.startTime.getTime());
        if (diff <= windowMs * 2 && diff < bestDiff) {
          bestDiff = diff;
          bestShift = s;
        }
      }
    }

    if (bestDiff === Infinity && candidateShifts.length > 0) {
      bestShift = candidateShifts[0];
    }

    if (bestDiff > windowMs && punch.clockIn) {
      unmatchedCount++;
      continue;
    }

    const scheduledHours = bestShift.scheduledHours ? parseFloat(bestShift.scheduledHours) : null;
    const actualHours = punch.workedHours ? parseFloat(punch.workedHours) : null;

    let varianceMinutes: number | null = null;
    if (punch.clockIn && bestShift.startTime) {
      varianceMinutes = Math.round((punch.clockIn.getTime() - bestShift.startTime.getTime()) / (1000 * 60));
    }

    try {
      await db.insert(shiftActuals).values({
        shiftId: bestShift.id,
        timePunchId: punch.id,
        employeeId: punch.employeeId || null,
        userId: punch.userId || null,
        scheduledStart: bestShift.startTime,
        scheduledEnd: bestShift.endTime,
        actualStart: punch.clockIn || null,
        actualEnd: punch.clockOut || null,
        scheduledHours: scheduledHours?.toFixed(2) || null,
        actualHours: actualHours?.toFixed(2) || null,
        varianceMinutes: varianceMinutes,
        matchConfidence: "auto",
        matchStatus: "matched",
      }).onConflictDoNothing();
      matchedCount++;
    } catch (err) {
      console.warn(`${ENV_LOG_PREFIX}[WIW] Failed to create shift actual for punch ${punch.id}:`, err);
      unmatchedCount++;
    }
  }

  console.log(`${ENV_LOG_PREFIX}[WIW] Reconciliation complete: ${matchedCount} matched, ${unmatchedCount} unmatched, ${alreadyReconciled} already reconciled`);
  return {
    totalPunches: allPunches.length,
    matched: matchedCount,
    unmatched: unmatchedCount,
    alreadyReconciled,
  };
}

function sanitize(val: string): string {
  return val.replace(/'/g, "''");
}

export async function getDashboardScheduleVsActual(filters: {
  dateFrom?: string;
  dateTo?: string;
  locationName?: string;
  roleName?: string;
  employeeName?: string;
  groupBy?: "day" | "week";
}) {
  const conditions: string[] = [];

  if (filters.dateFrom) conditions.push(`sa.scheduled_start >= '${sanitize(filters.dateFrom)}T00:00:00Z'::timestamptz`);
  if (filters.dateTo) conditions.push(`sa.scheduled_start <= '${sanitize(filters.dateTo)}T23:59:59Z'::timestamptz`);
  if (filters.locationName) conditions.push(`wsr.location_name ILIKE '%${sanitize(filters.locationName)}%'`);
  if (filters.roleName) conditions.push(`wsr.position ILIKE '%${sanitize(filters.roleName)}%'`);
  if (filters.employeeName) conditions.push(`wsr.employee_name ILIKE '%${sanitize(filters.employeeName)}%'`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const groupByField = filters.groupBy === "week"
    ? `DATE_TRUNC('week', sa.scheduled_start)::date`
    : `sa.scheduled_start::date`;

  const dailyResult = await db.execute(sql.raw(`
    SELECT 
      ${groupByField} as period,
      COUNT(*) as record_count,
      COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as total_scheduled_hours,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) as total_actual_hours,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) - COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as variance_hours,
      AVG(sa.variance_minutes) as avg_variance_minutes
    FROM shift_actuals sa
    LEFT JOIN wiw_schedule_rows wsr ON wsr.matched_shift_id = sa.shift_id
    ${whereClause}
    GROUP BY ${groupByField}
    ORDER BY ${groupByField}
    LIMIT 200
  `));

  const employeeResult = await db.execute(sql.raw(`
    SELECT 
      COALESCE(wsr.employee_name, tp.employee_name, 'Unknown') as employee_name,
      COALESCE(wsr.location_name, tp.location_name) as location_name,
      COALESCE(wsr.position, tp.position) as position,
      COUNT(*) as shift_count,
      COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as total_scheduled_hours,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) as total_actual_hours,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) - COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as variance_hours,
      AVG(sa.variance_minutes) as avg_variance_minutes
    FROM shift_actuals sa
    LEFT JOIN wiw_schedule_rows wsr ON wsr.matched_shift_id = sa.shift_id
    LEFT JOIN time_punches tp ON tp.id = sa.time_punch_id
    ${whereClause}
    GROUP BY COALESCE(wsr.employee_name, tp.employee_name, 'Unknown'), COALESCE(wsr.location_name, tp.location_name), COALESCE(wsr.position, tp.position)
    ORDER BY COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) DESC
    LIMIT 100
  `));

  const totalsResult = await db.execute(sql.raw(`
    SELECT 
      COUNT(*) as total_records,
      COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as total_scheduled,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) as total_actual,
      COALESCE(SUM(CAST(sa.actual_hours AS numeric)), 0) - COALESCE(SUM(CAST(sa.scheduled_hours AS numeric)), 0) as total_variance,
      AVG(sa.variance_minutes) as avg_start_variance_minutes,
      COUNT(*) FILTER (WHERE sa.variance_minutes > 15) as late_starts,
      COUNT(*) FILTER (WHERE sa.variance_minutes < -15) as early_starts
    FROM shift_actuals sa
    LEFT JOIN wiw_schedule_rows wsr ON wsr.matched_shift_id = sa.shift_id
    ${whereClause}
  `));

  return {
    byPeriod: dailyResult.rows,
    byEmployee: employeeResult.rows,
    totals: totalsResult.rows[0] || {},
  };
}

export async function getDashboardOvertimeWatch(filters: {
  dateFrom?: string;
  dateTo?: string;
  threshold?: number;
  weekStart?: string;
}) {
  const threshold = filters.threshold || 40;
  const conditions: string[] = [];

  if (filters.dateFrom) {
    conditions.push(`tp.punch_date >= '${sanitize(filters.dateFrom)}'`);
  }
  if (filters.dateTo) {
    conditions.push(`tp.punch_date <= '${sanitize(filters.dateTo)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const weeklyResult = await db.execute(sql.raw(`
    SELECT 
      DATE_TRUNC('week', tp.punch_date::date)::date as week_start,
      COALESCE(tp.employee_name, 'Unknown') as employee_name,
      tp.location_name,
      tp.position,
      COUNT(*) as punch_count,
      COALESCE(SUM(CAST(tp.worked_hours AS numeric)), 0) as total_hours,
      CASE WHEN COALESCE(SUM(CAST(tp.worked_hours AS numeric)), 0) > ${threshold} THEN true ELSE false END as over_threshold,
      GREATEST(COALESCE(SUM(CAST(tp.worked_hours AS numeric)), 0) - ${threshold}, 0) as overtime_hours
    FROM time_punches tp
    ${whereClause}
    GROUP BY DATE_TRUNC('week', tp.punch_date::date)::date, COALESCE(tp.employee_name, 'Unknown'), tp.location_name, tp.position
    ORDER BY DATE_TRUNC('week', tp.punch_date::date)::date DESC, COALESCE(SUM(CAST(tp.worked_hours AS numeric)), 0) DESC
    LIMIT 500
  `));

  const summaryResult = await db.execute(sql.raw(`
    WITH weekly_hours AS (
      SELECT 
        DATE_TRUNC('week', tp.punch_date::date)::date as week_start,
        COALESCE(tp.employee_name, 'Unknown') as employee_name,
        COALESCE(SUM(CAST(tp.worked_hours AS numeric)), 0) as total_hours
      FROM time_punches tp
      ${whereClause}
      GROUP BY DATE_TRUNC('week', tp.punch_date::date)::date, COALESCE(tp.employee_name, 'Unknown')
    )
    SELECT 
      COUNT(DISTINCT employee_name) as total_employees,
      COUNT(DISTINCT week_start) as total_weeks,
      COUNT(*) FILTER (WHERE total_hours > ${threshold}) as overtime_instances,
      COUNT(DISTINCT employee_name) FILTER (WHERE total_hours > ${threshold}) as employees_with_overtime,
      COALESCE(SUM(GREATEST(total_hours - ${threshold}, 0)), 0) as total_overtime_hours,
      COALESCE(AVG(total_hours), 0) as avg_weekly_hours,
      COALESCE(MAX(total_hours), 0) as max_weekly_hours
    FROM weekly_hours
  `));

  return {
    weeklyBreakdown: weeklyResult.rows,
    summary: summaryResult.rows[0] || {},
    threshold,
  };
}

export async function getDashboardAttendanceExceptions(filters: {
  dateFrom?: string;
  dateTo?: string;
  locationName?: string;
  employeeName?: string;
}) {
  const conditions: string[] = [];

  if (filters.dateFrom) {
    conditions.push(`tp.punch_date >= '${sanitize(filters.dateFrom)}'`);
  }
  if (filters.dateTo) {
    conditions.push(`tp.punch_date <= '${sanitize(filters.dateTo)}'`);
  }
  if (filters.locationName) {
    conditions.push(`tp.location_name ILIKE '%${sanitize(filters.locationName)}%'`);
  }
  if (filters.employeeName) {
    conditions.push(`tp.employee_name ILIKE '%${sanitize(filters.employeeName)}%'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const lateConditions: string[] = [`sa.variance_minutes > 5`];
  if (filters.dateFrom) lateConditions.push(`tp.punch_date >= '${sanitize(filters.dateFrom)}'`);
  if (filters.dateTo) lateConditions.push(`tp.punch_date <= '${sanitize(filters.dateTo)}'`);
  if (filters.locationName) lateConditions.push(`COALESCE(wsr.location_name, tp.location_name) ILIKE '%${sanitize(filters.locationName)}%'`);
  if (filters.employeeName) lateConditions.push(`COALESCE(wsr.employee_name, tp.employee_name) ILIKE '%${sanitize(filters.employeeName)}%'`);

  const lateClockIns = await db.execute(sql.raw(`
    SELECT 
      sa.id,
      COALESCE(wsr.employee_name, tp.employee_name, 'Unknown') as employee_name,
      tp.punch_date,
      sa.scheduled_start,
      sa.actual_start,
      sa.variance_minutes,
      COALESCE(wsr.location_name, tp.location_name) as location_name,
      COALESCE(wsr.position, tp.position) as position,
      wloc.timezone as location_timezone
    FROM shift_actuals sa
    JOIN time_punches tp ON tp.id = sa.time_punch_id
    LEFT JOIN wiw_schedule_rows wsr ON wsr.matched_shift_id = sa.shift_id
    LEFT JOIN wiw_locations wloc ON LOWER(TRIM(wloc.name)) = LOWER(TRIM(COALESCE(wsr.location_name, tp.location_name)))
    WHERE ${lateConditions.join(" AND ")}
    ORDER BY sa.variance_minutes DESC
    LIMIT 200
  `));

  const missedPunches = await db.execute(sql.raw(`
    SELECT 
      tp.id,
      COALESCE(tp.employee_name, 'Unknown') as employee_name,
      tp.punch_date,
      tp.clock_in,
      tp.clock_out,
      tp.exception_type,
      tp.exception_details,
      tp.location_name,
      tp.position,
      wloc.timezone as location_timezone
    FROM time_punches tp
    LEFT JOIN wiw_locations wloc ON LOWER(TRIM(wloc.name)) = LOWER(TRIM(tp.location_name))
    ${whereClause ? whereClause + ' AND' : 'WHERE'} (tp.clock_in IS NULL OR tp.clock_out IS NULL)
    AND tp.exception_type IS NOT NULL
    ORDER BY tp.punch_date DESC
    LIMIT 200
  `));

  const unmatchedPunches = await db.execute(sql.raw(`
    SELECT 
      tp.id,
      COALESCE(tp.employee_name, 'Unknown') as employee_name,
      tp.punch_date,
      tp.clock_in,
      tp.clock_out,
      tp.worked_hours,
      tp.exception_type,
      tp.location_name,
      tp.position,
      wloc.timezone as location_timezone
    FROM time_punches tp
    LEFT JOIN shift_actuals sa ON sa.time_punch_id = tp.id
    LEFT JOIN wiw_locations wloc ON LOWER(TRIM(wloc.name)) = LOWER(TRIM(tp.location_name))
    ${whereClause ? whereClause + ' AND' : 'WHERE'} sa.id IS NULL
    ORDER BY tp.punch_date DESC
    LIMIT 200
  `));

  const summaryResult = await db.execute(sql.raw(`
    SELECT 
      COUNT(*) as total_punches,
      COUNT(*) FILTER (WHERE tp.exception_type IS NOT NULL) as total_exceptions,
      COUNT(*) FILTER (WHERE tp.exception_type ILIKE '%late%') as late_count,
      COUNT(*) FILTER (WHERE tp.exception_type ILIKE '%no show%' OR tp.exception_type ILIKE '%no_show%') as no_show_count,
      COUNT(*) FILTER (WHERE tp.exception_type ILIKE '%missed%') as missed_punch_count,
      COUNT(*) FILTER (WHERE tp.exception_type ILIKE '%early%') as early_out_count,
      COUNT(*) FILTER (WHERE tp.clock_in IS NULL OR tp.clock_out IS NULL) as incomplete_punches
    FROM time_punches tp
    ${whereClause}
  `));

  const unmatchedCount = await db.execute(sql.raw(`
    SELECT COUNT(*) as count
    FROM time_punches tp
    LEFT JOIN shift_actuals sa ON sa.time_punch_id = tp.id
    ${whereClause ? whereClause + ' AND' : 'WHERE'} sa.id IS NULL
  `));

  return {
    lateClockIns: lateClockIns.rows,
    missedPunches: missedPunches.rows,
    unmatchedPunches: unmatchedPunches.rows,
    summary: {
      ...(summaryResult.rows[0] || {}),
      unmatchedCount: unmatchedCount.rows[0]?.count || 0,
    },
  };
}