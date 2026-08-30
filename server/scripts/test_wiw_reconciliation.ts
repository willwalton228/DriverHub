import { db } from "../db";
import {
  timePunches, shifts, shiftActuals, wiwScheduleRows, wiwImportRuns,
} from "@shared/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { reconcileTimePunchesToShifts } from "../services/wiwIngestion";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

async function cleanupTestData() {
  await db.delete(shiftActuals).where(sql`match_confidence = 'auto' AND shift_id IN (SELECT id FROM shifts WHERE source_system = 'test_reconciliation')`);
  await db.delete(wiwScheduleRows).where(sql`import_run_id = 'test-reconcile-run'`);
  await db.delete(timePunches).where(sql`source_system = 'test_reconciliation'`);
  await db.delete(shifts).where(sql`source_system = 'test_reconciliation'`);
  await db.delete(wiwImportRuns).where(eq(wiwImportRuns.id, "test-reconcile-run"));
}

async function ensureTestImportRun() {
  const [existing] = await db.select().from(wiwImportRuns).where(eq(wiwImportRuns.id, "test-reconcile-run"));
  if (!existing) {
    await db.insert(wiwImportRuns).values({
      id: "test-reconcile-run",
      importType: "attendance",
      fileName: "test-reconciliation.csv",
      status: "completed",
      totalRows: 0,
    });
  }
}

async function runTest() {
  console.log("=== WIW Reconciliation Test Suite ===\n");

  await cleanupTestData();
  await ensureTestImportRun();
  console.log("Cleaned up any previous test data and ensured test import run exists.\n");

  console.log("--- Test 1: Time Punch Deduplication via sourceRowHash ---");
  {
    const hash1 = "test-dedup-hash-001";
    const [first] = await db.insert(timePunches).values({
      employeeName: "Test DeduplicateUser",
      clockIn: new Date("2026-03-01T08:00:00Z"),
      clockOut: new Date("2026-03-01T16:00:00Z"),
      workedHours: "8.00",
      punchDate: "2026-03-01",
      sourceSystem: "test_reconciliation",
      sourceRowHash: hash1,
    }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning({ id: timePunches.id });

    assert("First insert succeeds", !!first);

    const [second] = await db.insert(timePunches).values({
      employeeName: "Test DeduplicateUser",
      clockIn: new Date("2026-03-01T08:00:00Z"),
      clockOut: new Date("2026-03-01T16:00:00Z"),
      workedHours: "8.00",
      punchDate: "2026-03-01",
      sourceSystem: "test_reconciliation",
      sourceRowHash: hash1,
    }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning({ id: timePunches.id });

    assert("Duplicate insert is skipped (no conflict error)", !second);
  }

  console.log("\n--- Test 2: Time Punch with Exception Data Only ---");
  {
    const [punch] = await db.insert(timePunches).values({
      employeeName: "Test NoShowPerson",
      punchDate: "2026-03-02",
      exceptionType: "No Show",
      exceptionDetails: "Did not report for shift",
      sourceSystem: "test_reconciliation",
      sourceRowHash: "test-exception-only-001",
    }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning();

    assert("Exception-only punch created", !!punch);
    assert("clockIn is null", punch?.clockIn === null);
    assert("clockOut is null", punch?.clockOut === null);
    assert("exceptionType stored", punch?.exceptionType === "No Show");
  }

  console.log("\n--- Test 3: Reconciliation Matching ---");
  {
    const testDate = "2026-04-15";
    const shiftStart = new Date("2026-04-15T08:00:00Z");
    const shiftEnd = new Date("2026-04-15T16:00:00Z");
    const punchIn = new Date("2026-04-15T08:12:00Z");
    const punchOut = new Date("2026-04-15T16:05:00Z");

    const [testShift] = await db.insert(shifts).values({
      date: testDate,
      startTime: shiftStart,
      endTime: shiftEnd,
      scheduledHours: "8.00",
      status: "scheduled",
      sourceSystem: "test_reconciliation",
    }).returning();
    assert("Test shift created", !!testShift);

    await db.insert(wiwScheduleRows).values({
      importRunId: "test-reconcile-run",
      rowNumber: 1,
      employeeName: "Test ReconcileDriver",
      shiftDate: testDate,
      startTime: shiftStart,
      endTime: shiftEnd,
      scheduledHours: "8.00",
      locationName: "Test Loc",
      position: "Driver",
      matchedShiftId: testShift.id,
      matchStatus: "matched",
    });

    const [testPunch] = await db.insert(timePunches).values({
      employeeName: "Test ReconcileDriver",
      clockIn: punchIn,
      clockOut: punchOut,
      workedHours: "7.88",
      punchDate: testDate,
      exceptionType: "Late",
      sourceSystem: "test_reconciliation",
      sourceRowHash: "test-reconcile-punch-001",
    }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning();
    assert("Test punch created", !!testPunch);

    const result = await reconcileTimePunchesToShifts({
      dateFrom: "2026-04-15",
      dateTo: "2026-04-15",
    });

    console.log("  Reconciliation result:", JSON.stringify(result));
    assert("At least 1 punch processed", result.totalPunches >= 1);
    assert("At least 1 matched", result.matched >= 1);

    const [actual] = await db.select().from(shiftActuals)
      .where(and(
        eq(shiftActuals.shiftId, testShift.id),
        eq(shiftActuals.timePunchId, testPunch.id)
      ));
    assert("Shift actual record exists", !!actual);
    if (actual) {
      assert("Variance is ~12 minutes", actual.varianceMinutes !== null && Math.abs(actual.varianceMinutes - 12) <= 1);
      assert("Match status is matched", actual.matchStatus === "matched");
      assert("Match confidence is auto", actual.matchConfidence === "auto");
    }
  }

  console.log("\n--- Test 4: Reconciliation Skips Already Reconciled ---");
  {
    const result2 = await reconcileTimePunchesToShifts({
      dateFrom: "2026-04-15",
      dateTo: "2026-04-15",
    });
    console.log("  Re-reconciliation result:", JSON.stringify(result2));
    assert("Already reconciled >= 1", result2.alreadyReconciled >= 1);
    assert("No new matches on re-run", result2.matched === 0);
  }

  console.log("\n--- Test 5: Unmatched Punch (no corresponding shift) ---");
  {
    const [orphanPunch] = await db.insert(timePunches).values({
      employeeName: "Test OrphanDriver",
      clockIn: new Date("2026-05-20T09:00:00Z"),
      clockOut: new Date("2026-05-20T17:00:00Z"),
      workedHours: "8.00",
      punchDate: "2026-05-20",
      sourceSystem: "test_reconciliation",
      sourceRowHash: "test-orphan-punch-001",
    }).onConflictDoNothing({ target: timePunches.sourceRowHash }).returning();
    assert("Orphan punch created", !!orphanPunch);

    const result = await reconcileTimePunchesToShifts({
      dateFrom: "2026-05-20",
      dateTo: "2026-05-20",
    });
    console.log("  Orphan reconciliation result:", JSON.stringify(result));
    assert("Orphan punch is unmatched", result.unmatched >= 1);
  }

  console.log("\n--- Cleanup ---");
  await cleanupTestData();
  console.log("  Test data cleaned up.");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
