import * as XLSX from "xlsx";
import { parseAttendanceCSV, processAttendanceImport } from "../services/wiwIngestion";
import { db } from "../db";
import {
  wiwAttendanceRowsRaw, wiwAttendanceRows, wiwImportRuns,
  wiwLocationMap, wiwRoleMap,
} from "@shared/schema";
import { eq, count, inArray } from "drizzle-orm";

function createTestAttendanceCSVBuffer(): { buffer: Buffer; expectedDataRows: number; expectedFailedRows: number } {
  const wb = XLSX.utils.book_new();

  const data = [
    ["Employee", "Date", "Type", "Clock In", "Clock Out", "Actual Hours", "Location", "Position", "Details"],
    ["Alice Johnson", "2026-02-02", "Late", "2026-02-02T08:15:00", "2026-02-02T16:00:00", "7.75", "Downtown Hub", "Driver", "15 min late"],
    ["Bob Smith", "2026-02-02", "No Show", "", "", "", "Airport Terminal", "Courier", "Did not report"],
    ["Charlie Davis", "2026-02-03", "Early Out", "2026-02-03T06:00:00", "2026-02-03T12:00:00", "6.00", "Warehouse A", "Driver", "Left 2hrs early"],
    ["Diana Lee", "2026-02-03", "Missed Punch", "2026-02-03T14:00:00", "", "", "Downtown Hub", "Driver", "Forgot clock-out"],
    ["Eve Martinez", "2026-02-04", "Late", "2026-02-04T07:30:00", "2026-02-04T15:00:00", "7.50", "HQ Office", "Dispatcher", "30 min late"],
    ["Frank Wilson", "2026-02-04", "Unscheduled", "2026-02-04T10:00:00", "2026-02-04T18:00:00", "8.00", "Suburban Route", "Driver", "Covered shift"],
    ["Grace Brown", "2026-02-05", "Late", "2026-02-05T05:20:00", "2026-02-05T13:00:00", "7.67", "Airport Terminal", "Driver", "20 min late"],
    ["Henry Taylor", "2026-02-05", "No Show", "", "", "", "Warehouse A", "Courier", "Called off sick"],
    ["", "2026-02-06", "Late", "2026-02-06T08:10:00", "2026-02-06T16:00:00", "7.83", "Downtown Hub", "Driver", "Missing employee - should fail"],
    ["Jane Doe", "", "", "", "", "", "", "", "Missing date + no clock/exception - should fail"],
    ["Kate Young", "2026-02-06", "Late", "2026-02-06T07:15:00", "2026-02-06T15:00:00", "7.75", "Distribution Center", "Lead Driver", "15 min late"],
    ["Leo Chen", "2026-02-07", "Early Out", "2026-02-07T08:00:00", "2026-02-07T14:00:00", "6.00", "Downtown Hub", "Driver", "Left early"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const csvOutput = XLSX.utils.sheet_to_csv(ws);
  const buffer = Buffer.from(csvOutput, "utf-8");

  return {
    buffer,
    expectedDataRows: data.length - 1,
    expectedFailedRows: 2,
  };
}

async function runTest() {
  console.log("=== WIW Attendance CSV Parser & Entity Normalization Test ===\n");

  const { buffer, expectedDataRows, expectedFailedRows } = createTestAttendanceCSVBuffer();
  console.log(`Created synthetic CSV fixture with ${expectedDataRows} data rows (${expectedFailedRows} intentionally invalid)\n`);

  console.log("--- Step 1: Test parseAttendanceCSV (parser only) ---");
  const parsedRows = parseAttendanceCSV(buffer);
  console.log(`Parsed ${parsedRows.length} rows from CSV`);

  const validParsed = parsedRows.filter(r => r.validationErrors.length === 0);
  const failedParsed = parsedRows.filter(r => r.validationErrors.length > 0);
  console.log(`  Valid rows: ${validParsed.length}`);
  console.log(`  Failed rows: ${failedParsed.length}`);

  for (const row of failedParsed) {
    for (const err of row.validationErrors) {
      console.log(`    Row ${err.rowNumber}: [${err.field}] ${err.reason}`);
    }
  }

  if (parsedRows.length !== expectedDataRows) {
    console.error(`FAIL: Expected ${expectedDataRows} parsed rows, got ${parsedRows.length}`);
    process.exit(1);
  }
  console.log(`PASS: Row count matches (${parsedRows.length} == ${expectedDataRows})\n`);

  if (failedParsed.length !== expectedFailedRows) {
    console.error(`FAIL: Expected ${expectedFailedRows} failed rows, got ${failedParsed.length}`);
    process.exit(1);
  }
  console.log(`PASS: Failed row count matches (${failedParsed.length} == ${expectedFailedRows})\n`);

  console.log("--- Step 2: Test processAttendanceImport (full pipeline) ---");
  const result = await processAttendanceImport(buffer, "test_attendance_fixture.csv", "test-admin-user");
  console.log(`Import result:`, JSON.stringify(result, null, 2));

  if (result.totalRows !== expectedDataRows) {
    console.error(`FAIL: totalRows ${result.totalRows} != ${expectedDataRows}`);
    process.exit(1);
  }
  console.log(`PASS: totalRows matches (${result.totalRows})\n`);

  if (result.rawRowsStored !== expectedDataRows) {
    console.error(`FAIL: rawRowsStored ${result.rawRowsStored} != ${expectedDataRows}`);
    process.exit(1);
  }
  console.log(`PASS: rawRowsStored matches (${result.rawRowsStored})\n`);

  console.log("--- Step 3: Verify database counts ---");
  const [rawCount] = await db.select({ cnt: count() })
    .from(wiwAttendanceRowsRaw)
    .where(eq(wiwAttendanceRowsRaw.importRunId, result.importRunId));

  console.log(`Raw rows in DB: ${rawCount.cnt}`);
  if (Number(rawCount.cnt) !== expectedDataRows) {
    console.error(`FAIL: Raw row count in DB (${rawCount.cnt}) != expected (${expectedDataRows})`);
    process.exit(1);
  }
  console.log(`PASS: All rows stored in raw table regardless of validation status\n`);

  const [normalizedCount] = await db.select({ cnt: count() })
    .from(wiwAttendanceRows)
    .where(eq(wiwAttendanceRows.importRunId, result.importRunId));
  const expectedValid = expectedDataRows - expectedFailedRows;
  console.log(`Normalized rows in DB: ${normalizedCount.cnt}`);
  if (Number(normalizedCount.cnt) !== expectedValid) {
    console.error(`FAIL: Normalized row count (${normalizedCount.cnt}) != expected valid rows (${expectedValid})`);
    process.exit(1);
  }
  console.log(`PASS: Normalized row count matches valid rows (${normalizedCount.cnt} == ${expectedValid})\n`);

  const [importRun] = await db.select()
    .from(wiwImportRuns)
    .where(eq(wiwImportRuns.id, result.importRunId));
  console.log(`Import run status: ${importRun.status}`);
  console.log(`Import run errorRows: ${importRun.errorRows}`);

  if (importRun.errorRows !== expectedFailedRows) {
    console.error(`FAIL: errorRows ${importRun.errorRows} != ${expectedFailedRows}`);
    process.exit(1);
  }
  console.log(`PASS: errorRows matches (${importRun.errorRows})\n`);

  console.log("--- Step 4: Verify entity normalization (location & role maps) ---");
  const expectedLocations = ["Downtown Hub", "Airport Terminal", "Warehouse A", "HQ Office", "Suburban Route", "Distribution Center"];
  const expectedRoles = ["Driver", "Courier", "Dispatcher", "Lead Driver"];

  const locations = await db.select().from(wiwLocationMap)
    .where(inArray(wiwLocationMap.wiwLocationName, expectedLocations));
  console.log(`Locations in wiw_location_map: ${locations.length}`);
  for (const loc of locations) {
    console.log(`  "${loc.wiwLocationName}" -> normalized: "${loc.normalizedName}"`);
  }
  if (locations.length < expectedLocations.length) {
    console.error(`FAIL: Expected at least ${expectedLocations.length} locations, found ${locations.length}`);
    process.exit(1);
  }
  console.log(`PASS: All ${locations.length} locations upserted\n`);

  const roles = await db.select().from(wiwRoleMap)
    .where(inArray(wiwRoleMap.wiwRoleName, expectedRoles));
  console.log(`Roles in wiw_role_map: ${roles.length}`);
  for (const role of roles) {
    console.log(`  "${role.wiwRoleName}" -> normalized: "${role.normalizedName}"`);
  }
  if (roles.length < expectedRoles.length) {
    console.error(`FAIL: Expected at least ${expectedRoles.length} roles, found ${roles.length}`);
    process.exit(1);
  }
  console.log(`PASS: All ${roles.length} roles upserted\n`);

  console.log("--- Step 5: Verify re-import does NOT duplicate entities ---");
  const result2 = await processAttendanceImport(buffer, "test_attendance_fixture_rerun.csv", "test-admin-user");

  const locationsAfterReimport = await db.select().from(wiwLocationMap)
    .where(inArray(wiwLocationMap.wiwLocationName, expectedLocations));
  const rolesAfterReimport = await db.select().from(wiwRoleMap)
    .where(inArray(wiwRoleMap.wiwRoleName, expectedRoles));

  if (locationsAfterReimport.length !== locations.length) {
    console.error(`FAIL: Re-import duplicated locations (${locationsAfterReimport.length} vs ${locations.length})`);
    process.exit(1);
  }
  console.log(`PASS: Re-import did NOT duplicate locations (still ${locationsAfterReimport.length})`);

  if (rolesAfterReimport.length !== roles.length) {
    console.error(`FAIL: Re-import duplicated roles (${rolesAfterReimport.length} vs ${roles.length})`);
    process.exit(1);
  }
  console.log(`PASS: Re-import did NOT duplicate roles (still ${rolesAfterReimport.length})\n`);

  console.log("=== ALL TESTS PASSED ===");

  await db.delete(wiwAttendanceRows).where(eq(wiwAttendanceRows.importRunId, result.importRunId));
  await db.delete(wiwAttendanceRowsRaw).where(eq(wiwAttendanceRowsRaw.importRunId, result.importRunId));
  await db.delete(wiwImportRuns).where(eq(wiwImportRuns.id, result.importRunId));
  await db.delete(wiwAttendanceRows).where(eq(wiwAttendanceRows.importRunId, result2.importRunId));
  await db.delete(wiwAttendanceRowsRaw).where(eq(wiwAttendanceRowsRaw.importRunId, result2.importRunId));
  await db.delete(wiwImportRuns).where(eq(wiwImportRuns.id, result2.importRunId));
  console.log("Cleaned up test import data (entity maps preserved for future use).");

  process.exit(0);
}

runTest().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
