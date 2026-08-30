import * as XLSX from "xlsx";
import { parseScheduleXLSX, processScheduleImport } from "../services/wiwIngestion";
import { db } from "../db";
import {
  wiwScheduleRowsRaw, wiwImportRuns, wiwScheduleRows,
  shifts, shiftAssignments,
} from "@shared/schema";
import { eq, count, and } from "drizzle-orm";

function createTestFixtureBuffer(): { buffer: Buffer; expectedDataRows: number; expectedFailedRows: number } {
  const wb = XLSX.utils.book_new();

  const data = [
    ["Employee", "Date", "Start", "End", "Position", "Location", "Hours", "Notes"],
    ["Alice Johnson", "2025-12-01", "2025-12-01T08:00:00", "2025-12-01T16:00:00", "Driver", "Downtown Hub", 8.0, "Morning shift"],
    ["Bob Smith", "2025-12-01", "2025-12-01T09:00:00", "2025-12-01T17:00:00", "Driver", "Airport Terminal", 8.0, ""],
    ["Charlie Davis", "2025-12-02", "2025-12-02T06:00:00", "2025-12-02T14:00:00", "Courier", "Warehouse A", 8.0, "Early start"],
    ["Diana Lee", "2025-12-02", "2025-12-02T14:00:00", "2025-12-02T22:00:00", "Driver", "Downtown Hub", 8.0, "Afternoon shift"],
    ["Eve Martinez", "2025-12-03", "2025-12-03T07:00:00", "2025-12-03T15:00:00", "Dispatcher", "HQ Office", 8.0, ""],
    ["Frank Wilson", "2025-12-03", "2025-12-03T10:00:00", "2025-12-03T18:00:00", "Driver", "Suburban Route", 8.0, "Weekend coverage"],
    ["Grace Brown", "2025-12-04", "2025-12-04T05:00:00", "2025-12-04T13:00:00", "Driver", "Airport Terminal", 8.0, ""],
    ["Henry Taylor", "2025-12-04", "2025-12-04T12:00:00", "2025-12-04T20:00:00", "Courier", "Warehouse A", 8.0, ""],
    ["", "2025-12-05", "2025-12-05T08:00:00", "2025-12-05T16:00:00", "Driver", "Downtown Hub", 8.0, "Missing employee - should fail"],
    ["Jane Doe", "", "", "", "", "", "", "Missing date/start/end/location - should fail"],
    ["Kate Young", "2025-12-05", "2025-12-05T07:00:00", "2025-12-05T15:00:00", "Lead Driver", "Distribution Center", 8.0, "Valid row"],
    ["Leo Chen", "2025-12-06", "2025-12-06T08:00:00", "2025-12-06T16:00:00", "Driver", "Downtown Hub", 8.0, ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return {
    buffer: Buffer.from(buffer),
    expectedDataRows: data.length - 1,
    expectedFailedRows: 2,
  };
}

async function runTest() {
  console.log("=== WIW Schedule XLSX → Shift Transform Test ===\n");

  const { buffer, expectedDataRows, expectedFailedRows } = createTestFixtureBuffer();
  const expectedValid = expectedDataRows - expectedFailedRows;
  console.log(`Created synthetic XLSX fixture with ${expectedDataRows} data rows (${expectedFailedRows} invalid, ${expectedValid} valid)\n`);

  console.log("--- Step 1: Test parseScheduleXLSX (parser only) ---");
  const parsedRows = parseScheduleXLSX(buffer);
  const validParsed = parsedRows.filter(r => r.validationErrors.length === 0);
  const failedParsed = parsedRows.filter(r => r.validationErrors.length > 0);
  console.log(`  Parsed: ${parsedRows.length}, Valid: ${validParsed.length}, Failed: ${failedParsed.length}`);

  if (failedParsed.length !== expectedFailedRows) {
    console.error(`FAIL: Expected ${expectedFailedRows} failed rows, got ${failedParsed.length}`);
    process.exit(1);
  }
  console.log(`PASS: Validation counts correct\n`);

  console.log("--- Step 2: Test processScheduleImport (full pipeline with shift creation) ---");
  const result = await processScheduleImport(buffer, "test_schedule_shifts.xlsx", "test-admin-user");
  console.log(`Import result:`, JSON.stringify(result, null, 2));

  if (result.totalRows !== expectedDataRows) {
    console.error(`FAIL: totalRows ${result.totalRows} != ${expectedDataRows}`);
    process.exit(1);
  }
  console.log(`PASS: totalRows matches (${result.totalRows})`);

  if (result.validRows !== expectedValid) {
    console.error(`FAIL: validRows ${result.validRows} != ${expectedValid}`);
    process.exit(1);
  }
  console.log(`PASS: validRows matches (${result.validRows})`);

  console.log("\n--- Step 3: Verify shift records created ---");
  const [shiftCount] = await db.select({ cnt: count() })
    .from(shifts)
    .where(eq(shifts.sourceImportRunId, result.importRunId));

  console.log(`Shifts in DB for this import: ${shiftCount.cnt}`);
  if (Number(shiftCount.cnt) !== expectedValid) {
    console.error(`FAIL: Shift count ${shiftCount.cnt} != expected valid rows ${expectedValid}`);
    process.exit(1);
  }
  console.log(`PASS: All ${expectedValid} valid rows produced shift records\n`);

  console.log("--- Step 4: Verify shift fields ---");
  const sampleShifts = await db.select().from(shifts)
    .where(eq(shifts.sourceImportRunId, result.importRunId));
  
  for (const s of sampleShifts.slice(0, 3)) {
    console.log(`  Shift ${s.id}: date=${s.date}, role=${s.roleName}, source=${s.sourceSystem}, hours=${s.scheduledHours}, hash=${s.sourceRowHash?.substring(0, 12)}...`);
  }

  const allHaveSource = sampleShifts.every(s => s.sourceSystem === "WhenIWork");
  if (!allHaveSource) {
    console.error(`FAIL: Not all shifts have sourceSystem = "WhenIWork"`);
    process.exit(1);
  }
  console.log(`PASS: All shifts have sourceSystem = "WhenIWork"`);

  const allHaveHash = sampleShifts.every(s => s.sourceRowHash && s.sourceRowHash.length === 64);
  if (!allHaveHash) {
    console.error(`FAIL: Not all shifts have a valid sourceRowHash`);
    process.exit(1);
  }
  console.log(`PASS: All shifts have a 64-char sourceRowHash`);

  const allHaveHours = sampleShifts.every(s => s.scheduledHours && parseFloat(s.scheduledHours) > 0);
  if (!allHaveHours) {
    console.error(`FAIL: Not all shifts have scheduledHours > 0`);
    process.exit(1);
  }
  console.log(`PASS: All shifts have scheduledHours > 0`);

  const allHaveRole = sampleShifts.every(s => s.roleName);
  if (!allHaveRole) {
    console.error(`FAIL: Not all shifts have roleName set`);
    process.exit(1);
  }
  console.log(`PASS: All shifts have roleName set\n`);

  console.log("--- Step 5: Verify matchedShiftId linkage on schedule rows ---");
  const linkedRows = await db.select().from(wiwScheduleRows)
    .where(eq(wiwScheduleRows.importRunId, result.importRunId));
  const rowsWithShiftId = linkedRows.filter(r => r.matchedShiftId && r.matchedShiftId.length > 0);
  console.log(`  Schedule rows with matchedShiftId: ${rowsWithShiftId.length} / ${linkedRows.length}`);
  if (rowsWithShiftId.length !== expectedValid) {
    console.error(`FAIL: Expected ${expectedValid} schedule rows linked to shifts, got ${rowsWithShiftId.length}`);
    process.exit(1);
  }
  console.log(`PASS: All ${expectedValid} schedule rows linked to their shift via matchedShiftId\n`);

  console.log("--- Step 6: Verify dedup on re-import ---");
  const result2 = await processScheduleImport(buffer, "test_schedule_shifts_RERUN.xlsx", "test-admin-user");
  console.log(`Re-import result:`, JSON.stringify(result2, null, 2));

  if (result2.shiftsCreated !== 0) {
    console.error(`FAIL: Re-import created ${result2.shiftsCreated} new shifts (expected 0)`);
    process.exit(1);
  }
  console.log(`PASS: Re-import created 0 new shifts`);

  if (result2.shiftsDeduplicated !== expectedValid) {
    console.error(`FAIL: Re-import dedup count ${result2.shiftsDeduplicated} != ${expectedValid}`);
    process.exit(1);
  }
  console.log(`PASS: Re-import correctly identified ${result2.shiftsDeduplicated} duplicates\n`);

  const [shiftCountAfterReimport] = await db.select({ cnt: count() })
    .from(shifts)
    .where(and(
      eq(shifts.sourceSystem, "WhenIWork"),
      eq(shifts.sourceImportRunId, result.importRunId)
    ));
  console.log(`Total WIW shifts after re-import (from first run): ${shiftCountAfterReimport.cnt}`);
  if (Number(shiftCountAfterReimport.cnt) !== expectedValid) {
    console.error(`FAIL: Shift count changed after re-import!`);
    process.exit(1);
  }
  console.log(`PASS: Shift count unchanged after re-import (${shiftCountAfterReimport.cnt} == ${expectedValid})\n`);

  console.log("=== ALL TESTS PASSED ===\n");

  const shiftsToClean = await db.select({ id: shifts.id }).from(shifts)
    .where(eq(shifts.sourceImportRunId, result.importRunId));
  for (const s of shiftsToClean) {
    await db.delete(shiftAssignments).where(eq(shiftAssignments.shiftId, s.id));
  }
  await db.delete(shifts).where(eq(shifts.sourceImportRunId, result.importRunId));
  await db.delete(shifts).where(eq(shifts.sourceImportRunId, result2.importRunId));
  await db.delete(wiwScheduleRows).where(eq(wiwScheduleRows.importRunId, result.importRunId));
  await db.delete(wiwScheduleRowsRaw).where(eq(wiwScheduleRowsRaw.importRunId, result.importRunId));
  await db.delete(wiwImportRuns).where(eq(wiwImportRuns.id, result.importRunId));
  await db.delete(wiwScheduleRows).where(eq(wiwScheduleRows.importRunId, result2.importRunId));
  await db.delete(wiwScheduleRowsRaw).where(eq(wiwScheduleRowsRaw.importRunId, result2.importRunId));
  await db.delete(wiwImportRuns).where(eq(wiwImportRuns.id, result2.importRunId));
  console.log("Cleaned up test data.");

  process.exit(0);
}

runTest().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
